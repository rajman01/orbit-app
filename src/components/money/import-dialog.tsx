"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useCategories, useDebts, useTransactions } from "@/features/data";
import { importRows, parseCsv, type ImportRow } from "@/features/money/import";
import { dayLabel } from "@/lib/dates";
import { useToday } from "@/features/use-today";
import { Money, useCurrency } from "./amount";

/** 5C (FIN-10): a bank statement as CSV → a preview → transactions, with duplicates skipped. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const actions = useActions();
  const toast = useToast();
  const currency = useCurrency();
  const todayDay = useToday();
  const categories = useCategories() ?? [];
  const debts = useDebts() ?? [];
  const existing = new Set((useTransactions() ?? []).map((t) => t.importHash).filter(Boolean));
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fresh = rows?.filter((r) => !existing.has(r.hash)) ?? [];

  const read = async (file: File) => {
    const text = await file.text();
    const res = importRows(parseCsv(text), { currency, categories, debts });
    setRows(res.rows);
    setProblem(res.problem);
  };
  const run = async () => {
    setBusy(true);
    const added = await actions.importTransactions(fresh);
    setBusy(false);
    toast({ message: added ? `${added} imported` : "Nothing new to import" });
    onOpenChange(false);
    setRows(null);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => (onOpenChange(o), !o && setRows(null))}
      title="Import a statement"
      width={560}
    >
      <div className="flex flex-col gap-3">
        <p className="text-callout text-label-secondary">
          A CSV from your bank with a date, an amount (or debit and credit) and a description. Rows already imported are
          skipped, so the same file can be uploaded again safely.
        </p>
        <label className="flex h-control cursor-pointer items-center gap-2 self-start rounded-md bg-fill px-4 text-body font-semibold hover:bg-fill-strong">
          <Upload className="size-4" aria-hidden /> Choose CSV
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Statement CSV"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])}
          />
        </label>
        {problem ? <p className="text-footnote text-danger-text">{problem}</p> : null}
        {rows && rows.length ? (
          <>
            <p className="text-footnote text-label-secondary">
              {rows.length} row{rows.length === 1 ? "" : "s"} found
              {fresh.length < rows.length ? `, ${rows.length - fresh.length} already here` : ""}.
            </p>
            <ul className="max-h-64 overflow-y-auto rounded-md border border-separator" aria-label="Rows to import">
              {rows.slice(0, 50).map((r) => {
                const c = r.categoryId ? categories.find((x) => x.id === r.categoryId) : undefined;
                const dup = existing.has(r.hash);
                return (
                  <li
                    key={r.hash}
                    className={`flex h-10 items-center gap-2 border-b border-separator px-2 text-footnote last:border-b-0 ${dup ? "opacity-40" : ""}`}
                  >
                    <span className="w-16 shrink-0 text-label-tertiary">{dayLabel(r.date, todayDay)}</span>
                    <span className="min-w-0 flex-1 truncate">{r.note || "(no description)"}</span>
                    {c ? <AreaIcon icon={c.icon} color={c.color} className="size-3.5" /> : null}
                    <Money minor={r.kind === "income" ? r.amount : -r.amount} signed />
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <Button onClick={() => void run()} disabled={!fresh.length} loading={busy}>
                Import {fresh.length}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
