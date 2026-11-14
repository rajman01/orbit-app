"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaPicker } from "@/components/tasks/pickers";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useActions } from "@/features/actions";
import { areaColorVar } from "@/features/areas/model";
import type { PersonDoc } from "@/features/data";
import {
  CADENCES,
  colorFor,
  monthName,
  RELATIONSHIP_META,
  type PersonDate,
  type PersonFields,
  type Relationship,
} from "@/features/people/model";
import { cn } from "@/lib/cn";
import { AREA_COLORS, RELATIONSHIPS } from "@/lib/sync/entities";
import { PersonAvatar } from "./avatar";

const control =
  "h-control rounded-md bg-surface-sunken px-2.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent";

export const chip = (on: boolean) =>
  cn(
    "h-9 rounded-full px-3.5 text-callout font-medium",
    on ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
  );

/** REL-1/2: add or edit someone. Notes, gift ideas and the log live on their page. */
export function PersonForm({
  person,
  open,
  onClose,
}: {
  person?: PersonDoc | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={person ? "Edit person" : "New person"} width={520}>
      {open ? <PersonFormBody key={person?.id ?? "new"} person={person} onClose={onClose} /> : null}
    </Modal>
  );
}

type DraftDate = Omit<PersonDate, "year"> & { year: string };

