"use client";

import { Archive, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { HBars } from "@/components/insights/charts";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useSync } from "@/components/app/sync-provider";
import { useActions } from "@/features/actions";
import {
  useAccounts,
  useDebts,
  useHoldingValues,
  useHoldings,
  useSavingsPots,
  type HoldingDoc,
  type TransactionDoc,
} from "@/features/data";
import {
  allocation,
  HOLDING_TYPE_LABEL,
  holdingSummary,
  netWorth,
  netWorthSeries,
  type HoldingFields,
} from "@/features/money/holdings";
import { formatMoney, monthLabel, parseAmount, toMajor } from "@/features/money/model";
import { useToday } from "@/features/use-today";
import { HOLDING_TYPES } from "@/lib/sync/entities";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { motion } from "motion/react";
import { AmountInput, Money, useCurrency } from "./amount";

const PRICED: HoldingFields["type"][] = ["stock", "etf", "crypto"];

/** 5E: the Investments tab — net worth, what you hold, and how it's spread. */
export function Investments({ transactions }: { transactions: TransactionDoc[] }) {
  const actions = useActions();
  const engine = useSync();
  const toast = useToast();
  const currency = useCurrency();
  const todayDay = useToday();
  const holdingsQ = useHoldings();
  const holdings = useMemo(() => holdingsQ ?? [], [holdingsQ]);
  const values = useHoldingValues() ?? [];
  const accounts = useAccounts() ?? [];
  const pots = useSavingsPots() ?? [];
  const debts = useDebts() ?? [];
  const [editing, setEditing] = useState<HoldingDoc | "new" | null>(null);
  const [valuing, setValuing] = useState<HoldingDoc | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const input = { accounts, pots, debts, holdings, holdingValues: values, transactions };
  const nw = netWorth(input, currency, todayDay);
  const series = netWorthSeries(input, currency, todayDay);
  const alloc = allocation(holdings, currency);
  const anyPriced = holdings.some((h) => PRICED.includes(h.type) && h.symbol);
  const total = holdings.reduce((s, h) => s + holdingSummary(h, currency).value, 0);
  const cost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const refresh = async () => {
    setRefreshing(true);
    const res = await fetch("/api/money/prices", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    // The server wrote the prices; pull them down now rather than at the next scheduled sync.
    if (res) await engine.sync().catch(() => undefined);
    setRefreshing(false);
    toast({ message: res ? `${res.priced} price${res.priced === 1 ? "" : "s"} updated` : "Couldn't fetch prices" });
  };

  return (
    <>
      <section aria-label="Net worth" className="mb-4 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised">
        <p className="text-footnote text-label-secondary">Net worth</p>
        <p className="text-title1 tabular">
          <Money minor={nw.total} compact />
        </p>
        <p className="mt-1 text-footnote text-label-secondary">
          Accounts <Money minor={nw.accounts} compact /> · pots <Money minor={nw.pots} compact /> · holdings{" "}
          <Money minor={nw.holdings} compact />
          {nw.owed ? (
            <>
              {" "}
              · owed to you <Money minor={nw.owed} compact />
            </>
          ) : null}
          {nw.debts ? (
            <>
              {" "}
              · debts −<Money minor={nw.debts} compact />
            </>
          ) : null}
        </p>
        {series.some((s) => s.total) ? <NetWorthChart series={series} /> : null}
      </section>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <SectionLabel count={holdings.length}>Holdings</SectionLabel>
        <span className="flex flex-wrap items-center gap-2">
          {anyPriced ? (
            <Button
              variant="secondary"
              icon={<RefreshCw className="size-4" />}
              loading={refreshing}
              onClick={() => void refresh()}
            >
              Refresh prices
            </Button>
          ) : null}
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New holding
          </Button>
        </span>
      </div>
      {holdings.length ? (
        <>
          <p className="mb-2 text-footnote text-label-secondary">
            Worth <Money minor={total} compact /> on <Money minor={cost} compact /> put in
            {cost ? (
              <>
                {" "}
                (<Gain minor={total - cost} pct={(total - cost) / cost} />)
              </>
            ) : null}
            .
          </p>
          <ul className="flex flex-col" aria-label="Holdings">
            {holdings.map((h) => {
              const s = holdingSummary(h, currency);
              return (
                <li key={h.id} className="flex h-14 items-center gap-3 rounded-md px-2 hover:bg-fill">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fill text-label-secondary">
                    <TrendingUp className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{h.name}</span>
                    <span className="block truncate text-footnote text-label-tertiary">
                      {HOLDING_TYPE_LABEL[h.type]}
                      {h.symbol ? ` · ${h.symbol}` : ""}
                      {h.quantity !== 1 || h.symbol
                        ? ` · ${h.quantity} × ${s.priced ? formatMoney(Math.round(h.price! * 100), currency) : "?"}`
                        : ""}
                      {s.priced && h.priceAt ? ` · as of ${new Date(h.priceAt).toLocaleDateString()}` : ""}
                      {!s.priced && h.symbol ? " · no price yet" : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <Money minor={s.value} compact className="block" />
                    {s.gainPct != null ? <Gain minor={s.gain} pct={s.gainPct} className="block text-footnote" /> : null}
                  </span>
                  <Menu
                    trigger={<IconButton label={`More for ${h.name}`} icon={<MoreHorizontal className="size-4" />} />}
                    align="end"
                  >
                    <MenuItem icon={<Pencil />} onSelect={() => setEditing(h)}>
                      Edit
                    </MenuItem>
                    {!s.priced ? (
                      <MenuItem icon={<TrendingUp />} onSelect={() => setValuing(h)}>
                        Update value
                      </MenuItem>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem icon={<Archive />} onSelect={() => void actions.archiveHolding(h.id, true)}>
                      Archive
                    </MenuItem>
                    <MenuItem icon={<Trash2 />} destructive onSelect={() => void actions.deleteHolding(h.id)}>
                      Delete
                    </MenuItem>
                  </Menu>
                </li>
              );
            })}
          </ul>
          {alloc.length > 1 ? (
            <>
              <SectionLabel>Spread</SectionLabel>
              <HBars
                label="Holdings by type"
                rows={alloc.map((a) => ({
                  key: a.type,
                  label: HOLDING_TYPE_LABEL[a.type],
                  value: a.value,
                  display: `${Math.round(a.share * 100)}%`,
                }))}
              />
            </>
          ) : null}
        </>
      ) : (
        <p className="text-callout text-label-secondary">
          Stocks, funds, crypto, a fixed deposit, property. Add what you hold and what it cost; stocks, funds and crypto
          with a symbol are priced every day, the rest you value by hand. Orbit shows what it&rsquo;s worth and your net
          worth, and never tells you what to buy.
        </p>
      )}
      <HoldingForm
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        holding={editing === "new" ? null : editing}
      />
      <ValueForm open={valuing != null} onOpenChange={(o) => !o && setValuing(null)} holding={valuing} />
    </>
  );
}

function Gain({ minor, pct, className }: { minor: number; pct: number; className?: string }) {
  return (
    <span className={cn("tabular", minor > 0 && "text-success-text", minor < 0 && "text-danger-text", className)}>
      <Money minor={minor} signed compact /> · {minor >= 0 ? "+" : "−"}
      {Math.abs(Math.round(pct * 1000) / 10)}%
    </span>
  );
}

function NetWorthChart({ series }: { series: { month: string; total: number }[] }) {
  const currency = useCurrency();
  const { transition } = useOrbitMotion();
  const W = 600;
  const H = 120;
  const pad = { l: 8, r: 8, t: 10, b: 20 };
  const min = Math.min(0, ...series.map((s) => s.total));
  const max = Math.max(1, ...series.map((s) => s.total));
  const x = (i: number) => pad.l + (i / Math.max(1, series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - ((v - min) / (max - min)) * (H - pad.t - pad.b);
  const path = series.map((s, i) => `${i ? "L" : "M"}${x(i)} ${y(s.total)}`).join(" ");
  const area = `${path} L${x(series.length - 1)} ${y(min)} L${x(0)} ${y(min)} Z`;
  return (
    <figure className="m-0 mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Net worth over the last twelve months"
      >
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--separator)" />
        <motion.path
          d={area}
          fill="var(--accent)"
          fillOpacity={0.12}
          initial={false}
          animate={{ d: area }}
          transition={transition("gentle")}
        />
        <motion.path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          initial={false}
          animate={{ d: path }}
          transition={transition("gentle")}
        />
        {series.map((s, i) =>
          i % 3 === 0 || i === series.length - 1 ? (
            <text
              key={s.month}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--label-tertiary)"
            >
              {monthLabel(s.month, { short: true }).replace(/ \d{4}$/, "")}
            </text>
          ) : null,
        )}
      </svg>
      <table className="sr-only">
        <caption>Net worth by month</caption>
        <tbody>
          {series.map((s) => (
            <tr key={s.month}>
              <th scope="row">{monthLabel(s.month)}</th>
              <td>{formatMoney(s.total, currency, { compact: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function HoldingForm({
  open,
  onOpenChange,
  holding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holding: HoldingDoc | null;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={holding ? "Edit holding" : "New holding"}>
      <HoldingFieldsForm key={holding?.id ?? "new"} holding={holding} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function HoldingFieldsForm({ holding, onDone }: { holding: HoldingDoc | null; onDone: () => void }) {
  const actions = useActions();
  const currency = useCurrency();
  const [name, setName] = useState(holding?.name ?? "");
  const [type, setType] = useState<HoldingFields["type"]>(holding?.type ?? "stock");
  const [symbol, setSymbol] = useState(holding?.symbol ?? "");
  const [quantity, setQuantity] = useState(holding ? String(holding.quantity) : "1");
  const [cost, setCost] = useState<number | null>(holding?.costBasis ?? null);
  const [value, setValue] = useState(
    holding?.manualValue != null ? String(toMajor(holding.manualValue, currency)) : "",
  );
  const priced = PRICED.includes(type);
  const save = async () => {
    if (!name.trim()) return;
    const fields = {
      name: name.trim(),
      type,
      symbol: priced && symbol.trim() ? symbol.trim() : null,
      quantity: Math.max(0, Number(quantity) || 0),
      costBasis: cost ?? 0,
      manualValue:
        !priced || !symbol.trim()
          ? value.trim()
            ? parseAmount(value, currency)
            : null
          : (holding?.manualValue ?? null),
    };
    if (holding) await actions.updateHolding(holding.id, fields);
    else {
      const id = await actions.createHolding(fields);
      if (fields.manualValue != null) await actions.setHoldingValue(id, fields.manualValue);
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
      <Field label="Name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Apple, Bitcoin, Flat in Lekki, Fixed deposit"
        />
      </Field>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
        {HOLDING_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={chip(type === t)}
          >
            {HOLDING_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {priced ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={type === "crypto" ? "Coin id (e.g. bitcoin)" : "Ticker (e.g. AAPL)"}>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={type === "crypto" ? "bitcoin" : "AAPL"}
            />
          </Field>
          <Field label="Units">
            <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
        </div>
      ) : null}
      <AmountInput value={cost} onChange={(m) => setCost(m)} label="What it cost in all" />
      {!priced || !symbol.trim() ? (
        <Field label={`Worth today (${currency})`}>
          <Input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Same as cost"
          />
        </Field>
      ) : (
        <p className="text-footnote text-label-tertiary">
          Priced once a day{type === "crypto" ? " from CoinGecko" : " from Finnhub (needs the key in Vercel)"}, in{" "}
          {currency}.
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!name.trim()}>
          {holding ? "Save" : "Add holding"}
        </Button>
      </div>
    </form>
  );
}

function ValueForm({
  open,
  onOpenChange,
  holding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holding: HoldingDoc | null;
}) {
  const actions = useActions();
  const [value, setValue] = useState<number | null>(null);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={holding ? `${holding.name}: worth today` : "Worth today"}>
      {holding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value) void actions.setHoldingValue(holding.id, value).then(() => onOpenChange(false));
          }}
          className="flex flex-col gap-4 pb-2"
        >
          <AmountInput
            key={holding.id}
            value={holding.manualValue ?? holding.costBasis}
            onChange={(m) => setValue(m)}
            label="Worth today"
            autoFocus
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!value}>
              Save
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
