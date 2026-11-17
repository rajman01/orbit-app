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

export type CycleDoc = SyncedDoc<"cycles">;
export type RitualDoc = SyncedDoc<"rituals">;

export function useCycles(): CycleDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.cycles.toArray()).sort((a, b) => a.number - b.number), [db]);
}

export function useRituals(): RitualDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.rituals.toArray()).sort((a, b) => a.date.localeCompare(b.date)), [db]);
}

/** When each task was added to a cycle (for the burn-up's added scope). */
export function useCycleAddedAt(cycleId: string | null | undefined): Map<string, number> | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const map = new Map<string, number>();
    if (!cycleId) return map;
    const events = live(await db.taskEvents.toArray()).filter((e) => e.reason === "cycle_add" && e.to === cycleId);
    for (const e of events.sort((a, b) => a.at - b.at)) map.set(e.taskId, e.at);
    return map;
  }, [db, cycleId]);
}

export type HabitDoc = SyncedDoc<"habits">;
export type HabitLogDoc = SyncedDoc<"habitLogs">;
export type XpEventDoc = SyncedDoc<"xpEvents">;

export function useHabits(opts: { includeArchived?: boolean } = {}): HabitDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const rows = live(await db.habits.toArray()).filter((h) => opts.includeArchived || h.archivedAt == null);
    return rows.sort((a, b) => a.order - b.order);
  }, [db, opts.includeArchived]);
}

export function useHabitLogs(): HabitLogDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.habitLogs.toArray()), [db]);
}

export function useXpEvents(): XpEventDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.xpEvents.toArray()).sort((a, b) => b.at - a.at), [db]);
}

/** Every task event (history, skips, stale resolutions). */
export function useAllTaskEvents(): TaskEvent[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.taskEvents.toArray()), [db]);
}

export type PersonDoc = SyncedDoc<"people">;
export type InteractionDoc = SyncedDoc<"interactions">;
export type PersonItemDoc = SyncedDoc<"personItems">;

/** People, sorted by name. */
export function usePeople(opts: { includeArchived?: boolean } = {}): PersonDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const rows = live(await db.people.toArray()).filter((p) => opts.includeArchived || p.archivedAt == null);
    return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [db, opts.includeArchived]);
}

export function usePerson(id: string | null | undefined): PersonDoc | null | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    if (!id) return null;
    const p = await db.people.get(id);
    return p && !p.deletedAt ? p : null;
  }, [db, id]);
}

/** Interactions, newest first; for one person when `personId` is given. */
export function useInteractions(personId?: string | null): InteractionDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const rows = personId
      ? await db.interactions.where("personId").equals(personId).toArray()
      : await db.interactions.toArray();
    return live(rows).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [db, personId]);
}

export function usePersonItems(personId: string): PersonItemDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () =>
      live(await db.personItems.where("personId").equals(personId).toArray()).sort((a, b) => a.createdAt - b.createdAt),
    [db, personId],
  );
}

export type VisionDoc = SyncedDoc<"vision">;
export type QuarterDoc = SyncedDoc<"quarters">;

/** The vision (VIS-1), or null before anything is saved. */
export function useVision(): VisionDoc | null | undefined {
  const { db } = useSync();
  const user = useCurrentUser();
  return useLiveQuery(async () => {
    const v = await db.vision.get(`v${user.id}`.slice(0, 40));
    return v && !v.deletedAt ? v : null;
  }, [db, user.id]);
}

export function useQuarters(): QuarterDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.quarters.toArray()).sort((a, b) => a.year - b.year || a.q - b.q), [db]);
}

export type JournalDoc = SyncedDoc<"journalEntries">;
export type WinDoc = SyncedDoc<"wins">;
export type GoalEventDoc = SyncedDoc<"goalEvents">;

/** Journal entries, newest first. */
export function useJournal(): JournalDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () => live(await db.journalEntries.toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [db],
  );
}

/** Wins, newest first. */
export function useWins(): WinDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () => live(await db.wins.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [db],
  );
}

export function useGoalEvents(goalId: string): GoalEventDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () => live(await db.goalEvents.where("goalId").equals(goalId).toArray()).sort((a, b) => b.at - a.at),
    [db, goalId],
  );
}

export type SavedViewDoc = SyncedDoc<"savedViews">;
export type NotificationDoc = SyncedDoc<"notifications">;

/** CMD-4: saved Tasks views, in sidebar order. */
export function useSavedViews(): SavedViewDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.savedViews.toArray()).sort((a, b) => a.order - b.order), [db]);
}

