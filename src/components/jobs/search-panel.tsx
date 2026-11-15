"use client";

import { ChevronDown, Pause, Play, RefreshCw, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { Button } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import { useCareerProfile } from "@/features/data";
import { searchSettings, SKIP_REASON_LABEL, type SearchSettings, type SkipReasons } from "@/features/jobs/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayLabel } from "@/lib/dates";

/** What GET /api/jobs/search returns. */
export interface SearchRun {
  at: number;
  kind: "daily" | "manual";
  checked: number;
  matched: number;
  ranked: number;
  kept: number;
  errors: string[];
  sources: { key: string; label: string; found: number; error: string | null }[];
  reasons: SkipReasons | null;
  costUsd: number | null;
}
interface Plan {
  ready: boolean;
  paused: boolean;
  settings: SearchSettings;
  nextRun: { day: string; hour: number } | null;
  sources: { key: string; label: string; covers: string; enabled: boolean }[];
  adzuna: boolean;
}

const hourLabel = (h: number) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, h));

/** "today", "tomorrow", but "Nov 29" (only the relative words are lower-cased mid-sentence). */
const inSentence = (label: string) => (/^(Today|Tomorrow|Yesterday)$/.test(label) ? label.toLowerCase() : label);

const select =
  "h-9 rounded-md bg-surface-sunken px-2 text-callout outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 3D.4: how the job search runs and what it did — pause it, change when and how much it ranks,
 * switch sources off, and read each run's activity (sources, counts, why roles were left out, cost).
 */
