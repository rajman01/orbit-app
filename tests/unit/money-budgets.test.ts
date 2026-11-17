import { describe, expect, it } from "vitest";
import { budgetFor, budgetId, budgetStatuses, type Budget } from "@/features/money/budgets";
import { inOutByMonth, rangeSummary, type Transaction } from "@/features/money/model";
import { dueOccurrences, instanceFields, occurrencesUntil, upcomingOccurrences } from "@/features/money/recurring";
import { dueNotifications } from "@/features/reminders/model";

const tx = (partial: Partial<Transaction> & { amount: number; date: string }): Transaction =>
  ({
    id: partial.id ?? Math.random().toString(36).slice(2, 14),
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
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    serverVersion: 0,
    ...partial,
  }) as Transaction;
const budget = (month: string, categoryId: string | null, amount: number): Budget =>
  ({ id: budgetId("u", month, categoryId), month, categoryId, amount, deletedAt: null }) as Budget;

describe("budgets with pace (5B)", () => {
  const budgets = [budget("*", "food", 40000), budget("2026-11", "food", 50000), budget("*", null, 200000)];
  const rows = [
    tx({ amount: 20000, date: "2026-11-10", categoryId: "food" }),
    tx({ amount: 5000, date: "2026-11-12", categoryId: "food" }),
    tx({ amount: 30000, date: "2026-11-05", categoryId: "transport" }),
    tx({ amount: 99999, date: "2026-10-05", categoryId: "food" }),
  ];

  it("has one fixed id per month and category, and a month's own row beats the every-month one", () => {
    expect(budgetId("user1", "2026-11", "food")).toMatch(/^[0-9A-Za-z]{10,40}$/);
    expect(budgetId("user1", "*", null)).toMatch(/^[0-9A-Za-z]{10,40}$/);
    expect(budgetId("user1", "2026-11", "food")).not.toBe(budgetId("user1", "2026-12", "food"));
    expect(budgetFor(budgets, "2026-11", "food")?.amount).toBe(50000);
    expect(budgetFor(budgets, "2026-12", "food")?.amount).toBe(40000);
    expect(budgetFor(budgets, "2026-12", "transport")).toBeNull();
  });

  it("says how each budget is going against how far through the month it is", () => {
    // Day 15 of 30: half the month gone.
    const s = budgetStatuses(budgets, rows, "2026-11", "2026-11-15");
    expect(s.map((x) => x.categoryId)).toEqual([null, "food"]);
    expect(s[0]).toMatchObject({ spent: 55000, elapsed: 0.5, pace: "under", left: 145000 });
    expect(s[1]).toMatchObject({ spent: 25000, used: 0.5, pace: "on" });
    // Day 3: the same spending is well ahead of pace; more than the budget is blown.
    expect(budgetStatuses(budgets, rows, "2026-11", "2026-11-03")[1].pace).toBe("over");
    expect(
      budgetStatuses(
        budgets,
        [tx({ amount: 60000, date: "2026-11-02", categoryId: "food" })],
        "2026-11",
        "2026-11-03",
      )[1],
    ).toMatchObject({
      pace: "blown",
      left: -10000,
    });
    // A past month is fully elapsed; a future one not at all.
    expect(budgetStatuses(budgets, rows, "2026-10", "2026-11-15")[1]).toMatchObject({ elapsed: 1, pace: "blown" });
    expect(budgetStatuses(budgets, rows, "2026-12", "2026-11-15")[1]).toMatchObject({
      elapsed: 0,
      spent: 0,
      pace: "on",
    });
  });
});

