import { COACH_SUBJECT_KINDS } from "@/lib/sync/entities";

/**
 * Phase 3H: a coach conversation about one goal, task, job or course. Each item has exactly one,
 * found by a fixed id, and every message in it carries the item's latest details.
 */
export type CoachSubjectKind = (typeof COACH_SUBJECT_KINDS)[number];
export interface CoachSubject {
  kind: CoachSubjectKind;
  id: string;
}

export const SUBJECT_KINDS = COACH_SUBJECT_KINDS;

/** The conversation's id: "cs", the kind's letter and the item's id (ids are at most 40 characters). */
export function subjectThreadId({ kind, id }: CoachSubject): string {
  return `cs${kind[0]}${id}`.slice(0, 40);
}

export function subjectOf(thread: { subjectKind?: CoachSubjectKind | null; subjectId?: string | null }) {
  return thread.subjectKind && thread.subjectId ? { kind: thread.subjectKind, id: thread.subjectId } : null;
}

export const SUBJECT_LABEL: Record<CoachSubjectKind, string> = {
  goal: "Goal",
  task: "Task",
  job: "Job",
  course: "Course",
  pot: "Savings pot",
  debt: "Debt",
};

/** Where the item lives (tasks open in the task panel instead). */
export function subjectHref({ kind, id }: CoachSubject): string | null {
  switch (kind) {
    case "goal":
      return `/goal?id=${id}`;
    case "job":
      return `/jobs/lead?id=${id}`;
    case "course":
      return `/learning/item?id=${id}`;
    case "pot":
      return "/money?tab=pots";
    case "debt":
      return "/money?tab=debts";
    case "task":
      return null;
  }
}

/** Ways to start, shown in an empty conversation. */
export const SUBJECT_SUGGESTIONS: Record<CoachSubjectKind, string[]> = {
  goal: ["What should I do next for this goal?", "I'm stuck on this. Help me get moving.", "Am I on track?"],
  task: ["Help me start this now.", "Break this into small steps.", "Why do I keep putting this off?"],
  job: [
    "What should my next step be?",
    "Help me prepare for the interview.",
    "Write a short follow-up message I can send.",
  ],
  course: ["Make me a study plan.", "I'm behind. Help me catch up.", "Quiz me on what I've covered."],
  pot: ["Will I make the target date?", "Where could the money come from?", "I put some in today. Log it."],
  debt: [
    "How do I clear this fastest?",
    "What does paying a bit more each month save?",
    "I paid some today. Record it.",
  ],
};

/** What the welcome says this conversation is for. */
export const SUBJECT_INTRO: Record<CoachSubjectKind, string> = {
  goal: "A conversation just about this goal. The coach sees its milestones, tasks and progress, and helps you move it forward.",
  task: "A conversation just about this task. The coach sees its steps and history, and helps you get it done.",
  job: "A conversation just about this application. The coach sees the role, your fit and your pack, and helps you land it.",
  course:
    "A conversation just about this course. The coach sees your sections, plan and pace, and helps you finish it.",
  pot: "A conversation just about this savings pot. The coach sees the balance, the target and your pace, and helps you get there.",
  debt: "A conversation just about this debt. The coach sees what's left, the rate and the plan, and helps you clear it.",
};
