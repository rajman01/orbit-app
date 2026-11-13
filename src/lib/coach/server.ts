import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "mongodb";
import { COACH_SYSTEM_PROMPT } from "@/features/coach/prompt";
import type { CoachEvent, CoachMessage } from "@/features/coach/protocol";
import { toolDefinitions } from "@/features/coach/tools";
import { fakeCoachTurn } from "./fake";

/** Model ids live in config so they can be upgraded without code changes (PRD §10.4). */
export function coachModels() {
  return {
    chat: process.env.AI_CHAT_MODEL || "claude-sonnet-5-5",
    light: process.env.AI_LIGHT_MODEL || "claude-haiku-5-5",
  };
}

export function coachConfigured(): boolean {
  return process.env.COACH_FAKE === "1" || Boolean(process.env.ANTHROPIC_API_KEY);
}

export function dailyLimitUsd(): number {
  const n = Number(process.env.AI_DAILY_LIMIT_USD);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

/** USD per million tokens, for the usage estimate (Sonnet 5.5 rates; a fallback model is close enough). */
const PRICE = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

interface UsageDoc {
  _id: string; // `${userId}:${day}`
  userId: string;
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

const usageDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Today's estimated spend for this user (UTC day). */
export async function spentToday(db: Db, userId: string): Promise<number> {
  const doc = await db.collection<UsageDoc>("aiUsage").findOne({ _id: `${userId}:${usageDay()}` });
  return doc?.costUsd ?? 0;
}

async function recordUsage(db: Db, userId: string, u: Anthropic.Beta.BetaUsage) {
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cost =
    (input * PRICE.input + output * PRICE.output + cacheRead * PRICE.cacheRead + cacheWrite * PRICE.cacheWrite) /
    1_000_000;
  const day = usageDay();
  await db.collection<UsageDoc>("aiUsage").updateOne(
    { _id: `${userId}:${day}` },
    {
      $setOnInsert: { userId, day },
      $inc: {
        requests: 1,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        costUsd: cost,
      },
    },
    { upsert: true },
  );
}

let client: Anthropic | undefined;

/**
 * One model call for the coach (decision 2: tools run on the device, so the server never loops).
 * Yields streamed text, then the finished assistant turn.
 */
export async function* coachTurn(db: Db, userId: string, messages: CoachMessage[]): AsyncGenerator<CoachEvent> {
  if (process.env.COACH_FAKE === "1") {
    yield* fakeCoachTurn(messages);
    return;
  }
  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model: coachModels().chat,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
    // If the model declines, the API retries on a suitable fallback model inside the same call.
    fallbacks: "default",
    // Thinking blocks from an older version of the tool list are dropped instead of failing.
    thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
    output_config: { effort: "medium" },
    // Caches the system prompt, tools and conversation so far; each turn only pays for what's new.
    cache_control: { type: "ephemeral" },
    system: COACH_SYSTEM_PROMPT,
    tools: toolDefinitions(),
    messages: messages as unknown as Anthropic.Beta.BetaMessageParam[],
  });

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { t: "text", v: event.delta.text };
      }
    }
    const message = await stream.finalMessage();
    await recordUsage(db, userId, message.usage).catch(() => {});
    if (message.stop_reason === "max_tokens" && message.content.some((b) => b.type === "tool_use")) {
      yield { t: "error", code: "failed", message: "The reply was cut off. Try asking again." };
      return;
    }
    yield {
      t: "message",
      content: message.content as unknown as Record<string, unknown>[],
      stopReason: message.stop_reason,
    };
  } catch (err) {
    yield toCoachError(err);
  }
}

function toCoachError(err: unknown): CoachEvent {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { t: "error", code: "setup", message: "The coach's API key isn't working. Check ANTHROPIC_API_KEY." };
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return { t: "error", code: "busy", message: "The coach is busy right now. Try again in a minute." };
  }
  if (err instanceof Anthropic.APIError) {
    console.error("coach: API error", err.status, err.message);
  } else {
    console.error("coach: failed", err);
  }
  return { t: "error", code: "failed", message: "Something went wrong. Try again." };
}
