"use client";

import { Check, ChevronDown, Pause, Play, Plus, Square, Target } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useSync } from "@/components/app/sync-provider";
import { useMinuteNow } from "@/features/use-today";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { areaColorVar } from "@/features/areas/model";
import { useAllTasks, useArea, useGoal, useSettings, useTask } from "@/features/data";
import {
  addMinutes,
  breakRemainingMs,
  changePlan,
  elapsedMs,
  FOCUS_PRESETS,
  formatClock,
  isPaused,
  isTimeUp,
  keepGoing,
  activeSession,
  parseFocusState,
  sessionToState,
  stateFields,
  pause,
  plannedMinutes,
  remainingMs,
  resume,
  startBreak,
  workedMinutes,
  type FocusMode,
  type FocusState,
} from "@/features/focus/model";
import type { Task } from "@/features/tasks/model";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

interface FocusContext {
  active: FocusState | null;
  /** One-tap Start (PRD TODAY-4): opens focus mode with a 5-minute first session (FOC-3). */
  start: (task: Task, mode?: FocusMode) => Promise<void>;
  /** Brings the running session back to full screen ("Continue"). */
  open: () => void;
}

const Ctx = createContext<FocusContext | null>(null);

export function useFocus(): FocusContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFocus must be used inside <FocusProvider>");
  return c;
}

/** Earlier versions kept the timer only in local storage; carried over once into the synced session. */
const legacyKey = (userId: string) => `orbit:focus:${userId}`;
/** Which session this device has open full screen (a per-device choice, not synced). */
const openKey = (userId: string) => `orbit:focus-open:${userId}`;

function readOpen(userId: string): string | null {
  try {
    return localStorage.getItem(openKey(userId));
  } catch {
    return null;
  }
}
/** The session this device last started or opened: only that device pops up when time's up. */
const hereKey = (userId: string) => `orbit:focus-here:${userId}`;

function readHere(userId: string): string | null {
  try {
    return localStorage.getItem(hereKey(userId));
  } catch {
    return null;
  }
}

function writeOpen(userId: string, sessionId: string | null) {
  try {
    if (sessionId) {
      localStorage.setItem(openKey(userId), sessionId);
      localStorage.setItem(hereKey(userId), sessionId);
    }
    else localStorage.removeItem(openKey(userId));
  } catch {}
}

/**
 * DESIGN.md §11.15 — focus mode. The running session lives in the synced data, so every device
 * shows it and can pause, extend or end it; the timer is derived from timestamps, so reloads and
 * offline don't stop it. While a session runs, Orbit syncs every few seconds.
 */
export function FocusProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const actions = useActions();
  const toast = useToast();
  const settings = useSettings();
  const engine = useSync();
  const { db } = engine;
  const minute = useMinuteNow();
  const sessions = useLiveQuery(() => db.focusSessions.filter((s) => s.endedAt == null).toArray(), [db]);
  const doc = sessions ? activeSession(sessions, minute) : null;
  const state = useMemo(() => (doc ? sessionToState(doc) : null), [doc]);
  const [openId, setOpenId] = useState<string | null>(() => readOpen(user.id));
  const expanded = state != null && openId === state.sessionId;
  const setExpanded = useCallback(
    (v: boolean) => {
      const id = v ? (state?.sessionId ?? null) : null;
      writeOpen(user.id, id);
      setOpenId(id);
    },
    [state?.sessionId, user.id],
  );

  // Keep other devices close behind while a session runs (and this page is in front).
  useEffect(() => engine.setFastSync(state != null), [engine, state != null]); // eslint-disable-line react-hooks/exhaustive-deps

  // One-time carry-over of a timer from the old local-only storage.
  useEffect(() => {
    let legacy: FocusState | null = null;
    try {
      legacy = parseFocusState(localStorage.getItem(legacyKey(user.id)));
      localStorage.removeItem(legacyKey(user.id));
    } catch {}
    if (legacy) void actions.updateFocusSession(legacy.sessionId, stateFields(legacy));
  }, [actions, user.id]);

  // Writes go to the synced session; the live query brings the new state back here.
  const setState = useCallback(
    (next: (s: FocusState) => FocusState) => {
      if (state) void actions.updateFocusSession(state.sessionId, stateFields(next(state)));
    },
    [actions, state],
  );

  const start = useCallback(
    async (task: Task, mode: FocusMode = "five") => {
      if (state?.taskId === task.id) {
        setExpanded(true);
        return;
      }
      if (state) {
        // Another task is running (maybe left open on another device): wrap it up and switch.
        const end = Date.now();
        await actions.endFocusSession(state.sessionId, {
          endedAt: end,
          actualMinutes: workedMinutes(state, end),
          outcome: "progress",
          interruptions: state.interruptions,
          mode: state.mode,
          plannedMinutes: plannedMinutes(state),
        });
        await actions.cancelReminder(`rf${state.sessionId}`.slice(0, 40));
        toast({ message: "Ended your previous focus session" });
      }
      const preset = FOCUS_PRESETS.find((p) => p.mode === mode)!;
      const minutes = mode === "pomodoro" ? (settings.focusMinutes ?? 25) : preset.minutes;
      const id = await actions.startFocusSession(task, mode, minutes, Date.now());
      writeOpen(user.id, id);
      setOpenId(id);
    },
    [state, actions, settings.focusMinutes, toast, setExpanded, user.id],
  );

  const open = useCallback(() => setExpanded(true), [setExpanded]);
  const value = useMemo(() => ({ active: state, start, open }), [state, start, open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {state ? (
        <FocusSession
          key={state.sessionId}
          state={state}
          setState={setState}
          expanded={expanded}
          setExpanded={setExpanded}
          userId={user.id}
        />
      ) : null}
    </Ctx.Provider>
  );
}

