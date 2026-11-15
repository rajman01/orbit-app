import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { JOB_STAGES } from "@/lib/sync/entities";
import type { Day } from "@/lib/dates";

/** Phase 3B (CAR-2–4): skills, the learning queue and the job search pipeline. Pure rules. */

export type Skill = SyncedDoc<"skills">;
export type SkillFields = EntityFields<"skills">;
export type LearningItem = SyncedDoc<"learningItems">;
export type LearningFields = EntityFields<"learningItems">;
export type JobLead = SyncedDoc<"jobLeads">;
export type JobLeadFields = EntityFields<"jobLeads">;
export type JobStage = JobLeadFields["stage"];
export type JobOutcome = NonNullable<JobLeadFields["outcome"]>;
export type LearningKind = LearningFields["kind"];
export type LearningStatus = LearningFields["status"];

// ---------------------------------------------------------------- skills

/** What each level means, so ratings stay consistent. */
export const SKILL_LEVELS: Record<number, { label: string; hint: string }> = {
  1: { label: "Aware", hint: "Know what it is" },
  2: { label: "Beginner", hint: "Can do it with help" },
  3: { label: "Practising", hint: "Can do it on my own" },
  4: { label: "Skilled", hint: "Do it well, often" },
  5: { label: "Expert", hint: "Could teach it" },
};

export function newSkillFields(p: Partial<SkillFields> & { name: string }): SkillFields {
  const level = p.level ?? 1;
  return {
    name: p.name.trim(),
    category: p.category?.trim() ?? "",
    level,
    targetLevel: Math.max(level, p.targetLevel ?? Math.min(5, level + 1)),
    targetDate: p.targetDate ?? null,
    evidence: p.evidence ?? "",
    areaId: p.areaId ?? null,
    goalId: p.goalId ?? null,
    order: p.order ?? Date.now(),
    archivedAt: null,
  };
}

/** Skills grouped by category (uncategorised last), each group sorted by order. */
export function skillsByCategory<S extends Pick<Skill, "category" | "order">>(skills: S[]) {
  const groups = new Map<string, S[]>();
  for (const s of [...skills].sort((a, b) => a.order - b.order)) {
    const key = s.category.trim();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([category, items]) => ({ category, items }));
}

/** 50 XP for each level gained. */
export const SKILL_LEVEL_XP = 50;

// ---------------------------------------------------------------- learning

export const LEARNING_KIND_LABEL: Record<LearningKind, string> = {
  book: "Book",
  course: "Course",
  article: "Article",
  video: "Video",
  podcast: "Podcast",
  other: "Other",
};

export const LEARNING_STATUS_LABEL: Record<LearningStatus, string> = {
  queued: "Up next",
  in_progress: "In progress",
  done: "Done",
  dropped: "Dropped",
};

/** Finishing something: bigger things earn more. */
export function learningXp(kind: LearningKind): number {
  return kind === "book" || kind === "course" ? 30 : 10;
}

