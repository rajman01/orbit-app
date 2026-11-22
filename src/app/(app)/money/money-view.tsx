"use client";

import { Archive, ChevronLeft, ChevronRight, Pencil, Plus, Upload, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { AreaIcon } from "@/components/areas/area-icon";
import { HBars } from "@/components/insights/charts";
import { Money, useCurrency } from "@/components/money/amount";
import { TransactionForm } from "@/components/money/transaction-form";
import { TransactionList } from "@/components/money/transaction-list";
import { Budgets } from "@/components/money/budgets";
import { Pots } from "@/components/money/pots";
import { Debts } from "@/components/money/debts";
import { Investments } from "@/components/money/investments";
import { Plan } from "@/components/money/plan";
import { ImportDialog } from "@/components/money/import-dialog";
import { InOutChart } from "@/components/money/in-out-chart";
import { dueOccurrences, upcomingOccurrences, type DueOccurrence } from "@/features/money/recurring";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { useActions } from "@/features/actions";
import { useAccounts, useCategories, useTransactions, type AccountDoc, type TransactionDoc } from "@/features/data";
import { areaColorVar } from "@/features/areas/model";
import {
  accountBalance,
  addMonthsTo,
  formatMoney,
  inOutByMonth,
  monthLabel,
  monthOf,
  monthSummary,
  parseAmount,
  spendByCategory,
  toMajor,
} from "@/features/money/model";
import { dayLabel } from "@/lib/dates";
import { useToday } from "@/features/use-today";
import { ACCOUNT_TYPES } from "@/lib/sync/entities";
import { cn } from "@/lib/cn";

type Tab = "overview" | "plan" | "transactions" | "budgets" | "pots" | "debts" | "invest" | "accounts";

/** Phase 5A: the Money page — this month at a glance, the ledger, and the accounts money sits in. */
export function MoneyView() {
  const actions = useActions();
  const params = useSearchParams();
  const router = useRouter();
  const todayDay = useToday();
  const currency = useCurrency();
  const tab = (params.get("tab") as Tab) || "overview";
  const month = params.get("m") ?? monthOf(todayDay);
  const transactions = useTransactions();
  const categories = useCategories();
  const [logging, setLogging] = useState(() => params.get("log") === "1");
  const [editing, setEditing] = useState<TransactionDoc | null>(null);
  const [importing, setImporting] = useState(false);

  // The default categories appear the first time Money is opened.
  useEffect(() => {
    if (categories && !categories.length) void actions.ensureDefaultCategories();
  }, [categories, actions]);

  const go = (next: Partial<{ tab: Tab; m: string }>) => {
    const q = new URLSearchParams();
    const t = next.tab ?? tab;
    const m = next.m ?? month;
    if (t !== "overview") q.set("tab", t);
    if (m !== monthOf(todayDay)) q.set("m", m);
    router.replace(`/money${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  const summary = useMemo(() => monthSummary(transactions ?? [], month), [transactions, month]);
  const due = useMemo(() => dueOccurrences(transactions ?? [], todayDay), [transactions, todayDay]);

  return (
    <>
      <PageHeader
        title="Money"
        subtitle={currency}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setLogging(true)}>
            Log
          </Button>
        }
      />
      <PageBody>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          {/* Eight tabs are wider than a phone: the strip scrolls, the page never does. */}
          <div className="max-w-full [scrollbar-width:none] overflow-x-auto">
            <Segmented
              label="Show"
              value={tab}
              onChange={(t) => go({ tab: t })}
              compact
              options={[
                { value: "overview", label: "Overview" },
                { value: "plan", label: "Plan" },
                { value: "transactions", label: "Transactions" },
                { value: "budgets", label: "Budgets" },
                { value: "pots", label: "Pots" },
                { value: "debts", label: "Debts" },
                { value: "invest", label: "Invest" },
                { value: "accounts", label: "Accounts" },
              ]}
            />
          </div>
          {tab === "transactions" ? (
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              Import CSV
            </Button>
          ) : null}
          {tab === "overview" || tab === "plan" || tab === "transactions" || tab === "budgets" ? (
            <div className="flex items-center gap-1">
              <IconButton
                label="Previous month"
                icon={<ChevronLeft className="size-5" />}
                onClick={() => go({ m: addMonthsTo(month, -1) })}
              />
              <span className="min-w-28 text-center text-callout font-medium">{monthLabel(month)}</span>
              <IconButton
                label="Next month"
                icon={<ChevronRight className="size-5" />}
                onClick={() => go({ m: addMonthsTo(month, 1) })}
              />
            </div>
          ) : null}
        </div>

        {transactions && !transactions.length && (tab === "overview" || tab === "transactions" || tab === "budgets") ? (
          <EmptyState
            icon={Wallet}
            title="Nothing logged yet"
            body="Log what you spend and receive, in a few taps, and Orbit shows where your money goes. Type “spent 12.50 lunch” in Quick Add, or press Log."
            action={<Button onClick={() => setLogging(true)}>Log something</Button>}
          />
        ) : null}

        {tab === "overview" && due.length ? <DueList due={due} /> : null}
        {tab === "overview" && transactions?.length ? (
          <Overview
            transactions={transactions}
            month={month}
            summary={summary}
            todayDay={todayDay}
            onOpen={setEditing}
            onAll={() => go({ tab: "transactions" })}
          />
        ) : null}
        {tab === "transactions" && transactions?.length ? (
          <MonthTransactions transactions={transactions} month={month} todayDay={todayDay} onOpen={setEditing} />
        ) : null}
        {tab === "budgets" ? <Budgets transactions={transactions ?? []} month={month} todayDay={todayDay} /> : null}
        {tab === "plan" ? <Plan transactions={transactions ?? []} month={month} /> : null}
        {tab === "pots" ? <Pots transactions={transactions ?? []} /> : null}
        {tab === "debts" ? <Debts transactions={transactions ?? []} /> : null}
        {tab === "invest" ? <Investments transactions={transactions ?? []} /> : null}
        {tab === "accounts" ? <Accounts transactions={transactions ?? []} /> : null}
      </PageBody>

      <TransactionForm open={logging} onOpenChange={setLogging} />
      <ImportDialog open={importing} onOpenChange={setImporting} />
      <TransactionForm open={editing != null} onOpenChange={(o) => !o && setEditing(null)} transaction={editing} />
      <span className="sr-only">{formatMoney(0, currency)}</span>
    </>
  );
}

function Overview({
  transactions,
  month,
  summary,
  todayDay,
  onOpen,
  onAll,
}: {
  transactions: TransactionDoc[];
  month: string;
  summary: { income: number; expense: number; net: number };
  todayDay: string;
  onOpen: (t: TransactionDoc) => void;
  onAll: () => void;
}) {
  const currency = useCurrency();
  const categories = useCategories({ includeArchived: true }) ?? [];
  const byCat = spendByCategory(transactions, month);
  const inMonth = transactions.filter((t) => monthOf(t.date) === month);
  return (
    <>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="This month">
        <Stat label="In" value={summary.income} />
        <Stat label="Out" value={summary.expense} />
        <Stat label="Left" value={summary.net} signed />
      </div>
      {byCat.length ? (
        <>
          <SectionLabel>Where it went</SectionLabel>
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
        </>
      ) : null}
      <Upcoming transactions={transactions} todayDay={todayDay} />
      <SectionLabel>Last six months</SectionLabel>
      <InOutChart rows={inOutByMonth(transactions, month)} label="Money in and out by month" />
      {inMonth.length ? (
        <>
          <div className="mt-6 mb-1 flex items-center justify-between">
            <SectionLabel count={inMonth.length}>Recent</SectionLabel>
            {inMonth.length > 8 ? (
              <button type="button" onClick={onAll} className="text-footnote font-medium text-accent-text">
                See all
              </button>
            ) : null}
          </div>
          <TransactionList transactions={inMonth} todayDay={todayDay} onOpen={onOpen} limit={8} />
        </>
      ) : (
        <p className="mt-6 text-callout text-label-secondary">Nothing logged in {monthLabel(month)}.</p>
      )}
    </>
  );
}

/** 5B: recurring entries that have come round; nothing is logged until confirmed. */
function DueList({ due }: { due: DueOccurrence[] }) {
  const actions = useActions();
  const todayDay = useToday();
  const categories = useCategories({ includeArchived: true }) ?? [];
  const label = (t: TransactionDoc) => t.note || categories.find((c) => c.id === t.categoryId)?.name || "Entry";
  return (
    <section aria-label="Due" className="mb-5 rounded-xl border border-separator bg-surface p-3">
      <h2 className="mb-2 text-footnote font-semibold text-label-secondary">Due · confirm what happened</h2>
      <ul className="flex flex-col gap-1">
        {due.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-md px-1 py-1">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body">{label(d.template)}</span>
              <span className="block text-footnote text-label-tertiary">
                {dayLabel(d.date, todayDay)} · <Money minor={d.template.amount} compact />
              </span>
            </span>
            <Button variant="secondary" onClick={() => void actions.confirmOccurrence(d, true)}>
              Skip
            </Button>
            <Button onClick={() => void actions.confirmOccurrence(d)}>Confirm</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Upcoming({ transactions, todayDay }: { transactions: TransactionDoc[]; todayDay: string }) {
  const categories = useCategories({ includeArchived: true }) ?? [];
  const next = upcomingOccurrences(transactions, todayDay);
  if (!next.length) return null;
  const label = (t: TransactionDoc) => t.note || categories.find((c) => c.id === t.categoryId)?.name || "Entry";
  return (
    <>
      <SectionLabel>Coming up</SectionLabel>
      <ul className="flex flex-col" aria-label="Coming up">
        {next.map((d) => (
          <li key={d.id} className="flex h-9 items-center gap-3 px-2 text-callout">
            <span className="min-w-0 flex-1 truncate">{label(d.template)}</span>
            <span className="text-label-secondary">{dayLabel(d.date, todayDay)}</span>
            <Money minor={d.template.kind === "income" ? d.template.amount : -d.template.amount} signed compact />
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="rounded-xl bg-surface p-3 shadow-1 dark:bg-surface-raised">
      <p className="text-footnote text-label-secondary">{label}</p>
      <p className="truncate text-title3">
        <Money minor={value} signed={signed} compact />
      </p>
    </div>
  );
}

function MonthTransactions({
  transactions,
  month,
  todayDay,
  onOpen,
}: {
  transactions: TransactionDoc[];
  month: string;
  todayDay: string;
  onOpen: (t: TransactionDoc) => void;
}) {
  const inMonth = transactions.filter((t) => monthOf(t.date) === month);
  if (!inMonth.length)
    return <p className="text-callout text-label-secondary">Nothing logged in {monthLabel(month)}.</p>;
  return <TransactionList transactions={inMonth} todayDay={todayDay} onOpen={onOpen} />;
}

/* ---------- accounts and categories ---------- */

function Accounts({ transactions }: { transactions: TransactionDoc[] }) {
  const actions = useActions();
  const accounts = useAccounts() ?? [];
  const categories = useCategories() ?? [];
  const [editing, setEditing] = useState<AccountDoc | "new" | null>(null);
  const total = accounts.reduce((s, a) => s + accountBalance(a, transactions), 0);
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel count={accounts.length}>Accounts</SectionLabel>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New account
        </Button>
      </div>
      {accounts.length ? (
        <ul className="flex flex-col">
          {accounts.map((a) => (
            <li key={a.id} className="flex h-row items-center gap-3 rounded-md px-2 hover:bg-fill">
              <span className="grid size-8 place-items-center rounded-full bg-fill">
                <Wallet className="size-4 text-label-secondary" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{a.name}</span>
                <span className="block text-footnote text-label-tertiary capitalize">{a.type}</span>
              </span>
              <Money minor={accountBalance(a, transactions)} />
              <Menu
                trigger={<IconButton label={`More for ${a.name}`} icon={<Pencil className="size-4" />} />}
                align="end"
              >
                <MenuItem icon={<Pencil />} onSelect={() => setEditing(a)}>
                  Edit
                </MenuItem>
                <MenuItem icon={<Archive />} onSelect={() => void actions.archiveAccount(a.id, true)}>
                  Archive
                </MenuItem>
              </Menu>
            </li>
          ))}
          <li className="flex h-row items-center justify-between px-2 text-callout font-semibold">
            <span>All accounts</span>
            <Money minor={total} />
          </li>
        </ul>
      ) : (
        <p className="text-callout text-label-secondary">
          Accounts are optional: add your bank, cash and cards to see what each holds. Without them, Money still tracks
          what comes in and goes out.
        </p>
      )}

      <SectionLabel count={categories.length}>Categories</SectionLabel>
      <ul className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <li key={c.id} className="flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-footnote">
            <AreaIcon icon={c.icon} color={c.color} className="size-3.5" />
            {c.name}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-footnote text-label-tertiary">
        Categories can be renamed or added in{" "}
        <Link href="/settings" className="text-accent-text">
          Settings
        </Link>{" "}
        soon; for now these are the set.
      </p>

      <AccountForm
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        account={editing === "new" ? null : editing}
      />
    </>
  );
}

function AccountForm({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account: AccountDoc | null;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={account ? "Edit account" : "New account"}>
      <AccountFields key={account?.id ?? "new"} account={account} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function AccountFields({ account, onDone }: { account: AccountDoc | null; onDone: () => void }) {
  const actions = useActions();
  const currency = useCurrency();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountDoc["type"]>(account?.type ?? "bank");
  const [opening, setOpening] = useState(account ? String(toMajor(account.openingBalance, currency)) : "");
  const save = async () => {
    if (!name.trim()) return;
    const openingBalance = opening.trim()
      ? (parseAmount(opening.replace("-", ""), currency) ?? 0) * (opening.trim().startsWith("-") ? -1 : 1)
      : 0;
    if (account) await actions.updateAccount(account.id, { name: name.trim(), type, openingBalance });
    else await actions.createAccount({ name: name.trim(), type, openingBalance });
    onDone();
  };
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Name">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. GTBank, Cash, Visa"
          />
        </Field>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "h-8 rounded-full px-3 text-footnote font-medium capitalize",
                type === t ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Field label={`Balance today (${currency})`}>
          <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={!name.trim()}>
            {account ? "Save" : "Add account"}
          </Button>
        </div>
      </form>
    </>
  );
}
