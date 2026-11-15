import "server-only";
import { htmlToText, trimText, type JobPostingFields, type Preferences } from "@/features/jobs/model";
import type { EntityFields } from "@/lib/sync/entities";
import { safeFetchJson } from "./safe-fetch";

/**
 * Phase 3D: one adapter per job source, each turning its feed into the same shape. Only public
 * feeds that allow it; a source that fails is reported and skipped, never fatal.
 */

export type FoundPosting = Pick<
  JobPostingFields,
  "source" | "externalId" | "url" | "company" | "title" | "location" | "remote" | "salary" | "description" | "postedAt"
>;

type Company = EntityFields<"careerProfile">["companies"][number];

const DESCRIPTION_MAX = 6000;
const desc = (html: string) => trimText(htmlToText(html), DESCRIPTION_MAX);
const plain = (text: string) =>
  trimText(
    text
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    DESCRIPTION_MAX,
  );
const time = (v: string | number | null | undefined) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};
const remoteWords = /\b(remote|anywhere|worldwide|distributed|work from home|wfh)\b/i;

// ---------------------------------------------------------------- company boards

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  location?: { name?: string };
  content?: string;
}

export async function greenhouse(c: Pick<Company, "name" | "slug">): Promise<FoundPosting[]> {
  const d = await safeFetchJson<{ jobs: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.slug)}/jobs?content=true`,
  );
  return (d.jobs ?? []).map((j) => {
    const location = j.location?.name ?? "";
    return {
      source: "greenhouse",
      externalId: `${c.slug}:${j.id}`,
      url: j.absolute_url,
      company: j.company_name || c.name,
      title: j.title.trim(),
      location,
      remote: remoteWords.test(location),
      salary: "",
      description: desc(j.content ?? ""),
      postedAt: time(j.first_published ?? j.updated_at),
    };
  });
}

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string };
}

export async function lever(c: Pick<Company, "name" | "slug">): Promise<FoundPosting[]> {
  const d = await safeFetchJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(c.slug)}?mode=json`);
  return (Array.isArray(d) ? d : []).map((j) => {
    const location = j.categories?.allLocations?.join(", ") || j.categories?.location || "";
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    const s = j.salaryRange;
    return {
      source: "lever",
      externalId: `${c.slug}:${j.id}`,
      url: j.hostedUrl,
      company: c.name,
      title: j.text.trim(),
      location,
      remote: j.workplaceType === "remote" || remoteWords.test(location),
      salary: s?.min
        ? `${s.currency ?? ""} ${s.min.toLocaleString("en")}${s.max ? `–${s.max.toLocaleString("en")}` : ""}`.trim()
        : "",
      description: plain([j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n")),
      postedAt: time(j.createdAt),
    };
  });
}

interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  isListed?: boolean;
  compensation?: { compensationTierSummary?: string };
}

export async function ashby(c: Pick<Company, "name" | "slug">): Promise<FoundPosting[]> {
  const d = await safeFetchJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.slug)}?includeCompensation=true`,
  );
  return (d.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = [j.location, ...(j.secondaryLocations ?? []).map((x) => x.location)].filter(Boolean).join(", ");
      return {
        source: "ashby",
        externalId: `${c.slug}:${j.id}`,
        url: j.jobUrl,
        company: c.name,
        title: j.title.trim(),
        location,
        remote: Boolean(j.isRemote) || j.workplaceType === "Remote" || remoteWords.test(location),
        salary: j.compensation?.compensationTierSummary ?? "",
        description: plain(j.descriptionPlain ?? ""),
        postedAt: time(j.publishedAt),
      };
    });
}

export const BOARDS = { greenhouse, lever, ashby } as const;

/**
 * Finds a company's job board from its name, slug or careers link: tries the link's own board,
 * then each board with a slug made from the name. Returns the first that has a board.
 */
export async function findBoard(input: string): Promise<Company | null> {
  const raw = input.trim();
  const fromUrl = (() => {
    try {
      const u = new URL(raw);
      const seg = u.pathname.split("/").filter(Boolean);
      if (u.hostname.endsWith("greenhouse.io"))
        return {
          board: "greenhouse" as const,
          slug: seg.find((x) => x !== "embed" && x !== "boards" && x !== "v1") ?? "",
        };
      if (u.hostname.endsWith("lever.co")) return { board: "lever" as const, slug: seg[seg[0] === "v0" ? 2 : 0] ?? "" };
      if (u.hostname.endsWith("ashbyhq.com"))
        return { board: "ashby" as const, slug: seg[seg[0] === "posting-api" ? 2 : 0] ?? "" };
      return null;
    } catch {
      return null;
    }
  })();
  const name = fromUrl ? fromUrl.slug : raw;
  const slugs = fromUrl
    ? [fromUrl.slug]
    : [
        ...new Set([
          raw.toLowerCase().replace(/[^a-z0-9]+/g, ""),
          raw
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-"),
        ]),
      ].filter(Boolean);
  const boards = fromUrl ? [fromUrl.board] : (["greenhouse", "lever", "ashby"] as const);
  for (const board of boards)
    for (const slug of slugs) {
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug)) continue;
      try {
        const jobs = await BOARDS[board]({ name, slug });
        return { name: fromUrl ? (jobs[0]?.company ?? name) : raw, board, slug };
      } catch {
        // Not on this board.
      }
    }
  return null;
}

// ---------------------------------------------------------------- feeds

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  salary?: string;
  publication_date?: string;
  description?: string;
}

/**
 * Remote roles. Remotive's terms: link back to the listing on Remotive and name it as the source;
 * Orbit asks at most once a day per search.
 */
export async function remotive(query: string): Promise<FoundPosting[]> {
  const d = await safeFetchJson<{ jobs: RemotiveJob[] }>(
    `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=60`,
    { timeoutMs: 15_000 },
  );
  return (d.jobs ?? []).map((j) => ({
    source: "remotive",
    externalId: String(j.id),
    url: j.url,
    company: j.company_name,
    title: j.title.trim(),
    location: j.candidate_required_location || "Worldwide",
    remote: true,
    salary: j.salary ?? "",
    description: desc(j.description ?? ""),
    postedAt: time(j.publication_date),
  }));
}

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  location: string;
  created_at: number;
}

/** Jobs in Europe (mostly Germany), newest first; no search, so the first pages are filtered here. */
export async function arbeitnow(pages = 3): Promise<FoundPosting[]> {
  const out: FoundPosting[] = [];
  for (let page = 1; page <= pages; page++) {
    const d = await safeFetchJson<{ data: ArbeitnowJob[] }>(
      `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
      {
        timeoutMs: 12_000,
      },
    );
    for (const j of d.data ?? [])
      out.push({
        source: "arbeitnow",
        externalId: j.slug,
        url: j.url,
        company: j.company_name,
        title: j.title.trim(),
        location: j.location ? `${j.location}, Europe` : "Europe",
        remote: Boolean(j.remote),
        salary: "",
        description: desc(j.description ?? ""),
        postedAt: time(j.created_at),
      });
  }
  return out;
}

