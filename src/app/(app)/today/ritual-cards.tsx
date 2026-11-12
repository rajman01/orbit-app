"use client";

import { CalendarCheck, Flame, Moon, Sunrise } from "lucide-react";
import { useRitualLauncher } from "@/components/rituals/ritual-flow";
import {
  dueRituals,
  missedShutdown,
  ritualStreak,
  RITUAL_META,
  timeOfDay,
  type RitualType,
} from "@/features/cycles/model";
import { useCycles, useRituals, useSettings } from "@/features/data";
import { defaultSettings } from "@/features/settings/model";
import { useMinuteNow, useToday } from "@/features/use-today";

const ICONS: Record<RitualType, typeof Sunrise> = {
  daily_plan: Sunrise,
  daily_shutdown: Moon,
  cycle_review: CalendarCheck,
};

/** PRD RIT-4: rituals that are due stay pinned at the top of Today until they're done. */
export function RitualCards() {
  const settings = useSettings();
  const todayDay = useToday();
  const now = useMinuteNow();
  const rituals = useRituals();
  const cycles = useCycles();
  const launcher = useRitualLauncher();
  if (!rituals || !cycles) return null;

  const times = settings.ritualTimes ?? defaultSettings().ritualTimes!;
  const due = dueRituals({ rituals, cycles, today: todayDay, time: timeOfDay(now, settings.timezone), times });
  if (!due.length) return null;
  const skippedShutdown = missedShutdown(rituals, todayDay);

  return (
    <section aria-label="Rituals" className="mb-4 flex flex-col gap-2">
      {due.map((r) => {
        const Icon = ICONS[r.type];
        const meta = RITUAL_META[r.type];
        const started = rituals.find((x) => x.type === r.type && x.date === r.date && !x.completedAt);
        const streak = r.type === "cycle_review" ? 0 : ritualStreak(rituals, r.type, todayDay);
        const cycle =
          r.type === "cycle_review" ? cycles.find((c) => c.endDate === r.date && !c.reviewCompletedAt) : null;
        const note =
          r.type === "cycle_review" && r.missed
            ? "Overdue — it blocks planning the next cycle"
            : r.type === "daily_plan" && skippedShutdown
              ? "Includes closing out yesterday"
              : `About ${meta.minutes} min`;
        return (
          <button
            key={r.type}
            type="button"
            onClick={() => void launcher.open(r.type, { date: r.date, cycle })}
            className="flex items-center gap-3 rounded-xl border border-separator bg-surface p-3 text-left shadow-1 hover:bg-fill active:scale-[0.99] dark:bg-surface-raised"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-fill text-accent-text">
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-headline">{cycle ? `Review cycle ${cycle.number}` : meta.title}</span>
              <span
                className={
                  r.missed
                    ? "block text-footnote font-medium text-warning-text"
                    : "block text-footnote text-label-secondary"
                }
              >
                {note}
                {streak > 1 ? (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-warning-text">
                    <Flame className="size-3" aria-hidden /> {streak}-day streak
                  </span>
                ) : null}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-footnote font-semibold text-on-accent">
              {started && typeof started.data.step === "number" && started.data.step > 0 ? "Resume" : "Start"}
            </span>
          </button>
        );
      })}
    </section>
  );
}
