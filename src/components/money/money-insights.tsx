"use client";

import Link from "next/link";
import { HBars } from "@/components/insights/charts";
import { InOutChart } from "@/components/money/in-out-chart";
import { useCurrency } from "@/components/money/amount";
import { SectionLabel } from "@/components/tasks/task-list";
import { areaColorVar } from "@/features/areas/model";
import { useCategories, useTransactions } from "@/features/data";
import { formatMoney, inOutByMonth, monthLabel, monthOf, spendByCategory } from "@/features/money/model";
import { useToday } from "@/features/use-today";

/** 5B (FIN-14): the money section on Insights, shown once anything is logged. */
export function MoneyInsights() {
  const transactions = useTransactions();
  const categories = useCategories({ includeArchived: true }) ?? [];
  const currency = useCurrency();
  const todayDay = useToday();
  if (!transactions?.length) return null;
  const month = monthOf(todayDay);
  const byCat = spendByCategory(transactions, month);
  return (
    <>
      <SectionLabel>Money</SectionLabel>
      <section
        aria-label="Where the money went"
        className="mb-3 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-headline">Where the money went</h3>
            <p className="text-footnote text-label-secondary">{monthLabel(month)}, by category.</p>
          </div>
          <Link href="/money" className="text-footnote font-medium text-accent-text">
            Money
          </Link>
        </div>
        {byCat.length ? (
          <HBars
            label="Spending by category"
            rows={byCat.map((r) => {
              const c = r.categoryId ? categories.find((x) => x.id === r.categoryId) : undefined;
              return {
                key: r.categoryId ?? "none",
                label: c?.name ?? "Uncategorised",
                value: r.amount,
                display: formatMoney(r.amount, currency, { compact: true }),
                color: c ? areaColorVar(c.color) : "var(--label-tertiary)",
              };
            })}
          />
        ) : (
          <p className="text-callout text-label-secondary">Nothing spent this month yet.</p>
        )}
      </section>
      <section aria-label="Money in and out" className="mb-3 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised">
        <h3 className="mb-3 text-headline">In and out, last six months</h3>
        <InOutChart rows={inOutByMonth(transactions, month)} label="Money in and out by month" />
      </section>
    </>
  );
}
