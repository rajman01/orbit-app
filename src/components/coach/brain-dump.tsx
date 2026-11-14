"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import type { CapturedTask } from "@/features/coach/capture";
import { PRIORITY_META } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";

/**
 * AI-8: paste anything (notes, a list, an email) and the coach pulls out the tasks. They're shown
 * for review (untick, rename) before anything is added to the Inbox.
 */
export function BrainDump({ initialText = "" }: { initialText?: string }) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const [open, setOpen] = useState(Boolean(initialText));
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<(CapturedTask & { keep: boolean })[] | null>(null);

  const sort = async () => {
    setError(null);
    if (!navigator.onLine) {
      setError("Sorting needs a connection. You can still add tasks one at a time with quick add.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/coach/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today: todayDay }),
      });
      const body = (await res.json().catch(() => ({}))) as { tasks?: CapturedTask[]; error?: string };
      if (!res.ok || !body.tasks) throw new Error(body.error ?? "Couldn't sort that right now. Try again.");
      if (!body.tasks.length) setError("No tasks found in that. Try writing what needs doing.");
      setFound(body.tasks.map((t) => ({ ...t, keep: true })));
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the coach. Check your connection." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const keep = (found ?? []).filter((t) => t.keep && t.title.trim());
    for (const t of keep) {
      await actions.createTask({
        title: t.title.trim(),
        description: t.notes ?? "",
        dueDate: t.dueDate,
        scheduledDate: t.scheduledDate,
        priority: t.priority,
        effort: t.effort,
        status: t.dueDate || t.scheduledDate ? "todo" : "inbox",
        createdBy: "capture",
      });
    }
    toast({ message: `Added ${keep.length} ${keep.length === 1 ? "task" : "tasks"}` });
    setFound(null);
    setText("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-lg border border-dashed border-separator px-4 py-3 text-left hover:bg-fill"
      >
        <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium">Brain dump</span>
          <span className="block text-footnote text-label-secondary">
            Paste notes, a list or an email. The coach turns it into tasks.
          </span>
        </span>
        <ChevronDown className="size-4 text-label-tertiary" aria-hidden />
      </button>
    );
  }

  return (
    <section aria-label="Brain dump" className="mb-6 flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-1">
      {found ? (
        <>
          <p className="text-headline">
            {found.length} {found.length === 1 ? "task" : "tasks"} found
          </p>
          <ul className="flex flex-col gap-1" aria-label="Tasks found">
            {found.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 py-1">
                <Checkbox
                  checked={t.keep}
                  label={`Keep ${t.title}`}
                  onChange={(keep) => setFound((f) => f!.map((x, j) => (j === i ? { ...x, keep } : x)))}
                />
                <span className="min-w-0 flex-1">
                  <input
                    aria-label="Task title"
                    value={t.title}
                    onChange={(e) => setFound((f) => f!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className={cn(
                      "w-full rounded-md bg-transparent px-1 text-body outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-accent",
                      !t.keep && "text-label-tertiary line-through",
                    )}
                  />
                  <span className="flex flex-wrap gap-x-2 px-1 text-footnote text-label-secondary">
                    {t.dueDate ? <span>Due {dayLabel(t.dueDate, todayDay).toLowerCase()}</span> : null}
                    {t.scheduledDate ? <span>Do {dayLabel(t.scheduledDate, todayDay).toLowerCase()}</span> : null}
                    {t.priority !== "none" ? <span>{PRIORITY_META[t.priority].label}</span> : null}
                    {t.effort ? <span>{t.effort} pts</span> : null}
                    {t.notes ? <span className="truncate">{t.notes}</span> : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFound(null)}>
              Back
            </Button>
            <Button disabled={!found.some((t) => t.keep && t.title.trim())} onClick={() => void add()}>
              Add {found.filter((t) => t.keep).length} to Orbit
            </Button>
          </div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-headline">Brain dump</span>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={5000}
              placeholder={
                "Call the landlord about the boiler\nbook dentist next week, pay rent by Friday!\nideas for mum's birthday"
              }
              className="field-sizing-content min-h-28 resize-none rounded-lg bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          {error ? (
            <p role="alert" className="text-callout text-label-secondary">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!text.trim()}
              icon={<Sparkles className="size-4" />}
              onClick={() => void sort()}
            >
              Turn into tasks
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
