import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agenda, eventFields, onDay } from "@/features/calendar/model";
import { decrypt, encrypt } from "@/lib/calendar/crypto";
import { fakeGoogleState } from "@/lib/calendar/google";
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
});
