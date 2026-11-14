"use client";

import { ArchiveRestore, ChevronRight, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { PersonAvatar } from "@/components/people/avatar";
import { PersonForm } from "@/components/people/person-form";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import { useInteractions, usePeople, type PersonDoc } from "@/features/data";
import {
  agoLabel,
  dateLabel,
  inDaysLabel,
  RELATIONSHIP_META,
  upcomingDates,
  type Relationship,
} from "@/features/people/model";
import { ReachOutRow, useReachOut } from "@/components/people/reach-out";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { RELATIONSHIPS } from "@/lib/sync/entities";

/** PRD §7.11 / §13: the people who matter, searchable and filtered by relationship. */
export function PeopleView() {
  const actions = useActions();
  const router = useRouter();
  const startNew = useSearchParams().get("new") === "1";
  const people = usePeople();
  const archived = (usePeople({ includeArchived: true }) ?? []).filter((p) => p.archivedAt != null);
  const interactions = useInteractions();
  const todayDay = useToday();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Relationship | null>(null);
  const [creating, setCreating] = useState(startNew);
  const reach = useReachOut() ?? [];
  const soon = useMemo(() => upcomingDates(people ?? [], todayDay, 30), [people, todayDay]);

  const lastByPerson = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of interactions ?? []) {
      const prev = map.get(i.personId);
      if (!prev || i.date > prev) map.set(i.personId, i.date);
    }
    return map;
  }, [interactions]);

  const present = RELATIONSHIPS.filter((r) => (people ?? []).some((p) => p.relationship === r));
  const q = query.trim().toLowerCase();
  const shown = (people ?? []).filter(
    (p) =>
      (!filter || p.relationship === filter) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.interests.some((i) => i.toLowerCase().includes(q)) ||
        p.notes.toLowerCase().includes(q)),
  );

  const closeForm = () => {
    setCreating(false);
    if (startNew) router.replace("/people");
  };

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Your close circle"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New person
          </Button>
        }
      />
      <PageBody>
        {people && !people.length ? (
          <EmptyState
            icon={Users}
            title="No one here yet"
            body="Add the people you want to stay close to. Orbit remembers birthdays, what you talked about and when you last caught up."
            action={<Button onClick={() => setCreating(true)}>Add someone</Button>}
          />
        ) : null}
        {people?.length ? (
          <div className="mb-3 flex flex-col gap-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-tertiary" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people"
                aria-label="Search people"
                className="h-control w-full rounded-md bg-surface-sunken pr-3 pl-9 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
            {present.length > 1 ? (
              <div
                className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0"
                role="radiogroup"
                aria-label="Relationship"
              >
                {[null, ...present].map((r) => (
                  <button
                    key={r ?? "all"}
                    type="button"
                    role="radio"
                    aria-checked={filter === r}
                    onClick={() => setFilter(r)}
                    className={cn(
                      "h-8 shrink-0 rounded-full px-3 text-footnote font-medium",
                      filter === r ? "bg-label text-bg" : "bg-fill text-label hover:bg-fill-strong",
                    )}
                  >
                    {r ? RELATIONSHIP_META[r].plural : "Everyone"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {!q && !filter && soon.length ? (
          <section aria-label="Coming up" className="mb-4">
            <SectionLabel count={soon.length}>Coming up</SectionLabel>
            <ul className="flex flex-col">
              {soon.map((u) => (
                <li key={`${u.person.id}:${u.index}`}>
                  <Link
                    href={`/person?id=${u.person.id}`}
                    className="flex min-h-11 items-center gap-3 rounded-md px-2 py-1 hover:bg-fill"
                  >
                    <PersonAvatar person={u.person} size={28} />
                    <span className="min-w-0 flex-1 truncate text-callout">
                      {u.person.name} · <span className="text-label-secondary">{dateLabel(u.date)}</span>
                      {u.turning != null && u.turning > 0 && u.date.kind === "birthday" ? (
                        <span className="text-label-secondary"> · turns {u.turning}</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-footnote tabular",
                        u.inDays <= 7 ? "font-semibold text-accent-text" : "text-label-secondary",
                      )}
                    >
                      {inDaysLabel(u.inDays)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!q && !filter && reach.length ? (
          <section aria-label="Due a catch-up" className="mb-4">
            <SectionLabel count={reach.length}>Due a catch-up</SectionLabel>
            <ul className="flex flex-col">
              {reach.map((r) => (
                <ReachOutRow key={r.person.id} item={r} todayDay={todayDay} />
              ))}
            </ul>
          </section>
        ) : null}
        {!q && !filter && (soon.length || reach.length) && shown.length ? (
          <SectionLabel count={shown.length}>Everyone</SectionLabel>
        ) : null}
        {people?.length && !shown.length ? (
          <p className="px-1 py-6 text-center text-callout text-label-secondary">No one matches.</p>
        ) : null}
        <ul aria-label="People" className="flex flex-col">
          {shown.map((p) => (
            <PersonRow key={p.id} person={p} last={lastByPerson.get(p.id) ?? null} todayDay={todayDay} />
          ))}
        </ul>
        {archived.length ? (
          <>
            <SectionLabel count={archived.length}>Archived</SectionLabel>
            <ul className="flex flex-col">
              {archived.map((p) => (
                <li key={p.id} className="flex min-h-row items-center gap-3 px-2 text-label-secondary">
                  <PersonAvatar person={p} size={28} className="opacity-60" />
                  <Link href={`/person?id=${p.id}`} className="min-w-0 flex-1 truncate hover:text-label">
                    {p.name}
                  </Link>
                  <IconButton
                    label={`Restore ${p.name}`}
                    icon={<ArchiveRestore className="size-4" />}
                    onClick={() => void actions.archivePerson(p.id, false)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </PageBody>
      <PersonForm open={creating} onClose={closeForm} />
    </>
  );
}

function PersonRow({ person, last, todayDay }: { person: PersonDoc; last: string | null; todayDay: string }) {
  const detail = [
    RELATIONSHIP_META[person.relationship].label,
    last ? `In touch ${agoLabel(last, todayDay).toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={`/person?id=${person.id}`}
        className="flex min-h-[52px] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-fill active:bg-fill-strong lg:min-h-11"
      >
        <PersonAvatar person={person} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium">{person.name}</span>
          <span className="block truncate text-footnote text-label-secondary">{detail}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-label-tertiary lg:hidden" />
      </Link>
    </li>
  );
}
