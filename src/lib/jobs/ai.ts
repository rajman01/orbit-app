import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Db } from "mongodb";
import { z } from "zod";
import {
  emptyProfile,
  newShortId,
  profileText,
  titleMatches,
  trimText,
  type CareerProfileFields,
  type JobPostingFields,
} from "@/features/jobs/model";
import { entitySchemas } from "@/lib/sync/entities";
import { coachModels, recordUsage } from "@/lib/coach/server";
import type { FoundPosting } from "./sources";

/**
 * Phase 3D: the job assistant's model calls — ranking found roles (light model), turning a pasted
 * CV into a profile and reading a posting from a page (writing model). Structured outputs; every
 * result is checked again here. With COACH_FAKE=1 (tests) nothing leaves the machine.
 */

let client: Anthropic | undefined;
const fake = () => process.env.COACH_FAKE === "1";

/** Writing-model calls: a refusal is retried on a suitable model inside the same call. */
async function parseWithWriter<T extends z.ZodType>(
  db: Db,
  userId: string,
  schema: T,
  system: string,
  user: string,
  effort: "low" | "medium",
) {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: coachModels().chat,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  await recordUsage(db, userId, response.usage, "chat").catch(() => {});
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return response.parsed_output as z.infer<T>;
}

// ---------------------------------------------------------------- ranking

const rankSchema = z.object({
  ranked: z.array(
    z.object({
      n: z.number(),
      fit: z.number(),
      why: z.array(z.string()),
      gaps: z.array(z.string()),
    }),
  ),
});

const RANK_SYSTEM = `You rank job postings for one person against their career profile and preferences.
For each numbered posting give:
- fit: 0–100. 85+ only when their experience clearly covers the role's core requirements at the right level; 70–84 a good match with small gaps; 55–69 partial; below 55 a stretch or wrong level. Be honest; most postings aren't strong fits.
- why: up to 3 short reasons it fits, naming their actual experience (e.g. "5 years in fintech product design at Paystack"). Never invent experience.
- gaps: up to 3 short gaps or risks (missing requirement, seniority, location or visa limits, salary below their minimum).
Return one entry per posting, using its number.`;

export interface Ranked {
  fit: number;
  why: string[];
  gaps: string[];
}

export function profileBrief(p: CareerProfileFields): string {
  const prefs = p.preferences;
  return trimText(
    [
      `Headline: ${p.headline}`,
      `Summary: ${p.summary}`,
      `Experience:\n${p.experience
        .map(
          (e) =>
            `- ${e.title}, ${e.company} (${e.start} – ${e.end ?? "now"}): ${e.bullets.map((b) => b.text).join(" ")}`,
        )
        .join("\n")}`,
      p.projects.length ? `Projects: ${p.projects.map((x) => x.name).join(", ")}` : "",
      `Skills: ${p.skills.join(", ")}`,
      `Education: ${p.education.map((e) => `${e.degree} ${e.school}`).join("; ")}`,
      `Looking for: ${prefs.roles.join(", ")}; workplace: ${prefs.workplace}; markets: ${prefs.markets.join(", ")}${
        prefs.salaryMin ? `; minimum salary ${prefs.salaryMin} ${prefs.currency}` : ""
      }`,
      `Based in: ${p.contact.location}`,
    ]
      .filter(Boolean)
      .join("\n"),
    12000,
  );
}

