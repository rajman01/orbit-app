"use client";

import { CalendarClock, Check, RotateCcw } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRef } from "react";
import { project } from "@/lib/motion/project";
import { rubberband } from "@/lib/motion/rubberband";
import { spring, timing } from "@/lib/motion/springs";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

const THRESHOLD = 0.4; // of the row width (DESIGN.md §8)
const SLOP = 10;

/**
 * DESIGN.md §8 — swipe right to complete, left to reschedule. Touch and pen only (a mouse
 * never swipes). Tracks the finger 1:1, projects momentum to decide, rubber-bands past the
 * threshold and hands the release velocity to the settle spring.
 */
export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Done",
  done = false,
}: {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  done?: boolean;
}) {
  const x = useMotionValue(0);
  const { reduced } = useOrbitMotion();
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    id: number;
    x0: number;
    y0: number;
    mode: "pending" | "swipe" | "scroll";
    history: { x: number; t: number }[];
  } | null>(null);
  const swiped = useRef(false);

  const rightOpacity = useTransform(x, [0, 24, 80], [0, 0.6, 1]);
  const leftOpacity = useTransform(x, [-80, -24, 0], [1, 0.6, 0]);
  const enabled = Boolean(onSwipeLeft || onSwipeRight);

  function settle(to: number, velocity: number, then?: () => void) {
    if (reduced) {
      then?.();
      void animate(x, 0, timing.fade);
      return;
    }
    void animate(x, to, { ...spring.momentum, velocity }).then(() => {
      if (to !== 0) {
        then?.();
        void animate(x, 0, spring.default);
      }
    });
  }

  if (!enabled) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-md">
      <motion.div
        aria-hidden
        style={{ opacity: rightOpacity }}
        className="absolute inset-0 flex items-center gap-2 bg-success px-5 text-callout font-semibold text-white"
      >
        {done ? <RotateCcw className="size-5" /> : <Check className="size-5" />} {done ? "Undo" : rightLabel}
      </motion.div>
      <motion.div
        aria-hidden
        style={{ opacity: leftOpacity }}
        className="absolute inset-0 flex items-center justify-end gap-2 bg-warning px-5 text-callout font-semibold text-white"
      >
        Reschedule <CalendarClock className="size-5" />
      </motion.div>
      <motion.div
        ref={ref}
        style={{ x, touchAction: "pan-y" }}
        className="relative bg-bg"
        onClickCapture={(e) => {
          if (swiped.current) {
            e.stopPropagation();
            e.preventDefault();
            swiped.current = false;
          }
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" || !e.isPrimary) return;
          x.stop();
          swiped.current = false;
          gesture.current = {
            id: e.pointerId,
            x0: e.clientX - x.get(),
            y0: e.clientY,
            mode: "pending",
            history: [{ x: e.clientX, t: e.timeStamp }],
          };
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId || g.mode === "scroll") return;
          const dx = e.clientX - g.x0;
          const dy = e.clientY - g.y0;
          if (g.mode === "pending") {
            if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
              g.mode = "scroll";
              return;
            }
            if (Math.abs(dx) < SLOP) return;
            g.mode = "swipe";
            swiped.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          g.history = [...g.history.slice(-4), { x: e.clientX, t: e.timeStamp }];
          const width = ref.current?.offsetWidth ?? 320;
          const limit = width * THRESHOLD;
          let next = dx;
          if (dx > 0 && !onSwipeRight) next = rubberband(dx, width) * 0.3;
          if (dx < 0 && !onSwipeLeft) next = rubberband(dx, width) * 0.3;
          if (Math.abs(next) > limit) next = Math.sign(next) * (limit + rubberband(Math.abs(next) - limit, width));
          x.set(next);
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          gesture.current = null;
          if (!g || g.mode !== "swipe") return;
          g.history = [...g.history.slice(-4), { x: e.clientX, t: e.timeStamp }];
          const first = g.history[0];
          const last = g.history[g.history.length - 1];
          const dt = Math.max(1, last.t - first.t);
          const velocity = ((last.x - first.x) / dt) * 1000; // px/s
          const width = ref.current?.offsetWidth ?? 320;
          const projected = x.get() + project(velocity);
          if (projected > width * THRESHOLD && onSwipeRight) {
            try {
              navigator.vibrate?.(15);
            } catch {}
            settle(width, velocity, onSwipeRight);
          } else if (projected < -width * THRESHOLD && onSwipeLeft) {
            try {
              navigator.vibrate?.(15);
            } catch {}
            settle(-width, velocity, onSwipeLeft);
          } else {
            void animate(x, 0, reduced ? timing.fade : { ...spring.momentum, velocity });
          }
        }}
        onPointerCancel={() => {
          gesture.current = null;
          void animate(x, 0, spring.default);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
