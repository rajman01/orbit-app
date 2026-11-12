"use client";

import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useMounted } from "@/lib/use-mounted";
import { OrbitMark } from "@/components/app/app-shell";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Kbd, Pill } from "@/components/ui/pill";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

const AREAS = ["blue", "pink", "green", "orange", "indigo", "purple", "mint", "brown", "cyan", "yellow"];

/** Hidden page showing every component in its states (DESIGN.md §14.4). */
export function Gallery() {
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState(0.35);
  const [confirm, setConfirm] = useState(false);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10 lg:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <OrbitMark size={32} />
          <h1 className="text-title1">Components</h1>
        </div>
        {mounted ? (
          <Segmented
            label="Theme"
            value={(theme ?? "system") as "system" | "light" | "dark"}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        ) : null}
      </header>

      <Section title="Typography">
        {(["display", "title1", "title2", "title3", "headline", "body", "callout", "subhead", "footnote", "caption"] as const).map((s) => (
          <p key={s} className={`text-${s}`}>
            {s} — Start with five minutes
          </p>
        ))}
        <p className="text-micro uppercase">micro — section label</p>
      </Section>

      <Section title="Colour">
        <div className="flex flex-wrap gap-2">
          {["accent", "success", "warning", "danger", "info"].map((c) => (
            <Swatch key={c} name={c} color={`var(--${c})`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <Swatch key={a} name={a} color={`var(--area-${a})`} />
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Start focus</Button>
          <Button variant="secondary">Reschedule</Button>
          <Button variant="plain">Add next step</Button>
          <Button variant="destructive">Delete goal</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="large" icon={<Plus className="size-4" />}>
            Commit to cycle
          </Button>
          <IconButton label="Edit" icon={<Pencil className="size-4" strokeWidth={1.75} />} />
        </div>
      </Section>

      <Section title="Inputs">
        <Field label="Goal title">
          <Input placeholder="Land a senior role" />
        </Field>
        <Field label="With error" error="Give this goal a target date">
          <Input aria-invalid="true" defaultValue="Run a marathon" />
        </Field>
      </Section>

      <Section title="Checkbox, progress and pills">
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox checked={checked} onChange={setChecked} label="Complete task" />
          <Checkbox checked={checked} onChange={setChecked} label="Complete subtask" shape="square" color="var(--accent)" />
          <ProgressRing value={progress} />
          <ProgressRing value={progress} size={64} color="var(--area-blue)" />
          <Button variant="secondary" onClick={() => setProgress((p) => (p >= 1 ? 0 : Math.min(1, p + 0.2)))}>
            Advance
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="success">On track</Pill>
          <Pill tone="warning">At risk</Pill>
          <Pill tone="danger">Off track</Pill>
          <Pill tone="accent">Must-do</Pill>
          <Pill>Postponed 3×</Pill>
          <Kbd>⌘K</Kbd>
          <Kbd>C</Kbd>
        </div>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap items-center gap-2">
          <Menu trigger={<Button variant="secondary" icon={<MoreHorizontal className="size-4" />}>Menu</Button>}>
            <MenuItem icon={<Pencil />} shortcut="E">
              Edit
            </MenuItem>
            <MenuItem icon={<Copy />}>Duplicate</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} destructive>
              Delete
            </MenuItem>
          </Menu>
          <Sheet title="Why are you skipping this?" description="Pick a reason — it helps Orbit help you." trigger={<Button variant="secondary">Sheet</Button>}>
            <div className="flex flex-col gap-2 pb-4">
              {["Too big", "Unclear what to do", "No time", "Low energy", "Avoiding it"].map((r) => (
                <Button key={r} variant="secondary" size="large" className="justify-start">
                  {r}
                </Button>
              ))}
            </div>
          </Sheet>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Dialog
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ message: "Task completed", action: { label: "Undo", onClick: () => {} } })}
          >
            Toast
          </Button>
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Delete “Land a senior role”?"
          description="This also deletes its 14 tasks. You can’t undo this."
          confirmLabel="Delete goal"
          onConfirm={() => toast({ message: "Goal deleted" })}
        />
      </Section>

      <Section title="Materials">
        <div className="relative h-40 overflow-hidden rounded-lg bg-[linear-gradient(135deg,var(--area-blue),var(--area-pink),var(--area-orange))]">
          <div className="material-chrome absolute inset-x-0 top-0 flex h-12 items-center px-4 text-headline">material-chrome</div>
          <div className="material-thin absolute bottom-3 left-3 rounded-full px-4 py-2 text-callout font-medium">material-thin</div>
          <div className="material-popover absolute right-3 bottom-3 rounded-lg px-4 py-2 text-callout font-medium">material-popover</div>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-micro text-label-secondary uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="size-10 rounded-md" style={{ background: color }} />
      <span className="text-caption text-label-secondary">{name}</span>
    </div>
  );
}
