/**
 * Focus timer state (PRD FOC-2, FOC-3, FOC-6). The running timer lives in localStorage so it
 * survives reloads and works offline; it is derived from timestamps, never from a ticking counter.
 */

export type FocusMode = "five" | "pomodoro" | "fixed" | "open";

export interface FocusState {
  v: 1;
  sessionId: string;
  taskId: string;
  mode: FocusMode;
  /** Planned work time; null for an open-ended stopwatch. */
  plannedMs: number | null;
  startedAt: number;
  /** Set while paused or on a break. */
  pausedAt: number | null;
  /** Total time spent paused or on breaks, excluded from work time. */
  pausedMs: number;
  interruptions: number;
  /** Set during a Pomodoro break. */
  breakEndsAt: number | null;
}

const MIN = 60_000;
/** The longest session the server accepts; a timer left running for days is logged as this. */
export const MAX_SESSION_MINUTES = 24 * 60;

export function startFocus(
  sessionId: string,
  taskId: string,
  mode: FocusMode,
  minutes: number | null,
  now: number,
): FocusState {
  return {
    v: 1,
    sessionId,
    taskId,
    mode,
    plannedMs: minutes == null ? null : minutes * MIN,
    startedAt: now,
    pausedAt: null,
    pausedMs: 0,
    interruptions: 0,
    breakEndsAt: null,
  };
}

/** Time on the clock since the start, minus pauses and breaks. */
function rawElapsedMs(s: FocusState, now: number): number {
  return Math.max(0, (s.pausedAt ?? now) - s.startedAt - s.pausedMs);
}

/**
 * Work time so far. A timed session stops counting at "Time's up" (owner decision, 2026-11-12):
 * time spent before answering "Keep going?" isn't work time.
 */
export function elapsedMs(s: FocusState, now: number): number {
  const raw = rawElapsedMs(s, now);
  return s.plannedMs == null ? raw : Math.min(raw, s.plannedMs);
}

/** Moves any time past "Time's up" into paused time, so continuing picks up from the planned end. */
function settle(s: FocusState, now: number): FocusState {
  if (s.plannedMs == null || s.pausedAt != null || s.breakEndsAt != null) return s;
  const over = rawElapsedMs(s, now) - s.plannedMs;
  return over > 0 ? { ...s, pausedMs: s.pausedMs + over } : s;
}

/** Work time left, or null for an open-ended session. Never negative. */
export function remainingMs(s: FocusState, now: number): number | null {
  return s.plannedMs == null ? null : Math.max(0, s.plannedMs - elapsedMs(s, now));
}

export function isTimeUp(s: FocusState, now: number): boolean {
  return s.breakEndsAt == null && s.plannedMs != null && elapsedMs(s, now) >= s.plannedMs;
}

export function isPaused(s: FocusState): boolean {
  return s.pausedAt != null && s.breakEndsAt == null;
}

export function pause(s: FocusState, now: number): FocusState {
  if (s.pausedAt != null) return s;
  return { ...settle(s, now), pausedAt: now, interruptions: s.interruptions + 1 };
}

export function resume(s: FocusState, now: number): FocusState {
  if (s.pausedAt == null) return s;
  return { ...s, pausedMs: s.pausedMs + (now - s.pausedAt), pausedAt: null, breakEndsAt: null };
}

/** +5 min: extends the plan (from now, if time was already up). */
export function addMinutes(s: FocusState, minutes: number, now: number): FocusState {
  if (s.plannedMs == null) return s;
  const settled = settle(s, now);
  return { ...settled, plannedMs: Math.max(settled.plannedMs!, elapsedMs(settled, now)) + minutes * MIN };
}

/** "Keep going": another block of work from where the session is now. */
export function keepGoing(s: FocusState, minutes: number, now: number): FocusState {
  const resumed = settle(resume(s, now), now);
  return { ...resumed, mode: "pomodoro", plannedMs: elapsedMs(resumed, now) + minutes * MIN };
}

export function changePlan(s: FocusState, mode: FocusMode, minutes: number | null, now: number): FocusState {
  const settled = settle(s, now);
  return {
    ...settled,
    mode,
    plannedMs: minutes == null ? null : Math.max(minutes * MIN, elapsedMs(settled, now) + MIN),
  };
}

/** A Pomodoro break pauses work time without counting as an interruption. */
export function startBreak(s: FocusState, minutes: number, now: number): FocusState {
  const settled = settle(s, now);
  return { ...settled, pausedAt: settled.pausedAt ?? now, breakEndsAt: now + minutes * MIN };
}

export function breakRemainingMs(s: FocusState, now: number): number | null {
  return s.breakEndsAt == null ? null : Math.max(0, s.breakEndsAt - now);
}

/** Minutes worked, rounded to one decimal, for the session log. */
export function workedMinutes(s: FocusState, now: number): number {
  return Math.min(MAX_SESSION_MINUTES, Math.round((elapsedMs(s, now) / MIN) * 10) / 10);
}

/** Planned minutes for the session log; null for an open-ended session. */
export function plannedMinutes(s: FocusState): number | null {
  return s.plannedMs == null ? null : Math.min(MAX_SESSION_MINUTES, Math.round(s.plannedMs / MIN));
}

/** 25:00, or 1:02:03 past an hour. */
export function formatClock(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function parseFocusState(raw: string | null): FocusState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as FocusState;
    return s && s.v === 1 && typeof s.sessionId === "string" && typeof s.startedAt === "number" ? s : null;
  } catch {
    return null;
  }
}

export const FOCUS_PRESETS: { mode: FocusMode; minutes: number | null; label: string }[] = [
  { mode: "five", minutes: 5, label: "5 min" },
  { mode: "pomodoro", minutes: 25, label: "25 min" },
  { mode: "fixed", minutes: 50, label: "50 min" },
  { mode: "open", minutes: null, label: "Open" },
];
