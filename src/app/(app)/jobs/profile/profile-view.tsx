"use client";

import { Building2, FileText, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { area, BulletList, field, TagInput } from "@/components/jobs/inputs";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useCareerProfile, type CareerProfileDoc } from "@/features/data";
import {
  emptyProfile,
  MARKET_LABEL,
  newShortId,
  profileIds,
  profileReadiness,
  type CareerProfileFields,
  type JobMarket,
} from "@/features/jobs/model";
import { JOB_MARKETS } from "@/lib/sync/entities";
import { cn } from "@/lib/cn";

type Role = CareerProfileFields["experience"][number];

/** CAR-5: the career profile — the facts every tailored CV is built from, and what to look for. */
export function ProfileView() {
  const doc = useCareerProfile();
  if (doc === undefined) return null;
  return <ProfileEditor key={doc?.id ?? "new"} initial={doc ? strip(doc) : emptyProfile()} isNew={!doc} />;
}

function strip(doc: CareerProfileDoc): CareerProfileFields {
  const { id: _a, createdAt: _b, updatedAt: _c, deletedAt: _d, serverVersion: _e, ...rest } = doc;
  return rest;
}

function ProfileEditor({ initial, isNew }: { initial: CareerProfileFields; isNew: boolean }) {
  const actions = useActions();
  const toast = useToast();
  const [p, setP] = useState<CareerProfileFields>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasting, setPasting] = useState(isNew);
  const set = (patch: Partial<CareerProfileFields>) => {
    setP((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const id = (prefix: string) => newShortId(profileIds(p), prefix);
  const prefs = p.preferences;
  const setPrefs = (patch: Partial<CareerProfileFields["preferences"]>) => set({ preferences: { ...prefs, ...patch } });
  const readiness = profileReadiness(p);

  async function save() {
    setSaving(true);
    // Empty bullets and half-filled rows aren't saved.
    const clean: CareerProfileFields = {
      ...p,
      experience: p.experience
        .filter((e) => e.company.trim() && e.title.trim() && e.start)
        .map((e) => ({ ...e, bullets: e.bullets.filter((b) => b.text.trim()) })),
      projects: p.projects
        .filter((x) => x.name.trim())
        .map((x) => ({ ...x, bullets: x.bullets.filter((b) => b.text.trim()) })),
      education: p.education.filter((e) => e.school.trim()),
      certifications: p.certifications.filter((c) => c.name.trim()),
      contact: { ...p.contact, links: p.contact.links.filter((l) => l.url.trim()) },
    };
    try {
      await actions.saveCareerProfile(clean);
      setP(clean);
      setDirty(false);
      toast({ message: "Profile saved" });
    } catch {
      toast({ message: "Couldn't save: check the dates (each role needs a start month)" });
    } finally {
      setSaving(false);
    }
  }

  const role = (e: Role, i: number) => {
    const setRole = (patch: Partial<Role>) =>
      set({ experience: p.experience.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) });
    return (
      <li
        key={e.id}
        className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised"
        aria-label={`Role ${i + 1}`}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Job title">
            <input
              className={field}
              value={e.title}
              onChange={(x) => setRole({ title: x.target.value })}
              maxLength={200}
            />
          </Field>
          <Field label="Company">
            <input
              className={field}
              value={e.company}
              onChange={(x) => setRole({ company: x.target.value })}
              maxLength={200}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Location">
            <input
              className={field}
              value={e.location}
              onChange={(x) => setRole({ location: x.target.value })}
              maxLength={120}
            />
          </Field>
          <Field label="From">
            <input
              type="month"
              className={field}
              value={e.start}
              onChange={(x) => setRole({ start: x.target.value })}
            />
          </Field>
          <Field label="To">
            {e.end == null ? (
              <span className="flex h-control items-center gap-2 text-callout">
                Now
                <button
                  type="button"
                  onClick={() => setRole({ end: e.start })}
                  className="text-footnote font-medium text-accent-text"
                >
                  Set an end date
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <input
                  type="month"
                  className={field}
                  value={e.end}
                  onChange={(x) => setRole({ end: x.target.value || null })}
                />
                <button
                  type="button"
                  onClick={() => setRole({ end: null })}
                  className="shrink-0 text-footnote font-medium text-accent-text"
                >
                  Current
                </button>
              </span>
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-footnote font-medium text-label-secondary">
            What you did and achieved (one line each; numbers help)
          </span>
          <BulletList
            label={`Bullets for ${e.title || "this role"}`}
            bullets={e.bullets}
            onChange={(bullets) => setRole({ bullets })}
            newId={() => id("b")}
            placeholder="Add a line"
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            icon={<Trash2 className="size-4 text-danger-text" />}
            onClick={() => set({ experience: p.experience.filter((x) => x.id !== e.id) })}
          >
            <span className="text-danger-text">Remove role</span>
          </Button>
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Career profile"
        subtitle={
          <Link href="/jobs" className="hover:underline">
            Job search
          </Link>
        }
        actions={
          <Button icon={<Save className="size-4" />} onClick={() => void save()} loading={saving} disabled={!dirty}>
            Save
          </Button>
        }
      />
      <PageBody className="max-w-[760px]">
        <div className="mb-4 flex flex-col gap-2 rounded-xl bg-accent-fill p-4 text-callout">
          <p className="text-accent-text">
            Everything here is a fact Orbit can use. Tailored CVs only use what&rsquo;s in your profile, and anything
            they can&rsquo;t trace back to it is flagged for you to check.
          </p>
          {!readiness.ready ? (
            <p className="text-label-secondary">To start finding roles, add {readiness.missing.join(", ")}.</p>
          ) : null}
          <div>
            <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => setPasting(true)}>
              {isNew ? "Start from my CV" : "Fill in from a CV"}
            </Button>
          </div>
        </div>

        <SectionLabel>About you</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <input
              className={field}
              value={p.name}
              onChange={(e) => set({ name: e.target.value })}
              maxLength={120}
              autoComplete="name"
            />
          </Field>
          <Field label="Headline">
            <input
              className={field}
              value={p.headline}
              onChange={(e) => set({ headline: e.target.value })}
              maxLength={200}
              placeholder="e.g. Product designer, fintech"
            />
          </Field>
          <Field label="Email">
            <input
              className={field}
              type="email"
              value={p.contact.email}
              onChange={(e) => set({ contact: { ...p.contact, email: e.target.value } })}
              maxLength={200}
              autoComplete="email"
            />
          </Field>
          <Field label="Phone">
            <input
              className={field}
              type="tel"
              value={p.contact.phone}
              onChange={(e) => set({ contact: { ...p.contact, phone: e.target.value } })}
              maxLength={40}
              autoComplete="tel"
            />
          </Field>
          <Field label="Where you're based">
            <input
              className={field}
              value={p.contact.location}
              onChange={(e) => set({ contact: { ...p.contact, location: e.target.value } })}
              maxLength={120}
              placeholder="e.g. Lagos, Nigeria"
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-label-secondary">Links (portfolio, LinkedIn, GitHub)</span>
          <ul aria-label="Links" className="flex flex-col gap-2">
            {p.contact.links.map((l, i) => (
              <li key={i} className="flex gap-2">
                <input
                  aria-label={`Link ${i + 1} label`}
                  className={cn(field, "w-36 shrink-0")}
                  value={l.label}
                  placeholder="Portfolio"
                  maxLength={40}
                  onChange={(e) =>
                    set({
                      contact: {
                        ...p.contact,
                        links: p.contact.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      },
                    })
                  }
                />
                <input
                  aria-label={`Link ${i + 1}`}
                  className={field}
                  value={l.url}
                  placeholder="https://"
                  maxLength={500}
                  type="url"
                  onChange={(e) =>
                    set({
                      contact: {
                        ...p.contact,
                        links: p.contact.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                      },
                    })
                  }
                />
                <IconButton
                  label={`Remove link ${i + 1}`}
                  icon={<X className="size-4" />}
                  onClick={() => set({ contact: { ...p.contact, links: p.contact.links.filter((_, j) => j !== i) } })}
                />
              </li>
            ))}
          </ul>
          {p.contact.links.length < 8 ? (
            <button
              type="button"
              onClick={() => set({ contact: { ...p.contact, links: [...p.contact.links, { label: "", url: "" }] } })}
              className="flex h-8 w-fit items-center gap-1.5 rounded-md px-1 text-callout text-accent-text hover:bg-accent-fill"
            >
              <Plus className="size-4" /> Add a link
            </button>
          ) : null}
        </div>
        <div className="mt-3">
          <Field label="Summary (a few lines about you)">
            <textarea
              className={area}
              value={p.summary}
              onChange={(e) => set({ summary: e.target.value })}
              maxLength={3000}
            />
          </Field>
        </div>

        <SectionLabel count={p.experience.length}>Experience</SectionLabel>
        <ul className="flex flex-col gap-3">{p.experience.map(role)}</ul>
        <Button
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() =>
            set({
              experience: [
                ...p.experience,
                {
                  id: id("r"),
                  company: "",
                  title: "",
                  location: "",
                  start: new Date().toISOString().slice(0, 7),
                  end: null,
                  bullets: [],
                },
              ],
            })
          }
        >
          Add a role
        </Button>

        <SectionLabel count={p.projects.length}>Projects</SectionLabel>
        <ul className="flex flex-col gap-3">
          {p.projects.map((x, i) => (
            <li
              key={x.id}
              className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised"
              aria-label={`Project ${i + 1}`}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Project">
                  <input
                    className={field}
                    value={x.name}
                    maxLength={200}
                    onChange={(e) =>
                      set({ projects: p.projects.map((y) => (y.id === x.id ? { ...y, name: e.target.value } : y)) })
                    }
                  />
                </Field>
                <Field label="Link">
                  <input
                    className={field}
                    value={x.url}
                    type="url"
                    maxLength={500}
                    onChange={(e) =>
                      set({ projects: p.projects.map((y) => (y.id === x.id ? { ...y, url: e.target.value } : y)) })
                    }
                  />
                </Field>
              </div>
              <BulletList
                label={`Bullets for ${x.name || "this project"}`}
                bullets={x.bullets}
                newId={() => id("b")}
                placeholder="Add a line"
                onChange={(bullets) =>
                  set({ projects: p.projects.map((y) => (y.id === x.id ? { ...y, bullets } : y)) })
                }
              />
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  icon={<Trash2 className="size-4 text-danger-text" />}
                  onClick={() => set({ projects: p.projects.filter((y) => y.id !== x.id) })}
                >
                  <span className="text-danger-text">Remove project</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() => set({ projects: [...p.projects, { id: id("p"), name: "", url: "", bullets: [] }] })}
        >
          Add a project
        </Button>

        <SectionLabel count={p.education.length}>Education</SectionLabel>
        <ul className="flex flex-col gap-2">
          {p.education.map((e, i) => (
            <li
              key={e.id}
              className="grid gap-2 rounded-xl bg-surface p-3 shadow-1 sm:grid-cols-[1fr_1fr_8rem_8rem_auto] dark:bg-surface-raised"
            >
              <input
                aria-label={`School ${i + 1}`}
                placeholder="School"
                className={field}
                value={e.school}
                maxLength={200}
                onChange={(x) =>
                  set({ education: p.education.map((y) => (y.id === e.id ? { ...y, school: x.target.value } : y)) })
                }
              />
              <input
                aria-label={`Degree ${i + 1}`}
                placeholder="Degree"
                className={field}
                value={e.degree}
                maxLength={200}
                onChange={(x) =>
                  set({ education: p.education.map((y) => (y.id === e.id ? { ...y, degree: x.target.value } : y)) })
                }
              />
              <input
                aria-label={`Education ${i + 1} from`}
                type="month"
                className={field}
                value={e.start ?? ""}
                onChange={(x) =>
                  set({
                    education: p.education.map((y) => (y.id === e.id ? { ...y, start: x.target.value || null } : y)),
                  })
                }
              />
              <input
                aria-label={`Education ${i + 1} to`}
                type="month"
                className={field}
                value={e.end ?? ""}
                onChange={(x) =>
                  set({
                    education: p.education.map((y) => (y.id === e.id ? { ...y, end: x.target.value || null } : y)),
                  })
                }
              />
              <IconButton
                label={`Remove education ${i + 1}`}
                icon={<X className="size-4" />}
                onClick={() => set({ education: p.education.filter((y) => y.id !== e.id) })}
              />
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() =>
            set({
              education: [...p.education, { id: id("e"), school: "", degree: "", start: null, end: null, notes: "" }],
            })
          }
        >
          Add education
        </Button>

        <SectionLabel count={p.certifications.length}>Certifications</SectionLabel>
        <ul className="flex flex-col gap-2">
          {p.certifications.map((c, i) => (
            <li
              key={c.id}
              className="grid gap-2 rounded-xl bg-surface p-3 shadow-1 sm:grid-cols-[1fr_1fr_6rem_auto] dark:bg-surface-raised"
            >
              <input
                aria-label={`Certification ${i + 1}`}
                placeholder="Certification"
                className={field}
                value={c.name}
                maxLength={200}
                onChange={(x) =>
                  set({
                    certifications: p.certifications.map((y) => (y.id === c.id ? { ...y, name: x.target.value } : y)),
                  })
                }
              />
              <input
                aria-label={`Issuer ${i + 1}`}
                placeholder="Issued by"
                className={field}
                value={c.issuer}
                maxLength={200}
                onChange={(x) =>
                  set({
                    certifications: p.certifications.map((y) => (y.id === c.id ? { ...y, issuer: x.target.value } : y)),
                  })
                }
              />
              <input
                aria-label={`Year ${i + 1}`}
                placeholder="Year"
                inputMode="numeric"
                className={field}
                value={c.year ?? ""}
                onChange={(x) => {
                  const n = Number(x.target.value);
                  set({
                    certifications: p.certifications.map((y) =>
                      y.id === c.id ? { ...y, year: x.target.value && n >= 1950 && n <= 2100 ? n : null } : y,
                    ),
                  });
                }}
              />
              <IconButton
                label={`Remove certification ${i + 1}`}
                icon={<X className="size-4" />}
                onClick={() => set({ certifications: p.certifications.filter((y) => y.id !== c.id) })}
              />
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() =>
            set({ certifications: [...p.certifications, { id: id("c"), name: "", issuer: "", year: null }] })
          }
        >
          Add a certification
        </Button>

        <SectionLabel>Skills</SectionLabel>
        <TagInput
          label="Skills and tools"
          values={p.skills}
          onChange={(skills) => set({ skills })}
          placeholder="e.g. Figma, user research, SQL"
        />

        <SectionLabel>What you&rsquo;re looking for</SectionLabel>
        <div className="flex flex-col gap-4">
          <TagInput
            label="Roles"
            values={prefs.roles}
            onChange={(roles) => setPrefs({ roles })}
            max={10}
            placeholder="e.g. Product designer, UX designer"
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">Markets</span>
            <div role="group" aria-label="Markets" className="flex flex-wrap gap-1.5">
              {JOB_MARKETS.map((m: JobMarket) => {
                const on = prefs.markets.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPrefs({ markets: on ? prefs.markets.filter((x) => x !== m) : [...prefs.markets, m] })
                    }
                    className={cn(
                      "h-8 rounded-full px-3 text-footnote font-medium",
                      on ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
                    )}
                  >
                    {MARKET_LABEL[m]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">Where you&rsquo;ll work</span>
            <Segmented
              label="Workplace"
              value={prefs.workplace}
              onChange={(workplace) => setPrefs({ workplace })}
              options={[
                { value: "remote", label: "Remote only" },
                { value: "remote_or_hybrid", label: "Remote or hybrid" },
                { value: "any", label: "Any" },
              ]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Minimum salary a year (optional)">
              <input
                className={field}
                inputMode="numeric"
                value={prefs.salaryMin ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, ""));
                  setPrefs({ salaryMin: e.target.value && Number.isFinite(n) ? n : null });
                }}
              />
            </Field>
            <Field label="Currency">
              <input
                className={field}
                value={prefs.currency}
                maxLength={8}
                onChange={(e) => setPrefs({ currency: e.target.value.toUpperCase() })}
              />
            </Field>
          </div>
          <TagInput
            label="Skip roles that mention"
            values={prefs.avoid}
            onChange={(avoid) => setPrefs({ avoid })}
            max={30}
            placeholder="e.g. crypto, unpaid, a company name"
          />
        </div>

        <SectionLabel count={p.companies.length}>Companies to watch</SectionLabel>
        <Companies companies={p.companies} onChange={(companies) => set({ companies })} />

        <div className="sticky bottom-[calc(var(--tabbar-space)+0.5rem)] mt-8 flex justify-end lg:bottom-4">
          {dirty ? (
            <Button
              icon={<Save className="size-4" />}
              onClick={() => void save()}
              loading={saving}
              className="shadow-2"
            >
              Save profile
            </Button>
          ) : null}
        </div>
      </PageBody>
      {pasting ? (
        <PasteCv
          onClose={() => setPasting(false)}
          onDraft={(d) => {
            // The CV fills in the facts; what you're looking for and the companies stay as they are.
            setP((x) => ({ ...d, preferences: x.preferences, companies: x.companies }));
            setDirty(true);
            setPasting(false);
            toast({ message: "Filled in from your CV. Check it, then save." });
          }}
        />
      ) : null}
    </>
  );
}

function PasteCv({ onClose, onDraft }: { onClose: () => void; onDraft: (d: CareerProfileFields) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Start from your CV"
      description="Paste the text of your CV (open it, select all, copy). Orbit copies your roles, bullets and dates as written; you check everything before saving."
      width={560}
    >
      <div className="mt-4 flex flex-col gap-3">
        <textarea
          aria-label="Your CV"
          autoFocus
          className={cn(area, "min-h-64")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your CV here"
        />
        {error ? <p className="text-footnote text-danger-text">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            icon={<Sparkles className="size-4" />}
            loading={busy}
            disabled={text.trim().length < 40}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await fetch("/api/jobs/profile-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
              }).catch(() => null);
              const b = (await r?.json().catch(() => null)) as { draft?: CareerProfileFields; error?: string } | null;
              setBusy(false);
              if (!r?.ok || !b?.draft)
                return setError(b?.error ?? "Couldn't read that. Check your connection and try again.");
              onDraft(b.draft);
            }}
          >
            Fill in my profile
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Companies({
  companies,
  onChange,
}: {
  companies: CareerProfileFields["companies"];
  onChange: (c: CareerProfileFields["companies"]) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-callout text-label-secondary">
        Orbit checks these companies&rsquo; job boards every day, wherever they hire. Type a name, or paste their
        careers page or one of their job links (Greenhouse, Lever and Ashby boards).
      </p>
      {companies.length ? (
        <ul aria-label="Companies" className="flex flex-col">
          {companies.map((c) => (
            <li
              key={`${c.board}:${c.slug}`}
              className="flex min-h-row items-center gap-3 rounded-md px-2 hover:bg-fill"
            >
              <Building2 className="size-4 text-label-secondary" />
              <span className="min-w-0 flex-1 truncate text-body">{c.name}</span>
              <span className="text-footnote text-label-tertiary">{c.board}</span>
              <IconButton
                label={`Stop watching ${c.name}`}
                icon={<X className="size-4" />}
                onClick={() => onChange(companies.filter((x) => x !== c))}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!input.trim()) return;
          setBusy(true);
          setError(null);
          const r = await fetch("/api/jobs/board", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input }),
          }).catch(() => null);
          const b = (await r?.json().catch(() => null)) as {
            company?: CareerProfileFields["companies"][number];
            error?: string;
          } | null;
          setBusy(false);
          if (!r?.ok || !b?.company) return setError(b?.error ?? "Couldn't check that right now.");
          if (!companies.some((c) => c.board === b.company!.board && c.slug === b.company!.slug))
            onChange([...companies, b.company]);
          setInput("");
        }}
      >
        <input
          aria-label="Company or careers link"
          className={field}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Paystack, or https://jobs.lever.co/…"
          maxLength={500}
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={!input.trim()}>
          Watch
        </Button>
      </form>
      {error ? <p className="px-1 text-footnote text-danger-text">{error}</p> : null}
    </div>
  );
}
