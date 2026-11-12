"use client";

import { ArrowLeft, X } from "lucide-react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { Button } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import { RITUAL_META, type Cycle, type RitualType } from "@/features/cycles/model";
import type { RitualDoc } from "@/features/data";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog as D } from "radix-ui";
import { CycleReviewFlow } from "./cycle-review";
import { DailyPlanFlow } from "./daily-plan";
import { DailyShutdownFlow } from "./daily-shutdown";

export interface RitualStep {
  id: string;
  title: string;
  /** One short line under the title. */
  hint?: string;
  body: React.ReactNode;
  /** Why Continue is disabled, if it is. */
  blockedBy?: string | null;
  continueLabel?: string;
}

interface Ctx {
  open: (type: RitualType, opts?: { date?: string; cycle?: Pick<Cycle, "id" | "endDate"> | null }) => Promise<void>;
}

const RitualCtx = createContext<Ctx | null>(null);

export function useRitualLauncher(): Ctx {
  const c = useContext(RitualCtx);
  if (!c) throw new Error("useRitualLauncher must be used inside <RitualProvider>");
  return c;
}

/** Opens Daily Plan, Daily Shutdown and Cycle Review from anywhere (PRD §7.9). */
export function RitualProvider({ children }: { children: React.ReactNode }) {
  const actions = useActions();
  const todayDay = useToday();
  const [openId, setOpenId] = useState<string | null>(null);

  const open = useCallback<Ctx["open"]>(
    async (type, opts = {}) => {
      const date = type === "cycle_review" && opts.cycle ? opts.cycle.endDate : (opts.date ?? todayDay);
      const id = await actions.startRitual(type, date, opts.cycle ?? null);
      setOpenId(id);
    },
    [actions, todayDay],
  );
  const value = useMemo(() => ({ open }), [open]);

  return (
    <RitualCtx.Provider value={value}>
      {children}
      <RitualDialog id={openId} onClose={() => setOpenId(null)} />
    </RitualCtx.Provider>
  );
}

function RitualDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { db } = useSync();
  const ritual = useLiveQuery(async () => (id ? ((await db.rituals.get(id)) ?? null) : null), [db, id]);
  const { reduced } = useOrbitMotion();
  const visible = id != null && ritual != null;

  return (
    <D.Root open={visible} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {visible ? (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--scrim)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </D.Overlay>
            <D.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  "fixed inset-0 z-50 flex flex-col bg-bg outline-none",
                  "lg:inset-auto lg:top-1/2 lg:left-1/2 lg:h-[min(760px,88dvh)] lg:w-[640px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:shadow-4",
                )}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
                transition={reduced ? { duration: 0.2 } : { type: "spring", bounce: 0, duration: 0.4 }}
              >
                <D.Title className="sr-only">{RITUAL_META[ritual.type].title}</D.Title>
                <RitualBody key={ritual.id} ritual={ritual} onClose={onClose} />
              </motion.div>
            </D.Content>
          </D.Portal>
        ) : null}
      </AnimatePresence>
    </D.Root>
  );
}

function RitualBody({ ritual, onClose }: { ritual: RitualDoc; onClose: () => void }) {
  const props = { ritual, onClose };
  if (ritual.type === "daily_plan") return <DailyPlanFlow {...props} />;
  if (ritual.type === "daily_shutdown") return <DailyShutdownFlow {...props} />;
  return <CycleReviewFlow {...props} />;
}

/**
 * DESIGN.md §11.16: one question per screen, progress dots, a large Continue button. Steps slide
 * in from the right going forward and from the left going back; on phones they can be swiped.
 * The current step is saved on the ritual, so it resumes where you left off.
 */
