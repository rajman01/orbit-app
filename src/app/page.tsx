import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { OrbitMark } from "@/components/app/app-shell";
import { PrimaryCta } from "@/components/landing/cta";
import {
  AccountabilityIllustration,
  CaptureIllustration,
  ChaosToOrbitIllustration,
  CoachIllustration,
  CycleIllustration,
  DoIllustration,
  GoalsIllustration,
  HeroOrbits,
  PeopleIllustration,
  PlanIllustration,
  ReviewIllustration,
  Starfield,
  StartIllustration,
} from "@/components/landing/illustrations";
import { FocusDemo, GoalDemo } from "@/components/landing/demos";
import { LandingNav } from "@/components/landing/nav";
import { Reveal } from "@/components/landing/reveal";
import { TodayMock } from "@/components/landing/today-mock";

export const metadata: Metadata = {
  title: { absolute: "Orbit — Linear for your life" },
  description:
    "Orbit turns your goals in career, relationships, finance and learning into a plan you actually follow — with a coach that won’t let you drift.",
};

type Illustration = (props: { className?: string }) => React.ReactNode;

const FEATURES: {
  art: Illustration;
  tint: string;
  title: string;
  body: string;
}[] = [
  {
    art: GoalsIllustration,
    tint: "var(--area-blue)",
    title: "Goals with a next step",
    body: "Every ambition becomes a goal with key results, milestones and one small next action — so nothing stays vague.",
  },
  {
    art: CycleIllustration,
    tint: "var(--accent)",
    title: "Two-week cycles",
    body: "Commit to what you’ll do this cycle, see your progress, and close it with a Sunday review. Sprints, but for your life.",
  },
  {
    art: StartIllustration,
    tint: "var(--area-orange)",
    title: "Built for starting",
    body: "Big tasks get a two-minute first step and a “just 5 minutes” focus timer. Starting stops being the hard part.",
  },
  {
    art: AccountabilityIllustration,
    tint: "var(--warning)",
    title: "Real accountability",
    body: "No silent skipping. Postpone something and Orbit asks why — then helps you shrink it, schedule it or let it go.",
  },
  {
    art: PeopleIllustration,
    tint: "var(--area-pink)",
    title: "People who matter",
    body: "Keep your close circle close: reminders to reach out, birthdays, and notes on what’s going on in their lives.",
  },
  {
    art: CoachIllustration,
    tint: "var(--area-purple)",
    title: "A coach that acts",
    body: "Tell the AI coach what you want. It drafts the plan, sets reminders and blocks time — and every change can be undone.",
  },
];

const STEPS: { art: Illustration; title: string; body: string }[] = [
  {
    art: CaptureIllustration,
    title: "Capture",
    body: "Dump every idea and to-do into the inbox in two seconds.",
  },
  {
    art: PlanIllustration,
    title: "Plan",
    body: "Turn them into goals, then commit to a realistic two-week cycle.",
  },
  {
    art: DoIllustration,
    title: "Do",
    body: "Each morning pick three must-dos. Start with five minutes.",
  },
  {
    art: ReviewIllustration,
    title: "Review",
    body: "On Sunday, see what got done, why things slipped, and level up.",
  },
];

const AREAS = [
  { name: "Career", color: "var(--area-blue)" },
  { name: "Relationships", color: "var(--area-pink)" },
  { name: "Finance", color: "var(--area-green)" },
  { name: "Learning", color: "var(--area-orange)" },
];

