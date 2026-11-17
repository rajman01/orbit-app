"use client";

import { motion } from "motion/react";
import { useCurrency } from "@/components/money/amount";
import { formatMoney, monthLabel } from "@/features/money/model";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/** 5B: money in (green) and out (grey) per month, hand-drawn like the other charts (D39). */
export function InOutChart({
  rows,
  label,
}: {
  rows: { month: string; income: number; expense: number }[];
  label: string;
}) {
  const currency = useCurrency();
  const { transition } = useOrbitMotion();
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expense]));
  const W = 600;
  const H = 150;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const slot = (W - pad.l - pad.r) / Math.max(1, rows.length);
  const bw = Math.min(28, slot * 0.3);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const money = (v: number) => formatMoney(v, currency, { compact: true });
  if (!rows.some((r) => r.income || r.expense)) {
    return (
      <p role="img" aria-label={`${label}: nothing yet`} className="text-callout text-label-secondary">
        Nothing yet
      </p>
    );
  }
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--separator)" />
        {rows.map((r, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={r.month}>
              <motion.rect
                x={cx - bw - 2}
                width={bw}
                rx={3}
                fill="var(--success)"
                initial={false}
                animate={{ y: y(r.income), height: H - pad.b - y(r.income) }}
                transition={transition("gentle")}
              />
              <motion.rect
                x={cx + 2}
                width={bw}
                rx={3}
                fill="var(--fill-strong)"
                initial={false}
                animate={{ y: y(r.expense), height: H - pad.b - y(r.expense) }}
                transition={transition("gentle")}
              />
              <text x={cx} y={H - 7} textAnchor="middle" fontSize={11} fill="var(--label-tertiary)">
                {monthLabel(r.month, { short: true }).replace(/ \d{4}$/, "")}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-caption text-label-tertiary">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-success" aria-hidden /> In
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-fill-strong" aria-hidden /> Out
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <th scope="row">{monthLabel(r.month)}</th>
              <td>In {money(r.income)}</td>
              <td>Out {money(r.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
