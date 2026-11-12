"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Shapes } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { AreasScene } from "@/components/app/scenes";
import { AreaDialog } from "@/components/areas/area-form";
import { AreaIcon } from "@/components/areas/area-icon";
import { Button, IconButton } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useActions } from "@/features/actions";
import { type Area, useAllTasks, useAreas, useGoals } from "@/features/data";
import { isOpen } from "@/features/tasks/model";

export function AreasView() {
  const areas = useAreas({ includeArchived: true });
  const goals = useGoals() ?? [];
  const tasks = useAllTasks() ?? [];
  const actions = useActions();
  const [editing, setEditing] = useState<Area | "new" | null>(null);
  const live = (areas ?? []).filter((a) => !a.archivedAt);
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
            <span className="block text-headline">{a.name}</span>
            <span className="block truncate text-footnote text-label-secondary">
              {activeGoals} active goal{activeGoals === 1 ? "" : "s"} · {open} open task{open === 1 ? "" : "s"}
            </span>
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
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New area
          </Button>
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
