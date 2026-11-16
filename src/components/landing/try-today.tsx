"use client";

import { AlertTriangle, Pause, Play, RotateCcw, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SwipeRow } from "@/components/tasks/swipe-row";
import { Checkbox } from "@/components/ui/checkbox";
import { formatClock } from "@/features/focus/model";
import { SKIP_REASONS, type SkipReason } from "@/features/today/model";
import { cn } from "@/lib/cn";

/**
 * A working Today on the landing page: tick tasks, put one off and get asked why, start the
 * five-minute timer. It reuses the app's checkbox, swipe row, skip reasons and clock; the data is
 * three sample tasks held in memory. Nothing is saved or sent anywhere.
 */

interface DemoTask {
  id: string;
  title: string;
  step: string;
  area: string;
  postponed: number;
  done: boolean;
  later: string | null;
}

const START: DemoTask[] = [
  {
    id: "a",
    title: "Update my CV",
    step: "Open the doc and rewrite the summary",
    area: "var(--area-blue)",
    postponed: 3,
    done: false,
    later: null,
  },
  {
    id: "b",
    title: "Call mum",
    step: "After dinner",
    area: "var(--area-pink)",
    postponed: 0,
    done: false,
    later: null,
  },
  {
    id: "c",
    title: "Move £50 to savings",
    step: "Open the banking app",
    area: "var(--area-green)",
    postponed: 0,
    done: false,
    later: null,
  },
];

const SESSION = 300;
const SHOWN: SkipReason[] = ["too_big", "unclear", "no_time", "low_energy", "avoiding"];

/** What Orbit does with each reason (a short version of the real skip flow). */
const RESPONSE: Partial<Record<SkipReason, { text: string; action: "start" | "later" | "step" }>> = {
  too_big: { text: "Let’s make it smaller. First step:", action: "step" },
  unclear: { text: "Write the very next step. Something like:", action: "step" },
  no_time: { text: "Moved to Thursday, which has room.", action: "later" },
  low_energy: { text: "Try the five-minute version. You can stop after.", action: "start" },
  avoiding: { text: "Honest. Start with just five minutes: that’s the whole commitment.", action: "start" },
};

