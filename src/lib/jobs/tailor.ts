import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Db } from "mongodb";
import { ulid } from "ulid";
import { z } from "zod";
import { checkTailoredCv, trimText, type CareerProfileFields } from "@/features/jobs/model";
import { coachModels, recordUsage } from "@/lib/coach/server";
import { applicationPackSchema, type ApplicationPack, type TailoredCv } from "@/lib/sync/entities";
import { applyMutations } from "@/lib/sync/server";
import { loadProfile } from "./server";

/**
 * Phase 3D.2 (CAR-5): one tailored application — CV, cover letter, answers and a note to a
 * recruiter — from the career profile and the posting. The model may only reuse the profile's facts
 * and must say which profile bullets each CV line came from; checkTailoredCv then verifies roles,
 * dates and numbers and flags anything it can't trace. Nothing is ever sent to an employer.
 */

export class TailorError extends Error {}

const SYSTEM = `You tailor a job application for one person, using only the facts in their career profile (given as JSON with ids).

Hard rules — these matter more than anything else:
- Never invent or inflate. No employer, title, date, tool, metric, responsibility or result that isn't in the profile. You may reword, merge, reorder, shorten and choose what to emphasise; you may not add facts.
- Every CV bullet lists in "sources" the ids of the profile bullets it is based on ("summary" for the profile summary). If you can't cite a source for a line, leave the line out.
- Keep every number exactly as the profile states it.
- Use the profile's roleId and projectId values; leave dates, employers and locations to the profile.
- If the person doesn't meet a requirement, don't paper over it: say so in "concerns".

How to tailor:
- Find the posting's 5–8 must-haves and its key terms. In each role, lead with the bullets that prove them, and use the posting's wording where the profile genuinely supports it (application systems match keywords) without stuffing.
- Headline: their real title and level, pointed at this role. Summary: 2–3 specific sentences; no clichés ("passionate", "results-driven", "team player", "proven track record").
- Roles in reverse-chronological order: keep every role from the last 10 years (3–6 bullets for recent, relevant ones; 1–2 for others), drop older unrelated ones. Bullets start with a strong verb and show the outcome.
- Projects only if they help for this role. Skills: up to 15 from the profile, most relevant first.
- Cover letter: under 250 words, three short paragraphs, plain text, to the hiring team at the company: why this role and company (from the posting only), two or three concrete proofs from their experience, a simple close with their name. No placeholders.
- Answers: drafts for questions this application will likely ask — "Why do you want to work here?", "Why are you a good fit?", "Tell us about a relevant achievement" — and others the posting itself asks. 60–150 words each, first person, specific.
- Outreach: a note of 3–5 sentences (under 90 words) to a recruiter or hiring manager on LinkedIn or by email: who they are, the role, one concrete proof, a polite ask. No flattery.
- Write in the posting's variety of English (US or British). Plain text everywhere, no markdown.`;

const outputSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  experience: z.array(
    z.object({
      roleId: z.string(),
      title: z.string().describe("Their title as in the profile (it may be shortened, never changed)"),
      bullets: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })),
    }),
  ),
  projects: z.array(
    z.object({ projectId: z.string(), bullets: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })) }),
  ),
  skills: z.array(z.string()),
  educationIds: z.array(z.string()),
  certificationIds: z.array(z.string()),
  coverLetter: z.string(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })),
  outreach: z.string(),
  concerns: z
    .array(z.string())
    .describe("Requirements they don't meet, things to be ready to explain, anything you were unsure about"),
});
type Output = z.infer<typeof outputSchema>;

/** The profile as the model sees it: facts with their ids, nothing else. */
function profileForModel(p: CareerProfileFields) {
  return {
    name: p.name,
    headline: p.headline,
    location: p.contact.location,
    summary: p.summary,
    experience: p.experience.map((e) => ({
      roleId: e.id,
      title: e.title,
      company: e.company,
      location: e.location,
      from: e.start,
      to: e.end ?? "present",
      bullets: e.bullets.map((b) => ({ id: b.id, text: b.text })),
    })),
    projects: p.projects.map((x) => ({
      projectId: x.id,
      name: x.name,
      bullets: x.bullets.map((b) => ({ id: b.id, text: b.text })),
    })),
    education: p.education.map((e) => ({ id: e.id, school: e.school, degree: e.degree, from: e.start, to: e.end })),
    certifications: p.certifications.map((c) => ({ id: c.id, name: c.name, issuer: c.issuer, year: c.year })),
    skills: p.skills,
  };
}

let client: Anthropic | undefined;

