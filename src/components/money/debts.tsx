"use client";

import { Archive, HandCoins, Link2, Link2Off, MoreHorizontal, Pencil, Plus, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DatePicker, GoalPicker, PersonPicker } from "@/components/tasks/pickers";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Picker, ChipButton } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { CoachAboutButton } from "@/components/coach/coach-about";
import { useActions } from "@/features/actions";
import {
  useAccounts,
  useDebts,
  useGoal,
  usePerson,
  useTransactions,
  type DebtDoc,
  type TransactionDoc,
} from "@/features/data";
import {
  DEBT_KIND_LABEL,
  debtState,
  payoffPlan,
  suggestedMonthly,
  type DebtState,
  type Strategy,
} from "@/features/money/debts";
import { formatMoney, monthLabel, monthOf } from "@/features/money/model";
import { useToday } from "@/features/use-today";
import { DEBT_KINDS } from "@/lib/sync/entities";
import { dayLabel } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { AmountInput, Money, useCurrency } from "./amount";

/** 5D: the Debts tab — what you owe and what's owed to you, and a plan to clear it. */
export function Debts({ transactions }: { transactions: TransactionDoc[] }) {
  const debtsQ = useDebts();
  const debts = useMemo(() => debtsQ ?? [], [debtsQ]);
  const todayDay = useToday();
  const [editing, setEditing] = useState<DebtDoc | "new" | null>(null);
  const [paying, setPaying] = useState<DebtDoc | null>(null);
  const states = useMemo(
    () => new Map(debts.map((d) => [d.id, debtState(d, transactions, todayDay)])),
    [debts, transactions, todayDay],
  );
  const owe = debts.filter((d) => d.direction === "owe");
  const owed = debts.filter((d) => d.direction === "owed");
  const openOwe = owe.filter((d) => !d.closedAt);
  const totalOwe = openOwe.reduce((s, d) => s + (states.get(d.id)?.balance ?? 0), 0);
  const totalOwed = owed.filter((d) => !d.closedAt).reduce((s, d) => s + (states.get(d.id)?.balance ?? 0), 0);
  const list = (items: DebtDoc[]) => (
    <ul className="flex flex-col gap-3">
      {items.map((d) => (
        <li key={d.id}>
          <DebtCard debt={d} state={states.get(d.id)!} onPay={() => setPaying(d)} onEdit={() => setEditing(d)} />
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel count={debts.length}>Debts</SectionLabel>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New debt
        </Button>
      </div>
      {debts.length ? (
        <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Totals">
          <Stat label="You owe" value={totalOwe} />
          <Stat label="Owed to you" value={totalOwed} />
        </div>
      ) : (
        <p className="text-callout text-label-secondary">
          Loans, cards, buy-now-pay-later, and money between you and people. Record payments as they happen; Orbit shows
          what&rsquo;s left, what&rsquo;s due, and the quickest way to clear it all.
        </p>
      )}
      {owe.length ? (
        <>
          <SectionLabel count={owe.length}>You owe</SectionLabel>
          {list(owe)}
        </>
      ) : null}
      {openOwe.length ? <PayoffPlanCard debts={debts} states={states} /> : null}
      {owed.length ? (
        <>
          <SectionLabel count={owed.length}>Owed to you</SectionLabel>
          {list(owed)}
        </>
      ) : null}
      <DebtForm
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        debt={editing === "new" ? null : editing}
      />
      <PayForm open={paying != null} onOpenChange={(o) => !o && setPaying(null)} debt={paying} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface p-3 shadow-1 dark:bg-surface-raised">
      <p className="text-footnote text-label-secondary">{label}</p>
      <p className="truncate text-title3">
        <Money minor={value} compact />
      </p>
    </div>
  );
}

/** One debt: what's left of what it was, the next due day, interest so far, and a payment button. */
export function DebtCard({
  debt,
  state: s,
  onPay,
  onEdit,
  compact = false,
}: {
  debt: DebtDoc;
  state: DebtState;
  onPay: () => void;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const actions = useActions();
  const toast = useToast();
  const router = useRouter();
  const todayDay = useToday();
  const person = usePerson(debt.personId);
  const goal = useGoal(debt.goalId);
  const share = debt.principal ? Math.min(1, s.paid / debt.principal) : 0;
  const closed = Boolean(debt.closedAt) || s.balance <= 0;
  const who = person
    ? debt.direction === "owe"
      ? `to ${person.name}`
      : `from ${person.name}`
    : DEBT_KIND_LABEL[debt.kind];
  return (
    <section
      aria-label={`Debt: ${debt.name}`}
      className={cn(
        "flex flex-col gap-2 rounded-xl p-4",
        compact ? "bg-surface-sunken" : "bg-surface shadow-1 dark:bg-surface-raised",
        closed && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-fill text-label-secondary">
          <HandCoins className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <h3 className="truncate text-headline">{debt.name}</h3>
          <p className="truncate text-footnote text-label-tertiary">
            {who}
            {debt.interestRate ? ` · ${debt.interestRate}% a year` : ""}
          </p>
        </span>
        {closed ? <span className="text-footnote font-medium text-success-text">Cleared</span> : null}
        {onEdit ? (
          <Menu
            trigger={<IconButton label={`More for ${debt.name}`} icon={<MoreHorizontal className="size-4" />} />}
            align="end"
          >
            <MenuItem icon={<Pencil />} onSelect={onEdit}>
              Edit
            </MenuItem>
            {debt.goalId ? (
              <>
                <MenuItem icon={<Target />} onSelect={() => router.push(`/goal?id=${debt.goalId}`)}>
                  Open goal
                </MenuItem>
                <MenuItem icon={<Link2Off />} onSelect={() => void actions.unlinkDebt(debt)}>
                  Unlink from goal
                </MenuItem>
              </>
            ) : debt.direction === "owe" ? (
              <MenuItem
                icon={<Link2 />}
                onSelect={async () => {
                  const id = await actions.makeDebtGoal(debt);
                  toast({ message: "Goal created" });
                  router.push(`/goal?id=${id}`);
                }}
              >
                Make clearing it a goal
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem icon={<Archive />} onSelect={() => void actions.archiveDebt(debt.id, true)}>
              Archive
            </MenuItem>
            <MenuItem icon={<Trash2 />} destructive onSelect={() => void actions.deleteDebt(debt.id)}>
              Delete
            </MenuItem>
          </Menu>
        ) : null}
      </div>
      <p className="text-title3 tabular">
        <Money minor={s.balance} compact />
        <span className="text-callout font-normal text-label-secondary">
          {" "}
          left of <Money minor={debt.principal} compact />
        </span>
      </p>
      <span
        className="block h-2 overflow-hidden rounded-full bg-fill"
        role="img"
        aria-label={`${Math.round(share * 100)}% paid`}
      >
        <span className="block h-full rounded-full bg-success" style={{ width: `${share * 100}%` }} />
      </span>
      <p className="text-footnote text-label-secondary">
        <Money minor={s.paid} compact /> paid
        {s.interest ? (
          <>
            {" "}
            · <Money minor={s.interest} compact /> of it interest
          </>
        ) : null}
        {s.nextDue && !closed ? (
          <>
            {" "}
            ·{" "}
            <span
              className={cn(
                s.dueIn != null && s.dueIn < 0 && "text-danger-text",
                s.dueIn != null && s.dueIn >= 0 && s.dueIn <= 3 && "text-warning-text",
              )}
            >
              {s.dueIn != null && s.dueIn < 0
                ? `overdue since ${dayLabel(s.nextDue, todayDay)}`
                : `next due ${dayLabel(s.nextDue, todayDay)}`}
              {debt.minimumPayment ? (
                <>
                  {" "}
                  (<Money minor={debt.minimumPayment} compact />)
                </>
              ) : null}
            </span>
          </>
        ) : null}
      </p>
      {closed ? null : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={onPay}>{debt.direction === "owe" ? "Record a payment" : "Record money back"}</Button>
          {compact ? null : <CoachAboutButton subject={{ kind: "debt", id: debt.id }} title={debt.name} compact />}
          {goal && !compact ? (
            <Link
              href={`/goal?id=${goal.id}`}
              className="flex h-control items-center gap-1 rounded-md px-3 text-footnote font-medium text-accent-text hover:bg-fill"
            >
              <Target className="size-3.5" aria-hidden /> {goal.title}
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* ---------- the payoff plan ---------- */

function PayoffPlanCard({ debts, states }: { debts: DebtDoc[]; states: Map<string, DebtState> }) {
  const currency = useCurrency();
  const todayDay = useToday();
  const suggested = useMemo(() => suggestedMonthly(debts, states), [debts, states]);
  const [strategy, setStrategy] = useState<Strategy>("avalanche");
  const [monthly, setMonthly] = useState<number | null>(null);
  const amount = monthly ?? suggested;
  const month = monthOf(todayDay);
  const plan = payoffPlan(debts, states, amount, strategy, month);
  const more = payoffPlan(debts, states, amount + Math.max(1000, Math.round(amount * 0.1)), strategy, month);
  const extra = more.monthly - amount;
  return (
    <section
      aria-label="Payoff plan"
      className="mt-4 flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-headline">Payoff plan</h3>
          <p className="text-footnote text-label-secondary">
            Minimums on everything, the rest to one debt at a time, rolling on as each clears.
          </p>
        </div>
        <div role="radiogroup" aria-label="Order" className="flex rounded-md bg-fill p-0.5">
          {(
            [
              ["avalanche", "Highest interest first"],
              ["snowball", "Smallest first"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={strategy === v}
              onClick={() => setStrategy(v)}
              className={cn(
                "h-8 rounded-[8px] px-3 text-footnote font-medium",
                strategy === v ? "bg-surface text-label shadow-1" : "text-label-secondary",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-callout">
        Paying
        <input
          aria-label="Monthly amount"
          inputMode="numeric"
          value={Math.round(amount / 100)}
          onChange={(e) => setMonthly(Math.max(0, Number(e.target.value.replace(/[^\d]/g, "")) || 0) * 100)}
          className="h-9 w-32 rounded-md bg-surface-sunken px-3 text-body tabular outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        a month
        {monthly != null && monthly !== suggested ? (
          <button type="button" onClick={() => setMonthly(null)} className="text-footnote font-medium text-accent-text">
            Suggested: {formatMoney(suggested, currency, { compact: true })}
          </button>
        ) : null}
      </label>
      {plan.doneMonth ? (
        <p className="text-callout">
          Everything cleared by <b>{monthLabel(plan.doneMonth)}</b> ({plan.months} month{plan.months === 1 ? "" : "s"}),{" "}
          <Money minor={plan.totalInterest} compact /> of it interest.
          {more.doneMonth && more.totalInterest < plan.totalInterest ? (
            <>
              {" "}
              Paying <Money minor={extra} compact /> more a month saves{" "}
              <Money minor={plan.totalInterest - more.totalInterest} compact />
              {more.months < plan.months
                ? ` and finishes ${plan.months - more.months} month${plan.months - more.months === 1 ? "" : "s"} sooner`
                : ""}
              .
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-callout text-warning-text">
          At this amount the interest outruns the payments; it never clears. Try a higher monthly amount.
        </p>
      )}
      <ol className="flex flex-col gap-1" aria-label="Order of payoff">
        {plan.lines.map((l) => (
          <li key={l.debt.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-callout">
            <span className="grid size-6 place-items-center rounded-full bg-fill text-footnote font-semibold">
              {l.order}
            </span>
            <span className="min-w-0 flex-1 truncate">{l.debt.name}</span>
            <span className="text-label-secondary">
              {l.clearMonth ? monthLabel(l.clearMonth, { short: true }) : "—"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- forms ---------- */

function DebtForm({
  open,
  onOpenChange,
  debt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  debt: DebtDoc | null;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={debt ? "Edit debt" : "New debt"}>
      <DebtFields key={debt?.id ?? "new"} debt={debt} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function DebtFields({ debt, onDone }: { debt: DebtDoc | null; onDone: () => void }) {
  const actions = useActions();
  const todayDay = useToday();
  const [name, setName] = useState(debt?.name ?? "");
  const [direction, setDirection] = useState<DebtDoc["direction"]>(debt?.direction ?? "owe");
  const [kind, setKind] = useState<DebtDoc["kind"]>(debt?.kind ?? "loan");
  const [principal, setPrincipal] = useState<number | null>(debt?.principal ?? null);
  const [startDate, setStartDate] = useState(debt?.startDate ?? todayDay);
  const [rate, setRate] = useState(debt?.interestRate != null ? String(debt.interestRate) : "");
  const [minimum, setMinimum] = useState<number | null>(debt?.minimumPayment ?? null);
  const [dueDay, setDueDay] = useState(debt?.dueDay == null ? "" : debt.dueDay >= 31 ? "last" : String(debt.dueDay));
  const [personId, setPersonId] = useState<string | null>(debt?.personId ?? null);
  const [goalId, setGoalId] = useState<string | null>(debt?.goalId ?? null);
  const save = async () => {
    if (!name.trim() || !principal) return;
    const fields = {
      name: name.trim(),
      direction,
      kind: personId ? ("person" as const) : kind,
      principal,
      startDate,
      interestRate: rate.trim() ? Math.max(0, Number(rate)) || 0 : null,
      minimumPayment: minimum,
      dueDay: !dueDay.trim()
        ? null
        : dueDay.trim().toLowerCase().startsWith("l")
          ? 31
          : Math.min(31, Math.max(1, Number(dueDay) || 1)),
      personId,
    };
    if (debt) {
      await actions.updateDebt(debt.id, fields);
      if (goalId && goalId !== debt.goalId) {
        if (debt.goalId) await actions.unlinkDebt(debt);
        await actions.linkDebtToGoal({ ...debt, ...fields }, goalId);
      } else if (!goalId && debt.goalId) await actions.unlinkDebt(debt);
    } else {
      const id = await actions.createDebt(fields);
      if (goalId) {
        const created = await actions.getDebt(id);
        if (created) await actions.linkDebtToGoal(created, goalId);
      }
    }
    onDone();
  };
  const chip = (on: boolean) =>
    cn(
      "h-8 rounded-full px-3 text-footnote font-medium",
      on ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4 pb-2"
    >
      <div role="radiogroup" aria-label="Direction" className="flex rounded-md bg-fill p-0.5">
        {(
          [
            ["owe", "I owe"],
            ["owed", "Owed to me"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={direction === v}
            onClick={() => setDirection(v)}
            className={cn(
              "h-8 flex-1 rounded-[8px] text-footnote font-medium",
              direction === v ? "bg-surface text-label shadow-1" : "text-label-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Field label="What">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={direction === "owe" ? "e.g. Car loan, Visa card, Mum" : "e.g. Tunde, Deposit with landlord"}
        />
      </Field>
      <AmountInput value={principal} onChange={(m) => setPrincipal(m)} label={debt ? "Amount" : "Amount now"} />
      {personId ? null : (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind">
          {DEBT_KINDS.filter((k) => k !== "person").map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={chip(kind === k)}
            >
              {DEBT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Interest % a year">
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Due day of month">
          <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="5, or last" />
        </Field>
        <Field label="Minimum a month">
          <Input
            inputMode="decimal"
            defaultValue={minimum != null ? String(minimum / 100) : ""}
            onChange={(e) =>
              setMinimum(
                e.target.value.trim() ? Math.round(Number(e.target.value.replace(/[^\d.]/g, "")) * 100) || null : null,
              )
            }
            placeholder="0"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          label="Since"
          placeholder="Since"
          value={startDate}
          todayDay={todayDay}
          onChange={(d) => setStartDate(d ?? todayDay)}
        />
        <PersonPicker value={personId} onChange={setPersonId} />
        {direction === "owe" ? <GoalPicker value={goalId} onChange={setGoalId} /> : null}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!name.trim() || !principal}>
          {debt ? "Save" : "Add debt"}
        </Button>
      </div>
    </form>
  );
}

export function PayForm({
  open,
  onOpenChange,
  debt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  debt: DebtDoc | null;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={debt ? (debt.direction === "owe" ? `Payment on ${debt.name}` : `Money back from ${debt.name}`) : "Payment"}
    >
      {debt ? <PayFields key={debt.id} debt={debt} onDone={() => onOpenChange(false)} /> : null}
    </Modal>
  );
}

function PayFields({ debt, onDone }: { debt: DebtDoc; onDone: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const accounts = useAccounts() ?? [];
  const transactions = useTransactions() ?? [];
  const state = debtState(debt, transactions, todayDay);
  const [amount, setAmount] = useState<number | null>(
    debt.minimumPayment && debt.minimumPayment <= state.balance ? debt.minimumPayment : null,
  );
  const [accountId, setAccountId] = useState<string | null>(debt.accountId ?? accounts[0]?.id ?? null);
  const [date, setDate] = useState(todayDay);
  const current = accounts.find((a) => a.id === accountId);
  const save = async () => {
    if (!amount) return;
    await actions.payDebt(debt, amount, { accountId, date });
    toast({ message: amount >= state.balance ? "Cleared!" : "Payment recorded" });
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
      <AmountInput value={amount} onChange={(m) => setAmount(m)} autoFocus />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAmount(state.balance)}
          className="h-8 rounded-full bg-fill px-3 text-footnote font-medium hover:bg-fill-strong"
        >
          Settle in full (<Money minor={state.balance} compact />)
        </button>
        {debt.minimumPayment ? (
          <button
            type="button"
            onClick={() => setAmount(debt.minimumPayment)}
            className="h-8 rounded-full bg-fill px-3 text-footnote font-medium hover:bg-fill-strong"
          >
            Minimum (<Money minor={debt.minimumPayment} compact />)
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          label="Day"
          placeholder="Day"
          value={date}
          todayDay={todayDay}
          onChange={(d) => setDate(d ?? todayDay)}
        />
        {accounts.length ? (
          <Picker
            label={debt.direction === "owe" ? "From account" : "To account"}
            value={accountId}
            options={[{ value: null, label: "No account" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
            onChange={setAccountId}
            trigger={
              <ChipButton aria-label={debt.direction === "owe" ? "From account" : "To account"}>
                {current ? current.name : <span className="text-label-tertiary">Account</span>}
              </ChipButton>
            }
          />
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!amount}>
          Record
        </Button>
      </div>
    </form>
  );
}

/** The goal page's view of the debts tied to it (5D). */
export function GoalDebts({ goalId }: { goalId: string }) {
  const debts = (useDebts({ includeArchived: true }) ?? []).filter((d) => d.goalId === goalId);
  const transactions = useTransactions() ?? [];
  const todayDay = useToday();
  const [paying, setPaying] = useState<DebtDoc | null>(null);
  if (!debts.length) return null;
  return (
    <>
      <SectionLabel count={debts.length}>Clearing it</SectionLabel>
      <div className="flex flex-col gap-2">
        {debts.map((d) => (
          <DebtCard
            key={d.id}
            debt={d}
            state={debtState(d, transactions, todayDay)}
            onPay={() => setPaying(d)}
            compact
          />
        ))}
      </div>
      <PayForm open={paying != null} onOpenChange={(o) => !o && setPaying(null)} debt={paying} />
    </>
  );
}
