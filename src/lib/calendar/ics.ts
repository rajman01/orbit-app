import ICAL from "ical.js";
import { addDays, instantAt } from "@/lib/dates";

/**
 * iCalendar (RFC 5545) for CalDAV calendars (2B.3): reading events, with repeating events expanded
 * into the window, and writing time blocks. Shared with the subscription feed (2B.4).
 */

export interface IcsEvent {
  /** Stable per occurrence: the UID, plus the occurrence's original start for repeating events. */
  key: string;
  uid: string;
  title: string;
  location: string | null;
  allDay: boolean;
  start: number;
  end: number;
  startDay: string | null;
  endDay: string | null;
  status: "confirmed" | "tentative";
  /** LAST-MODIFIED (or DTSTAMP), for last-write-wins with Orbit. */
  updated: number | null;
  /** Set on events Orbit wrote for a time block. */
  orbitBlockId: string | null;
}

/** Repeats are expanded at most this far (a daily event over the 3-month window is ~100). */
const MAX_OCCURRENCES = 500;
/** …and stepped through at most this many times from the first one (a daily event since 1970). */
const MAX_STEPS = 25_000;

const validZone = (tz: string | null | undefined): tz is string => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayOfTime = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

/** An ICAL time as an instant: UTC as is, otherwise wall-clock time in its zone (or the fallback). */
function instant(t: ICAL.Time, tzid: string | null, fallbackTz: string): number {
  if (t.zone === ICAL.Timezone.utcTimezone) return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  const tz = validZone(tzid) ? tzid : fallbackTz;
  return instantAt(dayOfTime(t), `${pad(t.hour)}:${pad(t.minute)}`, tz) + t.second * 1000;
}

const tzidOf = (c: ICAL.Component, prop: string) => {
  const p = c.getFirstProperty(prop);
  const v = p?.getParameter("tzid");
  return typeof v === "string" ? v : null;
};

const text = (c: ICAL.Component, prop: string) => {
  const v = c.getFirstPropertyValue(prop);
  return typeof v === "string" ? v : null;
};

function updatedOf(c: ICAL.Component): number | null {
  const v = c.getFirstPropertyValue("last-modified") ?? c.getFirstPropertyValue("dtstamp");
  return v instanceof ICAL.Time ? v.toUnixTime() * 1000 : null;
}

/**
 * Events in one iCalendar object (a CalDAV resource) that overlap [from, to). Cancelled events and
 * occurrences are left out.
 */
export function parseEvents(ics: string, from: number, to: number, fallbackTz: string): IcsEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(ics));
  } catch {
    return [];
  }
  const vevents = root.name === "vevent" ? [root] : root.getAllSubcomponents("vevent");
  const masters = vevents.filter((v) => !v.hasProperty("recurrence-id"));
  const exceptions = vevents.filter((v) => v.hasProperty("recurrence-id"));
  const out: IcsEvent[] = [];

  const add = (
    item: ICAL.Component,
    s: ICAL.Time,
    e: ICAL.Time | null,
    key: string,
    master: ICAL.Component,
    zone: string | null = tzidOf(item, "dtstart"),
  ) => {
    if ((text(item, "status") ?? "").toUpperCase() === "CANCELLED") return;
    const uid = text(master, "uid") ?? key;
    const base = {
      key,
      uid,
      title: (text(item, "summary") ?? "").trim().slice(0, 500) || "(No title)",
      location: text(item, "location")?.trim().slice(0, 500) || null,
      status:
        (text(item, "status") ?? "").toUpperCase() === "TENTATIVE" ? ("tentative" as const) : ("confirmed" as const),
      updated: updatedOf(item),
      orbitBlockId: text(item, "x-orbit-block-id") ?? text(master, "x-orbit-block-id"),
    };
    if (s.isDate) {
      const startDay = dayOfTime(s);
      const endDay = e && e.isDate && dayOfTime(e) > startDay ? dayOfTime(e) : addDays(startDay, 1);
      const start = Date.parse(`${startDay}T00:00:00Z`);
      const end = Date.parse(`${endDay}T00:00:00Z`);
      if (end <= from - 86_400_000 || start >= to + 86_400_000) return;
      out.push({ ...base, allDay: true, startDay, endDay, start, end });
      return;
    }
    const start = instant(s, zone, fallbackTz);
    const end = e ? instant(e, tzidOf(item, "dtend") ?? zone, fallbackTz) : start;
    if (end < from || start >= to) return;
    out.push({ ...base, allDay: false, startDay: null, endDay: null, start, end: Math.max(end, start) });
  };

  for (const m of masters) {
    const event = new ICAL.Event(m);
    const uid = text(m, "uid") ?? "";
    if (!event.isRecurring()) {
      add(m, event.startDate, event.endDate, uid, m);
      continue;
    }
    for (const x of exceptions) if (text(x, "uid") === uid) event.relateException(x);
    const masterTz = tzidOf(m, "dtstart");
    const it = event.iterator();
    // Old repeating events start long before the window: step through quickly, keep only what's in it.
    let kept = 0;
    for (let i = 0, t = it.next(); t && i < MAX_STEPS && kept < MAX_OCCURRENCES; i++, t = it.next()) {
      const d = event.getOccurrenceDetails(t);
      const own = d.item.component === m;
      // Occurrences of the main event lose their zone in ical.js: use the event's own.
      const tz = own ? masterTz : tzidOf(d.item.component, "dtstart");
      const s = d.startDate;
      const startMs = s.isDate ? Date.parse(`${dayOfTime(s)}T00:00:00Z`) : instant(s, tz, fallbackTz);
      if (startMs >= to + 86_400_000) break;
      if (startMs < from - 400 * 86_400_000) continue; // far too early to overlap
      const before = out.length;
      add(d.item.component, s, d.endDate, `${uid}@${d.recurrenceId.toString()}`, m, tz);
      kept += out.length - before;
    }
  }
  // Exceptions whose main event isn't in this object (servers may send them alone).
  for (const x of exceptions) {
    const uid = text(x, "uid") ?? "";
    if (masters.some((m) => text(m, "uid") === uid)) continue;
    const ev = new ICAL.Event(x);
    add(x, ev.startDate, ev.endDate, `${uid}@${ev.recurrenceId?.toString() ?? ""}`, x);
  }
  return out;
}

const utc = (ms: number) => ICAL.Time.fromJSDate(new Date(ms), true);

/** A time block as an iCalendar object. */
export function blockIcs(block: { id: string; title: string; start: number; end: number }, now = Date.now()): string {
  const cal = new ICAL.Component(["vcalendar", [], []]);
  cal.addPropertyWithValue("version", "2.0");
  cal.addPropertyWithValue("prodid", "-//Orbit//Time blocks//EN");
  const ev = new ICAL.Component("vevent");
  ev.addPropertyWithValue("uid", blockUid(block.id));
  ev.addPropertyWithValue("dtstamp", utc(now));
  ev.addPropertyWithValue("last-modified", utc(now));
  ev.addPropertyWithValue("dtstart", utc(block.start));
  ev.addPropertyWithValue("dtend", utc(block.end));
  ev.addPropertyWithValue("summary", block.title);
  ev.addPropertyWithValue("description", "Time blocked in Orbit.");
  ev.addPropertyWithValue("x-orbit-block-id", block.id);
  cal.addSubcomponent(ev);
  return cal.toString().replace(/\r?\n/g, "\r\n") + "\r\n";
}

export const blockUid = (blockId: string) => `${blockId}@orbit`;
