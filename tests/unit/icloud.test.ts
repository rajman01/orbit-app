import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FAKE_PASSWORD, fakeCaldavState, parseXml } from "@/lib/calendar/caldav";
import { blockIcs, parseEvents } from "@/lib/calendar/ics";
import { accounts, connectCaldav, syncAccount } from "@/lib/calendar/server";
import { CaldavAuthFailed } from "@/lib/calendar/caldav";
import { applyMutations } from "@/lib/sync/server";

vi.mock("server-only", () => ({}));
process.env.CALENDAR_FAKE = "1";

const vcal = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const from = Date.parse("2026-11-01T00:00:00Z");
const to = Date.parse("2027-02-01T00:00:00Z");

describe("iCalendar events", () => {
  it("reads times in their own zone, all-day events, tentative and cancelled ones", () => {
    const evs = parseEvents(
      vcal(`BEGIN:VEVENT
UID:a
DTSTART;TZID=Europe/London:20261116T093000
DTEND;TZID=Europe/London:20261116T094500
SUMMARY:Standup
LOCATION:Room 4
STATUS:TENTATIVE
END:VEVENT
BEGIN:VEVENT
UID:b
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261122
SUMMARY:Trip
END:VEVENT
BEGIN:VEVENT
UID:c
DTSTART:20261121T100000Z
DTEND:20261121T110000Z
SUMMARY:Called off
STATUS:CANCELLED
END:VEVENT`),
      from,
      to,
      "UTC",
    );
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({
      title: "Standup",
      location: "Room 4",
      status: "tentative",
      allDay: false,
      start: Date.parse("2026-11-16T09:30:00Z"), // London is on UTC in November
    });
    expect(evs[1]).toMatchObject({ allDay: true, startDay: "2026-11-20", endDay: "2026-11-22" });
  });

  it("expands repeating events in the window, with exceptions and skipped days", () => {
    const evs = parseEvents(
      vcal(`BEGIN:VEVENT
UID:r
DTSTART;TZID=America/New_York:20200106T090000
DTEND;TZID=America/New_York:20200106T093000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=America/New_York:20261116T090000
SUMMARY:Weekly sync
END:VEVENT
BEGIN:VEVENT
UID:r
RECURRENCE-ID;TZID=America/New_York:20261123T090000
DTSTART;TZID=America/New_York:20261123T140000
DTEND;TZID=America/New_York:20261123T143000
SUMMARY:Weekly sync (moved)
END:VEVENT`),
      Date.parse("2026-11-09T00:00:00Z"),
      Date.parse("2026-12-01T00:00:00Z"),
      "UTC",
    );
    // An event that began in 2020: only the window's Mondays, the 16th skipped, the 23rd moved.
    expect(evs.map((e) => [e.title, new Date(e.start).toISOString()])).toEqual([
      ["Weekly sync", "2026-11-09T14:00:00.000Z"],
      ["Weekly sync (moved)", "2026-11-23T19:00:00.000Z"],
      ["Weekly sync", "2026-11-30T14:00:00.000Z"],
    ]);
    expect(new Set(evs.map((e) => e.key)).size).toBe(3);
  });

  it("writes a time block Orbit can read back", () => {
    const ics = blockIcs({
      id: "block00000001",
      title: "Write, then; edit",
      start: Date.parse("2026-11-20T09:00:00Z"),
      end: Date.parse("2026-11-20T10:30:00Z"),
    });
    const [e] = parseEvents(ics, from, to, "UTC");
    expect(e).toMatchObject({
      title: "Write, then; edit",
      start: Date.parse("2026-11-20T09:00:00Z"),
      end: Date.parse("2026-11-20T10:30:00Z"),
      orbitBlockId: "block00000001",
    });
  });
});

