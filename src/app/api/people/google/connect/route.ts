import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { newState, redirectUri } from "@/lib/calendar/oauth-state";
import { CONTACTS_STATE_COOKIE, contactsApi, contactsEnabled } from "@/lib/people/google-contacts";

const CALLBACK_PATH = "/api/people/google/callback";

/** "Import from Google Contacts": asks Google for read-only access to contacts, for this import only. */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (!contactsEnabled()) return NextResponse.redirect(new URL("/people?import=setup", request.url));
  const { nonce, state } = newState(userId);
  const res = NextResponse.redirect(contactsApi().authUrl(state, redirectUri(request, CALLBACK_PATH)));
  res.cookies.set(CONTACTS_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/people",
  });
  return res;
}