/** Ranks up to 30 postings in one light-model call. Returns one result per posting (or null). */
export async function rankPostings(
  db: Db,
  userId: string,
  profile: CareerProfileFields,
  postings: FoundPosting[],
): Promise<(Ranked | null)[]> {
  if (!postings.length) return [];
  if (fake()) return postings.map((p) => fakeRank(profile, p));
  client ??= new Anthropic();
  const list = postings
    .map(
      (p, i) =>
        `#${i + 1} ${p.title} at ${p.company} — ${p.location}${p.remote ? " (remote)" : ""}${p.salary ? ` — ${p.salary}` : ""}\n${trimText(p.description, 1800)}`,
    )
    .join("\n\n---\n\n");
  const response = await client.messages.parse({
    model: coachModels().light,
    max_tokens: 8000,
    output_config: {
      effort: "low",
      format: zodOutputFormat(rankSchema),
    },
    // The profile is the same for every posting in the run: cached.
    system: [
      { type: "text", text: RANK_SYSTEM },
      { type: "text", text: `Their profile:\n${profileBrief(profile)}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `Postings:\n\n${list}` }],
  });
  await recordUsage(db, userId, response.usage, "light").catch(() => {});
  const out: (Ranked | null)[] = postings.map(() => null);
  if (response.stop_reason === "refusal" || !response.parsed_output) return out;
  for (const r of response.parsed_output.ranked) {
    const i = Math.round(r.n) - 1;
    if (i < 0 || i >= postings.length) continue;
    out[i] = {
      fit: Math.max(0, Math.min(100, Math.round(r.fit))),
      why: r.why
        .map((x) => x.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 3),
      gaps: r.gaps
        .map((x) => x.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 3),
    };
  }
  return out;
}

/** Tests: a fit from how many of the profile's skills the posting mentions. */
function fakeRank(profile: CareerProfileFields, p: FoundPosting): Ranked {
  const text = `${p.title} ${p.description}`.toLowerCase();
  const hits = profile.skills.filter((s) => text.includes(s.toLowerCase()));
  const fit = Math.min(95, 50 + hits.length * 10 + (titleMatches(p.title, profile.preferences.roles) ? 10 : 0));
  return {
    fit,
    why: hits.length ? [`Mentions ${hits.slice(0, 3).join(", ")}`] : ["Matches the role you're looking for"],
    gaps: hits.length ? [] : ["Few of your skills are mentioned"],
  };
}

// ---------------------------------------------------------------- a pasted CV → a draft profile

const nullableString = z.string().nullable();
const profileDraftSchema = z.object({
  name: z.string(),
  headline: z.string(),
  email: nullableString,
  phone: nullableString,
  location: nullableString,
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  summary: z.string(),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string(),
      start: z.string().describe("YYYY-MM; YYYY-01 if only the year is known"),
      end: nullableString.describe("YYYY-MM, or null for a current role"),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(z.object({ name: z.string(), url: z.string(), bullets: z.array(z.string()) })),
  education: z.array(
    z.object({ school: z.string(), degree: z.string(), start: nullableString, end: nullableString, notes: z.string() }),
  ),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string(), year: z.number().nullable() })),
  skills: z.array(z.string()),
});

const PROFILE_SYSTEM = `You turn the text of someone's CV into a structured career profile.
Copy facts exactly as written: employers, titles, dates, numbers, tools. Do not add, improve or infer anything that isn't in the text; leave a field empty (or null) when it isn't there.
Each bullet is one achievement or responsibility, close to the original wording. Dates as YYYY-MM.`;

const monthOrNull = (m: string | null | undefined) => {
  if (!m) return null;
  const x = m.trim().match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (!x) return null;
  const mo = Math.min(12, Math.max(1, Number(x[2] ?? 1)));
  return `${x[1]}-${String(mo).padStart(2, "0")}`;
};

/** A draft profile from a pasted CV, for the user to check before saving. */
export async function draftProfileFromCv(db: Db, userId: string, cvText: string): Promise<CareerProfileFields | null> {
  const text = trimText(cvText, 30000);
  const d = fake()
    ? fakeDraft(text)
    : await parseWithWriter(db, userId, profileDraftSchema, PROFILE_SYSTEM, `CV:\n\n${text}`, "low");
  if (!d) return null;
  const used: string[] = [];
  const id = (prefix: string) => {
    const x = newShortId(used, prefix);
    used.push(x);
    return x;
  };
  const p = emptyProfile();
  const draft: CareerProfileFields = {
    ...p,
    name: d.name.trim().slice(0, 120),
    headline: d.headline.trim().slice(0, 200),
    contact: {
      email: (d.email ?? "").trim().slice(0, 200),
      phone: (d.phone ?? "").trim().slice(0, 40),
      location: (d.location ?? "").trim().slice(0, 120),
      links: d.links.slice(0, 8).map((l) => ({ label: l.label.trim().slice(0, 40), url: l.url.trim().slice(0, 500) })),
    },
    summary: d.summary.trim().slice(0, 3000),
    experience: d.experience.slice(0, 30).flatMap((e) => {
      const start = monthOrNull(e.start);
      if (!e.company.trim() || !e.title.trim() || !start) return [];
      return [
        {
          id: id("r"),
          company: e.company.trim().slice(0, 200),
          title: e.title.trim().slice(0, 200),
          location: e.location.trim().slice(0, 120),
          start,
          end: monthOrNull(e.end),
          bullets: e.bullets
            .map((b) => b.trim())
            .filter(Boolean)
            .slice(0, 20)
            .map((b) => ({ id: id("b"), text: b.slice(0, 500) })),
        },
      ];
    }),
    projects: d.projects.slice(0, 20).flatMap((x) =>
      x.name.trim()
        ? [
            {
              id: id("p"),
              name: x.name.trim().slice(0, 200),
              url: x.url.trim().slice(0, 500),
              bullets: x.bullets
                .filter((b) => b.trim())
                .slice(0, 10)
                .map((b) => ({ id: id("b"), text: b.trim().slice(0, 500) })),
            },
          ]
        : [],
    ),
    education: d.education.slice(0, 10).flatMap((e) =>
      e.school.trim()
        ? [
            {
              id: id("e"),
              school: e.school.trim().slice(0, 200),
              degree: e.degree.trim().slice(0, 200),
              start: monthOrNull(e.start),
              end: monthOrNull(e.end),
              notes: e.notes.trim().slice(0, 500),
            },
          ]
        : [],
    ),
    certifications: d.certifications.slice(0, 20).flatMap((c) =>
      c.name.trim()
        ? [
            {
              id: id("c"),
              name: c.name.trim().slice(0, 200),
              issuer: c.issuer.trim().slice(0, 200),
              year: c.year && c.year >= 1950 && c.year <= 2100 ? Math.round(c.year) : null,
            },
          ]
        : [],
    ),
    skills: [...new Set(d.skills.map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 60),
  };
  const ok = entitySchemas.careerProfile.safeParse(draft);
  return ok.success ? ok.data : null;
}

/** Tests: lines "Title at Company (2020-01 – 2023-06)" start roles; "- " lines are bullets. */
function fakeDraft(text: string): z.infer<typeof profileDraftSchema> {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const experience: z.infer<typeof profileDraftSchema>["experience"] = [];
  for (const l of lines) {
    const role = l.match(/^(.+?) at (.+?) \((\d{4}-\d{2}) – (\d{4}-\d{2}|now)\)$/);
    if (role)
      experience.push({
        title: role[1],
        company: role[2],
        location: "",
        start: role[3],
        end: role[4] === "now" ? null : role[4],
        bullets: [],
      });
    else if (l.startsWith("- ") && experience.length) experience.at(-1)!.bullets.push(l.slice(2));
  }
  const skills =
    lines
      .find((l) => l.toLowerCase().startsWith("skills:"))
      ?.slice(7)
      .split(",")
      .map((s) => s.trim()) ?? [];
  return {
    name: lines[0] ?? "",
    headline: lines[1] ?? "",
    email: null,
    phone: null,
    location: null,
    links: [],
    summary: "",
    experience,
    projects: [],
    education: [],
    certifications: [],
    skills,
  };
}

// ---------------------------------------------------------------- a page → a posting

const postingSchema = z.object({
  isJobPosting: z.boolean(),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  remote: z.boolean(),
  salary: z.string(),
  description: z
    .string()
    .describe("The posting's full text: role, responsibilities, requirements, benefits. Plain text."),
});

const POSTING_SYSTEM = `You read the text of a web page (or text someone pasted) and pull out the job posting in it.
Copy the details as written; don't invent a salary or location. If the text isn't a job posting (a login wall, a list of many jobs, an error page), set isJobPosting to false.`;

export async function readPosting(
  db: Db,
  userId: string,
  pageText: string,
  url: string,
): Promise<Pick<JobPostingFields, "company" | "title" | "location" | "remote" | "salary" | "description"> | null> {
  const text = trimText(pageText, 40000);
  if (fake()) {
    const lines = text.split("\n").filter((l) => l.trim());
    if (!lines.length) return null;
    return {
      title: lines[0].slice(0, 300),
      company: (lines[1] ?? "").slice(0, 200),
      location: "",
      remote: /remote/i.test(text),
      salary: "",
      description: trimText(text, 6000),
    };
  }
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: coachModels().light,
    max_tokens: 8000,
    output_config: {
      effort: "low",
      format: zodOutputFormat(postingSchema),
    },
    system: POSTING_SYSTEM,
    messages: [{ role: "user", content: `Page: ${url || "(pasted text)"}\n\n${text}` }],
  });
  await recordUsage(db, userId, response.usage, "light").catch(() => {});
  const p = response.parsed_output;
  if (response.stop_reason === "refusal" || !p || !p.isJobPosting || !p.title.trim()) return null;
  return {
    company: p.company.trim().slice(0, 200),
    title: p.title.trim().slice(0, 300),
    location: p.location.trim().slice(0, 300),
    remote: p.remote,
    salary: p.salary.trim().slice(0, 200),
    description: trimText(p.description.trim(), 6000),
  };
}

export { profileText };
