"use client";

import { useState } from "react";
import { DatePicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import type { InteractionDoc } from "@/features/data";
import { INTERACTION_META, type InteractionType } from "@/features/people/model";
import { useToday } from "@/features/use-today";
import { INTERACTION_TYPES } from "@/lib/sync/entities";
import { chip } from "./person-form";

/** REL-4: log a call, message or meeting, with an optional follow-up task. Also edits an entry. */
export function LogInteraction({
  person,
  interaction,
  open,
  onClose,
}: {
  person: { id: string; name: string };
  interaction?: InteractionDoc | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={interaction ? "Edit entry" : `Log time with ${person.name}`}
    >
      {open ? (
        <Body key={interaction?.id ?? "new"} person={person} interaction={interaction} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function Body({
  person,
  interaction,
  onClose,
}: {
  person: { id: string; name: string };
  interaction?: InteractionDoc | null;
  onClose: () => void;
}) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const [type, setType] = useState<InteractionType>(interaction?.type ?? "call");
  const [date, setDate] = useState(interaction?.date ?? todayDay);
  const [notes, setNotes] = useState(interaction?.notes ?? "");
  const [following, setFollowing] = useState(false);
  const [followTitle, setFollowTitle] = useState("");
  const [followDay, setFollowDay] = useState<string | null>(null);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayDay && (!following || followTitle.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // Saved locally first (a few milliseconds), so leaving the page right away can't lose it.
    if (interaction) {
      await actions.updateInteraction(interaction.id, { type, date, notes: notes.trim() });
      onClose();
      return;
    }
    const { taskId } = await actions.logInteraction(
      person.id,
      { type, date, notes },
      following ? { title: followTitle, scheduledDate: followDay } : null,
    );
    onClose();
    toast({ message: taskId ? "Logged, with a follow-up task" : "Logged" });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 pb-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How">
        {INTERACTION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={chip(type === t)}
          >
            {INTERACTION_META[t].label}
          </button>
        ))}
      </div>
      <Field label="When">
        <Input type="date" value={date} max={todayDay} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </Field>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What did you talk about? Anything to remember?"
          className="field-sizing-content min-h-20 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
        />
      </Field>
      {!interaction ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-callout">
            <input
              type="checkbox"
              checked={following}
              onChange={(e) => setFollowing(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Add a follow-up task
          </label>
          {following ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Follow-up"
                autoFocus
                value={followTitle}
                onChange={(e) => setFollowTitle(e.target.value)}
                placeholder={`e.g. Send ${person.name.split(" ")[0]} the article`}
                className="min-w-0 flex-1"
              />
              <DatePicker
                label="Do it on"
                placeholder="Any day"
                value={followDay}
                todayDay={todayDay}
                onChange={setFollowDay}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          {interaction ? "Save" : "Log it"}
        </Button>
      </div>
    </form>
  );
}
