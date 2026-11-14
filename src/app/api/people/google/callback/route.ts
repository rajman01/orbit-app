import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { checkState, redirectUri } from "@/lib/calendar/oauth-state";
import { db } from "@/lib/db/mongo";
import { CONTACTS_STATE_COOKIE, contactsApi, readContacts, saveImport } from "@/lib/people/google-contacts";

export const maxDuration = 60;

/** Back from Google: read the contacts (the token is revoked straight away) and let the user choose. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/people?import=${encodeURIComponent(result)}`, request.url));
    res.cookies.delete({ name: CONTACTS_STATE_COOKIE, path: "/api/people" });
    return res;
  };
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
  const cookieNonce = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${CONTACTS_STATE_COOKIE}=`))
    ?.slice(CONTACTS_STATE_COOKIE.length + 1);
  if (!checkState(userId, url.searchParams.get("state"), cookieNonce)) return back("error");
  const code = url.searchParams.get("code");
  if (!code) return back(url.searchParams.get("error") === "access_denied" ? "cancelled" : "error");
  try {
    const contacts = await readContacts(contactsApi(), code, redirectUri(request, "/api/people/google/callback"));
    return back(await saveImport(db(), userId, contacts));
  } catch (err) {
    console.error("contacts import failed", err);
    return back("error");
  }
}
