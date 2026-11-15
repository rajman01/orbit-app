"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Briefcase, CalendarClock, MapPin, Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { FoundRoles } from "@/components/jobs/found";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/app/empty-state";
import { JobLeadDialog } from "@/components/career/forms";
import { Button, IconButton } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import {
  dueNextSteps,
  JOB_OUTCOME_LABEL,
  JOB_STAGE_LABEL,
  pipelineStats,
  type JobLead,
  type JobStage,
} from "@/features/career/model";
import { useJobLeads, useJobPostings } from "@/features/data";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";
import { JOB_STAGES } from "@/lib/sync/entities";

/** CAR-4: the job search pipeline as a board. Drag a lead to move it; closing asks how it ended. */
export function JobsView() {
  const leads = useJobLeads();
  const actions = useActions();
  const router = useRouter();
  const today = useToday();
  const [adding, setAdding] = useState<JobStage | null>(null);
  const [closing, setClosing] = useState<JobLead | null>(null);
  const [dragging, setDragging] = useState<JobLead | null>(null);
  const postings = useJobPostings();
  const newCount = (postings ?? []).filter((p) => p.status === "new").length;
  const [tab, setTab] = useState<"found" | "pipeline">(() => {
    if (typeof window === "undefined") return "found";
    try {
      return localStorage.getItem("orbit:jobs-tab") === "pipeline" ? "pipeline" : "found";
    } catch {
      return "found";
    }
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const all = leads ?? [];
  const stats = pipelineStats(all);
  const due = dueNextSteps(all, today);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const lead = all.find((l) => l.id === e.active.id);
    const stage = e.over?.id as JobStage | undefined;
    if (!lead || !stage || stage === lead.stage) return;
    // Closing asks how it ended (the dialog opens on the closed stage).
    if (stage === "closed") setClosing(lead);
    else void actions.moveJobLead(lead, stage);
  };

  return (
    <>
      <PageHeader
        title="Job search"
        subtitle={
          stats.applied
            ? `${stats.applied} applied · ${pct(stats.interviewRate)} to interview · ${pct(stats.offerRate)} to offer`
            : undefined
        }
        actions={
          <>
            <Link
              href="/jobs/profile"
              aria-label="Career profile"
              title="Career profile"
              className="grid size-9 place-items-center rounded-full text-label-secondary hover:bg-fill"
            >
              <UserRound className="size-5" />
            </Link>
            <Button aria-label="New lead" icon={<Plus className="size-4" />} onClick={() => setAdding("researching")}>
              <span className="max-sm:hidden">New lead</span>
            </Button>
          </>
        }
      />
      <PageBody className="max-w-none lg:max-w-[1200px]">
        <div className="mb-4">
          <Segmented
            label="Job search"
            value={tab}
            onChange={(t) => {
              setTab(t);
              try {
                localStorage.setItem("orbit:jobs-tab", t);
              } catch {}
            }}
            options={[
              { value: "found", label: newCount ? `Found for you (${newCount})` : "Found for you" },
              { value: "pipeline", label: "Pipeline" },
            ]}
          />
        </div>
        {tab === "found" ? (
          <div className="max-w-[760px]">
            <FoundRoles />
          </div>
        ) : (
          <>
            {due.length ? (
              <section aria-label="Next steps due" className="mb-4 rounded-xl bg-accent-fill p-3">
                <h2 className="mb-1 flex items-center gap-1.5 px-1 text-footnote font-semibold text-accent-text">
                  <CalendarClock className="size-4" /> Next steps due
                </h2>
                <ul className="flex flex-col">
                  {due.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/jobs/lead?id=${l.id}`)}
                        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-fill"
                      >
                        <span className="min-w-0 flex-1 truncate text-callout">
                          <strong className="font-semibold">{l.company}</strong> · {l.nextStep}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-footnote tabular",
                            l.nextDate! < today ? "font-medium text-danger-text" : "text-label-secondary",
                          )}
                        >
                          {dayLabel(l.nextDate!, today)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {leads && !leads.length ? (
              <EmptyState
                icon={Briefcase}
                title="No leads yet"
                body="Add companies and roles you're looking at, move them along as things happen, and keep a next step on each so nothing goes quiet."
                action={
                  <Button icon={<Plus className="size-4" />} onClick={() => setAdding("researching")}>
                    Add a lead
                  </Button>
                }
              />
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={(e) => setDragging(all.find((l) => l.id === e.active.id) ?? null)}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDragging(null)}
              >
                <div
                  className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:snap-none lg:overflow-visible lg:px-0"
                  style={{ gridTemplateColumns: `repeat(${JOB_STAGES.length}, minmax(0, 1fr))` }}
                >
                  {JOB_STAGES.map((stage) => (
                    <Column
                      key={stage}
                      stage={stage}
                      leads={all.filter((l) => l.stage === stage)}
                      today={today}
                      onOpen={(l) => router.push(`/jobs/lead?id=${l.id}`)}
                      onAdd={() => setAdding(stage)}
                    />
                  ))}
                </div>
                {typeof document !== "undefined"
                  ? createPortal(
                      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }}>
                        {dragging ? <Card lead={dragging} today={today} lifted /> : null}
                      </DragOverlay>,
                      document.body,
                    )
                  : null}
              </DndContext>
            )}
          </>
        )}
      </PageBody>
      {adding ? <JobLeadDialog open onOpenChange={(o) => !o && setAdding(null)} stage={adding} /> : null}
      {closing ? (
        <JobLeadDialog
          key={`close-${closing.id}`}
          open
          onOpenChange={(o) => !o && setClosing(null)}
          lead={closing}
          stage="closed"
        />
      ) : null}
    </>
  );
}

function Column({
  stage,
  leads,
  today,
  onOpen,
  onAdd,
}: {
  stage: JobStage;
  leads: JobLead[];
  today: string;
  onOpen: (l: JobLead) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={JOB_STAGE_LABEL[stage]}
      className={cn(
        "flex w-[78vw] max-w-80 shrink-0 snap-start flex-col gap-2 rounded-lg bg-surface-sunken p-2 transition-colors lg:w-auto lg:max-w-none",
        isOver && "bg-accent-fill",
      )}
    >
      <h2 className="flex items-center gap-2 px-1 pt-1 text-footnote font-semibold">
        {JOB_STAGE_LABEL[stage]}
        <span className="font-normal text-label-tertiary tabular">{leads.length}</span>
        <span className="ml-auto">
          <IconButton
            label={`Add a lead to ${JOB_STAGE_LABEL[stage]}`}
            icon={<Plus className="size-4" />}
            onClick={onAdd}
          />
        </span>
      </h2>
      {leads.map((l) => (
        <DraggableCard key={l.id} lead={l} today={today} onOpen={() => onOpen(l)} />
      ))}
      {!leads.length ? (
        <p className="px-1 py-6 text-center text-footnote text-label-tertiary">Drop leads here</p>
      ) : null}
    </section>
  );
}

function DraggableCard({ lead, today, onOpen }: { lead: JobLead; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Its own name, so the card inside stays the one "Open …" button.
      role="group"
      aria-label={`Drag ${lead.company}`}
      className={cn("touch-manipulation outline-none", isDragging && "opacity-30")}
    >
      <Card lead={lead} today={today} onOpen={onOpen} />
    </div>
  );
}

function Card({
  lead,
  today,
  onOpen,
  lifted,
}: {
  lead: JobLead;
  today: string;
  onOpen?: () => void;
  lifted?: boolean;
}) {
  const late = lead.stage !== "closed" && lead.nextDate != null && lead.nextDate < today;
  return (
    <button
      type="button"
      aria-label={`Open ${lead.company}${lead.role ? `, ${lead.role}` : ""}`}
      onClick={onOpen}
      className={cn(
        "flex w-full flex-col gap-1 rounded-md border border-separator bg-surface p-3 text-left shadow-1 dark:bg-surface-raised",
        lifted && "scale-[1.02] shadow-2",
      )}
    >
      <span className="text-body font-semibold">{lead.company}</span>
      {lead.role ? <span className="text-callout text-label-secondary">{lead.role}</span> : null}
      {lead.location ? (
        <span className="flex items-center gap-1 text-footnote text-label-tertiary">
          <MapPin className="size-3" /> {lead.location}
        </span>
      ) : null}
      {lead.stage === "closed" ? (
        <span className="text-footnote text-label-secondary">
          {lead.outcome ? JOB_OUTCOME_LABEL[lead.outcome] : "Closed"}
        </span>
      ) : lead.nextStep ? (
        <span className="mt-1 flex items-center justify-between gap-2 text-footnote">
          <span className="truncate text-label-secondary">↳ {lead.nextStep}</span>
          {lead.nextDate ? (
            <span className={cn("shrink-0 tabular", late ? "font-medium text-danger-text" : "text-label-secondary")}>
              {dayLabel(lead.nextDate, today)}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