interface AdzunaJob {
  id: string;
  title: string;
  redirect_url: string;
  created?: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
}

export const ADZUNA_COUNTRIES: Record<"europe" | "north_america", string[]> = {
  europe: ["gb", "de", "nl"],
  north_america: ["us", "ca"],
};
const COUNTRY_NAME: Record<string, string> = { gb: "UK", de: "Germany", nl: "Netherlands", us: "US", ca: "Canada" };

export const adzunaConfigured = () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);

/** Adzuna (optional; needs ADZUNA_APP_ID and ADZUNA_APP_KEY). Only a short snippet of each job. */
export async function adzuna(country: string, query: string): Promise<FoundPosting[]> {
  if (!adzunaConfigured()) return [];
  const q = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID!,
    app_key: process.env.ADZUNA_APP_KEY!,
    what: query,
    results_per_page: "40",
    max_days_old: "14",
    "content-type": "application/json",
  });
  const d = await safeFetchJson<{ results: AdzunaJob[] }>(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${q}`,
  );
  return (d.results ?? []).map((j) => {
    const location = `${j.location?.display_name ?? ""}, ${COUNTRY_NAME[country] ?? country.toUpperCase()}`;
    return {
      source: "adzuna",
      externalId: `${country}:${j.id}`,
      url: j.redirect_url,
      company: j.company?.display_name ?? "",
      title: htmlToText(j.title).trim(),
      location,
      remote: remoteWords.test(`${j.title} ${location}`),
      salary: j.salary_min
        ? `${Math.round(j.salary_min).toLocaleString("en")}${j.salary_max ? `–${Math.round(j.salary_max).toLocaleString("en")}` : ""}`
        : "",
      description: desc(j.description ?? ""),
      postedAt: time(j.created),
    };
  });
}

export interface SourcePlan {
  label: string;
  run: () => Promise<FoundPosting[]>;
  fromCompanyBoard: boolean;
}

/**
 * What to check for this profile: each named company's board, and per market the feeds that cover
 * it (searches use your roles; at most three, to keep within the feeds' fair use).
 */
export function plannedSources(prefs: Preferences, companies: Company[]): SourcePlan[] {
  const plans: SourcePlan[] = companies.map((c) => ({
    label: `${c.name} (${c.board})`,
    run: () => BOARDS[c.board](c),
    fromCompanyBoard: true,
  }));
  const queries = prefs.roles.slice(0, 3);
  if (prefs.markets.includes("remote"))
    for (const q of queries) plans.push({ label: `Remotive: ${q}`, run: () => remotive(q), fromCompanyBoard: false });
  if (prefs.markets.includes("europe"))
    plans.push({ label: "Arbeitnow", run: () => arbeitnow(), fromCompanyBoard: false });
  if (adzunaConfigured())
    for (const market of ["europe", "north_america"] as const)
      if (prefs.markets.includes(market))
        for (const country of ADZUNA_COUNTRIES[market])
          for (const q of queries.slice(0, 2))
            plans.push({ label: `Adzuna ${country}: ${q}`, run: () => adzuna(country, q), fromCompanyBoard: false });
  return plans;
}