export function RitualShell({
  ritual,
  steps,
  onClose,
  onFinish,
  finishLabel,
}: {
  ritual: RitualDoc;
  steps: RitualStep[];
  onClose: () => void;
  onFinish: () => Promise<void> | void;
  finishLabel: string;
}) {
  const actions = useActions();
  const { reduced } = useOrbitMotion();
  const saved = typeof ritual.data.step === "number" ? ritual.data.step : 0;
  const [index, setIndex] = useState(Math.min(saved, steps.length - 1));
  const [direction, setDirection] = useState(1);
  const [finishing, setFinishing] = useState(false);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const done = ritual.completedAt != null;

  useEffect(() => {
    if (!done && saved !== index) void actions.saveRitual(ritual.id, { step: index });
  }, [index, saved, done, actions, ritual.id]);

  const go = (to: number) => {
    if (to < 0 || to >= steps.length) return;
    setDirection(to > index ? 1 : -1);
    setIndex(to);
  };
  const next = async () => {
    if (step.blockedBy) return;
    if (!last) return go(index + 1);
    setFinishing(true);
    try {
      await onFinish();
      onClose();
    } finally {
      setFinishing(false);
    }
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.2;
    if (swipe < -80 && !step.blockedBy && !last) go(index + 1);
    else if (swipe > 80) go(index - 1);
  };

  return (
    <>
      <header className="flex items-center justify-between gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] lg:px-6 lg:pt-5">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Back"
          className="grid size-10 place-items-center rounded-full hover:bg-fill disabled:invisible"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div
          className="flex items-center gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-label={`Step ${index + 1} of ${steps.length}`}
        >
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-5 bg-accent" : i < index ? "w-1.5 bg-accent/50" : "w-1.5 bg-fill-strong",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close (progress is saved)"
          className="grid size-10 place-items-center rounded-full hover:bg-fill"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={step.id}
            custom={direction}
            variants={{
              enter: (d: number) => (reduced ? { opacity: 0 } : { x: d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => (reduced ? { opacity: 0 } : { x: d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduced ? { duration: 0.2 } : { type: "spring", bounce: 0, duration: 0.35 }}
            drag={reduced ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            dragDirectionLock
            onDragEnd={onDragEnd}
            className="absolute inset-0 overflow-y-auto px-5 pt-4 pb-6 lg:px-8"
          >
            <p className="text-footnote font-medium text-accent-text">
              {RITUAL_META[ritual.type].title} · {index + 1} of {steps.length}
            </p>
            <h2 className="mt-1 text-title1 text-balance">{step.title}</h2>
            {step.hint ? <p className="mt-1.5 text-callout text-label-secondary">{step.hint}</p> : null}
            <div className="mt-5">{step.body}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="border-t border-separator px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] lg:px-8">
        {step.blockedBy ? (
          <p className="mb-2 text-center text-footnote text-label-secondary">{step.blockedBy}</p>
        ) : null}
        <Button
          size="large"
          className="w-full"
          disabled={Boolean(step.blockedBy)}
          loading={finishing}
          onClick={() => void next()}
        >
          {last ? finishLabel : (step.continueLabel ?? "Continue")}
        </Button>
      </footer>
    </>
  );
}

/** A compact task row for ritual steps: title, area colour, and whatever actions the step needs. */
export function RitualTaskRow({
  title,
  sub,
  areaColor,
  done,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  areaColor?: string;
  done?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex min-h-row items-center gap-2 border-b border-separator py-2 last:border-b-0">
      {areaColor ? (
        <span className="size-2 shrink-0 rounded-full" style={{ background: areaColor }} aria-hidden />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate", done && "text-label-tertiary line-through")}>{title}</p>
        {sub ? <p className="truncate text-footnote text-label-secondary">{sub}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  );
}

export function SmallButton({
  children,
  onClick,
  tone = "neutral",
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "accent" | "danger";
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "h-8 shrink-0 rounded-full px-3 text-footnote font-semibold active:scale-[0.97]",
        tone === "accent" && "bg-accent-fill text-accent-text hover:brightness-95",
        tone === "neutral" && "bg-fill hover:bg-fill-strong",
        tone === "danger" && "bg-fill text-danger-text hover:bg-fill-strong",
      )}
    >
      {children}
    </button>
  );
}

export function EmptyStepNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-surface-sunken px-4 py-5 text-center text-callout text-label-secondary">{children}</p>
  );
}
