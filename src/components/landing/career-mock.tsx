import { CalendarRange, FileText, GraduationCap, Sparkles } from "lucide-react";

/** The career pieces as they look in the app: a role found for you, and a course planned to a date. */
export function CareerMock() {
  const sections = ["Foundations", "Joins", "Indexes", "Window functions", "Capstone"];
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col gap-4" aria-hidden>
      <div className="rounded-[24px] border border-separator bg-surface p-5 shadow-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-accent-text">
          <Sparkles className="size-3.5" /> Found for you
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[17px] font-semibold tracking-[-0.01em]">Product Designer</p>
            <p className="text-[14px] text-label-secondary">Northwind · Remote, UK</p>
          </div>
          <span className="shrink-0 rounded-full bg-accent-fill px-2.5 py-1 text-[13px] font-bold text-accent-text tabular-nums">
            86% fit
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-[14px] text-label-secondary">
          <li className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-success" />
            Design systems work matches your last two roles
          </li>
          <li className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
            Asks for user research: you have one project
          </li>
        </ul>
        <div className="mt-4 flex items-center gap-2 rounded-[12px] bg-fill px-3 py-2.5 text-[14px]">
          <FileText className="size-4 shrink-0 text-label-secondary" />
          <span className="min-w-0 flex-1 truncate">Tailored CV and cover letter ready</span>
          <span className="text-[13px] font-semibold text-accent-text">Review</span>
        </div>
      </div>

      <div className="ml-6 rounded-[24px] border border-separator bg-surface p-5 shadow-3 sm:ml-12">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-label-secondary" />
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">SQL for analysts</p>
          <span className="text-[13px] font-semibold text-label-secondary tabular-nums">40%</span>
        </div>
        <span className="mt-3 block h-2 overflow-hidden rounded-full bg-fill">
          <span className="block h-full w-2/5 rounded-full bg-accent" />
        </span>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-label-secondary">
          <CalendarRange className="size-3.5" /> On pace · finish by 12 Dec · next: Indexes, Wednesday
        </p>
        <ol className="mt-3 flex flex-col gap-1">
          {sections.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5 text-[14px]">
              <span
                className={`grid size-4 place-items-center rounded-full border-[1.5px] ${i < 2 ? "border-success bg-success" : "border-label-tertiary"}`}
              >
                {i < 2 ? (
                  <svg viewBox="0 0 12 12" className="size-2.5">
                    <path d="M3 6.2 5 8l4-4.2" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
                  </svg>
                ) : null}
              </span>
              <span className={i < 2 ? "text-label-tertiary line-through" : undefined}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
