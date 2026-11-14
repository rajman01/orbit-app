import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { dayFit, firstFit, formatMinutes, freeSlots, spanMinutes } from "@/features/calendar/model";
import { runCoachTool } from "@/features/coach/device";
import { undoAction } from "@/features/coach/write-tools";
import { feedIcs, parseEvents } from "@/lib/calendar/ics";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

vi.mock("server-only", () => ({}));

const at = (hhmm: string, day = "2026-11-16") => Date.parse(`${day}T${hhmm}:00Z`);
const WH = { start: "09:00", end: "17:00" };

describe("free time (CAL-5)", () => {
  it("is working hours around events, from now on today, without slivers", () => {
    const busy = [
      { start: at("09:30"), end: at("10:00") },
      { start: at("10:05"), end: at("11:00") }, // leaves a 5-minute gap: not free time
      { start: at("12:30"), end: at("13:30") },
      { start: at("16:30"), end: at("18:00") },
    ];
    const slots = freeSlots("2026-11-16", "UTC", WH, busy);
    expect(
      slots.map((s) => [new Date(s.start).toISOString().slice(11, 16), new Date(s.end).toISOString().slice(11, 16)]),
    ).toEqual([
      ["09:00", "09:30"],
      ["11:00", "12:30"],
      ["13:30", "16:30"],
    ]);
    expect(spanMinutes(slots)).toBe(300);
    // At 14:02, only what's left: from 14:05.
    expect(spanMinutes(freeSlots("2026-11-16", "UTC", WH, busy, at("14:02")))).toBe(145);
    // In Lagos (UTC+1) working hours start at 08:00 UTC.
    expect(freeSlots("2026-11-16", "Africa/Lagos", WH, [])[0].start).toBe(at("08:00"));
    expect(formatMinutes(195)).toBe("3h 15m");
  });

  it("first fit starts on a quarter hour where the whole block fits", () => {
    const slots = [
      { start: at("09:05"), end: at("09:50") },
      { start: at("11:00"), end: at("12:30") },
    ];
    expect(firstFit(slots, 30)).toEqual({ start: at("09:15"), end: at("09:45") });
    expect(firstFit(slots, 60)).toEqual({ start: at("11:00"), end: at("12:00") });
    expect(firstFit(slots, 120)).toBeNull();
  });

  it("says when the Must-dos don't fit; their own blocks don't count against them", () => {
    const base = {
      day: "2026-11-16",
      timezone: "UTC",
      workingHours: WH,
      events: [
        { start: at("09:00"), end: at("12:00"), allDay: false },
        { start: at("13:00"), end: at("16:00"), allDay: false },
        { start: 0, end: 0, allDay: true },
      ],
      now: at("07:00"),
    };
    const mustDos = [
      { id: "a", effort: 3 }, // 1½h
      { id: "b", effort: 2 }, // 1h
    ];
    const fit = dayFit({ ...base, blocks: [], mustDos });
    expect([fit.free, fit.need, fit.fits]).toEqual([120, 150, false]);
    // A block for Must-do "a" is its time, not something in the way; another block is.
    const withOwn = dayFit({ ...base, blocks: [{ start: at("12:00"), end: at("13:00"), taskId: "a" }], mustDos });
    expect(withOwn.free).toBe(120);
    const withOther = dayFit({ ...base, blocks: [{ start: at("12:00"), end: at("13:00"), taskId: "x" }], mustDos });
    expect(withOther.free).toBe(60);
    expect(dayFit({ ...base, blocks: [], mustDos: [{ id: "a", effort: 1 }] }).fits).toBe(true);
  });
});

describe("calendar feed (CAL-3)", () => {
  it("has time blocks and dated tasks as all-day events that don't make you busy", () => {
    const ics = feedIcs(
      [{ id: "block00000001", title: "Deep work", start: at("09:00"), end: at("10:30") }],
      [
        { id: "task00000001", title: "Send invoice", day: "2026-11-17", due: true },
        { id: "task00000002", title: "Call the bank", day: "2026-11-18", due: false },
      ],
    );
    expect(ics).toContain("X-WR-CALNAME:Orbit");
    expect(ics).toContain("TRANSP:TRANSPARENT");
    const events = parseEvents(ics, at("00:00", "2026-11-01"), at("00:00", "2026-12-01"), "UTC");
    expect(events.map((e) => [e.title, e.allDay ? e.startDay : new Date(e.start).toISOString()])).toEqual([
      ["Deep work", "2026-11-16T09:00:00.000Z"],
      ["Due: Send invoice", "2026-11-17"],
      ["Call the bank", "2026-11-18"],
    ]);
  });
});

describe("the coach and the calendar (2B.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 16, 8));
  });
  afterEach(() => vi.useRealTimers());

  function setup() {
    const db = openLocalDb(`cal-coach-${Math.random().toString(36).slice(2)}`);
    const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
    const actions = createActions(engine, "user0000000001");
    return {
      db,
      engine,
      actions,
      deps: { engine, db, actions, userId: "user0000000001", now: Date.now(), turn: { writes: 0 } },
    };
  }

  it("reads availability, blocks time in a free slot, moves it, and Undo takes it back", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    await engine.create(
      "calendars",
      {
        accountId: "acct",
        provider: "google",
        name: "Work",
        color: "#00f",
        selected: true,
        isOrbit: false,
        readOnly: false,
      },
      "calendar000001",
    );
    await engine.create("calendarEvents", {
      calendarId: "calendar000001",
      title: "Standup",
      start: at("09:00"),
      end: at("09:30"),
      allDay: false,
      startDay: null,
      endDay: null,
      location: null,
      status: "confirmed",
      link: null,
    });
    const taskId = await actions.createTask({ title: "Write report", status: "todo", effort: 3 });
    await actions.setMustDo((await db.tasks.get(taskId))!, "2026-11-16", true);

    const a = JSON.parse((await runCoachTool("get_calendar_availability", {}, deps)).content);
    expect(a.calendarsConnected).toBe(true);
    expect(a.days[0]).toMatchObject({
      date: "2026-11-16",
      events: [{ title: "Standup", time: "09:00–09:30", calendar: "Work" }],
      free: ["09:30–17:00"],
      freeMinutes: 450,
      mustDos: { needMinutes: 90, fit: true },
    });

    const out = await runCoachTool(
      "create_time_block",
      { taskId, date: "2026-11-16", start: "10:00", minutes: 90 },
      deps,
    );
    expect(out.isError).toBeUndefined();
    const { id } = JSON.parse(out.content);
    expect((await db.timeBlocks.get(id))!).toMatchObject({
      taskId,
      title: "Write report",
      start: at("10:00"),
      end: at("11:30"),
    });
    const created = (await db.aiActions.toArray()).find((x) => x.tool === "create_time_block")!;
    expect(created.summary).toBe("Block 10:00–11:30 today for “Write report”");

    await runCoachTool("move_time_block", { id, start: "14:00" }, deps);
    expect((await db.timeBlocks.get(id))!).toMatchObject({ start: at("14:00"), end: at("15:30") });
    const again = JSON.parse((await runCoachTool("get_calendar_availability", {}, deps)).content);
    expect(again.days[0].timeBlocks).toEqual([{ id, title: "Write report", taskId, time: "14:00–15:30" }]);

    const moved = (await db.aiActions.toArray()).find((x) => x.tool === "move_time_block")!;
    await undoAction(engine, moved.id);
    expect((await db.timeBlocks.get(id))!.start).toBe(at("10:00"));
    await undoAction(engine, created.id);
    expect((await db.timeBlocks.get(id))!.deletedAt).not.toBeNull();
  });
});