describe("recurring money (5B)", () => {
  const rent = tx({
    id: "rent000000001",
    amount: 300000,
    date: "2026-09-01",
    note: "Rent",
    recurrence: { freq: "monthly", interval: 1, mode: "fixed" },
  });

  it("lists the dates a template comes round, after its own", () => {
    expect(occurrencesUntil(rent, "2026-11-17")).toEqual(["2026-10-01", "2026-11-01"]);
    expect(occurrencesUntil(tx({ amount: 1, date: "2026-11-01" }), "2026-12-01")).toEqual([]);
  });

  it("is due until confirmed or skipped, by a fixed id, and never for an instance", () => {
    const due = dueOccurrences([rent], "2026-11-17");
    expect(due.map((d) => d.date)).toEqual(["2026-10-01", "2026-11-01"]);
    expect(due[0].id).toBe("rent00000000120261001");
    const confirmed = tx({ ...instanceFields(rent, "2026-10-01"), id: due[0].id });
    expect(confirmed).toMatchObject({ amount: 300000, note: "Rent", recurrence: null, recurrenceParentId: rent.id });
    const skipped = tx({ ...instanceFields(rent, "2026-11-01"), id: due[1].id, deletedAt: 5 });
    expect(dueOccurrences([rent, confirmed, skipped], "2026-11-17")).toEqual([]);
    // The oldest three at most, so an old template doesn't flood the page.
    const old = tx({ amount: 1, date: "2025-01-01", recurrence: { freq: "weekly", interval: 1, mode: "fixed" } });
    expect(dueOccurrences([old], "2026-11-17")).toHaveLength(3);
  });

  it("knows what's coming up in the next two weeks", () => {
    expect(upcomingOccurrences([rent], "2026-11-20").map((d) => d.date)).toEqual(["2026-12-01"]);
    expect(upcomingOccurrences([rent], "2026-11-10")).toEqual([]);
  });
});

describe("money over time (5B)", () => {
  const rows = [
    tx({ kind: "income", amount: 500000, date: "2026-10-01" }),
    tx({ amount: 12000, date: "2026-10-15", categoryId: "food" }),
    tx({ amount: 30000, date: "2026-11-02", categoryId: "transport" }),
    tx({ amount: 8000, date: "2026-11-16", categoryId: "food" }),
  ];
  it("gives six months of in and out, oldest first", () => {
    const series = inOutByMonth(rows, "2026-11");
    expect(series.map((r) => r.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(series[4]).toMatchObject({ income: 500000, expense: 12000 });
    expect(series[5]).toMatchObject({ income: 0, expense: 38000 });
  });
  it("sums a week and names the category spent on most", () => {
    expect(rangeSummary(rows, "2026-11-10", "2026-11-16")).toEqual({
      income: 0,
      expense: 8000,
      topCategoryId: "food",
      topAmount: 8000,
    });
    expect(rangeSummary(rows, "2026-11-01", "2026-11-30").topCategoryId).toBe("transport");
  });
});

describe("the Shutdown nudge (5B)", () => {
  const at = (time: string) => Date.parse(`2026-11-17T${time}:00Z`);
  const base = {
    settings: { timezone: "UTC", ritualTimes: { plan: "07:30", shutdown: "21:00", review: "18:00" } },
    rituals: [],
    cycles: [],
    habits: [],
    habitLogs: [],
    reminders: [],
    dueTodayCount: 0,
    sent: new Set<string>(),
  };
  const keys = (opts: Partial<Parameters<typeof dueNotifications>[0]>) =>
    dueNotifications({ ...base, now: at("21:05"), ...opts }).map((n) => n.key);

  it("nudges at Shutdown time when Money is used but nothing was logged today", () => {
    expect(keys({ money: { today: 0, recent: 4 } })).toContain("money:2026-11-17");
    expect(keys({ money: { today: 1, recent: 4 } })).not.toContain("money:2026-11-17");
    expect(keys({ money: { today: 0, recent: 0 } })).not.toContain("money:2026-11-17");
    expect(keys({ money: null })).not.toContain("money:2026-11-17");
    expect(
      keys({ money: { today: 0, recent: 4 }, settings: { ...base.settings, notify: { money: false } as never } }),
    ).not.toContain("money:2026-11-17");
    expect(
      dueNotifications({ ...base, now: at("15:00"), money: { today: 0, recent: 4 } }).map((n) => n.key),
    ).not.toContain("money:2026-11-17");
  });
});
