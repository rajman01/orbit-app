"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { HabitsScene } from "@/components/app/scenes";
import { HabitForm } from "@/components/habits/habit-form";
import { HabitRow } from "@/components/habits/habit-row";
import { SectionLabel, useTaskLookups } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useActions } from "@/features/actions";
import { useHabits, type HabitDoc } from "@/features/data";
import { useHabitBoard } from "@/features/habits/use-habit-board";

/** PRD §7.10: light habit tracking with "never miss twice" streaks. */
export function HabitsView() {
  const actions = useActions();
  const { items, today } = useHabitBoard();
  const archived = (useHabits({ includeArchived: true }) ?? []).filter((h) => h.archivedAt != null);
  const { areaById } = useTaskLookups();
  const [editing, setEditing] = useState<HabitDoc | null | "new">(null);

  const due = (items ?? []).filter((i) => i.status.due);
  const rest = (items ?? []).filter((i) => !i.status.due);
  const row = (i: NonNullable<typeof items>[number]) => (
    <li key={i.habit.id} className="flex items-center">
      <div className="min-w-0 flex-1">
        <HabitRow
          habit={i.habit}
          status={i.status}
          log={i.todayLog}
          today={today}
          area={i.habit.areaId ? areaById.get(i.habit.areaId) : undefined}
          onEdit={() => setEditing(i.habit)}
        />
      </div>
      <Menu
        trigger={<IconButton label={`More for ${i.habit.name}`} icon={<Pencil className="size-4" />} />}
        align="end"
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(i.habit)}>
          Edit
        </MenuItem>
        <MenuItem icon={<Archive />} onSelect={() => void actions.archiveHabit(i.habit.id, true)}>
          Archive
        </MenuItem>
      </Menu>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Habits"
        subtitle="Don't miss twice"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New habit
          </Button>
        }
      />
      <PageBody>
        {items && !items.length ? (
          <EmptyState
            icon={Repeat}
            illustration={<HabitsScene />}
            title="No habits yet"
            body="Small things you want to do regularly: read, stretch, apply to two jobs a week. Missing once is fine; missing twice is where habits die."
            action={<Button onClick={() => setEditing("new")}>Add a habit</Button>}
          />
        ) : null}
        {due.length ? (
          <>
            <SectionLabel count={due.length}>Due today</SectionLabel>
            <ul className="flex flex-col">{due.map(row)}</ul>
          </>
        ) : null}
        {rest.length ? (
          <>
            <SectionLabel count={rest.length}>{due.length ? "Done or not due today" : "All habits"}</SectionLabel>
            <ul className="flex flex-col">{rest.map(row)}</ul>
          </>
        ) : null}
        {archived.length ? (
          <>
            <SectionLabel count={archived.length}>Archived</SectionLabel>
            <ul className="flex flex-col">
              {archived.map((h) => (
                <li key={h.id} className="flex min-h-row items-center gap-2 px-2 text-label-secondary">
                  <span className="min-w-0 flex-1 truncate">{h.name}</span>
                  <IconButton
                    label={`Restore ${h.name}`}
                    icon={<ArchiveRestore className="size-4" />}
                    onClick={() => void actions.archiveHabit(h.id, false)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </PageBody>
      <HabitForm open={editing != null} habit={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
    </>
  );
}
