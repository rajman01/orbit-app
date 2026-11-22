import type { Day } from "@/lib/dates";
import type { Settings } from "@/features/settings/model";
import { budgetStatuses, type Budget } from "./budgets";
import { debtState, type Debt } from "./debts";
import { addMonthsToMonth, daysInMonth, incomeActiveIn, incomeDayIn, incomeTimingLabel } from "./income";
import { monthOf, type Transaction } from "./model";
import { potProjection, type Pot } from "./pots";

/**
 * 5H: the month's plan. What comes in (expected income), what's spoken for (recurring bills,
 * budgets, savings and debt minimums), and what's left. Everything here is derived; the only new
 * inputs are the income sources in Settings and a pot's chosen monthly amount.
 */

export type IncomeSource = NonNullable<NonNullable<Settings["money"]>["incomes"]>[number];

export interface PlanLine {
  id: string;
  name: string;
  /** Per month, in minor units. */
  amount: number;
  note?: string;
  /** Income only: whether this month's payment has come in. */
  status?: IncomeStatus;
}

/**
 * Has a source paid this month? "received" once an income entry for it is logged; otherwise "late"
 * after its day (or the month's end, with no day) has passed, else "expected".
 */
export interface IncomeStatus {
  state: "received" | "expected" | "late";
  /** The day it's due this month, or null with no day. */
  expectedDate: Day | null;
  /** What was logged against it, in minor units. */
  received: number;
}

export interface MonthPlan {
  month: string;
  income: number;
  incomes: PlanLine[];
  /** Sources that pay nothing this month (not started yet, or finished): listed, not counted. */
  otherIncomes: PlanLine[];
  /** Recurring expense entries, as a monthly figure. */
  fixed: PlanLine[];
  fixedTotal: number;
  /** Category budgets (the overall one isn't a cost on its own). */
  budgets: PlanLine[];
  budgetsTotal: number;
  /** Pots: the chosen monthly amount, else what the date needs, else the recent rate. */
  savings: PlanLine[];
  savingsTotal: number;
  /** Minimum payments on debts you owe. */
  debts: PlanLine[];
  debtsTotal: number;
  left: number;
  /** Actuals so far this month, to compare. */
  actual: { income: number; expense: number };
}

/** A recurring entry's monthly equivalent: weekly × 52/12, every two weeks × 26/12, monthly, every N months ÷ N. */
export function monthlyEquivalent(
  amount: number,
  rule: { freq: "daily" | "weekly" | "monthly"; interval: number },
): number {
  if (rule.freq === "monthly") return Math.round(amount / rule.interval);
  if (rule.freq === "weekly") return Math.round((amount * 52) / 12 / rule.interval);
  return Math.round((amount * 365) / 12 / rule.interval);
}

export function monthPlan(
  input: {
    settings: Pick<Settings, "money" | "currency">;
    transactions: Transaction[];
    budgets: Budget[];
    pots: Pot[];
    debts: Debt[];
    categories: { id: string; name: string }[];
  },
  todayDay: Day,
  month = monthOf(todayDay),
): MonthPlan {
  const live = <T extends { deletedAt: number | null }>(rows: T[]) => rows.filter((r) => r.deletedAt == null);
  const line = (i: IncomeSource): PlanLine => ({
    id: i.id,
    name: i.name,
    amount: i.amount,
    note: incomeTimingLabel(i),
  });
  const allIncomes = input.settings.money?.incomes ?? [];
  const activeIncomes = allIncomes.filter((i) => incomeActiveIn(i, month));
  const statuses = incomeStatuses(activeIncomes, live(input.transactions), month, todayDay);
  const incomes = activeIncomes.map((i) => ({ ...line(i), status: statuses.get(i.id) }));
  const otherIncomes = allIncomes.filter((i) => !incomeActiveIn(i, month)).map(line);
  const income = incomes.reduce((s, i) => s + i.amount, 0);

  const transactions = live(input.transactions);
  const fixed: PlanLine[] = transactions
    .filter((t) => t.kind === "expense" && t.recurrence && !t.recurrenceParentId)
    .map((t) => ({
      id: t.id,
      name: t.note || input.categories.find((c) => c.id === t.categoryId)?.name || "Recurring",
      amount: monthlyEquivalent(t.amount, t.recurrence!),
    }));
  const fixedTotal = fixed.reduce((s, f) => s + f.amount, 0);

  const budgets: PlanLine[] = budgetStatuses(live(input.budgets), transactions, month, todayDay)
    .filter((b) => b.categoryId)
    .map((b) => ({
      id: b.budget.id,
      name: input.categories.find((c) => c.id === b.categoryId)?.name ?? "Budget",
      amount: b.budget.amount,
    }));
  const budgetsTotal = budgets.reduce((s, b) => s + b.amount, 0);

  const savings: PlanLine[] = live(input.pots)
    .filter((p) => p.archivedAt == null)
    .map((p) => {
      const pr = potProjection(p, transactions, todayDay);
      const amount = pr.done ? 0 : (p.monthly ?? pr.neededPerMonth ?? pr.monthlyRate);
      return {
        id: p.id,
        name: p.name,
        amount,
        note: pr.done
          ? "reached"
          : p.monthly != null
            ? "chosen"
            : pr.neededPerMonth != null
              ? "to make the date"
              : "recent rate",
      };
    });
  const savingsTotal = savings.reduce((s, p) => s + p.amount, 0);

  const debts: PlanLine[] = live(input.debts)
    .filter((d) => d.direction === "owe" && !d.closedAt && d.archivedAt == null && d.minimumPayment)
    .filter((d) => debtState(d, transactions, todayDay).balance > 0)
    .map((d) => ({ id: d.id, name: d.name, amount: d.minimumPayment!, note: "minimum" }));
  const debtsTotal = debts.reduce((s, d) => s + d.amount, 0);

  let actualIncome = 0;
  let actualExpense = 0;
  for (const t of transactions) {
    if (monthOf(t.date) !== month) continue;
    if (t.kind === "income") actualIncome += t.amount;
    else if (t.kind === "expense") actualExpense += t.amount;
  }

  return {
    month,
    income,
    incomes,
    otherIncomes,
    fixed,
    fixedTotal,
    budgets,
    budgetsTotal,
    savings,
    savingsTotal,
    debts,
    debtsTotal,
    left: income - fixedTotal - budgetsTotal - savingsTotal - debtsTotal,
    actual: { income: actualIncome, expense: actualExpense },
  };
}

