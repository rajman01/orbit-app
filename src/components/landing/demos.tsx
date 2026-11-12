"use client";

import { Check, Pause, Plus, Square, Target } from "lucide-react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GoalPlanet } from "@/components/goals/goal-planet";
import { formatClock } from "@/features/focus/model";
import { Starfield } from "./illustrations";

const SESSION = 300; // the 5-minute first session
const START_AT = 252; // open mid-session, so the ring already shows some progress

/** Focus mode as it looks in the app: a live 5-minute timer under a quiet night sky. */
export function FocusDemo() {
  const reduced = useReducedMotion();
  const [left, setLeft] = useState(START_AT);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setLeft((s) => (s <= 1 ? SESSION : s - 1)), 1000);
    return () => clearInterval(t);
  }, [reduced]);

  const size = 168;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = 1 - left / SESSION;

  return (
    <div
      className="dark relative flex h-full flex-col items-center overflow-hidden rounded-[28px] border border-separator px-6 pt-8 pb-6 text-center text-label"
      style={{ background: "radial-gradient(ellipse at 50% 15%, #12303f, #05090d 70%)" }}
      aria-hidden
    >
      <Starfield count={40} className="pointer-events-none absolute inset-0 size-full opacity-70" />
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
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
          <g
            style={{
              transform: `rotate(${progress * 360}deg)`,
              transformOrigin: "center",
              transformBox: "view-box",
              transition: "transform 1s linear",
            }}
          >
            <circle cx={size / 2 + r} cy={size / 2} r={9} fill="var(--accent)" opacity={0.3} />
            <circle cx={size / 2 + r} cy={size / 2} r={5} fill="#05090d" stroke="var(--accent)" strokeWidth={2.5} />
          </g>
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-[34px] leading-none font-bold tracking-[-0.02em] tabular-nums">
            {formatClock(left * 1000)}
          </span>
          <span className="mt-1 text-[12px] font-medium text-label-secondary">Focus</span>
        </div>
      </div>
      <p className="relative mt-6 text-[20px] font-bold tracking-[-0.015em]">Rewrite CV summary</p>
      <p className="relative mt-1 text-[14px] text-label-secondary">↳ Open the doc and write the first line</p>
      <div className="relative mt-6 flex items-center gap-0.5 rounded-full p-1 text-[12.5px] font-semibold material-thin">
        {(
          [
            [Pause, "Pause"],
            [Plus, "+5 min"],
            [Check, "Done"],
            [Square, "End"],
          ] as const
        ).map(([Icon, label]) => (
          <span key={label} className="flex h-9 items-center gap-1.5 rounded-full px-3">
            <Icon className="size-3.5" aria-hidden /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const MILESTONES = ["Portfolio refreshed", "5 referrals asked", "First interview", "Offer signed"];

/**
 * A goal page in miniature, driven by scrolling: the goal completes as the card travels up the
 * screen and runs backwards when you scroll back up. The planet grows, the key result fills and
 * the milestone moons light up along the way.
 */
export function GoalDemo() {
  const ref = useRef<HTMLDivElement>(null);
  // 0 when the card's top enters near the bottom of the screen, 1 once its middle is a little above centre.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.92", "center 0.42"] });
  const [progress, setProgress] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    setProgress((p) => (p === next ? p : next));
  });
  const sent = Math.round(progress * 20);
  const reached = (i: number) => progress >= (i + 1) / MILESTONES.length;

  return (
    <div
      ref={ref}
      className="flex h-full flex-col rounded-[28px] border border-separator bg-surface px-6 pt-6 pb-6 shadow-2"
      aria-hidden
    >
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-label-secondary">
        <Target className="size-3.5" strokeWidth={1.75} /> Goals ›{" "}
        <span className="size-2 rounded-full bg-[var(--area-blue)]" /> Career
      </p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[22px] leading-tight font-bold tracking-[-0.02em]">Land a senior engineering role</p>
          <p className="mt-2 inline-flex h-6 items-center rounded-full bg-[color-mix(in_srgb,var(--success)_16%,transparent)] px-2.5 text-[12px] font-semibold text-success-text">
            {progress >= 1 ? "Completed" : "On track"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <GoalPlanet
            progress={progress}
            color="var(--area-blue)"
            size={120}
            milestones={MILESTONES.map((m, i) => ({ id: m, done: reached(i) }))}
            label=""
            follow
          />
          <span className="text-[13px] font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex justify-between text-[13px]">
          <span className="font-medium">Applications sent</span>
          <span className="text-label-secondary tabular-nums">{sent} / 20</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill">
          <div
            className="h-full origin-left rounded-full bg-[var(--area-blue)]"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      </div>
      <ul className="mt-5 flex flex-col gap-2 text-[14px]">
        {MILESTONES.map((m, i) => (
          <li key={m} className="flex items-center gap-2.5">
            <span
              className="grid size-[18px] place-items-center rounded-full border-[1.5px] transition-colors duration-200"
              style={{
                borderColor: reached(i) ? "var(--area-blue)" : "var(--label-tertiary)",
                background: reached(i) ? "var(--area-blue)" : "transparent",
              }}
            >
              {reached(i) ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
            </span>
            <span className={reached(i) ? "text-label-secondary" : ""}>{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
