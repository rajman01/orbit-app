"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCachedUser } from "@/components/app/auth-gate";
import { cn } from "@/lib/cn";

/** Signed-in visitors go straight to the app; everyone else to sign-up. */
export function PrimaryCta({
  size = "large",
  tone = "accent",
  className,
}: {
  size?: "default" | "large";
  tone?: "accent" | "inverse";
  className?: string;
}) {
  const user = useCachedUser();
  return (
    <Link
      href={user ? "/today" : "/sign-up"}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[filter,transform] duration-100 hover:brightness-95 active:scale-[0.97] active:brightness-90",
        tone === "accent" ? "bg-accent text-on-accent" : "bg-white text-[var(--accent-on-white)]",
        size === "large" ? "h-12 px-6 text-[17px]" : "h-9 px-4 text-[15px]",
        className,
      )}
    >
      {user ? "Open Orbit" : "Get started — it’s free"}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function NavAuthLink() {
  const user = useCachedUser();
  if (user) return null;
  return (
    <Link
      href="/sign-in"
      className="hidden h-9 items-center rounded-full px-4 text-[15px] font-medium text-label-secondary hover:text-label sm:inline-flex"
    >
      Sign in
    </Link>
  );
}
