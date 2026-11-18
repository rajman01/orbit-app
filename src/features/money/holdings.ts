import type { Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { accountBalance, addMonthsTo, monthOf, type Account, type Transaction } from "./model";
import { debtState, type Debt } from "./debts";
import { lastDayOf, potBalance, type Pot } from "./pots";

/**
 * 5E (D49): what you hold, and what it's all worth. A holding with a symbol is priced by the
 * server (price in the main currency, per unit); anything else is valued by hand.
 */

export type Holding = SyncedDoc<"holdings">;
export type HoldingFields = EntityFields<"holdings">;
export type HoldingValue = SyncedDoc<"holdingValues">;

export const HOLDING_TYPE_LABEL: Record<HoldingFields["type"], string> = {
  stock: "Stock",
  etf: "ETF or fund",
  crypto: "Crypto",
  cash: "Cash or deposit",
  property: "Property",
  other: "Other",
};

export function newHoldingFields(partial: Partial<HoldingFields> & { name: string }): HoldingFields {
  return {
    type: "stock",
    symbol: null,
    quantity: 1,
    costBasis: 0,
    manualValue: null,
    price: null,
    priceCurrency: null,
    priceAt: null,
    accountId: null,
    note: "",
    archivedAt: null,
    order: Date.now(),
    ...partial,
  };
}

export function holdingValueId(holdingId: string, month: string): string {
  return `hv${month.replace("-", "")}${holdingId}`.slice(0, 40);
}

/** Priced holdings are worth quantity × price (when the price is in the main currency); else the hand value, else cost. */
export function holdingValue(
  h: Pick<Holding, "quantity" | "price" | "priceCurrency" | "manualValue" | "costBasis">,
  currency: string,
): number {
  if (h.price != null && h.priceCurrency === currency) return Math.round(h.quantity * h.price * 100);
  if (h.manualValue != null) return h.manualValue;
  return h.costBasis;
}

export interface HoldingSummary {
  value: number;
  cost: number;
  gain: number;
  /** Gain as a share of cost, null without a cost. */
  gainPct: number | null;
  priced: boolean;
}

export function holdingSummary(h: Holding, currency: string): HoldingSummary {
  const value = holdingValue(h, currency);
  const gain = value - h.costBasis;
  return {
    value,
    cost: h.costBasis,
    gain,
    gainPct: h.costBasis ? gain / h.costBasis : null,
    priced: h.price != null && h.priceCurrency === currency,
  };
}

/** Value by type, largest first, for the allocation bars. */
export function allocation(
  holdings: Holding[],
  currency: string,
): { type: HoldingFields["type"]; value: number; share: number }[] {
  const live = holdings.filter((h) => h.deletedAt == null && h.archivedAt == null);
  const total = live.reduce((s, h) => s + holdingValue(h, currency), 0);
  const byType = new Map<HoldingFields["type"], number>();
  for (const h of live) byType.set(h.type, (byType.get(h.type) ?? 0) + holdingValue(h, currency));
  return [...byType.entries()]
    .map(([type, value]) => ({ type, value, share: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface NetWorth {
  total: number;
  accounts: number;
  pots: number;
  holdings: number;
  owed: number;
  debts: number;
}

export function netWorth(
  input: {
    accounts: Account[];
    pots: Pot[];
    debts: Debt[];
    holdings: Holding[];
    transactions: Transaction[];
  },
  currency: string,
  todayDay: Day,
): NetWorth {
  const live = <T extends { deletedAt: number | null; archivedAt: number | null }>(rows: T[]) =>
    rows.filter((r) => r.deletedAt == null && r.archivedAt == null);
  const accounts = live(input.accounts).reduce((s, a) => s + accountBalance(a, input.transactions, todayDay), 0);
  const pots = live(input.pots).reduce((s, p) => s + potBalance(p.id, input.transactions, todayDay), 0);
  const holdings = live(input.holdings).reduce((s, h) => s + holdingValue(h, currency), 0);
  let owed = 0;
  let debts = 0;
  for (const d of live(input.debts)) {
    if (d.closedAt || d.startDate > todayDay) continue;
    const b = debtState(d, input.transactions, todayDay).balance;
    if (d.direction === "owe") debts += b;
    else owed += b;
  }
  return { total: accounts + pots + holdings + owed - debts, accounts, pots, holdings, owed, debts };
}

/**
 * Net worth at the end of each of the last `n` months (this month as of today). Accounts, pots and
 * debts replay from the ledger; holdings use the value recorded for that month, else the latest
 * earlier one, else their cost; the current month uses the live value.
 */
export function netWorthSeries(
  input: {
    accounts: Account[];
    pots: Pot[];
    debts: Debt[];
    holdings: Holding[];
    holdingValues: HoldingValue[];
    transactions: Transaction[];
  },
  currency: string,
  todayDay: Day,
  n = 12,
): { month: string; total: number }[] {
  const thisMonth = monthOf(todayDay);
  const months = Array.from({ length: n }, (_, i) => addMonthsTo(thisMonth, i - (n - 1)));
  const values = input.holdingValues.filter((v) => v.deletedAt == null);
  return months.map((month) => {
    const day = month === thisMonth ? todayDay : lastDayOf(month);
    if (month === thisMonth) return { month, total: netWorth(input, currency, day).total };
    const base = netWorth({ ...input, holdings: [] }, currency, day).total;
    let holdings = 0;
    for (const h of input.holdings) {
      if (h.deletedAt != null || h.archivedAt != null) continue;
      if (monthOf(dayOfMs(h.createdAt)) > month) continue;
      const recorded = values
        .filter((v) => v.holdingId === h.id && v.month <= month)
        .sort((a, b) => b.month.localeCompare(a.month))[0];
      holdings += recorded ? recorded.value : h.costBasis;
    }
    return { month, total: base + holdings };
  });
}

function dayOfMs(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}
