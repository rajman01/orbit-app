"use client";

import { useSettings } from "@/features/data";
import { formatMoney, minorPerMajor, parseAmount, toMajor } from "@/features/money/model";
import { cn } from "@/lib/cn";

/** The one currency money is kept in (D47). */
export function useCurrency(): string {
  return useSettings().currency ?? "USD";
}

/** An amount, formatted in the main currency; `signed` colours income green and spending plain. */
export function Money({
  minor,
  signed = false,
  compact = false,
  className,
}: {
  minor: number;
  signed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const currency = useCurrency();
  return (
    <span
      className={cn(
        "tabular",
        signed && minor > 0 && "text-success-text",
        signed && minor < 0 && "text-label",
        className,
      )}
    >
      {formatMoney(minor, currency, { compact, sign: signed })}
    </span>
  );
}

/** A big amount field: digits and one decimal point, kept as minor units. */
export function AmountInput({
  value,
  onChange,
  label = "Amount",
  autoFocus,
  className,
}: {
  value: number | null;
  onChange: (minor: number | null, text: string) => void;
  label?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const currency = useCurrency();
  const symbol = formatMoney(0, currency, { compact: true }).replace(/[\d.,\s]/g, "");
  return (
    <label className={cn("flex items-baseline gap-1 rounded-lg bg-surface-sunken px-4 py-3", className)}>
      <span className="text-title2 text-label-tertiary">{symbol}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder="0"
        defaultValue={value != null ? String(toMajor(value, currency)) : ""}
        onChange={(e) => onChange(parseAmount(e.target.value, currency), e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-display outline-none placeholder:text-label-tertiary"
        step={1 / minorPerMajor(currency)}
      />
    </label>
  );
}
