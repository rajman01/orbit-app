"use client";

import {
  AlertTriangle,
  CheckCircle2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody } from "@/components/app/app-shell";
import { useCommands } from "@/components/app/commands";
import { EmptyState } from "@/components/app/empty-state";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { AreaPicker, DatePicker } from "@/components/tasks/pickers";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Picker } from "@/components/ui/picker";
import { Pill } from "@/components/ui/pill";
import { GoalPlanet } from "@/components/goals/goal-planet";
import { GoalPeople } from "@/components/people/goal-people";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useAllTasks, useArea, useCheckins, useGoal, useKeyResults, useMilestones, useSettings } from "@/features/data";
import { areaColorVar } from "@/features/areas/model";
import {
  GOAL_STATUS_META,
  goalProgress,
  HEALTH_META,
  krProgress,
  needsNextStep,
  suggestHealth,
  type Goal,
  type GoalHealth,
  type KeyResult,
} from "@/features/goals/model";
import { isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayOf } from "@/lib/dates";

export function GoalView() {
  const id = useSearchParams().get("id");
  const goal = useGoal(id);
  if (goal === undefined) return null;
  if (!goal) {
    return (
      <EmptyState
        icon={Target}
        title="Goal not found"
        body="It may have been deleted on another device."
        action={
          <Link href="/goals" className="font-semibold text-accent-text">
            Back to goals
          </Link>
        }
      />
    );
  }
  return <GoalDetail key={goal.id} goal={goal} />;
}

