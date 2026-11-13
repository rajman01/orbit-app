import "server-only";
import type { CoachEvent, CoachMessage } from "@/features/coach/protocol";

/**
 * A scripted stand-in for the model, used by tests (COACH_FAKE=1): no network, no cost.
 * - A user message containing `[tool:name {json}]` gets a tool call to that tool.
 * - After tool results, it replies "Done:" with the start of each result.
 * - Anything else is echoed back: "You said: …".
 */
export async function* fakeCoachTurn(messages: CoachMessage[]): AsyncGenerator<CoachEvent> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const blocks = lastUser?.content ?? [];
  const results = blocks.filter((b) => b.type === "tool_result");

  if (results.length > 0) {
    const text = `Done: ${results
      .map((r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content)).slice(0, 300))
      .join(" | ")}`;
    yield* streamText(text);
    return;
  }

  const said = blocks
    .filter((b) => b.type === "text")
    .map((b) => String(b.text))
    .join(" ");
  const call = /\[tool:(\w+)(?:\s+(\{.*?\}))?\]/.exec(said);
  if (call) {
    const intro = "Let me check.";
    yield { t: "text", v: intro };
    yield {
      t: "message",
      content: [
        { type: "text", text: intro },
        { type: "tool_use", id: `toolu_fake${Date.now()}`, name: call[1], input: JSON.parse(call[2] ?? "{}") },
      ],
      stopReason: "tool_use",
    };
    return;
  }
  yield* streamText(`You said: ${said}`);
}

async function* streamText(text: string): AsyncGenerator<CoachEvent> {
  const words = text.split(/(?<= )/);
  for (let i = 0; i < words.length; i += 3) {
    yield { t: "text", v: words.slice(i, i + 3).join("") };
    await new Promise((r) => setTimeout(r, 15));
  }
  yield { t: "message", content: [{ type: "text", text }], stopReason: "end_turn" };
}
