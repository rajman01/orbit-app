import "fake-indexeddb/auto";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  careerProfileId,
  checkTailoredCv,
  DEFAULT_SEARCH,
  emptyProfile,
  searchPaused,
  searchSettings,
  htmlToText,
  numbersIn,
  postingKey,
  postingMarkets,
  preferenceMiss,
  profileReadiness,
  titleMatches,
  type CareerProfileFields,
} from "@/features/jobs/model";
import { buildCvPdf, cvFileName, pdfSafe, wrapText } from "@/features/jobs/pdf";
import { dueNotifications } from "@/features/reminders/model";
import { isPrivateAddress, safeFetchText } from "@/lib/jobs/safe-fetch";
import { findBoard } from "@/lib/jobs/sources";
import { importPosting, jobSearchPaused, recentRuns, runJobSearch, searchPlan } from "@/lib/jobs/server";
import { tailorLead } from "@/lib/jobs/tailor";
import { applyMutations } from "@/lib/sync/server";

vi.mock("server-only", () => ({}));
// Every host resolves to a public address; no test touches the network.
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

const profile = (): CareerProfileFields => ({
  ...emptyProfile(),
  name: "Ada Obi",
  headline: "Product designer, fintech",
  contact: {
    email: "ada@example.com",
    phone: "",
    location: "Lagos, Nigeria",
    links: [{ label: "Portfolio", url: "https://ada.design" }],
  },
  summary: "Designer with 6 years in fintech.",
  experience: [
    {
      id: "r1",
      company: "Paystack",
      title: "Senior Product Designer",
      location: "Lagos",
      start: "2021-03",
      end: null,
      bullets: [
        { id: "b1", text: "Redesigned checkout, lifting conversion by 12%" },
        { id: "b2", text: "Led design for 3 merchant products used by 40,000 businesses" },
      ],
    },
    {
      id: "r2",
      company: "Andela",
      title: "Product Designer",
      location: "Remote",
      start: "2018-06",
      end: "2021-02",
      bullets: [{ id: "b3", text: "Built the first design system in Figma" }],
    },
  ],
  education: [
    { id: "e1", school: "University of Lagos", degree: "BSc Computer Science", start: null, end: "2017-07", notes: "" },
  ],
  skills: ["Figma", "user research", "design systems"],
  preferences: {
    roles: ["product designer"],
    markets: ["remote", "europe"],
    workplace: "any",
    salaryMin: null,
    currency: "USD",
    avoid: ["crypto"],
  },
  companies: [{ name: "Acme", board: "greenhouse", slug: "acme" }],
});

