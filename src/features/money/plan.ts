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
  /** What was logged against it as this month's payment, in minor units. */
  received: number;
  /** Extra money from it counted for this month (bonuses, top-ups), in minor units. */
  extra: number;
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
  /**
   * Income that counts for this month: entries logged for a source and this month (whatever their
   * date, so a salary paid early counts for the month it's for) plus other income dated this month.
   */
  received: number;
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
  const statuses = incomeStatuses(activeIncomes, live(input.transactions), month, todayDay, allIncomes);
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
    received: incomeReceived(allIncomes, transactions, month),
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

/**
 * Entries logged for a source start with its id and the month they count for (YYYYMM), then "x" for
 * extra money (a bonus, a top-up) or anything else for the month's payment, then a random suffix (so
 * logging again after an undo isn't blocked by the tombstone). The month can differ from the entry's
 * date: a salary paid on 30 Nov can count for December.
 */
export function incomeEntryPrefix(incomeId: string, month: string): string {
  return `${incomeId}${month.replace("-", "")}`;
}

export function incomeEntryId(incomeId: string, month: string, extra = false): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${incomeEntryPrefix(incomeId, month)}${extra ? "x" : "p"}${rand}`.slice(0, 40);
}

/** Which source, month and kind an entry was logged for, or null for income logged any other way. */
export function incomeEntryLink(
  t: Pick<Transaction, "id" | "kind">,
  incomes: Pick<IncomeSource, "id">[],
): { incomeId: string; month: string; extra: boolean } | null {
  if (t.kind !== "income") return null;
  for (const i of incomes) {
    if (!t.id.startsWith(i.id)) continue;
    const ym = t.id.slice(i.id.length, i.id.length + 6);
    if (!/^\d{6}$/.test(ym)) continue;
    return { incomeId: i.id, month: `${ym.slice(0, 4)}-${ym.slice(4)}`, extra: t.id[i.id.length + 6] === "x" };
  }
  return null;
}

/**
 * Each source's status for `month`. Entries logged for a source and month count for it, whatever their
 * date. Any other income dated that month counts as a source's payment when it's within 10% of the
 * amount (closest first, each entry once). `all` is every source, so entries logged for one that isn't
 * paying this month are never mistaken for another's.
 */
export function incomeStatuses(
  incomes: IncomeSource[],
  transactions: Transaction[],
  month: string,
  todayDay: Day,
  all: IncomeSource[] = incomes,
): Map<string, IncomeStatus> {
  const income = transactions.filter((t) => t.kind === "income" && t.deletedAt == null);
  const links = new Map(income.map((t) => [t.id, incomeEntryLink(t, all)]));
  const loose = income.filter((t) => !links.get(t.id) && monthOf(t.date) === month);
  const out = new Map<string, IncomeStatus>();
  for (const i of incomes) {
    const day = incomeDayIn(i, month);
    const expectedDate = day != null ? `${month}-${String(day).padStart(2, "0")}` : null;
    let received = 0;
    let extra = 0;
    for (const t of income) {
      const l = links.get(t.id);
      if (l?.incomeId !== i.id || l.month !== month) continue;
      if (l.extra) extra += t.amount;
      else received += t.amount;
    }
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
      extra,
    });
  }
  return out;
}

/** Income that counts for `month`: entries logged for it, plus other income dated in it. */
export function incomeReceived(incomes: IncomeSource[], transactions: Transaction[], month: string): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.kind !== "income" || t.deletedAt != null) continue;
    const l = incomeEntryLink(t, incomes);
    if (l ? l.month === month : monthOf(t.date) === month) sum += t.amount;
  }
  return sum;
}

/** A short id for an income source (settings hold them as a list). */
export function incomeId(): string {
  return `inc${Math.random().toString(36).slice(2, 10)}`;
}
