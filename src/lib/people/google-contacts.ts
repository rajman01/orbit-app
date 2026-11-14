import "server-only";
import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import type { PersonDate } from "@/lib/sync/entities";

/**
 * Phase 2C.3: a one-off import from Google Contacts (People API, read-only). Orbit asks for
 * `contacts.readonly` just for the import, reads the contacts, revokes the token straight away and
 * keeps the list for 15 minutes so the user can choose who to bring in. With CALENDAR_FAKE=1 a fixed
 * address book stands in (tests, no network).
 */

export const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
export const CONTACTS_STATE_COOKIE = "orbit_contacts_state";

interface GDate {
  year?: number;
  month?: number;
  day?: number;
}

/** The parts of a People API person Orbit reads. */
export interface GooglePerson {
  resourceName: string;
  names?: { displayName?: string; metadata?: { primary?: boolean } }[];
  birthdays?: { date?: GDate; metadata?: { primary?: boolean } }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
  emailAddresses?: { value?: string }[];
  events?: { date?: GDate; type?: string; formattedType?: string }[];
}

/** A contact as offered for import. */
export interface ImportedContact {
  googleId: string;
  name: string;
  phone: string | null;
  email: string | null;
  dates: PersonDate[];
}

const primaryFirst = <T extends { metadata?: { primary?: boolean } }>(list: T[] = []) =>
  [...list].sort((a, b) => Number(Boolean(b.metadata?.primary)) - Number(Boolean(a.metadata?.primary)));

function toDate(d: GDate | undefined, kind: PersonDate["kind"], label = ""): PersonDate | null {
  if (!d?.month || !d.day || d.month < 1 || d.month > 12 || d.day < 1 || d.day > 31) return null;
  const year = d.year && d.year >= 1800 && d.year <= 2200 ? d.year : null;
  return { kind, label: label.slice(0, 60), month: d.month, day: d.day, year };
}

/** Maps a Google contact to what Orbit keeps; null for contacts without a name. */
export function mapContact(p: GooglePerson): ImportedContact | null {
  const name = primaryFirst(p.names)[0]?.displayName?.trim().slice(0, 120);
  if (!name) return null;
  const dates: PersonDate[] = [];
  const birthday = primaryFirst(p.birthdays)
    .map((b) => toDate(b.date, "birthday"))
    .find((d) => d != null);
  if (birthday) dates.push(birthday);
  for (const e of p.events ?? []) {
    const anniversary = e.type?.toLowerCase() === "anniversary";
    const d = toDate(
      e.date,
      anniversary ? "anniversary" : "custom",
      anniversary ? "" : (e.formattedType ?? e.type ?? ""),
    );
    if (d && dates.length < 20) dates.push(d);
  }
  const phone = p.phoneNumbers?.find((n) => n.value?.trim());
  return {
    googleId: p.resourceName.slice(0, 200),
    name,
    phone: (phone?.canonicalForm ?? phone?.value)?.trim().slice(0, 40) || null,
    email:
      p.emailAddresses
        ?.find((e) => e.value?.trim())
        ?.value?.trim()
        .slice(0, 200) || null,
    dates,
  };
}

export interface ContactsApi {
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<string>;
  listContacts(accessToken: string): Promise<GooglePerson[]>;
  revoke(accessToken: string): Promise<void>;
}

const FIELDS = "names,birthdays,phoneNumbers,emailAddresses,events";
/** At most this many contacts are read (5 pages). */
const MAX_PAGES = 5;

const realContacts: ContactsApi = {
  authUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: CONTACTS_SCOPE,
      include_granted_scopes: "false",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },
  async exchangeCode(code, redirectUri) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error(`Google token ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  },
  async listContacts(token) {
    const out: GooglePerson[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const p = new URLSearchParams({ personFields: FIELDS, pageSize: "1000", sortOrder: "FIRST_NAME_ASCENDING" });
      if (pageToken) p.set("pageToken", pageToken);
      const res = await fetch(`https://people.googleapis.com/v1/people/me/connections?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Google People ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { connections?: GooglePerson[]; nextPageToken?: string };
      out.push(...(body.connections ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  },
  async revoke(token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(
      () => {},
    );
  },
};

/** The fake address book (CALENDAR_FAKE=1). */
export const FAKE_CONTACTS: GooglePerson[] = [
  {
    resourceName: "people/c1",
    names: [{ displayName: "Ada Lovelace", metadata: { primary: true } }],
    birthdays: [{ date: { year: 1815, month: 12, day: 10 } }],
    phoneNumbers: [{ value: "+44 20 7946 0000", canonicalForm: "+442079460000" }],
    emailAddresses: [{ value: "ada@example.com" }],
  },
  {
    resourceName: "people/c2",
    names: [{ displayName: "Grace Hopper" }],
    birthdays: [{ date: { month: 12, day: 9 } }],
    emailAddresses: [{ value: "grace@example.com" }],
  },
  {
    resourceName: "people/c3",
    names: [{ displayName: "Alan Turing" }],
    events: [
      { date: { year: 2010, month: 6, day: 23 }, type: "anniversary" },
      { date: { month: 3, day: 1 }, type: "graduation", formattedType: "Graduation" },
    ],
  },
  { resourceName: "people/c4", phoneNumbers: [{ value: "+1 555 0100" }] },
];

const fakeContacts: ContactsApi = {
  authUrl: (state, redirectUri) => `${redirectUri}?code=fake-contacts&state=${encodeURIComponent(state)}`,
  exchangeCode: async () => "fake-contacts-token",
  listContacts: async () => FAKE_CONTACTS,
  revoke: async () => {},
};

export function contactsApi(): ContactsApi {
  return process.env.CALENDAR_FAKE === "1" ? fakeContacts : realContacts;
}

export function contactsEnabled(): boolean {
  return process.env.CALENDAR_FAKE === "1" || Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ---------------------------------------------------------------- the short-lived list

const IMPORT_MINUTES = 15;

interface ImportDoc {
  _id: string;
  userId: string;
  contacts: ImportedContact[];
  expiresAt: Date;
}

const imports = (db: Db) => db.collection<ImportDoc>("contactImports");

/** Keeps the contacts for a few minutes (a TTL index removes them) and returns the import's id. */
export async function saveImport(db: Db, userId: string, contacts: ImportedContact[], now = Date.now()) {
  await imports(db)
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    .catch(() => {});
  const _id = randomBytes(16).toString("base64url");
  await imports(db).insertOne({ _id, userId, contacts, expiresAt: new Date(now + IMPORT_MINUTES * 60_000) });
  return _id;
}

/** The import's contacts, for its own user only, until it expires. */
export async function loadImport(db: Db, userId: string, id: string, now = Date.now()) {
  const doc = await imports(db).findOne({ _id: id, userId });
  return doc && doc.expiresAt.getTime() > now ? doc.contacts : null;
}

export async function deleteImport(db: Db, userId: string, id: string) {
  await imports(db).deleteOne({ _id: id, userId });
}

/** Reads the contacts with a fresh token and gives the token back to Google at once. */
export async function readContacts(api: ContactsApi, code: string, redirectUri: string): Promise<ImportedContact[]> {
  const token = await api.exchangeCode(code, redirectUri);
  try {
    const people = await api.listContacts(token);
    const mapped = people.map(mapContact).filter((c) => c != null);
    return mapped.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } finally {
    await api.revoke(token);
  }
}
