"use client";

import { Bookmark, ChevronDown, ExternalLink, Link2, MapPin, RefreshCw, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { useSync } from "@/components/app/sync-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useCareerProfile, useJobPostings, type JobPostingDoc } from "@/features/data";
import { fitLabel, profileReadiness, STRONG_FIT } from "@/features/jobs/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel, dayOf } from "@/lib/dates";
import { area, field } from "./inputs";
import { SearchPanel } from "./search-panel";

const SOURCE_LABEL: Record<JobPostingDoc["source"], string> = {
  greenhouse: "the company's board",
  lever: "the company's board",
  ashby: "the company's board",
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  adzuna: "Adzuna",
  link: "a link you added",
};

/** CAR-5: roles found for you, best fit first. */
export function FoundRoles() {
  const postings = useJobPostings();
  const profile = useCareerProfile();
  const toast = useToast();
  const engine = useSync();
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [version, setVersion] = useState(0);

  const readiness = profileReadiness(profile ?? null);
  const fresh = (postings ?? []).filter((p) => p.status === "new");
  const saved = (postings ?? []).filter((p) => p.status === "saved");

  async function checkNow() {
    setChecking(true);
    const r = await fetch("/api/jobs/search", { method: "POST" }).catch(() => null);
    const b = (await r?.json().catch(() => null)) as { kept?: number; matched?: number; error?: string } | null;
    // The server saved what it found: fetch it now rather than at the next sync.
    await engine.sync().catch(() => {});
    setChecking(false);
    setVersion((v) => v + 1);
    if (!r?.ok) return toast({ message: b?.error ?? "Couldn't check right now" });
    toast({
      message: b?.kept
        ? `${b.kept} new role${b.kept === 1 ? "" : "s"} for you`
        : b?.matched
          ? "Nothing new that fits well"
          : "No new matching roles today",
    });
  }

  if (profile === undefined || postings === undefined) return null;

  return (
    <section aria-label="Found for you">
      {!readiness.ready ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl bg-accent-fill p-4">
          <p className="text-callout text-accent-text">
            {profile ? "Almost there. " : "Start with your career profile. "}Orbit needs {readiness.missing.join(", ")}{" "}
            to find and rank roles for you.
          </p>
          <div>
            <Link
              href="/jobs/profile"
              className="inline-flex h-control items-center gap-2 rounded-md bg-accent px-4 text-body font-semibold text-on-accent"
            >
              <UserRound className="size-4" /> {profile ? "Finish my profile" : "Set up my profile"}
            </Link>
          </div>
        </div>
      ) : null}

      <SearchPanel version={version} onCheckNow={() => void checkNow()} checking={checking} />
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" icon={<Link2 className="size-4" />} onClick={() => setAdding(true)}>
          Add a job link
        </Button>
      </div>

      {fresh.length ? (
        <ul aria-label="New roles" className="flex flex-col gap-2">
          {fresh.map((p) => (
            <PostingCard key={p.id} posting={p} />
          ))}
        </ul>
      ) : readiness.ready ? (
        <EmptyState
          icon={RefreshCw}
          title="Nothing new right now"
          body="New matches arrive each morning. Add companies to watch in your profile, or paste a job link you've found."
        />
      ) : null}

      {saved.length ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowSaved((v) => !v)}
            className="flex items-center gap-1.5 px-1 text-micro text-label-secondary uppercase"
            aria-expanded={showSaved}
          >
            Saved <span className="text-label-tertiary tabular">{saved.length}</span>
            <ChevronDown className={cn("size-3.5 transition-transform", showSaved && "rotate-180")} />
          </button>
          {showSaved ? (
            <ul aria-label="Saved roles" className="mt-2 flex flex-col gap-2">
              {saved.map((p) => (
                <PostingCard key={p.id} posting={p} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {adding ? <AddJobLink onClose={() => setAdding(false)} /> : null}
    </section>
  );
}

function FitBadge({ fit }: { fit: number | null }) {
  return (
    <span
      title={fitLabel(fit)}
      className={cn(
        "grid h-10 w-12 shrink-0 place-items-center rounded-lg text-callout font-semibold tabular",
        fit == null
          ? "bg-fill text-label-tertiary"
          : fit >= STRONG_FIT
            ? "bg-accent text-on-accent"
            : "bg-accent-fill text-accent-text",
      )}
      aria-label={fit == null ? "Not ranked" : `${fit}% fit, ${fitLabel(fit)}`}
    >
      {fit == null ? "–" : `${fit}%`}
    </span>
  );
}

export function PostingCard({ posting: p }: { posting: JobPostingDoc }) {
  const actions = useActions();
  const toast = useToast();
  const router = useRouter();
  const today = useToday();
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl bg-surface p-3 shadow-1 dark:bg-surface-raised">
      <div className="flex items-start gap-3">
        <FitBadge fit={p.fit} />
        <div className="min-w-0 flex-1">
          <p className="text-headline">{p.title}</p>
          <p className="text-callout text-label-secondary">
            {p.company}
            {p.salary ? ` · ${p.salary}` : ""}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-footnote text-label-tertiary">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {p.location || "Location not given"}
              {p.remote ? " · remote" : ""}
            </span>
            <span>
              Found {dayLabel(dayOf(p.foundAt, Intl.DateTimeFormat().resolvedOptions().timeZone), today).toLowerCase()}{" "}
              via{" "}
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {SOURCE_LABEL[p.source]}
                </a>
              ) : (
                SOURCE_LABEL[p.source]
              )}
            </span>
          </p>
        </div>
      </div>
      {p.why.length || p.gaps.length ? (
        <ul className="mt-2 flex flex-col gap-0.5 pl-[3.75rem] text-callout">
          {p.why.map((w) => (
            <li key={w} className="text-label">
              <span className="text-success-text">✓</span> {w}
            </li>
          ))}
          {p.gaps.map((g) => (
            <li key={g} className="text-label-secondary">
              <span className="text-warning-text">!</span> {g}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <p className="mt-2 max-h-72 overflow-y-auto rounded-lg bg-surface-sunken p-3 text-callout whitespace-pre-line">
          {p.description || "No description."}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1 pl-[3.75rem]">
        <Button
          onClick={async () => {
            const id = await actions.postingToLead(p, today);
            router.push(`/jobs/lead?id=${id}`);
          }}
        >
          Make a lead
        </Button>
        <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide details" : "Details"}
        </Button>
        {p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-control items-center gap-1.5 rounded-md px-3 text-body text-label-secondary hover:bg-fill"
          >
            <ExternalLink className="size-4" /> Posting
          </a>
        ) : null}
        <span className="ml-auto flex">
          {p.status === "new" ? (
            <Button
              variant="ghost"
              icon={<Bookmark className="size-4" />}
              onClick={() => void actions.setPostingStatus(p.id, "saved")}
              aria-label={`Save ${p.title} for later`}
            >
              <span className="max-sm:hidden">Save</span>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            icon={<X className="size-4" />}
            onClick={() => {
              void actions.setPostingStatus(p.id, "dismissed");
              toast({ message: "Dismissed" });
            }}
            aria-label={`Dismiss ${p.title}`}
          >
            <span className="max-sm:hidden">Dismiss</span>
          </Button>
        </span>
      </div>
    </li>
  );
}

/** Add one role by link, or by pasting its text (for sites that need a login, like LinkedIn). */
export function AddJobLink({
  onClose,
  initialUrl = "",
  initialText = "",
}: {
  onClose: () => void;
  initialUrl?: string;
  initialText?: string;
}) {
  const toast = useToast();
  const engine = useSync();
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [showText, setShowText] = useState(Boolean(initialText));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Add a job"
      description="Paste the link to the posting. If the site needs a login (LinkedIn, for example), paste the job's text instead."
      width={520}
    >
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = await fetch("/api/jobs/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url.trim() || undefined, text: text.trim() || undefined }),
          }).catch(() => null);
          const b = (await r?.json().catch(() => null)) as { id?: string; error?: string } | null;
          setBusy(false);
          if (!r?.ok) {
            setError(b?.error ?? "Couldn't add it right now.");
            if (r?.status === 422) setShowText(true);
            return;
          }
          await engine.sync().catch(() => {});
          toast({ message: "Added to your saved roles" });
          onClose();
        }}
      >
        <input
          aria-label="Job link"
          type="url"
          inputMode="url"
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          autoFocus
        />
        {showText ? (
          <textarea
            aria-label="Job text"
            className={cn(area, "min-h-40")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the job description"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowText(true)}
            className="w-fit text-footnote font-medium text-accent-text"
          >
            Paste the text instead
          </button>
        )}
        {error ? <p className="text-footnote text-danger-text">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!url.trim() && !text.trim()}>
            Add and rank
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
