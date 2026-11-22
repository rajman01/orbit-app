import { describe, expect, it } from "vitest";
import { debtState, payoffPlan, suggestedMonthly, type Debt } from "@/features/money/debts";
import { importFields, importRows, parseCsv } from "@/features/money/import";
import type { Transaction } from "@/features/money/model";
import { dueNotifications } from "@/features/reminders/model";

const pay = (debtId: string, amount: number, date: string, toAccountId: string | null = null): Transaction =>
  ({
    id: Math.random().toString(36).slice(2, 14),
    kind: "transfer",
    accountId: toAccountId ? null : "bank",
    toAccountId,
    potId: null,
    debtId,
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
    amount,
    date,
  }) as Transaction;
const debt = (partial: Partial<Debt> & { id: string; principal: number }): Debt =>
  ({
    name: partial.id,
    kind: "loan",
    direction: "owe",
    startDate: "2026-09-01",
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
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    serverVersion: 0,
    ...partial,
  }) as Debt;

describe("a debt's balance (5D, D51)", () => {
  it("takes payments off the principal, and accrues simple monthly interest on what's left", () => {
    const plain = debt({ id: "car", principal: 1_200_000 });
    const rows = [
      pay("car", 100_000, "2026-09-20"),
      pay("car", 100_000, "2026-10-20"),
      pay("car", 999, "2026-10-21", "x"),
    ];
    expect(debtState(plain, rows, "2026-11-18")).toMatchObject({ balance: 999_001, paid: 200_999, interest: 0 });

    // 12% a year = 1% a month, on the balance at each month boundary after the start.
    const loan = debt({ id: "loan", principal: 1_000_000, interestRate: 12 });
    const s = debtState(loan, [pay("loan", 100_000, "2026-10-05")], "2026-11-18");
    // Oct 1: +10,000 → 1,010,000; Oct 5: −100,000 → 910,000; Nov 1: +9,100 → 919,100.
    expect(s).toMatchObject({ balance: 919_100, paid: 100_000, interest: 19_100 });
    // Never below zero.
    expect(debtState(plain, [pay("car", 5_000_000, "2026-10-01")], "2026-11-18").balance).toBe(0);
  });

  it("knows the next due day, and when this month's payment is late", () => {
    const card = debt({ id: "visa", principal: 50_000, dueDay: 5 });
    expect(debtState(card, [], "2026-11-03")).toMatchObject({ nextDue: "2026-11-05", dueIn: 2 });
    expect(debtState(card, [], "2026-11-18")).toMatchObject({ nextDue: "2026-11-05", dueIn: -13 });
    expect(debtState(card, [pay("visa", 5_000, "2026-11-04")], "2026-11-18")).toMatchObject({
      nextDue: "2026-12-05",
      dueIn: 17,
    });
    expect(debtState(debt({ id: "none", principal: 1 }), [], "2026-11-18").nextDue).toBeNull();
    // Due on the last day: 30 Nov, then 31 Dec; 28 Feb in a short month.
    const loan = debt({ id: "loan", principal: 50_000, dueDay: 31 });
    expect(debtState(loan, [], "2026-11-22")).toMatchObject({ nextDue: "2026-11-30", dueIn: 8 });
    expect(debtState(loan, [pay("loan", 5_000, "2026-11-25")], "2026-11-26").nextDue).toBe("2026-12-31");
    expect(debtState(loan, [], "2027-02-10").nextDue).toBe("2027-02-28");
  });
});

describe("the payoff plan (5D)", () => {
  const debts = [
    debt({ id: "card", principal: 300_000, interestRate: 36, minimumPayment: 15_000 }),
    debt({ id: "car", principal: 1_000_000, interestRate: 12, minimumPayment: 40_000 }),
    debt({ id: "mum", principal: 100_000 }),
    debt({ id: "tunde", principal: 50_000, direction: "owed" }),
    debt({ id: "old", principal: 10_000, closedAt: 5 }),
  ];
  const states = new Map(debts.map((d) => [d.id, debtState(d, [], "2026-11-18")]));

  it("orders by interest (avalanche) or size (snowball), clears them one by one, and counts the interest", () => {
    const av = payoffPlan(debts, states, 150_000, "avalanche", "2026-11");
    expect(av.lines.map((l) => l.debt.id)).toEqual(["card", "car", "mum"]);
    expect(av.doneMonth).toBe("2027-10");
    expect(av.months).toBe(11);
    // The card starts at 318,270 (two months of interest since September) and clears third month in.
    expect(av.lines[0].clearMonth).toBe("2027-03");
    expect(av.totalInterest).toBeGreaterThan(0);

    const sn = payoffPlan(debts, states, 150_000, "snowball", "2026-11");
    expect(sn.lines.map((l) => l.debt.id)).toEqual(["mum", "card", "car"]);
    expect(sn.lines[0].clearMonth).toBe("2027-01");
    // Snowball pays more interest here: the 36% card waits.
    expect(sn.totalInterest).toBeGreaterThan(av.totalInterest);
    // More a month: sooner and cheaper.
    const more = payoffPlan(debts, states, 200_000, "avalanche", "2026-11");
    expect(more.months).toBeLessThan(av.months);
    expect(more.totalInterest).toBeLessThan(av.totalInterest);
  });

  it("gives up when the payments can't beat the interest, and suggests a sane monthly amount", () => {
    const stuck = payoffPlan(debts, states, 5_000, "avalanche", "2026-11");
    expect(stuck.doneMonth).toBeNull();
    expect(stuck.months).toBe(Infinity);
    // Minimums (55,000) + 10% = 60,500; total 1,400,000 over 24 months = 58,334 → the larger.
    expect(suggestedMonthly(debts, states)).toBe(60_500);
  });
});

describe("5D elsewhere", () => {
  it("tags an imported row as a payment when a debt's name is in the description", () => {
    const { rows } = importRows(parseCsv("Date,Description,Amount\n2026-11-05,TRF CAR LOAN NOV,-40000"), {
      currency: "NGN",
      categories: [],
      debts: [{ id: "car", name: "Car loan" }],
    });
    expect(rows[0].debtId).toBe("car");
    expect(importFields(rows[0])).toMatchObject({ kind: "transfer", debtId: "car", amount: 4_000_000 });
  });

  it("reminds about a payment due today at Daily Plan time", () => {
    const base = {
      now: Date.parse("2026-11-18T07:40:00Z"),
      settings: { timezone: "UTC", ritualTimes: { plan: "07:30", shutdown: "21:00", review: "18:00" } },
      rituals: [],
      cycles: [],
      habits: [],
      habitLogs: [],
      reminders: [],
      dueTodayCount: 0,
      sent: new Set<string>(),
    };
    const due = [{ id: "car", name: "Car loan", amount: 4_000_000, currency: "NGN" }];
    const n = dueNotifications({ ...base, debtsDue: due }).find((x) => x.key === "debt:car:2026-11-18");
    expect(n?.title).toBe("Car loan: payment due today");
    expect(n?.body).toContain("₦40,000");
    expect(
      dueNotifications({
        ...base,
        debtsDue: due,
        settings: { ...base.settings, notify: { money: false } as never },
      }).some((x) => x.key.startsWith("debt:")),
    ).toBe(false);
  });
});
