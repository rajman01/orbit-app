import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agenda, eventFields, onDay } from "@/features/calendar/model";
import { decrypt, encrypt } from "@/lib/calendar/crypto";
import { fakeGoogleState } from "@/lib/calendar/google";
import { blockLinks } from "@/lib/calendar/blocks";
import { accounts, connectGoogle, disconnectAccount, markChannelDirty, syncAccount } from "@/lib/calendar/server";
import { applyMutations } from "@/lib/sync/server";

vi.mock("server-only", () => ({}));
process.env.CALENDAR_FAKE = "1";

describe("calendar secrets", () => {
  it("encrypt and decrypt round-trip; tampering is caught", () => {
    const sealed = encrypt("refresh-token-123");
    expect(sealed).not.toContain("refresh-token-123");
    expect(decrypt(sealed)).toBe("refresh-token-123");
    const bytes = Buffer.from(sealed, "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decrypt(bytes.toString("base64"))).toThrow();
  });
});

describe("calendar events", () => {
  it("maps timed, all-day, tentative and cancelled events", () => {
    expect(
      eventFields(
        {
          status: "confirmed",
          summary: " Standup ",
          start: { dateTime: "2026-11-16T09:30:00+01:00" },
          end: { dateTime: "2026-11-16T09:45:00+01:00" },
        },
        "cal1",
      ),
    ).toMatchObject({
      title: "Standup",
      allDay: false,
      start: Date.parse("2026-11-16T08:30:00Z"),
      end: Date.parse("2026-11-16T08:45:00Z"),
    });
    expect(
      eventFields({ status: "tentative", start: { date: "2026-11-20" }, end: { date: "2026-11-22" } }, "cal1"),
    ).toMatchObject({
      title: "(No title)",
      allDay: true,
      startDay: "2026-11-20",
      endDay: "2026-11-22",
      status: "tentative",
    });
    expect(
      eventFields({ status: "cancelled", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } }, "c"),
    ).toBeNull();
  });

  it("puts events on the right days in the user's timezone", () => {
    const late = {
      allDay: false,
      start: Date.parse("2026-11-16T23:30:00Z"),
      end: Date.parse("2026-11-17T00:30:00Z"),
      startDay: null,
      endDay: null,
      title: "Late call",
    };
    expect(onDay(late, "2026-11-16", "UTC")).toBe(true);
    expect(onDay(late, "2026-11-17", "UTC")).toBe(true);
    expect(onDay(late, "2026-11-16", "Africa/Lagos")).toBe(false); // 00:30–01:30 on the 17th there
    const trip = { allDay: true, start: 0, end: 0, startDay: "2026-11-20", endDay: "2026-11-22", title: "Trip" };
    expect(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map((d) => onDay(trip, d, "UTC"))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    const nine = {
      ...late,
      title: "Nine",
      start: Date.parse("2026-11-20T09:00:00Z"),
      end: Date.parse("2026-11-20T10:00:00Z"),
    };
    expect(agenda([nine, trip], "2026-11-20", "UTC").map((e) => e.title)).toEqual(["Trip", "Nine"]);
  });
});

describe("Google calendar sync (server, fake Google)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const userId = "user0000000001";
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    db = client.db(`cal${Math.random().toString(36).slice(2)}`);
  });
  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });

  const live = (coll: string, filter: object = {}) =>
    db
      .collection(coll)
      .find({ userId, deletedAt: null, ...filter })
      .toArray();

  it("connects, syncs calendars and events, follows changes, and forgets hidden calendars", async () => {
    const id = await connectGoogle(db, userId, {
      access_token: "a",
      refresh_token: "r",
      expires_in: 3600,
      id_token: `x.${Buffer.from(JSON.stringify({ email: "me@gmail.example" })).toString("base64url")}.x`,
    });
    const stored = (await accounts(db).findOne({ _id: id }))!;
    expect(stored.email).toBe("me@gmail.example");
    expect(stored.refreshToken).not.toBe("r"); // encrypted

    await syncAccount(db, stored);
    const cals = await live("calendars");
    expect(cals.map((c) => c.name).sort()).toEqual(["Personal", "Work"]);
    expect(cals.every((c) => c.selected)).toBe(true);
    expect((await live("calendarEvents")).map((e) => e.title).sort()).toEqual([
      "Lunch with Sam",
      "Mum's birthday",
      "Team standup",
    ]);

    // A change in Google: the standup moves, lunch is cancelled.
    const work = fakeGoogleState.events.get("work-cal")!;
    work[0] = { ...work[0], summary: "Team standup (moved)" };
    const personal = fakeGoogleState.events.get("primary-cal")!;
    personal[0] = { ...personal[0], status: "cancelled" };
    fakeGoogleState.version++;
    await syncAccount(db, (await accounts(db).findOne({ _id: id }))!);
    expect((await live("calendarEvents")).map((e) => e.title).sort()).toEqual([
      "Mum's birthday",
      "Team standup (moved)",
    ]);

    // Hide "Work": its events go.
    const workCal = cals.find((c) => c.name === "Work")!;
    await db.collection("calendars").updateOne({ _id: workCal._id }, { $set: { selected: false } });
    await syncAccount(db, (await accounts(db).findOne({ _id: id }))!);
    expect((await live("calendarEvents")).map((e) => e.title)).toEqual(["Mum's birthday"]);
  });

  it("devices can only choose which calendars to show, never write events", async () => {
    const cal = (await live("calendars"))[0];
    const event = (await live("calendarEvents"))[0];
    const m = (
      entity: "calendars" | "calendarEvents",
      entityId: string,
      fields: object,
      op: "upsert" | "delete" = "upsert",
    ) => ({
      mutationId: `m${Math.random().toString(36).slice(2, 14)}`,
      entity,
      entityId,
      op,
      fields: fields as Record<string, unknown>,
      clientTime: Date.now(),
    });
    const res = await applyMutations(db, userId, [
      m("calendars", String(cal._id), { selected: false }),
      m("calendars", String(cal._id), { name: "Renamed" }),
      m("calendarEvents", String(event._id), { title: "Hacked" }),
      m("calendarEvents", String(event._id), {}, "delete"),
    ]);
    expect(res.applied).toHaveLength(1);
    expect(res.rejected.map((r) => r.reason)).toEqual(["forbidden", "forbidden", "forbidden"]);
  });

  it("a push from Google marks its account for sync; disconnecting removes everything", async () => {
    const a = (await accounts(db).findOne({ userId }))!;
    await accounts(db).updateOne(
      { _id: a._id },
      {
        $set: {
          channels: { "primary-cal": { id: "chan1", token: "secret", resourceId: "r", expiration: Date.now() + 1e9 } },
        },
      },
    );
    expect(await markChannelDirty(db, "chan1", "wrong")).toBeNull();
    expect(await markChannelDirty(db, "chan1", "secret")).toBe(a._id);
    expect((await accounts(db).findOne({ _id: a._id }))!.dirty).toBe(true);

    expect(await disconnectAccount(db, userId, a._id)).toBe(true);
    expect(await accounts(db).countDocuments({ userId })).toBe(0);
    expect(await live("calendars")).toHaveLength(0);
    expect(await live("calendarEvents")).toHaveLength(0);
  });
  it("time blocks go to an Orbit calendar, and moves and deletes come back both ways", async () => {
    const user = "user0000000002";
    const id = await connectGoogle(db, user, {
      access_token: "fake-access-blocks",
      refresh_token: "fake-refresh-blocks",
      expires_in: 3600,
      id_token: `x.${Buffer.from(JSON.stringify({ email: "blocks@gmail.example" })).toString("base64url")}.x`,
    });
    const sync = async () => syncAccount(db, (await accounts(db).findOne({ _id: id }))!);
    const blocks = () => db.collection("timeBlocks").find({ userId: user, deletedAt: null }).toArray();
    const mutation = (entityId: string, fields: object | null) => ({
      mutationId: `m${Math.random().toString(36).slice(2, 14)}`,
      entity: "timeBlocks" as const,
      entityId,
      op: fields ? ("upsert" as const) : ("delete" as const),
      ...(fields ? { fields: fields as Record<string, unknown> } : {}),
      clientTime: Date.now(),
    });
    await sync();
    expect((await accounts(db).findOne({ _id: id }))!.orbitCalendarId ?? null).toBeNull(); // made only when needed

    // A block made on a device lands in a new "Orbit" calendar.
    const start = Date.parse("2026-11-20T09:00:00Z");
    await applyMutations(db, user, [
      mutation("block00000001", { taskId: null, title: "Write report", start, end: start + 3600_000 }),
    ]);
    await sync();
    const orbitCal = (await accounts(db).findOne({ _id: id }))!.orbitCalendarId!;
    expect(orbitCal).toBeTruthy();
    const events = () => fakeGoogleState.events.get(orbitCal)!.filter((e) => e.status !== "cancelled");
    expect(events().map((e) => [e.summary, e.start?.dateTime])).toEqual([["Write report", "2026-11-20T09:00:00.000Z"]]);
    const cal = await db.collection("calendars").findOne({ userId: user, isOrbit: true });
    expect(cal?.name).toBe("Orbit");
    await sync(); // nothing changed: nothing written again
    expect(fakeGoogleState.events.get(orbitCal)).toHaveLength(1);

    // Dragged in Google an hour later: the block moves in Orbit.
    const ev = events()[0];
    Object.assign(ev, {
      start: { dateTime: "2026-11-20T10:00:00.000Z" },
      end: { dateTime: "2026-11-20T11:30:00.000Z" },
      updated: new Date(Date.now() + 1000).toISOString(),
    });
    fakeGoogleState.version++;
    await new Promise((r) => setTimeout(r, 5));
    await sync();
    expect((await blocks()).map((b) => [b.start, b.end])).toEqual([
      [Date.parse("2026-11-20T10:00:00Z"), Date.parse("2026-11-20T11:30:00Z")],
    ]);

    // Moved in Orbit afterwards: Google follows.
    await new Promise((r) => setTimeout(r, 5));
    await applyMutations(db, user, [mutation("block00000001", { start: start + 7200_000, end: start + 10800_000 })]);
    await sync();
    expect(events()[0].start?.dateTime).toBe("2026-11-20T11:00:00.000Z");

    // An event added to the Orbit calendar in Google becomes a block of its own.
    fakeGoogleState.events.get(orbitCal)!.push({
      id: "ev-made-in-google",
      status: "confirmed",
      summary: "Deep work",
      start: { dateTime: "2026-11-21T08:00:00Z" },
      end: { dateTime: "2026-11-21T09:00:00Z" },
      updated: new Date().toISOString(),
    });
    fakeGoogleState.version++;
    await sync();
    expect((await blocks()).map((b) => b.title).sort()).toEqual(["Deep work", "Write report"]);
    // Orbit calendar events never show up as ordinary calendar events.
    expect(await db.collection("calendarEvents").countDocuments({ userId: user, title: "Deep work" })).toBe(0);

    // Deleted in Google: gone from Orbit. Deleted in Orbit: gone from Google.
    const deep = fakeGoogleState.events.get(orbitCal)!.find((e) => e.id === "ev-made-in-google")!;
    Object.assign(deep, { status: "cancelled", updated: new Date(Date.now() + 1000).toISOString() });
    fakeGoogleState.version++;
    await sync();
    expect((await blocks()).map((b) => b.title)).toEqual(["Write report"]);
    await applyMutations(db, user, [mutation("block00000001", null)]);
    await sync();
    expect(events()).toHaveLength(0);
    expect(await blocks()).toHaveLength(0);
    expect(await blockLinks(db).countDocuments({ userId: user })).toBe(0);
  });
});
