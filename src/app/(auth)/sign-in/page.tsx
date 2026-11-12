import type { Metadata } from "next";
import { googleEnabled } from "@/lib/env";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return <AuthForm mode="sign-in" googleEnabled={googleEnabled()} />;
}
