import type { ApplicationPack, EntityFields, SyncedDoc, TailoredCv } from "@/lib/sync/entities";
import { JOB_MARKETS } from "@/lib/sync/entities";

/**
 * Phase 3D (CAR-5): the job assistant's rules — the career profile, which found roles match your
 * preferences, de-duplication, and the fact checks on a tailored CV. Pure, shared by the server
 * (daily search, tailoring) and the device (screens, PDF).
 */

export type CareerProfile = SyncedDoc<"careerProfile">;
export type CareerProfileFields = EntityFields<"careerProfile">;
export type JobPosting = SyncedDoc<"jobPostings">;
export type JobPostingFields = EntityFields<"jobPostings">;
export type JobMarket = (typeof JOB_MARKETS)[number];
export type Preferences = CareerProfileFields["preferences"];

export function careerProfileId(userId: string): string {
  return `cp${userId}`.slice(0, 40);
}

export const MARKET_LABEL: Record<JobMarket, string> = {
  remote: "Remote, worldwide",
  africa: "Nigeria / Africa",
  europe: "UK and Europe",
  north_america: "US and Canada",
};

export function emptyProfile(): CareerProfileFields {
  return {
    name: "",
    headline: "",
    contact: { email: "", phone: "", location: "", links: [] },
    summary: "",
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    skills: [],
    preferences: { roles: [], markets: [], workplace: "any", salaryMin: null, currency: "USD", avoid: [] },
    companies: [],
  };
}

/** Short ids for roles and bullets inside the profile. */
export function newShortId(used: Iterable<string>, prefix = "b"): string {
  const taken = new Set(used);
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Every id in the profile (roles, bullets, projects, education, certifications). */
export function profileIds(
  p: Pick<CareerProfileFields, "experience" | "projects" | "education" | "certifications">,
): string[] {
  return [
    ...p.experience.flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)]),
    ...p.projects.flatMap((x) => [x.id, ...x.bullets.map((b) => b.id)]),
    ...p.education.map((e) => e.id),
    ...p.certifications.map((c) => c.id),
  ];
}

/** Is there enough in the profile to find roles and tailor a CV? */
export function profileReadiness(p: CareerProfileFields | null | undefined) {
  const missing: string[] = [];
  if (!p?.experience.length) missing.push("at least one role");
  if (p && !p.experience.some((e) => e.bullets.length)) missing.push("bullets under your roles");
  if (!p?.preferences.roles.length) missing.push("the roles you're looking for");
  if (!p?.preferences.markets.length && !p?.companies.length) missing.push("markets or companies to watch");
  return { ready: missing.length === 0, missing };
}

// ---------------------------------------------------------------- text

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  bull: "•",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * HTML (or HTML-escaped HTML, as Greenhouse sends) → readable plain text: block tags become line
 * breaks, list items bullets; scripts and styles go; whitespace is tidied.
 */
