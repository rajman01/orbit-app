import { describe, expect, it } from "vitest";
import type { Budget } from "@/features/money/budgets";
import type { Debt } from "@/features/money/debts";
import type { Transaction } from "@/features/money/model";
import { monthlyEquivalent, monthPlan } from "@/features/money/plan";
import type { Pot } from "@/features/money/pots";
import { dueNotifications } from "@/features/reminders/model";

const meta = { createdAt: Date.UTC(2026, 8, 1), updatedAt: 1, deletedAt: null, serverVersion: 0 };
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

describe("the month plan (5H)", () => {
  it("turns a recurring entry into a monthly figure", () => {
    expect(monthlyEquivalent(10000, { freq: "monthly", interval: 1 })).toBe(10000);
    expect(monthlyEquivalent(30000, { freq: "monthly", interval: 3 })).toBe(10000);
    expect(monthlyEquivalent(1200, { freq: "weekly", interval: 1 })).toBe(5200);
    expect(monthlyEquivalent(1200, { freq: "weekly", interval: 2 })).toBe(2600);
  });

  it("adds up income against bills, budgets, savings and debt minimums, and says what's left", () => {
    const settings = {
      currency: "NGN",
      money: {
        monthStartDay: 1,
        incomes: [
          { id: "a", name: "Salary", amount: 80_000_000, day: 25 },
          { id: "b", name: "Freelance", amount: 10_000_000, day: null },
        ],
      },
    };
    const transactions = [
      tx({
        amount: 30_000_000,
        date: "2026-10-01",
        note: "Rent",
        recurrence: { freq: "monthly", interval: 1, mode: "fixed" },
      }),
      tx({
        amount: 450_000,
        date: "2026-11-02",
        note: "Spotify",
        categoryId: "subs",
        recurrence: { freq: "monthly", interval: 1, mode: "fixed" },
      }),
      tx({ amount: 1_250_000, date: "2026-11-10", categoryId: "food" }),
      tx({ kind: "income", amount: 80_000_000, date: "2026-11-25" }),
    ];
    const budgets = [
      { id: "bf", month: "*", categoryId: "food", amount: 6_000_000, ...meta } as Budget,
      { id: "ball", month: "*", categoryId: null, amount: 50_000_000, ...meta } as Budget,
    ];
    const pots = [
      {
        id: "p1",
        name: "Canada",
        target: 100_000_000,
        targetDate: null,
        monthly: 15_000_000,
        archivedAt: null,
        ...meta,
      } as Pot,
      {
        id: "p2",
        name: "Laptop",
        target: 60_000_000,
        targetDate: "2027-05-31",
        monthly: null,
        archivedAt: null,
        ...meta,
      } as Pot,
    ];
    const debts = [
      {
        id: "d1",
        name: "Car loan",
        direction: "owe",
        principal: 120_000_000,
        startDate: "2026-09-01",
        interestRate: null,
        minimumPayment: 4_000_000,
        closedAt: null,
        archivedAt: null,
        ...meta,
      } as Debt,
    ];
    const plan = monthPlan(
      {
        settings,
        transactions,
        budgets,
        pots,
        debts,
        categories: [
          { id: "food", name: "Food & drink" },
          { id: "subs", name: "Subscriptions" },
        ],
      },
      "2026-11-18",
    );
    expect(plan.income).toBe(90_000_000);
    expect(plan.fixed.map((f) => [f.name, f.amount])).toEqual([
      ["Rent", 30_000_000],
      ["Spotify", 450_000],
    ]);
    // The overall budget isn't a cost on its own.
    expect(plan.budgets.map((b) => [b.name, b.amount])).toEqual([["Food & drink", 6_000_000]]);
    // A chosen monthly amount, else what the date needs (60,000,000 over 7 months, rounded up to whole naira).
    expect(plan.savings.map((s) => [s.name, s.amount, s.note])).toEqual([
      ["Canada", 15_000_000, "chosen"],
      ["Laptop", 8_571_500, "to make the date"],
    ]);
    expect(plan.debts).toEqual([{ id: "d1", name: "Car loan", amount: 4_000_000, note: "minimum" }]);
    expect(plan.left).toBe(90_000_000 - 30_450_000 - 6_000_000 - 23_571_500 - 4_000_000);
    expect(plan.actual).toEqual({ income: 80_000_000, expense: 1_700_000 });
    // Without income the plan still lists what's spoken for.
    expect(
      monthPlan({ settings: { currency: "NGN" }, transactions, budgets, pots, debts, categories: [] }, "2026-11-18")
        .income,
    ).toBe(0);
  });

  it("reminds on payday at Daily Plan time", () => {
    const base = {
      now: Date.parse("2026-11-25T07:40:00Z"),
      settings: { timezone: "UTC", ritualTimes: { plan: "07:30", shutdown: "21:00", review: "18:00" } },
      rituals: [],
      cycles: [],
      habits: [],
      habitLogs: [],
      reminders: [],
      dueTodayCount: 0,
      sent: new Set<string>(),
    };
    const n = dueNotifications({
      ...base,
      incomeDue: [{ id: "a", name: "Salary", amount: 80_000_000, currency: "NGN" }],
    }).find((x) => x.key === "income:a:2026-11-25");
    expect(n?.title).toBe("Salary lands today");
    expect(n?.body).toContain("₦800,000");
    expect(n?.url).toBe("/money?tab=plan");
  });
});
