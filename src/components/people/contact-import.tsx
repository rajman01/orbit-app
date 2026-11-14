"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Spinner } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { usePeople } from "@/features/data";
import { dateLabel, formatPersonDate, type PersonDate } from "@/features/people/model";
import { PersonAvatar } from "./avatar";
import { colorFor } from "@/features/people/model";

interface Contact {
  googleId: string;
  name: string;
  phone: string | null;
  email: string | null;
  dates: PersonDate[];
}

/** Starts the one-off Google Contacts import (a full-page trip to Google and back). */
export const IMPORT_URL = "/api/people/google/connect";

/** Choose who to bring in from Google Contacts (people already imported are marked). */
export function ContactImport({ importId, onClose }: { importId: string | null; onClose: () => void }) {
  return (
    <Modal
      open={importId != null}
      onOpenChange={(o) => !o && onClose()}
      title="Import from Google Contacts"
      description="Tick who you want to keep close. Orbit doesn't stay connected to your contacts."
      width={520}
    >
      {importId ? <Body key={importId} importId={importId} onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ importId, onClose }: { importId: string; onClose: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const people = usePeople({ includeArchived: true });
  const [contacts, setContacts] = useState<Contact[] | null | "expired">(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/people/google/import?id=${encodeURIComponent(importId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { contacts: Contact[] }) => !cancelled && setContacts(b.contacts))
      .catch(() => !cancelled && setContacts("expired"));
    return () => {
      cancelled = true;
    };
  }, [importId]);

  const imported = useMemo(() => new Set((people ?? []).map((p) => p.googleId).filter(Boolean)), [people]);
  const list = Array.isArray(contacts) ? contacts : [];
  const q = query.trim().toLowerCase();
  const shown = list.filter((c) => !q || c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  const available = shown.filter((c) => !imported.has(c.googleId));
  const allChosen = available.length > 0 && available.every((c) => chosen.has(c.googleId));

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function importChosen() {
    setSaving(true);
    const picked = list.filter((c) => chosen.has(c.googleId) && !imported.has(c.googleId));
    for (const c of picked) {
      await actions.createPerson({
        name: c.name,
        phone: c.phone,
        email: c.email,
        dates: c.dates,
        googleId: c.googleId,
      });
    }
    void fetch(`/api/people/google/import?id=${encodeURIComponent(importId)}`, { method: "DELETE" });
    onClose();
    toast({ message: `Imported ${picked.length} ${picked.length === 1 ? "person" : "people"}` });
  }

  if (contacts === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-callout text-label-secondary">
        <Spinner /> Reading your contacts…
      </div>
    );
  }
  if (contacts === "expired") {
    return (
      <div className="flex flex-col items-start gap-3 pb-2">
        <p className="text-callout text-label-secondary">
          This list has expired (it&rsquo;s kept for 15 minutes). Import again to see your contacts.
        </p>
        <a href={IMPORT_URL} className="font-semibold text-accent-text">
          Import again
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-2">
      {list.length ? (
        <>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-tertiary" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts"
              aria-label="Search contacts"
              className="h-control w-full rounded-md bg-surface-sunken pr-3 pl-9 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <div className="flex items-center justify-between px-1 text-footnote text-label-secondary">
            <span className="tabular">
              {list.length} contact{list.length === 1 ? "" : "s"}
              {imported.size ? ` · ${list.filter((c) => imported.has(c.googleId)).length} already in Orbit` : ""}
            </span>
            {available.length ? (
              <button
                type="button"
                className="font-semibold text-accent-text"
                onClick={() =>
                  setChosen((s) => {
                    const next = new Set(s);
                    for (const c of available) {
                      if (allChosen) next.delete(c.googleId);
                      else next.add(c.googleId);
                    }
                    return next;
                  })
                }
              >
                {allChosen ? "Select none" : "Select all"}
              </button>
            ) : null}
          </div>
          <ul aria-label="Contacts" className="-mx-1 flex max-h-[50dvh] flex-col overflow-y-auto">
            {shown.map((c) => {
              const done = imported.has(c.googleId);
              const birthday = c.dates.find((d) => d.kind === "birthday");
              const detail = [
                birthday ? `${dateLabel(birthday)} ${formatPersonDate(birthday)}` : null,
                c.phone,
                c.email,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={c.googleId}>
                  <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fill has-[:disabled]:cursor-default has-[:disabled]:opacity-60 lg:min-h-11">
                    <input
                      type="checkbox"
                      disabled={done}
                      checked={done || chosen.has(c.googleId)}
                      onChange={() => toggle(c.googleId)}
                      aria-label={c.name}
                      className="size-5 shrink-0 accent-[var(--accent)]"
                    />
                    <PersonAvatar person={{ name: c.name, emoji: null, color: colorFor(c.name) }} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{c.name}</span>
                      {detail || done ? (
                        <span className="block truncate text-footnote text-label-secondary">
                          {done ? "Already in Orbit" : detail}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-callout text-label-secondary">No contacts with names were found in your Google account.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!chosen.size} loading={saving} onClick={() => void importChosen()}>
          {chosen.size ? `Import ${chosen.size}` : "Import"}
        </Button>
      </div>
    </div>
  );
}
