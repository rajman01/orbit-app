"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV } from "./nav";
import { SyncIndicator } from "./sync-indicator";
import { useCurrentUser } from "./auth-gate";

/** DESIGN.md §5.2 / §5.3 — sidebar on desktop, translucent tab bar on phone. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useCurrentUser();

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop sidebar (heavier material = structural region) */}
      <aside className="material-thick sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-separator px-3 pt-4 pb-3 lg:flex">
        <div className="mb-4 flex items-center gap-2 px-2">
          <OrbitMark />
          <span className="text-headline">Orbit</span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-body transition-colors duration-150",
                  active ? "bg-accent-fill font-medium text-accent-text" : "text-label-secondary hover:bg-fill hover:text-label",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-2 rounded-md px-2 py-1.5">
          <span className="grid size-7 place-items-center rounded-full bg-accent-fill text-caption text-accent-text">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-footnote text-label-secondary">{user.name}</span>
          <SyncIndicator />
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:pb-0">{children}</main>

      {/* Mobile tab bar — content scrolls beneath the material */}
      <nav
        aria-label="Main"
        className="material-chrome fixed inset-x-0 bottom-0 z-30 flex border-t border-separator pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[49px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-accent" : "text-label-tertiary",
              )}
            >
              <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Large title that sits under a translucent sticky header on scroll. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-[880px] items-end justify-between gap-4 px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-4 lg:px-6 lg:pt-10">
      <div>
        {subtitle ? <p className="text-footnote font-medium text-label-secondary">{subtitle}</p> : null}
        <h1 className="text-display">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="lg:hidden">
          <SyncIndicator />
        </span>
        {actions}
      </div>
    </header>
  );
}

export function OrbitMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <circle cx="24.5" cy="9" r="4" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
    </svg>
  );
}
