"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useActions } from "@/features/actions";
import type { Area } from "@/features/data";
import { areaColorVar } from "@/features/areas/model";
import { cn } from "@/lib/cn";
import { AREA_COLORS } from "@/lib/sync/entities";
import { AREA_ICONS } from "./area-icon";

/** Create or edit an area (PRD AREA-1). */
export function AreaDialog({
  open,
  onOpenChange,
  area,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  area?: Area;
}) {
  const actions = useActions();
  const [name, setName] = useState(area?.name ?? "");
  const [color, setColor] = useState<(typeof AREA_COLORS)[number]>(area?.color ?? "indigo");
  const [icon, setIcon] = useState(area?.icon ?? "circle");
  const [description, setDescription] = useState(area?.description ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onOpenChange(false);
    if (area) await actions.updateArea(area.id, { name: name.trim(), color, icon, description });
    else await actions.createArea({ name: name.trim(), color, icon, description });
    if (!area) {
      setName("");
      setDescription("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={area ? "Edit area" : "New area"} width={480}>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Health" required />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-footnote font-medium text-label-secondary">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  "size-8 rounded-full ring-offset-2 ring-offset-[var(--surface-raised)]",
                  color === c && "ring-2 ring-[var(--label)]",
                )}
                style={{ background: areaColorVar(c) }}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-footnote font-medium text-label-secondary">Icon</legend>
          <div className="flex flex-wrap gap-1">
            {Object.entries(AREA_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cn(
                  "grid size-9 place-items-center rounded-md",
                  icon === key ? "bg-accent-fill" : "hover:bg-fill",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} style={{ color: areaColorVar(color) }} />
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Description">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this area of life means to you"
          />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            {area ? "Save" : "Create area"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
