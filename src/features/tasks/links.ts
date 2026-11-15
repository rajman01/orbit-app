import { isOpen, type Task } from "./model";

/** Phase 3C (TASK-8): "blocked by" links between tasks. Pure rules. */

type Linked = Pick<Task, "id" | "status" | "deletedAt" | "blockedBy">;

/** The open tasks blocking this one (a deleted, done or cancelled blocker no longer blocks). */
export function openBlockers<T extends Linked>(task: Pick<Task, "blockedBy">, byId: Map<string, T>): T[] {
  return (task.blockedBy ?? [])
    .map((id) => byId.get(id))
    .filter((b): b is T => b != null && b.deletedAt == null && isOpen(b));
}

/** Ids of open tasks that are blocked right now. */
export function blockedIds<T extends Linked>(tasks: T[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return new Set(
    tasks.filter((t) => isOpen(t) && t.deletedAt == null && openBlockers(t, byId).length).map((t) => t.id),
  );
}

/** The tasks this one blocks (the reverse of blockedBy). */
export function blocking<T extends Linked>(taskId: string, tasks: T[]): T[] {
  return tasks.filter((t) => t.deletedAt == null && (t.blockedBy ?? []).includes(taskId));
}

/**
 * Would making `taskId` blocked by `blockerId` create a loop (the blocker already waits, directly or
 * through others, on the task)? Also refuses a task blocking itself.
 */
export function wouldLoop(taskId: string, blockerId: string, tasks: Linked[]): boolean {
  if (taskId === blockerId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [blockerId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of byId.get(id)?.blockedBy ?? []) stack.push(next);
  }
  return false;
}

/**
 * After `doneId` is finished: the tasks it was holding up that now have nothing left blocking them,
 * so the app can say "Unblocked: …".
 */
export function newlyUnblocked<T extends Linked>(doneId: string, tasks: T[]): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return blocking(doneId, tasks).filter((t) => isOpen(t) && !openBlockers(t, byId).length);
}
