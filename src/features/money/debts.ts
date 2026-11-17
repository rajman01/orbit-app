import { daysBetween, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { addMonthsTo, monthOf, type Transaction } from "./model";

/**
 * 5D (D51): debts. A debt you owe ("owe") or money owed to you ("owed"). Payments are transfers
 * with `debtId`: for one you owe, from an account (money leaves you); for one owed to you, into an
 * account (`toAccountId`, money comes back). Interest, when there is any, is simple and accrues
 * monthly on what's left.
 */

export type Debt = SyncedDoc<"debts">;
export type DebtFields = EntityFields<"debts">;

export function newDebtFields(
  partial: Partial<DebtFields> & { name: string; principal: number; startDate: Day },
): DebtFields {
  return {
    kind: "loan",
    direction: "owe",
    interestRate: null,
    minimumPayment: null,
    dueDay: null,
    personId: null,
    goalId: null,
    keyResultId: null,
    accountId: null,
    note: "",
    closedAt: null,
    archivedAt: null,
    order: Date.now(),
    ...partial,
  };
}

export const DEBT_KIND_LABEL: Record<DebtFields["kind"], string> = {
  loan: "Loan",
  card: "Credit card",
  bnpl: "Buy now, pay later",
  person: "Between people",
  other: "Other",
};

export const isPayment = (t: Pick<Transaction, "kind" | "debtId">) => t.kind === "transfer" && t.debtId != null;

/** Payments on a debt up to a day, oldest first. */
export function paymentsOn(debtId: string, transactions: Transaction[], upTo?: Day) {
  return transactions
    .filter((t) => t.deletedAt == null && t.debtId === debtId && isPayment(t) && (!upTo || t.date <= upTo))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface DebtState {
  /** What's left, after interest and payments; 0 when cleared. */
  balance: number;
  paid: number;
  interest: number;
  /** The next due day, if a due day is set and the debt is open. */
  nextDue: Day | null;
  /** Days until the next due day (negative when today is past it and nothing was paid this month). */
  dueIn: number | null;
}

/**
 * Replays the debt month by month from its start: interest on the balance at each month boundary,
 * payments on their days. Simple interest at the annual rate / 12.
 */
export function debtState(debt: Debt, transactions: Transaction[], todayDay: Day): DebtState {
  const payments = paymentsOn(debt.id, transactions, todayDay);
  const rate = (debt.interestRate ?? 0) / 100 / 12;
  let balance = debt.principal;
  let interest = 0;
  let paid = 0;
  let month = monthOf(debt.startDate);
  const last = monthOf(todayDay);
  let i = 0;
  // Payments in the start month come before the first accrual.
  const apply = (m: string) => {
    while (i < payments.length && monthOf(payments[i].date) === m) {
      paid += payments[i].amount;
      balance -= payments[i].amount;
      i++;
    }
  };
  apply(month);
  while (month < last && balance > 0) {
    month = addMonthsTo(month, 1);
    if (rate > 0) {
      const accrued = Math.round(balance * rate);
      interest += accrued;
      balance += accrued;
    }
    apply(month);
  }
  // Anything dated after the replay (shouldn't happen) still counts.
  while (i < payments.length) {
    paid += payments[i].amount;
    balance -= payments[i].amount;
    i++;
  }
  balance = Math.max(0, balance);
  let nextDue: Day | null = null;
  let dueIn: number | null = null;
  if (debt.dueDay && balance > 0 && !debt.closedAt) {
    const paidThisMonth = payments.some((p) => monthOf(p.date) === last);
    const thisMonth = `${last}-${String(debt.dueDay).padStart(2, "0")}`;
    nextDue =
      paidThisMonth || thisMonth < todayDay
        ? `${addMonthsTo(last, 1)}-${String(debt.dueDay).padStart(2, "0")}`
        : thisMonth;
    if (!paidThisMonth && thisMonth < todayDay) nextDue = thisMonth; // overdue this month
    dueIn = daysBetween(todayDay, nextDue);
  }
  return { balance, paid, interest, nextDue, dueIn };
}

/* ---------- the payoff plan ---------- */

export type Strategy = "snowball" | "avalanche";

export interface PlanLine {
  debt: Debt;
  order: number;
  startBalance: number;
  clearMonth: string | null;
  interest: number;
}

export interface PayoffPlan {
  strategy: Strategy;
  monthly: number;
  lines: PlanLine[];
  /** The month the last debt clears, or null when the monthly amount can't beat the interest. */
  doneMonth: string | null;
  months: number;
  totalInterest: number;
}

/**
 * Pays `monthly` across the open debts you owe each month: every debt gets its minimum, the rest
 * goes to the first in order (smallest balance first for snowball, highest rate first for
 * avalanche), rolling on as each clears. Stops after 50 years.
 */
export function payoffPlan(
  debts: Debt[],
  states: Map<string, DebtState>,
  monthly: number,
  strategy: Strategy,
  fromMonth: string,
): PayoffPlan {
  const open = debts
    .filter((d) => d.direction === "owe" && !d.closedAt && !d.archivedAt && (states.get(d.id)?.balance ?? 0) > 0)
    .map((d) => ({ debt: d, balance: states.get(d.id)!.balance, interest: 0, clearMonth: null as string | null }));
  open.sort((a, b) =>
    strategy === "snowball"
      ? a.balance - b.balance || (b.debt.interestRate ?? 0) - (a.debt.interestRate ?? 0)
      : (b.debt.interestRate ?? 0) - (a.debt.interestRate ?? 0) || a.balance - b.balance,
  );
  let month = fromMonth;
  let months = 0;
  let doneMonth: string | null = null;
  for (let step = 0; step < 600 && open.some((o) => o.balance > 0); step++) {
    month = addMonthsTo(month, 1);
    months++;
    // Interest first.
    for (const o of open) {
      if (o.balance <= 0) continue;
      const accrued = Math.round((o.balance * ((o.debt.interestRate ?? 0) / 100)) / 12);
      o.interest += accrued;
      o.balance += accrued;
    }
    let left = monthly;
    // Minimums.
    for (const o of open) {
      if (o.balance <= 0) continue;
      const pay = Math.min(o.balance, o.debt.minimumPayment ?? 0, left);
      o.balance -= pay;
      left -= pay;
    }
    // The rest to the first still open.
    for (const o of open) {
      if (left <= 0) break;
      if (o.balance <= 0) continue;
      const pay = Math.min(o.balance, left);
      o.balance -= pay;
      left -= pay;
    }
    for (const o of open) if (o.balance <= 0 && !o.clearMonth) o.clearMonth = month;
    if (open.every((o) => o.balance <= 0)) {
      doneMonth = month;
      break;
    }
  }
  return {
    strategy,
    monthly,
    lines: open.map((o, i) => ({
      debt: o.debt,
      order: i + 1,
      startBalance: states.get(o.debt.id)!.balance,
      clearMonth: o.clearMonth,
      interest: o.interest,
    })),
    doneMonth,
    months: doneMonth ? months : Infinity,
    totalInterest: open.reduce((s, o) => s + o.interest, 0),
  };
}

/** A sensible starting monthly amount: the minimums plus a tenth, or a 24-month clear of the total. */
export function suggestedMonthly(debts: Debt[], states: Map<string, DebtState>): number {
  const open = debts.filter((d) => d.direction === "owe" && !d.closedAt && !d.archivedAt);
  const mins = open.reduce((s, d) => s + (d.minimumPayment ?? 0), 0);
  const total = open.reduce((s, d) => s + (states.get(d.id)?.balance ?? 0), 0);
  return Math.max(Math.round(mins * 1.1), Math.ceil(total / 24 / 100) * 100);
}
