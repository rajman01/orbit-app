"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useSync } from "@/components/app/sync-provider";
import { useCurrentUser } from "@/components/app/auth-gate";
import type { SyncedDoc } from "@/lib/sync/entities";
import { defaultSettings, settingsId, type Settings } from "./settings/model";
import { withTaskDefaults, type Task } from "./tasks/model";
import type { Goal, KeyResult, Milestone } from "./goals/model";

export type Area = SyncedDoc<"areas">;
export type TaskEvent = SyncedDoc<"taskEvents">;
export type KrCheckin = SyncedDoc<"krCheckins">;

const live = <T extends { deletedAt: number | null }>(rows: T[]) => rows.filter((r) => r.deletedAt == null);

/** User settings, falling back to defaults until the settings document exists. */
export function useSettings(): Settings & { loaded: boolean; exists: boolean } {
  const { db } = useSync();
  const user = useCurrentUser();
  const doc = useLiveQuery(() => db.settings.get(settingsId(user.id)).then((d) => d ?? null), [db, user.id]);
  const base = doc && !doc.deletedAt ? doc : defaultSettings();
  return { ...defaultSettings(), ...base, loaded: doc !== undefined, exists: Boolean(doc && !doc.deletedAt) };
}

export function useAreas(opts: { includeArchived?: boolean } = {}): Area[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const rows = live(await db.areas.toArray()).filter((a) => opts.includeArchived || a.archivedAt == null);
    return rows.sort((a, b) => a.order - b.order);
  }, [db, opts.includeArchived]);
}

export function useArea(id: string | null | undefined): Area | null | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => (id ? ((await db.areas.get(id)) ?? null) : null), [db, id]);
}

export function useGoals(): Goal[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.goals.toArray()).sort((a, b) => a.order - b.order), [db]);
}

export function useGoal(id: string | null | undefined): Goal | null | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    if (!id) return null;
    const g = await db.goals.get(id);
    return g && !g.deletedAt ? g : null;
  }, [db, id]);
}

export function useKeyResults(goalId?: string): KeyResult[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const rows = goalId ? await db.keyResults.where("goalId").equals(goalId).toArray() : await db.keyResults.toArray();
    return live(rows).sort((a, b) => a.order - b.order);
  }, [db, goalId]);
}

export function useMilestones(goalId?: string): Milestone[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const rows = goalId ? await db.milestones.where("goalId").equals(goalId).toArray() : await db.milestones.toArray();
    return live(rows).sort((a, b) => a.order - b.order);
  }, [db, goalId]);
}

export function useCheckins(keyResultId: string): KrCheckin[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () =>
      live(await db.krCheckins.where("keyResultId").equals(keyResultId).toArray()).sort((a, b) => b.at - a.at),
    [db, keyResultId],
  );
}

/** All live tasks (top-level and subtasks), with defaults filled for older documents. */
export function useAllTasks(): Task[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.tasks.toArray()).map(withTaskDefaults), [db]);
}

export function useTask(id: string | null | undefined): Task | null | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    if (!id) return null;
    const t = await db.tasks.get(id);
    return t && !t.deletedAt ? withTaskDefaults(t) : null;
  }, [db, id]);
}

export function useTaskEvents(taskId: string | null | undefined): TaskEvent[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () =>
      taskId ? live(await db.taskEvents.where("taskId").equals(taskId).toArray()).sort((a, b) => b.at - a.at) : [],
    [db, taskId],
  );
}

export type FocusSession = SyncedDoc<"focusSessions">;

/** Focus sessions, newest first; for one task when `taskId` is given. */
export function useFocusSessions(taskId?: string | null): FocusSession[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const rows = taskId
      ? await db.focusSessions.where("taskId").equals(taskId).toArray()
      : await db.focusSessions.toArray();
    return live(rows).sort((a, b) => b.startedAt - a.startedAt);
  }, [db, taskId]);
}
