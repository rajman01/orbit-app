"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export const field =
  "h-control w-full min-w-0 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";
export const area =
  "field-sizing-content min-h-20 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";

/** Words or short phrases as removable chips; Enter or comma adds one. */
export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  max = 60,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts)
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-footnote font-medium text-label-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-sunken p-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="flex h-7 items-center gap-1 rounded-full bg-surface pr-1 pl-2.5 text-footnote shadow-1 dark:bg-surface-raised"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="grid size-5 place-items-center rounded-full text-label-tertiary hover:bg-fill"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => add(draft)}
          placeholder={values.length ? "" : placeholder}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-callout outline-none placeholder:text-label-tertiary"
        />
      </div>
    </div>
  );
}

/** An ordered list of lines (CV bullets) with ids kept stable. */
export function BulletList({
  label,
  bullets,
  onChange,
  newId,
  placeholder,
}: {
  label: string;
  bullets: { id: string; text: string }[];
  onChange: (b: { id: string; text: string }[]) => void;
  newId: () => string;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="sr-only">{label}</span>
      <ul aria-label={label} className="flex flex-col gap-1">
        {bullets.map((b, i) => (
          <li key={b.id} className="flex items-start gap-1.5">
            <span className="pt-2 text-label-tertiary">•</span>
            <textarea
              aria-label={`${label} ${i + 1}`}
              value={b.text}
              onChange={(e) => onChange(bullets.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))}
              rows={1}
              maxLength={500}
              className={cn(area, "min-h-9 py-1.5 text-callout")}
            />
            <button
              type="button"
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(bullets.filter((x) => x.id !== b.id))}
              className="mt-1 grid size-7 shrink-0 place-items-center rounded-full text-label-tertiary hover:bg-fill"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...bullets, { id: newId(), text: "" }])}
        className="flex h-8 w-fit items-center gap-1.5 rounded-md px-1 text-callout text-accent-text hover:bg-accent-fill"
      >
        <Plus className="size-4" /> {placeholder}
      </button>
    </div>
  );
}
