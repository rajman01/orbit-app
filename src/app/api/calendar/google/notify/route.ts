import { after } from "next/server";
import { accounts, markChannelDirty, syncAccount } from "@/lib/calendar/server";
import { db } from "@/lib/db/mongo";

export const maxDuration = 60;

/**
 * Google's push notification that a watched calendar changed (CAL-7). The channel id and its secret
 * token identify the account; the sync runs after the reply, so Google gets its 200 at once.
 */
export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const token = request.headers.get("x-goog-channel-token");
  const state = request.headers.get("x-goog-resource-state");
  if (channelId && token && state !== "sync") {
    const database = db();
    const accountId = await markChannelDirty(database, channelId, token);
    if (accountId) {
      after(async () => {
        const a = await accounts(database).findOne({ _id: accountId });
        if (a?.dirty) await syncAccount(database, a);
      });
    }
  }
  return new Response(null, { status: 200 });
}
