"use client";

import {
  AlertTriangle,
  Briefcase,
  Check,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { useSync } from "@/components/app/sync-provider";
import { JobLeadDialog } from "@/components/career/forms";
import { area, TagInput } from "@/components/jobs/inputs";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { JOB_STAGE_LABEL, type JobLead } from "@/features/career/model";
import { useCareerProfile, useJobLeads, useJobPostings } from "@/features/data";
import { monthLabel, profileReadiness, type ApplicationPack, type CareerProfileFields } from "@/features/jobs/model";
import { buildCvPdf, cvFileName } from "@/features/jobs/pdf";
import { useToday } from "@/features/use-today";
import { addDays, dayLabel } from "@/lib/dates";
import { cn } from "@/lib/cn";

/** CAR-5: one lead — the posting, the tailored application pack, and applying. */
export function LeadView() {
  const id = useSearchParams().get("id");
  const leads = useJobLeads();
  if (leads === undefined) return null;
  const lead = leads.find((l) => l.id === id);
  if (!lead)
    return <EmptyState icon={Briefcase} title="Lead not found" body="It may have been deleted on another device." />;
  return <LeadPage key={lead.id} lead={lead} />;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      icon={done ? <Check className="size-4" /> : <Copy className="size-4" />}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      aria-label={label}
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

function LeadPage({ lead }: { lead: JobLead }) {
  const actions = useActions();
  const toast = useToast();
  const engine = useSync();
  const today = useToday();
  const profileDoc = useCareerProfile();
  const posting = (useJobPostings() ?? []).find((p) => p.id === lead.postingId);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redo, setRedo] = useState(false);
  const [showPosting, setShowPosting] = useState(!lead.pack);
  const pack = lead.pack ?? null;
  const description = posting?.description || lead.notes;
  const ready = profileReadiness(profileDoc ?? null);
  const canTailor = Boolean(profileDoc?.experience.some((e) => e.bullets.length)) && description.trim().length >= 80;
  const url = lead.url || posting?.url || null;

  async function prepare() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/jobs/tailor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id }),
    }).catch(() => null);
    const b = (await r?.json().catch(() => null)) as { error?: string } | null;
    // The pack is saved on the lead by the server: bring it down now.
    if (r?.ok) await engine.sync().catch(() => {});
    setBusy(false);
    if (!r?.ok) return setError(b?.error ?? "Couldn't prepare it. Check your connection and try again.");
    setShowPosting(false);
    toast({ message: "Application pack ready. Check the flags, then apply." });
  }

  const savePack = (patch: Partial<ApplicationPack>) =>
    pack ? actions.updateJobLead(lead.id, { pack: { ...pack, ...patch } }) : Promise.resolve();

  async function applied() {
    await actions.moveJobLead(lead, "applied");
    await actions.updateJobLead(lead.id, { nextStep: "Follow up if no reply", nextDate: addDays(today, 7) });
    toast({ message: "Moved to Applied. Follow-up set for a week from today." });
  }

  return (
    <>
      <PageHeader
        title={lead.role || lead.company}
        subtitle={
          <Link href="/jobs" className="hover:underline">
            {lead.company} · {JOB_STAGE_LABEL[lead.stage]}
          </Link>
        }
        actions={<IconButton label="Edit lead" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} />}
      />
      <PageBody className="max-w-[760px]">
        <section
          aria-label="Lead"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 shadow-1 dark:bg-surface-raised"
        >
          <span className="min-w-0 flex-1 text-callout">
            {lead.stage !== "closed" && lead.nextStep ? (
              <>
                <span className="text-label-secondary">Next: </span>
                {lead.nextStep}
                {lead.nextDate ? (
                  <span className="text-label-secondary"> · {dayLabel(lead.nextDate, today)}</span>
                ) : null}
              </>
            ) : (
              <span className="text-label-secondary">
                {[lead.location, lead.salary].filter(Boolean).join(" · ") || "No next step"}
              </span>
            )}
          </span>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-control items-center gap-1.5 rounded-md bg-fill px-3 text-body font-medium hover:bg-fill-strong"
            >
              <ExternalLink className="size-4" /> Open the application
            </a>
          ) : null}
          {lead.stage === "researching" ? (
            <Button icon={<Send className="size-4" />} onClick={() => void applied()}>
              I&rsquo;ve applied
            </Button>
          ) : null}
        </section>

        <SectionLabel>The job</SectionLabel>
        {posting?.why.length || posting?.gaps.length ? (
          <ul className="mb-2 flex flex-col gap-0.5 px-1 text-callout">
            {posting.why.map((w) => (
              <li key={w}>
                <span className="text-success-text">✓</span> {w}
              </li>
            ))}
            {posting.gaps.map((g) => (
              <li key={g} className="text-label-secondary">
                <span className="text-warning-text">!</span> {g}
              </li>
            ))}
          </ul>
        ) : null}
        {description ? (
          <>
            <button
              type="button"
              onClick={() => setShowPosting((v) => !v)}
              className="px-1 text-footnote font-medium text-accent-text"
              aria-expanded={showPosting}
            >
              {showPosting ? "Hide the description" : "Show the description"}
            </button>
            {showPosting ? (
              <p className="mt-2 max-h-96 overflow-y-auto rounded-lg bg-surface-sunken p-3 text-callout whitespace-pre-line">
                {description}
              </p>
            ) : null}
          </>
        ) : (
          <p className="px-1 text-callout text-label-secondary">
            No description yet. Paste the job&rsquo;s text into the lead&rsquo;s notes (Edit) so Orbit can tailor for
            it.
          </p>
        )}

        <SectionLabel>Application pack</SectionLabel>
        {!pack ? (
          <div className="flex flex-col gap-3 rounded-xl bg-accent-fill p-4">
            <p className="text-callout text-accent-text">
              Orbit writes a CV tailored to this job from your profile, a cover letter, answers to the usual questions
              and a short note to a recruiter. It only uses facts from your profile and flags anything you should check.
              You review everything and apply yourself.
            </p>
            {!profileDoc || !ready.ready ? (
              <p className="text-callout text-label-secondary">
                First,{" "}
                <Link href="/jobs/profile" className="font-semibold text-accent-text">
                  finish your career profile
                </Link>
                {ready.missing.length ? ` (${ready.missing.join(", ")})` : ""}.
              </p>
            ) : null}
            {error ? <p className="text-footnote text-danger-text">{error}</p> : null}
            <div>
              <Button
                icon={<Sparkles className="size-4" />}
                loading={busy}
                disabled={!canTailor}
                onClick={() => void prepare()}
              >
                {busy ? "Writing… about a minute" : "Prepare application"}
              </Button>
            </div>
          </div>
        ) : (
          <PackView
            key={pack.generatedAt}
            pack={pack}
            profile={profileDoc ?? null}
            company={lead.company}
            onSave={savePack}
            onRedo={() => setRedo(true)}
            busy={busy}
            error={error}
          />
        )}
      </PageBody>
      {editing ? <JobLeadDialog key={lead.id} open onOpenChange={(o) => !o && setEditing(false)} lead={lead} /> : null}
      <ConfirmDialog
        open={redo}
        onOpenChange={setRedo}
        title="Write a new pack?"
        description="The CV, letter, answers and note are written again from your profile and the job; your edits to this pack are replaced."
        confirmLabel="Write a new pack"
        onConfirm={() => void prepare()}
      />
    </>
  );
}