describe("job model", () => {
  it("turns HTML (and Greenhouse's escaped HTML) into readable text", () => {
    expect(
      htmlToText("<p>About us</p><ul><li>Figma</li><li>Research &amp; testing</li></ul><script>x()</script>"),
    ).toBe("About us\n\n• Figma\n• Research & testing");
    expect(htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;")).toBe("Hello & welcome");
  });

  it("matches titles, markets and preferences", () => {
    expect(titleMatches("Senior Product Designer, Growth", ["product designer"])).toBe(true);
    expect(titleMatches("Product Design Lead", ["product designer"])).toBe(false);
    expect(titleMatches("Product Designers", ["Product Designer"])).toBe(true);
    expect([...postingMarkets({ location: "Remote - Worldwide", remote: true })]).toEqual(["remote"]);
    expect([...postingMarkets({ location: "USA, Canada", remote: true })]).toEqual(["north_america"]);
    expect([...postingMarkets({ location: "Berlin, Europe", remote: false })]).toEqual(["europe"]);
    expect([...postingMarkets({ location: "Lagos, Nigeria", remote: false })]).toEqual(["africa"]);
    const prefs = profile().preferences;
    const job = { title: "Product Designer", company: "X", location: "USA", remote: true, description: "" };
    expect(preferenceMiss(job, prefs)).toBe("market");
    expect(preferenceMiss(job, prefs, { fromCompanyBoard: true })).toBeNull(); // named companies: anywhere
    expect(preferenceMiss({ ...job, location: "Anywhere" }, prefs)).toBeNull();
    expect(preferenceMiss({ ...job, location: "Anywhere", description: "A crypto exchange" }, prefs)).toBe("avoid");
    expect(preferenceMiss({ ...job, title: "Engineer" }, prefs)).toBe("title");
    expect(preferenceMiss({ ...job, location: "London", remote: false }, { ...prefs, workplace: "remote" })).toBe(
      "workplace",
    );
    expect(postingKey({ company: "Acme Inc", title: "Senior Product Designer", location: "Remote, US" })).toBe(
      postingKey({ company: "acme inc", title: "Senior  Product Designer", location: "remote us" }),
    );
    expect(profileReadiness(profile())).toEqual({ ready: true, missing: [] });
    expect(profileReadiness(null).missing).toContain("at least one role");
  });

  it("checks a tailored CV against the profile, flagging anything it can't trace", () => {
    expect(numbersIn("lifted conversion by 12% for 40,000 users in 2023 and 3x faster")).toEqual([
      "12%",
      "40000",
      "3x",
    ]);
    const { cv, flags } = checkTailoredCv(
      {
        headline: "Senior product designer",
        summary: "Designer with 6 years in fintech, 10 awards.",
        experience: [
          {
            roleId: "r1",
            company: "",
            title: "Head of Design",
            location: "",
            start: "",
            end: null,
            bullets: [
              { text: "Lifted checkout conversion by 12%", sources: ["b1"] },
              { text: "Led 3 merchant products for 50,000 businesses", sources: ["b2"] },
              { text: "Won a design award", sources: [] },
            ],
          },
          { roleId: "zz", company: "Google", title: "Designer", location: "", start: "", end: null, bullets: [] },
        ],
        projects: [],
        skills: ["Figma", "Rust"],
        education: ["e1", "nope"],
        certifications: [],
      },
      profile(),
    );
    expect(cv.experience).toHaveLength(1);
    expect(cv.experience[0]).toMatchObject({
      company: "Paystack",
      title: "Senior Product Designer",
      start: "2021-03",
      end: null,
    });
    expect(cv.education).toEqual(["e1"]);
    expect(flags).toEqual([
      "Removed a role that isn't in your profile (“Designer at Google”)",
      "Job title changed at Paystack; kept “Senior Product Designer”",
      "Paystack: “50000” isn't in your profile — check the number",
      "Paystack: “Won a design award” isn't linked to anything in your profile",
      "Skills not in your profile: Rust — keep only if true",
      "Summary: “10” isn't in your profile — check the number",
    ]);
  });

  it("makes a text PDF that the standard fonts can render", async () => {
    expect(pdfSafe("“Smart” quotes – dashes … ₦500")).toBe('"Smart" quotes - dashes ... NGN 500');
    const font = { widthOfTextAtSize: (s: string) => s.length * 5 };
    expect(wrapText("one two three four", font, 10, 40)).toEqual(["one two", "three", "four"]);
    const bytes = await buildCvPdf(profile(), {
      headline: "Senior product designer",
      summary: "Designer with 6 years in fintech.",
      experience: [
        {
          roleId: "r1",
          company: "Paystack",
          title: "Senior Product Designer",
          location: "Lagos",
          start: "2021-03",
          end: null,
          bullets: Array.from({ length: 10 }, (_, i) => ({
            text: `Achievement ${i} with a long line of words that wraps onto the next line of the page`,
            sources: ["b1"],
          })),
        },
      ],
      projects: [],
      skills: ["Figma"],
      education: ["e1"],
      certifications: [],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe("Ada Obi - CV");
    expect(cvFileName("Ada Obi", "Acme, Inc.")).toBe("Ada-Obi-CV-Acme-Inc.pdf");
  });
});

describe("safe fetch", () => {
  it("refuses private and odd addresses", async () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
    await expect(safeFetchText("http://127.0.0.1/admin")).rejects.toThrow(/public web/);
    await expect(safeFetchText("http://localhost:3000")).rejects.toThrow(/public web/);
    await expect(safeFetchText("file:///etc/passwd")).rejects.toThrow(/web links/);
    await expect(safeFetchText("https://user:pass@example.com")).rejects.toThrow(/login/);
  });
});

// ---------------------------------------------------------------- the daily search, against recorded feeds

const GREENHOUSE = {
  jobs: [
    {
      id: 1,
      title: "Senior Product Designer",
      absolute_url: "https://acme.com/jobs/1",
      first_published: "2026-11-10T10:00:00Z",
      company_name: "Acme",
      location: { name: "Remote" },
      content: "&lt;p&gt;Figma and design systems&lt;/p&gt;",
    },
    {
      id: 2,
      title: "Backend Engineer",
      absolute_url: "https://acme.com/jobs/2",
      location: { name: "Remote" },
      content: "",
    },
  ],
};
const REMOTIVE = {
  jobs: [
    {
      id: 11,
      url: "https://remotive.com/remote-jobs/design/11",
      title: "Product Designer",
      company_name: "Globex",
      candidate_required_location: "Worldwide",
      publication_date: "2026-11-12T08:00:00",
      description: "<p>User research, Figma</p>",
    },
    {
      id: 12,
      url: "https://remotive.com/remote-jobs/design/12",
      title: "Product Designer",
      company_name: "Initech",
      candidate_required_location: "USA",
      description: "US only",
    },
    {
      id: 13,
      url: "https://remotive.com/remote-jobs/design/13",
      title: "Product Designer (Crypto)",
      company_name: "CoinCo",
      candidate_required_location: "Worldwide",
      description: "crypto",
    },
  ],
};
const ARBEITNOW = {
  data: [
    {
      slug: "pd-berlin",
      company_name: "Hooli",
      title: "Product Designer",
      description: "<p>Figma</p>",
      remote: false,
      url: "https://arbeitnow.com/pd-berlin",
      location: "Berlin",
      created_at: 1794700000,
    },
  ],
};

describe("the daily search (server)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const userId = "user0000000001";
  const NOW = Date.parse("2026-11-16T08:00:00Z");
  let fetched: string[] = [];

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
  });
  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });
  beforeEach(async () => {
    db = client.db(`j${Math.random().toString(36).slice(2)}`);
    process.env.COACH_FAKE = "1";
    fetched = [];
    vi.stubGlobal("fetch", async (input: URL | string) => {
      const url = String(input);
      fetched.push(url);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
      if (url.includes("boards-api.greenhouse.io/v1/boards/acme")) return json(GREENHOUSE);
      if (url.includes("remotive.com")) return json(REMOTIVE);
      if (url.includes("arbeitnow.com")) return json(url.includes("page=1") ? ARBEITNOW : { data: [] });
      if (url.includes("lever.co") || url.includes("ashbyhq.com") || url.includes("greenhouse.io"))
        return new Response("not found", { status: 404 });
      return new Response(
        "<html><body><h1>Product Designer</h1><p>Northwind</p><p>Remote. You'll own the design of our merchant dashboard: research with users, prototypes in Figma, and a design system that scales.</p></body></html>",
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    });
    await applyMutations(db, userId, [
      {
        mutationId: "01MUTJOB000000001",
        entity: "settings",
        entityId: `s${userId}`,
        op: "upsert",
        clientTime: NOW,
        fields: {
          timezone: "UTC",
          weekStartDay: 1,
          cycleLengthDays: 14,
          dailyCapacityPts: 8,
          cycleCapacityPts: 30,
          workingHours: { start: "09:00", end: "17:00" },
          strictness: "firm",
        },
      },
      {
        mutationId: "01MUTJOB000000002",
        entity: "careerProfile",
        entityId: careerProfileId(userId),
        op: "upsert",
        clientTime: NOW,
        fields: profile() as never,
      },
    ]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.COACH_FAKE;
  });

  it("finds matching roles once, ranks them and keeps the good ones", async () => {
    const r = await runJobSearch(db, userId, NOW);
    expect(r).toMatchObject({ ran: true, errors: [] });
    const rows = await db.collection("jobPostings").find({ userId }).sort({ fit: -1 }).toArray();
    // Acme's designer (named company), Globex (worldwide remote), Hooli (Europe); not the engineer,
    // the US-only role, or the crypto one.
    expect(rows.map((p) => p.company).sort()).toEqual(["Acme", "Globex", "Hooli"]);
    expect(rows.every((p) => p.status === "new" && p.fit >= 40 && p.why.length)).toBe(true);
    expect(rows.find((p) => p.company === "Acme")!.description).toBe("Figma and design systems");
    // Remotive and Arbeitnow were asked; the daily run doesn't repeat today.
    expect(fetched.some((u) => u.includes("remotive.com/api/remote-jobs?search=product%20designer"))).toBe(true);
    expect(await runJobSearch(db, userId, NOW + 3_600_000)).toMatchObject({ ran: false, reason: "done today" });
    // "Check now" is throttled, and roles already found are never added twice.
    expect(await runJobSearch(db, userId, NOW + 60_000, { force: true })).toMatchObject({
      ran: false,
      reason: "too soon",
    });
    const again = await runJobSearch(db, userId, NOW + 20 * 60_000, { force: true });
    expect(again).toMatchObject({ ran: true, kept: 0 });
    expect(await db.collection("jobPostings").countDocuments({ userId })).toBe(3);
  });

  it("adds a role from a link and prepares a pack that keeps to the profile", async () => {
    const id = await importPosting(db, userId, { url: "https://example.com/jobs/42" }, NOW);
    const posting = await db.collection("jobPostings").findOne({ _id: id as never });
    expect(posting).toMatchObject({ source: "link", status: "saved", title: "Product Designer", company: "Northwind" });
    await expect(importPosting(db, userId, { url: "http://127.0.0.1/x" }, NOW)).rejects.toThrow(/public web/);

    // Make it a lead (as the device does), then tailor.
    const leadId = "lead0000000001";
    await applyMutations(db, userId, [
      {
        mutationId: "01MUTJOB000000003",
        entity: "jobLeads",
        entityId: leadId,
        op: "upsert",
        clientTime: NOW,
        fields: {
          company: "Northwind",
          role: "Product Designer",
          url: null,
          location: null,
          stage: "researching",
          outcome: null,
          nextStep: "Prepare the application",
          nextDate: "2026-11-16",
          salary: null,
          notes: "",
          order: 1,
          appliedAt: null,
          interviewedAt: null,
          closedAt: null,
          postingId: id,
          pack: null,
        },
      },
    ]);
    const pack = await tailorLead(db, userId, leadId, NOW);
    expect(pack.flags).toEqual([]);
    expect(pack.cv.experience.map((x) => [x.company, x.start])).toEqual([
      ["Paystack", "2021-03"],
      ["Andela", "2018-06"],
    ]);
    const lead = await db.collection("jobLeads").findOne({ _id: leadId as never });
    expect(lead).toMatchObject({ nextStep: "Review and apply", pack: { model: "fake" } });
  });

  it("respects pause, limits and switched-off sources, and records why roles were left out (3D.4)", async () => {
    const setSearch = (search: Record<string, unknown>, n: string) =>
      applyMutations(db, userId, [
        {
          mutationId: `01MUTJOBS${n}`.padEnd(17, "0"),
          entity: "careerProfile",
          entityId: careerProfileId(userId),
          op: "upsert",
          clientTime: Date.now() - 10_000 + Number(n) * 1000,
          fields: { search } as never,
        },
      ]);
    const base = { paused: false, pausedUntil: null, hour: 6, maxRanked: 25, minFit: 40, off: [] as string[] };
    await setSearch({ ...base, paused: true, pausedUntil: "2026-11-20" }, "1");
    expect(await runJobSearch(db, userId, NOW)).toMatchObject({ ran: false, reason: "paused" });
    expect(await jobSearchPaused(db, userId, "2026-11-16")).toBe(true);
    expect(await jobSearchPaused(db, userId, "2026-11-20")).toBe(false);
    const plan = await searchPlan(db, userId, NOW);
    expect(plan).toMatchObject({ paused: true, nextRun: { day: "2026-11-20", hour: 6 } });
    expect(plan!.sources.map((x) => [x.key, x.enabled])).toEqual([
      ["greenhouse:acme", true],
      ["remotive:product designer", true],
      ["arbeitnow", true],
    ]);

    // Resumed, Arbeitnow switched off, only strong fits kept, at most 1 ranked.
    await setSearch({ ...base, off: ["arbeitnow"], minFit: 70, maxRanked: 1 }, "2");
    const r = await runJobSearch(db, userId, NOW);
    expect(r).toMatchObject({ ran: true });
    expect(fetched.some((u) => u.includes("arbeitnow"))).toBe(false);
    const run = (await recentRuns(db, userId))[0];
    expect(run.sources.map((x) => [x.key, x.found, x.error])).toEqual([
      ["greenhouse:acme", 2, null],
      ["remotive:product designer", 3, null],
    ]);
    // The engineer (title), the US-only role (market), the crypto one (avoid); one waits for tomorrow.
    expect(run.reasons).toMatchObject({ title: 1, market: 1, avoid: 1, later: 1 });
    expect(run.ranked).toBe(1);
    expect(run.costUsd).toBe(0);
    expect((await searchPlan(db, userId, NOW))!.sources.find((x) => x.key === "arbeitnow")!.enabled).toBe(false);
  });

  it("finds a company's board from its name or a job link", async () => {
    expect(await findBoard("Acme")).toEqual({ name: "Acme", board: "greenhouse", slug: "acme" });
    expect(await findBoard("https://boards.greenhouse.io/acme/jobs/1")).toMatchObject({
      board: "greenhouse",
      slug: "acme",
    });
    expect(await findBoard("Nobody Corp")).toBeNull();
  });
});

