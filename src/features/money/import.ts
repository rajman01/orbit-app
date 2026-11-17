import type { Day } from "@/lib/dates";
import { parseAmount, type TransactionFields } from "./model";

/**
 * 5C (FIN-10): a bank statement as CSV. Columns are found by name (date, amount or debit/credit,
 * description); each row becomes a candidate with a guessed category, and a hash of the row keeps
 * the same file from importing twice.
 */

export interface ImportRow {
  date: Day;
  amount: number;
  kind: "expense" | "income";
  note: string;
  categoryId: string | null;
  hash: string;
  /** The row as it was, for the preview. */
  raw: string[];
}

/** A small CSV reader: commas or semicolons, quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const sep = text.split("\n")[0]?.includes(";") && !text.split("\n")[0]?.includes(",") ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const find = (header: string[], ...names: string[]) =>
  header.findIndex((h) =>
    names.some((n) =>
      h
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .includes(n),
    ),
  );

/** "2026-11-03", "03/11/2026", "11/03/2026" (US when the first part can't be a day), "3 Nov 2026". */
export function parseDay(text: string): Day | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const [, a, b] = m;
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    let day = Number(a);
    let month = Number(b);
    if (day > 12 && month <= 12) {
      /* day first */
    } else if (month > 12) [day, month] = [month, day];
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime()) && /[a-z]/i.test(t))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return null;
}

/** A short, stable fingerprint of a row (djb2), so a re-import adds nothing. */
export function rowHash(...parts: string[]): string {
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `csv${h.toString(16).padStart(8, "0")}${s.length.toString(16)}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

/** Rows from a statement, with categories guessed from words in the description. */
export function importRows(
  rows: string[][],
  ctx: { currency: string; categories: { id: string; name: string; kind: "expense" | "income" }[] },
): { rows: ImportRow[]; problem: string | null } {
  if (rows.length < 2) return { rows: [], problem: "The file needs a header row and at least one entry." };
  const header = rows[0];
  const iDate = find(header, "date", "posted", "when");
  const iDesc = find(header, "description", "narration", "details", "memo", "payee", "name", "remarks");
  const iAmount = find(header, "amount", "value", "sum");
  const iDebit = find(header, "debit", "withdrawal", "out", "moneyout");
  const iCredit = find(header, "credit", "deposit", "in", "moneyin");
  if (iDate === -1) return { rows: [], problem: "No date column found (looked for “date”)." };
  if (iAmount === -1 && iDebit === -1 && iCredit === -1)
    return { rows: [], problem: "No amount column found (looked for “amount”, “debit” or “credit”)." };
  const out: ImportRow[] = [];
  for (const raw of rows.slice(1)) {
    const date = parseDay(raw[iDate] ?? "");
    if (!date) continue;
    const desc = (iDesc === -1 ? "" : (raw[iDesc] ?? "")).trim();
    let kind: ImportRow["kind"] = "expense";
    let amount: number | null = null;
    if (iAmount !== -1 && raw[iAmount]?.trim()) {
      // One amount column: a minus sign or brackets mean money out; a DR/CR flag elsewhere wins.
      const text = raw[iAmount].trim();
      const flags = raw.filter((_, k) => k !== iAmount).join(" ");
      const negative = /^[-(]/.test(text) || /-$/.test(text);
      if (/\b(dr|debit)\b/i.test(flags)) kind = "expense";
      else if (/\b(cr|credit)\b/i.test(flags)) kind = "income";
      else kind = negative ? "expense" : "income";
      amount = parseAmount(text.replace(/[()+-]/g, ""), ctx.currency);
    } else if (iDebit !== -1 && raw[iDebit]?.trim()) {
      kind = "expense";
      amount = parseAmount(raw[iDebit], ctx.currency);
    } else if (iCredit !== -1 && raw[iCredit]?.trim()) {
      kind = "income";
      amount = parseAmount(raw[iCredit], ctx.currency);
    }
    if (!amount) continue;
    const words = norm(desc);
    const category =
      ctx.categories.find(
        (c) =>
          c.kind === kind &&
          norm(c.name)
            .split(/\s+/)
            .some((w) => w.length > 3 && words.includes(w)),
      ) ?? null;
    out.push({
      date,
      amount,
      kind,
      note: desc.slice(0, 200),
      categoryId: category?.id ?? null,
      hash: rowHash(date, String(amount), kind, desc),
      raw,
    });
  }
  return { rows: out, problem: out.length ? null : "No rows with a date and an amount were found." };
}

export function importFields(row: ImportRow): Partial<TransactionFields> & { amount: number; date: Day } {
  return {
    kind: row.kind,
    amount: row.amount,
    date: row.date,
    note: row.note,
    categoryId: row.categoryId,
    createdBy: "import",
    importHash: row.hash,
  };
}
