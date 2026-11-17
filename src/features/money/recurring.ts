import { addDays, type Day } from "@/lib/dates";
import type { Recurrence } from "@/lib/sync/entities";
import { nextInstanceId, nextOccurrence } from "@/features/tasks/model";
import type { Transaction } from "./model";

/**
 * 5B: recurring money (rent, salary, subscriptions). The transaction that carries a `recurrence` is
 * the first occurrence and the template; each later one is a copy with `recurrenceParentId` and a
 * fixed id (`nextInstanceId`), made only when you confirm it. A skipped one is made and deleted, so
 * its tombstone keeps it from coming back. Nothing is logged without a tap (D46).
 */

export interface DueOccurrence {
  template: Transaction;
  date: Day;
  id: string;
}

/** The dates a template is due on, after its own date and up to `until`, oldest first. */
export function occurrencesUntil(template: Pick<Transaction, "date" | "recurrence">, until: Day, max = 60): Day[] {
  const rule = template.recurrence;
  if (!rule) return [];
  const out: Day[] = [];
  let d = template.date;
  for (let i = 0; i < max; i++) {
    d = nextOccurrence(rule, d, d);
    if (d > until) break;
    out.push(d);
  }
  return out;
}

/** Occurrences up to today that have no instance yet (confirmed or skipped). The oldest three at most. */
export function dueOccurrences(transactions: Transaction[], todayDay: Day): DueOccurrence[] {
  const ids = new Set(transactions.map((t) => t.id));
  const out: DueOccurrence[] = [];
  for (const t of transactions) {
    if (!t.recurrence || t.recurrenceParentId || t.deletedAt != null) continue;
    for (const date of occurrencesUntil(t, todayDay)) {
      const id = nextInstanceId(t.id, date);
      if (!ids.has(id)) out.push({ template: t, date, id });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
}

/** The next occurrence of each template after today, within `days`, soonest first. */
export function upcomingOccurrences(transactions: Transaction[], todayDay: Day, days = 14): DueOccurrence[] {
  const until = addDays(todayDay, days);
  const out: DueOccurrence[] = [];
  for (const t of transactions) {
    if (!t.recurrence || t.recurrenceParentId || t.deletedAt != null) continue;
    const date = occurrencesUntil(t, until).find((d) => d > todayDay);
    if (date) out.push({ template: t, date, id: nextInstanceId(t.id, date) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** What a confirmed occurrence looks like: the template's fields on the new date, linked back. */
export function instanceFields(template: Transaction, date: Day) {
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    deletedAt: _d,
    serverVersion: _s,
    recurrence: _r,
    recurrenceParentId: _p,
    importHash: _h,
    ...fields
  } = template;
  return { ...fields, date, recurrence: null, recurrenceParentId: template.id, importHash: null };
}

export const REPEAT_OPTIONS: { value: string; label: string; rule: Recurrence | null }[] = [
  { value: "none", label: "Doesn't repeat", rule: null },
  { value: "weekly", label: "Every week", rule: { freq: "weekly", interval: 1, mode: "fixed" } },
  { value: "fortnightly", label: "Every 2 weeks", rule: { freq: "weekly", interval: 2, mode: "fixed" } },
  { value: "monthly", label: "Every month", rule: { freq: "monthly", interval: 1, mode: "fixed" } },
  { value: "quarterly", label: "Every 3 months", rule: { freq: "monthly", interval: 3, mode: "fixed" } },
];

export function repeatValue(rule: Recurrence | null): string {
  if (!rule) return "none";
  return (
    REPEAT_OPTIONS.find((o) => o.rule && o.rule.freq === rule.freq && o.rule.interval === rule.interval)?.value ??
    "monthly"
  );
}