export function SearchPanel({
  version,
  onCheckNow,
  checking,
}: {
  version: number;
  onCheckNow: () => void;
  checking: boolean;
}) {
  const profile = useCareerProfile();
  const actions = useActions();
  const engine = useSync();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [runs, setRuns] = useState<SearchRun[]>([]);
  const [reload, setReload] = useState(0);
  const [untilDraft, setUntilDraft] = useState(addDays(today, 14));
  const saved = searchSettings(profile);
  // Switches and pause flip at once; the saved settings (a moment later, via the local database) take over.
  const [pending, setPending] = useState<{ base: string; patch: Partial<SearchSettings> } | null>(null);
  const savedKey = JSON.stringify(saved);
  const settings = pending && pending.base === savedKey ? { ...saved, ...pending.patch } : saved;
  // Reload when the settings (synced) or a run change.
  const settingsKey = JSON.stringify(profile?.search ?? null);
  useEffect(() => {
    let off = false;
    void fetch("/api/jobs/search", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { runs: SearchRun[]; plan: Plan | null } | null) => {
        if (off || !b) return;
        setRuns(b.runs);
        setPlan(b.plan);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [version, reload, settingsKey]);

  if (!profile) return null;
  const change = async (patch: Partial<SearchSettings>) => {
    setPending({ base: savedKey, patch: { ...(pending?.base === savedKey ? pending.patch : {}), ...patch } });
    await actions.updateJobSearch(patch);
    // The server reads the settings: send them now, then refresh the plan.
    await engine.sync().catch(() => {});
    setReload((v) => v + 1);
  };
  const paused = settings.paused && (settings.pausedUntil == null || today < settings.pausedUntil);
  const last = runs[0];
  const status = paused
    ? settings.pausedUntil
      ? `Paused until ${inSentence(dayLabel(settings.pausedUntil, today))}`
      : "Paused"
    : plan?.nextRun
      ? `Next search ${inSentence(dayLabel(plan.nextRun.day, today))} from ${hourLabel(plan.nextRun.hour)}`
      : plan && !plan.ready
        ? "Waiting for your profile"
        : "Searching daily";
  const enabledCount = plan?.sources.filter((s) => !settings.off.includes(s.key)).length ?? 0;

  return (
    <section
      aria-label="Search settings and activity"
      className="mb-4 rounded-xl bg-surface shadow-1 dark:bg-surface-raised"
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              paused ? "bg-warning" : plan?.ready === false ? "bg-label-tertiary" : "bg-success",
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-callout font-semibold">{status}</span>
            <span className="block truncate text-footnote text-label-secondary">
              {last
                ? `Last ${last.kind === "manual" ? "check" : "search"} ${new Date(last.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}: ${last.kept} kept of ${last.matched} matching`
                : "No searches yet"}
              {plan ? ` · ${enabledCount} source${enabledCount === 1 ? "" : "s"}` : ""}
            </span>
          </span>
          <ChevronDown
            className={cn("ml-auto size-4 shrink-0 text-label-tertiary transition-transform", open && "rotate-180")}
          />
        </button>
        <Button
          variant="secondary"
          icon={<RefreshCw className={cn("size-4", checking && "animate-spin motion-reduce:animate-none")} />}
          onClick={onCheckNow}
          disabled={checking || plan?.ready === false}
        >
          Check now
        </Button>
      </div>

      {open ? (
        <div className="flex flex-col gap-5 border-t border-separator p-4">
          <div className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-footnote font-semibold text-label-secondary">
              <Settings2 className="size-4" /> Settings
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {paused ? (
                <Button
                  icon={<Play className="size-4" />}
                  onClick={() => void change({ paused: false, pausedUntil: null })}
                >
                  Resume the search
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    icon={<Pause className="size-4" />}
                    onClick={() => void change({ paused: true, pausedUntil: null })}
                  >
                    Pause
                  </Button>
                  <span className="flex w-full flex-wrap items-center gap-1.5 text-callout text-label-secondary sm:w-auto">
                    or until
                    <input
                      type="date"
                      aria-label="Pause until"
                      value={untilDraft}
                      min={addDays(today, 1)}
                      onChange={(e) => setUntilDraft(e.target.value)}
                      className={cn(select, "min-w-0 flex-1 sm:flex-none")}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => untilDraft > today && void change({ paused: true, pausedUntil: untilDraft })}
                    >
                      Pause until then
                    </Button>
                  </span>
                </>
              )}
            </div>
            <p className="text-footnote text-label-tertiary">
              While paused there&rsquo;s no daily search and no morning push; Check now still works.
            </p>
            <div className="mt-1 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-footnote text-label-secondary">
                Search from
                <select
                  aria-label="Search from"
                  className={select}
                  value={settings.hour}
                  onChange={(e) => void change({ hour: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-footnote text-label-secondary">
                Rank up to (a day)
                <select
                  aria-label="Rank up to"
                  className={select}
                  value={settings.maxRanked}
                  onChange={(e) => void change({ maxRanked: Number(e.target.value) })}
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n} new roles
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-footnote text-label-secondary">
                Keep roles that fit at least
                <select
                  aria-label="Minimum fit"
                  className={select}
                  value={settings.minFit}
                  onChange={(e) => void change({ minFit: Number(e.target.value) })}
                >
                  {[40, 55, 70].map((n) => (
                    <option key={n} value={n}>
                      {n}%{n === 40 ? " (more roles)" : n === 70 ? " (strong only)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-footnote font-semibold text-label-secondary">Where it looks</h3>
            {plan?.sources.length ? (
              <ul aria-label="Sources" className="flex flex-col">
                {plan.sources.map((src) => {
                  // The switch follows your settings on this device at once; the plan catches up after sync.
                  const s = { ...src, enabled: !settings.off.includes(src.key) };
                  return (
                    <li key={s.key} className="flex min-h-row items-center gap-3 rounded-md px-1">
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-callout",
                            !s.enabled && "text-label-tertiary line-through",
                          )}
                        >
                          {s.label}
                        </span>
                        <span className="block truncate text-footnote text-label-tertiary">{s.covers}</span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`Search ${s.label}`}
                        checked={s.enabled}
                        onChange={(e) =>
                          void change({
                            off: e.target.checked ? settings.off.filter((k) => k !== s.key) : [...settings.off, s.key],
                          })
                        }
                        className="size-5 accent-[var(--accent)]"
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-callout text-label-secondary">
                No sources yet: add markets or companies to watch in your profile.
              </p>
            )}
            <p className="text-footnote text-label-tertiary">
              Searches use your roles (up to three). Change markets, roles and companies in your profile.
              {plan && !plan.adzuna
                ? " UK, US and Canada feeds (Adzuna) need a free key; until then those markets come from the companies you watch."
                : ""}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-footnote font-semibold text-label-secondary">Activity</h3>
            {runs.length ? (
              <ol aria-label="Activity" className="flex flex-col gap-2">
                {runs.map((r) => (
                  <RunRow key={r.at} run={r} />
                ))}
              </ol>
            ) : (
              <p className="text-callout text-label-secondary">
                Nothing yet. The first search runs at the next search time, or tap Check now.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RunRow({ run }: { run: SearchRun }) {
  const [open, setOpen] = useState(false);
  const left = run.reasons
    ? (Object.entries(run.reasons) as [keyof SkipReasons, number][]).filter(([, n]) => n > 0)
    : [];
  return (
    <li className="rounded-lg bg-surface-sunken p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-callout font-medium">
            {new Date(run.at).toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
            <span className="font-normal text-label-tertiary"> · {run.kind === "manual" ? "Check now" : "daily"}</span>
          </span>
          <span className="block text-footnote text-label-secondary">
            {run.checked} checked · {run.matched} matching · {run.ranked} ranked ·{" "}
            <strong className="text-label">{run.kept} kept</strong>
            {run.costUsd != null ? ` · about $${run.costUsd < 0.01 ? "<0.01" : run.costUsd.toFixed(2)}` : ""}
            {run.errors.length ? ` · ${run.errors.length} source${run.errors.length === 1 ? "" : "s"} failed` : ""}
          </span>
        </span>
        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-label-tertiary transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2 text-footnote">
          {left.length ? (
            <div>
              <p className="font-medium text-label-secondary">Left out</p>
              <ul className="list-disc pl-5 text-label-secondary">
                {left.map(([k, n]) => (
                  <li key={k}>
                    {n} {SKIP_REASON_LABEL[k]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {run.sources.length ? (
            <div>
              <p className="font-medium text-label-secondary">Sources</p>
              <ul className="flex flex-col gap-0.5">
                {run.sources.map((s) => (
                  <li key={s.key} className="flex justify-between gap-3">
                    <span className="truncate">{s.label}</span>
                    <span className={cn("shrink-0 tabular", s.error ? "text-danger-text" : "text-label-tertiary")}>
                      {s.error ? `failed: ${s.error}` : `${s.found} roles`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
