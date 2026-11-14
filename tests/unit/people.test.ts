import "fake-indexeddb/auto";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { describe, expect, it } from "vitest";
import { createActions } from "@/features/actions";
import { presetAreaId } from "@/features/areas/model";
import {
  agoLabel,
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

    await actions.deletePerson(id);
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
        mut("people", "01PERSON00000002", { ...fields, dates: [{ kind: "birthday", label: "", month: 13, day: 1, year: null }] }, 4),
      ] as never);
      expect(bad.applied).toHaveLength(0);
    } finally {
      await client.close();
      await mongod.stop();
    }
  });
});
