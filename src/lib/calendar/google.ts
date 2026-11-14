import "server-only";

/**
 * Google Calendar over plain HTTPS (no SDK): OAuth, calendar list, incremental event sync, push
 * channels. With CALENDAR_FAKE=1 a fixed in-memory calendar stands in (tests, no network).
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.app.created",
];

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole: string;
  deleted?: boolean;
}

export interface GoogleEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  transparency?: string;
  /** RFC 3339: when the event last changed (used for last-write-wins with Orbit). */
  updated?: string;
  extendedProperties?: { private?: Record<string, string> };
}

/** What Orbit writes for a time block. */
export interface EventBody {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  extendedProperties?: { private: Record<string, string> };
}

/** Thrown when an event or calendar is gone (404/410 on a single resource). */
export class GoogleNotFound extends Error {}

export interface EventPage {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

/** Thrown when a sync token is no longer valid (HTTP 410): start over with a full sync. */
export class SyncTokenExpired extends Error {}
/** Thrown when the refresh token was revoked or expired: the user must reconnect. */
export class GoogleAuthRevoked extends Error {}

export interface GoogleApi {
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens>;
  refresh(refreshToken: string): Promise<GoogleTokens>;
  listCalendars(accessToken: string): Promise<GoogleCalendar[]>;
  listEvents(
    accessToken: string,
    calendarId: string,
    opts: { syncToken?: string; pageToken?: string; timeMin: string; timeMax: string },
  ): Promise<EventPage>;
  watch(
    accessToken: string,
    calendarId: string,
    channel: { id: string; token: string; address: string },
  ): Promise<{ resourceId: string; expiration: number }>;
  stopChannel(accessToken: string, channelId: string, resourceId: string): Promise<void>;
  revoke(token: string): Promise<void>;
  /** Creates a secondary calendar owned by Orbit (scope calendar.app.created). */
  insertCalendar(accessToken: string, summary: string, timeZone: string): Promise<{ id: string }>;
  insertEvent(accessToken: string, calendarId: string, body: EventBody): Promise<GoogleEvent>;
  patchEvent(accessToken: string, calendarId: string, eventId: string, body: EventBody): Promise<GoogleEvent>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
}

const API = "https://www.googleapis.com/calendar/v3";

async function json<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = await res.text().catch(() => "");
  if (res.status === 410) throw new SyncTokenExpired(body);
  if (res.status === 401 || (res.status === 400 && body.includes("invalid_grant"))) throw new GoogleAuthRevoked(body);
  throw new Error(`Google ${res.status}: ${body.slice(0, 300)}`);
}

