import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { google } from "@/lib/calendar/google";
import { newState, redirectUri, STATE_COOKIE } from "@/lib/calendar/oauth-state";
import { calendarEnabled } from "@/lib/env";

/** "Connect Google Calendar": sends the signed-in user to Google's consent screen. */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (!calendarEnabled()) return NextResponse.redirect(new URL("/settings?calendar=setup", request.url));
  const { nonce, state } = newState(userId);
  const res = NextResponse.redirect(google().authUrl(state, redirectUri(request)));
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/calendar",
  });
  return res;
}