function GoalDetail({ goal }: { goal: Goal }) {
  const actions = useActions();
  const router = useRouter();
  const toast = useToast();
  const { openQuickAdd } = useCommands();
  const area = useArea(goal.areaId);
  const krs = useKeyResults(goal.id) ?? [];
  const milestones = useMilestones(goal.id) ?? [];
  const tasks = (useAllTasks() ?? []).filter((t) => t.goalId === goal.id && !t.parentTaskId);
  const todayDay = useToday();
  const { timezone } = useSettings();
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const [showDone, setShowDone] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingKr, setAddingKr] = useState(false);

  const progress = goalProgress(krs, tasks);
  const suggested = suggestHealth(goal, progress, todayDay, dayOf(goal.createdAt, timezone));
  const health = goal.health ?? suggested;
  const needsStep = needsNextStep(goal, tasks);
  const closed = goal.status === "completed" || goal.status === "dropped";
  const color = areaColorVar(area?.color);

  const visibleTasks = tasks.filter((t) => showDone || isOpen(t));
  const byMilestone = (mid: string | null) => visibleTasks.filter((t) => (t.milestoneId ?? null) === mid);

  return (
    <>
      <header className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4 lg:px-6 lg:pt-8">
        <div className="flex items-center justify-between gap-2">
          <nav className="flex min-w-0 items-center gap-1 text-footnote text-label-secondary" aria-label="Breadcrumb">
            <Link href="/goals" className="hover:text-label">
              Goals
            </Link>
            <span aria-hidden>›</span>
            <AreaPicker value={goal.areaId} onChange={(a) => void actions.updateGoal(goal.id, { areaId: a })} />
          </nav>
          <div className="flex items-center gap-1">
            <span className="lg:hidden">
              <SyncIndicator />
            </span>
            <Menu
              trigger={<IconButton label="Goal actions" icon={<MoreHorizontal className="size-4" />} />}
              align="end"
            >
              {closed ? (
                <MenuItem icon={<RotateCcw />} onSelect={() => void actions.reopenGoal(goal.id)}>
                  Reopen goal
                </MenuItem>
              ) : (
                <>
                  <MenuItem
                    icon={<CheckCircle2 />}
                    onSelect={() => {
                      void actions.completeGoal(goal.id);
                      toast({ message: "Goal completed — well done." });
                    }}
                  >
                    Mark complete
                  </MenuItem>
                  {goal.status === "paused" ? (
                    <MenuItem icon={<Play />} onSelect={() => void actions.updateGoal(goal.id, { status: "active" })}>
                      Resume
                    </MenuItem>
                  ) : (
                    <MenuItem icon={<Pause />} onSelect={() => void actions.updateGoal(goal.id, { status: "paused" })}>
                      Pause
                    </MenuItem>
                  )}
                  <MenuItem icon={<XCircle />} onSelect={() => setDropping(true)}>
                    Drop goal…
                  </MenuItem>
                </>
              )}
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} destructive onSelect={() => setDeleting(true)}>
                Delete goal…
              </MenuItem>
            </Menu>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <textarea
              aria-label="Goal title"
              value={title}
              rows={1}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
              onBlur={() =>
                title.trim() && title.trim() !== goal.title
                  ? void actions.updateGoal(goal.id, { title: title.trim() })
                  : setTitle(goal.title)
              }
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
              className="field-sizing-content w-full resize-none bg-transparent text-display outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {closed ? <Pill>{GOAL_STATUS_META[goal.status].label}</Pill> : null}
              {goal.status === "paused" ? <Pill>Paused</Pill> : null}
              {!closed ? (
                <Picker
                  label="Health"
                  value={goal.health}
                  onChange={(h) => void actions.updateGoal(goal.id, { health: h })}
                  options={[
                    { value: null, label: suggested ? `Automatic (${HEALTH_META[suggested].label})` : "Automatic" },
                    ...(Object.keys(HEALTH_META) as GoalHealth[]).map((h) => ({
                      value: h,
                      label: HEALTH_META[h].label,
                    })),
                  ]}
                  trigger={
                    <button type="button" aria-label="Health" className="rounded-full">
                      {health ? (
                        <Pill tone={HEALTH_META[health].tone}>
                          {HEALTH_META[health].label}
                          {goal.health ? "" : " · auto"}
                        </Pill>
                      ) : (
                        <Pill>Set health</Pill>
                      )}
                    </button>
                  }
                />
              ) : null}
              <DatePicker
                label="Target date"
                placeholder="Target date"
                value={goal.targetDate}
                todayDay={todayDay}
                onChange={(d) => void actions.updateGoal(goal.id, { targetDate: d })}
              />
              <GoalPeople goal={goal} />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <GoalPlanet
              progress={progress}
              color={color}
              size={104}
              milestones={milestones.map((m) => ({ id: m.id, done: m.doneAt != null }))}
              label={`${Math.round(progress * 100)}% complete`}
            />
            <span className="text-footnote font-semibold tabular">{Math.round(progress * 100)}%</span>
          </div>
        </div>

        {goal.status === "dropped" && goal.droppedReason ? (
          <p className="rounded-md bg-fill px-3 py-2 text-callout text-label-secondary">
            Dropped: {goal.droppedReason}
          </p>
        ) : null}
        {needsStep ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--warning)_60%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-4 py-3">
            <AlertTriangle className="size-4 shrink-0 text-warning-text" />
            <p className="flex-1 text-callout">This goal has no open tasks. What&rsquo;s the next step?</p>
            <Button
              size="default"
              onClick={() => openQuickAdd({ goalId: goal.id, areaId: goal.areaId, status: "todo" })}
            >
              Add next step
            </Button>
          </div>
        ) : null}
      </header>

      <PageBody>
        <textarea
          aria-label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== goal.description && void actions.updateGoal(goal.id, { description })}
          placeholder="Why does this matter to you?"
          className="mb-2 field-sizing-content min-h-12 w-full max-w-[68ch] resize-none rounded-md bg-transparent py-1 text-callout text-label-secondary outline-none placeholder:text-label-tertiary focus-visible:bg-surface-sunken focus-visible:px-3"
        />

        <SectionLabel count={krs.length}>Key results</SectionLabel>
        <div className="flex flex-col gap-1">
          {krs.map((kr) => (
            <KeyResultRow key={kr.id} kr={kr} color={color} />
          ))}
          <button
            type="button"
            onClick={() => setAddingKr(true)}
            className="flex h-row items-center gap-2 rounded-md px-3 text-body text-label-tertiary hover:bg-fill"
          >
            <Plus className="size-4" /> Add a key result
          </button>
        </div>

        <SectionLabel count={milestones.length}>Milestones</SectionLabel>
        <Milestones goalId={goal.id} todayDay={todayDay} />

        <div className="mt-6 mb-1 flex items-center justify-between">
          <SectionLabel count={tasks.filter(isOpen).length}>Tasks</SectionLabel>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-footnote font-medium text-accent-text"
          >
            {showDone ? "Hide done" : "Show done"}
          </button>
        </div>
        {milestones.map((m) => {
          const list = byMilestone(m.id);
          if (!list.length) return null;
          return (
            <div key={m.id} className="mb-2">
              <p className="px-3 pt-2 pb-1 text-footnote font-medium text-label-secondary">{m.title}</p>
              <TaskList tasks={list} showGoal={false} />
            </div>
          );
        })}
        <TaskList tasks={byMilestone(null)} showGoal={false} label="Tasks" />
        <button
          type="button"
          onClick={() => openQuickAdd({ goalId: goal.id, areaId: goal.areaId, status: "todo" })}
          className="mt-1 flex h-row w-full items-center gap-2 rounded-md px-3 text-body text-label-tertiary hover:bg-fill"
        >
          <Plus className="size-4" /> Add a task
        </button>
      </PageBody>

      <NewKeyResultDialog open={addingKr} onOpenChange={setAddingKr} goalId={goal.id} />
      <DropGoalDialog
        open={dropping}
        onOpenChange={setDropping}
        onDrop={(reason) => {
          void actions.dropGoal(goal.id, reason);
          toast({ message: "Goal dropped" });
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${goal.title}”?`}
        description={`Its key results and milestones are deleted. Its ${tasks.length} task${tasks.length === 1 ? "" : "s"} stay, without a goal. You can't undo this.`}
        confirmLabel="Delete goal"
        onConfirm={() => {
          void actions.deleteGoal(goal);
          router.replace("/goals");
        }}
      />
    </>
  );
}