function PersonFormBody({ person, onClose }: { person?: PersonDoc | null; onClose: () => void }) {
  const actions = useActions();
  const router = useRouter();
  const [name, setName] = useState(person?.name ?? "");
  const [emoji, setEmoji] = useState(person?.emoji ?? "");
  const [color, setColor] = useState<PersonFields["color"] | null>(person?.color ?? null);
  const [relationship, setRelationship] = useState<Relationship>(person?.relationship ?? "friend");
  const presetCadence = CADENCES.some((c) => c.days === (person?.cadenceDays ?? null));
  const [cadence, setCadence] = useState<number | null | "custom">(
    presetCadence ? (person?.cadenceDays ?? null) : "custom",
  );
  const [customDays, setCustomDays] = useState(person?.cadenceDays ?? 21);
  const [dates, setDates] = useState<DraftDate[]>(
    (person?.dates ?? []).map((d) => ({ ...d, year: d.year ? String(d.year) : "" })),
  );
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(person?.whatsapp ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [howWeMet, setHowWeMet] = useState(person?.howWeMet ?? "");
  const [interests, setInterests] = useState((person?.interests ?? []).join(", "));
  const [areaId, setAreaId] = useState<string | null | undefined>(person ? person.areaId : undefined);

  const shownColor = color ?? colorFor(name || "?");
  const valid = name.trim().length > 0 && (cadence !== "custom" || (customDays >= 1 && customDays <= 730));
  const hasBirthday = dates.some((d) => d.kind === "birthday");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const fields = {
      name: name.trim(),
      emoji: emoji.trim() || null,
      color: shownColor,
      relationship,
      cadenceDays: cadence === "custom" ? Math.round(customDays) : cadence,
      dates: dates.map((d) => {
        const y = Number(d.year);
        return { ...d, label: d.label.trim(), year: d.year && y >= 1800 && y <= 2200 ? y : null };
      }),
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      email: email.trim() || null,
      howWeMet,
      interests: [
        ...new Set(
          interests
            .split(",")
            .map((s) => s.trim().slice(0, 60))
            .filter(Boolean),
        ),
      ].slice(0, 30),
      ...(areaId !== undefined ? { areaId } : {}),
    };
    onClose();
    if (person) await actions.updatePerson(person.id, fields);
    else {
      const id = await actions.createPerson(fields);
      router.push(`/person?id=${id}`);
    }
  }

  const setDate = (i: number, patch: Partial<DraftDate>) =>
    setDates(dates.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <form onSubmit={save} className="flex flex-col gap-4 pb-2">
      <div className="flex items-end gap-3">
        <PersonAvatar person={{ name: name || "?", emoji: emoji.trim() || null, color: shownColor }} size={44} />
        <div className="min-w-0 flex-1">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada Lovelace" />
          </Field>
        </div>
        <div className="w-20">
          <Field label="Emoji">
            <Input
              value={emoji}
              onChange={(e) => setEmoji([...e.target.value].slice(0, 2).join(""))}
              placeholder="🙂"
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
        {AREA_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={shownColor === c}
            aria-label={c}
            onClick={() => setColor(c)}
            className={cn(
              "size-7 rounded-full ring-offset-2 ring-offset-[var(--surface-raised)] transition-shadow",
              shownColor === c && "ring-2 ring-label",
            )}
            style={{ background: areaColorVar(c) }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-footnote font-medium text-label-secondary">Relationship</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Relationship">
          {RELATIONSHIPS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={relationship === r}
              onClick={() => setRelationship(r)}
              className={chip(relationship === r)}
            >
              {RELATIONSHIP_META[r].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-footnote font-medium text-label-secondary">Keep in touch</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Keep in touch">
          {CADENCES.map((c) => (
            <button
              key={c.label}
              type="button"
              role="radio"
              aria-checked={cadence === c.days}
              onClick={() => setCadence(c.days)}
              className={chip(cadence === c.days)}
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={cadence === "custom"}
            onClick={() => setCadence("custom")}
            className={chip(cadence === "custom")}
          >
            Custom
          </button>
        </div>
        {cadence === "custom" ? (
          <label className="flex items-center gap-2 text-callout">
            Every
            <input
              type="number"
              min={1}
              max={730}
              value={customDays}
              onChange={(e) => setCustomDays(Number(e.target.value))}
              aria-label="Days between catch-ups"
              className={cn(control, "w-20")}
            />
            days
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-footnote font-medium text-label-secondary">Important dates</span>
        {dates.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2" role="group" aria-label={`Date ${i + 1}`}>
            <select
              aria-label="Kind"
              value={d.kind}
              onChange={(e) => setDate(i, { kind: e.target.value as PersonDate["kind"] })}
              className={control}
            >
              <option value="birthday">Birthday</option>
              <option value="anniversary">Anniversary</option>
              <option value="custom">Other</option>
            </select>
            {d.kind !== "birthday" ? (
              <input
                aria-label="What"
                value={d.label}
                onChange={(e) => setDate(i, { label: e.target.value })}
                placeholder={d.kind === "anniversary" ? "Anniversary" : "e.g. Graduation"}
                className={cn(control, "w-36 min-w-0 placeholder:text-label-tertiary")}
              />
            ) : null}
            <select
              aria-label="Day"
              value={d.day}
              onChange={(e) => setDate(i, { day: Number(e.target.value) })}
              className={control}
            >
              {Array.from({ length: 31 }, (_, n) => (
                <option key={n} value={n + 1}>
                  {n + 1}
                </option>
              ))}
            </select>
            <select
              aria-label="Month"
              value={d.month}
              onChange={(e) => setDate(i, { month: Number(e.target.value) })}
              className={control}
            >
              {Array.from({ length: 12 }, (_, n) => (
                <option key={n} value={n + 1}>
                  {monthName(n + 1)}
                </option>
              ))}
            </select>
            <input
              aria-label="Year (optional)"
              inputMode="numeric"
              value={d.year}
              onChange={(e) => setDate(i, { year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder="Year"
              className={cn(control, "w-20 placeholder:text-label-tertiary")}
            />
            <IconButton
              label="Remove date"
              icon={<X className="size-4" />}
              onClick={() => setDates(dates.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {dates.length < 20 ? (
          <button
            type="button"
            onClick={() =>
              setDates([
                ...dates,
                { kind: hasBirthday ? "anniversary" : "birthday", label: "", day: 1, month: 1, year: "" },
              ])
            }
            className="flex h-9 items-center gap-1.5 self-start rounded-full px-1 text-callout font-medium text-accent-text"
          >
            <Plus className="size-4" /> {hasBirthday ? "Add a date" : "Add birthday"}
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <Input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder={phone} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Interests">
          <Input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Football, jazz, cooking"
          />
        </Field>
      </div>
      <Field label="How you met">
        <textarea
          value={howWeMet}
          onChange={(e) => setHowWeMet(e.target.value)}
          rows={2}
          className="field-sizing-content min-h-16 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </Field>
      {person ? (
        <div className="grid grid-cols-[96px_1fr] items-center gap-2 text-callout">
          <span className="text-footnote text-label-secondary">Area</span>
          <div>
            <AreaPicker value={areaId ?? null} onChange={setAreaId} />
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          {person ? "Save" : "Add person"}
        </Button>
      </div>
    </form>
  );
}
