"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useRef, useState } from "react";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useSync } from "@/components/app/sync-provider";
import { useActions } from "@/features/actions";
import { coachContext, requestMessages, runCoachTool } from "@/features/coach/device";
import type { CoachEvent, CoachMessage } from "@/features/coach/protocol";
import type { SyncedDoc } from "@/lib/sync/entities";

export type StoredCoachMessage = SyncedDoc<"aiMessages">;

/** How many model calls one question may take (each tool round is one call). */
const MAX_ROUNDS = 8;

export function useCoachMessages(threadId: string | null): StoredCoachMessage[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    if (!threadId) return [];
    const rows = await db.aiMessages
      .where("[threadId+seq]")
      .between([threadId, -Infinity], [threadId, Infinity])
      .toArray();
    return rows.filter((m) => m.deletedAt == null);
  }, [db, threadId]);
}

/**
 * Sends a message and runs the conversation until the coach is done: each model reply is stored as
 * it arrives, and tool calls are run here on the device with the app's own actions.
 */
export function useCoachChat(threadId: string | null, onThread: (id: string) => void) {
  const engine = useSync();
  const { db } = engine;
  const user = useCurrentUser();
  const actions = useActions();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(
    async (id: string): Promise<CoachMessage[]> => {
      const rows = await db.aiMessages.where("[threadId+seq]").between([id, -Infinity], [id, Infinity]).toArray();
      return rows.filter((m) => m.deletedAt == null).map((m) => ({ role: m.role, content: m.content }));
    },
    [db],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setError(null);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("You're offline. The coach needs a connection; everything else in Orbit still works.");
        return;
      }
      setBusy(true);
      const controller = new AbortController();
      abort.current = controller;
      try {
        let id = threadId;
        if (!id) {
          id = await actions.createCoachThread(message.length > 60 ? `${message.slice(0, 57)}…` : message);
          onThread(id);
        }
        await actions.appendCoachMessage(id, "user", [{ type: "text", text: message }]);
        await actions.appendCoachMessage(id, "system", [
          { type: "text", text: await coachContext(db, user.id, Date.now()) },
        ]);

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const reply = await callCoach(requestMessages(await load(id)), controller.signal, (v) =>
            setDraft((d) => d + v),
          );
          if (reply.t === "error") {
            setError(reply.message);
            break;
          }
          if (reply.content.length === 0) {
            if (reply.stopReason === "refusal") setError("The coach can't help with that one.");
            break;
          }
          await actions.appendCoachMessage(id, "assistant", reply.content);
          setDraft("");
          const calls = reply.content.filter((b) => b.type === "tool_use");
          if (reply.stopReason !== "tool_use" || calls.length === 0) break;
          const results = [];
          for (const call of calls) {
            const out = await runCoachTool(String(call.name), call.input, {
              db,
              userId: user.id,
              actions,
              now: Date.now(),
            });
            results.push({
              type: "tool_result",
              tool_use_id: String(call.id),
              content: out.content.slice(0, 50_000),
              ...(out.isError ? { is_error: true } : {}),
            });
          }
          await actions.appendCoachMessage(id, "user", results);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof TypeError
              ? "Couldn't reach the coach. Check your connection."
              : "Something went wrong. Try again.",
          );
        }
      } finally {
        setDraft("");
        setBusy(false);
        abort.current = null;
      }
    },
    [busy, threadId, actions, onThread, db, user.id, load],
  );

  const stop = useCallback(() => abort.current?.abort(), []);
  return { send, stop, draft, busy, error, clearError: () => setError(null) };
}

type Reply = Extract<CoachEvent, { t: "message" } | { t: "error" }>;

/** One request to /api/coach, reading the newline-delimited events as they stream. */
async function callCoach(messages: CoachMessage[], signal: AbortSignal, onText: (v: string) => void): Promise<Reply> {
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (res.status === 401) return { t: "error", code: "failed", message: "You're signed out. Sign in again." };
  if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
    return { t: "error", code: "failed", message: "Something went wrong. Try again." };
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: Reply | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line) as CoachEvent;
      if (event.t === "text") onText(event.v);
      else result = event;
    }
    if (done) break;
  }
  return result ?? { t: "error", code: "failed", message: "The reply was cut off. Try again." };
}
