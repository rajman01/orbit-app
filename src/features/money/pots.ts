import { daysBetween, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { addMonthsTo, monthOf, type Transaction } from "./model";

/**
 * 5C: savings pots (D48). A pot's balance is the transfers into it minus those out. Putting money in
 * is a transfer with `potId` from an account (or nowhere); taking it out is a transfer with `potId`
 * and `toAccountId`.
 */

export type Pot = SyncedDoc<"savingsPots">;
export type PotFields = EntityFields<"savingsPots">;

export function newPotFields(partial: Partial<PotFields> & { name: string }): PotFields {
  return {
    target: 0,
    targetDate: null,
    goalId: null,
    keyResultId: null,
    accountId: null,
    note: "",
    archivedAt: null,
    order: Date.now(),
    ...partial,
  };
}

export const isContribution = (t: Pick<Transaction, "kind" | "potId" | "toAccountId">) =>
  t.kind === "transfer" && t.potId != null && t.toAccountId == null;
export const isWithdrawal = (t: Pick<Transaction, "kind" | "potId" | "toAccountId">) =>
  t.kind === "transfer" && t.potId != null && t.toAccountId != null;

export function potBalance(potId: string, transactions: Transaction[], upTo?: Day): number {
  let balance = 0;
  for (const t of transactions) {
    if (t.deletedAt != null || t.potId !== potId) continue;
    if (upTo && t.date > upTo) continue;
    if (isContribution(t)) balance += t.amount;
    else if (isWithdrawal(t)) balance -= t.amount;
  }
  return balance;
}

export interface PotProjection {
  balance: number;
  left: number;
  /** Net put in per month over the last three months (this month counted in full). */
  monthlyRate: number;
  /** At that rate, the month the target is reached ("2028-03"), or null when there's no rate. */
  reachMonth: string | null;
  /** With a target date: what to put in each month from now to hit it (0 when done). */
  neededPerMonth: number | null;
  /** Months left to the target date, at least 1 while it's ahead. */
  monthsLeft: number | null;
  done: boolean;
}

/** Where a pot is heading: "at this rate, March 2028" or "needs ₦X a month to make June". */
export function potProjection(pot: Pot, transactions: Transaction[], todayDay: Day): PotProjection {
  const balance = potBalance(pot.id, transactions);
  const left = Math.max(0, pot.target - balance);
  const done = pot.target > 0 && balance >= pot.target;
  const month = monthOf(todayDay);
  const months = [addMonthsTo(month, -2), addMonthsTo(month, -1), month];
  let put = 0;
  for (const t of transactions) {
    if (t.deletedAt != null || t.potId !== pot.id || !months.includes(monthOf(t.date))) continue;
    if (isContribution(t)) put += t.amount;
    else if (isWithdrawal(t)) put -= t.amount;
  }
  // Count only the months since the pot existed, so a pot started this month isn't averaged over three.
  const since = Math.max(
    1,
    Math.min(3, months.filter((m) => m >= monthOf(pot.createdAt ? dayOfMs(pot.createdAt) : todayDay)).length),
  );
  const monthlyRate = Math.max(0, Math.round(put / since));
  const reachMonth = done
    ? month
    : monthlyRate > 0 && left > 0
      ? addMonthsTo(month, Math.ceil(left / monthlyRate))
      : null;
  let monthsLeft: number | null = null;
  let neededPerMonth: number | null = null;
  if (pot.targetDate) {
    monthsLeft = Math.max(1, Math.ceil(daysBetween(todayDay, pot.targetDate) / 30.4));
    // Whole major units (naira, pounds): nobody saves ₦42,857.15 a month.
    neededPerMonth = done ? 0 : Math.ceil(left / monthsLeft / 100) * 100;
    if (pot.targetDate < todayDay) monthsLeft = 0;
  }
  return { balance, left, monthlyRate, reachMonth, neededPerMonth, monthsLeft, done };
}

function dayOfMs(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The last day of a month ("2028-03" → "2028-03-31"). */
export function lastDayOf(month: string): Day {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, "0")}`;
}