const realGoogle: GoogleApi = {
  authUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      // Always ask, so Google returns a refresh token even if Orbit was connected before.
      prompt: "consent",
      include_granted_scopes: "false",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },
  async exchangeCode(code, redirectUri) {
    return json(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }),
    );
  },
  async refresh(refreshToken) {
    return json(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          grant_type: "refresh_token",
        }),
      }),
    );
  },
  async listCalendars(accessToken) {
    const out: GoogleCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const p = new URLSearchParams({ maxResults: "250", ...(pageToken ? { pageToken } : {}) });
      const page = await json<{ items: GoogleCalendar[]; nextPageToken?: string }>(
        await fetch(`${API}/users/me/calendarList?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      );
      out.push(...page.items);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  },
  async listEvents(accessToken, calendarId, opts) {
    const p = new URLSearchParams({ singleEvents: "true", maxResults: "250", showDeleted: "true" });
    if (opts.pageToken) p.set("pageToken", opts.pageToken);
    if (opts.syncToken) p.set("syncToken", opts.syncToken);
    else {
      p.set("timeMin", opts.timeMin);
      p.set("timeMax", opts.timeMax);
    }
    return json(
      await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${p}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
  },
  async watch(accessToken, calendarId, channel) {
    const res = await json<{ resourceId: string; expiration: string }>(
      await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: channel.id, type: "web_hook", address: channel.address, token: channel.token }),
      }),
    );
    return { resourceId: res.resourceId, expiration: Number(res.expiration) };
  },
  async stopChannel(accessToken, channelId, resourceId) {
    await fetch(`${API}/channels/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: channelId, resourceId }),
    }).catch(() => {});
  },
  async revoke(token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(
      () => {},
    );
  },
  async insertCalendar(accessToken, summary, timeZone) {
    return json(
      await fetch(`${API}/calendars`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ summary, timeZone }),
      }),
    );
  },
  async insertEvent(accessToken, calendarId, body) {
    return one(
      await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async patchEvent(accessToken, calendarId, eventId, body) {
    return one(
      await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async deleteEvent(accessToken, calendarId, eventId) {
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok || res.status === 404 || res.status === 410) return; // already gone
    await json(res);
  },
};

/** A single resource: 404/410 means it's gone (not an expired sync token). */
async function one<T>(res: Response): Promise<T> {
  if (res.status === 404 || res.status === 410) throw new GoogleNotFound(await res.text().catch(() => ""));
  return json(res);
}

// ---------------------------------------------------------------- fake (tests)

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Two calendars; a few events around "today" (UTC). Tests can add or change events. Kept on
 * globalThis: Next bundles each route separately, and they must all see one fake Google.
 */
type FakeState = {
  calendars: (GoogleCalendar & { owner?: string })[];
  events: Map<string, GoogleEvent[]>;
  version: number;
  seq: number;
};
const g = globalThis as unknown as { __orbitFakeGoogle?: FakeState };
export const fakeGoogleState: FakeState = (g.__orbitFakeGoogle ??= {
  calendars: [
    { id: "primary-cal", summary: "Personal", backgroundColor: "#4285f4", primary: true, accessRole: "owner" },
    { id: "work-cal", summary: "Work", backgroundColor: "#0b8043", accessRole: "owner" },
  ],
  events: new Map(),
  version: 0,
  seq: 0,
});

function seedFakeEvents() {
  if (fakeGoogleState.events.size) return;
  const today = Date.parse(`${isoDay(Date.now())}T00:00:00Z`);
  const at = (d: number, h: number, m = 0) => new Date(today + d * DAY + (h * 60 + m) * 60_000).toISOString();
  fakeGoogleState.events.set("primary-cal", [
    {
      id: "ev-lunch",
      status: "confirmed",
      summary: "Lunch with Sam",
      start: { dateTime: at(0, 12, 30) },
      end: { dateTime: at(0, 13, 30) },
    },
    {
      id: "ev-bday",
      status: "confirmed",
      summary: "Mum's birthday",
      start: { date: isoDay(today + DAY) },
      end: { date: isoDay(today + 2 * DAY) },
    },
  ]);
  fakeGoogleState.events.set("work-cal", [
    {
      id: "ev-standup",
      status: "confirmed",
      summary: "Team standup",
      start: { dateTime: at(0, 9, 30) },
      end: { dateTime: at(0, 9, 45) },
    },
  ]);
}

const fakeGoogle: GoogleApi = {
  authUrl: (state, redirectUri) => `${redirectUri}?code=fake-code&state=${encodeURIComponent(state)}`,
  // Each connection gets its own tokens, so calendars Orbit creates stay with that account.
  exchangeCode: async () => ({
    access_token: `fake-access-${++fakeGoogleState.seq}`,
    refresh_token: `fake-refresh-${fakeGoogleState.seq}`,
    expires_in: 3600,
    id_token: `x.${Buffer.from(JSON.stringify({ email: "you@gmail.example" })).toString("base64url")}.x`,
  }),
  refresh: async (refreshToken) => ({ access_token: refreshToken.replace("refresh", "access"), expires_in: 3600 }),
  listCalendars: async (token) => fakeGoogleState.calendars.filter((c) => !c.owner || c.owner === token),
  async listEvents(_token, calendarId, opts) {
    seedFakeEvents();
    // A sync token from this fake is the version it was issued at; everything is returned again.
    if (opts.syncToken && opts.syncToken !== `v${fakeGoogleState.version}`) {
      return { items: fakeGoogleState.events.get(calendarId) ?? [], nextSyncToken: `v${fakeGoogleState.version}` };
    }
    if (opts.syncToken) return { items: [], nextSyncToken: opts.syncToken };
    return { items: fakeGoogleState.events.get(calendarId) ?? [], nextSyncToken: `v${fakeGoogleState.version}` };
  },
  watch: async () => ({ resourceId: "fake-resource", expiration: Date.now() + 7 * DAY }),
  stopChannel: async () => {},
  revoke: async () => {},
  async insertCalendar(token, summary) {
    const id = `orbit-cal-${++fakeGoogleState.seq}`;
    fakeGoogleState.calendars = [
      ...fakeGoogleState.calendars,
      { id, summary, backgroundColor: "#ff9500", accessRole: "owner", owner: token },
    ];
    fakeGoogleState.events.set(id, []);
    return { id };
  },
  async insertEvent(_token, calendarId, body) {
    const list = fakeGoogleState.events.get(calendarId);
    if (!list) throw new GoogleNotFound(calendarId);
    const e: GoogleEvent = {
      id: `ev${++fakeGoogleState.seq}`,
      status: "confirmed",
      updated: new Date().toISOString(),
      ...body,
    };
    list.push(e);
    fakeGoogleState.version++;
    return e;
  },
  async patchEvent(_token, calendarId, eventId, body) {
    const list = fakeGoogleState.events.get(calendarId) ?? [];
    const i = list.findIndex((e) => e.id === eventId && e.status !== "cancelled");
    if (i < 0) throw new GoogleNotFound(eventId);
    list[i] = { ...list[i], ...body, updated: new Date().toISOString() };
    fakeGoogleState.version++;
    return list[i];
  },
  async deleteEvent(_token, calendarId, eventId) {
    const list = fakeGoogleState.events.get(calendarId) ?? [];
    const i = list.findIndex((e) => e.id === eventId);
    if (i >= 0) list[i] = { ...list[i], status: "cancelled", updated: new Date().toISOString() };
    fakeGoogleState.version++;
  },
};

export function google(): GoogleApi {
  return process.env.CALENDAR_FAKE === "1" ? fakeGoogle : realGoogle;
}

/** The email in a Google id_token (it came straight from Google's token endpoint over TLS). */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
