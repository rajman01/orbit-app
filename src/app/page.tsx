import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import Link from "next/link";
import { OrbitMark } from "@/components/app/app-shell";
import { NavAuthLink, PrimaryCta } from "@/components/landing/cta";
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
  StartIllustration,
} from "@/components/landing/illustrations";
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

const SKIP_REASONS = [
  "Too big",
  "Unclear what to do",
  "No time",
  "Low energy",
  "Avoiding it",
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-label">
      {/* Translucent nav — content scrolls beneath it */}
      <header className="material-chrome sticky top-0 z-30 border-b border-separator pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="Orbit home"
          >
            <OrbitMark size={26} />
            <span className="text-[17px] font-semibold tracking-[-0.01em]">
              Orbit
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Site">
            <a
              href="#features"
              className="hidden h-9 items-center rounded-full px-4 text-[15px] font-medium text-label-secondary hover:text-label md:inline-flex"
            >
              Features
            </a>
            <a
              href="#how"
              className="hidden h-9 items-center rounded-full px-4 text-[15px] font-medium text-label-secondary hover:text-label md:inline-flex"
            >
              How it works
            </a>
            <NavAuthLink />
            <PrimaryCta size="default" />
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-24 lg:pb-28">
            <div className="landing-rise text-center lg:text-left">
              <div className="mb-6 flex flex-wrap justify-center gap-2 lg:justify-start">
                {AREAS.map((a) => (
                  <span
                    key={a.name}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full bg-fill px-3 text-[13px] font-medium text-label-secondary"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: a.color }}
                    />
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
                Orbit is Linear for your life. It turns everything you want — a
                better role, stronger relationships, healthier finances — into a
                plan with clear next steps, and holds you to it.
              </p>
              <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
                <PrimaryCta />
                <span className="flex items-center gap-2 text-[14px] text-label-secondary">
                  <WifiOff className="size-4" aria-hidden /> Installs on your
                  phone · works offline
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
            <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">
              Why Orbit
            </p>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
              You don’t lack ambition.
              <br />
              You lack a system that won’t let you drift.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-[1.55] text-label-secondary">
              To-do apps forget why a task matters. Goal apps never get down to
              today. Orbit connects the two — your vision, goals, cycles and
              today’s three must-dos — and notices when something quietly slips.
            </p>
            <ChaosToOrbitIllustration className="mx-auto mt-12 w-full max-w-[560px]" />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <div className="max-w-2xl">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">
                Features
              </p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                Everything between “someday” and done.
              </h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ art: Art, tint, title, body }) => (
                <article
                  key={title}
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
                    <h3 className="text-[19px] font-semibold tracking-[-0.01em]">
                      {title}
                    </h3>
                    <p className="mt-2 text-[15px] leading-[1.55] text-label-secondary">
                      {body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Accountability spotlight */}
        <section className="bg-bg-grouped">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div>
              <p className="text-[13px] font-semibold tracking-[0.08em] text-warning-text uppercase">
                Accountability
              </p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                Firm, never shaming.
              </h2>
              <p className="mt-5 text-[18px] leading-[1.55] text-label-secondary">
                Every skip needs a reason. Tasks you keep postponing get pinned
                until you decide what to do with them. Over time, Orbit shows
                you <em>why</em> you procrastinate — and what actually helps you
                start.
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
            </div>
            <div className="mx-auto w-full max-w-md rounded-[28px] border border-separator bg-surface p-6 shadow-3">
              <div
                className="mx-auto mb-5 h-[5px] w-9 rounded-full bg-fill-strong"
                aria-hidden
              />
              <p className="text-[20px] font-semibold tracking-[-0.01em]">
                Why are you skipping this?
              </p>
              <p className="mt-1 text-[15px] text-label-secondary">
                “Update LinkedIn profile” · postponed 3×
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {SKIP_REASONS.map((r) => (
                  <div
                    key={r}
                    className={`flex h-12 items-center justify-between rounded-[12px] px-4 text-[16px] font-medium ${r === "Avoiding it" ? "bg-accent-fill text-accent-text" : "bg-fill"}`}
                  >
                    {r}
                    {r === "Avoiding it" ? (
                      <span className="text-[13px] font-semibold">
                        Start 5 min →
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">
                How it works
              </p>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.025em]">
                One loop, every two weeks.
              </h2>
            </div>
            <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ art: Art, title, body }, i) => (
                <li key={title}>
                  <div className="flex aspect-[5/3] items-center justify-center rounded-[20px] bg-surface-sunken p-3">
                    <Art className="h-full w-full" />
                  </div>
                  <div className="mt-5 flex items-baseline gap-2.5">
                    <span className="text-[13px] font-semibold text-accent-text tabular-nums">
                      0{i + 1}
                    </span>
                    <h3 className="text-[19px] font-semibold tracking-[-0.01em]">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-1.5 text-[15px] leading-[1.55] text-label-secondary">
                    {body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,var(--band-from),var(--band-to))] px-6 py-16 text-center text-white sm:py-20">
            <OrbitMarkWhite />
            <h2 className="mx-auto mt-6 max-w-2xl text-[clamp(1.9rem,4.5vw,3rem)] leading-[1.08] font-bold tracking-[-0.03em]">
              The best version of you is a plan away.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[18px] leading-[1.5] text-white/80">
              Set up your first goal in under three minutes. Add Orbit to your
              home screen and take it everywhere.
            </p>
            <div className="mt-9 flex justify-center">
              <PrimaryCta tone="inverse" />
            </div>
          </div>
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
    <svg
      width={44}
      height={44}
      viewBox="0 0 32 32"
      className="mx-auto"
      aria-hidden
    >
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        stroke="white"
        strokeWidth="3"
      />
      <circle cx="24.5" cy="9" r="4" fill="white" />
    </svg>
  );
}