/** NOT-5: what Orbit sent, newest first (the last 100). */
export function useNotifications(): NotificationDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () => live(await db.notifications.orderBy("sentAt").reverse().limit(150).toArray()).slice(0, 100),
    [db],
  );
}

export function useUnreadNotifications(): number {
  const { db } = useSync();
  return useLiveQuery(() => db.notifications.filter((n) => !n.deletedAt && n.readAt == null).count(), [db]) ?? 0;
}

export type AreaRatingDoc = SyncedDoc<"areaRatings">;

/** AREA-4: Wheel of Life ratings, newest first. */
export function useAreaRatings(): AreaRatingDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () => live(await db.areaRatings.toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [db],
  );
}

export type SkillDoc = SyncedDoc<"skills">;
export type LearningItemDoc = SyncedDoc<"learningItems">;
export type JobLeadDoc = SyncedDoc<"jobLeads">;

/** CAR-2: skills in order (archived ones only when asked). */
export function useSkills(opts: { includeArchived?: boolean } = {}): SkillDoc[] | undefined {
  const { db } = useSync();
  const all = opts.includeArchived ?? false;
  return useLiveQuery(
    async () =>
      live(await db.skills.toArray())
        .filter((s) => all || s.archivedAt == null)
        .sort((a, b) => a.order - b.order),
    [db, all],
  );
}

export function useSkill(id: string | null | undefined): SkillDoc | null | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    if (!id) return null;
    const s = await db.skills.get(id);
    return s && !s.deletedAt ? s : null;
  }, [db, id]);
}

/** CAR-3: the learning queue, in order. */
export function useLearningItems(): LearningItemDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.learningItems.toArray()).sort((a, b) => a.order - b.order), [db]);
}

/** CAR-4: job leads, in order. */
export function useJobLeads(): JobLeadDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.jobLeads.toArray()).sort((a, b) => a.order - b.order), [db]);
}

export type RoutineDoc = SyncedDoc<"routines">;
export type RoutineRunDoc = SyncedDoc<"routineRuns">;

/** HAB-5: routines in order (archived ones only when asked). */
export function useRoutines(opts: { includeArchived?: boolean } = {}): RoutineDoc[] | undefined {
  const { db } = useSync();
  const all = opts.includeArchived ?? false;
  return useLiveQuery(
    async () =>
      live(await db.routines.toArray())
        .filter((r) => all || r.archivedAt == null)
        .sort((a, b) => a.order - b.order),
    [db, all],
  );
}

/** Runs on a day, keyed by routine. */
export function useRoutineRuns(date: string): Map<string, RoutineRunDoc> | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () => new Map(live(await db.routineRuns.where("date").equals(date).toArray()).map((r) => [r.routineId, r])),
    [db, date],
  );
}

export type CareerProfileDoc = SyncedDoc<"careerProfile">;
export type JobPostingDoc = SyncedDoc<"jobPostings">;

/** CAR-5: the career profile (null when there isn't one yet). */
export function useCareerProfile(): CareerProfileDoc | null | undefined {
  const user = useCurrentUser();
  const { db } = useSync();
  return useLiveQuery(async () => {
    const p = await db.careerProfile.get(`cp${user.id}`.slice(0, 40));
    return p && !p.deletedAt ? p : null;
  }, [db, user.id]);
}

/** CAR-5: found roles, best fit first (then newest). */
export function useJobPostings(): JobPostingDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () =>
      live(await db.jobPostings.toArray()).sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1) || b.foundAt - a.foundAt),
    [db],
  );
}

// ------------------------------------------------------------ money (Phase 5)

export type AccountDoc = SyncedDoc<"accounts">;
export type CategoryDoc = SyncedDoc<"categories">;
export type TransactionDoc = SyncedDoc<"transactions">;

export function useAccounts(opts: { includeArchived?: boolean } = {}): AccountDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () =>
      live(await db.accounts.toArray())
        .filter((a) => opts.includeArchived || a.archivedAt == null)
        .sort((a, b) => a.order - b.order),
    [db, opts.includeArchived],
  );
}

export function useCategories(opts: { includeArchived?: boolean } = {}): CategoryDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () =>
      live(await db.categories.toArray())
        .filter((c) => opts.includeArchived || c.archivedAt == null)
        .sort((a, b) => a.order - b.order),
    [db, opts.includeArchived],
  );
}

/** Every transaction, newest first (the ledger is small: a few thousand rows at most). */
export function useTransactions(): TransactionDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(
    async () =>
      live(await db.transactions.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [db],
  );
}

export type BudgetDoc = SyncedDoc<"budgets">;

export function useBudgets(): BudgetDoc[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => live(await db.budgets.toArray()), [db]);
}
