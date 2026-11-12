"use client";

import { Ellipsis, Inbox, Plus, Search, Settings, Sun, Target } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { TaskPanelProvider } from "@/components/tasks/task-panel";
import { Kbd } from "@/components/ui/pill";
import { Sheet } from "@/components/ui/sheet";
import { useAreas, useSettings } from "@/features/data";
import { cn } from "@/lib/cn";
import { useCurrentUser } from "./auth-gate";
import { CommandsProvider, useCommands } from "./commands";
import { NAV_MAIN, NAV_MORE } from "./nav";
import { SyncIndicator } from "./sync-indicator";
import { useSync, useSyncStatus } from "./sync-provider";

/** DESIGN.md §5.2 / §5.3 — sidebar on desktop, translucent tab bar on phone. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/welcome") return <TaskPanelProvider>{children}</TaskPanelProvider>;
  return (
    <TaskPanelProvider>
      <CommandsProvider>
        <OnboardingRedirect />
        <div className="flex min-h-dvh bg-bg">
          <Sidebar />
          <main className="min-w-0 flex-1 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:pb-0">{children}</main>
          <TabBar />
        </div>
      </CommandsProvider>
    </TaskPanelProvider>
  );
}

/**
 * New users set up their areas and rhythm first (PRD ONB-2). On a new device we wait for
 * the first sync, so an existing user isn't sent to onboarding before their settings arrive.
 */
function OnboardingRedirect() {
  const settings = useSettings();
  const { lastSyncedAt } = useSyncStatus();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!settings.loaded || settings.onboardingCompletedAt || pathname === "/welcome") return;
    if (!settings.exists && lastSyncedAt == null) return;
    router.replace("/welcome");
  }, [settings.loaded, settings.exists, settings.onboardingCompletedAt, lastSyncedAt, pathname, router]);
  return null;
}

function useInboxCount() {
  const { db } = useSync();
  return (
    useLiveQuery(
      () =>
        db.tasks
          .where("status")
          .equals("inbox")
          .filter((t) => !t.deletedAt && !t.parentTaskId)
          .count(),
      [db],
    ) ?? 0
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Sun;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-body transition-colors duration-150",
        active ? "bg-accent-fill font-medium text-accent-text" : "text-label-secondary hover:bg-fill hover:text-label",
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{label}</span>
      {badge ? <span className="text-caption text-label-tertiary tabular">{badge}</span> : null}
    </Link>
  );
}

function Sidebar() {
  const user = useCurrentUser();
  const { openQuickAdd, openPalette } = useCommands();
  const inbox = useInboxCount();
  const areas = useAreas() ?? [];
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-separator px-3 pt-4 pb-3 material-thick lg:flex">
      <div className="flex items-center gap-2 px-2">
        <OrbitMark />
        <span className="text-headline">Orbit</span>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => openQuickAdd()}
          className="flex h-8 flex-1 items-center gap-2 rounded-md bg-surface px-2 text-body font-medium shadow-1 hover:bg-fill dark:bg-surface-raised"
        >
          <Plus className="size-4 text-accent" /> New task{" "}
          <span className="ml-auto">
            <Kbd>C</Kbd>
          </span>
        </button>
        <button
          type="button"
          aria-label="Search (⌘K)"
          title="Search ⌘K"
          onClick={openPalette}
          className="grid size-8 place-items-center rounded-md text-label-secondary hover:bg-fill"
        >
          <Search className="size-4" />
        </button>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV_MAIN.map((n) => (
          <NavLink key={n.href} {...n} badge={n.href === "/inbox" ? inbox : undefined} />
        ))}
      </nav>
      <nav className="flex flex-col gap-0.5" aria-label="Areas">
        <Link href="/areas" className="px-2 pb-1 text-micro text-label-tertiary uppercase hover:text-label-secondary">
          Areas
        </Link>
        {areas.map((a) => (
          <Link
            key={a.id}
            href={`/area?id=${a.id}`}
            className="flex h-8 items-center gap-2.5 rounded-md px-2 text-body text-label-secondary hover:bg-fill hover:text-label"
          >
            <AreaIcon icon={a.icon} color={a.color} />
            <span className="truncate">{a.name}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        <NavLink href="/settings" label="Settings" icon={Settings} />
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <span className="grid size-7 place-items-center rounded-full bg-accent-fill text-caption text-accent-text">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-footnote text-label-secondary">{user.name}</span>
          <SyncIndicator />
        </div>
      </div>
    </aside>
  );
}

function TabBar() {
  const pathname = usePathname();
  const { openQuickAdd } = useCommands();
  const inbox = useInboxCount();
  const [more, setMore] = useState(false);
  const tab = (href: string, label: string, Icon: typeof Sun, badge?: number) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-[49px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
          active ? "text-accent" : "text-label-tertiary",
        )}
      >
        <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
        {label}
        {badge ? (
          <span className="absolute top-1 left-[calc(50%+6px)] min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 text-on-accent">
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };
  const moreActive = NAV_MORE.some((n) => pathname.startsWith(n.href)) || pathname.startsWith("/area");
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-separator pb-[env(safe-area-inset-bottom)] material-chrome lg:hidden"
      >
        {tab("/today", "Today", Sun)}
        {tab("/inbox", "Inbox", Inbox, inbox)}
        <button
          type="button"
          aria-label="New task"
          onClick={() => openQuickAdd()}
          className="flex h-[49px] flex-1 items-center justify-center"
        >
          <span className="grid size-10 place-items-center rounded-full bg-accent text-on-accent shadow-2 active:scale-95">
            <Plus className="size-6" strokeWidth={2.25} />
          </span>
        </button>
        {tab("/goals", "Goals", Target)}
        <button
          type="button"
          onClick={() => setMore(true)}
          className={cn(
            "flex h-[49px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
            moreActive ? "text-accent" : "text-label-tertiary",
          )}
        >
          <Ellipsis className="size-6" strokeWidth={1.75} aria-hidden />
          More
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore} title="More">
        <MoreList onNavigate={() => setMore(false)} />
      </Sheet>
    </>
  );
}

function MoreList({ onNavigate }: { onNavigate: () => void }) {
  const areas = useAreas() ?? [];
  const row = "flex h-12 items-center gap-3 rounded-md px-2 text-body active:bg-fill";
  return (
    <div className="flex flex-col pb-4">
      {NAV_MORE.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={onNavigate} className={row}>
          <Icon className="size-5 text-label-secondary" strokeWidth={1.75} /> {label}
        </Link>
      ))}
      {areas.length ? <p className="mt-3 px-2 pb-1 text-micro text-label-tertiary uppercase">Areas</p> : null}
      {areas.map((a) => (
        <Link key={a.id} href={`/area?id=${a.id}`} onClick={onNavigate} className={row}>
          <AreaIcon icon={a.icon} color={a.color} className="size-5" /> {a.name}
        </Link>
      ))}
    </div>
  );
}

/** Large title that sits under a translucent sticky header on scroll. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mx-auto flex w-full max-w-[880px] items-end justify-between gap-4 px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-4 lg:px-6 lg:pt-10">
      <div className="min-w-0">
        {subtitle ? <div className="text-footnote font-medium text-label-secondary">{subtitle}</div> : null}
        <h1 className="truncate text-display">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="lg:hidden">
          <SyncIndicator />
        </span>
        {actions}
      </div>
    </header>
  );
}

/** Page body width used across the app. */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[880px] px-4 pb-16 lg:px-6", className)}>{children}</div>;
}

export function OrbitMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <circle cx="24.5" cy="9" r="4" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
    </svg>
  );
}
