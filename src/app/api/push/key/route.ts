import { NextResponse } from "next/server";
import { pushEnabled } from "@/lib/env";

/** The VAPID public key devices use to sign up for push; null when push isn't set up. */
export function GET() {
  return NextResponse.json({ publicKey: pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null });
}
