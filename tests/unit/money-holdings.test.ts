import { describe, expect, it } from "vitest";
import type { Account, Transaction } from "@/features/money/model";
import type { Debt } from "@/features/money/debts";
import type { Pot } from "@/features/money/pots";
import {
  allocation,
  holdingSummary,
  holdingValue,
  netWorth,
  netWorthSeries,
  type Holding,
  type HoldingValue,
} from "@/features/money/holdings";

const meta = { createdAt: Date.UTC(2026, 5, 1), updatedAt: 1, deletedAt: null, serverVersion: 0 };
const holding = (p: Partial<Holding> & { id: string }): Holding =>
  ({
    name: p.id,
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
    order: 0,
    ...meta,
    ...p,
  }) as Holding;
const tx = (p: Partial<Transaction> & { amount: number; date: string }): Transaction =>
  ({
    id: Math.random().toString(36).slice(2, 14),
    kind: "expense",
    accountId: null,
    toAccountId: null,
    potId: null,
    debtId: null,
    categoryId: null,
    note: "",
    goalId: null,
    recurrence: null,
    recurrenceParentId: null,
    createdBy: "user",
    importHash: null,
    ...meta,
    ...p,
  }) as Transaction;

describe("holdings (5E, D49)", () => {
  it("values a priced holding by quantity × price in the main currency, else by hand, else at cost", () => {
    const btc = holding({
      id: "btc",
      type: "crypto",
      symbol: "bitcoin",
      quantity: 0.5,
      costBasis: 30_000_000_00,
      price: 90_000_000,
      priceCurrency: "NGN",
    });
    expect(holdingValue(btc, "NGN")).toBe(45_000_000_00);
    // A price in another currency (the person switched) doesn't count.
    expect(holdingValue({ ...btc, priceCurrency: "USD" }, "NGN")).toBe(30_000_000_00);
    expect(holdingValue(holding({ id: "flat", type: "property", costBasis: 100, manualValue: 150 }), "NGN")).toBe(150);
    expect(holdingValue(holding({ id: "fd", type: "cash", costBasis: 100 }), "NGN")).toBe(100);
    expect(holdingSummary(btc, "NGN")).toMatchObject({
      value: 45_000_000_00,
      gain: 15_000_000_00,
      gainPct: 0.5,
      priced: true,
    });
    expect(holdingSummary(holding({ id: "x" }), "NGN").gainPct).toBeNull();
  });

  it("spreads holdings by type", () => {
    const rows = [
      holding({ id: "a", type: "stock", costBasis: 300 }),
      holding({ id: "b", type: "stock", costBasis: 100 }),
      holding({ id: "c", type: "property", manualValue: 600 }),
      holding({ id: "d", type: "cash", costBasis: 999, archivedAt: 1 }),
    ];
    expect(allocation(rows, "NGN")).toEqual([
      { type: "property", value: 600, share: 0.6 },
      { type: "stock", value: 400, share: 0.4 },
    ]);
  });

  it("adds up net worth: accounts, pots, holdings and what's owed to you, minus what you owe", () => {
    const accounts = [{ id: "bank", openingBalance: 500_000, archivedAt: null, ...meta } as Account];
    const pots = [{ id: "pot", archivedAt: null, ...meta } as Pot];
    const debts = [
      {
        id: "loan",
        direction: "owe",
        principal: 200_000,
        startDate: "2026-11-01",
        interestRate: null,
        closedAt: null,
        archivedAt: null,
        ...meta,
      } as Debt,
      {
        id: "tunde",
        direction: "owed",
        principal: 50_000,
        startDate: "2026-11-01",
        interestRate: null,
        closedAt: null,
        archivedAt: null,
        ...meta,
      } as Debt,
    ];
    const holdings = [holding({ id: "flat", type: "property", manualValue: 1_000_000 })];
    const transactions = [
      tx({ kind: "transfer", amount: 100_000, date: "2026-11-05", accountId: "bank", potId: "pot" }),
      tx({ kind: "transfer", amount: 20_000, date: "2026-11-06", accountId: "bank", debtId: "loan" }),
    ];
    const nw = netWorth({ accounts, pots, debts, holdings, transactions }, "NGN", "2026-11-18");
    expect(nw).toEqual({
      total: 380_000 + 100_000 + 1_000_000 + 50_000 - 180_000,
      accounts: 380_000,
      pots: 100_000,
      holdings: 1_000_000,
      owed: 50_000,
      debts: 180_000,
    });

    // Over time: earlier months use the recorded value for a holding, or its cost before any.
    const values = [{ id: "v", holdingId: "flat", month: "2026-10", value: 900_000, ...meta } as HoldingValue];
    const series = netWorthSeries(
      { accounts, pots, debts, holdings, holdingValues: values, transactions },
      "NGN",
      "2026-11-18",
      4,
    );
    expect(series.map((s) => s.month)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(series[1].total).toBe(500_000 + 0); // the flat (cost 0) and no debts yet
    expect(series[2].total).toBe(500_000 + 900_000);
    expect(series[3].total).toBe(nw.total);
  });
});