export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse escapes its HTML once more.
  if (/&lt;[a-z/]/i.test(s) && !/<[a-z/]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|ul|ol|section|article|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, all) => l || (i > 0 && all[i - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function trimText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${cut.slice(0, at > max * 0.6 ? at + 1 : max).trimEnd()}…`;
}

// ---------------------------------------------------------------- matching

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "in",
  "at",
  "to",
  "with",
  "senior",
  "sr",
  "junior",
  "jr",
  "lead",
  "principal",
  "staff",
  "head",
  "mid",
  "level",
  "i",
  "ii",
  "iii",
  "remote",
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));

/**
 * Does a job title match one of the roles you're looking for? Every meaningful word of the role
 * must be in the title ("product designer" matches "Senior Product Designer, Growth"); seniority
 * words are ignored either way.
 */
export function titleMatches(title: string, roles: string[]): boolean {
  if (!roles.length) return true;
  const t = new Set(words(title));
  return roles.some((r) => {
    const need = words(r).filter((w) => !STOP.has(w));
    return need.length > 0 && need.every((w) => t.has(w));
  });
}

const REGION_WORDS: Record<Exclude<JobMarket, "remote">, string[]> = {
  africa: [
    "africa",
    "nigeria",
    "lagos",
    "abuja",
    "port harcourt",
    "ghana",
    "accra",
    "kenya",
    "nairobi",
    "south africa",
    "cape town",
    "johannesburg",
    "egypt",
    "cairo",
    "rwanda",
    "kigali",
    "morocco",
    "uganda",
    "ethiopia",
    "senegal",
    "emea",
  ],
  europe: [
    "europe",
    "eu",
    "emea",
    "uk",
    "united kingdom",
    "england",
    "london",
    "manchester",
    "scotland",
    "ireland",
    "dublin",
    "germany",
    "berlin",
    "munich",
    "france",
    "paris",
    "netherlands",
    "amsterdam",
    "spain",
    "madrid",
    "barcelona",
    "portugal",
    "lisbon",
    "italy",
    "poland",
    "sweden",
    "stockholm",
    "denmark",
    "switzerland",
    "zurich",
    "austria",
    "belgium",
    "finland",
    "norway",
    "czech",
    "estonia",
    "romania",
  ],
  north_america: [
    "us",
    "usa",
    "united states",
    "america",
    "north america",
    "canada",
    "toronto",
    "vancouver",
    "montreal",
    "new york",
    "nyc",
    "san francisco",
    "seattle",
    "austin",
    "boston",
    "chicago",
    "los angeles",
    "denver",
    "atlanta",
    "miami",
    "washington",
    "americas",
  ],
};

const WORLDWIDE = ["anywhere", "worldwide", "global", "globally", "any location", "international"];

const has = (text: string, phrase: string) =>
  new RegExp(`(^|[^a-z])${phrase.replace(/ /g, "\\s+")}([^a-z]|$)`).test(text);

/** Which markets a role is open to, from its location text and whether it's remote. */
export function postingMarkets(p: Pick<JobPostingFields, "location" | "remote">): Set<JobMarket> {
  const loc = p.location.toLowerCase();
  const out = new Set<JobMarket>();
  for (const [market, list] of Object.entries(REGION_WORDS) as [Exclude<JobMarket, "remote">, string[]][])
    if (list.some((w) => has(loc, w))) out.add(market);
  // Remote with no region named, or open worldwide.
  if (p.remote && (out.size === 0 || WORLDWIDE.some((w) => has(loc, w)))) out.add("remote");
  return out;
}

/** Why a found role is skipped, or null when it matches your preferences. */
export function preferenceMiss(
  p: Pick<JobPostingFields, "title" | "company" | "location" | "remote" | "description">,
  prefs: Preferences,
  opts: { fromCompanyBoard?: boolean } = {},
): string | null {
  if (!titleMatches(p.title, prefs.roles)) return "title";
  const hay = `${p.title} ${p.company}`.toLowerCase();
  if (prefs.avoid.some((a) => hay.includes(a.toLowerCase()) || p.description.toLowerCase().includes(a.toLowerCase())))
    return "avoid";
  if (prefs.workplace === "remote" && !p.remote) return "workplace";
  // Companies you named are watched wherever they hire; feeds must match your markets.
  if (!opts.fromCompanyBoard && prefs.markets.length) {
    const markets = postingMarkets(p);
    if (![...markets].some((m) => prefs.markets.includes(m))) return "market";
  }
  return null;
}

/** One key per role across sources: the same job on two boards is found once. */
export function postingKey(p: Pick<JobPostingFields, "company" | "title" | "location">): string {
  const n = (s: string) => words(s).join(" ");
  return `${n(p.company)}|${n(p.title)}|${n(p.location).split(" ").slice(0, 3).join(" ")}`;
}

export const STRONG_FIT = 70;
export const KEEP_FIT = 40;

export function fitLabel(fit: number | null): string {
  if (fit == null) return "Not ranked yet";
  if (fit >= 85) return "Strong fit";
  if (fit >= STRONG_FIT) return "Good fit";
  if (fit >= 55) return "Partial fit";
  return "Stretch";
}

// ---------------------------------------------------------------- tailored CVs: the fact checks

/** Numbers as written ("40%", "$1.2m", "3x", "12,000"), normalised for comparison. */
export function numbersIn(text: string): string[] {
  // A unit only counts when no more letters follow ("50,000 businesses" is 50000, not 50000b).
  return (text.match(/\d[\d,.]*(?:\s?(?:%|(?:x|k|m|bn|b)(?![a-z])))?/gi) ?? [])
    .map((n) => n.toLowerCase().replace(/[,\s]/g, "").replace(/\.$/, ""))
    .filter((n) => n && !/^(19|20)\d\d$/.test(n)); // years are checked as dates
}

/**
 * Checks a tailored CV against the profile: every role must be one of yours with the same company,
 * title and dates; every bullet must name the profile bullets it came from, and its numbers must
 * appear in them. Returns the flags (empty when it all checks out) and a cleaned CV with unknown
 * roles, projects, education and certifications removed.
 */
export function checkTailoredCv(cv: TailoredCv, profile: CareerProfileFields): { cv: TailoredCv; flags: string[] } {
  const flags: string[] = [];
  const roles = new Map(profile.experience.map((e) => [e.id, e]));
  const projects = new Map(profile.projects.map((p) => [p.id, p]));
  const bulletText = new Map<string, string>();
  for (const e of profile.experience) for (const b of e.bullets) bulletText.set(b.id, b.text);
  for (const p of profile.projects) for (const b of p.bullets) bulletText.set(b.id, b.text);
  const summary = profile.summary;

  const checkBullet = (where: string, b: { text: string; sources: string[] }) => {
    const known = b.sources.filter((id) => bulletText.has(id) || id === "summary");
    if (!known.length) {
      flags.push(`${where}: “${b.text.slice(0, 80)}” isn't linked to anything in your profile`);
      return;
    }
    const source = known.map((id) => (id === "summary" ? summary : bulletText.get(id)!)).join(" ");
    const have = new Set(numbersIn(source));
    const extra = numbersIn(b.text).filter((n) => !have.has(n));
    if (extra.length) flags.push(`${where}: “${extra.join(", ")}” isn't in your profile — check the number`);
  };

  const experience = cv.experience.filter((x) => {
    const r = roles.get(x.roleId);
    if (!r) {
      flags.push(`Removed a role that isn't in your profile (“${x.title} at ${x.company}”)`);
      return false;
    }
    return true;
  });
  const fixed: TailoredCv["experience"] = experience.map((x) => {
    const r = roles.get(x.roleId)!;
    // Employer, dates and place always come from the profile; the title may only be shortened.
    if (x.company.trim() && x.company.trim() !== r.company.trim())
      flags.push(`Company name changed for ${r.company}; kept yours`);
    const title =
      x.title.trim() && r.title.toLowerCase().includes(x.title.trim().toLowerCase()) ? x.title.trim() : r.title;
    if (title !== x.title.trim()) flags.push(`Job title changed at ${r.company}; kept “${r.title}”`);
    for (const b of x.bullets) checkBullet(`${r.company}`, b);
    return { ...x, company: r.company, title, location: r.location, start: r.start, end: r.end };
  });
  const fixedProjects = cv.projects.filter((p) => {
    if (!projects.has(p.projectId)) {
      flags.push(`Removed a project that isn't in your profile (“${p.name}”)`);
      return false;
    }
    for (const b of p.bullets) checkBullet(p.name, b);
    return true;
  });
  const eduIds = new Set(profile.education.map((e) => e.id));
  const certIds = new Set(profile.certifications.map((c) => c.id));
  const skillSet = new Set(profile.skills.map((s) => s.toLowerCase()));
  const newSkills = cv.skills.filter((s) => !skillSet.has(s.toLowerCase()));
  if (newSkills.length) flags.push(`Skills not in your profile: ${newSkills.join(", ")} — keep only if true`);
  for (const n of numbersIn(cv.summary).filter((n) => !numbersIn(profileText(profile)).includes(n)))
    flags.push(`Summary: “${n}” isn't in your profile — check the number`);
  return {
    cv: {
      ...cv,
      experience: fixed,
      projects: fixedProjects,
      education: cv.education.filter((id) => eduIds.has(id)),
      certifications: cv.certifications.filter((id) => certIds.has(id)),
    },
    flags,
  };
}

/** All the profile's words, for checks and the model's context. */
export function profileText(p: CareerProfileFields): string {
  return [
    p.headline,
    p.summary,
    ...p.experience.flatMap((e) => [e.title, e.company, ...e.bullets.map((b) => b.text)]),
    ...p.projects.flatMap((x) => [x.name, ...x.bullets.map((b) => b.text)]),
    ...p.education.map((e) => `${e.degree} ${e.school} ${e.notes}`),
    ...p.certifications.map((c) => `${c.name} ${c.issuer} ${c.year ?? ""}`),
    p.skills.join(", "),
  ].join("\n");
}

/** "Jan 2022 – Present" style dates for the CV. */
export function monthLabel(m: string | null): string {
  if (!m) return "Present";
  const [y, mo] = m.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]} ${y}`;
}

export type { ApplicationPack, TailoredCv };
