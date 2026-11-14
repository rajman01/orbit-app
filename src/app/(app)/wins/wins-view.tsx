"use client";

import { Download, MoreHorizontal, Pencil, Plus, Target, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { AreaIcon } from "@/components/areas/area-icon";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { WinForm } from "@/components/wins/win-form";
import { useActions } from "@/features/actions";
import { useAreas, useGoals, useWins, type WinDoc } from "@/features/data";
import { winsMarkdown } from "@/features/wins/model";
import { useToday } from "@/features/use-today";
import { dayLabel } from "@/lib/dates";

const SOURCE: Record<WinDoc["source"], string | null> = {
  manual: null,
  task: "From a task",
  cycle_review: "From a cycle review",
  quarterly_review: "From a quarterly review",
  coach: "Logged with the coach",
};

/** CAR-1: the wins log (a brag doc), by month, exportable to markdown. */
export function WinsView() {
  const actions = useActions();
  const router = useRouter();
  const startNew = useSearchParams().get("new") === "1";
  const wins = useWins();
  const areas = useAreas({ includeArchived: true }) ?? [];
  const goals = useGoals() ?? [];
  const todayDay = useToday();
  const [editing, setEditing] = useState<WinDoc | null | "new">(startNew ? "new" : null);
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const goalById = new Map(goals.map((g) => [g.id, g]));

  const months = new Map<string, WinDoc[]>();
  for (const w of wins ?? []) {
    const key = w.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), w]);
  }

  function exportMarkdown() {
    const md = winsMarkdown(wins ?? [], {
      areas: new Map(areas.map((a) => [a.id, a.name])),
      goals: new Map(goals.map((g) => [g.id, g.title])),
    });
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `wins-${todayDay}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const close = () => {
    setEditing(null);
    if (startNew) router.replace("/wins");
  };

  return (
    <>
      <PageHeader
        title="Wins"
        subtitle="Your brag doc"
        actions={
          <>
            {wins?.length ? (
              <IconButton label="Export as markdown" icon={<Download className="size-4" />} onClick={exportMarkdown} />
            ) : null}
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              Log a win
            </Button>
          </>
        }
      />
      <PageBody>
        {wins && !wins.length ? (
          <EmptyState
            icon={Trophy}
            title="No wins logged yet"
            body="Big or small: shipped something, helped someone, kept a promise to yourself. Log them as they happen, or from a finished task, and you'll have them when it's review time."
            action={<Button onClick={() => setEditing("new")}>Log a win</Button>}
          />
        ) : null}
        {[...months.entries()].map(([month, list]) => (
          <section key={month} aria-label={month}>
            <SectionLabel count={list.length}>
              {new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </SectionLabel>
            <ul className="flex flex-col gap-1">
              {list.map((w) => {
                const area = w.areaId ? areaById.get(w.areaId) : undefined;
                const goal = w.goalId ? goalById.get(w.goalId) : undefined;
                return (
                  <li key={w.id} className="group flex items-start gap-3 rounded-md px-2 py-2 hover:bg-fill">
                    <Trophy className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-medium">{w.title}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-footnote text-label-secondary">
                        <span>{dayLabel(w.date, todayDay)}</span>
                        {area ? (
                          <span className="inline-flex items-center gap-1">
                            <AreaIcon icon={area.icon} color={area.color} className="size-3" /> {area.name}
                          </span>
                        ) : null}
                        {goal ? (
                          <Link
                            href={`/goal?id=${goal.id}`}
                            className="inline-flex items-center gap-1 hover:text-label"
                          >
                            <Target className="size-3" /> {goal.title}
                          </Link>
                        ) : null}
                        {SOURCE[w.source] ? <span className="text-label-tertiary">{SOURCE[w.source]}</span> : null}
                      </p>
                      {w.description ? (
                        <p className="mt-1 text-callout whitespace-pre-wrap text-label-secondary">{w.description}</p>
                      ) : null}
                      {w.impact ? (
                        <p className="mt-1 text-callout whitespace-pre-wrap">
                          <span className="font-semibold">Impact: </span>
                          {w.impact}
                        </p>
                      ) : null}
                      {w.links.length ? (
                        <ul className="mt-1 flex flex-col">
                          {w.links.map((l) => (
                            <li key={l} className="truncate text-footnote">
                              {/^https?:\/\//.test(l) ? (
                                <a
                                  href={l}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-accent-text hover:underline"
                                >
                                  {l}
                                </a>
                              ) : (
                                l
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <Menu
                      align="end"
                      trigger={
                        <IconButton
                          label={`More for ${w.title}`}
                          icon={<MoreHorizontal className="size-4" />}
                          className="opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                        />
                      }
                    >
                      <MenuItem icon={<Pencil />} onSelect={() => setEditing(w)}>
                        Edit
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 />} destructive onSelect={() => void actions.deleteWin(w.id)}>
                        Delete
                      </MenuItem>
                    </Menu>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </PageBody>
      <WinForm open={editing != null} win={editing === "new" ? null : editing} onClose={close} />
    </>
  );
}
