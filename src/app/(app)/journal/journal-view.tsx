"use client";

import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { SectionLabel } from "@/components/tasks/task-list";
import { IconButton } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { useActions } from "@/features/actions";
import { useJournal, type JournalDoc } from "@/features/data";
import { ENERGY, MOOD, PROMPTS } from "@/features/journal/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayLabel, longDayLabel } from "@/lib/dates";

/** JRN-1/2: one page a day, with mood, energy and prompts; earlier entries below. */
export function JournalView() {
  const params = useSearchParams();
  const router = useRouter();
  const todayDay = useToday();
  const requested = params.get("d");
  const day = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= todayDay ? requested : todayDay;
  const entries = useJournal();
  const go = (d: string) => router.replace(d === todayDay ? "/journal" : `/journal?d=${d}`, { scroll: false });
  if (!entries) return null;
  const entry = entries.find((e) => e.date === day) ?? null;
  const earlier = entries.filter((e) => e.date !== day && (e.text.trim() || e.mood || e.energy)).slice(0, 60);

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle={day === todayDay ? longDayLabel(day) : `${longDayLabel(day)} ${day.slice(0, 4)}`}
        actions={
          <>
            {day !== todayDay ? (
              <button
                type="button"
                onClick={() => go(todayDay)}
                className="h-8 rounded-full bg-fill px-3 text-footnote font-semibold text-accent-text"
              >
                Today
              </button>
            ) : null}
            <IconButton
              label="Previous day"
              icon={<ChevronLeft className="size-5" />}
              onClick={() => go(addDays(day, -1))}
            />
            <IconButton
              label="Next day"
              icon={<ChevronRight className="size-5" />}
              onClick={() => go(addDays(day, 1))}
              disabled={day >= todayDay}
            />
          </>
        }
      />
      <PageBody>
        <Entry key={day} day={day} entry={entry} />
        {earlier.length ? (
          <>
            <SectionLabel count={earlier.length}>Earlier</SectionLabel>
            <ul aria-label="Earlier entries" className="flex flex-col">
              {earlier.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/journal?d=${e.date}`}
                    className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-fill"
                  >
                    <span className="w-24 shrink-0 text-footnote font-medium">{dayLabel(e.date, todayDay)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-callout text-label-secondary">
                        {e.text.trim() || "No words, just a check-in."}
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
        ) : null}
      </PageBody>
    </>
  );
}

function Entry({ day, entry }: { day: string; entry: JournalDoc | null }) {
  const actions = useActions();
  const [text, setText] = useState(entry?.text ?? "");
  const saved = useRef(entry?.text ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | null>(null);

  const save = (value: string) => {
    if (value === saved.current) return;
    saved.current = value;
    void actions.saveJournal(day, { text: value });
  };
  // Text that arrives from sync (or the Shutdown) shows up unless you've typed since the last save.
  const incoming = entry?.text ?? "";
  useEffect(() => {
    if (incoming === saved.current) return;
    setText((current) => {
      if (current !== saved.current) return current;
      saved.current = incoming;
      return incoming;
    });
  }, [incoming]);
  // Saves a moment after typing stops, and when leaving.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const scale = (key: "mood" | "energy", labels: string[]) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-footnote font-medium text-label-secondary">{key === "mood" ? "Mood" : "Energy"}</span>
      <div role="radiogroup" aria-label={key === "mood" ? "Mood" : "Energy"} className="flex flex-wrap gap-1.5">
        {labels.map((label, i) => {
          const on = entry?.[key] === i + 1;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => void actions.saveJournal(day, { [key]: on ? null : i + 1 })}
              className={cn(
                "h-8 rounded-full px-3 text-footnote font-medium",
                on ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <section aria-label="Entry" className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {scale("mood", MOOD)}
        {scale("energy", ENERGY)}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-footnote font-medium text-label-secondary">Today&rsquo;s page</span>
          <Picker
            label="Prompts"
            value={null as string | null}
            options={PROMPTS.map((p) => ({ value: p.id, label: p.text, hint: p.group }))}
            onChange={(id) => {
              const p = PROMPTS.find((x) => x.id === id);
              if (!p) return;
              const next = `${text.trimEnd()}${text.trim() ? "\n\n" : ""}**${p.text}**\n`;
              setText(next);
              save(next);
              void actions.saveJournal(day, { prompts: [...new Set([...(entry?.prompts ?? []), p.id])] });
              requestAnimationFrame(() => {
                box.current?.focus();
                box.current?.setSelectionRange(next.length, next.length);
              });
            }}
            trigger={
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold text-accent-text hover:bg-accent-fill"
              >
                <Lightbulb className="size-4" /> Prompt
              </button>
            }
          />
        </div>
        <textarea
          ref={box}
          aria-label="Journal entry"
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => save(v), 800);
          }}
          onBlur={() => save(text)}
          placeholder="How was today? Write as much or as little as you like."
          className="field-sizing-content min-h-48 w-full resize-none rounded-lg bg-surface-sunken px-4 py-3 text-body leading-relaxed outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
        />
        <p className="text-caption text-label-tertiary">
          Saved as you write. The evening Shutdown adds your mood, energy and one line here.
        </p>
      </div>
    </section>
  );
}
