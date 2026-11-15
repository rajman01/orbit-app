"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaPicker, GoalPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useActions } from "@/features/actions";
import {
  JOB_OUTCOME_LABEL,
  JOB_STAGE_LABEL,
  LEARNING_KIND_LABEL,
  LEARNING_STATUS_LABEL,
  SKILL_LEVELS,
  type JobLead,
  type JobOutcome,
  type JobStage,
  type LearningItem,
  type LearningKind,
  type LearningStatus,
  type Skill,
} from "@/features/career/model";
import { useSkills } from "@/features/data";
import { JOB_OUTCOMES, JOB_STAGES, LEARNING_KINDS, LEARNING_STATUSES } from "@/lib/sync/entities";
import { LevelDots } from "./level-dots";

const textarea =
  "field-sizing-content min-h-20 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";
const select =
  "h-control w-full rounded-md bg-surface-sunken px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Actions({
  onCancel,
  onDelete,
  saving,
  label,
}: {
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      {onDelete ? (
        <Button type="button" variant="ghost" icon={<Trash2 className="size-4 text-danger-text" />} onClick={onDelete}>
          <span className="text-danger-text">Delete</span>
        </Button>
      ) : null}
      <span className="ml-auto flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {label}
        </Button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- skills

/** CAR-2: add or edit a skill. */
export function SkillDialog({
  open,
  onOpenChange,
  skill,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  skill?: Skill;
  categories: string[];
  onSaved?: (id: string) => void;
}) {
  const actions = useActions();
  const [name, setName] = useState(skill?.name ?? "");
  const [category, setCategory] = useState(skill?.category ?? "");
  const [level, setLevel] = useState(skill?.level ?? 1);
  const [target, setTarget] = useState(skill?.targetLevel ?? 3);
  const [targetDate, setTargetDate] = useState(skill?.targetDate ?? "");
  const [areaId, setAreaId] = useState<string | null>(skill?.areaId ?? null);
  const [goalId, setGoalId] = useState<string | null>(skill?.goalId ?? null);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={skill ? "Edit skill" : "New skill"} width={480}>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setSaving(true);
          const fields = {
            name: name.trim(),
            category: category.trim(),
            targetLevel: Math.max(level, target),
            targetDate: targetDate || null,
            areaId,
            goalId,
          };
          let id = skill?.id;
          if (skill) await actions.updateSkill(skill, { ...fields, level });
          else id = await actions.createSkill({ ...fields, level });
          setSaving(false);
          onOpenChange(false);
          if (id) onSaved?.(id);
        }}
      >
        <Field label="Skill">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. System design"
            maxLength={120}
          />
        </Field>
        <Field label="Category">
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Engineering, Leadership"
            list="skill-categories"
            maxLength={60}
          />
          <datalist id="skill-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-footnote font-medium text-label-secondary">
              Level now · {SKILL_LEVELS[level].label}
            </span>
            <LevelDots level={level} target={Math.max(level, target)} name="level now" onChange={setLevel} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-footnote font-medium text-label-secondary">
              Aiming for · {SKILL_LEVELS[Math.max(level, target)].label}
            </span>
            <LevelDots level={level} target={Math.max(level, target)} name="target level" onChange={setTarget} />
          </div>
        </div>
        <Field label="By (optional)">
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={select} />
        </Field>
        <div className="flex flex-wrap items-center gap-1">
          <AreaPicker value={areaId} onChange={setAreaId} />
          <GoalPicker value={goalId} areaId={areaId} onChange={setGoalId} />
        </div>
        <Actions onCancel={() => onOpenChange(false)} saving={saving} label={skill ? "Save" : "Add skill"} />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- learning

