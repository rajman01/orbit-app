"use client";

import { PageBody, PageHeader } from "@/components/app/app-shell";
import { AreaIcon } from "@/components/areas/area-icon";
import { SectionLabel } from "@/components/tasks/task-list";
import { useAreas, useXpEvents } from "@/features/data";
import { levelFromXp, levelTitle, totalXp, xpByArea } from "@/features/xp/model";
import { dayLabel } from "@/lib/dates";
import { useToday } from "@/features/use-today";
import { useSettings } from "@/features/data";
import { dayOf } from "@/lib/dates";

const HOW = [
  ["Complete a task", "10 × its points (+50% for a Must-do, +100% if it had gone stale)"],
  ["Focus", "15 per 25 minutes"],
  ["Daily Plan or Shutdown", "20 each"],
  ["Cycle Review", "100"],
  ["Habit check-in", "5, up to 10 with a 30-day streak"],
  ["Milestone", "100"],
  ["Goal completed", "500, more for longer goals"],
  ["Key result check-in", "10"],
  ["Win logged", "15"],
];

/** PRD §9: global level, area levels and where the XP came from. */
export function LevelsView() {
  const eventsQ = useXpEvents();
  const events = eventsQ ?? [];
  const areas = useAreas({ includeArchived: true }) ?? [];
  const today = useToday();
  const { timezone } = useSettings();
  const info = levelFromXp(totalXp(events));
  const byArea = xpByArea(events);
  const pct = info.into / info.needed;

  return (
    <>
      <PageHeader title="Levels" />
      <PageBody>
        <section
          aria-label="Your level"
          className="flex items-center gap-5 rounded-2xl p-5 text-white"
          style={{ background: "linear-gradient(135deg, var(--band-from), var(--band-to) 60%, #0b3c52)" }}
        >
          <span className="relative grid size-24 shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="white"
                strokeWidth="7"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${pct} 1`}
              />
            </svg>
            <span className="text-[34px] font-bold tabular">{info.level}</span>
          </span>
          <span className="min-w-0">
            <span className="block text-footnote font-medium text-white/80">Level {info.level}</span>
            <span className="block text-title1">{info.title}</span>
            <span className="mt-1 block text-callout text-white/85 tabular">
              {info.needed - info.into} XP to {levelTitle(info.level + 1)} · {info.total} XP in all
            </span>
          </span>
        </section>

        {areas.length ? (
          <>
            <SectionLabel>Areas</SectionLabel>
            <ul className="flex flex-col gap-3">
              {areas
                .map((a) => ({ a, xp: byArea.get(a.id) ?? 0 }))
                .sort((x, y) => y.xp - x.xp)
                .map(({ a, xp }) => {
                  const l = levelFromXp(xp);
                  return (
                    <li key={a.id} className="flex items-center gap-3">
                      <AreaIcon icon={a.icon} color={a.color} className="size-5" />
                      <span className="w-32 shrink-0 truncate">{a.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-fill">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${(l.into / l.needed) * 100}%`, background: `var(--area-${a.color})` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-footnote text-label-secondary tabular">
                        Lv {l.level} · {xp}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </>
        ) : null}

        <SectionLabel count={events.filter((e) => e.amount !== 0).length}>Recent XP</SectionLabel>
        {events.some((e) => e.amount !== 0) ? (
          <ul className="flex flex-col">
            {events
              .filter((e) => e.amount !== 0)
              .slice(0, 30)
              .map((e) => (
                <li
                  key={e.id}
                  className="flex min-h-10 items-center gap-3 border-b border-separator py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-callout">{e.reason}</span>
                  <span className="shrink-0 text-footnote text-label-tertiary">
                    {dayLabel(dayOf(e.at, timezone), today)}
                  </span>
                  <span
                    className={
                      e.amount < 0
                        ? "w-14 text-right font-semibold text-danger-text tabular"
                        : "w-14 text-right font-semibold text-accent-text tabular"
                    }
                  >
                    {e.amount > 0 ? "+" : ""}
                    {e.amount}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-callout text-label-secondary">
            Finish a task, a ritual or a focus session to earn your first XP.
          </p>
        )}

        <SectionLabel>How XP works</SectionLabel>
        <dl className="flex flex-col text-callout">
          {HOW.map(([k, v]) => (
            <div
              key={k}
              className="flex flex-col gap-0.5 border-b border-separator py-2 last:border-b-0 sm:flex-row sm:justify-between sm:gap-4"
            >
              <dt className="font-medium">{k}</dt>
              <dd className="text-label-secondary sm:text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-footnote text-label-tertiary">
          Tasks created and finished within two minutes don&rsquo;t count, undoing takes the XP back, and a very big day
          earns half past three times your usual. In Strict mode, each stale task left unresolved costs 5 XP a day.
        </p>
      </PageBody>
    </>
  );
}
