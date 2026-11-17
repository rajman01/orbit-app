"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { DatePicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Picker, ChipButton } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useAccounts, useCategories, type TransactionDoc } from "@/features/data";
import type { TransactionKind } from "@/features/money/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { AmountInput } from "./amount";

const KINDS: { value: TransactionKind; label: string }[] = [
  { value: "expense", label: "Spent" },
  { value: "income", label: "Received" },
  { value: "transfer", label: "Transfer" },
];

/** Log or edit one transaction (5A): amount, what kind, category, account, day and a note. */
export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: TransactionDoc | null;
  defaults?: Partial<Pick<TransactionDoc, "kind" | "accountId" | "categoryId">>;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={transaction ? "Edit transaction" : "Log money"}>
      <Form
        key={transaction?.id ?? "new"}
        transaction={transaction ?? null}
        defaults={defaults}
        onDone={() => onOpenChange(false)}
      />
    </Modal>
  );
}

function Form({
  transaction,
  defaults,
  onDone,
}: {
  transaction: TransactionDoc | null;
  defaults?: Partial<Pick<TransactionDoc, "kind" | "accountId" | "categoryId">>;
  onDone: () => void;
}) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const accounts = useAccounts() ?? [];
  const categories = useCategories() ?? [];
  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? defaults?.kind ?? "expense");
  const [amount, setAmount] = useState<number | null>(transaction?.amount ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.categoryId ?? defaults?.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(
    transaction?.accountId ?? defaults?.accountId ?? accounts[0]?.id ?? null,
  );
  const [toAccountId, setToAccountId] = useState<string | null>(transaction?.toAccountId ?? null);
  const [date, setDate] = useState<string>(transaction?.date ?? todayDay);
  const [note, setNote] = useState(transaction?.note ?? "");
  const [busy, setBusy] = useState(false);

  const shown = categories.filter((c) => c.kind === (kind === "income" ? "income" : "expense"));
  const canSave = amount != null && amount > 0 && (kind !== "transfer" || toAccountId !== accountId);

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    const fields = {
      kind,
      amount: amount!,
      categoryId: kind === "transfer" ? null : categoryId,
      accountId,
      toAccountId: kind === "transfer" ? toAccountId : null,
      date,
      note: note.trim(),
    };
    if (transaction) await actions.updateTransaction(transaction.id, fields);
    else {
      await actions.createTransaction(fields);
      toast({
        message: kind === "income" ? "Income logged" : kind === "transfer" ? "Transfer logged" : "Spending logged",
      });
    }
    onDone();
  };

  const accountPicker = (value: string | null, onChange: (id: string | null) => void, label: string) => {
    const current = accounts.find((a) => a.id === value);
    return (
      <Picker
        label={label}
        value={value}
        options={[{ value: null, label: "No account" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
        onChange={onChange}
        trigger={
          <ChipButton aria-label={label}>
            {current ? current.name : <span className="text-label-tertiary">{label}</span>}
          </ChipButton>
        }
      />
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4 pb-2"
    >
      <div role="radiogroup" aria-label="Kind" className="flex rounded-md bg-fill p-0.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => setKind(k.value)}
            className={cn(
              "h-8 flex-1 rounded-[8px] text-footnote font-medium",
              kind === k.value ? "bg-surface text-label shadow-1" : "text-label-secondary",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <AmountInput value={amount} onChange={(m) => setAmount(m)} autoFocus={!transaction} />
      {kind !== "transfer" ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={categoryId === c.id}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-medium",
                categoryId === c.id ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
              )}
            >
              <AreaIcon
                icon={c.icon}
                color={categoryId === c.id ? null : c.color}
                className={cn("size-3.5", categoryId === c.id && "text-on-accent")}
              />
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
      <input
        aria-label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={kind === "income" ? "From whom, or what for" : "What was it?"}
        maxLength={500}
        className="h-control w-full rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          label="Day"
          placeholder="Day"
          value={date}
          todayDay={todayDay}
          onChange={(d) => setDate(d ?? todayDay)}
        />
        {accounts.length
          ? accountPicker(accountId, setAccountId, kind === "transfer" ? "From account" : "Account")
          : null}
        {kind === "transfer" ? accountPicker(toAccountId, setToAccountId, "To account") : null}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        {transaction ? (
          <Button
            type="button"
            variant="ghost"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              await actions.deleteTransaction(transaction.id);
              toast({ message: "Transaction deleted" });
              onDone();
            }}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={!canSave} loading={busy}>
          {transaction ? "Save" : "Log it"}
        </Button>
      </div>
    </form>
  );
}
