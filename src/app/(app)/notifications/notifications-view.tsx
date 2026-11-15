"use client";

import {
  Bell,
  Briefcase,
  CalendarRange,
  CalendarSync,
  Clock,
  ListChecks,
  Gift,
  Moon,
  Repeat,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import { type NotificationDoc, useNotifications, useSettings } from "@/features/data";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel, dayOf } from "@/lib/dates";

const ICON: Record<NotificationDoc["kind"], LucideIcon> = {
  plan: Sunrise,
  shutdown: Moon,
  review: CalendarSync,
  habit: Repeat,
  quarter: CalendarRange,
  date: Gift,
  reminder: Clock,
  job: Briefcase,
  routine: ListChecks,
  other: Bell,
};

/** NOT-5: what Orbit has sent you, newest first, with unread marks. */
export function NotificationsView() {
  const items = useNotifications();
  const settings = useSettings();
  const todayDay = useToday();
  const actions = useActions();
  const router = useRouter();
  const tz = settings.timezone;
  const unread = items?.filter((n) => n.readAt == null).length ?? 0;

  const days: { day: string; items: NotificationDoc[] }[] = [];
  for (const n of items ?? []) {
    const day = dayOf(n.sentAt, tz);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(n);
    else days.push({ day, items: [n] });
  }
  const time = (ms: number) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(ms);

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          unread ? (
            <Button variant="ghost" onClick={() => void actions.markNotificationsRead()}>
              Mark all read
            </Button>
          ) : null
        }
      />
      <PageBody className="max-w-[640px]">
        {items && !items.length ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Bell className="size-8 text-label-tertiary" strokeWidth={1.5} />
            <p className="text-headline">Nothing yet</p>
            <p className="max-w-80 text-subhead text-label-secondary">
              Reminders Orbit sends to your devices show up here too, so you can catch up on anything you missed.
            </p>
            <Link href="/settings" className="text-callout font-semibold text-accent-text">
              Reminder settings
            </Link>
          </div>
        ) : null}
        {days.map((d) => (
          <section key={d.day}>
            <SectionLabel>{dayLabel(d.day, todayDay)}</SectionLabel>
            <ul aria-label={`Notifications ${dayLabel(d.day, todayDay)}`} className="flex flex-col">
              {d.items.map((n) => {
                const Icon = ICON[n.kind] ?? Bell;
                const isUnread = n.readAt == null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isUnread) void actions.markNotificationsRead([n.id]);
                        router.push(n.url || "/today");
                      }}
                      className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left hover:bg-fill"
                    >
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-fill">
                        <Icon className="size-4 text-label-secondary" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-body", isUnread && "font-semibold")}>{n.title}</span>
                        {n.body ? <span className="block text-footnote text-label-secondary">{n.body}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 pt-0.5 text-footnote text-label-tertiary tabular">
                        {time(n.sentAt)}
                        <span
                          aria-label={isUnread ? "Unread" : undefined}
                          className={cn("size-2 rounded-full", isUnread ? "bg-accent" : "bg-transparent")}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </PageBody>
    </>
  );
}
