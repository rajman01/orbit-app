import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { accounts, syncAccount } from "@/lib/calendar/server";
import { fakeGoogleState } from "@/lib/calendar/google";
import { db } from "@/lib/db/mongo";

/**
 * Tests only (CALENDAR_FAKE=1): see the signed-in user's "Orbit" calendar in the fake Google, and
 * change an event there as if moved in Google Calendar (then sync, as Google's push would).
 */
async function orbitCalendar(request: Request) {
  if (process.env.CALENDAR_FAKE !== "1") return null;
  const userId = await getUserId(request.headers);
  if (!userId) return null;
  const account = await accounts(db()).findOne({ userId, orbitCalendarId: { $type: "string" } });
  return account ? { account, calId: account.orbitCalendarId! } : { account: null, calId: null };
}

export async function GET(request: Request) {
  const found = await orbitCalendar(request);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  const events = found.calId ? (fakeGoogleState.events.get(found.calId) ?? []) : [];
  return NextResponse.json({
    events: events
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({ id: e.id, summary: e.summary, start: e.start?.dateTime, end: e.end?.dateTime })),
  });
}

const moveSchema = z.object({ eventId: z.string(), start: z.string(), end: z.string() });

export async function POST(request: Request) {
  const found = await orbitCalendar(request);
  const body = moveSchema.safeParse(await request.json().catch(() => null));
  if (!found?.calId || !body.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const e = fakeGoogleState.events.get(found.calId)?.find((x) => x.id === body.data.eventId);
  if (!e) return NextResponse.json({ error: "no such event" }, { status: 404 });
  Object.assign(e, {
    start: { dateTime: body.data.start },
    end: { dateTime: body.data.end },
    updated: new Date().toISOString(),
  });
  fakeGoogleState.version++;
  await syncAccount(db(), found.account!);
  return NextResponse.json({ ok: true });
}
