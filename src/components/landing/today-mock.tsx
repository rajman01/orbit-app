import { AlertTriangle, Play, Star } from "lucide-react";

const MUST_DOS = [
  {
    title: "Send CV to 3 companies",
    step: "Open the doc and update the summary",
    area: "var(--area-blue)",
    state: "done",
  },
  // Ticked off on a loop, to show the app in motion.
  { title: "Call mum", step: "Pick a time after dinner", area: "var(--area-pink)", state: "live" },
  {
    title: "Set up emergency fund",
    step: "Open a savings account online",
    area: "var(--area-green)",
    state: "open",
  },
] as const;

const OTHERS = [
  { title: "Finish chapter 4 of Designing Data-Intensive Apps", area: "var(--area-orange)" },
  { title: "Review budget for November", area: "var(--area-green)" },
];

/** A faithful, non-interactive copy of the real Today screen. */
export function TodayMock() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div
        className="absolute -inset-x-10 -inset-y-12 -z-10 rounded-[48px] opacity-70 blur-3xl"
        style={{ background: "radial-gradient(60% 60% at 50% 40%, rgb(64 200 224 / 0.35), transparent 70%)" }}
        aria-hidden
      />
      <div className="overflow-hidden rounded-[28px] border border-separator bg-bg shadow-4">
        <div className="px-6 pt-6 pb-3">
          <p className="text-[12px] font-medium text-label-secondary">Thursday 12 November</p>
          <p className="text-[28px] leading-tight font-bold tracking-[-0.02em]">Today</p>
        </div>

        {/* The day as a solar system — the header of the real Today screen. */}
        <div
          className="relative mx-4 flex items-center gap-3 overflow-hidden rounded-[20px] px-4 py-3.5 text-white"
          style={{ background: "linear-gradient(135deg, var(--band-from), var(--band-to) 55%, #0b3c52)" }}
        >
          <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {[
              [8, 16],
              [30, 88],
              [44, 10],
              [58, 70],
              [63, 24],
              [96, 60],
            ].map(([x, y], i) => (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r={1}
                fill="white"
                className="twinkle"
                style={{ animationDelay: `${i * 0.6}s` }}
              />
            ))}
          </svg>
          <div className="relative min-w-0 flex-1">
            <p className="text-[12px] font-medium text-white/75">Good morning</p>
            <p className="text-[17px] leading-snug font-semibold">1 of 5 done. Keep it moving.</p>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="mock-ring flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[var(--accent-on-white)]">
                <Play className="size-3" fill="currentColor" aria-hidden /> Start
              </span>
              <span className="min-w-0 truncate text-[12px] text-white/85">
                <span className="text-white/60">Next:</span> Call mum
              </span>
            </div>
          </div>
          <MiniOrbit />
        </div>

        <div className="mx-6 mt-3.5">
          <div className="flex justify-between text-[11px] text-label-secondary">
            <span>
              <span className="font-semibold text-label">6 / 8 pts</span> planned
            </span>
            <span>2 pts done</span>
          </div>
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill">
            <div className="absolute inset-y-0 left-0 w-3/4 rounded-full bg-accent/30" />
            <div className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-accent" />
          </div>
        </div>

        <div className="px-4 pt-3 pb-1">
          <p className="px-2 pb-0.5 text-[10px] font-semibold tracking-[0.06em] text-label-secondary uppercase">
            Must-dos · 3
          </p>
          {MUST_DOS.map((t) => (
            <div key={t.title} className="flex items-center gap-3 rounded-[14px] px-2 py-2">
              <span
                className={`grid size-[20px] shrink-0 place-items-center rounded-full border-[1.5px] ${t.state === "live" ? "mock-check-fill" : ""}`}
                style={{
                  borderColor: t.state === "done" ? "var(--success)" : "var(--label-tertiary)",
                  background: t.state === "done" ? "var(--success)" : undefined,
                }}
              >
                {t.state !== "open" ? (
                  <svg viewBox="0 0 16 16" className="size-2.5">
                    <path
                      pathLength={1}
                      className={t.state === "live" ? "mock-check-draw" : undefined}
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[15px] font-semibold ${t.state === "done" ? "text-label-tertiary line-through" : ""} ${t.state === "live" ? "mock-title-done" : ""}`}
                >
                  {t.title}
                </p>
                {t.state !== "done" ? <p className="truncate text-[12.5px] text-label-secondary">↳ {t.step}</p> : null}
              </div>
              <span className="size-2 shrink-0 rounded-full" style={{ background: t.area }} />
              {t.state === "open" ? (
                <span className="hidden h-7 shrink-0 items-center gap-1 rounded-full bg-accent-fill px-2.5 text-[11.5px] font-semibold text-accent-text sm:flex">
                  <Play className="size-3" fill="currentColor" aria-hidden /> Start
                </span>
              ) : null}
              <Star className="size-3.5 shrink-0 fill-[var(--warning)] text-warning" aria-hidden />
            </div>
          ))}
        </div>

        <div className="px-4 pb-2">
          <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-[0.06em] text-label-secondary uppercase">
            Also today · 2
          </p>
          {OTHERS.map((t) => (
            <div key={t.title} className="flex items-center gap-3 px-2 py-1.5">
              <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-label-tertiary" />
              <p className="min-w-0 flex-1 truncate text-[14px]">{t.title}</p>
              <span className="size-2 rounded-full" style={{ background: t.area }} />
            </div>
          ))}
        </div>

        {/* A stale task, pinned until it's dealt with. */}
        <div className="mx-4 mb-4 rounded-[14px] border border-warning/30 bg-warning/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.06em] text-warning-text uppercase">
            <AlertTriangle className="size-3" aria-hidden /> Needs a decision
          </p>
          <p className="mt-1 truncate text-[14px] font-medium">Update LinkedIn profile</p>
          <p className="text-[12px] font-medium text-warning-text">Postponed 3×. What&rsquo;s getting in the way?</p>
          <div className="mt-2 flex gap-1.5 overflow-hidden">
            {["Break it down", "Do 5 minutes now", "Reschedule"].map((a) => (
              <span
                key={a}
                className="h-7 shrink-0 rounded-full bg-surface px-2.5 text-[11.5px] leading-7 font-medium shadow-1 dark:bg-surface-raised"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The small solar system from the Today header: Must-dos orbit close, the rest further out. */
function MiniOrbit() {
  const C = 60;
  const moon = (deg: number, r: number, size: number, state: "done" | "open" | "live") => {
    const a = (deg * Math.PI) / 180;
    return (
      <circle
        key={`${deg}-${r}`}
        cx={C + r * Math.cos(a)}
        cy={C + r * Math.sin(a)}
        r={size}
        className={state === "live" ? "mock-moon" : undefined}
        fill={state === "done" ? "white" : "rgba(255,255,255,0.12)"}
        stroke="white"
        strokeOpacity={0.9}
        strokeWidth={state === "done" ? 0 : 1.75}
      />
    );
  };
  return (
    <svg viewBox="0 0 120 120" className="relative size-24 shrink-0 sm:size-28" aria-hidden>
      <defs>
        <radialGradient id="mock-planet" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#bdf3f7" />
          <stop offset="100%" stopColor="#5fd0dc" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={33} stroke="white" strokeOpacity={0.28} fill="none" />
      <circle cx={C} cy={C} r={52} stroke="white" strokeOpacity={0.2} fill="none" strokeDasharray="2 5" />
      <circle cx={C} cy={C} r={19} fill="url(#mock-planet)" />
      <text x={C} y={C + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0b6272">
        1/5
      </text>
      <g className="orbit-spin" style={{ ["--orbit-duration" as string]: "40s" }}>
        {moon(-90, 33, 5.5, "done")}
        {moon(30, 33, 5.5, "live")}
        {moon(150, 33, 5.5, "open")}
      </g>
      <g className="orbit-spin-reverse" style={{ ["--orbit-duration" as string]: "70s" }}>
        {moon(20, 52, 3.5, "open")}
        {moon(200, 52, 3.5, "open")}
      </g>
    </svg>
  );
}
