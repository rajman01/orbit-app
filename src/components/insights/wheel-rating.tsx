"use client";

import Link from "next/link";
import { useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { Radar } from "@/components/insights/charts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { type Area, type AreaRatingDoc } from "@/features/data";
import { startingScores, type AreaRatingFields } from "@/features/insights/model";
import { useToday } from "@/features/use-today";

/**
 * AREA-4: rate each area 1–10 for how it's going and how much it matters. Starts from the last
 * rating, so only what changed needs moving; the last rating shows as a dashed outline.
 */
export function WheelRatingForm({
  areas,
  last,
  onSaved,
  submitLabel = "Save rating",
}: {
  areas: Area[];
  last: AreaRatingDoc | undefined;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const actions = useActions();
  const toast = useToast();
  const today = useToday();
  const [scores, setScores] = useState<AreaRatingFields["scores"]>(() => startingScores(areas, last));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (areaId: string, patch: Partial<{ score: number; importance: number }>) =>
    setScores((s) => s.map((x) => (x.areaId === areaId ? { ...x, ...patch } : x)));
  const prev = new Map((last?.scores ?? []).map((s) => [s.areaId, s.score]));
  const byId = new Map(areas.map((a) => [a.id, a]));

  if (!areas.length)
    return (
      <p className="text-callout text-label-secondary">
        Add your life areas first (career, health, relationships…), then rate them here.{" "}
        <Link href="/areas" className="font-semibold text-accent-text">
          Go to Areas
        </Link>
      </p>
    );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await actions.saveAreaRating(today, { scores, note: note.trim() });
        toast({ message: "Wheel of Life saved" });
        setSaving(false);
        onSaved?.();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex justify-center">
        <Radar
          axes={scores.map((s) => ({ key: s.areaId, label: byId.get(s.areaId)?.name ?? "" }))}
          current={scores.map((s) => s.score)}
          previous={last ? scores.map((s) => prev.get(s.areaId) ?? 0) : undefined}
          size={240}
        />
      </div>
      <ul className="flex flex-col gap-3" aria-label="Areas to rate">
        {scores.map((s) => {
          const a = byId.get(s.areaId);
          if (!a) return null;
          return (
            <li key={s.areaId} className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken p-3">
              <span className="flex items-center gap-2 text-callout font-semibold">
                <AreaIcon icon={a.icon} color={a.color} /> {a.name}
              </span>
              <Slider
                label={`How ${a.name} is going`}
                short="Going"
                value={s.score}
                onChange={(v) => set(s.areaId, { score: v })}
              />
              <Slider
                label={`How much ${a.name} matters`}
                short="Matters"
                value={s.importance}
                onChange={(v) => set(s.areaId, { importance: v })}
              />
            </li>
          );
        })}
      </ul>
      <label className="flex flex-col gap-1.5">
        <span className="text-footnote font-medium text-label-secondary">Anything behind the numbers? (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          className="field-sizing-content min-h-16 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!scores.length}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Slider({
  label,
  short,
  value,
  onChange,
}: {
  label: string;
  short: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-3 text-footnote text-label-secondary">
      {short}
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-[var(--accent)]"
      />
      <span className="text-right font-semibold text-label tabular">{value}</span>
    </label>
  );
}

/** The rating in a dialog, from Insights and the Areas page. */
export function WheelRatingDialog({
  open,
  onOpenChange,
  areas,
  last,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  areas: Area[];
  last: AreaRatingDoc | undefined;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Wheel of Life"
      description="How is each area going, and how much does it matter to you right now? 1 is low, 10 is high."
      width={520}
    >
      {open ? (
        <div className="mt-4 max-h-[70dvh] overflow-y-auto pr-1">
          <WheelRatingForm areas={areas} last={last} onSaved={() => onOpenChange(false)} />
        </div>
      ) : null}
    </Dialog>
  );
}
