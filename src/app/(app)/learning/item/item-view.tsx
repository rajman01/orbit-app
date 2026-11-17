"use client";

import { ArrowDown, ArrowUp, BookOpen, CalendarRange, ListPlus, Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { LearningDialog } from "@/components/career/forms";
import { SectionLabel } from "@/components/tasks/task-list";
import { CoachAboutButton } from "@/components/coach/coach-about";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import {
  coursePace,
  DEFAULT_SECTION_MINUTES,
  scheduleSections,
  sectionMinutes,
  sectionsFromText,
  WEEKDAYS,
  type Section,
} from "@/features/career/course";
import { LEARNING_KIND_LABEL, LEARNING_STATUS_LABEL, type LearningItem } from "@/features/career/model";
import { useAllTasks, useLearningItems, useSkills } from "@/features/data";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayLabel } from "@/lib/dates";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const field =
  "h-control w-full min-w-0 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";
const hours = (m: number) => (m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);

/** CAR-6: one book or course — its sections, the plan to finish it, and how it's going. */
export function LearningItemView() {
  const id = useSearchParams().get("id");
  const items = useLearningItems();
  if (items === undefined) return null;
  const item = items.find((x) => x.id === id);
  if (!item) return <EmptyState icon={BookOpen} title="Not found" body="It may have been deleted on another device." />;
  return <ItemPage key={item.id} item={item} />;
}

let seq = 0;
const newId = (sections: Section[]) => {
  const used = new Set(sections.map((s) => s.id));
  for (;;) {
    const id = `s${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`;
    if (!used.has(id)) return id;
  }
};

