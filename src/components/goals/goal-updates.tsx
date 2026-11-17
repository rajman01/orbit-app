"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Activity, CheckCircle2, Diamond, HeartPulse, MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import { GOAL_STATUS_META, HEALTH_META, type Goal, type GoalHealth } from "@/features/goals/model";
import { useToday } from "@/features/use-today";
import { dayLabel } from "@/lib/dates";
import { useSettings } from "@/features/data";
import { dayOf } from "@/lib/dates";
import { CoachIcon } from "@/components/coach/coach-icon";

interface Item {
  key: string;
  at: number;
  icon: typeof Activity | typeof CoachIcon;
  text: React.ReactNode;
  detail?: string | null;
  by?: "coach";
  noteId?: string;
}

/**
 * GOAL-7: a goal's updates, newest first: your notes, status and health changes, key result
 * check-ins, milestones reached and the coach's changes.
 */
export function GoalUpdates({ goal }: { goal: Goal }) {
  const { db } = useSync();
  const actions = useActions();
  const todayDay = useToday();
  const { timezone } = useSettings();
  const [draft, setDraft] = useState("");
  const [all, setAll] = useState(false);
  const items = useLiveQuery(async () => {
    const live = <T extends { deletedAt: number | null }>(rows: T[]) => rows.filter((r) => r.deletedAt == null);
    const [events, checkins, krs, milestones, ai] = await Promise.all([
      db.goalEvents.where("goalId").equals(goal.id).toArray(),
      db.krCheckins.where("goalId").equals(goal.id).toArray(),
      db.keyResults.where("goalId").equals(goal.id).toArray(),
      db.milestones.where("goalId").equals(goal.id).toArray(),
      db.aiActions.toArray(),
    ]);
    const krTitle = new Map(krs.map((k) => [k.id, { title: k.title, unit: k.unit }]));
    const out: Item[] = [];
    for (const e of live(events)) {
      if (e.type === "note") {
        out.push({
          key: e.id,
          at: e.at,
          icon: MessageSquare,
          text: e.text,
          noteId: e.id,
          by: e.actor === "ai" ? "coach" : undefined,
        });
      } else if (e.type === "status") {
        const to = e.to as keyof typeof GOAL_STATUS_META | null;
        const label =
          to === "completed"
            ? "Marked complete"
            : to === "dropped"
              ? "Dropped"
              : to === "active" && (e.from === "completed" || e.from === "dropped")
                ? "Reopened"
                : `Status: ${to ? (GOAL_STATUS_META[to]?.label ?? to) : "none"}`;
        out.push({
          key: e.id,
          at: e.at,
          icon: CheckCircle2,
          text: label,
          detail: e.text,
          by: e.actor === "ai" ? "coach" : undefined,
        });
      } else {
        const to = e.to as GoalHealth | null;
        out.push({
          key: e.id,
          at: e.at,
          icon: HeartPulse,
          text: `Health: ${to ? HEALTH_META[to].label : "automatic"}`,
          by: e.actor === "ai" ? "coach" : undefined,
        });
      }
    }
    for (const c of live(checkins)) {
      const kr = krTitle.get(c.keyResultId);
      out.push({
        key: c.id,
        at: c.at,
        icon: Activity,
        text: `${kr?.title ?? "Key result"}: ${c.value}${kr?.unit ? ` ${kr.unit}` : ""}`,
        detail: c.note,
      });
    }
    for (const m of live(milestones)) {
      if (m.doneAt) out.push({ key: `m${m.id}`, at: m.doneAt, icon: Diamond, text: `Milestone reached: ${m.title}` });
    }
    for (const a of live(ai)) {
      if (a.status !== "applied") continue;
      const input = a.input as Record<string, unknown>;
      const touches =
        input.goalId === goal.id ||
        (a.tool === "update_goal" && input.id === goal.id) ||
        (a.changes as { entity: string; id: string; before: unknown }[]).some(
          (c) => c.entity === "goals" && c.id === goal.id && c.before === null,
        );
      if (touches) out.push({ key: a.id, at: a.at, icon: CoachIcon, text: a.summary, by: "coach" });
    }
    return out.sort((x, y) => y.at - x.at);
  }, [db, goal.id]);

  const shown = all ? (items ?? []) : (items ?? []).slice(0, 12);

  return (
    <section aria-label="Updates" className="mt-6">
      <SectionLabel count={items?.length || undefined}>Updates</SectionLabel>
      <form
        className="mb-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void actions.addGoalUpdate(goal.id, draft);
          setDraft("");
        }}
      >
        <textarea
          aria-label="Post an update"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="How's it going? What changed, what's next?"
          className="field-sizing-content min-h-12 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-callout outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
        />
        {draft.trim() ? (
          <Button type="submit" className="self-end">
            Post update
          </Button>
        ) : null}
      </form>
      {shown.length ? (
        <ol aria-label="Goal updates" className="flex flex-col">
          {shown.map((i) => (
            <li key={i.key} className="group flex gap-3 rounded-md px-2 py-2 hover:bg-fill">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-fill text-label-secondary">
                <i.icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-callout whitespace-pre-wrap">{i.text}</p>
                {i.detail ? <p className="text-footnote text-label-secondary">{i.detail}</p> : null}
                <p className="text-caption text-label-tertiary">
                  {dayLabel(dayOf(i.at, timezone), todayDay)}
                  {i.by === "coach" ? " · coach" : ""}
                </p>
              </div>
              {i.noteId ? (
                <IconButton
                  label="Delete update"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => void actions.deleteGoalUpdate(i.noteId!)}
                  className="opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                />
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-1 text-footnote text-label-tertiary">
          Status changes, key result check-ins and your notes will show here.
        </p>
      )}
      {!all && (items?.length ?? 0) > 12 ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-1 px-2 text-footnote font-semibold text-accent-text"
        >
          Show all {items!.length}
        </button>
      ) : null}
    </section>
  );
}
