"use client";

import { Archive, ArchiveRestore, Gauge, MoreHorizontal, Pencil, Plus, Shapes } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { AreasScene } from "@/components/app/scenes";
import { AreaDialog } from "@/components/areas/area-form";
import { AreaIcon } from "@/components/areas/area-icon";
import { HealthDot, useAreaHealths } from "@/components/areas/area-health";
import { WheelRatingDialog } from "@/components/insights/wheel-rating";
import { Button, IconButton } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useActions } from "@/features/actions";
import { type Area, useAllTasks, useAreaRatings, useAreas, useGoals } from "@/features/data";
import { isOpen } from "@/features/tasks/model";

export function AreasView() {
  const areas = useAreas({ includeArchived: true });
  const goals = useGoals() ?? [];
  const tasks = useAllTasks() ?? [];
  const actions = useActions();
  const [editing, setEditing] = useState<Area | "new" | null>(null);
  const [rating, setRating] = useState(false);
  const live = (areas ?? []).filter((a) => !a.archivedAt);
  const healths = useAreaHealths(live.map((a) => a.id));
  const ratings = useAreaRatings();
  const archived = (areas ?? []).filter((a) => a.archivedAt);

  const card = (a: Area) => {
    const activeGoals = goals.filter((g) => g.areaId === a.id && g.status === "active").length;
    const open = tasks.filter((t) => t.areaId === a.id && isOpen(t) && !t.parentTaskId).length;
    return (
      <li key={a.id} className="flex items-center gap-1 rounded-lg border border-separator bg-surface pr-2 shadow-1">
        <Link href={`/area?id=${a.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-4">
          <span
            className="grid size-10 place-items-center rounded-md"
            style={{ background: `color-mix(in srgb, var(--area-${a.color}) 14%, transparent)` }}
          >
            <AreaIcon icon={a.icon} color={a.color} className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-headline">
              {a.name}
              {a.archivedAt ? null : <HealthDot health={healths?.get(a.id)} />}
            </span>
            <span className="block truncate text-footnote text-label-secondary">
              {activeGoals} active goal{activeGoals === 1 ? "" : "s"} · {open} open task{open === 1 ? "" : "s"}
            </span>
            {!a.archivedAt && healths?.get(a.id)?.reasons.length ? (
              <span className="block truncate text-footnote text-label-tertiary">{healths.get(a.id)!.reasons[0]}</span>
            ) : null}
          </span>
        </Link>
        <Menu
          trigger={<IconButton label={`Options for ${a.name}`} icon={<MoreHorizontal className="size-4" />} />}
          align="end"
        >
          <MenuItem icon={<Pencil />} onSelect={() => setEditing(a)}>
            Edit
          </MenuItem>
          <MenuItem
            icon={a.archivedAt ? <ArchiveRestore /> : <Archive />}
            onSelect={() => void actions.archiveArea(a.id, !a.archivedAt)}
          >
            {a.archivedAt ? "Restore" : "Archive"}
          </MenuItem>
        </Menu>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Areas"
        actions={
          <>
            {live.length >= 3 ? (
              <Button variant="secondary" icon={<Gauge className="size-4" />} onClick={() => setRating(true)}>
                <span className="hidden sm:inline">Wheel of Life</span>
                <span className="sm:hidden">Rate</span>
              </Button>
            ) : null}
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              New area
            </Button>
          </>
        }
      />
      <PageBody>
        {areas && !live.length ? (
          <EmptyState
            icon={Shapes}
            illustration={<AreasScene />}
            title="No areas yet"
            body="Areas are the parts of life you want to grow — career, relationships, health…"
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">{live.map(card)}</ul>
        )}
        {archived.length ? (
          <>
            <h2 className="mt-8 mb-2 px-1 text-micro text-label-secondary uppercase">Archived</h2>
            <ul className="grid gap-2 opacity-70 sm:grid-cols-2">{archived.map(card)}</ul>
          </>
        ) : null}
      </PageBody>
      <WheelRatingDialog open={rating} onOpenChange={setRating} areas={live} last={ratings?.[0]} />
      {editing ? (
        <AreaDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          area={editing === "new" ? undefined : editing}
        />
      ) : null}
    </>
  );
}
