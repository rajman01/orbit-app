import * as chrono from "chrono-node";
import { dayOf, type Day } from "@/lib/dates";
import { parseAmount } from "./model";

/**
 * Money typed in a hurry, in Quick Add, the coach or the iOS Shortcut (5A):
 *   "spent 12.50 lunch"            → expense 1250, note "lunch"
 *   "12.5 #food yesterday"         → expense 1250, Food & drink, yesterday
 *   "+250000 salary" / "got 40 from Tunde" → income
 *   "paid 3000 rent #housing"      → expense
 *   "₦2,500 taxi"                  → expense (a currency sign counts as "spent")
 * Anything without an amount, or without a money word or sign, isn't money: it stays a task.
 */

export interface MoneyParse {
  kind: "expense" | "income";
  amount: number;
  note: string;
  categoryId: string | null;
  categoryLabel: string | null;
  date: Day | null;
  /** The text that made it money, for the chips. */
  tokens: { kind: "amount" | "category" | "date"; text: string; label: string }[];
}

// Past tense only: "buy milk" and "pay rent" are tasks; "bought" and "paid" are money.
const SPEND = /^(spent|paid|bought|lost|gave)\b/i;
const EARN = /^(got|earned|received|made|income|salary|sold|won|refund|refunded)\b/i;
const SIGN = /^[+-]/;
const CURRENCY = /^(₦|\$|£|€|ngn|usd|gbp|eur|n|k)?\s*[\d,]+(\.\d+)?\s*(k|m)?$/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseMoney(
  input: string,
  ctx: {
    currency: string;
    categories: { id: string; name: string; kind: "expense" | "income" }[];
    timezone: string;
    now?: Date;
  },
): MoneyParse | null {
  const raw = input.trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const tokens: MoneyParse["tokens"] = [];
  let text = raw;
  let kind: MoneyParse["kind"] | null = null;

  // A money word or a sign up front says what it is.
  const verb = text.match(SPEND) ?? text.match(EARN);
  if (verb) {
    kind = SPEND.test(verb[0]) ? "expense" : "income";
    text = text.slice(verb[0].length).trim();
  } else if (SIGN.test(text)) {
    kind = text[0] === "+" ? "income" : "expense";
    text = text.slice(1).trim();
  }

  // The amount: the first word that is a number, maybe with a currency sign or a k/m suffix.
  const words = text.split(" ");
  const at = words.findIndex((w) => CURRENCY.test(w) && /\d/.test(w));
  if (at === -1) return null;
  const word = words[at];
  if (!kind && !/^(₦|\$|£|€|ngn|usd|gbp|eur)/i.test(word)) {
    // A bare number with no money word: only money when a category tag follows ("12.5 #food").
    if (!/\s#/.test(` ${text}`)) return null;
    kind = "expense";
  }
  kind ??= "expense";
  const mult = /k$/i.test(word) ? 1000 : /m$/i.test(word) ? 1_000_000 : 1;
  const amount = parseAmount(word.replace(/^(₦|\$|£|€|ngn|usd|gbp|eur|n)/i, "").replace(/(k|m)$/i, ""), ctx.currency);
  if (amount == null) return null;
  words.splice(at, 1);
  tokens.push({ kind: "amount", text: word, label: String(amount * mult) });
  text = words.join(" ");

  let categoryId: string | null = null;
  let categoryLabel: string | null = null;
  text = ` ${text} `.replace(/\s#([\p{L}\p{N}_&-]+)(?=\s)/gu, (whole, tag: string) => {
    if (categoryId) return whole;
    const match = ctx.categories.find((c) => c.kind === kind && norm(c.name).startsWith(norm(tag)));
    if (!match) return whole;
    categoryId = match.id;
    categoryLabel = match.name;
    tokens.push({ kind: "category", text: whole.trim(), label: match.name });
    return " ";
  });

  let date: Day | null = null;
  const now = ctx.now ?? new Date();
  const found = chrono.parse(text, { instant: now, timezone: ctx.timezone }, { forwardDate: false })[0];
  if (found && found.start.isCertain("day")) {
    date = dayOf(found.start.date(), ctx.timezone);
    tokens.push({ kind: "date", text: found.text, label: found.text });
    text = text.replace(found.text, " ");
  }

  const note = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(on|for|at|from)\s+/i, "")
    .trim();
  return { kind, amount: amount * mult, note, categoryId, categoryLabel, date, tokens };
}
