"use client";

import { ArrowUp, BookOpen, NotebookPen, Search, Sparkles, Square, Sun, Target } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHECKIN_MARK } from "@/features/coach/protocol";
import { WRITE_TOOLS, type CoachToolName } from "@/features/coach/tools";
import { cn } from "@/lib/cn";
import { ActionList } from "./action-card";
import { useCoachChat, useCoachMessages, type StoredCoachMessage } from "./use-coach";

const SUGGESTIONS = [
  "What should I focus on today?",
  "How am I doing this cycle?",
  "Which tasks keep slipping, and why?",
];

/** A conversation with the coach: messages, the streaming reply, and the composer. */
export function CoachConversation({
  threadId,
  onThread,
  autoFocus,
  prompt,
  onPromptSent,
}: {
  threadId: string | null;
  onThread: (id: string) => void;
  autoFocus?: boolean;
  /** A message to send right away (once per `n`). */
  prompt?: { text: string; n: number } | null;
  onPromptSent?: () => void;
}) {
  const messages = useCoachMessages(threadId);
  const { send, stop, draft, busy, error } = useCoachChat(threadId, onThread);
  const scroller = useRef<HTMLDivElement>(null);
  const sentPrompt = useRef(0);
  useEffect(() => {
    if (!prompt || prompt.n === sentPrompt.current || busy) return;
    sentPrompt.current = prompt.n;
    onPromptSent?.();
    void send(prompt.text);
  }, [prompt, busy, send, onPromptSent]);
  const visible = (messages ?? []).filter(isShown);
  // Once the finished reply is saved, it replaces the streamed draft (never both on screen).
  const last = visible.at(-1);
  const saved =
    last?.role === "assistant" &&
    last.content
      .filter((b) => b.type === "text")
      .map((b) => String(b.text))
      .join("") === draft;
  const pending = busy && !saved;

  // Stay pinned to the newest message while the reply streams in.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, draft, busy, error]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {visible.length === 0 && !busy ? (
          <Welcome onPick={(s) => void send(s)} />
        ) : (
          <div className="mx-auto flex max-w-[68ch] flex-col gap-4">
            {visible.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}
            {pending ? (
              draft ? (
                <AssistantText text={draft} />
              ) : (
                <p className="flex items-center gap-2 text-callout text-label-secondary">
                  <Sparkles className="size-4 animate-pulse text-accent motion-reduce:animate-none" aria-hidden />
                  Thinking…
                </p>
              )
            ) : null}
          </div>
        )}
        {error ? (
          <p
            role="alert"
            className="mx-auto mt-4 max-w-[68ch] rounded-lg bg-fill px-3 py-2 text-callout text-label-secondary"
          >
            {error}
          </p>
        ) : null}
      </div>
      <Composer busy={busy} onSend={send} onStop={stop} autoFocus={autoFocus} />
    </div>
  );
}

/** Context messages and tool results are for the model, not the reader. */
function isShown(m: StoredCoachMessage): boolean {
  if (m.role === "system") return false;
  if (m.role === "user") {
    // A check-in's opening facts are for the model only.
    if (m.content.some((b) => b.type === "text" && String(b.text).startsWith(CHECKIN_MARK))) return false;
    return m.content.some((b) => b.type === "text");
  }
  return m.content.some((b) => b.type === "text" || b.type === "tool_use");
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 pt-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent-fill text-accent">
        <Sparkles className="size-6" aria-hidden />
      </span>
      <div>
        <p className="text-headline">Your coach</p>
        <p className="mt-1 text-callout text-label-secondary">
          Ask about your day, your cycle or a goal. It looks at what&rsquo;s in Orbit before answering.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-lg bg-fill px-3 py-2.5 text-left text-callout hover:bg-fill-strong"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageView({ message }: { message: StoredCoachMessage }) {
  if (message.role === "user") {
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => String(b.text))
      .join("\n");
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-callout whitespace-pre-wrap text-on-accent">
        {text}
      </div>
    );
  }
  // Changes get cards (with Undo or Accept); lookups get a quiet chip.
  const writes = message.content
    .filter((b) => b.type === "tool_use" && WRITE_TOOLS.has(String(b.name) as CoachToolName))
    .map((b) => String(b.id));
  return (
    <div className="flex flex-col gap-2">
      {message.content.map((b, i) =>
        b.type === "text" && String(b.text).trim() ? (
          <AssistantText key={i} text={String(b.text)} />
        ) : b.type === "tool_use" && !WRITE_TOOLS.has(String(b.name) as CoachToolName) ? (
          <ToolChip key={i} name={String(b.name)} input={b.input as Record<string, unknown>} />
        ) : null,
      )}
      {writes.length ? <ActionList toolUseIds={writes} /> : null}
    </div>
  );
}

const TOOL_LABELS: Record<string, { icon: typeof Sun; label: (i: Record<string, unknown>) => string }> = {
  get_overview: { icon: Sun, label: () => "Looked at your day and cycle" },
  search: { icon: Search, label: (i) => `Searched for “${String(i.query ?? "")}”` },
  get_task: { icon: BookOpen, label: () => "Opened a task" },
  get_goal: { icon: Target, label: () => "Opened a goal" },
  remember: { icon: NotebookPen, label: () => "Saved a note about you" },
  forget: { icon: NotebookPen, label: () => "Removed a note" },
};

function ToolChip({ name, input }: { name: string; input: Record<string, unknown> }) {
  const meta = TOOL_LABELS[name];
  const Icon = meta?.icon ?? Sparkles;
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-footnote text-label-secondary">
      <Icon className="size-3.5" aria-hidden />
      {meta ? meta.label(input ?? {}) : name}
    </span>
  );
}

/** The coach writes short paragraphs, lists and **bold**; render just that. */
export function AssistantText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2 text-callout leading-[1.5] break-words">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/;
        if (lines.every((l) => bullet.test(l))) {
          const ordered = /^\s*\d/.test(lines[0]);
          const List = ordered ? "ol" : "ul";
          return (
            <List key={i} className={cn("flex flex-col gap-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(bullet, ""))}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string): React.ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

function Composer({
  busy,
  onSend,
  onStop,
  autoFocus,
}: {
  busy: boolean;
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  // Sent while the coach is still finishing a reply: hold it and send as soon as it's free.
  const queued = useRef<string | null>(null);
  useEffect(() => {
    if (!busy && queued.current) {
      const t = queued.current;
      queued.current = null;
      void onSend(t);
    }
  }, [busy, onSend]);
  const submit = () => {
    if (!text.trim() || queued.current) return;
    const t = text;
    setText("");
    if (busy) queued.current = t;
    else void onSend(t);
  };
  return (
    <form
      className="border-t border-separator px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="mx-auto flex max-w-[68ch] items-end gap-2 rounded-2xl bg-surface-sunken p-1.5 pl-3.5">
        <textarea
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask your coach…"
          aria-label="Message the coach"
          maxLength={4000}
          className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-callout outline-none placeholder:text-label-tertiary"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-strong text-label"
          >
            <Square className="size-3.5" fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim()}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </form>
  );
}
