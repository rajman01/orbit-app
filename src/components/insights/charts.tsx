"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/**
 * Phase 3A: small hand-drawn charts (no chart library). One accent colour; the current or
 * highlighted bar is the accent and the rest are muted; values are labelled directly; each chart
 * has an accessible summary and, where it helps, a table for screen readers.
 */

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Shown above the bar (defaults to the value). */
  display?: string;
  /** In progress (the current cycle or week): drawn lighter. */
  partial?: boolean;
  highlight?: boolean;
}

/**
 * Vertical bars with the value on top and a label under each. Drawn with HTML, not SVG, so text
 * stays its real size however wide the card is.
 */
export function BarChart({
  bars,
  label,
  max: fixedMax,
  height = 120,
  unit = "",
}: {
  bars: Bar[];
  label: string;
  max?: number;
  height?: number;
  unit?: string;
}) {
  const { transition } = useOrbitMotion();
  const max = fixedMax ?? Math.max(1, ...bars.map((b) => b.value));
  const showEvery = bars.length > 10 ? Math.ceil(bars.length / 7) : 1;
  if (bars.every((b) => !b.value))
    return (
      <p
        role="img"
        aria-label={`${label}: nothing yet`}
        className="grid place-items-center rounded-lg bg-surface-sunken text-callout text-label-tertiary"
        style={{ height: Math.round(height * 0.6) }}
      >
        Nothing yet
      </p>
    );
  return (
    <figure className="m-0">
      <div role="img" aria-label={label} className="flex items-end gap-1 border-b border-separator" style={{ height }}>
        {bars.map((b, i) => {
          const strong = b.highlight || (!b.partial && i === bars.length - 1);
          return (
            <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              {b.value > 0 ? (
                <span className="mb-1 text-caption text-label-secondary tabular">
                  {b.display ?? `${b.value}${unit}`}
                </span>
              ) : null}
              <motion.span
                aria-hidden
                className="block w-full max-w-7 rounded-t-[4px]"
                style={{
                  background: strong ? "var(--accent)" : "var(--label-tertiary)",
                  opacity: b.partial ? 0.35 : strong ? 1 : 0.45,
                }}
                initial={false}
                animate={{ height: `${(b.value / max) * (height - 22)}px` }}
                transition={transition("gentle")}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-1 flex gap-1">
        {bars.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 truncate text-center text-caption text-label-tertiary">
            {i % showEvery === 0 || i === bars.length - 1 ? b.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{b.display ?? `${b.value}${unit}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface Row {
  key: string;
  label: React.ReactNode;
  value: number;
  display: string;
  /** A colour for the bar (an area's colour); defaults to the accent. */
  color?: string;
}

/** Horizontal bars, one per row, sorted by the caller. */
export function HBars({ rows, label, max: fixedMax }: { rows: Row[]; label: string; max?: number }) {
  const { transition } = useOrbitMotion();
  const max = fixedMax ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-callout">
          <span className="truncate text-label-secondary">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-fill">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: r.color ?? "var(--accent)" }}
              initial={false}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={transition("gentle")}
            />
          </span>
          <span className="w-12 text-right text-footnote text-label-secondary tabular">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

/** A ring showing done of total, with the share in the middle. */
export function Meter({ done, of, label }: { done: number; of: number; label: string }) {
  const share = of ? done / of : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <svg width={64} height={64} viewBox="0 0 64 64" role="img" aria-label={`${label}: ${done} of ${of}`}>
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--fill)" strokeWidth={6} />
        {share > 0 ? (
          <circle
            cx={32}
            cy={32}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${c * share} ${c}`}
            transform="rotate(-90 32 32)"
          />
        ) : null}
        <text x={32} y={36} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--label)">
          {of ? `${Math.round(share * 100)}%` : "–"}
        </text>
      </svg>
      <span className="text-footnote font-medium">{label}</span>
      <span className="text-caption text-label-tertiary tabular">
        {done} of {of}
      </span>
    </div>
  );
}

/** AREA-4: the Wheel of Life. Scores 1–10 on each spoke; the previous rating as a dashed outline. */
export function Radar({
  axes,
  current,
  previous,
  max = 10,
  size = 260,
  className,
}: {
  axes: { key: string; label: string }[];
  current: number[];
  previous?: number[];
  max?: number;
  size?: number;
  className?: string;
}) {
  const { transition } = useOrbitMotion();
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 44;
  const n = Math.max(axes.length, 3);
  const point = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * R * (v / max), cy + Math.sin(a) * R * (v / max)] as const;
  };
  const shape = (vals: number[]) =>
    vals
      .map((v, i) => point(i, v))
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ") + "Z";
  const summary = axes.map((a, i) => `${a.label} ${current[i] ?? 0}`).join(", ");
  if (axes.length < 3)
    return <p className="text-footnote text-label-secondary">Add at least three areas to see the wheel.</p>;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("h-auto w-full max-w-[320px]", className)}
      role="img"
      aria-label={`Wheel of Life: ${summary}`}
    >
      {[2, 4, 6, 8, 10].map((ring) => (
        <path key={ring} d={shape(axes.map(() => ring))} fill="none" stroke="var(--separator)" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = point(i, max);
        const [lx, ly] = point(i, max + 2.6);
        return (
          <g key={a.key}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--separator)" />
            <text
              x={lx}
              y={ly}
              textAnchor={Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end"}
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--label-secondary)"
            >
              {a.label.length > 12 ? `${a.label.slice(0, 11)}…` : a.label}
            </text>
          </g>
        );
      })}
      {previous ? (
        <path d={shape(previous)} fill="none" stroke="var(--label-tertiary)" strokeDasharray="4 4" strokeWidth={1.5} />
      ) : null}
      <motion.path
        initial={false}
        animate={{ d: shape(current) }}
        transition={transition("gentle")}
        fill="var(--accent)"
        fillOpacity={0.18}
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {current.map((v, i) => {
        const [x, y] = point(i, v);
        return <circle key={axes[i]?.key ?? i} cx={x} cy={y} r={3} fill="var(--accent)" />;
      })}
    </svg>
  );
}
