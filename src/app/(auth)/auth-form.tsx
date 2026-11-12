"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OrbitMark } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function AuthForm({ mode, googleEnabled }: { mode: "sign-in" | "sign-up"; googleEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const signUp = mode === "sign-up";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setLoading(true);
    setError(null);
    const { error } = signUp
      ? await authClient.signUp.email({ name: String(form.get("name")), email, password })
      : await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Something went wrong. Try again.");
      return;
    }
    router.replace("/today");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-grouped px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <OrbitMark size={44} />
          <h1 className="text-title1">{signUp ? "Create your Orbit" : "Welcome back"}</h1>
          <p className="text-subhead text-label-secondary">
            {signUp ? "Plan what matters, then actually do it." : "Sign in to pick up where you left off."}
          </p>
        </div>

        <div className="rounded-xl bg-surface p-5 shadow-1">
          {googleEnabled ? (
            <>
              <Button
                variant="secondary"
                size="large"
                className="w-full"
                onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/today" })}
                icon={<GoogleIcon />}
              >
                Continue with Google
              </Button>
              <div className="my-4 flex items-center gap-3 text-footnote text-label-tertiary">
                <span className="h-px flex-1 bg-separator" />
                or
                <span className="h-px flex-1 bg-separator" />
              </div>
            </>
          ) : null}

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
            {signUp ? (
              <Field label="Name">
                <Input name="name" autoComplete="name" required />
              </Field>
            ) : null}
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required inputMode="email" />
            </Field>
            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete={signUp ? "new-password" : "current-password"}
                minLength={8}
                required
              />
            </Field>
            {error ? (
              <p role="alert" className="text-footnote text-danger-text">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="large" loading={loading} className="mt-1 w-full">
              {signUp ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-subhead text-label-secondary">
          {signUp ? "Already have an account? " : "New to Orbit? "}
          <Link href={signUp ? "/sign-in" : "/sign-up"} className="font-semibold text-accent-text">
            {signUp ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
