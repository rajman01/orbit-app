"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SectionLabel } from "@/components/tasks/task-list";
import { useActions } from "@/features/actions";
import { useBudgets, useCategories, type CategoryDoc, type TransactionDoc } from "@/features/data";
import { budgetFor, budgetStatuses, PACE_LABEL, type BudgetStatus, type Pace } from "@/features/money/budgets";
import { formatMoney, monthLabel } from "@/features/money/model";
import { cn } from "@/lib/cn";
import { AmountInput, Money, useCurrency } from "./amount";

const PACE_TONE: Record<Pace, string> = {
  under: "var(--success)",
  on: "var(--accent)",
  over: "var(--warning)",
  blown: "var(--danger)",
};

/** 5B: the Budgets tab — a limit per category and overall, with how the month is going. */
export function Budgets({
  transactions,
  month,
  todayDay,
}: {
  transactions: TransactionDoc[];
  month: string;
  todayDay: string;
}) {
  const budgets = useBudgets() ?? [];
  const categories = useCategories() ?? [];
  const statuses = budgetStatuses(budgets, transactions, month, todayDay);
  const [editing, setEditing] = useState<{ categoryId: string | null } | null>(null);
  const withBudget = new Set(statuses.map((s) => s.categoryId));
  const unbudgeted = categories.filter((c) => c.kind === "expense" && !withBudget.has(c.id));
  const catById = new Map(categories.map((c) => [c.id, c]));
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel count={statuses.length}>Budgets · {monthLabel(month)}</SectionLabel>
        {withBudget.has(null) ? null : (
          <Button
            variant="secondary"
            icon={<Plus className="size-4" />}
            onClick={() => setEditing({ categoryId: null })}
          >
            Overall budget
          </Button>
        )}
      </div>
      {statuses.length ? (
        <ul className="flex flex-col gap-1" aria-label="Budgets">
          {statuses.map((s) => (
            <BudgetRow
              key={s.categoryId ?? "all"}
              status={s}
              category={s.categoryId ? catById.get(s.categoryId) : undefined}
              onEdit={() => setEditing({ categoryId: s.categoryId })}
            />
          ))}
        </ul>
      ) : (
        <p className="text-callout text-label-secondary">
          A budget is a monthly limit for a category, or for everything. Orbit shows how much is used against how far
          through the month you are.
        </p>
      )}
      {unbudgeted.length ? (
        <>
          <SectionLabel>Set a budget for</SectionLabel>
          <ul className="flex flex-wrap gap-1.5">
            {unbudgeted.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ categoryId: c.id })}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-footnote font-medium hover:bg-fill-strong"
                >
                  <AreaIcon icon={c.icon} color={c.color} className="size-3.5" /> {c.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <BudgetForm
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        month={month}
        categoryId={editing?.categoryId ?? null}
        category={editing?.categoryId ? catById.get(editing.categoryId) : undefined}
      />
    </>
  );
}

function BudgetRow({
  status: s,
  category,
  onEdit,
}: {
  status: BudgetStatus;
  category?: CategoryDoc;
  onEdit: () => void;
}) {
  const currency = useCurrency();
  const name = category?.name ?? "Everything";
  const tone = PACE_TONE[s.pace];
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${name}: ${formatMoney(s.spent, currency)} of ${formatMoney(s.budget.amount, currency)}, ${PACE_LABEL[s.pace].toLowerCase()}`}
        className="flex w-full flex-col gap-1.5 rounded-lg px-2 py-2.5 text-left hover:bg-fill"
      >
        <span className="flex items-center gap-2">
          {category ? <AreaIcon icon={category.icon} color={category.color} /> : null}
          <span className="min-w-0 flex-1 truncate text-body font-medium">{name}</span>
          <span className="text-footnote" style={{ color: tone }}>
            {PACE_LABEL[s.pace]}
          </span>
        </span>
        <span className="relative block h-2 overflow-hidden rounded-full bg-fill">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.min(100, s.used * 100)}%`, background: tone }}
          />
          <span
            className="absolute top-0 h-full w-px bg-label-tertiary"
            style={{ left: `${s.elapsed * 100}%` }}
            aria-hidden
          />
        </span>
        <span className="flex justify-between text-footnote text-label-secondary">
          <span>
            <Money minor={s.spent} compact /> of <Money minor={s.budget.amount} compact />
            {s.budget.month === "*" ? "" : " this month only"}
          </span>
          <span className={cn(s.left < 0 && "text-danger-text")}>
            {s.left >= 0 ? (
              <>
                <Money minor={s.left} compact /> left
              </>
            ) : (
              <>
                <Money minor={-s.left} compact /> over
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function BudgetForm({
  open,
  onOpenChange,
  month,
  categoryId,
  category,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  month: string;
  categoryId: string | null;
  category?: CategoryDoc;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Budget for ${category?.name ?? "everything"}`}>
      <BudgetFields
        key={`${month}${categoryId}`}
        month={month}
        categoryId={categoryId}
        onDone={() => onOpenChange(false)}
      />
    </Modal>
  );
}

function BudgetFields({ month, categoryId, onDone }: { month: string; categoryId: string | null; onDone: () => void }) {
  const actions = useActions();
  const currency = useCurrency();
  const budgets = useBudgets() ?? [];
  const current = budgetFor(budgets, month, categoryId);
  const [amount, setAmount] = useState<number | null>(current?.amount ?? null);
  const [scope, setScope] = useState<"*" | "month">(current?.month === month ? "month" : "*");
  const save = async () => {
    await actions.setBudget(scope === "*" ? "*" : month, categoryId, amount ?? 0);
    onDone();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4 pb-2"
    >
      <AmountInput value={amount} onChange={(m) => setAmount(m)} label="Budget" autoFocus />
      <div role="radiogroup" aria-label="Applies to" className="flex rounded-md bg-fill p-0.5">
        {(
          [
            ["*", "Every month"],
            ["month", monthLabel(month, { short: true }) + " only"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={scope === v}
            onClick={() => setScope(v)}
            className={cn(
              "h-8 flex-1 rounded-[8px] text-footnote font-medium",
              scope === v ? "bg-surface text-label shadow-1" : "text-label-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        {current ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void actions.setBudget(current.month, categoryId, 0).then(onDone)}
          >
            Remove budget
          </Button>
        ) : (
          <span className="text-footnote text-label-tertiary">
            {amount ? `${formatMoney(amount, currency, { compact: true })} a month` : ""}
          </span>
        )}
        <Button type="submit" disabled={!amount}>
          Save
        </Button>
      </div>
    </form>
  );
}
