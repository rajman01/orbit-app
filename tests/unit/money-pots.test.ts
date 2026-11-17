import { describe, expect, it } from "vitest";
import { importRows, parseCsv, parseDay, rowHash } from "@/features/money/import";
import type { Transaction } from "@/features/money/model";
import { lastDayOf, potBalance, potProjection, type Pot } from "@/features/money/pots";

const tx = (partial: Partial<Transaction> & { amount: number; date: string }): Transaction =>
  ({
    id: Math.random().toString(36).slice(2, 14),
    kind: "transfer",
    accountId: null,
    toAccountId: null,
    potId: "pot1",
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
const pot = (partial: Partial<Pot> = {}): Pot =>
  ({
    id: "pot1",
    name: "Canada fund",
    target: 1_000_000,
    targetDate: null,
    goalId: null,
    keyResultId: null,
    accountId: null,
    note: "",
    archivedAt: null,
    order: 0,
    createdAt: Date.UTC(2026, 8, 1),
    updatedAt: 1,
    deletedAt: null,
    serverVersion: 0,
    ...partial,
  }) as Pot;

describe("savings pots (5C, D48)", () => {
  const rows = [
    tx({ amount: 100000, date: "2026-09-10" }),
    tx({ amount: 100000, date: "2026-10-10" }),
    tx({ amount: 150000, date: "2026-11-05" }),
    tx({ amount: 50000, date: "2026-11-12", toAccountId: "bank" }), // taken out
    tx({ amount: 999, date: "2026-11-13", potId: "other" }),
    tx({ amount: 999, date: "2026-11-14", deletedAt: 3 }),
  ];

  it("balances what went in against what came out", () => {
    expect(potBalance("pot1", rows)).toBe(300000);
    expect(potBalance("pot1", rows, "2026-10-31")).toBe(200000);
  });

  it("projects the month the target is reached at the recent rate, and what a date needs", () => {
    const p = potProjection(pot(), rows, "2026-11-17");
    // Last three months: 100k + 100k + (150k − 50k) = 300k → 100k a month; 700k to go → 7 months.
    expect(p).toMatchObject({ balance: 300000, left: 700000, monthlyRate: 100000, reachMonth: "2027-06", done: false });
    expect(p.neededPerMonth).toBeNull();
    const dated = potProjection(pot({ targetDate: "2027-03-31" }), rows, "2026-11-17");
    expect(dated.monthsLeft).toBe(5);
    expect(dated.neededPerMonth).toBe(140000);
    expect(
      potProjection(
        pot({ target: 1_000_000, targetDate: "2028-08-01" }),
        [tx({ amount: 100000, date: "2026-11-05" })],
        "2026-11-17",
      ).neededPerMonth,
    ).toBe(42900);
    // Reached: nothing more needed.
    expect(potProjection(pot({ target: 250000 }), rows, "2026-11-17")).toMatchObject({
      done: true,
      left: 0,
      neededPerMonth: null,
    });
    // A pot started this month averages over one month, not three.
    const young = potProjection(
      pot({ createdAt: Date.UTC(2026, 10, 2) }),
      [tx({ amount: 60000, date: "2026-11-05" })],
      "2026-11-17",
    );
    expect(young.monthlyRate).toBe(60000);
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
  });
});

describe("importing a statement (5C, FIN-10)", () => {
  const ctx = {
    currency: "NGN",
    categories: [
      { id: "food", name: "Food & drink", kind: "expense" as const },
      { id: "transport", name: "Transport", kind: "expense" as const },
      { id: "salary", name: "Salary", kind: "income" as const },
    ],
  };

  it("reads CSV with quotes, separators and dates in several shapes", () => {
    expect(parseCsv('a,b\n"x, y",2\r\n3,"he said ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", "2"],
      ["3", 'he said "hi"'],
    ]);
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseDay("2026-11-03")).toBe("2026-11-03");
    expect(parseDay("03/11/2026")).toBe("2026-11-03");
    expect(parseDay("11/23/2026")).toBe("2026-11-23");
    expect(parseDay("3 Nov 2026")).toBe("2026-11-03");
    expect(parseDay("not a date")).toBeNull();
  });

  it("turns rows into candidates with a guessed category and a stable hash", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-11-03,UBER TRIP LAGOS,-4500.00",
      "2026-11-04,CHICKEN REPUBLIC FOOD,-3200",
      "2026-11-05,SALARY NOV,250000",
      "2026-11-06,,",
    ].join("\n");
    const { rows, problem } = importRows(parseCsv(csv), ctx);
    expect(problem).toBeNull();
    expect(rows.map((r) => [r.kind, r.amount, r.categoryId])).toEqual([
      ["expense", 450000, null],
      ["expense", 320000, "food"],
      ["income", 25000000, "salary"],
    ]);
    expect(rows[0].hash).toBe(rowHash("2026-11-03", "450000", "expense", "UBER TRIP LAGOS"));
    expect(rows[0].hash).toMatch(/^[0-9A-Za-z]{10,40}$/);
    // Debit and credit columns.
    const two = importRows(
      parseCsv("Date,Narration,Debit,Credit\n01/11/2026,Rent,300000,\n02/11/2026,Refund,,2000"),
      ctx,
    );
    expect(two.rows.map((r) => [r.kind, r.amount, r.date])).toEqual([
      ["expense", 30000000, "2026-11-01"],
      ["income", 200000, "2026-11-02"],
    ]);
    expect(importRows(parseCsv("Foo,Bar\n1,2"), ctx).problem).toMatch(/No date column/);
  });
});