describe("search settings (3D.4)", () => {
  it("pauses with or without an end date, and defaults the rest", () => {
    expect(searchSettings(null)).toEqual(DEFAULT_SEARCH);
    expect(searchSettings({ search: { ...DEFAULT_SEARCH, hour: 9 } }).hour).toBe(9);
    expect(searchPaused({ ...DEFAULT_SEARCH, paused: true, pausedUntil: null }, "2026-11-16")).toBe(true);
    expect(searchPaused({ ...DEFAULT_SEARCH, paused: true, pausedUntil: "2026-11-20" }, "2026-11-19")).toBe(true);
    expect(searchPaused({ ...DEFAULT_SEARCH, paused: true, pausedUntil: "2026-11-20" }, "2026-11-20")).toBe(false);
    expect(searchPaused(DEFAULT_SEARCH, "2026-11-16")).toBe(false);
  });
});

describe("the morning push for strong new roles", () => {
  it("sends one, at Daily Plan time", () => {
    const at = (t: string) => Date.parse(`2026-11-16T${t}:00Z`);
    const base = {
      settings: { timezone: "UTC" },
      rituals: [],
      cycles: [],
      habits: [],
      habitLogs: [],
      reminders: [],
      dueTodayCount: 0,
      sent: new Set<string>(),
    };
    const jobsFound = [
      { title: "Senior Product Designer", company: "Acme", fit: 88 },
      { title: "Product Designer", company: "Globex", fit: 74 },
    ];
    const n = dueNotifications({ ...base, now: at("07:40"), jobsFound }).filter((x) => x.key.startsWith("jobsfound:"));
    expect(n).toEqual([
      {
        key: "jobsfound:2026-11-16",
        title: "2 strong new roles for you",
        body: "Best: Senior Product Designer at Acme (88% fit)",
        url: "/jobs",
        tag: "orbit-jobs-found",
      },
    ]);
    expect(
      dueNotifications({ ...base, now: at("07:40"), jobsFound: [] }).filter((x) => x.key.startsWith("jobsfound:")),
    ).toEqual([]);
  });
});

