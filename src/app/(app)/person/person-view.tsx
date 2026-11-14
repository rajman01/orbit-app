"use client";

import {
  Archive,
  ArchiveRestore,
  Cake,
  CalendarHeart,
  Gift,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody } from "@/components/app/app-shell";
import { useCommands } from "@/components/app/commands";
import { EmptyState } from "@/components/app/empty-state";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { PersonAvatar } from "@/components/people/avatar";
import { LogInteraction } from "@/components/people/log-interaction";
import { PersonForm } from "@/components/people/person-form";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Picker } from "@/components/ui/picker";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import {
  useAllTasks,
  useInteractions,
  usePerson,
  usePersonItems,
  type InteractionDoc,
  type PersonDoc,
  type PersonItemDoc,
} from "@/features/data";
import {
  agoLabel,
  CADENCES,
  cadenceLabel,
  dateLabel,
  formatPersonDate,
  inDaysLabel,
  INTERACTION_META,
  lastInTouch,
  RELATIONSHIP_META,
  upcomingDate,
  whatsappLink,
  type InteractionType,
} from "@/features/people/model";
import { isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";

export function PersonView() {
  const id = useSearchParams().get("id");
  const person = usePerson(id);
  if (person === undefined) return null;
  if (!person) {
    return (
      <EmptyState
        icon={Users}
        title="Person not found"
        body="They may have been deleted on another device."
        action={
          <Link href="/people" className="font-semibold text-accent-text">
            Back to people
          </Link>
        }
      />
    );
  }
  return <PersonDetail key={person.id} person={person} />;
}

const TYPE_ICON: Record<InteractionType, typeof Phone> = {
  call: Phone,
  text: MessageSquare,
  in_person: Users,
  other: CalendarHeart,
};

function PersonDetail({ person }: { person: PersonDoc }) {
  const actions = useActions();
  const router = useRouter();
  const toast = useToast();
  const { openQuickAdd } = useCommands();
  const todayDay = useToday();
  const interactions = useInteractions(person.id) ?? [];
  const items = usePersonItems(person.id) ?? [];
  const tasks = (useAllTasks() ?? []).filter((t) => t.personId === person.id && !t.parentTaskId);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState<InteractionDoc | "new" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState(person.notes);
  const [showDone, setShowDone] = useState(false);

  const last = lastInTouch(interactions);
  const dates = person.dates
    .map((d) => upcomingDate(d, todayDay))
    .sort((a, b) => a.inDays - b.inDays);
  const openTasks = tasks.filter(isOpen);
  const contact = [
    person.phone ? { label: "Call", href: `tel:${person.phone}`, icon: Phone } : null,
    person.whatsapp || person.phone
      ? { label: "WhatsApp", href: whatsappLink(person.whatsapp || person.phone!), icon: MessageCircle }
      : null,
    person.email ? { label: "Email", href: `mailto:${person.email}`, icon: Mail } : null,
  ].filter((c) => c != null);

  return (
    <>
      <header className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-2 lg:px-6 lg:pt-8">
        <div className="flex items-center justify-between gap-2">
          <nav className="flex items-center gap-1 text-footnote text-label-secondary" aria-label="Breadcrumb">
            <Link href="/people" className="hover:text-label">
              People
            </Link>
            <span aria-hidden>›</span>
            <span>{RELATIONSHIP_META[person.relationship].label}</span>
          </nav>
          <div className="flex items-center gap-1">
            <span className="lg:hidden">
              <SyncIndicator />
            </span>
            <IconButton label="Edit person" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} />
            <Menu
              trigger={<IconButton label="Person actions" icon={<MoreHorizontal className="size-4" />} />}
              align="end"
            >
              {person.archivedAt ? (
                <MenuItem icon={<ArchiveRestore />} onSelect={() => void actions.archivePerson(person.id, false)}>
                  Restore
                </MenuItem>
              ) : (
                <MenuItem
                  icon={<Archive />}
                  onSelect={() => {
                    void actions.archivePerson(person.id, true);
                    toast({ message: `${person.name} archived` });
                  }}
                >
                  Archive
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} destructive onSelect={() => setDeleting(true)}>
                Delete person…
              </MenuItem>
            </Menu>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <PersonAvatar person={person} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-display">{person.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {person.archivedAt ? <Pill>Archived</Pill> : null}
              <Picker
                label="Keep in touch"
                value={person.cadenceDays}
                options={[
                  ...CADENCES.map((c) => ({ value: c.days, label: c.label })),
                  ...(CADENCES.some((c) => c.days === person.cadenceDays)
                    ? []
                    : [{ value: person.cadenceDays, label: cadenceLabel(person.cadenceDays) }]),
                ]}
                onChange={(d) => void actions.updatePerson(person.id, { cadenceDays: d })}
                trigger={
                  <button type="button" aria-label="Keep in touch" className="rounded-full">
                    <Pill tone={person.cadenceDays ? "accent" : "neutral"}>
                      {person.cadenceDays ? cadenceLabel(person.cadenceDays) : "No catch-up reminder"}
                    </Pill>
                  </button>
                }
              />
              <span className="text-footnote text-label-secondary">
                {last ? `Last in touch ${agoLabel(last, todayDay).toLowerCase()}` : "Nothing logged yet"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button icon={<Plus className="size-4" />} onClick={() => setLogging("new")}>
            Log
          </Button>
          {contact.map((c) => (
            <a
              key={c.label}
              href={c.href}
              target={c.href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="inline-flex h-control items-center gap-2 rounded-md bg-fill px-4 text-body font-semibold hover:bg-fill-strong"
            >
              <c.icon className="size-4" /> {c.label}
            </a>
          ))}
        </div>
      </header>

      <PageBody>
        <div className="mt-4 grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <SectionLabel>Notes</SectionLabel>
            <textarea
              aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== person.notes && void actions.updatePerson(person.id, { notes })}
              placeholder="What's going on in their life, what they care about…"
              className="field-sizing-content min-h-16 w-full resize-none rounded-md bg-transparent px-1 py-1 text-callout outline-none placeholder:text-label-tertiary focus-visible:bg-surface-sunken focus-visible:px-3"
            />

            <ItemList
              personId={person.id}
              kind="remember"
              title="Things to remember"
              placeholder="e.g. Allergic to peanuts"
              items={items.filter((i) => i.kind === "remember")}
            />
            <ItemList
              personId={person.id}
              kind="gift"
              title="Gift ideas"
              placeholder="e.g. A book on jazz"
              items={items.filter((i) => i.kind === "gift")}
            />

            <div className="mt-6 mb-1 flex items-center justify-between">
              <SectionLabel count={openTasks.length}>Tasks</SectionLabel>
              {tasks.length > openTasks.length ? (
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  className="text-footnote font-medium text-accent-text"
                >
                  {showDone ? "Hide done" : "Show done"}
                </button>
              ) : null}
            </div>
            <TaskList tasks={showDone ? tasks : openTasks} label={`Tasks about ${person.name}`} />
            <button
              type="button"
              onClick={() => openQuickAdd({ personId: person.id, areaId: person.areaId, status: "todo" })}
              className="mt-1 flex h-row w-full items-center gap-2 rounded-md px-3 text-body text-label-tertiary hover:bg-fill"
            >
              <Plus className="size-4" /> Add a task
            </button>

            <SectionLabel count={interactions.length}>Log</SectionLabel>
            {interactions.length ? (
              <ol aria-label="Log" className="flex flex-col">
                {interactions.map((i) => {
                  const Icon = TYPE_ICON[i.type];
                  return (
                    <li key={i.id} className="group flex gap-3 rounded-md px-2 py-2 hover:bg-fill">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-fill text-label-secondary">
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-callout">
                          <span className="font-medium">{INTERACTION_META[i.type].verb}</span>{" "}
                          <span className="text-label-secondary">· {dayLabel(i.date, todayDay)}</span>
                        </p>
                        {i.notes ? (
                          <p className="mt-0.5 text-callout whitespace-pre-wrap text-label-secondary">{i.notes}</p>
                        ) : null}
                      </div>
                      <Menu
                        trigger={
                          <IconButton
                            label="Entry actions"
                            icon={<MoreHorizontal className="size-4" />}
                            className="opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                          />
                        }
                        align="end"
                      >
                        <MenuItem icon={<Pencil />} onSelect={() => setLogging(i)}>
                          Edit
                        </MenuItem>
                        <MenuItem icon={<Trash2 />} destructive onSelect={() => void actions.deleteInteraction(i.id)}>
                          Delete
                        </MenuItem>
                      </Menu>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="px-1 py-2 text-callout text-label-secondary">
                Log calls, messages and catch-ups to keep track of when you last spoke.
              </p>
            )}
          </div>

          {/* Phones: dates and contact details first, like a contact card. */}
          <aside className="order-first mb-2 min-w-0 lg:order-none lg:mb-0">
            <SectionLabel>Dates</SectionLabel>
            {dates.length ? (
              <ul className="flex flex-col gap-1">
                {dates.map((u, n) => {
                  const Icon = u.date.kind === "birthday" ? Cake : CalendarHeart;
                  return (
                    <li key={n} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                      <Icon className="size-4 shrink-0 text-label-secondary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-callout font-medium">{dateLabel(u.date)}</p>
                        <p className="text-footnote text-label-secondary">
                          {formatPersonDate(u.date)}
                          {u.turning != null && u.turning > 0
                            ? u.date.kind === "birthday"
                              ? ` · turns ${u.turning}`
                              : ` · ${u.turning} years`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-footnote tabular",
                          u.inDays <= 7 ? "font-semibold text-accent-text" : "text-label-secondary",
                        )}
                      >
                        {inDaysLabel(u.inDays)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex h-row items-center gap-2 rounded-md px-2 text-callout text-label-tertiary hover:bg-fill"
              >
                <Plus className="size-4" /> Add birthday
              </button>
            )}

            {person.howWeMet || person.interests.length || person.email || person.phone ? (
              <>
                <SectionLabel>About</SectionLabel>
                <dl className="flex flex-col gap-2 px-2 text-callout">
                  {person.howWeMet ? (
                    <div>
                      <dt className="text-footnote text-label-secondary">How you met</dt>
                      <dd className="whitespace-pre-wrap">{person.howWeMet}</dd>
                    </div>
                  ) : null}
                  {person.interests.length ? (
                    <div>
                      <dt className="text-footnote text-label-secondary">Interests</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {person.interests.map((i) => (
                          <Pill key={i}>{i}</Pill>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                  {person.phone ? (
                    <div>
                      <dt className="text-footnote text-label-secondary">Phone</dt>
                      <dd className="tabular">{person.phone}</dd>
                    </div>
                  ) : null}
                  {person.email ? (
                    <div>
                      <dt className="text-footnote text-label-secondary">Email</dt>
                      <dd className="truncate">{person.email}</dd>
                    </div>
                  ) : null}
                </dl>
              </>
            ) : null}
          </aside>
        </div>
      </PageBody>

      <PersonForm open={editing} person={person} onClose={() => setEditing(false)} />
      <LogInteraction
        open={logging != null}
        person={person}
        interaction={logging === "new" ? null : logging}
        onClose={() => setLogging(null)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${person.name}?`}
        description={`Their log, notes and gift ideas are deleted. Tasks about them stay. You can't undo this — archive them instead to keep everything.`}
        confirmLabel="Delete person"
        onConfirm={() => {
          void actions.deletePerson(person.id);
          router.replace("/people");
        }}
      />
    </>
  );
}

/** REL-5: things to remember (a plain list) and gift ideas (tick when given). */
function ItemList({
  personId,
  kind,
  title,
  placeholder,
  items,
}: {
  personId: string;
  kind: "gift" | "remember";
  title: string;
  placeholder: string;
  items: PersonItemDoc[];
}) {
  const actions = useActions();
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    void actions.addPersonItem(personId, kind, text);
    setText("");
  };
  return (
    <section aria-label={title} className="mt-6">
      <SectionLabel count={items.length || undefined}>{title}</SectionLabel>
      <ul className="flex flex-col">
        {items.map((i) => (
          <li key={i.id} className="group flex min-h-row items-center gap-2 rounded-md px-2 hover:bg-fill">
            {kind === "gift" ? (
              <Checkbox
                checked={i.doneAt != null}
                onChange={(c) => void actions.togglePersonItem(i.id, c)}
                label={`Given: ${i.text}`}
              />
            ) : (
              <span className="size-1.5 shrink-0 rounded-full bg-label-tertiary" aria-hidden />
            )}
            <span className={cn("min-w-0 flex-1 text-callout", i.doneAt != null && "text-label-tertiary line-through")}>
              {i.text}
            </span>
            <IconButton
              label={`Remove ${i.text}`}
              icon={<X className="size-4" />}
              onClick={() => void actions.deletePersonItem(i.id)}
              className="opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
            />
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-center gap-2 px-2"
      >
        {kind === "gift" ? (
          <Gift className="size-4 shrink-0 text-label-tertiary" />
        ) : (
          <Plus className="size-4 shrink-0 text-label-tertiary" />
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          placeholder={placeholder}
          aria-label={`Add to ${title.toLowerCase()}`}
          className="h-row min-w-0 flex-1 bg-transparent text-callout outline-none placeholder:text-label-tertiary"
        />
      </form>
    </section>
  );
}