function ItemPage({ item }: { item: LearningItem }) {
  const actions = useActions();
  const toast = useToast();
  const today = useToday();
  const tasks = useAllTasks() ?? [];
  const skill = (useSkills({ includeArchived: true }) ?? []).find((s) => s.id === item.skillId);
  const [editing, setEditing] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [unplan, setUnplan] = useState(false);
  const [draft, setDraft] = useState("");
  const sections = item.sections ?? [];
  const pace = coursePace(sections, tasks, item.plan, today);
  const taskDay = new Map(tasks.filter((t) => !t.deletedAt).map((t) => [t.id, t.scheduledDate]));
  const total = sections.reduce((n, s) => n + sectionMinutes(s), 0);
  const left = sections.filter((s) => !s.doneAt).reduce((n, s) => n + sectionMinutes(s), 0);

  const save = (next: Section[]) => actions.setSections(item, next);
  const add = (title: string, minutes: number | null = null) =>
    title.trim() &&
    save([
      ...sections,
      { id: newId(sections), title: title.trim().slice(0, 200), minutes, doneAt: null, taskId: null },
    ]);

  return (
    <>
      <PageHeader
        title={item.title}
        subtitle={
          <Link href="/learning" className="hover:underline">
            {LEARNING_KIND_LABEL[item.kind]}
            {item.author ? ` · ${item.author}` : ""} · {LEARNING_STATUS_LABEL[item.status]}
          </Link>
        }
        actions={
          <>
            <CoachAboutButton subject={{ kind: "course", id: item.id }} title={item.title} />
            <IconButton label="Edit" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} />
          </>
        }
      />
      <PageBody className="max-w-[720px]">
        <section
          aria-label="Progress"
          className="mb-4 flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-headline tabular">{item.progress}%</span>
            <span className="text-footnote text-label-secondary">
              {sections.length
                ? `${pace.done} of ${pace.total} sections · ${hours(left)} to go`
                : "Add sections to track it part by part"}
            </span>
          </div>
          <span className="h-2 overflow-hidden rounded-full bg-fill">
            <span
              className="block h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${item.progress}%` }}
            />
          </span>
          {item.plan ? (
            <p className={cn("text-callout", pace.behind ? "text-warning-text" : "text-label-secondary")}>
              {pace.behind
                ? `${pace.behind} section${pace.behind === 1 ? "" : "s"} behind the plan`
                : item.status === "done"
                  ? "Finished"
                  : "On pace"}
              {item.status !== "done" ? ` · finish by ${dayLabel(item.plan.targetDate, today)}` : ""}
              {pace.next && pace.nextDay
                ? ` · next: ${pace.next.title} (${dayLabel(pace.nextDay, today).toLowerCase()})`
                : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {sections.some((s) => !s.doneAt) && item.status !== "done" ? (
              <Button
                icon={<CalendarRange className="size-4" />}
                variant={item.plan ? "secondary" : "primary"}
                onClick={() => setPlanning(true)}
              >
                {item.plan ? "Re-plan" : "Plan it"}
              </Button>
            ) : null}
            {item.plan ? (
              <Button variant="ghost" onClick={() => setUnplan(true)}>
                Remove the plan
              </Button>
            ) : null}
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-control items-center rounded-md px-3 text-body text-accent-text hover:bg-accent-fill"
              >
                Open the {LEARNING_KIND_LABEL[item.kind].toLowerCase()}
              </a>
            ) : null}
            {skill ? (
              <Link
                href={`/skill?id=${skill.id}`}
                className="inline-flex h-control items-center rounded-md px-3 text-body text-label-secondary hover:bg-fill"
              >
                For {skill.name}
              </Link>
            ) : null}
          </div>
        </section>

        <SectionLabel count={sections.length}>Sections</SectionLabel>
        {sections.length ? (
          <ol aria-label="Sections" className="flex flex-col">
            {sections.map((s, i) => {
              const day = s.taskId ? taskDay.get(s.taskId) : null;
              const late = !s.doneAt && day != null && day < today;
              return (
                <li key={s.id} className="group flex min-h-row items-center gap-2 rounded-md pr-1 hover:bg-fill">
                  <Checkbox
                    checked={s.doneAt != null}
                    onChange={(d) => void actions.toggleSection(item, s.id, d)}
                    label={`Done: ${s.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn("block truncate text-body", s.doneAt != null && "text-label-tertiary line-through")}
                    >
                      {s.title}
                    </span>
                    <span className="block text-footnote text-label-tertiary">
                      {s.minutes ? hours(s.minutes) : `~${DEFAULT_SECTION_MINUTES} min`}
                      {day && !s.doneAt ? (
                        <span className={late ? "text-danger-text" : undefined}> · {dayLabel(day, today)}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <IconButton
                      label={`Move ${s.title} up`}
                      icon={<ArrowUp className="size-4" />}
                      disabled={i === 0}
                      onClick={() => {
                        const n = [...sections];
                        [n[i - 1], n[i]] = [n[i], n[i - 1]];
                        void save(n);
                      }}
                    />
                    <IconButton
                      label={`Move ${s.title} down`}
                      icon={<ArrowDown className="size-4" />}
                      disabled={i === sections.length - 1}
                      onClick={() => {
                        const n = [...sections];
                        [n[i + 1], n[i]] = [n[i], n[i + 1]];
                        void save(n);
                      }}
                    />
                    <IconButton
                      label={`Remove ${s.title}`}
                      icon={<X className="size-4" />}
                      onClick={() => void save(sections.filter((x) => x.id !== s.id))}
                    />
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="px-1 py-2 text-callout text-label-secondary">
            Break it into parts — chapters, modules, weeks — so you can plan it and see how far you are.
          </p>
        )}
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add(draft);
            setDraft("");
          }}
        >
          <input
            aria-label="New section"
            className={field}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a section, e.g. Chapter 3: Indexes (45 min)"
            maxLength={200}
          />
          <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} disabled={!draft.trim()}>
            Add
          </Button>
        </form>
        <Button variant="ghost" icon={<ListPlus className="size-4" />} onClick={() => setPasting(true)}>
          Paste a syllabus or table of contents
        </Button>
        {total ? <p className="mt-2 px-1 text-footnote text-label-tertiary">About {hours(total)} in all.</p> : null}
      </PageBody>

      {editing ? <LearningDialog open onOpenChange={(o) => !o && setEditing(false)} item={item} /> : null}
      {pasting ? (
        <PasteSections
          onClose={() => setPasting(false)}
          onAdd={(rows) => {
            const next = [...sections];
            for (const r of rows)
              next.push({ id: newId(next), title: r.title, minutes: r.minutes, doneAt: null, taskId: null });
            void save(next.slice(0, 200));
            setPasting(false);
            toast({ message: `${rows.length} section${rows.length === 1 ? "" : "s"} added` });
          }}
        />
      ) : null}
      {planning ? <PlanDialog item={item} onClose={() => setPlanning(false)} /> : null}
      <ConfirmDialog
        open={unplan}
        onOpenChange={setUnplan}
        title="Remove the plan?"
        description="The planned tasks for sections not yet done are removed. Sections and progress stay."
        confirmLabel="Remove the plan"
        onConfirm={() => void actions.unplanCourse(item)}
      />
    </>
  );
}

function PasteSections({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (rows: { title: string; minutes: number | null }[]) => void;
}) {
  const [text, setText] = useState("");
  const rows = sectionsFromText(text);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Paste the sections"
      description="One per line: a syllabus, a table of contents or a module list. Lengths like “(45 min)” or “1.5h” are picked up."
      width={520}
    >
      <div className="mt-4 flex flex-col gap-3">
        <textarea
          aria-label="Sections to paste"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Week 1: Foundations (2h)\nWeek 2: Joins (90 min)\n…"}
          className="field-sizing-content min-h-40 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {rows.length ? (
          <p className="text-footnote text-label-secondary">
            {rows.length} section{rows.length === 1 ? "" : "s"}
            {rows.some((r) => r.minutes) ? `, ${rows.filter((r) => r.minutes).length} with a length` : ""}:{" "}
            {rows
              .slice(0, 3)
              .map((r) => r.title)
              .join(", ")}
            {rows.length > 3 ? "…" : ""}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!rows.length} onClick={() => onAdd(rows)}>
            Add {rows.length || ""} section{rows.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PlanDialog({ item, onClose }: { item: LearningItem; onClose: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const today = useToday();
  const [target, setTarget] = useState(item.plan?.targetDate ?? addDays(today, 28));
  const [days, setDays] = useState<number[]>(item.plan?.days ?? WEEKDAYS);
  const [perDay, setPerDay] = useState(item.plan?.minutesPerDay ?? 60);
  const [busy, setBusy] = useState(false);
  const sections = item.sections ?? [];
  const ok = days.length > 0 && target >= today;
  const s = ok ? scheduleSections(sections, { start: today, targetDate: target, days, minutesPerDay: perDay }) : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={item.plan ? "Re-plan" : "Plan it"}
      description="The sections still to do become tasks on your study days, up to your daily time, in order."
      width={520}
    >
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-label-secondary">Finish by</span>
          <input
            type="date"
            aria-label="Finish by"
            className={field}
            value={target}
            min={today}
            onChange={(e) => e.target.value && setTarget(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-label-secondary">Study on</span>
          <div role="group" aria-label="Study days" className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
                className={cn(
                  "h-9 min-w-12 rounded-full px-3 text-footnote font-semibold",
                  days.includes(d) ? "bg-accent text-on-accent" : "bg-fill text-label-secondary",
                )}
              >
                {DAY_NAMES[d]}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-label-secondary">Up to, a day</span>
          <select
            aria-label="Time a day"
            className={field}
            value={perDay}
            onChange={(e) => setPerDay(Number(e.target.value))}
          >
            {[15, 30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>
                {hours(m)}
              </option>
            ))}
          </select>
        </label>
        {s ? (
          <p
            aria-live="polite"
            className={cn(
              "rounded-lg p-3 text-callout",
              s.late ? "bg-warning/10 text-warning-text" : "bg-accent-fill text-accent-text",
            )}
          >
            {s.days.length === 0
              ? "Every section is done."
              : s.late
                ? `At this pace it ends ${dayLabel(s.finish!, today)}, after your date. Study longer, add a day, or move the date.`
                : `${s.days.length} section${s.days.length === 1 ? "" : "s"} over ${new Set(s.days.map((d) => d.day)).size} study day${new Set(s.days.map((d) => d.day)).size === 1 ? "" : "s"}, done by ${dayLabel(s.finish!, today)}.`}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!s || !s.days.length}
            onClick={async () => {
              setBusy(true);
              const r = await actions.planCourse(item, { targetDate: target, days, minutesPerDay: perDay }, today);
              setBusy(false);
              onClose();
              toast({
                message: `Planned ${r.days.length} section${r.days.length === 1 ? "" : "s"}${r.late ? ", ending after your date" : ""}`,
              });
            }}
          >
            {s?.late ? "Plan anyway" : "Plan it"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
