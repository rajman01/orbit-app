"use client";

import { useHabitLogs, useHabits, useSettings } from "@/features/data";
import { consistency, habitHeatmap } from "@/features/habits/model";
import { useToday } from "@/features/use-today";
import { SectionLabel } from "@/components/tasks/task-list";
import { cn } from "@/lib/cn";
import { dayOf } from "@/lib/dates";

const WEEKS = 18;

/** HAB-4: each habit's last few months as a heatmap, with consistency over 30 and 90 days. */
export function HabitHistory() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const todayDay = useToday();
  const { weekStartDay, timezone } = useSettings();
  if (!habits?.length || !logs) return null;
  return (
    <section aria-label="History">
      <SectionLabel>History</SectionLabel>
      <div className="flex flex-col gap-3">
        {habits.map((h) => {
          const mine = logs.filter((l) => l.habitId === h.id);
          const opts = { weekStart: weekStartDay, startDay: dayOf(h.createdAt, timezone) };
          const c30 = consistency(h, mine, todayDay, 30, opts);
          const c90 = consistency(h, mine, todayDay, 90, opts);
          const grid = habitHeatmap(h, mine, todayDay, { ...opts, weeks: WEEKS });
          const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
          return (
            <div key={h.id} role="group" aria-label={h.name} className="rounded-lg border border-separator p-3">
              <div className="mb-2 flex items-baseline gap-3">
                <p className="min-w-0 flex-1 truncate text-headline">{h.name}</p>
                <span className="text-footnote text-label-secondary">
                  30 days <strong className="text-label tabular">{pct(c30)}</strong>
                </span>
                <span className="text-footnote text-label-secondary">
                  90 days <strong className="text-label tabular">{pct(c90)}</strong>
                </span>
              </div>
              <div
                role="img"
                aria-label={`${h.name}: ${pct(c30)} over 30 days, ${pct(c90)} over 90 days`}
                className="flex gap-[3px] overflow-x-auto"
              >
                {grid.map((week, w) => (
                  <div key={w} className="flex flex-col gap-[3px]">
                    {week.map((cell) => (
                      <span
                        key={cell.day}
                        title={cell.day}
                        className={cn(
                          "size-3 rounded-[3px]",
                          cell.future
                            ? "bg-transparent"
                            : cell.level === 2
                              ? "bg-success"
                              : cell.level === 1
                                ? "bg-success/40"
                                : cell.scheduled
                                  ? "bg-fill-strong"
                                  : "bg-fill",
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
