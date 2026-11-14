import "server-only";
import { randomUUID } from "node:crypto";

/**
 * CalDAV (RFC 4791) over plain HTTPS for iCloud (2B.3): find the calendars, read events in a time
 * range, and create the "Orbit" calendar and its events. Signs in with the Apple ID and an
 * app-specific password (Basic auth over TLS). With CALENDAR_FAKE=1 an in-memory server stands in.
 */

export const ICLOUD_URL = "https://caldav.icloud.com";

export interface CaldavCreds {
  serverUrl: string;
  username: string;
  password: string;
}

export interface CaldavCalendar {
  url: string;
  name: string;
  color: string | null;
  /** Changes whenever anything in the calendar changes (Apple/CalendarServer extension). */
  ctag: string | null;
  readOnly: boolean;
}

export interface CaldavObject {
  href: string;
  etag: string | null;
  ics: string;
}

/** Wrong Apple ID or app-specific password (or the password was revoked). */
export class CaldavAuthFailed extends Error {}
export class CaldavNotFound extends Error {}

export interface CaldavApi {
  /** Signs in and finds where the user's calendars live. */
  discover(creds: CaldavCreds): Promise<{ homeUrl: string }>;
  listCalendars(creds: CaldavCreds, homeUrl: string): Promise<CaldavCalendar[]>;
  /** Events overlapping [from, to), with their iCalendar data. */
  listEvents(creds: CaldavCreds, calendarUrl: string, from: number, to: number): Promise<CaldavObject[]>;
  makeCalendar(creds: CaldavCreds, homeUrl: string, name: string, color: string): Promise<string>;
  /** Creates or replaces `<calendar>/<uid>.ics`. */
  putEvent(creds: CaldavCreds, calendarUrl: string, uid: string, ics: string): Promise<{ href: string }>;
  deleteEvent(creds: CaldavCreds, href: string): Promise<void>;
}

// ---------------------------------------------------------------- a small XML reader

interface XmlNode {
  name: string; // local name, lower case
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** Enough XML for WebDAV multistatus responses: elements by local name, text, CDATA. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith("<![CDATA[")) top.text += decode(m[0]);
    else if (m[0].startsWith("<!--") || m[0].startsWith("<?")) continue;
    else if (m[5] != null) top.text += decode(m[5]);
    else {
      const name = m[2].includes(":") ? m[2].split(":")[1] : m[2];
      if (m[1]) {
        if (stack.length > 1) stack.pop();
      } else {
        const attrs: Record<string, string> = {};
        for (const a of m[3].matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
          const key = a[1].includes(":") ? a[1].split(":")[1] : a[1];
          attrs[key.toLowerCase()] = decode(a[3] ?? a[4] ?? "");
        }
        const node: XmlNode = { name: name.toLowerCase(), attrs, children: [], text: "" };
        top.children.push(node);
        if (!m[4]) stack.push(node);
      }
    }
  }
  return root;
}

const all = (n: XmlNode, name: string): XmlNode[] =>
  n.children.flatMap((c) => (c.name === name ? [c, ...all(c, name)] : all(c, name)));
const first = (n: XmlNode, name: string) => all(n, name)[0];
const textOf = (n: XmlNode | undefined): string => (n ? (n.text + n.children.map(textOf).join("")).trim() : "");

// ---------------------------------------------------------------- real server

const auth = (c: CaldavCreds) => `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`;

