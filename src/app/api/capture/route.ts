import { NextResponse } from "next/server";
import { capture } from "@/lib/account/capture";
import { userForToken } from "@/lib/account/tokens";
import { db } from "@/lib/db/mongo";

const LIMIT_PER_MINUTE = 30;

/**
 * §13 / SET-8: `POST /api/capture` with `Authorization: Bearer orb_…` puts text in the Inbox.
 * The body can be JSON (`{ "text": "…", "note": "…" }`), a form, or plain text.
 */
export async function POST(request: Request) {
  const database = db();
  const userId = await userForToken(database, request.headers.get("authorization"));
  if (!userId) return NextResponse.json({ error: "A valid API token is needed" }, { status: 401 });

  // A runaway shortcut can't flood the Inbox.
  const minute = Math.floor(Date.now() / 60_000);
  const rates = database.collection<{ _id: string; n: number; expiresAt: Date }>("captureRate");
  await rates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  const rate = await rates.findOneAndUpdate(
    { _id: `${userId}:${minute}` },
    { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } },
    { upsert: true, returnDocument: "after" },
  );
  if ((rate?.n ?? 0) > LIMIT_PER_MINUTE) return NextResponse.json({ error: "Too many, slow down" }, { status: 429 });

  const type = request.headers.get("content-type") ?? "";
  let text = "";
  let note: string | null = null;
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { text?: unknown; note?: unknown } | null;
    text = typeof body?.text === "string" ? body.text : "";
    note = typeof body?.note === "string" ? body.note : null;
  } else if (type.includes("form")) {
    const form = await request.formData().catch(() => null);
    text = String(form?.get("text") ?? "");
    note = form?.get("note") ? String(form.get("note")) : null;
  } else {
    text = (await request.text()).slice(0, 10_000);
  }
  const res = await capture(database, userId, { text, note });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    id: res.id,
    title: res.title,
    message: res.status === "inbox" ? `Added to your Inbox: ${res.title}` : `Added: ${res.title}`,
  });
}
