import { getUserId } from "@/lib/auth/server";
import { coachConfigured, coachTurn, dailyLimitUsd, spentToday } from "@/lib/coach/server";
import { db } from "@/lib/db/mongo";
import { coachRequestSchema, MAX_COACH_REQUEST_BYTES, type CoachEvent } from "@/features/coach/protocol";

/** Streams can take a while; one model call per request keeps this well inside the limit. */
export const maxDuration = 300;

const line = (e: CoachEvent) => `${JSON.stringify(e)}\n`;

function errorStream(e: CoachEvent, status: number) {
  return new Response(line(e), { status, headers: { "Content-Type": "application/x-ndjson" } });
}

export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!coachConfigured()) {
    return errorStream(
      { t: "error", code: "setup", message: "The coach isn't set up yet: add ANTHROPIC_API_KEY to the server." },
      503,
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_COACH_REQUEST_BYTES) {
    return errorStream({ t: "error", code: "failed", message: "This conversation is too long. Start a new one." }, 413);
  }
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {}
  const body = coachRequestSchema.safeParse(json);
  if (!body.success) return Response.json({ error: "invalid request" }, { status: 400 });

  const database = db();
  if ((await spentToday(database, userId)) >= dailyLimitUsd()) {
    return errorStream(
      { t: "error", code: "limit", message: "You've reached today's coach limit. It resets at midnight (UTC)." },
      429,
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const event of coachTurn(database, userId, body.data.messages)) {
        controller.enqueue(encoder.encode(line(event)));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
