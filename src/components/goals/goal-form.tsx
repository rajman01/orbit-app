"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useActions } from "@/features/actions";

/** Create a goal: title, area, target date, and the first next step (GOAL-6 from the start). */
export function NewGoalDialog({
  open,
  onOpenChange,
  areaId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  areaId?: string | null;
}) {
  const actions = useActions();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<string | null>(areaId ?? null);
  const [target, setTarget] = useState("");
  const [firstTask, setFirstTask] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const goalId = await actions.createGoal({ title: title.trim(), areaId: area, targetDate: target || null });
    if (firstTask.trim()) await actions.createTask({ title: firstTask.trim(), goalId, areaId: area, status: "todo" });
    setSaving(false);
    setTitle("");
    setTarget("");
    setFirstTask("");
    onOpenChange(false);
    router.push(`/goal?id=${goalId}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New goal"
      description="An outcome you want, with a date and a first step."
      width={480}
    >
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field label="Goal">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Land a senior engineering role"
            required
          />
        </Field>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">Area</span>
            <AreaPicker value={area} onChange={setArea} />
          </div>
          <Field label="Target date">
            <Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="w-44" />
          </Field>
        </div>
        <Field label="First step (optional)">
          <Input value={firstTask} onChange={(e) => setFirstTask(e.target.value)} placeholder="Update my CV summary" />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!title.trim()}>
            Create goal
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
