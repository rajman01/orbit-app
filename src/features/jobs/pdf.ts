import type { PDFFont, PDFPage } from "pdf-lib";
import type { CareerProfileFields, TailoredCv } from "./model";
import { monthLabel } from "./model";

/**
 * Phase 3D.2: the tailored CV as a PDF, made on the device. Classic one column, real text in reading
 * order (application systems read it reliably), standard fonts, A4. pdf-lib is loaded only when a
 * CV is downloaded.
 */

/** The standard PDF fonts only cover Latin-1 and a few extras: map everything else to near ASCII. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–−]/g, "-")
    .replace(/—/g, "--")
    .replace(/…/g, "...")
    .replace(/[•●▪]/g, "-")
    .replace(/ /g, " ")
    .replace(/₦/g, "NGN ")
    .replace(/₹/g, "INR ")
    .replace(/€/g, "EUR ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export function wrapText(
  text: string,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  size: number,
  width: number,
): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        // A single word longer than the line is cut.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export async function buildCvPdf(profile: CareerProfileFields, cv: TailoredCv): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${profile.name} - CV`));
  doc.setAuthor(pdfSafe(profile.name));
  doc.setCreator("Orbit");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.38, 0.38, 0.42);
  const W = 595.28;
  const H = 841.89;
  const M = 50;
  const width = W - M * 2;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (s: string, x: number, size: number, font: PDFFont, color = ink) => {
    page.drawText(pdfSafe(s), { x, y, size, font, color });
  };
  const para = (s: string, size: number, font: PDFFont, color = ink, indent = 0, gap = 3) => {
    for (const line of wrapText(s, font, size, width - indent)) {
      ensure(size + gap);
      y -= size;
      text(line, M + indent, size, font, color);
      y -= gap;
    }
  };
  const heading = (s: string) => {
    ensure(34);
    y -= 14;
    y -= 11;
    text(s.toUpperCase(), M, 10.5, bold, ink);
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: muted });
    y -= 7;
  };
  const bullets = (items: { text: string }[]) => {
    for (const b of items) {
      const lines = wrapText(b.text, regular, 10, width - 14);
      ensure(lines.length * 13.5);
      lines.forEach((line, i) => {
        y -= 10;
        if (i === 0) text("-", M + 3, 10, regular, muted);
        text(line, M + 14, 10, regular);
        y -= 3.5;
      });
    }
  };

  // Name and contact.
  y -= 22;
  text(profile.name || "Your name", M, 22, bold);
  y -= 6;
  if (cv.headline) para(cv.headline, 11.5, regular, muted, 0, 2);
  const contact = [
    profile.contact.location,
    profile.contact.email,
    profile.contact.phone,
    ...profile.contact.links.map((l) => l.url.replace(/^https?:\/\//, "")),
  ]
    .filter(Boolean)
    .join("  |  ");
  if (contact) para(contact, 9.5, regular, muted, 0, 2);

  if (cv.summary) {
    heading("Summary");
    para(cv.summary, 10.5, regular, ink, 0, 3.5);
  }

  if (cv.experience.length) {
    heading("Experience");
    for (const role of cv.experience) {
      const dates = `${monthLabel(role.start)} - ${monthLabel(role.end)}`;
      ensure(40);
      y -= 11;
      const left = `${role.title} - ${role.company}`;
      const dw = regular.widthOfTextAtSize(pdfSafe(dates), 9.5);
      const leftLines = wrapText(left, bold, 11, width - dw - 12);
      text(leftLines[0], M, 11, bold);
      text(dates, W - M - dw, 9.5, regular, muted);
      for (const extra of leftLines.slice(1)) {
        y -= 13;
        text(extra, M, 11, bold);
      }
      y -= 3;
      if (role.location) para(role.location, 9.5, regular, muted, 0, 3);
      else y -= 2;
      bullets(role.bullets);
      y -= 4;
    }
  }

  if (cv.projects.length) {
    heading("Projects");
    for (const p of cv.projects) {
      ensure(30);
      para(p.url ? `${p.name} - ${p.url.replace(/^https?:\/\//, "")}` : p.name, 10.5, bold, ink, 0, 3);
      bullets(p.bullets);
      y -= 3;
    }
  }

  if (cv.skills.length) {
    heading("Skills");
    para(cv.skills.join(", "), 10, regular, ink, 0, 3.5);
  }

  const edu = profile.education.filter((e) => cv.education.includes(e.id));
  if (edu.length) {
    heading("Education");
    for (const e of edu) {
      const when =
        e.start || e.end
          ? `${e.start ? monthLabel(e.start) : ""}${e.start && e.end ? " - " : ""}${e.end ? monthLabel(e.end) : ""}`
          : "";
      para([e.degree, e.school].filter(Boolean).join(", ") + (when ? `  (${when})` : ""), 10.5, regular, ink, 0, 3);
    }
  }

  const certs = profile.certifications.filter((c) => cv.certifications.includes(c.id));
  if (certs.length) {
    heading("Certifications");
    for (const c of certs)
      para([c.name, c.issuer, c.year ? String(c.year) : ""].filter(Boolean).join(", "), 10.5, regular, ink, 0, 3);
  }

  return doc.save();
}

/** A file name like "Ada-Lovelace-CV-Acme.pdf". */
export function cvFileName(name: string, company: string): string {
  const clean = (s: string) =>
    pdfSafe(s)
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${[clean(name) || "CV", "CV", clean(company)].filter(Boolean).join("-")}.pdf`;
}
