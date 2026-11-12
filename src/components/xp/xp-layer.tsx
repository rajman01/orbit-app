"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFocus } from "@/components/focus/focus-mode";
import { useXpEvents } from "@/features/data";
import { levelFromXp, totalXp } from "@/features/xp/model";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/**
 * DESIGN.md §9 / §11.14: "+30 XP" rises briefly when XP is earned, and levelling up shows a
 * small card. Never blocking, and held back while a focus session is open.
 */
export function XpLayer() {
  const events = useXpEvents();
  const focus = useFocus();
  const { transition, reduced } = useOrbitMotion();
  const [gains, setGains] = useState<{ id: number; amount: number }[]>([]);
  // The level the user has already been shown. A higher level is a level-up to celebrate,
  // held back while a focus session is open.
  const [seen, setSeen] = useState<number | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const onXp = (e: Event) => {
      const amount = (e as CustomEvent<{ amount: number }>).detail.amount;
      const id = nextId.current++;
      setGains((g) => [...g.slice(-2), { id, amount }]);
      setTimeout(() => setGains((g) => g.filter((x) => x.id !== id)), 1400);
    };
    window.addEventListener("orbit:xp", onXp);
    return () => window.removeEventListener("orbit:xp", onXp);
  }, []);

  const info = events ? levelFromXp(totalXp(events)) : null;
  // On first load the current level is already known; going down (an undo) just resets it.
  if (info && (seen == null || info.level < seen)) setSeen(info.level);
  const levelUp =
    info && seen != null && info.level > seen && !focus.active ? { level: info.level, title: info.title } : null;
  const shownLevel = levelUp?.level;

  useEffect(() => {
    if (shownLevel == null) return;
    try {
      navigator.vibrate?.([20, 40, 20]);
    } catch {}
    const t = setTimeout(() => setSeen(shownLevel), 6000);
    return () => clearTimeout(t);
  }, [shownLevel]);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+8rem)] z-[55] flex flex-col items-center gap-1 lg:bottom-24"
        aria-live="polite"
      >
        <AnimatePresence>
          {gains.map((g) => (
            <motion.span
              key={g.id}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -24 }}
              transition={transition("snappy")}
              className="rounded-full bg-[linear-gradient(90deg,var(--xp-from),var(--xp-to))] px-3 py-1 text-footnote font-bold text-white shadow-2"
            >
              +{g.amount} XP
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {levelUp ? (
          <motion.div
            key={levelUp.level}
            role="status"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: [0.96, 1.04, 1] }}
            exit={{ opacity: 0, y: reduced ? 0 : 16 }}
            transition={reduced ? { duration: 0.2 } : { type: "spring", bounce: 0.25, duration: 0.5 }}
            className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[56] mx-auto flex max-w-sm items-center gap-3 rounded-2xl p-4 text-white shadow-3 lg:right-6 lg:bottom-6 lg:left-auto"
            style={{ background: "linear-gradient(135deg, var(--band-from), var(--band-to) 60%, #0b3c52)" }}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-title3 font-bold text-[var(--accent-on-white)] tabular">
              {levelUp.level}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-footnote font-medium text-white/80">Level up!</span>
              <span className="block text-headline">
                Level {levelUp.level} · {levelUp.title}
              </span>
            </span>
            <Link
              href="/levels"
              onClick={() => setSeen(levelUp.level)}
              className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-footnote font-semibold"
            >
              See
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** Level badge with a progress ring and the XP bar (DESIGN.md §11.14). */
export function LevelBadge({ compact = false }: { compact?: boolean }) {
  const events = useXpEvents();
  const { transition } = useOrbitMotion();
  if (!events) return null;
  const info = levelFromXp(totalXp(events));
  const pct = info.into / info.needed;
  return (
    <Link
      href="/levels"
      aria-label={`Level ${info.level}, ${info.title}: ${info.into} of ${info.needed} XP to the next level`}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-fill"
    >
      <span className="relative grid size-8 shrink-0 place-items-center">
        <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="16" cy="16" r="14" fill="none" stroke="var(--fill-strong)" strokeWidth="3" />
          <motion.circle
            cx="16"
            cy="16"
            r="14"
            fill="none"
            stroke="url(#xp-grad)"
            strokeWidth="3"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: pct }}
            transition={transition("gentle")}
          />
          <defs>
            <linearGradient id="xp-grad" x1="0" x2="1">
              <stop offset="0" stopColor="var(--xp-from)" />
              <stop offset="1" stopColor="var(--xp-to)" />
            </linearGradient>
          </defs>
        </svg>
        <span className="text-footnote font-bold tabular">{info.level}</span>
      </span>
      {compact ? null : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-footnote font-semibold">{info.title}</span>
          <span className="block text-caption text-label-tertiary tabular">
            {info.into} / {info.needed} XP
          </span>
        </span>
      )}
    </Link>
  );
}
