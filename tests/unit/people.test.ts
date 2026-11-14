import "fake-indexeddb/auto";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { describe, expect, it } from "vitest";
import { createActions } from "@/features/actions";
import { presetAreaId } from "@/features/areas/model";
import { dueNotifications } from "@/features/reminders/model";
import { dispatchReminders, type Sender } from "@/lib/push/server";
import {
  agoLabel,
  dateTitle,
  reachOut,
  upcomingDates,
  type Person,
  cadenceLabel,
  initials,
  lastInTouch,
  newPersonFields,
  nextOccurrence,
  upcomingDate,
} from "@/features/people/model";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";
import { applyMutations } from "@/lib/sync/server";

const USER = "user0000000001";

function setup() {
  const db = openLocalDb(`people-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
  return { db, engine, actions: createActions(engine, USER) };
}

describe("people model (REL-1/2)", () => {
  it("makes initials from one or more names", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  ada  byron lovelace ")).toBe("AL");
    expect(initials("Mum")).toBe("MU");
    expect(initials("Émile")).toBe("ÉM");
    expect(initials("")).toBe("?");
  });

  it("labels cadences and how long ago", () => {
    expect(cadenceLabel(null)).toBe("No reminder");
    expect(cadenceLabel(14)).toBe("Every 2 weeks");
    expect(cadenceLabel(21)).toBe("Every 21 days");
    expect(agoLabel("2026-11-14", "2026-11-14")).toBe("Today");
    expect(agoLabel("2026-11-13", "2026-11-14")).toBe("Yesterday");
    expect(agoLabel("2026-11-04", "2026-11-14")).toBe("10 days ago");
    expect(agoLabel("2026-10-17", "2026-11-14")).toBe("4 weeks ago");
    expect(agoLabel("2026-05-14", "2026-11-14")).toBe("6 months ago");
  });

  it("finds the next occurrence of a date, today included, with 29 February on the 28th", () => {
    expect(nextOccurrence({ month: 11, day: 14 }, "2026-11-14")).toBe("2026-11-14");
    expect(nextOccurrence({ month: 3, day: 2 }, "2026-11-14")).toBe("2027-03-02");
    expect(nextOccurrence({ month: 12, day: 25 }, "2026-11-14")).toBe("2026-12-25");
    expect(nextOccurrence({ month: 2, day: 29 }, "2026-11-14")).toBe("2027-02-28");
    expect(nextOccurrence({ month: 2, day: 29 }, "2027-11-14")).toBe("2028-02-29");
    // Bad days are clamped to the month's end.
    expect(nextOccurrence({ month: 4, day: 31 }, "2026-01-01")).toBe("2026-04-30");
    const u = upcomingDate({ kind: "birthday", label: "", month: 3, day: 2, year: 1990 }, "2026-11-14");
    expect(u).toMatchObject({ on: "2027-03-02", inDays: 108, turning: 37 });
    expect(upcomingDate({ kind: "custom", label: "x", month: 1, day: 1, year: null }, "2026-11-14").turning).toBeNull();
  });

  it("last in touch is the newest live interaction", () => {
    expect(lastInTouch([])).toBeNull();
    expect(
      lastInTouch([
        { date: "2026-10-01", deletedAt: null },
        { date: "2026-11-02", deletedAt: 5 },
        { date: "2026-10-20", deletedAt: null },
      ]),
    ).toBe("2026-10-20");
  });
});

describe("people actions", () => {
  it("adds someone to the Relationships area, logs a call with a follow-up and ends a snooze", async () => {
    const { db, actions } = setup();
    await actions.ensurePresetAreas(["relationships"]);
    const id = await actions.createPerson({ name: " Ada Lovelace ", cadenceDays: 14 });
    const p = await db.people.get(id);
    expect(p).toMatchObject({ name: "Ada Lovelace", areaId: presetAreaId(USER, "relationships"), cadenceDays: 14 });

    await actions.snoozePerson(id, "2026-12-01");
    const { taskId } = await actions.logInteraction(
      id,
      { date: "2026-11-14", type: "call", notes: " Talked about her trip " },
      { title: "Send the article", scheduledDate: "2026-11-16" },
    );
    expect((await db.people.get(id))?.snoozedUntil).toBeNull();
    const log = await db.interactions.where("personId").equals(id).toArray();
    expect(log).toMatchObject([{ type: "call", notes: "Talked about her trip", date: "2026-11-14" }]);
    expect(await db.tasks.get(taskId!)).toMatchObject({
      title: "Send the article",
      personId: id,
      status: "todo",
      scheduledDate: "2026-11-16",
      areaId: presetAreaId(USER, "relationships"),
    });
    // Without a follow-up, no task.
    expect((await actions.logInteraction(id, { date: "2026-11-15", type: "text", notes: "" })).taskId).toBeNull();
  });

  it("deletes someone with their log and items; tasks stay without the link", async () => {
    const { db, actions } = setup();
    const id = await actions.createPerson({ name: "Grace" });
    expect((await db.people.get(id))?.areaId).toBeNull(); // no Relationships area
    const { taskId } = await actions.logInteraction(
      id,
      { date: "2026-11-14", type: "in_person", notes: "" },
      { title: "Book dinner", scheduledDate: null },
    );
    const gift = await actions.addPersonItem(id, "gift", "Jazz record");
    await actions.togglePersonItem(gift, true);
    expect((await db.personItems.get(gift))?.doneAt).toBeTypeOf("number");

    const goal = await actions.createGoal({ title: "Closer to Grace", personIds: [id] });
    await actions.deletePerson(id);
    expect((await db.goals.get(goal))?.personIds).toEqual([]);
    expect((await db.people.get(id))?.deletedAt).toBeTypeOf("number");
    expect((await db.interactions.where("personId").equals(id).toArray()).every((i) => i.deletedAt)).toBe(true);
    expect((await db.personItems.get(gift))?.deletedAt).toBeTypeOf("number");
    expect(await db.tasks.get(taskId!)).toMatchObject({ title: "Book dinner", personId: null, deletedAt: null });
  });
});

describe("people on the server", () => {
  it("syncs people and refuses links to someone else's person", async () => {
    const mongod = await MongoMemoryServer.create();
    const client = await MongoClient.connect(mongod.getUri());
    try {
      const db = client.db("people");
      const person = "01PERSON00000001";
      const fields = newPersonFields({
        name: "Ada",
        dates: [{ kind: "birthday", label: "", month: 12, day: 10, year: 1815 }],
      });
      const mut = (entity: string, entityId: string, f: Record<string, unknown>, n: number) => ({
        mutationId: `01MUT${String(n).padStart(11, "0")}`,
        entity,
        entityId,
        op: "upsert" as const,
        fields: f,
        clientTime: 1000 + n,
      });
      const res = await applyMutations(db, "u1", [
        mut("people", person, fields, 1),
        mut("interactions", "01INTER000000001", { personId: person, date: "2026-11-14", type: "call", notes: "" }, 2),
      ] as never);
      expect(res.applied).toHaveLength(2);
      // Another account can't attach an interaction to u1's person.
      const other = await applyMutations(db, "u2", [
        mut("interactions", "01INTER000000002", { personId: person, date: "2026-11-14", type: "call", notes: "" }, 3),
      ] as never);
      expect(other.applied).toHaveLength(0);
      // A bad date is refused.
      const bad = await applyMutations(db, "u1", [
        mut(
          "people",
          "01PERSON00000002",
          { ...fields, dates: [{ kind: "birthday", label: "", month: 13, day: 1, year: null }] },
          4,
        ),
      ] as never);
      expect(bad.applied).toHaveLength(0);
    } finally {
      await client.close();
      await mongod.stop();
    }
  });
});

const person = (id: string, f: Partial<Person> = {}): Person =>
  ({
    ...newPersonFields({ name: id }),
    id,
    createdAt: Date.parse("2026-01-01T12:00:00Z"),
    updatedAt: 0,
    deletedAt: null,
    serverVersion: 1,
    ...f,
  }) as Person;
const met = (personId: string, date: string) => ({ personId, date, deletedAt: null });

describe("reach out (REL-3)", () => {
  const T = "2026-11-14";
  it("ranks by how far past their cadence, skipping no-cadence, snoozed and archived people", () => {
    const people = [
      person("Weekly", { cadenceDays: 7 }), // 14 days: 2×
      person("Quarterly", { cadenceDays: 91 }), // 105 days: 1.15×
      person("Fresh", { cadenceDays: 30 }), // 10 days: not due
      person("NoCadence", { cadenceDays: null }),
      person("Snoozed", { cadenceDays: 7, snoozedUntil: "2026-11-20" }),
      person("SnoozeOver", { cadenceDays: 7, snoozedUntil: "2026-11-14" }), // 21 days: 3×
      person("Archived", { cadenceDays: 7, archivedAt: 1 }),
      person("Never", { cadenceDays: 14, createdAt: Date.parse("2026-10-31T12:00:00Z") }), // added 14 days ago: 1×
      person("JustAdded", { cadenceDays: 14, createdAt: Date.parse("2026-11-10T12:00:00Z") }),
    ];
    const log = [
      met("Weekly", "2026-10-31"),
      met("Weekly", "2026-10-01"),
      met("Quarterly", "2026-08-01"),
      met("Fresh", "2026-11-04"),
      met("SnoozeOver", "2026-10-24"),
      { personId: "Fresh", date: "2026-01-01", deletedAt: 5 },
    ];
    const list = reachOut(people, log, T, "UTC");
    expect(list.map((r) => [r.person.id, r.days])).toEqual([
      ["SnoozeOver", 21],
      ["Weekly", 14],
      ["Quarterly", 105],
      ["Never", 14],
    ]);
    expect(list.find((r) => r.person.id === "Never")?.last).toBeNull();
  });

  it("lists dates coming up and names them", () => {
    const people = [
      person("Mum", { dates: [{ kind: "birthday", label: "", month: 11, day: 21, year: 1966 }] }),
      person("Ada Lovelace", {
        dates: [
          { kind: "anniversary", label: "", month: 11, day: 14, year: 2020 },
          { kind: "custom", label: "Graduation", month: 1, day: 5, year: null },
        ],
      }),
    ];
    const soon = upcomingDates(people, "2026-11-14", 30);
    expect(soon.map((u) => [u.person.id, u.inDays, u.turning])).toEqual([
      ["Ada Lovelace", 0, 6],
      ["Mum", 7, 60],
    ]);
    expect(dateTitle("Mum", people[0].dates[0])).toBe("Mum's birthday");
    expect(dateTitle("James Bond", people[0].dates[0])).toBe("James' birthday");
    expect(dateTitle("Ada Lovelace", people[1].dates[1])).toBe("Graduation (Ada)");
  });
});

describe("date reminders (REL-6)", () => {
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
  const people = [
    person("p1", { name: "Mum", dates: [{ kind: "birthday", label: "", month: 11, day: 21, year: 1966 }] }),
    person("p2", { name: "Tunde", dates: [{ kind: "birthday", label: "", month: 11, day: 15, year: null }] }),
    person("p3", { name: "Later", dates: [{ kind: "birthday", label: "", month: 11, day: 18, year: null }] }),
  ];
  const at = (t: string) => Date.parse(`2026-11-14T${t}:00Z`);

  it("sends a week and a day before, at Daily Plan time, once each", () => {
    const keys = (n: number, sent = new Set<string>(), p = people) =>
      dueNotifications({ ...base, now: n, people: p as never, sent }).filter((x) => x.key.startsWith("date:"));
    expect(keys(at("07:00"))).toEqual([]); // before the plan time (07:30)
    const due = keys(at("07:30"));
    expect(due.map((d) => d.title)).toEqual(["Tunde's birthday is tomorrow", "Mum's birthday is in a week"]);
    expect(due[1]).toMatchObject({ body: "Saturday, 21 November. They turn 60.", url: "/person?id=p1" });
    expect(keys(at("07:31"), new Set(due.map((d) => d.key)))).toEqual([]);
    // Turned off in Settings.
    expect(
      dueNotifications({
        ...base,
        settings: {
          timezone: "UTC",
          notify: { plan: true, shutdown: true, review: true, habits: true, focus: true, people: false },
        },
        now: at("07:30"),
        people: people as never,
      }).filter((x) => x.key.startsWith("date:")),
    ).toEqual([]);
  });

  it("goes out from the server job once", async () => {
    const mongod = await MongoMemoryServer.create();
    const client = await MongoClient.connect(mongod.getUri());
    try {
      const db = client.db("dates");
      const userId = "user0000000001";
      await db
        .collection("settings")
        .insertOne({ _id: `s${userId}` as never, userId, timezone: "UTC", deletedAt: null });
      await db.collection("pushSubscriptions").insertOne({ _id: "https://push.example/ok" as never, userId, keys: {} });
      await db.collection("people").insertOne({
        _id: "01PERSON0000000A" as never,
        userId,
        ...newPersonFields({ name: "Mum", dates: [{ kind: "birthday", label: "", month: 11, day: 15, year: null }] }),
        deletedAt: null,
      });
      const titles: string[] = [];
      const send: Sender = async (_s, p) => (titles.push(p.title), { ok: true });
      await dispatchReminders(db, at("08:00"), send);
      await dispatchReminders(db, at("08:01"), send);
      expect(titles.filter((t) => t.includes("Mum"))).toEqual(["Mum's birthday is tomorrow"]);
    } finally {
      await client.close();
      await mongod.stop();
    }
  });
});
