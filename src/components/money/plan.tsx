"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CoachIcon } from "@/components/coach/coach-icon";
import { askCoach } from "@/components/coach/coach-panel";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useBudgets, useCategories, useDebts, useSavingsPots, useSettings, type TransactionDoc } from "@/features/data";
import { formatMoney, monthLabel } from "@/features/money/model";
import { LAST_DAY } from "@/features/money/income";
import { monthPlan, type IncomeSource, type IncomeStatus, type PlanLine } from "@/features/money/plan";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { AmountInput, Money, useCurrency } from "./amount";

/** 5H: the Plan tab — expected income against bills, budgets, savings and debt minimums. */
export function Plan({ transactions, month }: { transactions: TransactionDoc[]; month: string }) {
  const actions = useActions();
  const settings = useSettings();
  const todayDay = useToday();
  const toast = useToast();
  const currency = useCurrency();
  const budgets = useBudgets() ?? [];
  const pots = useSavingsPots() ?? [];
  const debts = useDebts() ?? [];
  const categories = useCategories({ includeArchived: true }) ?? [];
  const [editing, setEditing] = useState<IncomeSource | "new" | null>(null);
  const plan = monthPlan({ settings, transactions, budgets, pots, debts, categories }, todayDay, month);
  const negative = plan.left < 0;
  const toCome = plan.incomes.reduce((sum, i) => sum + (i.status?.state === "received" ? 0 : i.amount), 0);
  const canLog = month <= todayDay.slice(0, 7);
  const logIt = async (src: IncomeSource, expectedDate: string | null) => {
    const date = expectedDate && expectedDate <= todayDay ? expectedDate : todayDay;
    const id = await actions.logExpectedIncome(src, month, date);
    toast({
      message: `Logged ${formatMoney(src.amount, currency, { compact: true })} from ${src.name}`,
      action: { label: "Undo", onClick: () => void actions.deleteTransaction(id) },
    });
  };

  return (
    <>
      <section aria-label="Month plan" className="mb-4 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised">
        <p className="text-footnote text-label-secondary">
          {monthLabel(month)} · planned to spare, once everything is set aside
        </p>
        <p className={cn("text-title1 text-label tabular", negative && "text-danger-text")}>
          <Money minor={plan.left} compact />
        </p>
        {plan.income ? (
          <>
            <p className="mt-1 text-callout">
              Expected <Money minor={plan.income} compact /> · received{" "}
              <Money minor={plan.actual.income} compact className="font-semibold" />
              {toCome > 0 ? (
                <>
                  {" "}
                  · still to come <Money minor={toCome} compact />
                </>
              ) : null}
            </p>
            <p className="mt-1 text-footnote text-label-secondary">
              Expected income <Money minor={plan.income} compact /> − bills <Money minor={plan.fixedTotal} compact /> −
              budgets <Money minor={plan.budgetsTotal} compact /> − savings <Money minor={plan.savingsTotal} compact />
              {plan.debtsTotal ? (
                <>
                  {" "}
                  − debt minimums <Money minor={plan.debtsTotal} compact />
                </>
              ) : null}
              . A plan, not money in hand.
            </p>
          </>
        ) : (
          <p className="mt-1 text-footnote text-label-secondary">
            Add your expected income below and the plan adds up.
          </p>
        )}
        {negative ? (
          <p className="mt-2 text-footnote text-danger-text">
            More is set aside than comes in. Lower a budget or a pot&rsquo;s monthly amount, or ask the coach to fit it.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<CoachIcon className="size-4" />}
            onClick={() =>
              askCoach(
                "Plan my month around my income: look at my income, bills, budgets, pots and debts, and propose budgets and monthly pot amounts that fit, leaving a little slack.",
              )
            }
          >
            Plan it with the coach
          </Button>
        </div>
        <p className="mt-2 text-footnote text-label-tertiary">
          Spent so far this month: <Money minor={plan.actual.expense} compact />.
        </p>
      </section>

      <div className="mb-1 flex items-center justify-between">
        <SectionLabel count={plan.incomes.length + plan.otherIncomes.length}>Income</SectionLabel>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          Add income
        </Button>
      </div>
      {plan.incomes.length || plan.otherIncomes.length ? (
        <ul className="flex flex-col" aria-label="Income">
          {[...plan.incomes, ...plan.otherIncomes].map((i, k) => {
            const src = settings.money?.incomes?.find((x) => x.id === i.id);
            const off = k >= plan.incomes.length;
            return (
              <li key={i.id} className="flex min-h-row items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fill">
                <span className={cn("min-w-0 flex-1", off && "text-label-secondary")}>
                  <span className="block truncate text-body">{i.name}</span>
                  <span className="block text-footnote text-label-tertiary">
                    {[i.note, off ? `nothing in ${monthLabel(month)}` : null].filter(Boolean).join(" · ")}
                  </span>
                  {i.status ? (
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <IncomeStatusPill status={i.status} amount={i.amount} />
                      {i.status.state !== "received" && canLog && src ? (
                        <button
                          type="button"
                          onClick={() => void logIt(src, i.status!.expectedDate)}
                          className="text-footnote font-medium text-accent-text hover:underline"
                        >
                          Mark received
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <span className={cn(off && "text-label-tertiary line-through")}>
                  <Money minor={i.amount} compact />
                </span>
                <IconButton
                  label={`Edit ${i.name}`}
                  icon={<Pencil className="size-4" />}
                  onClick={() => src && setEditing(src)}
                />
                <IconButton
                  label={`Remove ${i.name}`}
                  icon={<Trash2 className="size-4" />}
                  onClick={() => void actions.removeIncome(i.id)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-callout text-label-secondary">
          What you expect to come in: salary, side income, instalments. The plan and the coach work from it.
        </p>
      )}

      <Lines
        title="Bills"
        lines={plan.fixed}
        total={plan.fixedTotal}
        href="/money?tab=transactions"
        hint="Recurring entries, as a monthly figure"
      />
      <Lines
        title="Budgets"
        lines={plan.budgets}
        total={plan.budgetsTotal}
        href="/money?tab=budgets"
        hint="Category limits"
      />
      <Lines
        title="Savings"
        lines={plan.savings}
        total={plan.savingsTotal}
        href="/money?tab=pots"
        hint="What each pot takes a month"
      />
      <Lines
        title="Debt minimums"
        lines={plan.debts}
        total={plan.debtsTotal}
        href="/money?tab=debts"
        hint="The least each debt needs"
      />

      <IncomeForm
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        income={editing === "new" ? null : editing}
      />
    </>
  );
}

/** Received (with the amount when it differs), expected on its day, or late. */
function IncomeStatusPill({ status, amount }: { status: IncomeStatus; amount: number }) {
  const currency = useCurrency();
  const day = status.expectedDate ? shortDay(status.expectedDate) : null;
  if (status.state === "received")
    return (
      <Pill tone="success">
        <Check className="size-3" aria-hidden />
        Received
        {status.received !== amount ? ` ${formatMoney(status.received, currency, { compact: true })}` : ""}
      </Pill>
    );
  if (status.state === "late") return <Pill tone="warning">{day ? `Late · was due ${day}` : "Not in yet"}</Pill>;
  return <Pill tone="neutral">{day ? `Expected ${day}` : "Expected this month"}</Pill>;
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Lines({
  title,
  lines,
  total,
  href,
  hint,
}: {
  title: string;
  lines: PlanLine[];
  total: number;
  href: string;
  hint: string;
}) {
  if (!lines.length) return null;
  return (
    <>
      <div className="mt-4 mb-1 flex items-center justify-between">
        <SectionLabel count={lines.length}>{title}</SectionLabel>
        <Link href={href} className="text-footnote font-medium text-accent-text">
          Change
        </Link>
      </div>
      <p className="mb-1 px-1 text-footnote text-label-tertiary">{hint}</p>
      <ul className="flex flex-col" aria-label={title}>
        {lines.map((l) => (
          <li key={l.id} className="flex h-9 items-center gap-3 px-2 text-callout">
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            {l.note ? <span className="text-footnote text-label-tertiary">{l.note}</span> : null}
            <Money minor={l.amount} compact />
          </li>
        ))}
        <li className="flex h-9 items-center justify-between px-2 text-callout font-semibold">
          <span>Total</span>
          <Money minor={total} compact />
        </li>
      </ul>
    </>
  );
}

function IncomeForm({
  open,
  onOpenChange,
  income,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  income: IncomeSource | null;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={income ? "Edit income" : "Expected income"}>
      <IncomeFields key={income?.id ?? "new"} income={income} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function IncomeFields({ income, onDone }: { income: IncomeSource | null; onDone: () => void }) {
  const actions = useActions();
  const [name, setName] = useState(income?.name ?? "");
  const [amount, setAmount] = useState<number | null>(income?.amount ?? null);
  const [day, setDay] = useState(income?.day == null ? "" : income.day >= LAST_DAY ? "last" : String(income.day));
  const [from, setFrom] = useState(income?.from ?? "");
  const [until, setUntil] = useState(income?.until ?? "");
  const badRange = Boolean(from && until && until < from);
  const save = async () => {
    if (!name.trim() || !amount || badRange) return;
    const d = day.trim().toLowerCase();
    await actions.setIncome({
      id: income?.id,
      name: name.trim(),
      amount,
      day: !d ? null : d.startsWith("l") ? LAST_DAY : Math.min(LAST_DAY, Math.max(1, Number(d) || 1)),
      from: from || null,
      until: until || null,
    });
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
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salary, Freelance" />
      </Field>
      <AmountInput value={amount} onChange={(m) => setAmount(m)} label="Per month" />
      <Field label="Day it lands (1–31 or “last”, optional)">
        <Input value={day} onChange={(e) => setDay(e.target.value)} placeholder="e.g. 25, or last" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First month (optional)">
          <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Last month (optional)">
          <Input type="month" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
      <p className="-mt-2 text-footnote text-label-tertiary">
        {badRange
          ? "The last month is before the first."
          : "Leave both empty for income that keeps coming. For a one-off, set both to the same month."}
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={!name.trim() || !amount || badRange}>
          {income ? "Save" : "Add income"}
        </Button>
      </div>
    </form>
  );
}