const SKIP_REASONS = ["Too big", "Unclear what to do", "No time", "Low energy", "Avoiding it"];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-label">
      {/* Without JavaScript nothing waits to be revealed. */}
      <noscript>
        <style>{".reveal{opacity:1;transform:none}"}</style>
      </noscript>
      <LandingNav />

      <main className="overflow-x-clip">
        {/* Hero */}
        {/* Always night: the hero carries the app's space identity in both themes. */}
        <section
          id="hero"
          className="dark relative isolate -mt-[calc(3.5rem+env(safe-area-inset-top))] overflow-hidden pt-[calc(3.5rem+env(safe-area-inset-top))] text-label"
          style={{
            background:
              "radial-gradient(90% 70% at 72% 45%, #0f3b4a 0%, transparent 60%), linear-gradient(180deg, #04080d 0%, #06141c 55%, #082530 100%)",
          }}
        >
          <Starfield className="pointer-events-none absolute inset-0 -z-10 size-full" />
          <span
            aria-hidden
            className="hero-shoot pointer-events-none absolute top-[12%] left-[8%] -z-10 h-px w-28 rounded-full bg-[linear-gradient(90deg,transparent,white)]"
          />
          <span
            aria-hidden
            className="hero-shoot pointer-events-none absolute top-[38%] left-[38%] -z-10 h-px w-20 rounded-full bg-[linear-gradient(90deg,transparent,white)]"
            style={{ ["--il-d" as string]: "7.5s", ["--il-t" as string]: "13s" }}
          />
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-24 lg:pb-28">
            <div className="landing-rise text-center lg:text-left">
              <div className="mb-6 flex flex-wrap justify-center gap-2 lg:justify-start">
                {AREAS.map((a) => (
                  <span
                    key={a.name}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full bg-fill px-3 text-[13px] font-medium text-label-secondary"
                  >
                    <span className="size-2 rounded-full" style={{ background: a.color }} />
                    {a.name}
                  </span>
                ))}
              </div>
              <h1 className="text-[clamp(2.6rem,6.5vw,4.5rem)] leading-[1.02] font-bold tracking-[-0.035em]">
                Stop planning
                <br />
                to start.{" "}
                <span className="bg-[linear-gradient(90deg,var(--xp-from),var(--xp-to))] bg-clip-text text-transparent">
                  Start.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-[clamp(1.0625rem,1.6vw,1.25rem)] leading-[1.5] text-label-secondary lg:mx-0">
                Orbit is Linear for your life. It turns everything you want — a better role, stronger relationships,
                healthier finances — into a plan with clear next steps, and holds you to it.
              </p>
              <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
                <PrimaryCta />
                <span className="flex items-center gap-2 text-[14px] text-label-secondary">
                  <WifiOff className="size-4" aria-hidden /> Installs on your phone · works offline
                </span>
              </div>
            </div>
            <div className="landing-rise relative [animation-delay:120ms]">
              <HeroOrbits className="pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[min(150%,820px)] max-w-none -translate-x-1/2 -translate-y-1/2" />
              <TodayMock />
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="border-y border-separator bg-bg-grouped">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:py-24">
            <Reveal>
              <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">Why Orbit</p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                You don’t lack ambition.
                <br />
                You lack a system that won’t let you drift.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-[1.55] text-label-secondary">
                To-do apps forget why a task matters. Goal apps never get down to today. Orbit connects the two — your
                vision, goals, cycles and today’s three must-dos — and notices when something quietly slips.
              </p>
            </Reveal>
            <Reveal from="scale" delay={120}>
              <ChaosToOrbitIllustration className="mx-auto mt-12 w-full max-w-[560px]" />
            </Reveal>
          </div>
        </section>

        {/* The product */}
        <section>
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">The product</p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                Made to get you moving.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-[18px] leading-[1.55] text-label-secondary">
                These are the real screens. Start a task with five minutes on the clock, and watch each goal grow as the
                work gets done.
              </p>
            </Reveal>
            <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
              <Reveal from="left" className="flex flex-col">
                <FocusDemo />
                <p className="mt-4 px-1 text-[15px] leading-[1.55] text-label-secondary">
                  <strong className="font-semibold text-label">Focus mode.</strong> One task, one timer, nothing else.
                  The first session is five minutes, because starting is the hard part.
                </p>
              </Reveal>
              <Reveal from="right" delay={100} className="flex flex-col">
                <GoalDemo />
                <p className="mt-4 px-1 text-[15px] leading-[1.55] text-label-secondary">
                  <strong className="font-semibold text-label">Goals you can watch grow.</strong> Every goal is a
                  planet. It grows with your progress, and each milestone is a moon that lights up when you reach it.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Features */}
        <div className="border-t border-separator" />
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <Reveal className="max-w-2xl">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">Features</p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                Everything between “someday” and done.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ art: Art, tint, title, body }, i) => (
                <Reveal
                  as="article"
                  key={title}
                  delay={(i % 3) * 90}
                  className="overflow-hidden rounded-[20px] border border-separator bg-surface shadow-1"
                >
                  <div
                    className="flex aspect-[12/7] items-center justify-center p-4"
                    style={{
                      background: `color-mix(in srgb, ${tint} 7%, var(--surface-sunken))`,
                    }}
                  >
                    <Art className="h-full w-full" />
                  </div>
                  <div className="p-6 pt-5">
                    <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h3>
                    <p className="mt-2 text-[15px] leading-[1.55] text-label-secondary">{body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Accountability spotlight */}
        <section className="bg-bg-grouped">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <Reveal from="left">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-warning-text uppercase">Accountability</p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                Firm, never shaming.
              </h2>
              <p className="mt-5 text-[18px] leading-[1.55] text-label-secondary">
                Every skip needs a reason. Tasks you keep postponing get pinned until you decide what to do with them.
                Over time, Orbit shows you <em>why</em> you procrastinate — and what actually helps you start.
              </p>
              <ul className="mt-8 flex flex-col gap-3 text-[16px]">
                {[
                  "Postponed 3 times? It gets pinned, not buried.",
                  "Goals without a next step come back every morning.",
                  "Levels and XP for finishing — with a bonus for beating procrastination.",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal
              from="right"
              delay={100}
              className="mx-auto w-full max-w-md rounded-[28px] border border-separator bg-surface p-6 shadow-3"
            >
              <div className="mx-auto mb-5 h-[5px] w-9 rounded-full bg-fill-strong" aria-hidden />
              <p className="text-[20px] font-semibold tracking-[-0.01em]">Why are you skipping this?</p>
              <p className="mt-1 text-[15px] text-label-secondary">“Update LinkedIn profile” · postponed 3×</p>
              <div className="mt-5 flex flex-col gap-2">
                {SKIP_REASONS.map((r) => (
                  <div
                    key={r}
                    className={`flex h-12 items-center justify-between rounded-[12px] px-4 text-[16px] font-medium ${r === "Avoiding it" ? "bg-accent-fill text-accent-text" : "bg-fill"}`}
                  >
                    {r}
                    {r === "Avoiding it" ? <span className="text-[13px] font-semibold">Start 5 min →</span> : null}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">How it works</p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                One loop, every two weeks.
              </h2>
            </Reveal>
            <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ art: Art, title, body }, i) => (
                <Reveal as="li" key={title} delay={i * 90}>
                  <div className="flex aspect-[5/3] items-center justify-center rounded-[20px] bg-surface-sunken p-3">
                    <Art className="h-full w-full" />
                  </div>
                  <div className="mt-5 flex items-baseline gap-2.5">
                    <span className="text-[13px] font-semibold text-accent-text tabular-nums">0{i + 1}</span>
                    <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h3>
                  </div>
                  <p className="mt-1.5 text-[15px] leading-[1.55] text-label-secondary">{body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <Reveal
            from="scale"
            className="mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,var(--band-from),var(--band-to))] px-6 py-16 text-center text-white sm:py-20"
          >
            <OrbitMarkWhite />
            <h2 className="mx-auto mt-6 max-w-2xl text-[clamp(1.9rem,4.5vw,3rem)] leading-[1.08] font-bold tracking-[-0.03em]">
              The best version of you is a plan away.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[18px] leading-[1.5] text-white/80">
              Set up your first goal in under three minutes. Add Orbit to your home screen and take it everywhere.
            </p>
            <div className="mt-9 flex justify-center">
              <PrimaryCta tone="inverse" />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-separator">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[14px] text-label-secondary sm:flex-row sm:px-6">
          <span className="flex items-center gap-2">
            <OrbitMark size={18} /> Orbit
          </span>
          <span>Made for getting things done, not planning to.</span>
        </div>
      </footer>
    </div>
  );
}

function OrbitMarkWhite() {
  return (
    <svg width={44} height={44} viewBox="0 0 32 32" className="mx-auto" aria-hidden>
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="white" strokeWidth="3" />
      <circle cx="24.5" cy="9" r="4" fill="white" />
    </svg>
  );
}
