import "server-only";
import type { Db } from "mongodb";

/**
 * Phase 3E (NOT-7): sending email, behind one small interface so moving from Postmark (now, no
 * domain) to Resend on a custom domain later changes only this file. With EMAIL_FAKE=1 (tests,
 * local) emails are stored in `emailOutbox` instead of being sent.
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** For the provider's stats ("weekly-report", "reminders"). */
  tag: string;
}

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

const fake = () => process.env.EMAIL_FAKE === "1";

/** Can Orbit send email at all? */
export function emailConfigured(): boolean {
  return fake() || Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.POSTMARK_FROM);
}

export async function sendEmail(db: Db, email: Email): Promise<EmailResult> {
  if (fake()) {
    const res = await db.collection("emailOutbox").insertOne({ ...email, at: new Date() });
    return { ok: true, id: String(res.insertedId) };
  }
  if (!emailConfigured()) return { ok: false, error: "email isn't set up" };
  try {
    const r = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN!,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM,
        To: email.to,
        Subject: email.subject,
        TextBody: email.text,
        HtmlBody: email.html,
        Tag: email.tag,
        MessageStream: "outbound",
        TrackOpens: false,
        TrackLinks: "None",
      }),
    });
    const body = (await r.json().catch(() => null)) as {
      ErrorCode?: number;
      Message?: string;
      MessageID?: string;
    } | null;
    if (!r.ok || !body || body.ErrorCode !== 0)
      return { ok: false, error: `${r.status} ${body?.ErrorCode ?? ""} ${body?.Message ?? ""}`.trim() };
    return { ok: true, id: body.MessageID ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A plain, readable HTML email (and its text twin) from sections of lines. No images, tracking or
 * remote content; links point back to Orbit.
 */
export function layout(opts: {
  heading: string;
  intro?: string;
  sections: { title: string; lines: string[] }[];
  button?: { label: string; url: string };
  footer: string;
}): { html: string; text: string } {
  const text = [
    opts.heading,
    opts.intro ?? "",
    ...opts.sections.flatMap((s) => ["", s.title.toUpperCase(), ...s.lines.map((l) => `- ${l}`)]),
    "",
    opts.button ? `${opts.button.label}: ${opts.button.url}` : "",
    "",
    opts.footer,
  ]
    .filter((l, i, a) => l || a[i - 1])
    .join("\n")
    .trim();
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px">
<h1 style="font-size:22px;margin:0 0 8px">${esc(opts.heading)}</h1>
${opts.intro ? `<p style="font-size:15px;line-height:1.5;color:#424245;margin:0 0 16px">${esc(opts.intro)}</p>` : ""}
${opts.sections
  .map(
    (
      s,
    ) => `<h2 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;margin:20px 0 6px">${esc(s.title)}</h2>
<ul style="margin:0;padding-left:18px;font-size:15px;line-height:1.55">${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`,
  )
  .join("\n")}
${opts.button ? `<p style="margin:24px 0 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#0E7C8F;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">${esc(opts.button.label)}</a></p>` : ""}
<p style="font-size:12px;line-height:1.5;color:#86868b;margin:28px 0 0">${esc(opts.footer)}</p>
</div></body></html>`;
  return { html, text };
}
