"use client";

import { Check, Inbox, Mic, Play, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "./reveal";

/**
 * "How it works" as a scroll story: on wide screens a phone frame stays put while its screen
 * follows the step being read (Capture → Plan → Do → Review), cross-fading between them. On
 * phones, and with reduced motion, each step simply shows its own screen, stacked.
 */

const STEPS = [
  {
    title: "Capture",
    body: "Dump everything on your mind into the inbox: type it, say it, or share it from another app. The coach sorts a messy brain dump into tasks with dates.",
    screen: CaptureScreen,
  },
  {
    title: "Plan",
    body: "Turn ideas into goals with a next step, then commit to a realistic two-week cycle. Orbit warns you before you take on more than you can carry.",
    screen: PlanScreen,
  },
  {
    title: "Do",
    body: "Each morning pick three must-dos. Start the hardest with five minutes on the clock, and put things off only with a reason.",
    screen: DoScreen,
  },
  {
    title: "Review",
    body: "Close the cycle with a review: what got done, why things slipped, and a decision for everything unfinished. Then level up and go again.",
    screen: ReviewScreen,
  },
] as const;

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      // A step is "being read" when it crosses the middle of the screen.
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="how" className="scroll-mt-16" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">How it works</p>
          <h2
            id="how-title"
            className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]"
          >
            One loop, every two weeks.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-2 lg:gap-20">
          {/* The pinned phone (wide screens with motion only). */}
          <div className="hidden lg:block lg:motion-reduce:hidden" aria-hidden>
            <div className="sticky top-[calc(50vh-300px)]">
              <Phone>
                {STEPS.map(({ screen: Screen, title }, i) => (
                  <div
                    key={title}
                    className={cn(
                      "absolute inset-0 transition-[opacity,transform] duration-500 ease-out",
                      i === active ? "opacity-100" : "pointer-events-none scale-[0.98] opacity-0",
                    )}
                  >
                    <Screen />
                  </div>
                ))}
              </Phone>
            </div>
          </div>

          <ol className="flex flex-col gap-16 lg:gap-0">
            {STEPS.map(({ title, body, screen: Screen }, i) => (
              <li
                key={title}
                data-step={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="flex flex-col justify-center lg:min-h-[78vh] lg:motion-reduce:min-h-0 lg:motion-reduce:py-10"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[13px] font-semibold text-accent-text tabular-nums">0{i + 1}</span>
                  <h3
                    className={cn(
                      "text-[clamp(1.5rem,2.6vw,2rem)] font-bold tracking-[-0.02em] transition-colors duration-300 lg:motion-reduce:text-label",
                      i === active ? "lg:text-label" : "lg:text-label-tertiary",
                    )}
                  >
                    {title}
                  </h3>
                </div>
                <p className="mt-3 max-w-md text-[17px] leading-[1.6] text-label-secondary">{body}</p>
                {/* Phones (and reduced motion): the step's own screen, inline. */}
                <div className="mt-8 lg:hidden lg:motion-reduce:block" aria-hidden>
                  <Phone>
                    <Screen />
                  </Phone>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-[600px] w-[300px] max-w-full rounded-[44px] border border-separator bg-surface-sunken p-2.5 shadow-4">
      <div className="relative h-full overflow-hidden rounded-[36px] bg-bg">
        <div className="absolute top-2.5 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black/85" />
        {children}
      </div>
    </div>
  );
}

function ScreenTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="px-5 pt-12 pb-3">
      <p className="text-[11px] font-medium text-label-secondary">{kicker}</p>
      <p className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{title}</p>
    </div>
  );
}

const Dot = ({ color }: { color: string }) => (
  <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
);

