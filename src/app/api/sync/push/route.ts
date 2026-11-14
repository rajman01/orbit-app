import { after, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { pushRequestSchema } from "@/lib/sync/protocol";
import { applyMutations } from "@/lib/sync/server";
import { syncBlocksNow } from "@/lib/calendar/server";
import { calendarEnabled } from "@/lib/env";

export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = pushRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const result = await applyMutations(db(), userId, body.data.mutations);
  // A time block changed (or the account they go to): write it to the calendar now, after replying.
  const touchesBlocks = body.data.mutations.some(
    (m) => m.entity === "timeBlocks" || (m.entity === "settings" && m.fields && "blocksAccountId" in m.fields),
  );
  if (touchesBlocks && calendarEnabled()) {
    after(() => syncBlocksNow(db(), userId).catch((err) => console.error("time block sync failed", err)));
  }
  return NextResponse.json(result);
}
