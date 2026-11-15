import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchEmails, weekSummary, weeklyReportEmail } from "@/lib/email/digests";
import { emailConfigured, layout, sendEmail } from "@/lib/email/send";
import { badgeCount } from "@/lib/push/server";
import { applyMutations } from "@/lib/sync/server";
import { newTaskFields } from "@/features/tasks/model";

vi.mock("server-only", () => ({}));

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
});
afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});
beforeEach(() => {
  db = client.db(`e${Math.random().toString(36).slice(2)}`);
  process.env.EMAIL_FAKE = "1";
});
afterEach(() => {
  delete process.env.EMAIL_FAKE;
});

const USER = new ObjectId().toHexString();
// Sunday 22 November 2026 (weeks start Monday here): the week's last day.
const SUN = (t: string) => Date.parse(`2026-11-22T${t}:00Z`);
let n = 0;
const m = (entity: string, entityId: string, fields: Record<string, unknown>) => ({
  mutationId: `01MUTMAIL${String(++n).padStart(8, "0")}`,
  entity: entity as never,
  entityId,
  op: "upsert" as const,
  fields,
  clientTime: Date.now(),
});

async function seed(extra: Record<string, unknown> = {}) {
  await db.collection("user").insertOne({ _id: new ObjectId(USER), email: "ada@example.com", name: "Ada" });
  const seeded = await applyMutations(db, USER, [
    m("settings", `s${USER}`, {
      timezone: "UTC",
      weekStartDay: 1,
      cycleLengthDays: 14,
      dailyCapacityPts: 8,
      cycleCapacityPts: 30,
      workingHours: { start: "09:00", end: "17:00" },
      strictness: "firm",
      onboardingCompletedAt: 1,
      ...extra,
    }),
  ]);
  if (seeded.rejected.length) throw new Error(JSON.stringify(seeded.rejected));
}

describe("email layout and sending", () => {
  it("escapes content and has a text version", async () => {
    const { html, text } = layout({
      heading: "Hi <script>",
      sections: [{ title: "Done", lines: ["Ship & tell", "A < B"] }],
      button: { label: "Open", url: "https://example.com/a?b=1&c=2" },
      footer: "Bye",
    });
    expect(html).toContain("Hi &lt;script&gt;");
    expect(html).toContain("Ship &amp; tell");
    expect(html).not.toContain("<script>");
    expect(text).toBe("Hi <script>\n\nDONE\n- Ship & tell\n- A < B\n\nOpen: https://example.com/a?b=1&c=2\n\nBye");
    expect(emailConfigured()).toBe(true);
    expect(await sendEmail(db, { to: "a@example.com", subject: "S", text: "t", html: "h", tag: "x" })).toMatchObject({
      ok: true,
    });
    delete process.env.EMAIL_FAKE;
    expect(emailConfigured()).toBe(false);
    expect(await sendEmail(db, { to: "a@example.com", subject: "S", text: "t", html: "h", tag: "x" })).toEqual({
      ok: false,
      error: "email isn't set up",
    });
  });
});

