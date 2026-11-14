import "fake-indexeddb/auto";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { runCoachTool } from "@/features/coach/device";
import { undoAction } from "@/features/coach/write-tools";
import { openLocalDb } from "@/lib/local-db/db";
import {
  deleteImport,
  FAKE_CONTACTS,
  loadImport,
  mapContact,
  readContacts,
  saveImport,
  type ContactsApi,
} from "@/lib/people/google-contacts";
import { SyncEngine } from "@/lib/sync/engine";

vi.mock("server-only", () => ({}));

describe("Google Contacts import", () => {
  it("maps names, birthdays with and without a year, anniversaries and other dates", () => {
    const [ada, grace, alan, noName] = FAKE_CONTACTS.map(mapContact);
    expect(ada).toEqual({
      googleId: "people/c1",
      name: "Ada Lovelace",
      phone: "+442079460000",
      email: "ada@example.com",
      dates: [{ kind: "birthday", label: "", month: 12, day: 10, year: 1815 }],
    });
    expect(grace?.dates).toEqual([{ kind: "birthday", label: "", month: 12, day: 9, year: null }]);
    expect(alan?.dates).toEqual([
      { kind: "anniversary", label: "", month: 6, day: 23, year: 2010 },
      { kind: "custom", label: "Graduation", month: 3, day: 1, year: null },
    ]);
    expect(noName).toBeNull();
    // Primary name first; a birthday given only as text (no date) is skipped.
    expect(
      mapContact({
        resourceName: "people/x",
        names: [{ displayName: "Nick" }, { displayName: "Nicholas", metadata: { primary: true } }],
        birthdays: [{ date: { month: 0, day: 0 } }],
      }),
    ).toMatchObject({ name: "Nicholas", dates: [] });
  });

  it("reads the contacts, sorted, and always gives the token back", async () => {
    const revoke = vi.fn(async () => {});
    const api: ContactsApi = {
      authUrl: () => "",
      exchangeCode: async () => "tok",
      listContacts: async () => [...FAKE_CONTACTS].reverse(),
      revoke,
    };
    const list = await readContacts(api, "code", "https://x/cb");
    expect(list.map((c) => c.name)).toEqual(["Ada Lovelace", "Alan Turing", "Grace Hopper"]);
    expect(revoke).toHaveBeenCalledWith("tok");
    const failing = { ...api, listContacts: async () => Promise.reject(new Error("boom")) };
    await expect(readContacts(failing, "code", "https://x/cb")).rejects.toThrow("boom");
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it("keeps the list for its own user for 15 minutes", async () => {
    const mongod = await MongoMemoryServer.create();
    const client = await MongoClient.connect(mongod.getUri());
    try {
      const db = client.db("imports");
      const now = Date.now();
      const contacts = FAKE_CONTACTS.map(mapContact).filter((c) => c != null);
      const id = await saveImport(db, "u1", contacts, now);
      expect(await loadImport(db, "u1", id, now + 60_000)).toHaveLength(3);
      expect(await loadImport(db, "u2", id, now)).toBeNull();
      expect(await loadImport(db, "u1", id, now + 16 * 60_000)).toBeNull();
      await deleteImport(db, "u1", id);
      expect(await loadImport(db, "u1", id, now)).toBeNull();
    } finally {
      await client.close();
      await mongod.stop();
    }
  });
});

describe("coach people tools", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 16, 8));
  });
  afterEach(() => vi.useRealTimers());

  function setup() {
    const db = openLocalDb(`people-coach-${Math.random().toString(36).slice(2)}`);
    const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
    const actions = createActions(engine, "user0000000001");
    return {
      db,
      engine,
      actions,
      deps: { engine, db, actions, userId: "user0000000001", now: Date.now(), turn: { writes: 0 } },
    };
  }
  const json = (o: { content: string }) => JSON.parse(o.content);

  it("adds a person, logs a conversation with a follow-up, notes things, and Undo takes it back", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });

    const { id } = json(
      await runCoachTool(
        "add_person",
        { name: "Tunde Bakare", relationship: "friend", cadenceDays: 14, birthday: { month: 11, day: 23 } },
        deps,
      ),
    );
    expect(await db.people.get(id)).toMatchObject({
      name: "Tunde Bakare",
      cadenceDays: 14,
      dates: [{ kind: "birthday", month: 11, day: 23, year: null }],
    });
    const added = (await db.aiActions.toArray()).find((a) => a.tool === "add_person")!;
    expect(added.summary).toBe("Add “Tunde Bakare” to People");

    const people = json(await runCoachTool("get_people", {}, deps));
    expect(people.people).toMatchObject([
      { id, name: "Tunde Bakare", keepInTouch: "Every 2 weeks", lastInTouch: "never logged" },
    ]);
    expect(people.datesSoon).toMatchObject([{ personId: id, what: "Tunde's birthday", on: "2026-11-23", inDays: 7 }]);

    const logged = await runCoachTool(
      "log_interaction",
      {
        personId: id,
        type: "call",
        notes: "His new job starts Monday",
        followUp: { title: "Text Tunde good luck", scheduledDate: "2026-11-17" },
      },
      deps,
    );
    expect(logged.isError).toBeUndefined();
    const { followUpTaskId } = json(logged);
    expect(await db.tasks.get(followUpTaskId)).toMatchObject({
      personId: id,
      createdBy: "ai",
      scheduledDate: "2026-11-17",
    });
    const logAction = (await db.aiActions.toArray()).find((a) => a.tool === "log_interaction")!;
    expect(logAction.summary).toBe("Log: Call with “Tunde Bakare”, follow-up “Text Tunde good luck”");

    await runCoachTool("add_person_note", { personId: id, kind: "gift", text: "Jollof cookbook" }, deps);
    await runCoachTool(
      "update_person",
      { id, notes: "Moving to Abuja", birthday: { month: 11, day: 24, year: 1990 } },
      deps,
    );

    const p = json(await runCoachTool("get_person", { id }, deps));
    expect(p).toMatchObject({
      name: "Tunde Bakare",
      lastInTouch: "2026-11-16 (today)",
      notes: "Moving to Abuja",
      giftIdeas: ["Jollof cookbook"],
      dates: [{ what: "Tunde's birthday", date: "24 November 1990", next: "2026-11-24", turning: 36 }],
      recentInteractions: [{ date: "2026-11-16", type: "call", notes: "His new job starts Monday" }],
      openTasks: [{ title: "Text Tunde good luck" }],
    });

    // Future dates are refused; unknown people too.
    expect(
      (await runCoachTool("log_interaction", { personId: id, type: "call", date: "2026-11-20" }, deps)).isError,
    ).toBe(true);
    expect((await runCoachTool("get_person", { id: "01NOSUCHPERSON00" }, deps)).content).toBe("No such person.");

    // Undo the log: the interaction and the follow-up task go.
    await undoAction(engine, logAction.id);
    expect((await db.interactions.where("personId").equals(id).toArray()).every((i) => i.deletedAt)).toBe(true);
    expect((await db.tasks.get(followUpTaskId))?.deletedAt).toBeTypeOf("number");
    // Undo the add: the person goes.
    await undoAction(engine, added.id);
    expect((await db.people.get(id))?.deletedAt).toBeTypeOf("number");
  });
});