export function newLearningFields(p: Partial<LearningFields> & { title: string }): LearningFields {
  const base: LearningFields = {
    title: p.title.trim(),
    kind: p.kind ?? "book",
    url: p.url?.trim() || null,
    author: p.author?.trim() || null,
    status: "queued",
    progress: 0,
    notes: p.notes ?? "",
    skillId: p.skillId ?? null,
    order: p.order ?? Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  return { ...base, ...learningPatch(base, { status: p.status, progress: p.progress }, Date.now()) };
}

/**
 * A change of status or progress, with what follows from it: starting sets `startedAt`; reaching
 * 100% finishes it; finishing sets `finishedAt` and 100%; going back clears `finishedAt`.
 */
export function learningPatch(
  item: Pick<LearningFields, "status" | "progress" | "startedAt" | "finishedAt">,
  change: { status?: LearningStatus; progress?: number },
  now: number,
): Partial<LearningFields> {
  const patch: Partial<LearningFields> = {};
  let status = change.status ?? item.status;
  let progress = change.progress ?? item.progress;
  progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (change.progress != null && change.status == null) {
    if (progress >= 100) status = "done";
    else if (progress > 0 && (status === "queued" || status === "done")) status = "in_progress";
  }
  if (status === "done") progress = 100;
  if (change.status === "queued") progress = 0;
  if (status !== item.status) patch.status = status;
  if (progress !== item.progress) patch.progress = progress;
  if ((status === "in_progress" || status === "done") && item.startedAt == null) patch.startedAt = now;
  if (status === "done" && item.finishedAt == null) patch.finishedAt = now;
  if (status !== "done" && item.finishedAt != null) patch.finishedAt = null;
  if (status === "queued" && item.startedAt != null) patch.startedAt = null;
  return patch;
}

// ---------------------------------------------------------------- job search

export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  researching: "Researching",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

export const JOB_OUTCOME_LABEL: Record<JobOutcome, string> = {
  accepted: "Accepted",
  declined: "Declined",
  rejected: "Rejected",
  withdrawn: "Withdrew",
  no_reply: "No reply",
};

export function newLeadFields(p: Partial<JobLeadFields> & { company: string }, now: number): JobLeadFields {
  const base: JobLeadFields = {
    company: p.company.trim(),
    role: p.role?.trim() ?? "",
    url: p.url?.trim() || null,
    location: p.location?.trim() || null,
    stage: "researching",
    outcome: null,
    nextStep: p.nextStep?.trim() ?? "",
    nextDate: p.nextDate ?? null,
    salary: p.salary?.trim() || null,
    notes: p.notes ?? "",
    order: p.order ?? now,
    appliedAt: null,
    interviewedAt: null,
    closedAt: null,
    postingId: p.postingId ?? null,
    pack: null,
  };
  return { ...base, ...stagePatch(base, p.stage ?? "researching", p.outcome ?? null, now) };
}

const rank = (s: JobStage) => JOB_STAGES.indexOf(s);

/**
 * Moving a lead along: past "researching" it has been applied to (`appliedAt` set once), and
 * interviewing or an offer sets `interviewedAt` once; closing
 * sets `closedAt` and keeps the outcome; reopening clears both.
 */
export function stagePatch(
  lead: Pick<JobLeadFields, "stage" | "outcome" | "appliedAt" | "interviewedAt" | "closedAt">,
  stage: JobStage,
  outcome: JobOutcome | null,
  now: number,
): Partial<JobLeadFields> {
  const patch: Partial<JobLeadFields> = {};
  if (stage !== lead.stage) patch.stage = stage;
  if (rank(stage) >= rank("applied") && stage !== "closed" && lead.appliedAt == null) patch.appliedAt = now;
  if ((stage === "interviewing" || stage === "offer") && lead.interviewedAt == null) patch.interviewedAt = now;
  if (stage === "closed") {
    if (lead.closedAt == null) patch.closedAt = now;
    const o = outcome ?? lead.outcome ?? (lead.appliedAt ? "no_reply" : "withdrawn");
    if (o !== lead.outcome) patch.outcome = o;
  } else {
    if (lead.closedAt != null) patch.closedAt = null;
    if (lead.outcome != null) patch.outcome = null;
  }
  return patch;
}

/** Open leads whose next step is due today or overdue, soonest first. */
export function dueNextSteps<L extends Pick<JobLead, "stage" | "nextDate" | "nextStep">>(leads: L[], today: Day): L[] {
  return leads
    .filter((l) => l.stage !== "closed" && l.nextDate != null && l.nextDate <= today && l.nextStep.trim())
    .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!));
}

/**
 * The pipeline at a glance: open leads per stage, and of the leads applied to, how many got an
 * interview and how many an offer.
 */
export function pipelineStats(
  leads: Pick<JobLead, "stage" | "appliedAt" | "interviewedAt" | "outcome" | "deletedAt">[],
) {
  const live = leads.filter((l) => l.deletedAt == null);
  const open = Object.fromEntries(JOB_STAGES.map((s) => [s, live.filter((l) => l.stage === s).length])) as Record<
    JobStage,
    number
  >;
  const applied = live.filter((l) => l.appliedAt != null);
  // A closed lead keeps its outcome: accepted or declined means there was an offer.
  const offered = applied.filter((l) => l.stage === "offer" || l.outcome === "accepted" || l.outcome === "declined");
  const interviewed = applied.filter((l) => l.interviewedAt != null || offered.includes(l));
  return {
    open,
    applied: applied.length,
    interviewRate: applied.length ? interviewed.length / applied.length : 0,
    offerRate: applied.length ? offered.length / applied.length : 0,
  };
}