export function TryToday() {
  const [tasks, setTasks] = useState(START);
  const [xp, setXp] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [focus, setFocus] = useState<{ id: string; left: number; running: boolean } | null>(null);

  // The focus timer: one tick a second while running; done when it reaches zero.
  useEffect(() => {
    if (!focus?.running) return;
    const t = setInterval(
      () =>
        setFocus((f) => {
          if (!f) return f;
          if (f.left > 1) return { ...f, left: f.left - 1 };
          return { ...f, left: 0, running: false };
        }),
      1000,
    );
    return () => clearInterval(t);
  }, [focus?.running]);

  const patch = (id: string, p: Partial<DemoTask>) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const setDone = (task: DemoTask, done: boolean) => {
    patch(task.id, { done });
    // A bonus for finishing something you'd been putting off, like in the app.
    const amount = 10 + (task.postponed >= 3 ? 15 : 0);
    setXp((x) => Math.max(0, x + (done ? amount : -amount)));
    if (done && focus?.id === task.id) setFocus(null);
    if (asking === task.id) {
      setAsking(null);
      setReason(null);
    }
  };
  const askWhy = (task: DemoTask) => {
    setAsking(task.id);
    setReason(null);
  };
  const reset = () => {
    setTasks(START);
    setXp(0);
    setAsking(null);
    setReason(null);
    setFocus(null);
  };

  const asked = tasks.find((t) => t.id === asking) ?? null;
  const focusTask = tasks.find((t) => t.id === focus?.id) ?? null;
  const open = tasks.filter((t) => !t.later);
  const doneCount = open.filter((t) => t.done).length;

  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div className="overflow-hidden rounded-[28px] border border-separator bg-bg shadow-4">
        <div className="flex items-end justify-between gap-3 px-6 pt-6 pb-3">
          <div>
            <p className="text-[12px] font-medium text-label-secondary">A sample day</p>
            <p className="text-[28px] leading-tight font-bold tracking-[-0.02em]">Today</p>
          </div>
          <p
            aria-live="polite"
            className="flex h-8 items-center gap-1.5 rounded-full bg-[linear-gradient(90deg,var(--xp-from),var(--xp-to))] px-3 text-[13px] font-bold text-white tabular-nums"
          >
            <Star className="size-3.5" fill="currentColor" aria-hidden /> {xp} XP
          </p>
        </div>

        <p className="px-6 text-[11px] font-semibold tracking-[0.06em] text-label-tertiary uppercase">
          Must-dos · {doneCount} of {open.length} done
        </p>
        <ul aria-label="Sample must-dos" className="flex flex-col px-3 pt-1 pb-3">
          {open.map((t) => (
            <li key={t.id}>
              <SwipeRow onSwipeRight={() => setDone(t, !t.done)} onSwipeLeft={() => askWhy(t)} done={t.done}>
                <div className="flex min-h-14 items-center gap-2 rounded-md px-1 py-1.5">
                  <Checkbox checked={t.done} onChange={(d) => setDone(t, d)} label={`Done: ${t.title}`} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[16px]", t.done && "text-label-tertiary line-through")}>
                      {t.title}
                    </span>
                    <span className="flex items-center gap-1.5 text-[13px] text-label-secondary">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: t.area }} />
                      {t.postponed >= 3 && !t.done ? (
                        <span className="flex items-center gap-1 font-medium text-warning-text">
                          <AlertTriangle className="size-3.5" aria-hidden /> Put off {t.postponed} times
                        </span>
                      ) : (
                        <span className="truncate">{t.step}</span>
                      )}
                    </span>
                  </span>
                  {!t.done ? (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setFocus({ id: t.id, left: SESSION, running: true })}
                        aria-label={`Start 5 minutes on ${t.title}`}
                        className="grid size-9 place-items-center rounded-full bg-accent-fill text-accent-text hover:brightness-95"
                      >
                        <Play className="size-4" fill="currentColor" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => askWhy(t)}
                        className="h-9 rounded-full px-3 text-[13px] font-medium text-label-secondary hover:bg-fill"
                      >
                        <span className="sr-only">{t.title}: </span>Not today
                      </button>
                    </span>
                  ) : null}
                </div>
              </SwipeRow>
            </li>
          ))}
        </ul>

        {tasks.some((t) => t.later) ? (
          <p className="px-6 pb-3 text-[13px] text-label-secondary">
            Moved to Thursday:{" "}
            {tasks
              .filter((t) => t.later)
              .map((t) => t.title)
              .join(", ")}
          </p>
        ) : null}

        {asked ? (
          <div
            role="group"
            aria-label="Why are you putting this off?"
            className="mx-3 mb-3 rounded-[20px] border border-separator bg-surface p-5 shadow-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[18px] font-semibold tracking-[-0.01em]">Why are you putting this off?</p>
                <p className="mt-0.5 text-[14px] text-label-secondary">“{asked.title}”</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAsking(null)}
                className="grid size-8 shrink-0 place-items-center rounded-full text-label-secondary hover:bg-fill"
              >
                <X className="size-4" />
              </button>
            </div>
            {!reason ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {SHOWN.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setReason(id)}
                    className="h-10 rounded-full bg-fill px-4 text-[14px] font-medium hover:bg-fill-strong"
                  >
                    {SKIP_REASONS.find((r) => r.id === id)!.label}
                  </button>
                ))}
              </div>
            ) : (
              <div aria-live="polite" className="mt-4">
                <p className="text-[15px]">{RESPONSE[reason]!.text}</p>
                {RESPONSE[reason]!.action === "step" ? (
                  <p className="mt-2 rounded-[12px] bg-accent-fill px-3 py-2.5 text-[15px] font-medium text-accent-text">
                    {asked.step} (2 min)
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {RESPONSE[reason]!.action === "later" ? (
                    <button
                      type="button"
                      onClick={() => {
                        patch(asked.id, { later: "thu", postponed: asked.postponed + 1 });
                        setAsking(null);
                      }}
                      className="h-10 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
                    >
                      Move it
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFocus({ id: asked.id, left: SESSION, running: true });
                        setAsking(null);
                      }}
                      className="flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
                    >
                      <Play className="size-3.5" fill="currentColor" aria-hidden /> Start 5 minutes
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setReason(null)}
                    className="h-10 rounded-full px-4 text-[14px] font-medium text-label-secondary hover:bg-fill"
                  >
                    Another reason
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {focus && focusTask ? (
          <div
            role="group"
            aria-label="Focus timer"
            className="dark mx-3 mb-3 flex items-center gap-4 rounded-[20px] px-5 py-4 text-label"
            style={{ background: "radial-gradient(ellipse at 30% 0%, #12303f, #05090d 80%)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-label-secondary">{focusTask.title}</p>
              <p className="text-[34px] leading-none font-bold tabular-nums" aria-live="off">
                {formatClock(focus.left * 1000)}
              </p>
              <p className="mt-1 text-[12px] text-label-secondary">
                {focus.left === 0 ? "Five minutes done. Keep going or tick it off." : "Just five minutes"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFocus({ ...focus, running: !focus.running })}
              aria-label={focus.running ? "Pause" : "Resume"}
              disabled={focus.left === 0}
              className="grid size-10 place-items-center rounded-full bg-fill text-label disabled:opacity-40"
            >
              {focus.running ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setDone(focusTask, true)}
              className="h-10 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
            >
              Done
            </button>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-separator px-6 py-3 text-[13px] text-label-secondary">
          <span>On a phone, swipe a task right or left.</span>
          <button type="button" onClick={reset} className="flex items-center gap-1.5 hover:text-label">
            <RotateCcw className="size-3.5" aria-hidden /> Start over
          </button>
        </div>
      </div>
    </div>
  );
}
