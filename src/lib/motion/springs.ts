import type { Transition } from "motion/react";

/** Spring tokens from docs/DESIGN.md §7.1 (Apple damping/response → Motion bounce/duration). */
export const spring = {
  /** damping 1.0, response 0.4 — layout changes, panels, most UI */
  default: { type: "spring", bounce: 0, duration: 0.4 },
  /** damping 1.0, response 0.3 — checkbox, toggles, chips, popovers */
  snappy: { type: "spring", bounce: 0, duration: 0.3 },
  /** damping 0.8, response 0.3 — sheets, only after a drag/flick release */
  sheet: { type: "spring", bounce: 0.2, duration: 0.35 },
  /** damping 0.8, response 0.4 — swipe actions, thrown cards */
  momentum: { type: "spring", bounce: 0.2, duration: 0.4 },
  /** damping 1.0, response 0.6 — progress rings, XP bar */
  gentle: { type: "spring", bounce: 0, duration: 0.6 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof spring;

/** §7.2 non-spring timings */
export const timing = {
  press: { duration: 0.1, ease: "easeOut" },
  fadeFast: { duration: 0.15, ease: "easeOut" },
  fade: { duration: 0.2, ease: "easeOut" },
} as const satisfies Record<string, Transition>;
