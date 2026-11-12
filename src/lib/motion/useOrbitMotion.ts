"use client";

import { useReducedMotion, type Transition } from "motion/react";
import { spring, timing, type SpringName } from "./springs";

/**
 * Returns the transition for a spring token, or a 200ms fade when the user
 * prefers reduced motion (DESIGN.md §7.4). Components never check the media query themselves.
 */
export function useOrbitMotion() {
  const reduced = useReducedMotion() ?? false;
  return {
    reduced,
    transition(name: SpringName): Transition {
      return reduced ? timing.fade : spring[name];
    },
  };
}
