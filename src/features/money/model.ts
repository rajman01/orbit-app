import type { Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import type { AreaColor } from "@/features/areas/model";

/**
 * Phase 5 (Money): pure helpers shared by the pages, the coach and the tests. Amounts are integers
 * in the currency's minor unit (D47): 1250 is £12.50, ₦12.50 or $12.50.
 */

export type Account = SyncedDoc<"accounts">;
export type AccountFields = EntityFields<"accounts">;
export type Category = SyncedDoc<"categories">;
export type CategoryFields = EntityFields<"categories">;
export type Transaction = SyncedDoc<"transactions">;
export type TransactionFields = EntityFields<"transactions">;
export type TransactionKind = TransactionFields["kind"];

/* ---------- currency ---------- */

/** Currencies offered in Settings; any ISO code works, these are just the quick picks. */
export const CURRENCIES = [
  ["NGN", "Nigerian naira"],
  ["USD", "US dollar"],
  ["GBP", "British pound"],
  ["EUR", "Euro"],
  ["CAD", "Canadian dollar"],
  ["GHS", "Ghanaian cedi"],
  ["KES", "Kenyan shilling"],
  ["ZAR", "South African rand"],
  ["INR", "Indian rupee"],
  ["AED", "UAE dirham"],
] as const;

/** The currency to start with: naira (the owner's), whatever the device says. */
export const DEFAULT_CURRENCY = "NGN";

/** The currency the device's locale suggests, or USD; offered as a hint in Settings. */
export function deviceCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const byRegion: Record<string, string> = {
      NG: "NGN",
      GB: "GBP",
      US: "USD",
      CA: "CAD",
      GH: "GHS",
      KE: "KES",
      ZA: "ZAR",
      IN: "INR",
      AE: "AED",
      IE: "EUR",
      DE: "EUR",
      FR: "EUR",
      NL: "EUR",
      ES: "EUR",
      IT: "EUR",
    };
    return (region && byRegion[region]) || "USD";
  } catch {
    return "USD";
  }
}

/** How many minor units make one major unit (100 nearly everywhere; JPY and a few others have none). */
export function minorPerMajor(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    return 10 ** (digits ?? 2);
  } catch {
    return 100;
  }
}

