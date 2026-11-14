import { NextResponse, after } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { google } from "@/lib/calendar/google";
import { checkState, redirectUri, STATE_COOKIE } from "@/lib/calendar/oauth-state";
import { accounts, connectGoogle, syncAccount } from "@/lib/calendar/server";
import { db } from "@/lib/db/mongo";

export const maxDuration = 60;

/** Google sends the user back here after consent: store the account, then sync in the background. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/settings?calendar=${result}`, request.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/calendar" });
    return res;
  };
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
  const cookieNonce = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!checkState(userId, url.searchParams.get("state"), cookieNonce)) return back("error");
  const code = url.searchParams.get("code");
  if (!code) return back(url.searchParams.get("error") === "access_denied" ? "cancelled" : "error");
  try {
    const tokens = await google().exchangeCode(code, redirectUri(request));
    const database = db();
    const id = await connectGoogle(database, userId, tokens);
    after(async () => {
      const a = await accounts(database).findOne({ _id: id });
      if (a) await syncAccount(database, a);
    });
    return back("connected");
  } catch (err) {
    console.error("calendar connect failed", err);
    return back("error");
  }
}
