"use client";

import { ArrowLeftRight, Repeat } from "lucide-react";
import { AreaIcon } from "@/components/areas/area-icon";
import { useAccounts, useCategories, useDebts, useSavingsPots, type TransactionDoc } from "@/features/data";
import { transactionLabel } from "@/features/money/model";
import { dayLabel } from "@/lib/dates";
import { Money } from "./amount";

/** Transactions grouped by day, newest first. */
export function TransactionList({
  transactions,
  todayDay,
  onOpen,
  limit,
}: {
  transactions: TransactionDoc[];
  todayDay: string;
  onOpen: (t: TransactionDoc) => void;
  limit?: number;
}) {
  const accounts = useAccounts({ includeArchived: true }) ?? [];
  const categories = useCategories({ includeArchived: true }) ?? [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const pots = useSavingsPots({ includeArchived: true }) ?? [];
  const debts = useDebts({ includeArchived: true }) ?? [];
  const rows = limit ? transactions.slice(0, limit) : transactions;
  const days = new Map<string, TransactionDoc[]>();
  for (const t of rows) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-4">
      {[...days.entries()].map(([day, list]) => (
        <section key={day} aria-label={dayLabel(day, todayDay)}>
          <h3 className="mb-1 px-1 text-footnote font-medium text-label-secondary">{dayLabel(day, todayDay)}</h3>
          <ul className="flex flex-col">
            {list.map((t) => {
              const cat = t.categoryId ? categoryById.get(t.categoryId) : undefined;
              const label = transactionLabel(t, {
                category: (id) => categoryById.get(id)?.name,
                account: (id) => accountById.get(id)?.name,
                pot: (id) => pots.find((p) => p.id === id)?.name,
                debt: (id) => debts.find((d) => d.id === id)?.name,
              });
              const account = t.accountId ? accountById.get(t.accountId)?.name : null;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(t)}
                    aria-label={`Open ${label}`}
                    className="flex h-row w-full items-center gap-3 rounded-md px-2 text-left hover:bg-fill"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fill">
                      {t.kind === "transfer" ? (
                        <ArrowLeftRight className="size-4 text-label-secondary" aria-hidden />
                      ) : (
                        <AreaIcon icon={cat?.icon ?? "circle"} color={cat?.color ?? null} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-body">
                        {label}
                        {t.recurrence || t.recurrenceParentId ? (
                          <Repeat className="size-3 shrink-0 text-label-tertiary" aria-label="Repeats" />
                        ) : null}
                      </span>
                      {(cat && t.note) || account ? (
                        <span className="block truncate text-footnote text-label-tertiary">
                          {[cat && t.note ? cat.name : null, account].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <Money
                      minor={t.kind === "income" ? t.amount : t.kind === "expense" ? -t.amount : t.amount}
                      signed={t.kind !== "transfer"}
                      className={t.kind === "transfer" ? "text-label-secondary" : undefined}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