const FOCUS_TAG = "orbit-focus";

async function closeFocusNotifications() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const n of (await reg?.getNotifications({ tag: FOCUS_TAG })) ?? []) n.close();
  } catch {}
}

/** True while the page is in the background (another app, a locked phone, another tab). */
function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.hidden,
    () => false,
  );
}

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** One line for the "Focusing on…" notification: what's happening and when it ends. */
export function focusSummary(s: FocusState, now: number, onBreak: boolean): string {
  if (onBreak && s.breakEndsAt) return `On a break until ${clockTime(s.breakEndsAt)}`;
  const left = remainingMs(s, now);
  const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (s.pausedAt != null)
    return left != null ? `Paused · ${minutes(left)} left` : `Paused · ${minutes(elapsedMs(s, now))} so far`;
  if (left == null) return `Started ${clockTime(s.startedAt)} · open session`;
  return `Ends at ${clockTime(now + left)} · ${minutes(left)} left`;
}

/** Re-renders every second while a session is running. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

type Stage = "work" | "timeUp" | "break" | "breakOver" | "outcome";

function FocusSession({
  state,
  setState,
  expanded,
  setExpanded,
  userId,
}: {
  state: FocusState;
  setState: (next: (s: FocusState) => FocusState) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  userId: string;
}) {
  const actions = useActions();
  const settings = useSettings();
  const task = useTask(state.taskId);
  const now = useNow(true);
  const [ending, setEnding] = useState(false);
  const focusMinutes = settings.focusMinutes ?? 25;
  const breakMinutes = settings.breakMinutes ?? 5;

  const breakLeft = breakRemainingMs(state, now);
  const stage: Stage = ending
    ? "outcome"
    : breakLeft != null
      ? breakLeft > 0
        ? "break"
        : "breakOver"
      : isTimeUp(state, now)
        ? "timeUp"
        : "work";

  const reminderId = `rf${state.sessionId}`.slice(0, 40);
  const finish = useCallback(
    async (
      outcome: "done" | "progress" | "stuck" | "abandoned",
      extra: { nextStep?: string; subtasks?: string[] } = {},
    ) => {
      const end = Date.now();
      await actions.endFocusSession(state.sessionId, {
        endedAt: end,
        actualMinutes: workedMinutes(state, end),
        outcome,
        interruptions: state.interruptions,
        mode: state.mode,
        plannedMinutes: plannedMinutes(state),
      });
      if (task) {
        if (outcome === "done") await actions.setTaskDone(task, true);
        if (outcome === "progress" && extra.nextStep?.trim())
          await actions.updateTask(task, { nextStep: extra.nextStep.trim() });
        for (const title of extra.subtasks ?? []) {
          if (title.trim()) {
            await actions.createTask({
              title: title.trim(),
              parentTaskId: task.id,
              status: "todo",
              areaId: task.areaId,
              goalId: task.goalId,
            });
          }
        }
      }
      await actions.cancelReminder(reminderId);
      setExpanded(false);
    },
    [actions, state, task, reminderId, setExpanded],
  );

  // Push "time's up" (PRD §12) even if Orbit is in the background or the phone is locked.
  const { plannedMs, pausedAt, pausedMs, breakEndsAt, startedAt } = state;
  const taskTitle = task?.title;
  useEffect(() => {
    if (breakEndsAt != null) {
      void actions.scheduleReminder(reminderId, {
        kind: "focus_end",
        title: "Break's over",
        body: taskTitle ? `Back to “${taskTitle}”?` : "Ready for the next block?",
        url: "/today",
        fireAt: breakEndsAt,
      });
    } else if (plannedMs != null && pausedAt == null) {
      void actions.scheduleReminder(reminderId, {
        kind: "focus_end",
        title: "Time's up",
        body: taskTitle ? `“${taskTitle}”: keep going, or call it done?` : "Keep going, or call it done?",
        url: "/today",
        fireAt: startedAt + pausedMs + plannedMs,
      });
    } else {
      void actions.cancelReminder(reminderId);
    }
  }, [actions, reminderId, plannedMs, pausedAt, pausedMs, breakEndsAt, startedAt, taskTitle]);

  // Leaving Orbit mid-session: a quiet "Focusing on…" notification with when it ends (PRD FOC-6).
  // Web apps can't keep a live countdown in a notification, so it states the end time instead,
  // and is refreshed when the session changes. The time's-up push replaces it (same tag).
  const hidden = useDocumentHidden();
  const live = stage === "work" || stage === "break";
  // Rounded to minutes, so the notification only changes when the text does.
  const summary = focusSummary(state, now, stage === "break");
  useEffect(() => {
    if (!hidden || !live || !taskTitle) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    void navigator.serviceWorker?.ready
      .then((r) =>
        r.showNotification(`Focusing: ${taskTitle}`, {
          body: summary,
          tag: FOCUS_TAG,
          silent: true,
          data: { url: "/today" },
        }),
      )
      .catch(() => {});
  }, [hidden, live, taskTitle, summary]);
  useEffect(() => {
    if (!hidden) void closeFocusNotifications();
  }, [hidden]);
  useEffect(() => () => void closeFocusNotifications(), []);

  // A deleted task ends its session.
  useEffect(() => {
    if (task === null) void finish("abandoned");
  }, [task, finish]);

  // Time's up: feedback once per planned block (DESIGN.md §9), even if the tab is in the background.
  const notified = useRef<string | null>(null);
  useEffect(() => {
    const key = stage === "timeUp" ? `w${state.plannedMs}` : stage === "breakOver" ? `b${state.breakEndsAt}` : null;
    if (!key || notified.current === key) return;
    notified.current = key;
    // Only the device that started or last opened the session pops up; the others keep the pill.
    if (readHere(userId) === state.sessionId) setExpanded(true);
    try {
      navigator.vibrate?.([20, 60, 20]);
    } catch {}
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      const body = stage === "timeUp" ? "Time's up. Keep going?" : "Break's over.";
      void navigator.serviceWorker?.ready
        .then((r) => r.showNotification(task?.title ?? "Focus", { body, tag: FOCUS_TAG }))
        .catch(() => {});
    }
  }, [stage, state.plannedMs, state.breakEndsAt, state.sessionId, setExpanded, task?.title, userId]);

  // Tab title shows the timer (FOC-6).
  const clock =
    stage === "break" || stage === "breakOver"
      ? formatClock(breakLeft ?? 0)
      : formatClock(remainingMs(state, now) ?? elapsedMs(state, now));
  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);
  useEffect(() => {
    const label =
      stage === "timeUp" ? "Time's up" : stage === "outcome" ? "Focus" : stage === "break" ? `Break ${clock}` : clock;
    document.title = `${label} · ${task?.title ?? "Focus"}`;
  }, [clock, stage, task?.title]);

  if (!task) return null;

  return (
    <AnimatePresence>
      {expanded ? (
        <FocusOverlay
          key="overlay"
          task={task}
          state={state}
          now={now}
          stage={stage}
          clock={clock}
          focusMinutes={focusMinutes}
          breakMinutes={breakMinutes}
          onMinimise={() => setExpanded(false)}
          onPause={() => setState((s) => pause(s, Date.now()))}
          onResume={() => setState((s) => resume(s, Date.now()))}
          onAddFive={() => setState((s) => addMinutes(s, 5, Date.now()))}
          onPlan={(mode, minutes) => setState((s) => changePlan(s, mode, minutes, Date.now()))}
          onKeepGoing={() => setState((s) => keepGoing(s, focusMinutes, Date.now()))}
          onBreak={() => setState((s) => startBreak(s, breakMinutes, Date.now()))}
          onEnd={() => setEnding(true)}
          onCancelEnd={() => setEnding(false)}
          onFinish={finish}
        />
      ) : (
        <FocusPill key="pill" task={task} clock={clock} stage={stage} onOpen={() => setExpanded(true)} />
      )}
    </AnimatePresence>
  );
}

function FocusPill({ task, clock, stage, onOpen }: { task: Task; clock: string; stage: Stage; onOpen: () => void }) {
  const { transition } = useOrbitMotion();
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-label={`Return to focus: ${task.title}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={transition("default")}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 flex h-11 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full py-1 pr-4 pl-3 text-callout font-medium shadow-2 material-popover lg:right-6 lg:bottom-6"
    >
      <span
        className={cn("size-2 rounded-full bg-accent", stage === "work" && "animate-pulse motion-reduce:animate-none")}
      />
      <span className="tabular">{stage === "timeUp" ? "Time's up" : clock}</span>
      <span className="max-w-48 truncate text-label-secondary">{task.title}</span>
    </motion.button>
  );
}

function FocusOverlay({
  task,
  state,
  now,
  stage,
  clock,
  focusMinutes,
  breakMinutes,
  onMinimise,
  onPause,
  onResume,
  onAddFive,
  onPlan,
  onKeepGoing,
  onBreak,
  onEnd,
  onCancelEnd,
  onFinish,
}: {
  task: Task;
  state: FocusState;
  now: number;
  stage: Stage;
  clock: string;
  focusMinutes: number;
  breakMinutes: number;
  onMinimise: () => void;
  onPause: () => void;
  onResume: () => void;
  onAddFive: () => void;
  onPlan: (mode: FocusMode, minutes: number | null) => void;
  onKeepGoing: () => void;
  onBreak: () => void;
  onEnd: () => void;
  onCancelEnd: () => void;
  onFinish: (
    outcome: "done" | "progress" | "stuck" | "abandoned",
    extra?: { nextStep?: string; subtasks?: string[] },
  ) => void;
}) {
  const { reduced } = useOrbitMotion();
  const area = useArea(task.areaId);
  const goal = useGoal(task.goalId);
  const paused = isPaused(state);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) onMinimise();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMinimise]);

  const planned = state.plannedMs;
  const elapsed = elapsedMs(state, now);
  const breakLeft = breakRemainingMs(state, now);
  const progress =
    stage === "break" || stage === "breakOver"
      ? 1 - (breakLeft ?? 0) / (breakMinutes * 60_000)
      : planned == null
        ? (elapsed % 60_000) / 60_000
        : Math.min(1, elapsed / planned);
  const presetValue =
    FOCUS_PRESETS.find((p) =>
      p.mode === "pomodoro" ? state.plannedMs === focusMinutes * 60_000 : p.mode === state.mode,
    )?.mode ?? state.mode;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-bg"
      style={{
        backgroundImage: `radial-gradient(ellipse at 50% 20%, color-mix(in srgb, ${areaColorVar(area?.color ?? "indigo")} 9%, transparent), transparent 65%)`,
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, filter: "blur(8px)" }}
      // A leftover filter would anchor the fixed controls to this scrolling layer, so clear them.
      animate={
        reduced
          ? { opacity: 1 }
          : { opacity: 1, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }
      }
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, filter: "blur(8px)" }}
      transition={reduced ? { duration: 0.2 } : { type: "spring", bounce: 0, duration: 0.4 }}
    >
      <svg className="pointer-events-none absolute inset-x-0 top-0 h-[70dvh] w-full" aria-hidden>
        {FOCUS_STARS.map(([x, y, r], i) => (
          <circle
            key={i}
            cx={`${x}%`}
            cy={`${y}%`}
            r={r}
            fill="var(--label-tertiary)"
            className="twinkle"
            style={{ animationDelay: `${(i * 0.53) % 3.2}s` }}
          />
        ))}
      </svg>
      <header className="relative flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] lg:px-6">
        <button
          type="button"
          onClick={onMinimise}
          className="flex h-11 items-center gap-1 rounded-full px-3 text-callout font-medium text-label-secondary hover:bg-fill"
        >
          <ChevronDown className="size-5" /> Minimise
        </button>
        {goal ? (
          <span className="flex max-w-[50%] items-center gap-1.5 truncate text-footnote text-label-secondary">
            <Target className="size-3.5 shrink-0" strokeWidth={1.75} /> <span className="truncate">{goal.title}</span>
          </span>
        ) : null}
      </header>

      <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pt-4 pb-44 text-center sm:pt-6">
        <TimerRing
          progress={progress}
          label={stage === "timeUp" ? "Time's up" : clock}
          sub={stageLabel(stage, paused)}
        />

        {stage === "work" ? (
          <div className="mt-4 sm:mt-5">
            <Segmented
              label="Session length"
              value={presetValue}
              onChange={(m) => {
                const p = FOCUS_PRESETS.find((x) => x.mode === m)!;
                onPlan(m, m === "pomodoro" ? focusMinutes : p.minutes);
              }}
              options={FOCUS_PRESETS.map((p) => ({
                value: p.mode,
                label: p.mode === "pomodoro" ? `${focusMinutes} min` : p.label,
              }))}
            />
          </div>
        ) : null}

        <h2 className="mt-6 text-title2 text-balance sm:mt-8 sm:text-title1">{task.title}</h2>
        {task.nextStep ? <p className="mt-2 text-body sm:text-title3 font-normal text-label-secondary">↳ {task.nextStep}</p> : null}

        <div className="mt-6 w-full text-left sm:mt-8">
          <FocusSubtasks task={task} />
          <Scratchpad task={task} />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-bg from-60% to-transparent px-4 pt-10 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <div className="pointer-events-auto w-full max-w-md">
          {stage === "outcome" ? (
            <OutcomePanel onFinish={onFinish} onBack={onCancelEnd} />
          ) : stage === "timeUp" ? (
            <PromptPanel
              title={state.mode === "five" ? "That's 5 minutes. Keep going?" : "Time's up. Keep going?"}
              actions={[
                { label: `Keep going (${focusMinutes} min)`, onClick: onKeepGoing, primary: true },
                ...(state.mode === "five" ? [] : [{ label: `Take a ${breakMinutes}-min break`, onClick: onBreak }]),
                { label: "Done", onClick: () => onFinish("done") },
                { label: "Stop", onClick: onEnd },
              ]}
            />
          ) : stage === "breakOver" ? (
            <PromptPanel
              title="Break's over."
              actions={[
                { label: `Start ${focusMinutes} min`, onClick: onKeepGoing, primary: true },
                { label: "Stop", onClick: onEnd },
              ]}
            />
          ) : stage === "break" ? (
            <PromptPanel title="On a break" actions={[{ label: "Skip break", onClick: onKeepGoing, primary: true }]} />
          ) : (
            <div className="mx-auto grid w-full grid-flow-col auto-cols-fr items-center gap-1 rounded-2xl p-1.5 shadow-2 material-thin sm:flex sm:w-fit sm:rounded-full">
              <PillButton
                label={paused ? "Resume" : "Pause"}
                icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                onClick={paused ? onResume : onPause}
              />
              {state.plannedMs != null ? (
                <PillButton label="+5 min" icon={<Plus className="size-4" />} onClick={onAddFive} />
              ) : null}
              <PillButton label="Done" icon={<Check className="size-4" />} onClick={() => onFinish("done")} />
              <PillButton label="End" icon={<Square className="size-3.5" />} onClick={onEnd} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Fixed positions (percent) so the sky doesn't change between renders.
const FOCUS_STARS: [number, number, number][] = [
  [6, 12, 1.2],
  [14, 48, 0.9],
  [22, 26, 1],
  [9, 78, 1.1],
  [30, 8, 0.8],
  [38, 62, 0.8],
  [71, 10, 1],
  [80, 34, 1.2],
  [92, 16, 0.9],
  [88, 58, 1],
  [66, 70, 0.8],
  [95, 84, 1.1],
  [50, 4, 0.8],
  [3, 34, 0.8],
  [76, 88, 0.9],
  [26, 90, 0.9],
];

function stageLabel(stage: Stage, paused: boolean): string {
  if (stage === "break") return "Break";
  if (stage === "breakOver") return "Break's over";
  if (paused) return "Paused";
  return "Focus";
}

function TimerRing({ progress, label, sub }: { progress: number; label: string; sub: string }) {
  const size = 240;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[200px] shrink-0 place-items-center sm:size-[240px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
        {/* A small moon rides the head of the arc. */}
        <g
          style={{
            transform: `rotate(${progress * 360}deg)`,
            transformOrigin: "center",
            transformBox: "view-box",
            transition: "transform 1s linear",
          }}
        >
          <circle cx={size / 2 + r} cy={size / 2} r={11} fill="var(--accent)" opacity={0.25} />
          <circle cx={size / 2 + r} cy={size / 2} r={6} fill="var(--bg)" stroke="var(--accent)" strokeWidth={3} />
        </g>
      </svg>
      <div className="absolute flex flex-col items-center" role="timer" aria-live="off">
        <span className="text-display tabular">{label}</span>
        <span className="text-footnote font-medium text-label-secondary">{sub}</span>
      </div>
    </div>
  );
}

function PillButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-caption font-semibold whitespace-nowrap hover:bg-fill active:bg-fill-strong sm:h-11 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-4 sm:text-callout"
    >
      {icon}
      {label}
    </motion.button>
  );
}

function PromptPanel({
  title,
  actions,
}: {
  title: string;
  actions: { label: string; onClick: () => void; primary?: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4 shadow-3 material-popover">
      <p className="text-center text-headline">{title}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
        {actions.map((a) => (
          <Button key={a.label} variant={a.primary ? "primary" : "secondary"} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** FOC-5: ending asks how it went. */
function OutcomePanel({
  onFinish,
  onBack,
}: {
  onFinish: (
    o: "done" | "progress" | "stuck" | "abandoned",
    extra?: { nextStep?: string; subtasks?: string[] },
  ) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "progress" | "stuck">("choose");
  const [nextStep, setNextStep] = useState("");
  const [steps, setSteps] = useState(["", "", ""]);
  const input =
    "h-control w-full rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div className="flex flex-col gap-3 rounded-xl p-4 shadow-3 material-popover">
      {mode === "choose" ? (
        <>
          <p className="text-center text-headline">How did it go?</p>
          <Button onClick={() => onFinish("done")}>Done — it&rsquo;s finished</Button>
          <Button variant="secondary" onClick={() => setMode("progress")}>
            Made progress
          </Button>
          <Button variant="secondary" onClick={() => setMode("stuck")}>
            Stuck
          </Button>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={onBack}>
              Back to focus
            </Button>
            <Button variant="ghost" onClick={() => onFinish("abandoned")}>
              Just stop
            </Button>
          </div>
        </>
      ) : mode === "progress" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onFinish("progress", { nextStep });
          }}
        >
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-headline">What&rsquo;s the next step?</span>
            <input
              autoFocus
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="Something you can start in 2 minutes"
              className={input}
            />
          </label>
          <Button type="submit">Save and stop</Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onFinish("stuck", { subtasks: steps });
          }}
        >
          <p className="text-left text-headline">Break it into smaller steps</p>
          {steps.map((s, i) => (
            <input
              key={i}
              autoFocus={i === 0}
              aria-label={`Smaller step ${i + 1}`}
              value={s}
              onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={i === 0 ? "The smallest first step" : "Then…"}
              className={input}
            />
          ))}
          <Button type="submit" className="mt-1">
            Add steps and stop
          </Button>
        </form>
      )}
    </div>
  );
}

function FocusSubtasks({ task }: { task: Task }) {
  const actions = useActions();
  const all = useAllTasks();
  const subs = (all ?? []).filter((t) => t.parentTaskId === task.id).sort((a, b) => a.order - b.order);
  if (!subs.length) return null;
  return (
    <section aria-label="Subtasks" className="mb-6">
      <h3 className="mb-1 px-1 text-micro text-label-secondary uppercase">Steps</h3>
      {subs.map((s) => (
        <div key={s.id} className="flex items-start gap-1">
          <Checkbox
            shape="square"
            color="var(--accent)"
            checked={s.status === "done"}
            onChange={(d) => void actions.setTaskDone(s, d)}
            label={`Complete ${s.title}`}
          />
          <span
            className={cn(
              "min-w-0 flex-1 py-2.5 break-words lg:py-[3px]",
              s.status === "done" && "text-label-tertiary line-through",
            )}
          >
            {s.title}
          </span>
        </div>
      ))}
    </section>
  );
}

function Scratchpad({ task }: { task: Task }) {
  const actions = useActions();
  const [text, setText] = useState(task.description);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-1 text-micro text-label-secondary uppercase">Notes</span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== task.description && void actions.updateTask(task, { description: text })}
        rows={4}
        placeholder="Jot down anything that comes up, then get back to it."
        className="field-sizing-content min-h-24 resize-none rounded-lg bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
      />
    </label>
  );
}