function CaptureScreen() {
  const sorted = [
    { title: "Call the landlord about the boiler", when: "Today", area: "var(--area-green)" },
    { title: "Book the dentist", when: "Next week", area: "var(--area-pink)" },
    { title: "Pay rent", when: "Fri", area: "var(--area-green)" },
    { title: "Ideas for mum’s birthday", when: "Inbox", area: "var(--area-pink)" },
  ];
  return (
    <div className="flex h-full flex-col">
      <ScreenTitle kicker="4 to sort" title="Inbox" />
      <div className="mx-4 rounded-[16px] bg-surface-sunken p-3 text-[13px] leading-[1.45] text-label-secondary">
        call landlord about the boiler, book dentist next week, pay rent by friday!! ideas for mum’s birthday
        <div className="mt-2 flex justify-end">
          <span className="grid size-7 place-items-center rounded-full bg-danger text-white">
            <Mic className="size-3.5" />
          </span>
        </div>
      </div>
      <p className="mt-4 flex items-center gap-1.5 px-5 text-[12px] font-semibold text-accent-text">
        <Sparkles className="size-3.5" /> 4 tasks found
      </p>
      <ul className="mt-2 flex flex-col px-3">
        {sorted.map((t) => (
          <li key={t.title} className="flex items-center gap-2.5 rounded-[10px] px-2 py-2.5">
            <span className="grid size-[18px] place-items-center rounded-[5px] bg-accent">
              <Check className="size-3 text-white" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px]">{t.title}</span>
            <span className="text-[11px] font-medium text-label-secondary">{t.when}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto mb-6 px-4">
        <div className="flex h-11 items-center justify-center rounded-[12px] bg-accent text-[15px] font-semibold text-on-accent">
          Add 4 to Orbit
        </div>
      </div>
    </div>
  );
}

function PlanScreen() {
  const goals = [
    {
      goal: "Land a design role",
      area: "var(--area-blue)",
      tasks: [
        ["Rewrite portfolio case study", 3],
        ["Apply to 5 roles", 2],
      ],
    },
    {
      goal: "Emergency fund",
      area: "var(--area-green)",
      tasks: [["Set up a standing order", 1]],
    },
    {
      goal: "Learn SQL",
      area: "var(--area-orange)",
      tasks: [
        ["Course: Joins", 2],
        ["Course: Indexes", 2],
      ],
    },
  ] as const;
  return (
    <div className="flex h-full flex-col">
      <ScreenTitle kicker="16 – 29 November" title="Plan the cycle" />
      <div className="mx-5 rounded-[14px] bg-surface-sunken p-3">
        <div className="flex justify-between text-[12px] font-medium">
          <span>Committed</span>
          <span className="text-label-secondary tabular-nums">24 of 30 pts</span>
        </div>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-fill">
          <span className="block h-full w-4/5 rounded-full bg-accent" />
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3 px-5">
        {goals.map((g) => (
          <div key={g.goal}>
            <p className="flex items-center gap-2 text-[12px] font-semibold text-label-secondary">
              <Dot color={g.area} /> {g.goal}
            </p>
            <ul className="mt-1 flex flex-col">
              {g.tasks.map(([t, p]) => (
                <li key={t} className="flex items-center gap-2.5 py-1.5 text-[14px]">
                  <span className="size-[18px] rounded-full border-[1.5px] border-label-tertiary" />
                  <span className="min-w-0 flex-1 truncate">{t}</span>
                  <span className="rounded-full bg-fill px-1.5 text-[11px] font-semibold tabular-nums">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto mb-6 px-4">
        <div className="flex h-11 items-center justify-center rounded-[12px] bg-accent text-[15px] font-semibold text-on-accent">
          Commit to this cycle
        </div>
      </div>
    </div>
  );
}

function DoScreen() {
  const musts = [
    {
      title: "Rewrite portfolio case study",
      step: "Open the doc and fix the intro",
      done: true,
      area: "var(--area-blue)",
    },
    { title: "Call mum", step: "After dinner", done: false, area: "var(--area-pink)" },
    { title: "Set up a standing order", step: "Open the banking app", done: false, area: "var(--area-green)" },
  ];
  return (
    <div className="flex h-full flex-col">
      <ScreenTitle kicker="Tuesday 17 November" title="Today" />
      <p className="px-5 text-[11px] font-semibold tracking-[0.06em] text-label-tertiary uppercase">Must-dos</p>
      <ul className="mt-1 flex flex-col px-3">
        {musts.map((m) => (
          <li key={m.title} className="flex items-start gap-2.5 rounded-[10px] px-2 py-2.5">
            <span
              className={cn(
                "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]",
                m.done ? "border-success bg-success" : "border-label-tertiary",
              )}
            >
              {m.done ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[14px]", m.done && "text-label-tertiary line-through")}>
                {m.title}
              </span>
              <span className="block truncate text-[12px] text-label-secondary">{m.step}</span>
            </span>
            <Dot color={m.area} />
          </li>
        ))}
      </ul>
      <div
        className="dark mx-4 mt-4 flex flex-col items-center rounded-[20px] px-4 py-5 text-label"
        style={{ background: "radial-gradient(ellipse at 50% 10%, #12303f, #05090d 75%)" }}
      >
        <p className="text-[12px] text-label-secondary">Call mum</p>
        <p className="mt-1 text-[40px] leading-none font-bold tabular-nums">4:12</p>
        <p className="mt-1 text-[12px] text-label-secondary">Just 5 minutes</p>
      </div>
      <div className="mt-auto mb-6 flex gap-2 px-4">
        <div className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-accent text-[15px] font-semibold text-on-accent">
          <Play className="size-4" fill="currentColor" /> Start 5 min
        </div>
        <div className="flex h-11 items-center justify-center rounded-[12px] bg-fill px-4 text-[15px] font-medium">
          Not today
        </div>
      </div>
    </div>
  );
}

function ReviewScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenTitle kicker="Cycle 12" title="Review" />
      <div className="mx-5 grid grid-cols-3 gap-2 text-center">
        {[
          ["21", "points done"],
          ["80%", "of plan"],
          ["9 h", "focus"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-[12px] bg-surface-sunken py-2.5">
            <p className="text-[18px] font-bold tabular-nums">{n}</p>
            <p className="text-[10px] text-label-secondary">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 px-5 text-[11px] font-semibold tracking-[0.06em] text-label-tertiary uppercase">
        Why things slipped
      </p>
      <div className="mt-2 flex flex-col gap-1.5 px-5">
        {[
          ["Too big", "w-4/5"],
          ["No time", "w-2/5"],
        ].map(([l, w]) => (
          <div key={l} className="flex items-center gap-2 text-[12px]">
            <span className="w-16 text-label-secondary">{l}</span>
            <span className={cn("h-2 rounded-full bg-[color:var(--area-purple)]", w)} />
          </div>
        ))}
      </div>
      <p className="mt-4 px-5 text-[11px] font-semibold tracking-[0.06em] text-label-tertiary uppercase">Unfinished</p>
      <div className="mx-4 mt-1 flex items-center gap-2 rounded-[12px] px-2 py-2 text-[14px]">
        <Inbox className="size-4 shrink-0 text-label-secondary" />
        <span className="min-w-0 flex-1 truncate">Course: Indexes</span>
        <span className="rounded-full bg-accent-fill px-2 py-0.5 text-[11px] font-semibold text-accent-text">
          Next cycle
        </span>
      </div>
      <div className="mt-auto mb-6 px-4">
        <div className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(90deg,var(--xp-from),var(--xp-to))] text-[15px] font-bold text-white">
          <Star className="size-4" fill="currentColor" /> Level 7 · +240 XP
        </div>
      </div>
    </div>
  );
}
