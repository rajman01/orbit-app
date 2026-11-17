import { describe, expect, it } from "vitest";
import {
  accountBalance,
  addMonthsTo,
  daysInMonth,
  formatMoney,
  minorPerMajor,
  monthSummary,
  parseAmount,
  spendByCategory,
  transactionLabel,
  type Account,
  type Transaction,
} from "@/features/money/model";
import { parseMoney } from "@/features/money/parse";

const tx = (partial: Partial<Transaction> & { amount: number; date: string }): Transaction =>
  ({
    id: Math.random().toString(36).slice(2),
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

describe("money amounts (5A, D47)", () => {
  it("keeps amounts in minor units and formats them in the chosen currency", () => {
    expect(minorPerMajor("NGN")).toBe(100);
    expect(minorPerMajor("JPY")).toBe(1);
    expect(parseAmount("12.50", "GBP")).toBe(1250);
    expect(parseAmount("12,500", "NGN")).toBe(1250000);
    expect(parseAmount("₦1,234.5", "NGN")).toBe(123450);
    expect(parseAmount("abc", "GBP")).toBeNull();
    expect(parseAmount("0", "GBP")).toBeNull();
    expect(formatMoney(1250, "GBP", { locale: "en-GB" })).toBe("£12.50");
    expect(formatMoney(250000, "USD", { compact: true, locale: "en-US" })).toBe("$2,500");
    expect(formatMoney(-420, "USD", { sign: true, locale: "en-US" })).toBe("-$4.20");
    expect(formatMoney(420, "USD", { sign: true, locale: "en-US" })).toBe("+$4.20");
  });

  it("knows its months", () => {
    expect(addMonthsTo("2026-11", 1)).toBe("2026-12");
    expect(addMonthsTo("2026-11", 2)).toBe("2027-01");
    expect(addMonthsTo("2026-01", -1)).toBe("2025-12");
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("the ledger (5A, D50)", () => {
  const rows = [
    tx({ kind: "income", amount: 250000, date: "2026-11-01", categoryId: "salary" }),
    tx({ amount: 1250, date: "2026-11-03", categoryId: "food" }),
    tx({ amount: 3000, date: "2026-11-05", categoryId: "food" }),
    tx({ amount: 8000, date: "2026-11-09", categoryId: "transport", accountId: "bank" }),
    tx({ kind: "transfer", amount: 50000, date: "2026-11-10", accountId: "bank", toAccountId: "cash" }),
    tx({ amount: 999, date: "2026-10-30" }),
    tx({ amount: 777, date: "2026-11-12", deletedAt: 5 }),
  ];

  it("sums a month's money in and out, ignoring transfers, other months and deleted rows", () => {
    expect(monthSummary(rows, "2026-11")).toEqual({ income: 250000, expense: 12250, net: 237750 });
    expect(monthSummary(rows, "2026-10")).toEqual({ income: 0, expense: 999, net: -999 });
  });

  it("groups spending by category, largest first, with uncategorised under null", () => {
    expect(spendByCategory(rows, "2026-11")).toEqual([
      { categoryId: "transport", amount: 8000 },
      { categoryId: "food", amount: 4250 },
    ]);
    expect(spendByCategory(rows, "2026-10")).toEqual([{ categoryId: null, amount: 999 }]);
  });

  it("works out an account's balance from its opening balance and what went through it", () => {
    const bank = { id: "bank", openingBalance: 100000 } as Account;
    const cash = { id: "cash", openingBalance: 0 } as Account;
    expect(accountBalance(bank, rows)).toBe(100000 - 8000 - 50000);
    expect(accountBalance(cash, rows)).toBe(50000);
    expect(accountBalance(bank, rows, "2026-11-09")).toBe(92000);
  });

  it("labels a row by its note, else its category, pot, debt or transfer", () => {
    const lookup = { category: () => "Food & drink", account: () => "Cash" };
    expect(transactionLabel(tx({ amount: 1, date: "2026-11-01", note: "Lunch" }), lookup)).toBe("Lunch");
    expect(transactionLabel(tx({ amount: 1, date: "2026-11-01", categoryId: "f" }), lookup)).toBe("Food & drink");
    expect(transactionLabel(tx({ amount: 1, date: "2026-11-01", kind: "transfer", toAccountId: "c" }), lookup)).toBe(
      "Transfer to Cash",
    );
    expect(transactionLabel(tx({ amount: 1, date: "2026-11-01", kind: "income" }), {})).toBe("Income");
  });
});

describe("money typed in a hurry (5A)", () => {
  const ctx = {
    currency: "NGN",
    categories: [
      { id: "food", name: "Food & drink", kind: "expense" as const },
      { id: "transport", name: "Transport", kind: "expense" as const },
      { id: "salary", name: "Salary", kind: "income" as const },
    ],
    timezone: "UTC",
    now: new Date("2026-11-17T12:00:00Z"),
  };

  it("reads spending from a money word, a sign or a currency symbol", () => {
    expect(parseMoney("spent 12.50 lunch", ctx)).toMatchObject({ kind: "expense", amount: 1250, note: "lunch" });
    expect(parseMoney("paid 3,000 rent", ctx)).toMatchObject({ kind: "expense", amount: 300000, note: "rent" });
    expect(parseMoney("-450 taxi", ctx)).toMatchObject({ kind: "expense", amount: 45000, note: "taxi" });
    expect(parseMoney("₦2,500 taxi", ctx)).toMatchObject({ kind: "expense", amount: 250000, note: "taxi" });
    expect(parseMoney("bought 15k shoes", ctx)).toMatchObject({ kind: "expense", amount: 1500000, note: "shoes" });
  });

  it("reads income, categories and days", () => {
    expect(parseMoney("+250000 salary", ctx)).toMatchObject({ kind: "income", amount: 25000000, note: "salary" });
    expect(parseMoney("got 40 from Tunde", ctx)).toMatchObject({ kind: "income", amount: 4000, note: "Tunde" });
    const tagged = parseMoney("spent 12.5 #food yesterday", ctx)!;
    expect(tagged).toMatchObject({
      amount: 1250,
      categoryId: "food",
      categoryLabel: "Food & drink",
      date: "2026-11-16",
    });
    expect(tagged.note).toBe("");
    expect(tagged.tokens.map((t) => t.kind)).toEqual(["amount", "category", "date"]);
    // A bare number is money only with a category tag; income tags match income categories.
    expect(parseMoney("12.5 #food", ctx)).toMatchObject({ kind: "expense", amount: 1250, categoryId: "food" });
    expect(parseMoney("received 500 #sal", ctx)).toMatchObject({ kind: "income", categoryId: "salary" });
  });

  it("leaves tasks alone", () => {
    expect(parseMoney("Call the bank tomorrow", ctx)).toBeNull();
    expect(parseMoney("Buy 3 notebooks", ctx)).toBeNull();
    expect(parseMoney("Pay rent 3000 tomorrow", ctx)).toBeNull();
    expect(parseMoney("Review budget for November", ctx)).toBeNull();
    expect(parseMoney("Read 20 pages", ctx)).toBeNull();
    expect(parseMoney("", ctx)).toBeNull();
  });
});
