import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { deleteImport, loadImport } from "@/lib/people/google-contacts";

/** The contacts read from Google for one import (kept 15 minutes), for the picker. */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const contacts = /^[\w-]{10,40}$/.test(id) ? await loadImport(db(), userId, id) : null;
  if (!contacts) return NextResponse.json({ error: "expired" }, { status: 404 });
  return NextResponse.json({ contacts }, { headers: { "Cache-Control": "no-store" } });
}

/** Done with the import: forget the list. */
export async function DELETE(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await deleteImport(db(), userId, id);
  return NextResponse.json({ ok: true });
}
