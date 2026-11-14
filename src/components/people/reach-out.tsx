"use client";

import { AlarmClock, Cake, CalendarHeart } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionLabel } from "@/components/tasks/task-list";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useInteractions, usePeople, useSettings } from "@/features/data";
import {
  agoLabel,
  cadenceLabel,
  dateTitle,
  REACH_OUT_PER_DAY,
  reachOut,
  upcomingDates,
  type ReachOut,
} from "@/features/people/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/dates";
import { PersonAvatar } from "./avatar";
import { LogInteraction } from "./log-interaction";

/** People due a catch-up, most overdue first (all of them; Today shows the first two). */
export function useReachOut(): ReachOut[] | undefined {
  const people = usePeople();
  const interactions = useInteractions();
  const { timezone } = useSettings();
  const todayDay = useToday();
  return useMemo(
    () => (people && interactions ? reachOut(people, interactions, todayDay, timezone) : undefined),
    [people, interactions, todayDay, timezone],
  );
}

const SNOOZES: [string, number][] = [
  ["Tomorrow", 1],
  ["In 3 days", 3],
  ["Next week", 7],
  ["In 2 weeks", 14],
];

/** REL-3 on Today: up to two people to reach out to, plus birthdays and dates today or tomorrow. */
export function ReachOutSection({ className }: { className?: string }) {
  const list = useReachOut();
  const people = usePeople();
  const todayDay = useToday();
  const dates = useMemo(() => upcomingDates(people ?? [], todayDay, 1), [people, todayDay]);
  const shown = (list ?? []).slice(0, REACH_OUT_PER_DAY);
  if (!shown.length && !dates.length) return null;
  return (
    <section aria-label="Reach out" className={className}>
      <SectionLabel count={shown.length || undefined}>Reach out</SectionLabel>
      <ul className="flex flex-col">
        {dates.map((u) => {
          const Icon = u.date.kind === "birthday" ? Cake : CalendarHeart;
          return (
            <li key={`${u.person.id}:${u.index}`}>
              <Link
                href={`/person?id=${u.person.id}`}
                className="flex min-h-[52px] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fill lg:min-h-11"
              >
                <PersonAvatar person={u.person} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">
                    {dateTitle(u.person.name, u.date)} is {u.inDays === 0 ? "today" : "tomorrow"}
                  </span>
                  {u.turning != null && u.turning > 0 ? (
                    <span className="block text-footnote text-label-secondary">
                      {u.date.kind === "birthday" ? `Turns ${u.turning}` : `${u.turning} years`}
                    </span>
                  ) : null}
                </span>
                <Icon className="size-4 shrink-0 text-accent-text" />
              </Link>
            </li>
          );
        })}
        {shown.map((r) => (
          <ReachOutRow key={r.person.id} item={r} todayDay={todayDay} />
        ))}
      </ul>
    </section>
  );
}

/** A person due a catch-up: open them, log it, or snooze. */
export function ReachOutRow({ item, todayDay, compact }: { item: ReachOut; todayDay: string; compact?: boolean }) {
  const actions = useActions();
  const toast = useToast();
  const [logging, setLogging] = useState(false);
  const p = item.person;
  const sub = `${item.last ? `Last in touch ${agoLabel(item.last, todayDay).toLowerCase()}` : "Nothing logged yet"} · ${cadenceLabel(p.cadenceDays).toLowerCase()}`;
  return (
    <li
      className={cn("flex items-center gap-2 rounded-md px-2", compact ? "py-1.5" : "min-h-[52px] py-1.5 lg:min-h-11")}
    >
      <Link
        href={`/person?id=${p.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md"
        aria-label={`Open ${p.name}`}
      >
        <PersonAvatar person={p} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body">{p.name}</span>
          <span className="block truncate text-footnote text-label-secondary">{sub}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => setLogging(true)}
        aria-label={`Log time with ${p.name}`}
        className="h-8 shrink-0 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text hover:brightness-95 active:scale-[0.97]"
      >
        Log
      </button>
      <Menu
        align="end"
        trigger={
          <button
            type="button"
            aria-label={`Snooze ${p.name}`}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-fill text-label-secondary hover:bg-fill-strong"
          >
            <AlarmClock className="size-4" />
          </button>
        }
      >
        {SNOOZES.map(([label, n]) => (
          <MenuItem
            key={n}
            onSelect={() => {
              void actions.snoozePerson(p.id, addDays(todayDay, n));
              toast({
                message: `${p.name.split(" ")[0]} snoozed`,
                action: { label: "Undo", onClick: () => void actions.snoozePerson(p.id, p.snoozedUntil) },
              });
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Menu>
      <LogInteraction person={p} open={logging} onClose={() => setLogging(false)} />
    </li>
  );
}