/** CAR-3: add or edit something to learn from. */
export function LearningDialog({
  open,
  onOpenChange,
  item,
  skillId: initialSkill = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item?: LearningItem;
  skillId?: string | null;
}) {
  const actions = useActions();
  const skills = useSkills() ?? [];
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<LearningKind>(item?.kind ?? "book");
  const [author, setAuthor] = useState(item?.author ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [skillId, setSkillId] = useState<string | null>(item?.skillId ?? initialSkill);
  const [status, setStatus] = useState<LearningStatus>(item?.status ?? "queued");
  const [progress, setProgress] = useState(item?.progress ?? 0);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={item ? "Edit" : "Add to learn"} width={500}>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setSaving(true);
          const fields = {
            title: title.trim(),
            kind,
            author: author.trim() || null,
            url: url.trim() || null,
            skillId,
            notes,
          };
          if (item) {
            const changed = status !== item.status ? { status } : progress !== item.progress ? { progress } : {};
            await actions.updateLearningItem(item, { ...fields, ...changed });
          } else await actions.createLearningItem({ ...fields, status, progress });
          setSaving(false);
          onOpenChange(false);
        }}
      >
        <Field label="Title">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="e.g. Designing Data-Intensive Applications"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value as LearningKind)} className={select}>
              {LEARNING_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LEARNING_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="By (author, teacher)">
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <Field label="Link">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            inputMode="url"
            placeholder="https://"
            maxLength={1000}
          />
        </Field>
        <Field label="For the skill">
          <select value={skillId ?? ""} onChange={(e) => setSkillId(e.target.value || null)} className={select}>
            <option value="">No skill</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as LearningStatus)} className={select}>
            {LEARNING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEARNING_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {status === "in_progress" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">Progress · {progress}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              aria-label="Progress"
              onChange={(e) => setProgress(Number(e.target.value))}
              className="h-6 w-full accent-[var(--accent)]"
            />
          </label>
        ) : null}
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={textarea}
            placeholder="Takeaways, quotes, what to try"
          />
        </Field>
        <Actions
          onCancel={() => onOpenChange(false)}
          onDelete={
            item
              ? () => {
                  void actions.deleteLearningItem(item.id);
                  onOpenChange(false);
                }
              : undefined
          }
          saving={saving}
          label={item ? "Save" : "Add"}
        />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- job leads

/** CAR-4: add or edit a job lead. */
export function JobLeadDialog({
  open,
  onOpenChange,
  lead,
  stage: initialStage,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead?: JobLead;
  /** The stage to start on: a new lead's column, or where an existing lead was dragged. */
  stage?: JobStage;
}) {
  const actions = useActions();
  const [company, setCompany] = useState(lead?.company ?? "");
  const [role, setRole] = useState(lead?.role ?? "");
  const [url, setUrl] = useState(lead?.url ?? "");
  const [location, setLocation] = useState(lead?.location ?? "");
  const [salary, setSalary] = useState(lead?.salary ?? "");
  const [stage, setStage] = useState<JobStage>(initialStage ?? lead?.stage ?? "researching");
  const [outcome, setOutcome] = useState<JobOutcome | null>(lead?.outcome ?? null);
  const [nextStep, setNextStep] = useState(lead?.nextStep ?? "");
  const [nextDate, setNextDate] = useState(lead?.nextDate ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={lead ? `${lead.company}` : "New lead"} width={520}>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!company.trim()) return;
          setSaving(true);
          const fields = {
            company: company.trim(),
            role: role.trim(),
            url: url.trim() || null,
            location: location.trim() || null,
            salary: salary.trim() || null,
            nextStep: nextStep.trim(),
            nextDate: nextDate || null,
            notes,
          };
          if (lead) {
            await actions.updateJobLead(lead.id, fields);
            if (stage !== lead.stage || (stage === "closed" && outcome !== lead.outcome))
              await actions.moveJobLead(lead, stage, outcome);
          } else await actions.createJobLead({ ...fields, stage, outcome });
          setSaving(false);
          onOpenChange(false);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company">
            <Input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Role">
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={200}
              placeholder="e.g. Senior Product Designer"
            />
          </Field>
        </div>
        <Field label="Stage">
          <select value={stage} onChange={(e) => setStage(e.target.value as JobStage)} className={select}>
            {JOB_STAGES.map((s) => (
              <option key={s} value={s}>
                {JOB_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {stage === "closed" ? (
          <Field label="How it ended">
            <select
              value={outcome ?? ""}
              onChange={(e) => setOutcome((e.target.value || null) as JobOutcome | null)}
              className={select}
            >
              <option value="">Choose…</option>
              {JOB_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {JOB_OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field label="Next step">
              <Input
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                maxLength={300}
                placeholder="e.g. Follow up with the recruiter"
              />
            </Field>
            <Field label="On">
              <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={select} />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              placeholder="e.g. Remote, Lagos"
            />
          </Field>
          <Field label="Salary">
            <Input value={salary} onChange={(e) => setSalary(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <Field label="Job posting">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            inputMode="url"
            placeholder="https://"
            maxLength={1000}
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={textarea}
            placeholder="Who you spoke to, what they asked, how you felt"
          />
        </Field>
        <Actions
          onCancel={() => onOpenChange(false)}
          onDelete={
            lead
              ? () => {
                  void actions.deleteJobLead(lead.id);
                  onOpenChange(false);
                }
              : undefined
          }
          saving={saving}
          label={lead ? "Save" : "Add lead"}
        />
      </form>
    </Dialog>
  );
}