describe("the weekly report email (NOT-7)", () => {
  it("summarises the week and goes out once, on its last evening", async () => {
    await seed();
    const done = (id: string, title: string, effort: number, day: string) =>
      m("tasks", id, {
        ...newTaskFields({ title, status: "done", effort: effort as never }),
        completedAt: Date.parse(`${day}T10:00:00Z`),
      });
    const res = await applyMutations(db, USER, [
      done("task000000001", "Send the portfolio", 3, "2026-11-17"),
      done("task000000002", "Call the bank", 1, "2026-11-20"),
      done("task000000003", "Last week's thing", 2, "2026-11-12"),
      m("focusSessions", "focus00000001", {
        taskId: "task000000001",
        mode: "pomodoro",
        plannedMinutes: 25,
        startedAt: Date.parse("2026-11-17T09:00:00Z"),
        endedAt: Date.parse("2026-11-17T10:30:00Z"),
        actualMinutes: 90,
        interruptions: 0,
        outcome: "done",
      }),
      m("rituals", "ritual0000001", {
        type: "daily_plan",
        date: "2026-11-17",
        cycleId: null,
        startedAt: 1,
        completedAt: 2,
        data: {},
      }),
      m("wins", "win0000000001", {
        date: "2026-11-18",
        title: "Got an interview",
        description: "",
        impact: "",
        areaId: null,
        goalId: null,
        taskId: null,
        links: [],
        source: "manual",
      }),
    ]);
    expect(res.rejected).toEqual([]);
    const s = await weekSummary(db, USER, "2026-11-16", "2026-11-22", "UTC");
    expect(s).toMatchObject({ points: 4, focusHours: 1.5, plans: 1, wins: ["Got an interview"] });
    expect(s.done.map((t) => t.title)).toEqual(["Send the portfolio", "Call the bank"]);
    const email = weeklyReportEmail(s, "ada@example.com");
    expect(email.subject).toBe("Your week in Orbit: 2 done, 1.5h focus");
    expect(email.text).toContain("Daily plan on 1 of 7 days");

    expect(await dispatchEmails(db, SUN("20:00"))).toEqual({ emails: 0 }); // before Shutdown time
    expect(await dispatchEmails(db, SUN("21:05"))).toEqual({ emails: 1 });
    expect(await dispatchEmails(db, SUN("21:30"))).toEqual({ emails: 0 }); // once a week
    const sent = await db.collection("emailOutbox").find().toArray();
    expect(sent.map((e) => [e.to, e.tag])).toEqual([["ada@example.com", "weekly-report"]]);
  });

  it("isn't sent when turned off", async () => {
    await seed({ email: { weeklyReport: false, reminders: false } });
    expect(await dispatchEmails(db, SUN("21:05"))).toEqual({ emails: 0 });
  });
});

describe("important reminders by email when push is off (NOT-7)", () => {
  const birthday = (personId: string, name: string, day: number) =>
    m("people", personId, {
      name,
      emoji: null,
      color: "blue",
      relationship: "friend",
      howWeMet: "",
      notes: "",
      interests: [],
      phone: null,
      whatsapp: null,
      email: null,
      cadenceDays: null,
      snoozedUntil: null,
      dates: [{ kind: "birthday", label: "", month: 11, day, year: null }],
      areaId: null,
      googleId: null,
      archivedAt: null,
    });

  it("bundles the day's important ones into one email, records them, and stops at two a day", async () => {
    await seed();
    await applyMutations(db, USER, [birthday("person0000001", "Tolu", 23), birthday("person0000002", "Bisi", 29)]);
    // Daily Plan time: both dates are due (tomorrow, and in a week). The plan reminder itself isn't emailed.
    expect(await dispatchEmails(db, SUN("07:35"))).toEqual({ emails: 1 });
    const [mail] = await db.collection("emailOutbox").find().toArray();
    expect(mail).toMatchObject({ to: "ada@example.com", subject: "2 reminders from Orbit", tag: "reminders" });
    expect(mail.text).toContain("Tolu");
    expect(await db.collection("notifications").countDocuments({ userId: USER })).toBe(2);
    expect(await dispatchEmails(db, SUN("07:40"))).toEqual({ emails: 0 }); // nothing new
  });

  it("isn't sent to people who have push on", async () => {
    await seed();
    await applyMutations(db, USER, [birthday("person0000001", "Tolu", 23)]);
    await db
      .collection("pushSubscriptions")
      .insertOne({ _id: "https://push.example/a" as never, userId: USER, keys: { p256dh: "p", auth: "a" } });
    expect(await dispatchEmails(db, SUN("07:35"))).toEqual({ emails: 0 });
  });
});

describe("the app icon badge (PWA-6)", () => {
  it("counts unread notifications, tasks due, or nothing", async () => {
    await db.collection("notifications").insertMany([
      { userId: USER, deletedAt: null, readAt: null },
      { userId: USER, deletedAt: null, readAt: 5 },
      { userId: USER, deletedAt: null, readAt: null },
    ]);
    expect(await badgeCount(db, USER, "unread", 4)).toBe(2);
    expect(await badgeCount(db, USER, undefined, 4)).toBe(2);
    expect(await badgeCount(db, USER, "due", 4)).toBe(4);
    expect(await badgeCount(db, USER, "off", 4)).toBe(0);
  });
});
