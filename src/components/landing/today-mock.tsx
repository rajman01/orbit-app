import { Flame, Sparkles, Star, Timer } from "lucide-react";

/** Decorative preview of the Today screen (not interactive). */
export function TodayMock() {
  const mustDos = [
    {
      title: "Send CV to 3 companies",
      step: "Open the doc and update the summary",
      area: "var(--area-blue)",
      areaName: "Career",
      done: true,
    },
    {
      title: "Call mum",
      step: "Pick a time after dinner",
      area: "var(--area-pink)",
      areaName: "Relationships",
      done: false,
    },
    {
      title: "Set up emergency fund",
      step: "Open a savings account online",
      area: "var(--area-green)",
      areaName: "Finance",
      done: false,
    },
  ];
  const others = [
    {
      title: "Finish chapter 4 of Designing Data-Intensive Apps",
      area: "var(--area-orange)",
    },
    { title: "Review budget for November", area: "var(--area-green)" },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div
        className="absolute -inset-x-10 -inset-y-12 -z-10 rounded-[48px] opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, var(--accent-fill), transparent 70%)",
        }}
        aria-hidden
      />
      <div className="overflow-hidden rounded-[28px] border border-separator bg-surface shadow-4">
        <div className="flex items-center justify-between border-b border-separator px-6 pt-6 pb-4">
          <div>
            <p className="text-[12px] font-medium text-label-secondary">
              Thursday 12 November
            </p>
            <p className="text-[28px] leading-tight font-bold tracking-[-0.02em]">
              Today
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[13px] font-semibold text-warning-text">
              <Flame className="size-4" aria-hidden /> 12
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-[conic-gradient(var(--xp-from)_0_72%,var(--fill)_72%_100%)]">
              <span className="grid size-7 place-items-center rounded-full bg-surface text-[12px] font-bold tabular-nums">
                7
              </span>
            </span>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.06em] text-label-secondary uppercase">
            Must-dos · 1 of 3
          </p>
          {mustDos.map((t) => (
            <div
              key={t.title}
              className="flex items-start gap-3 rounded-[14px] px-2 py-2.5"
            >
              <span
                className="mt-0.5 grid size-[20px] shrink-0 place-items-center rounded-full border-[1.5px]"
                style={{
                  borderColor: t.done
                    ? "var(--success)"
                    : "var(--label-tertiary)",
                  background: t.done ? "var(--success)" : undefined,
                }}
              >
                {t.done ? (
                  <svg viewBox="0 0 16 16" className="size-2.5">
                    <path
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
                  className={`truncate text-[15px] font-semibold ${t.done ? "text-label-tertiary line-through" : ""}`}
                >
                  {t.title}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-label-secondary">
                  ↳ {t.step}
                </p>
              </div>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-label-secondary">
                <span
                  className="size-2 rounded-full"
                  style={{ background: t.area }}
                />
                <span className="hidden sm:inline">{t.areaName}</span>
              </span>
              <Star
                className="mt-1 size-3.5 fill-[var(--accent)] text-accent"
                aria-hidden
              />
            </div>
          ))}
        </div>

        <div className="mx-6 h-px bg-separator" />

        <div className="px-4 pt-3 pb-3">
          <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.06em] text-label-secondary uppercase">
            Also today
          </p>
          {others.map((t) => (
            <div key={t.title} className="flex items-center gap-3 px-2 py-2">
              <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-label-tertiary" />
              <p className="min-w-0 flex-1 truncate text-[14px]">{t.title}</p>
              <span
                className="size-2 rounded-full"
                style={{ background: t.area }}
              />
            </div>
          ))}
          <div className="mx-2 mt-2 flex items-center gap-2 rounded-[12px] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-[13px] text-warning-text">
            <span className="font-semibold">Postponed 3×:</span>
            <span className="truncate">
              “Update LinkedIn” — start with 5 minutes?
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-separator bg-surface-sunken px-6 py-3.5">
          <span className="flex items-center gap-2 text-[13px] text-label-secondary">
            <Sparkles className="size-4 text-accent" aria-hidden />
            Coach: “You finish more on mornings. Do the call first?”
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-on-accent sm:flex">
            <Timer className="size-3.5" aria-hidden /> Start
          </span>
        </div>
      </div>
    </div>
  );
}