describe("coach: the job assistant", () => {
  it("reads found roles and makes a lead from one, with undo", async () => {
    const { createActions } = await import("@/features/actions");
    const { runCoachTool } = await import("@/features/coach/device");
    const { undoAction } = await import("@/features/coach/write-tools");
    const { openLocalDb } = await import("@/lib/local-db/db");
    const { SyncEngine } = await import("@/lib/sync/engine");
    const USER = "user0000000001";
    const db = openLocalDb(`jobs-${Math.random().toString(36).slice(2)}`);
    const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
    const actions = createActions(engine, USER);
    const deps = { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } };
    await actions.saveSettings({ timezone: "UTC" });
    await actions.saveCareerProfile(profile());
    // A found role, as the server would sync it down.
    await db.jobPostings.put({
      id: "posting0000001",
      source: "remotive",
      externalId: "11",
      url: "https://remotive.com/x",
      company: "Globex",
      title: "Product Designer",
      location: "Worldwide",
      remote: true,
      salary: "",
      description: "Figma",
      postedAt: null,
      foundAt: 1,
      fit: 82,
      why: ["6 years in fintech design"],
      gaps: [],
      status: "new",
      leadId: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      serverVersion: 1,
    });
    const read = JSON.parse((await runCoachTool("get_job_assistant", {}, deps)).content);
    expect(read.profile).toMatchObject({ ready: true, lookingFor: ["product designer"], companiesWatched: ["Acme"] });
    expect(read.foundRoles).toEqual([
      expect.objectContaining({ id: "posting0000001", title: "Product Designer", company: "Globex", fit: 82 }),
    ]);
    const out = JSON.parse((await runCoachTool("make_lead_from_role", { postingId: "posting0000001" }, deps)).content);
    expect(await db.jobLeads.get(out.leadId)).toMatchObject({
      company: "Globex",
      role: "Product Designer",
      postingId: "posting0000001",
      nextStep: "Prepare the application",
    });
    expect(await db.jobPostings.get("posting0000001")).toMatchObject({ status: "lead", leadId: out.leadId });
    // Pausing (and resuming) through the coach; an open profile page saving can't undo it.
    await runCoachTool("pause_job_search", { until: "2099-01-01" }, deps);
    expect(searchSettings(await db.careerProfile.get(careerProfileId(USER)))).toMatchObject({
      paused: true,
      pausedUntil: "2099-01-01",
    });
    await actions.saveCareerProfile(profile());
    expect(searchSettings(await db.careerProfile.get(careerProfileId(USER))).paused).toBe(true);
    const pause = (await db.aiActions.toArray()).find((a) => a.tool === "pause_job_search")!;
    expect(pause.summary).toMatch(/^Pause the job search until /);
    await undoAction(engine, pause.id);
    expect(searchSettings(await db.careerProfile.get(careerProfileId(USER))).paused).toBe(false);

    const action = (await db.aiActions.toArray()).find((a) => a.tool === "make_lead_from_role")!;
    expect(action.summary).toBe("Make a lead: “Product Designer” at Globex");
    await undoAction(engine, action.id);
    expect((await db.jobLeads.get(out.leadId))!.deletedAt).toBeTypeOf("number");
    expect(await db.jobPostings.get("posting0000001")).toMatchObject({ status: "new", leadId: null });
  });
});