async function callModel(
  db: Db,
  userId: string,
  profile: CareerProfileFields,
  posting: string,
): Promise<Output | null> {
  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model: coachModels().chat,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    // If the model declines, the API retries on a suitable model inside the same call.
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(outputSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Career profile:\n${JSON.stringify(profileForModel(profile))}\n\nJob posting:\n${posting}`,
      },
    ],
  });
  const message = await stream.finalMessage();
  await recordUsage(db, userId, message.usage, "chat").catch(() => {});
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  return (message.parsed_output as Output | null) ?? null;
}

/** Tests: a pack built straight from the profile (no model). */
function fakeOutput(profile: CareerProfileFields, company: string, role: string): Output {
  return {
    headline: profile.headline || role,
    summary: profile.summary.slice(0, 300),
    experience: profile.experience.map((e) => ({
      roleId: e.id,
      title: e.title,
      bullets: e.bullets.slice(0, 4).map((b) => ({ text: b.text, sources: [b.id] })),
    })),
    projects: [],
    skills: profile.skills.slice(0, 10),
    educationIds: profile.education.map((e) => e.id),
    certificationIds: profile.certifications.map((c) => c.id),
    coverLetter: `Dear ${company} hiring team,\n\nI'm applying for the ${role} role.\n\n${profile.name}`,
    answers: [{ question: `Why do you want to work at ${company}?`, answer: `Because of the ${role} work.` }],
    outreach: `Hi, I've applied for the ${role} role at ${company} and would love to talk.`,
    concerns: [],
  };
}

/**
 * Prepares the application pack for a lead and saves it on the lead (synced to every device).
 * The posting comes from the found role the lead was made from, or the lead's own notes and link.
 */
export async function tailorLead(db: Db, userId: string, leadId: string, now: number): Promise<ApplicationPack> {
  const lead = await db.collection("jobLeads").findOne({ _id: leadId as never, userId, deletedAt: null });
  if (!lead) throw new TailorError("That lead doesn't exist.");
  const profile = await loadProfile(db, userId);
  if (!profile || !profile.experience.some((e) => e.bullets.length))
    throw new TailorError("Add your roles and what you did in them to your career profile first.");
  const posting = lead.postingId
    ? await db.collection("jobPostings").findOne({ _id: lead.postingId as never, userId, deletedAt: null })
    : null;
  const company = String(posting?.company || lead.company);
  const role = String(posting?.title || lead.role || "the role");
  const description = String(posting?.description || lead.notes || "");
  if (description.trim().length < 80)
    throw new TailorError(
      "Orbit needs the job description to tailor for it. Add the posting's text to the lead's notes (or make the lead from a found role).",
    );
  const postingText = trimText(
    [
      `${role} at ${company}`,
      posting?.location || lead.location ? `Location: ${posting?.location || lead.location}` : "",
      description,
    ]
      .filter(Boolean)
      .join("\n"),
    20000,
  );

  const out =
    process.env.COACH_FAKE === "1"
      ? fakeOutput(profile, company, role)
      : await callModel(db, userId, profile, postingText);
  if (!out) throw new TailorError("Couldn't prepare it this time. Try again in a moment.");

  const draft: TailoredCv = {
    headline: out.headline.trim().slice(0, 200),
    summary: out.summary.trim().slice(0, 2000),
    experience: out.experience.slice(0, 15).map((x) => ({
      roleId: x.roleId,
      company: "",
      title: x.title.trim(),
      location: "",
      start: "",
      end: null,
      bullets: x.bullets
        .slice(0, 10)
        .map((b) => ({ text: b.text.trim().slice(0, 500), sources: b.sources.slice(0, 6) })),
    })),
    projects: out.projects.slice(0, 6).map((x) => {
      const p = profile.projects.find((y) => y.id === x.projectId);
      return {
        projectId: x.projectId,
        name: p?.name ?? "",
        url: p?.url ?? "",
        bullets: x.bullets
          .slice(0, 5)
          .map((b) => ({ text: b.text.trim().slice(0, 500), sources: b.sources.slice(0, 6) })),
      };
    }),
    skills: out.skills
      .map((s) => s.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 30),
    education: out.educationIds.slice(0, 10),
    certifications: out.certificationIds.slice(0, 20),
  };
  const { cv, flags } = checkTailoredCv(draft, profile);
  const pack: ApplicationPack = {
    cv,
    coverLetter: out.coverLetter.trim().slice(0, 6000),
    answers: out.answers
      .slice(0, 10)
      .map((a) => ({ question: a.question.trim().slice(0, 300), answer: a.answer.trim().slice(0, 3000) })),
    outreach: out.outreach.trim().slice(0, 1500),
    flags: [...flags, ...out.concerns.map((c) => `To be ready for: ${c.trim()}`)]
      .map((f) => f.slice(0, 300))
      .slice(0, 30),
    model: process.env.COACH_FAKE === "1" ? "fake" : coachModels().chat,
    generatedAt: now,
  };
  const valid = applicationPackSchema.parse(pack);
  const fields: Record<string, unknown> = { pack: valid };
  if (lead.nextStep === "Prepare the application") fields.nextStep = "Review and apply";
  const res = await applyMutations(db, userId, [
    { mutationId: ulid(), entity: "jobLeads", entityId: leadId, op: "upsert", fields, clientTime: now },
  ]);
  if (res.rejected.length) throw new TailorError("Couldn't save the pack. Try again.");
  return valid;
}