function KeyResultRow({ kr, color }: { kr: KeyResult; color: string }) {
  const actions = useActions();
  const [checkingIn, setCheckingIn] = useState(false);
  const p = krProgress(kr);
  const fmt = (n: number) => (kr.type === "percent" ? `${n}%` : `${n}${kr.unit ? ` ${kr.unit}` : ""}`);
  return (
    <div className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-fill">
      {kr.type === "boolean" ? (
        <Checkbox
          checked={kr.current >= 1}
          onChange={(d) => void actions.checkInKeyResult(kr, d ? 1 : 0, null)}
          label={`Done: ${kr.title}`}
          color={color}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body">{kr.title}</p>
        {kr.type !== "boolean" ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${p * 100}%`, background: color }}
              />
            </div>
            <span className="text-footnote text-label-secondary tabular">
              {fmt(kr.current)} / {fmt(kr.target)}
            </span>
          </div>
        ) : null}
      </div>
      {kr.type !== "boolean" ? (
        <Button variant="secondary" onClick={() => setCheckingIn(true)}>
          Check in
        </Button>
      ) : null}
      <Menu
        trigger={
          <IconButton
            label={`Options for ${kr.title}`}
            icon={<MoreHorizontal className="size-4" />}
            className="lg:opacity-0 lg:group-hover:opacity-100"
          />
        }
        align="end"
      >
        <MenuItem icon={<Trash2 />} destructive onSelect={() => void actions.deleteKeyResult(kr.id)}>
          Delete key result
        </MenuItem>
      </Menu>
      {checkingIn ? <CheckInDialog kr={kr} onClose={() => setCheckingIn(false)} /> : null}
    </div>
  );
}

function CheckInDialog({ kr, onClose }: { kr: KeyResult; onClose: () => void }) {
  const actions = useActions();
  const history = useCheckins(kr.id) ?? [];
  const [value, setValue] = useState(String(kr.current));
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={kr.title}
      description={`Target: ${kr.target}${kr.unit ? ` ${kr.unit}` : kr.type === "percent" ? "%" : ""}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(value);
          if (Number.isFinite(v)) void actions.checkInKeyResult(kr, v, note.trim() || null);
          onClose();
        }}
        className="mt-5 flex flex-col gap-4"
      >
        <Field label="Current value">
          <Input
            autoFocus
            inputMode="decimal"
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What moved it?" />
        </Field>
        {history.length ? (
          <ol className="max-h-32 overflow-y-auto text-footnote text-label-secondary">
            {history.slice(0, 8).map((c) => (
              <li key={c.id} className="flex justify-between gap-2 py-0.5">
                <span className="truncate">{c.note ?? "—"}</span>
                <span className="tabular">
                  {c.value} · {new Date(c.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save check-in</Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewKeyResultDialog({
  open,
  onOpenChange,
  goalId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goalId: string;
}) {
  const actions = useActions();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"number" | "percent" | "boolean">("number");
  const [start, setStart] = useState("0");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    // Close first so further typing can't land in this dialog while the write finishes.
    onOpenChange(false);
    void actions.createKeyResult(goalId, {
      title: title.trim(),
      type,
      start: type === "boolean" ? 0 : Number(start) || 0,
      target: type === "boolean" ? 1 : type === "percent" ? Number(target) || 100 : Number(target) || 1,
      unit: type === "number" ? unit.trim() || null : null,
    });
    setTitle("");
    setTarget("");
    setUnit("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New key result"
      description="A measurable sign that the goal is working."
    >
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field label="Key result">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Applications sent" />
        </Field>
        <Segmented
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: "number", label: "Number" },
            { value: "percent", label: "Percent" },
            { value: "boolean", label: "Done / not done" },
          ]}
        />
        {type !== "boolean" ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start">
              <Input type="number" step="any" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Target">
              <Input
                type="number"
                step="any"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={type === "percent" ? "100" : "20"}
              />
            </Field>
            {type === "number" ? (
              <Field label="Unit">
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="apps" />
              </Field>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim()}>
            Add key result
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Milestones({ goalId, todayDay }: { goalId: string; todayDay: string }) {
  const actions = useActions();
  const milestones = useMilestones(goalId) ?? [];
  const [title, setTitle] = useState("");
  return (
    <div className="flex flex-col">
      {milestones.map((m) => (
        <div key={m.id} className="group flex items-center gap-1 rounded-md pr-2 hover:bg-fill">
          <Checkbox
            checked={m.doneAt != null}
            onChange={(d) => void actions.toggleMilestone(m.id, d)}
            label={`Milestone done: ${m.title}`}
            shape="square"
            color="var(--accent)"
          />
          <span className={cn("min-w-0 flex-1 truncate", m.doneAt != null && "text-label-tertiary line-through")}>
            {m.title}
          </span>
          <DatePicker
            label="Milestone date"
            placeholder="Date"
            value={m.dueDate}
            todayDay={todayDay}
            onChange={(d) => void actions.updateMilestone(m.id, { dueDate: d })}
          />
          <IconButton
            label={`Delete ${m.title}`}
            icon={<X className="size-3.5" />}
            className="lg:opacity-0 lg:group-hover:opacity-100"
            onClick={() => void actions.deleteMilestone(m.id)}
          />
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void actions.createMilestone(goalId, title.trim());
          setTitle("");
        }}
        className="flex h-row items-center gap-2 px-3"
      >
        <Plus className="size-4 text-label-tertiary" />
        <input
          aria-label="New milestone"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a milestone"
          className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-label-tertiary"
        />
      </form>
    </div>
  );
}

function DropGoalDialog({
  open,
  onOpenChange,
  onDrop,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDrop: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Drop this goal?"
      description="That's allowed — priorities change. Say why, so future you remembers."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return;
          onDrop(reason.trim());
          setReason("");
          onOpenChange(false);
        }}
        className="mt-5 flex flex-col gap-4"
      >
        <Field label="Reason">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Not important to me anymore"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!reason.trim()}>
            Drop goal
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