/** "₦12,500.00", "-£4.20"; `compact` drops the pennies when the amount is whole. */
export function formatMoney(
  minor: number,
  currency: string,
  opts: { compact?: boolean; sign?: boolean; locale?: string } = {},
): string {
  const per = minorPerMajor(currency);
  const value = minor / per;
  const whole = Number.isInteger(value);
  try {
    const f = new Intl.NumberFormat(opts.locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: opts.compact && whole ? 0 : undefined,
      maximumFractionDigits: opts.compact && whole ? 0 : undefined,
      signDisplay: opts.sign ? "exceptZero" : "auto",
    });
    return f.format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** "12.50" or "12,500" typed by a person → minor units, or null when it isn't an amount. */
export function parseAmount(text: string, currency: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").replace(/^[^\d.]+|[^\d.]+$/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const per = minorPerMajor(currency);
  const value = Math.round(Number(cleaned) * per);
  return value > 0 ? value : null;
}

/** Minor units → the number people type ("12.5"), for form fields. */
export function toMajor(minor: number, currency: string): number {
  return minor / minorPerMajor(currency);
}

/* ---------- categories ---------- */

export interface CategoryPreset {
  slug: string;
  name: string;
  icon: string;
  color: AreaColor;
  kind: "expense" | "income";
}

/** The starting set; a person can rename, recolour or archive any of them and add their own. */
export const CATEGORY_PRESETS: CategoryPreset[] = [
  { slug: "food", name: "Food & drink", icon: "utensils", color: "orange", kind: "expense" },
  { slug: "groceries", name: "Groceries", icon: "shopping-basket", color: "green", kind: "expense" },
  { slug: "transport", name: "Transport", icon: "car", color: "blue", kind: "expense" },
  { slug: "housing", name: "Housing", icon: "home", color: "brown", kind: "expense" },
  { slug: "bills", name: "Bills & utilities", icon: "receipt", color: "cyan", kind: "expense" },
  { slug: "health", name: "Health", icon: "heart-pulse", color: "pink", kind: "expense" },
  { slug: "shopping", name: "Shopping", icon: "shopping-bag", color: "purple", kind: "expense" },
  { slug: "fun", name: "Fun", icon: "sparkles", color: "yellow", kind: "expense" },
  { slug: "family", name: "Family & giving", icon: "users", color: "mint", kind: "expense" },
  { slug: "learning", name: "Learning", icon: "graduation-cap", color: "indigo", kind: "expense" },
  { slug: "subscriptions", name: "Subscriptions", icon: "repeat", color: "indigo", kind: "expense" },
  { slug: "other", name: "Other", icon: "circle", color: "brown", kind: "expense" },
  { slug: "salary", name: "Salary", icon: "briefcase", color: "green", kind: "income" },
  { slug: "freelance", name: "Freelance & side income", icon: "laptop", color: "cyan", kind: "income" },
  { slug: "gifts", name: "Gifts & other income", icon: "gift", color: "pink", kind: "income" },
];

export function presetCategoryId(userId: string, slug: string): string {
  return `c${userId}${slug}`.slice(0, 40);
}

export function newCategoryFields(partial: Partial<CategoryFields> & { name: string }): CategoryFields {
  return { icon: "circle", color: "blue", kind: "expense", archivedAt: null, order: Date.now(), ...partial };
}

export function newAccountFields(partial: Partial<AccountFields> & { name: string; openingDate: Day }): AccountFields {
  return { type: "bank", openingBalance: 0, archivedAt: null, order: Date.now(), ...partial };
}

export function newTransactionFields(
  partial: Partial<TransactionFields> & { amount: number; date: Day },
): TransactionFields {
  return {
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
    ...partial,
  };
}

/* ---------- months and sums ---------- */

/** "2026-11" for a day. */
export const monthOf = (day: Day) => day.slice(0, 7);

export function monthLabel(month: string, opts: { short?: boolean } = {}): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined, {
    month: opts.short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function addMonthsTo(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const live = <T extends { deletedAt: number | null }>(rows: T[]) => rows.filter((r) => r.deletedAt == null);

/** Money in, out and the difference for one month (transfers don't count either way). */
export function monthSummary(transactions: Transaction[], month: string) {
  let income = 0;
  let expense = 0;
  for (const t of live(transactions)) {
    if (monthOf(t.date) !== month) continue;
    if (t.kind === "income") income += t.amount;
    else if (t.kind === "expense") expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/** Spending per category for one month, largest first. Uncategorised spending is under null. */
export function spendByCategory(
  transactions: Transaction[],
  month: string,
): { categoryId: string | null; amount: number }[] {
  const sums = new Map<string | null, number>();
  for (const t of live(transactions)) {
    if (t.kind !== "expense" || monthOf(t.date) !== month) continue;
    sums.set(t.categoryId, (sums.get(t.categoryId) ?? 0) + t.amount);
  }
  return [...sums.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** An account's balance today: what it opened with plus everything that went through it. */
export function accountBalance(account: Account, transactions: Transaction[], upTo?: Day): number {
  let balance = account.openingBalance;
  for (const t of live(transactions)) {
    if (upTo && t.date > upTo) continue;
    if (t.accountId === account.id) {
      if (t.kind === "income") balance += t.amount;
      else balance -= t.amount;
    }
    if (t.kind === "transfer" && t.toAccountId === account.id) balance += t.amount;
  }
  return balance;
}

/** What a transaction does to the person's money: +income, −expense, 0 for a transfer between accounts. */
export function signedAmount(t: Pick<Transaction, "kind" | "amount" | "toAccountId" | "potId" | "debtId">): number {
  if (t.kind === "income") return t.amount;
  if (t.kind === "expense") return -t.amount;
  return 0;
}

export function transactionLabel(
  t: Pick<Transaction, "kind" | "note" | "categoryId" | "potId" | "debtId" | "toAccountId">,
  lookup: {
    category?: (id: string) => string | undefined;
    account?: (id: string) => string | undefined;
    pot?: (id: string) => string | undefined;
    debt?: (id: string) => string | undefined;
  },
): string {
  if (t.note) return t.note;
  if (t.potId) return `To ${lookup.pot?.(t.potId) ?? "a savings pot"}`;
  if (t.debtId) return `Payment: ${lookup.debt?.(t.debtId) ?? "a debt"}`;
  if (t.kind === "transfer")
    return `Transfer${t.toAccountId ? ` to ${lookup.account?.(t.toAccountId) ?? "an account"}` : ""}`;
  if (t.categoryId) return lookup.category?.(t.categoryId) ?? (t.kind === "income" ? "Income" : "Spending");
  return t.kind === "income" ? "Income" : "Spending";
}
