"use client";

import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActions } from "@/features/actions";
import { useGoals, useVision, type VisionDoc } from "@/features/data";
import { newValueId, quarterKey, quarterLabel, quarterOf, yearTheme, type CoreValue } from "@/features/quarters/model";
import { useToday } from "@/features/use-today";

const textarea =
  "field-sizing-content min-h-20 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";

/** VIS-1: values, the long-term vision, and this year's theme. */
export function VisionView() {
  const vision = useVision();
  const todayDay = useToday();
  const year = Number(todayDay.slice(0, 4));
  if (vision === undefined) return null;
  return (
    <>
      <PageHeader
        title="Vision"
        subtitle="Where you're heading"
        actions={
          <>
            <Link
              href={`/year?y=${year}`}
              className="inline-flex h-control items-center rounded-md px-3 text-body font-semibold text-accent-text hover:bg-accent-fill"
            >
              {year}
            </Link>
            <Link
              href={`/quarter?q=${quarterKey(quarterOf(todayDay))}`}
              className="inline-flex h-control items-center rounded-md bg-fill px-4 text-body font-semibold hover:bg-fill-strong"
            >
              {quarterLabel(quarterOf(todayDay))}
            </Link>
          </>
        }
      />
      <PageBody>
        {/* Remount when the vision first arrives from sync, so the fields show it. */}
        <VisionBody key={vision?.id ?? "none"} vision={vision} year={year} />
      </PageBody>
    </>
  );
}

function VisionBody({ vision, year }: { vision: VisionDoc | null; year: number }) {
  const actions = useActions();
  const goals = (useGoals() ?? []).filter((g) => g.status === "active" || g.status === "planned");
  const [theme, setTheme] = useState(yearTheme(vision, year));
  const [texts, setTexts] = useState({
    oneYear: vision?.oneYear ?? "",
    fiveYear: vision?.fiveYear ?? "",
    tenYear: vision?.tenYear ?? "",
  });
  const values = vision?.values ?? [];

  const saveText = (k: keyof typeof texts) => {
    if (texts[k] !== (vision?.[k] ?? "")) void actions.saveVision({ [k]: texts[k] });
  };

  return (
    <div className="flex max-w-[68ch] flex-col">
      <SectionLabel>{year} theme</SectionLabel>
      <input
        aria-label={`${year} theme`}
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        onBlur={() => theme.trim() !== yearTheme(vision, year) && void actions.setYearTheme(year, theme)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        maxLength={120}
        placeholder="One phrase for the year, e.g. Build the foundation"
        className="w-full rounded-md bg-transparent px-1 py-1 text-title2 font-semibold outline-none placeholder:font-normal placeholder:text-label-tertiary focus-visible:bg-surface-sunken focus-visible:px-3"
      />

      <SectionLabel count={values.length || undefined}>Values</SectionLabel>
      <p className="mb-2 px-1 text-footnote text-label-secondary">
        What matters most to you. Link goals to them to remember why they matter.
      </p>
      <ul aria-label="Values" className="flex flex-col gap-1">
        {values.map((v) => (
          <ValueRow
            key={v.id}
            value={v}
            goals={goals.filter((g) => g.valueIds?.includes(v.id))}
            onSave={(next) => void actions.saveVision({ values: values.map((x) => (x.id === v.id ? next : x)) })}
            onRemove={() => void actions.saveVision({ values: values.filter((x) => x.id !== v.id) })}
          />
        ))}
      </ul>
      {values.length < 20 ? (
        <AddValue onAdd={(v) => void actions.saveVision({ values: [...values, v] })} first={!values.length} />
      ) : null}

      {(
        [
          [
            "oneYear",
            "In a year",
            "A year from now, what's different? What did you achieve, how do you spend your days?",
          ],
          ["fiveYear", "In 5 years", "Where do you live, what's your work, who's around you?"],
          ["tenYear", "In 10 years", "The life you're building towards."],
        ] as const
      ).map(([k, label, placeholder]) => (
        <section key={k} aria-label={label}>
          <SectionLabel>{label}</SectionLabel>
          <textarea
            aria-label={label}
            value={texts[k]}
            onChange={(e) => setTexts({ ...texts, [k]: e.target.value })}
            onBlur={() => saveText(k)}
            placeholder={placeholder}
            className={textarea}
          />
        </section>
      ))}
    </div>
  );
}

function ValueRow({
  value,
  goals,
  onSave,
  onRemove,
}: {
  value: CoreValue;
  goals: { id: string; title: string }[];
  onSave: (v: CoreValue) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value.name);
  const [description, setDescription] = useState(value.description);
  if (editing) {
    return (
      <li>
        <form
          className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave({ ...value, name: name.trim(), description: description.trim() });
            setEditing(false);
          }}
        >
          <Input aria-label="Value" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          <Input
            aria-label="What it means to you"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-fill">
      <div className="min-w-0 flex-1">
        <p className="text-headline">{value.name}</p>
        {value.description ? <p className="text-callout text-label-secondary">{value.description}</p> : null}
        {goals.length ? (
          <p className="mt-1 flex flex-wrap gap-1">
            {goals.map((g) => (
              <Link
                key={g.id}
                href={`/goal?id=${g.id}`}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-fill px-2 text-caption text-label-secondary hover:text-label"
              >
                <Target className="size-3" /> {g.title}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
      <div className="flex opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        <IconButton
          label={`Edit ${value.name}`}
          icon={<Pencil className="size-4" />}
          onClick={() => setEditing(true)}
        />
        <IconButton label={`Remove ${value.name}`} icon={<Trash2 className="size-4" />} onClick={onRemove} />
      </div>
    </li>
  );
}

function AddValue({ onAdd, first }: { onAdd: (v: CoreValue) => void; first: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex h-row items-center gap-2 self-start rounded-md px-2 text-body text-label-tertiary hover:bg-fill"
      >
        <Plus className="size-4" /> {first ? "Add your first value" : "Add a value"}
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-col gap-2 rounded-lg bg-surface-sunken p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd({ id: newValueId(), name: name.trim(), description: description.trim() });
        setName("");
        setDescription("");
      }}
    >
      <Input
        aria-label="Value"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus
        placeholder="e.g. Family, Craft, Health, Freedom"
      />
      <Input
        aria-label="What it means to you"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={300}
        placeholder="What it means to you (optional)"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Done
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          Add value
        </Button>
      </div>
    </form>
  );
}
