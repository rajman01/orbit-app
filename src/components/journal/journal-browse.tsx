"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useSettings, type JournalDoc } from "@/features/data";
import { ENERGY, monthGrid, MOOD, searchJournal } from "@/features/journal/model";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.parse(`${month}-15T12:00:00Z`),
  );
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** JRN-3: find past entries by words and mood, or see them on a month calendar. */
export function JournalBrowse({ entries, day, today }: { entries: JournalDoc[]; day: string; today: string }) {
  const { weekStartDay } = useSettings();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [q, setQ] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [month, setMonth] = useState(day.slice(0, 7));
  const filtering = q.trim() !== "" || mood != null;
  const hits = searchJournal(entries, q, mood)
    .filter((h) => filtering || h.date !== day)
    .slice(0, filtering ? 100 : 60);
  const byDate = new Map(entries.filter((e) => e.text.trim() || e.mood || e.energy).map((e) => [e.date, e]));

  return (
    <section aria-label="Past entries" className="mt-8">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto px-1 text-micro text-label-secondary uppercase">Past entries</h2>
        <Segmented
          label="Show entries as"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "List" },
            { value: "calendar", label: "Calendar" },
          ]}
        />
      </div>

      {view === "list" ? (
        <>
          <div className="mb-2 flex flex-col gap-2">
            <label className="flex h-control items-center gap-2 rounded-md bg-surface-sunken px-3 focus-within:ring-2 focus-within:ring-accent">
              <Search className="size-4 text-label-tertiary" />
              <input
                type="search"
                aria-label="Search the journal"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your journal"
                className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-label-tertiary"
              />
            </label>
            <div role="radiogroup" aria-label="Filter by mood" className="flex flex-wrap gap-1.5">
              {MOOD.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={mood === i + 1}
                  onClick={() => setMood(mood === i + 1 ? null : i + 1)}
                  className={cn(
                    "h-7 rounded-full px-2.5 text-footnote font-medium",
                    mood === i + 1 ? "bg-accent text-on-accent" : "bg-fill text-label-secondary hover:bg-fill-strong",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {filtering ? (
            <p className="mb-1 px-1 text-footnote text-label-secondary" aria-live="polite">
              {hits.length ? `${hits.length} entr${hits.length === 1 ? "y" : "ies"}` : "Nothing matches."}
            </p>
          ) : null}
          <ul aria-label={filtering ? "Matching entries" : "Earlier entries"} className="flex flex-col">
            {hits.map((e) => (
              <li key={e.date}>
                <Link
                  href={`/journal?d=${e.date}`}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-fill"
                >
                  <span className="w-24 shrink-0 text-footnote font-medium">{dayLabel(e.date, today)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-callout text-label-secondary">
                      {e.snippet || "No words, just a check-in."}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-caption text-label-tertiary">
                    {e.mood ? <span>{MOOD[e.mood - 1]}</span> : null}
                    {e.energy ? <span>{ENERGY[e.energy - 1]} energy</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <IconButton
              label="Previous month"
              icon={<ChevronLeft className="size-5" />}
              onClick={() => setMonth(shiftMonth(month, -1))}
            />
            <span className="text-headline">{monthLabel(month)}</span>
            <IconButton
              label="Next month"
              icon={<ChevronRight className="size-5" />}
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= today.slice(0, 7)}
            />
          </div>
          <table
            className="w-full table-fixed border-separate border-spacing-1"
            aria-label={`Journal for ${monthLabel(month)}`}
          >
            <thead>
              <tr>
                {[...Array(7).keys()].map((i) => (
                  <th key={i} className="text-caption font-normal text-label-tertiary">
                    {WEEKDAYS[(i + weekStartDay) % 7]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthGrid(month, weekStartDay).map((week, w) => (
                <tr key={w}>
                  {week.map((d, i) => {
                    if (!d) return <td key={i} />;
                    const e = byDate.get(d);
                    const future = d > today;
                    const label = `${dayLabel(d, today)}${e ? `${e.mood ? `, ${MOOD[e.mood - 1]}` : ""}, has an entry` : ""}`;
                    return (
                      <td key={i}>
                        {future ? (
                          <span className="grid aspect-square place-items-center rounded-md text-callout text-label-tertiary/50">
                            {Number(d.slice(8))}
                          </span>
                        ) : (
                          <Link
                            href={`/journal?d=${d}`}
                            aria-label={label}
                            aria-current={d === day ? "date" : undefined}
                            className={cn(
                              "relative grid aspect-square place-items-center rounded-md text-callout hover:bg-fill",
                              d === day && "ring-2 ring-accent",
                              e ? "font-semibold" : "text-label-secondary",
                            )}
                          >
                            {Number(d.slice(8))}
                            {e ? (
                              <span
                                className="absolute bottom-1 size-1.5 rounded-full bg-accent"
                                // Brighter for a better mood; plain for a check-in without one.
                                style={{ opacity: e.mood ? 0.35 + e.mood * 0.13 : 0.6 }}
                              />
                            ) : null}
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
