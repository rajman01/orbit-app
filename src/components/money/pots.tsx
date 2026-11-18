"use client";

import { Archive, Link2, Link2Off, PiggyBank, Plus, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DatePicker, GoalPicker } from "@/components/tasks/pickers";
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
  useGoal,
  useSavingsPots,
  useTransactions,
  type PotDoc,
  type TransactionDoc,
} from "@/features/data";
import { formatMoney, monthLabel } from "@/features/money/model";
import { potProjection, type PotProjection } from "@/features/money/pots";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { AmountInput, Money, useCurrency } from "./amount";

/** 5C: the Pots tab — saving towards things, each with a target, a date and a projection. */
export function Pots({ transactions }: { transactions: TransactionDoc[] }) {
  const pots = useSavingsPots() ?? [];
  const todayDay = useToday();
  const [editing, setEditing] = useState<PotDoc | "new" | null>(null);
  const [contributing, setContributing] = useState<PotDoc | null>(null);
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel count={pots.length}>Savings pots</SectionLabel>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New pot
        </Button>
      </div>
      {pots.length ? (
        <ul className="flex flex-col gap-3" aria-label="Savings pots">
          {pots.map((p) => (
            <li key={p.id}>
              <PotCard
                pot={p}
                projection={potProjection(p, transactions, todayDay)}
                onContribute={() => setContributing(p)}
                onEdit={() => setEditing(p)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-callout text-label-secondary">
          A pot is money set aside for one thing: a trip, a laptop, an emergency fund, the move. Give it a target and a
          date, put money in as you go, and tie it to a goal so it shows on your roadmap.
        </p>
      )}
      <PotForm
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        pot={editing === "new" ? null : editing}
      />
      <ContributeForm
        open={contributing != null}
        onOpenChange={(o) => !o && setContributing(null)}
        pot={contributing}
      />
    </>
  );
}

/** One pot: balance of target, a bar, where it's heading, and what to do. Also used on the goal page. */
export function PotCard({
  pot,
  projection: p,
  onContribute,
  onEdit,
  compact = false,
}: {
  pot: PotDoc;
  projection: PotProjection;
  onContribute: () => void;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const actions = useActions();
  const toast = useToast();
  const router = useRouter();
  const goal = useGoal(pot.goalId);
  const share = pot.target ? Math.min(1, p.balance / pot.target) : 0;
  return (
    <section
      aria-label={`Pot: ${pot.name}`}
      className={cn(
        "flex flex-col gap-2 rounded-xl p-4",
        compact ? "bg-surface-sunken" : "bg-surface shadow-1 dark:bg-surface-raised",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-accent-fill text-accent-text">
          <PiggyBank className="size-4" aria-hidden />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-headline">{pot.name}</h3>
        {p.done ? <span className="text-footnote font-medium text-success-text">Reached</span> : null}
        {onEdit ? (
          <Menu
            trigger={<IconButton label={`More for ${pot.name}`} icon={<Target className="size-4" />} />}
            align="end"
          >
            <MenuItem icon={<Plus />} onSelect={onEdit}>
              Edit
            </MenuItem>
            {pot.goalId ? (
              <>
                <MenuItem icon={<Target />} onSelect={() => router.push(`/goal?id=${pot.goalId}`)}>
                  Open goal
                </MenuItem>
                <MenuItem icon={<Link2Off />} onSelect={() => void actions.unlinkPot(pot)}>
                  Unlink from goal
                </MenuItem>
              </>
            ) : (
              <MenuItem
                icon={<Link2 />}
                onSelect={async () => {
                  const id = await actions.makePotGoal(pot);
                  toast({ message: "Goal created" });
                  router.push(`/goal?id=${id}`);
                }}
              >
                Make this a goal
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem icon={<Archive />} onSelect={() => void actions.archivePot(pot.id, true)}>
              Archive
            </MenuItem>
            <MenuItem icon={<Trash2 />} destructive onSelect={() => void actions.deletePot(pot.id)}>
              Delete
            </MenuItem>
          </Menu>
        ) : null}
      </div>
      <p className="text-title3 tabular">
        <Money minor={p.balance} compact />
        {pot.target ? (
          <span className="text-callout font-normal text-label-secondary">
            {" "}
            of <Money minor={pot.target} compact />
          </span>
        ) : null}
      </p>
      {pot.target ? (
        <span
          className="block h-2 overflow-hidden rounded-full bg-fill"
          role="img"
          aria-label={`${Math.round(share * 100)}% saved`}
        >
          <span className="block h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
        </span>
      ) : null}
      <p className="text-footnote text-label-secondary">
        <Projection pot={pot} p={p} />
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="default" onClick={onContribute}>
          Put money in
        </Button>
        {compact ? null : <CoachAboutButton subject={{ kind: "pot", id: pot.id }} title={pot.name} compact />}
        {goal && !compact ? (
          <Link
            href={`/goal?id=${goal.id}`}
            className="flex h-control items-center gap-1 rounded-md px-3 text-footnote font-medium text-accent-text hover:bg-fill"
          >
            <Target className="size-3.5" aria-hidden /> {goal.title}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Projection({ pot, p }: { pot: PotDoc; p: PotProjection }) {
  const currency = useCurrency();
  if (p.done) return <>Target reached. Keep going, or set a new one.</>;
  if (!pot.target) return <>No target yet. Set one to see when you&rsquo;ll get there.</>;
  const parts: string[] = [];
  if (p.monthlyRate > 0 && p.reachMonth)
    parts.push(
      `At ${formatMoney(p.monthlyRate, currency, { compact: true })} a month, you reach it in ${monthLabel(p.reachMonth)}.`,
    );
  else parts.push("Nothing put in over the last three months yet.");
  if (pot.targetDate && p.neededPerMonth != null)
    parts.push(
      p.monthsLeft === 0
        ? `The target date has passed; ${formatMoney(p.left, currency, { compact: true })} to go.`
        : `To make ${monthLabel(pot.targetDate.slice(0, 7), { short: true })}: ${formatMoney(p.neededPerMonth, currency, { compact: true })} a month.`,
    );
  return <>{parts.join(" ")}</>;
}

function PotForm({
  open,
  onOpenChange,
  pot,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pot: PotDoc | null;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={pot ? "Edit pot" : "New savings pot"}>
      <PotFields key={pot?.id ?? "new"} pot={pot} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function PotFields({ pot, onDone }: { pot: PotDoc | null; onDone: () => void }) {
  const actions = useActions();
  const todayDay = useToday();
  const [name, setName] = useState(pot?.name ?? "");
  const [target, setTarget] = useState<number | null>(pot?.target ?? null);
  const [targetDate, setTargetDate] = useState<string | null>(pot?.targetDate ?? null);
  const [goalId, setGoalId] = useState<string | null>(pot?.goalId ?? null);
  const save = async () => {
    if (!name.trim()) return;
    const fields = { name: name.trim(), target: target ?? 0, targetDate };
    if (pot) {
      await actions.updatePot(pot.id, fields);
      if (goalId && goalId !== pot.goalId) {
        if (pot.goalId) await actions.unlinkPot(pot);
        await actions.linkPotToGoal({ ...pot, ...fields }, goalId);
      } else if (!goalId && pot.goalId) await actions.unlinkPot(pot);
      else if (pot.keyResultId && target !== pot.target) {
        await actions.updateKeyResult(pot.keyResultId, { target: (target ?? 0) / 100 });
      }
    } else {
      const id = await actions.createPot(fields);
      if (goalId) {
        const created = await actions.getPot(id);
        if (created) await actions.linkPotToGoal(created, goalId);
      }
    }
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
      <Field label="What for">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Canada fund, Emergency fund, New laptop"
        />
      </Field>
      <AmountInput value={target} onChange={(m) => setTarget(m)} label="Target" />
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          label="Target date"
          placeholder="By when?"
          value={targetDate}
          todayDay={todayDay}
          onChange={setTargetDate}
        />
        <GoalPicker value={goalId} onChange={setGoalId} />
      </div>
      <p className="text-footnote text-label-tertiary">
        Tied to a goal, the pot becomes a key result on it (&ldquo;Save ₦X for …&rdquo;) that follows the balance, so
        saving moves the goal along.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={!name.trim()}>
          {pot ? "Save" : "Add pot"}
        </Button>
      </div>
    </form>
  );
}

export function ContributeForm({
  open,
  onOpenChange,
  pot,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pot: PotDoc | null;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={pot ? `Put money in ${pot.name}` : "Put money in"}>
      {pot ? <ContributeFields key={pot.id} pot={pot} onDone={() => onOpenChange(false)} /> : null}
    </Modal>
  );
}

function ContributeFields({ pot, onDone }: { pot: PotDoc; onDone: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const accounts = useAccounts() ?? [];
  const transactions = useTransactions() ?? [];
  const [amount, setAmount] = useState<number | null>(null);
  const [out, setOut] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(pot.accountId ?? accounts[0]?.id ?? null);
  const [date, setDate] = useState(todayDay);
  const balance = potProjection(pot, transactions, todayDay).balance;
  const current = accounts.find((a) => a.id === accountId);
  const save = async () => {
    if (!amount) return;
    await actions.contributeToPot(pot, amount, { accountId, date, out });
    toast({ message: out ? "Taken out" : "Put in" });
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
      <div role="radiogroup" aria-label="Direction" className="flex rounded-md bg-fill p-0.5">
        {(
          [
            [false, "Put in"],
            [true, "Take out"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={out === v}
            onClick={() => setOut(v)}
            className={cn(
              "h-8 flex-1 rounded-[8px] text-footnote font-medium",
              out === v ? "bg-surface text-label shadow-1" : "text-label-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <AmountInput value={amount} onChange={(m) => setAmount(m)} autoFocus />
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
            label={out ? "To account" : "From account"}
            value={accountId}
            options={[{ value: null, label: "No account" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
            onChange={setAccountId}
            trigger={
              <ChipButton aria-label={out ? "To account" : "From account"}>
                {current ? current.name : <span className="text-label-tertiary">Account</span>}
              </ChipButton>
            }
          />
        ) : null}
      </div>
      <p className="text-footnote text-label-tertiary">
        In the pot now: <Money minor={balance} compact />
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={!amount || (out && amount > balance)}>
          {out ? "Take out" : "Put in"}
        </Button>
      </div>
    </form>
  );
}

/** The goal page's view of the pots tied to it (5C). */
export function GoalPots({ goalId }: { goalId: string }) {
  const pots = (useSavingsPots() ?? []).filter((p) => p.goalId === goalId);
  const transactions = useTransactions() ?? [];
  const todayDay = useToday();
  const [contributing, setContributing] = useState<PotDoc | null>(null);
  if (!pots.length) return null;
  return (
    <>
      <SectionLabel count={pots.length}>Saving for it</SectionLabel>
      <div className="flex flex-col gap-2">
        {pots.map((p) => (
          <PotCard
            key={p.id}
            pot={p}
            projection={potProjection(p, transactions, todayDay)}
            onContribute={() => setContributing(p)}
            compact
          />
        ))}
      </div>
      <ContributeForm
        open={contributing != null}
        onOpenChange={(o) => !o && setContributing(null)}
        pot={contributing}
      />
    </>
  );
}
