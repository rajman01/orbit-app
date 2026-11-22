import { describe, expect, it } from "vitest";
import type { Budget } from "@/features/money/budgets";
import type { Debt } from "@/features/money/debts";
import type { Transaction } from "@/features/money/model";
import { incomeTimingLabel, incomesLandingOn } from "@/features/money/income";
import {
  incomeByMonth,
  incomeEntryId,
  incomeEntryLink,
  incomeReceived,
  incomeStatuses,
  monthlyEquivalent,
  monthPlan,
} from "@/features/money/plan";
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

  it("counts income only in the months it comes in: start dates, instalments, one-offs, the last day", () => {
    const incomes = [
      { id: "a", name: "Acumen", amount: 67_600_000, day: 31 },
      { id: "n", name: "Natively", amount: 200_000_000, day: 10, from: "2026-12" },
      { id: "g1", name: "Acada (1st)", amount: 42_500_000, day: 31, from: "2026-11", until: "2026-11" },
      { id: "g", name: "Acada", amount: 42_500_000, day: 20, from: "2027-01", until: "2027-04" },
    ];
    const plan = (month: string) =>
      monthPlan(
        {
          settings: { currency: "NGN", money: { monthStartDay: 1, incomes } },
          transactions: [],
          budgets: [],
          pots: [],
          debts: [],
          categories: [],
        },
        "2026-11-22",
        month,
      );
    expect(plan("2026-11").income).toBe(110_100_000);
    expect(plan("2026-11").otherIncomes.map((i) => i.name)).toEqual(["Natively", "Acada"]);
    expect(plan("2026-12").income).toBe(267_600_000);
    expect(plan("2027-02").income).toBe(310_100_000);
    expect(plan("2027-05").income).toBe(267_600_000);
    expect(incomeByMonth(incomes, "2026-11", 7).map((m) => m.income / 100)).toEqual([
      1_101_000, 2_676_000, 3_101_000, 3_101_000, 3_101_000, 3_101_000, 2_676_000,
    ]);

    // Day 31 lands on the month's last day; day 20 only within its months.
    expect(incomesLandingOn(incomes, "2026-11-30").map((i) => i.id)).toEqual(["a", "g1"]);
    expect(incomesLandingOn(incomes, "2027-02-28").map((i) => i.id)).toEqual(["a"]);
    expect(incomesLandingOn(incomes, "2027-02-20").map((i) => i.id)).toEqual(["g"]);
    expect(incomesLandingOn(incomes, "2026-11-20")).toEqual([]);
    expect(incomesLandingOn(incomes, "2026-11-10")).toEqual([]);
    expect(incomesLandingOn(incomes, "2026-12-10").map((i) => i.id)).toEqual(["n"]);

    expect(incomeTimingLabel(incomes[0])).toBe("on the last day");
    expect(incomeTimingLabel(incomes[1])).toBe("on the 10th · from Dec 2026");
    expect(incomeTimingLabel(incomes[2])).toBe("on the last day · once, Nov 2026");
    expect(incomeTimingLabel(incomes[3])).toBe("on the 20th · Jan–Apr 2027");
  });

  it("says which income has come in: received, expected or late", () => {
    const incomes = [
      { id: "incacumen01", name: "Acumen Salary", amount: 67_600_000, day: 31 },
      { id: "incacada001", name: "Acada (1st)", amount: 42_500_000, day: 31, from: "2026-11", until: "2026-11" },
      { id: "incfree0001", name: "Freelance", amount: 10_000_000, day: 10 },
      { id: "incbonus001", name: "Bonus", amount: 5_000_000, day: null },
    ];
    const status = (txs: Transaction[], today: string) =>
      Object.fromEntries(
        [...incomeStatuses(incomes, txs, "2026-11", today)].map(([id, s]) => [
          id,
          [s.state, s.expectedDate, s.received],
        ]),
      );

    // Before anything lands: day 31 means the 30th in November; past days with nothing logged are late.
    expect(status([], "2026-11-22")).toEqual({
      incacumen01: ["expected", "2026-11-30", 0],
      incacada001: ["expected", "2026-11-30", 0],
      incfree0001: ["late", "2026-11-10", 0],
      incbonus001: ["expected", null, 0],
    });

    // Logged from the plan (by id), even for a different amount; or by hand within 10% of the amount.
    const txs = [
      tx({ id: incomeEntryId("incacumen01", "2026-11"), kind: "income", amount: 60_000_000, date: "2026-11-30" }),
      tx({ kind: "income", amount: 9_500_000, date: "2026-11-12" }),
      tx({ kind: "income", amount: 1_000_000, date: "2026-11-12" }), // too small to be anything
      tx({ kind: "income", amount: 42_500_000, date: "2026-10-31" }), // last month
    ];
    expect(status(txs, "2026-12-01")).toEqual({
      incacumen01: ["received", "2026-11-30", 60_000_000],
      incacada001: ["late", "2026-11-30", 0],
      incfree0001: ["received", "2026-11-10", 9_500_000],
      incbonus001: ["late", null, 0],
    });

    // Next month's payment doesn't count for this month, and a plan entry only for its own source.
    const december = tx({
      id: incomeEntryId("incacumen01", "2026-12"),
      kind: "income",
      amount: 67_600_000,
      date: "2026-12-31",
    });
    const acada = tx({
      id: incomeEntryId("incacada001", "2026-11"),
      kind: "income",
      amount: 67_600_000,
      date: "2026-11-30",
    });
    const s = status([december, acada], "2026-11-22");
    expect(s.incacumen01[0]).toBe("expected");
    expect(s.incacada001[0]).toBe("received");
  });

  it("counts a payment for the month it's for, and extras on top", () => {
    const incomes = [
      { id: "incacumen01", name: "Acumen Salary", amount: 67_600_000, day: 31 },
      { id: "incnative01", name: "Natively Salary", amount: 200_000_000, day: 10, from: "2026-12" },
    ];
    const txs = [
      // December's Natively salary, paid on 30 Nov.
      tx({ id: incomeEntryId("incnative01", "2026-12"), kind: "income", amount: 200_000_000, date: "2026-11-30" }),
      // Acumen paid early in November, and a bonus with it.
      tx({ id: incomeEntryId("incacumen01", "2026-11"), kind: "income", amount: 67_600_000, date: "2026-11-26" }),
      tx({ id: incomeEntryId("incacumen01", "2026-11", true), kind: "income", amount: 15_000_000, date: "2026-11-26" }),
      // Something else entirely.
      tx({ kind: "income", amount: 2_000_000, date: "2026-11-15" }),
    ];
    expect(incomeEntryLink(txs[0], incomes)).toEqual({ incomeId: "incnative01", month: "2026-12", extra: false });
    expect(incomeEntryLink(txs[2], incomes)).toEqual({ incomeId: "incacumen01", month: "2026-11", extra: true });
    expect(incomeEntryLink(txs[3], incomes)).toBeNull();

    const nov = incomeStatuses([incomes[0]], txs, "2026-11", "2026-11-30", incomes);
    expect(nov.get("incacumen01")).toMatchObject({ state: "received", received: 67_600_000, extra: 15_000_000 });
    const dec = incomeStatuses(incomes, txs, "2026-12", "2026-12-15", incomes);
    expect(dec.get("incnative01")).toMatchObject({ state: "received", received: 200_000_000, extra: 0 });
    // Acumen's December payment isn't in yet: November's entries don't count for it.
    expect(dec.get("incacumen01")).toMatchObject({ state: "expected", received: 0 });

    // What counts for each month: the early salary goes to December.
    expect(incomeReceived(incomes, txs, "2026-11")).toBe(67_600_000 + 15_000_000 + 2_000_000);
    expect(incomeReceived(incomes, txs, "2026-12")).toBe(200_000_000);
    const plan = monthPlan(
      {
        settings: { currency: "NGN", money: { monthStartDay: 1, incomes } },
        transactions: txs,
        budgets: [],
        pots: [],
        debts: [],
        categories: [],
      },
      "2026-11-30",
      "2026-12",
    );
    expect(plan.received).toBe(200_000_000);
    expect(plan.actual.income).toBe(0); // cash by date is still November's
  });
});
