import Dexie, { type EntityTable } from "dexie";
import type { EntityName, SyncedDoc } from "@/lib/sync/entities";
import type { Mutation } from "@/lib/sync/protocol";

export interface OutboxItem extends Mutation {
  seq?: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

type Tables = { [E in EntityName]: EntityTable<SyncedDoc<E>, "id"> };

export type OrbitDB = Dexie &
  Tables & {
    outbox: EntityTable<OutboxItem, "seq">;
    meta: EntityTable<MetaRow, "key">;
  };

/** One IndexedDB database per signed-in user, so accounts never mix on a shared device. */
export function openLocalDb(userId: string): OrbitDB {
  const db = new Dexie(`orbit-${userId}`) as OrbitDB;
  db.version(1).stores({
    tasks: "id, status, order, deletedAt, serverVersion",
    outbox: "++seq, entityId",
    meta: "key",
  });
  // Phase 1A: full planning model.
  db.version(2).stores({
    tasks:
      "id, status, order, deletedAt, serverVersion, goalId, areaId, parentTaskId, milestoneId, dueDate, scheduledDate",
    settings: "id",
    areas: "id, order",
    goals: "id, areaId, status, order",
    keyResults: "id, goalId",
    krCheckins: "id, keyResultId, goalId",
    milestones: "id, goalId",
    taskEvents: "id, taskId",
    outbox: "++seq, entityId",
    meta: "key",
  });
  // Phase 1B: focus sessions.
  db.version(3).stores({ focusSessions: "id, taskId, startedAt" });
  // Phase 1C: cycles and rituals.
  db.version(4).stores({ cycles: "id, number, startDate", rituals: "id, type, date, cycleId" });
  // Phase 1D: habits, XP and reminders.
  db.version(5).stores({
    habits: "id, order",
    habitLogs: "id, habitId, date",
    xpEvents: "id, source, at",
    reminders: "id, fireAt",
  });
  // Phase 2A: AI coach.
  db.version(6).stores({
    aiThreads: "id, lastMessageAt",
    aiMessages: "id, threadId, [threadId+seq]",
    aiMemories: "id",
  });
  // Phase 2A.2: what the coach did, for cards, the activity feed and undo.
  db.version(7).stores({ aiActions: "id, threadId, toolUseId, at" });
  // Phase 2B: calendars and their events (written by the server).
  db.version(8).stores({ calendars: "id, accountId", calendarEvents: "id, calendarId, start, startDay" });
  // Phase 2B.2: time blocks.
  db.version(9).stores({ timeBlocks: "id, taskId, start" });
  // Phase 2C: people.
  db.version(10).stores({
    tasks:
      "id, status, order, deletedAt, serverVersion, goalId, areaId, parentTaskId, milestoneId, dueDate, scheduledDate, personId",
    people: "id, name",
    interactions: "id, personId, date",
    personItems: "id, personId",
  });
  return db;
}