type Tab = "cv" | "letter" | "answers" | "note";

function PackView({
  pack,
  profile,
  company,
  onSave,
  onRedo,
  busy,
  error,
}: {
  pack: ApplicationPack;
  profile: CareerProfileFields | null;
  company: string;
  onSave: (patch: Partial<ApplicationPack>) => Promise<void>;
  onRedo: () => void;
  busy: boolean;
  error: string | null;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("cv");
  const [downloading, setDownloading] = useState(false);
  const factFlags = pack.flags.filter((f) => !f.startsWith("To be ready for:"));
  const prep = pack.flags
    .filter((f) => f.startsWith("To be ready for:"))
    .map((f) => f.replace(/^To be ready for:\s*/, ""));

  async function download() {
    if (!profile) return;
    setDownloading(true);
    try {
      const bytes = await buildCvPdf(profile, pack.cv);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = cvFileName(profile.name, company);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      toast({ message: "Couldn't make the PDF" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {factFlags.length ? (
        <section aria-label="Check before sending" className="rounded-xl border border-warning/40 bg-warning/10 p-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-footnote font-semibold text-warning-text">
            <AlertTriangle className="size-4" /> Check before sending
          </h3>
          <ul className="flex flex-col gap-1 text-callout">
            {factFlags.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="min-w-0 flex-1">{f}</span>
                <button
                  type="button"
                  aria-label={`Mark checked: ${f}`}
                  onClick={() => void onSave({ flags: pack.flags.filter((x) => x !== f) })}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-label-tertiary hover:bg-fill"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="flex items-center gap-1.5 px-1 text-footnote text-success-text">
          <Check className="size-4" /> Every line traces back to your profile.
        </p>
      )}
      {prep.length ? (
        <section aria-label="Be ready to talk about" className="rounded-xl bg-surface-sunken p-3">
          <h3 className="mb-1 text-footnote font-semibold text-label-secondary">Be ready to talk about</h3>
          <ul className="list-disc pl-5 text-callout">
            {prep.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Pack"
          value={tab}
          onChange={setTab}
          options={[
            { value: "cv", label: "CV" },
            { value: "letter", label: "Letter" },
            { value: "answers", label: "Answers" },
            { value: "note", label: "Note" },
          ]}
        />
        <span className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            aria-label="Write the pack again"
            icon={<RotateCcw className="size-4" />}
            onClick={onRedo}
            loading={busy}
          >
            <span className="max-sm:hidden">Write again</span>
          </Button>
        </span>
      </div>
      {error ? <p className="text-footnote text-danger-text">{error}</p> : null}

      {tab === "cv" ? (
        <CvEditor
          pack={pack}
          profile={profile}
          onSave={onSave}
          onDownload={() => void download()}
          downloading={downloading}
        />
      ) : tab === "letter" ? (
        <TextBlock label="Cover letter" value={pack.coverLetter} onSave={(coverLetter) => onSave({ coverLetter })} />
      ) : tab === "answers" ? (
        <div className="flex flex-col gap-4">
          {pack.answers.map((a, i) => (
            <TextBlock
              key={a.question}
              label={a.question}
              value={a.answer}
              onSave={(answer) => onSave({ answers: pack.answers.map((x, j) => (j === i ? { ...x, answer } : x)) })}
            />
          ))}
        </div>
      ) : (
        <TextBlock
          label="Note to a recruiter or hiring manager"
          value={pack.outreach}
          onSave={(outreach) => onSave({ outreach })}
        />
      )}
      <p className="px-1 text-caption text-label-tertiary">
        Written {new Date(pack.generatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} by{" "}
        {pack.model}. Orbit never sends anything: you review it and apply yourself.
      </p>
    </div>
  );
}

function TextBlock({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => Promise<void> }) {
  const [text, setText] = useState(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-footnote font-medium text-label-secondary">{label}</span>
        <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <textarea
        aria-label={label}
        className={cn(area, "min-h-40 leading-relaxed")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && void onSave(text)}
      />
    </div>
  );
}

function CvEditor({
  pack,
  profile,
  onSave,
  onDownload,
  downloading,
}: {
  pack: ApplicationPack;
  profile: CareerProfileFields | null;
  onSave: (patch: Partial<ApplicationPack>) => Promise<void>;
  onDownload: () => void;
  downloading: boolean;
}) {
  const cv = pack.cv;
  const setCv = (patch: Partial<ApplicationPack["cv"]>) => onSave({ cv: { ...cv, ...patch } });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button icon={<Download className="size-4" />} onClick={onDownload} loading={downloading} disabled={!profile}>
          Download CV (PDF)
        </Button>
      </div>
      <article
        aria-label="Tailored CV"
        className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-1 dark:bg-surface-raised"
      >
        <header>
          <p className="text-title3">{profile?.name || "Your name"}</p>
          <Editable
            label="Headline"
            value={cv.headline}
            onSave={(headline) => setCv({ headline })}
            className="text-callout text-label-secondary"
          />
        </header>
        <Editable
          label="Summary"
          value={cv.summary}
          onSave={(summary) => setCv({ summary })}
          multiline
          className="text-callout"
        />
        {cv.experience.map((r, i) => (
          <section key={r.roleId} aria-label={`${r.title} at ${r.company}`}>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-callout font-semibold">
              <span>
                {r.title} · {r.company}
              </span>
              <span className="text-footnote font-normal text-label-secondary">
                {monthLabel(r.start)} – {monthLabel(r.end)}
              </span>
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {r.bullets.map((b, j) => (
                <li key={j} className="flex items-start gap-2 text-callout">
                  <span className="pt-0.5 text-label-tertiary">•</span>
                  <Editable
                    label={`Bullet ${j + 1} at ${r.company}`}
                    value={b.text}
                    multiline
                    className="flex-1"
                    onSave={(text) =>
                      setCv({
                        experience: cv.experience.map((x, k) =>
                          k === i ? { ...x, bullets: x.bullets.map((y, m) => (m === j ? { ...y, text } : y)) } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove bullet ${j + 1} at ${r.company}`}
                    onClick={() =>
                      void setCv({
                        experience: cv.experience.map((x, k) =>
                          k === i ? { ...x, bullets: x.bullets.filter((_, m) => m !== j) } : x,
                        ),
                      })
                    }
                    className="grid size-6 shrink-0 place-items-center rounded-full text-label-tertiary hover:bg-fill"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <TagInput label="Skills on this CV" values={cv.skills} onChange={(skills) => void setCv({ skills })} max={30} />
      </article>
    </div>
  );
}

/** Text that turns into a field when you tap it, saved when you leave it. */
function Editable({
  label,
  value,
  onSave,
  multiline,
  className,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const save = () => text.trim() !== value && void onSave(text.trim());
  return multiline ? (
    <textarea
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      rows={1}
      className={cn(
        "field-sizing-content w-full resize-none rounded-md bg-transparent px-1 outline-none hover:bg-fill focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    />
  ) : (
    <input
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      className={cn(
        "w-full rounded-md bg-transparent px-1 outline-none hover:bg-fill focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    />
  );
}