async function dav(
  c: CaldavCreds,
  url: string,
  method: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: auth(c),
      ...(body ? { "Content-Type": "application/xml; charset=utf-8" } : {}),
      ...headers,
    },
    body,
    redirect: "follow",
  });
  if (res.status === 401 || res.status === 403) throw new CaldavAuthFailed(`${method} ${res.status}`);
  if (res.status === 404 || res.status === 410) throw new CaldavNotFound(`${method} ${url}`);
  if (!res.ok) throw new Error(`CalDAV ${method} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res;
}

const abs = (base: string, href: string) => new URL(href, base).toString();

const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
const PROPFIND_HOME = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">
  <d:prop>
    <d:resourcetype/><d:displayname/><cs:getctag/><a:calendar-color/>
    <c:supported-calendar-component-set/><d:current-user-privilege-set/>
  </d:prop>
</d:propfind>`;

const icsTime = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

const realCaldav: CaldavApi = {
  async discover(c) {
    const p = parseXml(await (await dav(c, c.serverUrl, "PROPFIND", PROPFIND_PRINCIPAL, { Depth: "0" })).text());
    const principal = textOf(first(first(p, "current-user-principal") ?? p, "href"));
    if (!principal) throw new Error("CalDAV: no principal");
    const principalUrl = abs(c.serverUrl, principal);
    const h = parseXml(await (await dav(c, principalUrl, "PROPFIND", PROPFIND_HOME, { Depth: "0" })).text());
    const home = textOf(first(first(h, "calendar-home-set") ?? h, "href"));
    if (!home) throw new Error("CalDAV: no calendar home");
    return { homeUrl: abs(principalUrl, home) };
  },
  async listCalendars(c, homeUrl) {
    const x = parseXml(await (await dav(c, homeUrl, "PROPFIND", PROPFIND_CALENDARS, { Depth: "1" })).text());
    const out: CaldavCalendar[] = [];
    for (const r of all(x, "response")) {
      const type = first(r, "resourcetype");
      if (!type || !first(type, "calendar")) continue;
      // Event calendars only (not reminder lists). No component set means it takes everything.
      const comps = all(r, "comp").map((n) => (n.attrs.name ?? "").toUpperCase());
      if (comps.length && !comps.includes("VEVENT")) continue;
      const privileges = all(r, "privilege").map((p) => p.children.map((ch) => ch.name).join(","));
      const writable = !privileges.length || privileges.some((p) => /write|all/.test(p));
      const color = textOf(first(r, "calendar-color"));
      out.push({
        url: abs(homeUrl, textOf(first(r, "href"))),
        name: textOf(first(r, "displayname")) || "Calendar",
        color: color ? color.slice(0, 7) : null,
        ctag: textOf(first(r, "getctag")) || null,
        readOnly: !writable,
      });
    }
    return out;
  },
  async listEvents(c, calendarUrl, from, to) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${icsTime(from)}" end="${icsTime(to)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
    const x = parseXml(await (await dav(c, calendarUrl, "REPORT", body, { Depth: "1" })).text());
    return all(x, "response")
      .map((r) => ({
        href: abs(calendarUrl, textOf(first(r, "href"))),
        etag: textOf(first(r, "getetag")) || null,
        ics: first(r, "calendar-data")?.text ?? "",
      }))
      .filter((o) => o.ics.includes("BEGIN:VCALENDAR"));
  },
  async makeCalendar(c, homeUrl, name, color) {
    const url = abs(homeUrl, `${randomUUID().toUpperCase()}/`);
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
  <d:set><d:prop>
    <d:displayname>${name.replace(/[<&]/g, "")}</d:displayname>
    <a:calendar-color>${color}</a:calendar-color>
    <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  </d:prop></d:set>
</c:mkcalendar>`;
    await dav(c, url, "MKCALENDAR", body);
    return url;
  },
  async putEvent(c, calendarUrl, uid, ics) {
    const href = abs(calendarUrl, `${encodeURIComponent(uid)}.ics`);
    await dav(c, href, "PUT", ics, { "Content-Type": "text/calendar; charset=utf-8" });
    return { href };
  },
  async deleteEvent(c, href) {
    try {
      await dav(c, href, "DELETE");
    } catch (err) {
      if (!(err instanceof CaldavNotFound)) throw err; // already gone
    }
  },
};

// ---------------------------------------------------------------- fake (tests)

type FakeDav = {
  /** Calendar url → { name, color, events by href }. */
  calendars: Map<
    string,
    { owner: string; name: string; color: string; readOnly: boolean; objects: Map<string, string> }
  >;
  version: number;
};
const g = globalThis as unknown as { __orbitFakeCaldav?: FakeDav };
/** One fake iCloud per test server; each Apple ID gets "Home" and "Family" with an event or two. */
export const fakeCaldavState: FakeDav = (g.__orbitFakeCaldav ??= { calendars: new Map(), version: 0 });

export const FAKE_PASSWORD = "abcd-efgh-ijkl-mnop";

function seedFake(user: string) {
  const home = `https://fake-caldav.example/${encodeURIComponent(user)}/calendars/`;
  if ([...fakeCaldavState.calendars.values()].some((c) => c.owner === user)) return home;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const ev = (uid: string, lines: string) =>
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261101T000000Z\r\n${lines}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  fakeCaldavState.calendars.set(`${home}home/`, {
    owner: user,
    name: "Home",
    color: "#34c759",
    readOnly: false,
    objects: new Map([
      [
        `${home}home/gym.ics`,
        ev("gym", `DTSTART:${day}T170000Z\r\nDTEND:${day}T180000Z\r\nSUMMARY:Gym\r\nRRULE:FREQ=DAILY;COUNT=5`),
      ],
    ]),
  });
  fakeCaldavState.calendars.set(`${home}family/`, {
    owner: user,
    name: "Family",
    color: "#ff2d55",
    readOnly: true,
    objects: new Map([
      [`${home}family/dinner.ics`, ev("dinner", `DTSTART;VALUE=DATE:${tomorrow}\r\nSUMMARY:Family dinner`)],
    ]),
  });
  return home;
}

const fakeCaldav: CaldavApi = {
  async discover(c) {
    if (c.password !== FAKE_PASSWORD) throw new CaldavAuthFailed("fake");
    return { homeUrl: seedFake(c.username) };
  },
  async listCalendars(c) {
    return [...fakeCaldavState.calendars.entries()]
      .filter(([, cal]) => cal.owner === c.username)
      .map(([url, cal]) => ({
        url,
        name: cal.name,
        color: cal.color,
        ctag: `${fakeCaldavState.version}:${[...cal.objects.values()].join("").length}`,
        readOnly: cal.readOnly,
      }));
  },
  async listEvents(_c, calendarUrl) {
    const cal = fakeCaldavState.calendars.get(calendarUrl);
    if (!cal) throw new CaldavNotFound(calendarUrl);
    return [...cal.objects.entries()].map(([href, ics]) => ({ href, etag: `"${ics.length}"`, ics }));
  },
  async makeCalendar(c, homeUrl, name, color) {
    const url = `${homeUrl}${randomUUID()}/`;
    fakeCaldavState.calendars.set(url, { owner: c.username, name, color, readOnly: false, objects: new Map() });
    fakeCaldavState.version++;
    return url;
  },
  async putEvent(_c, calendarUrl, uid, ics) {
    const cal = fakeCaldavState.calendars.get(calendarUrl);
    if (!cal) throw new CaldavNotFound(calendarUrl);
    const href = `${calendarUrl}${encodeURIComponent(uid)}.ics`;
    cal.objects.set(href, ics);
    fakeCaldavState.version++;
    return { href };
  },
  async deleteEvent(_c, href) {
    for (const cal of fakeCaldavState.calendars.values()) cal.objects.delete(href);
    fakeCaldavState.version++;
  },
};

export function caldav(): CaldavApi {
  return process.env.CALENDAR_FAKE === "1" ? fakeCaldav : realCaldav;
}