describe("CalDAV responses", () => {
  it("reads a multistatus with any namespace prefixes, attributes and escaped data", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:"><response><href>/123/calendars/home/</href><propstat><prop>
<resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
<displayname>Home &amp; Life</displayname>
<A:calendar-color xmlns:A="http://apple.com/ns/ical/">#34C759FF</A:calendar-color>
<C:supported-calendar-component-set xmlns:C="urn:ietf:params:xml:ns:caldav"><C:comp name="VEVENT"/></C:supported-calendar-component-set>
<C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav">BEGIN:VCALENDAR&#13;
SUMMARY:A &lt;b&gt;</C:calendar-data>
</prop></propstat></response></multistatus>`;
    const root = parseXml(xml);
    const find = (n: ReturnType<typeof parseXml>, name: string): ReturnType<typeof parseXml> | undefined =>
      n.name === name ? n : n.children.map((c) => find(c, name)).find(Boolean);
    expect(find(root, "displayname")?.text).toBe("Home & Life");
    expect(find(root, "comp")?.attrs.name).toBe("VEVENT");
    expect(find(root, "calendar")).toBeTruthy();
    expect(find(root, "calendar-data")?.text).toBe("BEGIN:VCALENDAR\r\nSUMMARY:A <b>");
  });
});

describe("iCloud sync (server, fake iCloud)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const userId = "user0000000009";
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    db = client.db(`icloud${Math.random().toString(36).slice(2)}`);
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

  it("refuses a wrong password, then syncs calendars and events; shared calendars start hidden", async () => {
    await expect(connectCaldav(db, userId, { username: "me@icloud.example", password: "wrong" })).rejects.toThrow(
      CaldavAuthFailed,
    );
    const id = await connectCaldav(db, userId, { username: "me@icloud.example", password: FAKE_PASSWORD });
    const stored = (await accounts(db).findOne({ _id: id }))!;
    expect(stored.password).not.toContain(FAKE_PASSWORD);
    await syncAccount(db, stored);
    expect((await accounts(db).findOne({ _id: id }))!.error).toBeNull();
    const cals = await live("calendars");
    expect(cals.map((c) => [c.name, c.selected, c.readOnly]).sort()).toEqual([
      ["Family", false, true],
      ["Home", true, false],
    ]);
    // "Gym" repeats daily five times, all inside the window.
    expect((await live("calendarEvents")).map((e) => e.title)).toEqual(["Gym", "Gym", "Gym", "Gym", "Gym"]);
  });

  it("time blocks go to an Orbit calendar in iCloud, and edits and deletes there come back", async () => {
    const id = (await accounts(db).findOne({ userId }))!._id;
    const sync = async () => syncAccount(db, (await accounts(db).findOne({ _id: id }))!);
    const start = Date.parse("2026-11-20T09:00:00Z");
    const m = (entityId: string, fields: object | null) => ({
      mutationId: `m${Math.random().toString(36).slice(2, 14)}`,
      entity: "timeBlocks" as const,
      entityId,
      op: fields ? ("upsert" as const) : ("delete" as const),
      ...(fields ? { fields: fields as Record<string, unknown> } : {}),
      clientTime: Date.now(),
    });
    await applyMutations(db, userId, [
      m("icblock000001", { taskId: null, title: "Plan trip", start, end: start + 3600_000 }),
    ]);
    await sync();
    const orbitUrl = (await accounts(db).findOne({ _id: id }))!.orbitCalendarId!;
    const orbit = fakeCaldavState.calendars.get(orbitUrl)!;
    expect(orbit.name).toBe("Orbit");
    expect([...orbit.objects.values()][0]).toContain("SUMMARY:Plan trip");
    expect((await live("calendars", { isOrbit: true })).map((c) => c.name)).toEqual(["Orbit"]);

    // Moved in the Calendar app on an iPhone: Orbit follows.
    const [href, ics] = [...orbit.objects.entries()][0];
    const later = new Date(Date.now() + 2000)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
    orbit.objects.set(
      href,
      ics
        .replace(/DTSTART:\d{8}T\d{6}Z/, "DTSTART:20261120T130000Z")
        .replace(/DTEND:\d{8}T\d{6}Z/, "DTEND:20261120T140000Z")
        .replace(/LAST-MODIFIED:\d{8}T\d{6}Z/, `LAST-MODIFIED:${later}`),
    );
    fakeCaldavState.version++;
    await sync();
    expect((await live("timeBlocks")).map((b) => new Date(b.start).toISOString())).toEqual([
      "2026-11-20T13:00:00.000Z",
    ]);

    // Deleted there: gone here.
    orbit.objects.delete(href);
    fakeCaldavState.version++;
    await sync();
    expect(await live("timeBlocks")).toHaveLength(0);
  });
});
