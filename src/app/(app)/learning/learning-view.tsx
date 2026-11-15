"use client";

import { BookOpen, Plus } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { LearningDialog } from "@/components/career/forms";
import { LearningRow } from "@/components/career/learning-row";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import { LEARNING_KIND_LABEL, type LearningKind } from "@/features/career/model";
import { useLearningItems } from "@/features/data";
import { LEARNING_KINDS } from "@/lib/sync/entities";

/** CAR-3: the learning queue — in progress, up next, done. */
export function LearningView() {
  const items = useLearningItems();
  const actions = useActions();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<LearningKind>("book");
  const [showDone, setShowDone] = useState(false);
  const inProgress = (items ?? []).filter((l) => l.status === "in_progress");
  const queued = (items ?? []).filter((l) => l.status === "queued");
  const done = (items ?? [])
    .filter((l) => l.status === "done")
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const year = new Date().getFullYear();
  const thisYear = done.filter((l) => l.finishedAt && new Date(l.finishedAt).getFullYear() === year).length;

  return (
    <>
      <PageHeader
        title="Learning"
        subtitle={thisYear ? `${thisYear} finished this year` : undefined}
        actions={
          // Phones use the add row below; the full form is a tap on the item afterwards.
          <span className="max-lg:hidden">
            <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add with details
            </Button>
          </span>
        }
      />
      <PageBody className="max-w-[720px]">
        <form
          className="mb-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await actions.createLearningItem({ title, kind });
            setTitle("");
          }}
        >
          <input
            aria-label="Something to learn from"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A book, course, article or video…"
            maxLength={300}
            className="h-control min-w-0 flex-1 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
          />
          <select
            aria-label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as LearningKind)}
            className="h-control rounded-md bg-surface-sunken px-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {LEARNING_KINDS.map((k) => (
              <option key={k} value={k}>
                {LEARNING_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={!title.trim()}>
            Add
          </Button>
        </form>

        {items && !items.length ? (
          <EmptyState
            icon={BookOpen}
            title="Nothing queued"
            body="Keep the books, courses and articles you mean to get to in one place, link them to a skill, and track how far you are."
          />
        ) : null}
        {inProgress.length ? (
          <section>
            <SectionLabel count={inProgress.length}>In progress</SectionLabel>
            <ul aria-label="In progress" className="flex flex-col">
              {inProgress.map((l) => (
                <LearningRow key={l.id} item={l} />
              ))}
            </ul>
          </section>
        ) : null}
        {queued.length ? (
          <section>
            <SectionLabel count={queued.length}>Up next</SectionLabel>
            <ul aria-label="Up next" className="flex flex-col">
              {queued.map((l) => (
                <LearningRow key={l.id} item={l} />
              ))}
            </ul>
          </section>
        ) : null}
        {done.length ? (
          <section>
            <SectionLabel count={done.length}>Done</SectionLabel>
            <Button variant="ghost" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Hide" : "Show"} finished
            </Button>
            {showDone ? (
              <ul aria-label="Done" className="flex flex-col">
                {done.map((l) => (
                  <LearningRow key={l.id} item={l} />
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </PageBody>
      {adding ? <LearningDialog open onOpenChange={(o) => !o && setAdding(false)} /> : null}
    </>
  );
}