/** Expected income in each of `count` months from `month`: start dates, end dates and one-offs included. */
export function incomeByMonth(
  incomes: IncomeSource[],
  month: string,
  count = 6,
): { month: string; income: number; sources: string[] }[] {
  return Array.from({ length: count }, (_, k) => {
    const m = addMonthsToMonth(month, k);
    const live = incomes.filter((i) => incomeActiveIn(i, m));
    return { month: m, income: live.reduce((s, i) => s + i.amount, 0), sources: live.map((i) => i.name) };
  });
}

/** Entries logged from the plan for a source and month start with this, so the plan can find them. */
export function incomeEntryPrefix(incomeId: string, month: string): string {
  return `${incomeId}${month.replace("-", "")}`;
}

/** A fresh id for such an entry (a suffix, so logging again after an undo isn't blocked by the tombstone). */
export function incomeEntryId(incomeId: string, month: string): string {
  return `${incomeEntryPrefix(incomeId, month)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 40);
}

/**
 * Each source's status for `month`. An entry logged from the plan counts for its source; any other
 * income logged that month counts for a source when it's within 10% of the amount (closest first,
 * each entry once).
 */
export function incomeStatuses(
  incomes: IncomeSource[],
  transactions: Transaction[],
  month: string,
  todayDay: Day,
): Map<string, IncomeStatus> {
  const inMonth = transactions.filter((t) => t.kind === "income" && t.deletedAt == null && monthOf(t.date) === month);
  const prefixes = incomes.map((i) => [i.id, incomeEntryPrefix(i.id, month)] as const);
  const linked = (t: Transaction) => prefixes.find(([, p]) => t.id.startsWith(p))?.[0];
  const loose = inMonth.filter((t) => !linked(t));
  const out = new Map<string, IncomeStatus>();
  for (const i of incomes) {
    const day = incomeDayIn(i, month);
    const expectedDate = day != null ? `${month}-${String(day).padStart(2, "0")}` : null;
    let received = inMonth.filter((t) => linked(t) === i.id).reduce((s, t) => s + t.amount, 0);
    if (!received) {
      const match = loose
        .filter((t) => Math.abs(t.amount - i.amount) <= i.amount * 0.1)
        .sort((a, b) => Math.abs(a.amount - i.amount) - Math.abs(b.amount - i.amount))[0];
      if (match) {
        received = match.amount;
        loose.splice(loose.indexOf(match), 1);
      }
    }
    const dueBy = expectedDate ?? `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    out.set(i.id, {
      state: received ? "received" : dueBy < todayDay ? "late" : "expected",
      expectedDate,
      received,
    });
  }
  return out;
}

/** A short id for an income source (settings hold them as a list). */
export function incomeId(): string {
  return `inc${Math.random().toString(36).slice(2, 10)}`;
}
