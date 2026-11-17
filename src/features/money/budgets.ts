import type { SyncedDoc } from "@/lib/sync/entities";
import type { Day } from "@/lib/dates";
import { daysInMonth, monthOf, spendByCategory, type Transaction } from "./model";

/**
 * 5B: budgets with pace. A budget is a monthly limit for one category (or everything, categoryId
 * null). A row for a specific month overrides the "*" row that applies to every month.
 */

export type Budget = SyncedDoc<"budgets">;

/** One fixed id per user, month and category, so two devices never make two (D50 spirit). */
export function budgetId(userId: string, month: string, categoryId: string | null): string {
  return `b${month.replace("-", "").replace("*", "all")}${userId.slice(0, 12)}${(categoryId ?? "all").slice(-12)}`
    .replace(/[^0-9A-Za-z]/g, "")
    .slice(0, 40);
}

/** The budget that applies to a category in a month: the month's own row, else the every-month one. */
export function budgetFor(budgets: Budget[], month: string, categoryId: string | null): Budget | null {
  const live = budgets.filter((b) => b.deletedAt == null && (b.categoryId ?? null) === categoryId);
  return live.find((b) => b.month === month) ?? live.find((b) => b.month === "*") ?? null;
}

export type Pace = "under" | "on" | "over" | "blown";

export interface BudgetStatus {
  categoryId: string | null;
  budget: Budget;
  spent: number;
  /** 0..1+ of the budget used. */
  used: number;
  /** 0..1 of the month gone (1 for a past month, 0 for a future one). */
  elapsed: number;
  pace: Pace;
  /** What's left to spend, negative when over. */
  left: number;
}

/**
 * How each budget is doing in a month. "on" means spending is within 10 points of the share of the
 * month that has passed; "over" means ahead of that; "blown" means past the limit.
 */
export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  month: string,
  todayDay: Day,
): BudgetStatus[] {
  const byCat = new Map(spendByCategory(transactions, month).map((r) => [r.categoryId, r.amount]));
  const total = [...byCat.values()].reduce((s, n) => s + n, 0);
  const elapsed =
    monthOf(todayDay) === month ? Number(todayDay.slice(8, 10)) / daysInMonth(month) : todayDay > `${month}-31` ? 1 : 0;
  const ids = new Set(
    budgets
      .filter((b) => b.deletedAt == null && (b.month === month || b.month === "*"))
      .map((b) => b.categoryId ?? null),
  );
  const out: BudgetStatus[] = [];
  for (const categoryId of ids) {
    const budget = budgetFor(budgets, month, categoryId);
    if (!budget || !budget.amount) continue;
    const spent = categoryId === null ? total : (byCat.get(categoryId) ?? 0);
    const used = spent / budget.amount;
    let pace: Pace = "under";
    if (used >= 1) pace = "blown";
    else if (used > elapsed + 0.1) pace = "over";
    else if (used > elapsed - 0.1) pace = "on";
    out.push({ categoryId, budget, spent, used, elapsed, pace, left: budget.amount - spent });
  }
  // Overall first, then the biggest budgets.
  return out.sort((a, b) =>
    a.categoryId === null ? -1 : b.categoryId === null ? 1 : b.budget.amount - a.budget.amount,
  );
}

export const PACE_LABEL: Record<Pace, string> = {
  under: "Under pace",
  on: "On pace",
  over: "Ahead of pace",
  blown: "Over budget",
};
