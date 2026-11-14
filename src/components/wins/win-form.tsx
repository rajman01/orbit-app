"use client";

import { useState } from "react";
import { AreaPicker, GoalPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useActions } from "@/features/actions";
import type { WinDoc } from "@/features/data";
import { useToday } from "@/features/use-today";

const area =
  "field-sizing-content min-h-16 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";

/** CAR-1: log a win, or edit one. */
export function WinForm({ win, open, onClose }: { win?: WinDoc | null; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={win ? "Edit win" : "Log a win"}>
      {open ? <Body key={win?.id ?? "new"} win={win} onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ win, onClose }: { win?: WinDoc | null; onClose: () => void }) {
  const actions = useActions();
  const todayDay = useToday();
  const [title, setTitle] = useState(win?.title ?? "");
  const [date, setDate] = useState(win?.date ?? todayDay);
  const [description, setDescription] = useState(win?.description ?? "");
  const [impact, setImpact] = useState(win?.impact ?? "");
  const [areaId, setAreaId] = useState<string | null>(win?.areaId ?? null);
  const [goalId, setGoalId] = useState<string | null>(win?.goalId ?? null);
  const [links, setLinks] = useState((win?.links ?? []).join("\n"));
  const valid = title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const fields = {
      title: title.trim().slice(0, 200),
      date,
      description,
      impact,
      areaId,
      goalId,
      links: links
        .split("\n")
        .map((l) => l.trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 10),
    };
    if (win) await actions.updateWin(win.id, fields);
    else await actions.createWin(fields);
    onClose();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 pb-2">
      <Field label="What did you achieve?">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </Field>
      <Field label="When">
        <Input type="date" value={date} max={todayDay} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </Field>
      <Field label="What happened">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={area} />
      </Field>
      <Field label="Impact">
        <textarea
          value={impact}
          onChange={(e) => setImpact(e.target.value)}
          placeholder="Numbers, who it helped, what it changed"
          className={area}
        />
      </Field>
      <Field label="Links (one per line)">
        <textarea value={links} onChange={(e) => setLinks(e.target.value)} className={area} />
      </Field>
      <div className="grid grid-cols-[96px_1fr] items-center gap-2 text-callout">
        <span className="text-footnote text-label-secondary">Area</span>
        <div>
          <AreaPicker value={areaId} onChange={setAreaId} />
        </div>
        <span className="text-footnote text-label-secondary">Goal</span>
        <div>
          <GoalPicker value={goalId} areaId={areaId} onChange={setGoalId} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          {win ? "Save" : "Log win"}
        </Button>
      </div>
    </form>
  );
}
