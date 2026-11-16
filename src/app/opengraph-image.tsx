import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The picture shown when an Orbit link is shared (WhatsApp, iMessage, Slack, X, LinkedIn): the
 * landing page's night-sky hero with its headline and a Today card. Built at deploy time.
 */

export const alt = "Orbit: Stop planning to start. Start. A Today screen with three must-dos.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Colours from the dark theme (src/styles/tokens.css): the hero is always night.
const ACCENT = "#40c8e0";
const XP_FROM = "#63e6e2";
const LABEL = "#f2f5f7";
const MUTED = "rgba(235, 240, 245, 0.62)";
const CARD = "#0d1a22";
const LINE = "rgba(255, 255, 255, 0.10)";

// Fixed "random" stars, so every build draws the same sky.
const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 173) % 1200,
  y: (i * 97 + (i % 7) * 31) % 630,
  r: i % 9 === 0 ? 2.2 : i % 3 === 0 ? 1.5 : 1,
  o: 0.25 + ((i * 37) % 60) / 100,
}));

const TASKS = [
  { title: "Send CV to 3 companies", step: "Open the doc and update the summary", color: "#0a84ff", done: true },
  { title: "Call mum", step: "Pick a time after dinner", color: "#ff375f", done: false },
  { title: "Set up emergency fund", step: "Open a savings account online", color: "#30d158", done: false },
];

// Geist (OFL, licence beside the files), the renderer's own face, in the weights the headline
// needs. Read once, from the project root, as Next's docs recommend.
const font = (weight: 400 | 700 | 800) =>
  readFile(join(process.cwd(), `assets/fonts/geist-sans-latin-${weight}-normal.woff`));
const FONTS = Promise.all([font(400), font(700), font(800)]);

export default async function Image() {
  const [regular, bold, heavy] = await FONTS;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background:
          "radial-gradient(70% 80% at 78% 45%, #0f3b4a 0%, rgba(15,59,74,0) 65%), linear-gradient(180deg, #04080d 0%, #06141c 55%, #082530 100%)",
        color: LABEL,
        fontFamily: "Geist",
      }}
    >
      {STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y,
            width: s.r * 2,
            height: s.r * 2,
            borderRadius: 9999,
            background: "white",
            opacity: s.o,
          }}
        />
      ))}

      {/* Left: the mark, the headline, the line under it. */}
      <div style={{ display: "flex", flexDirection: "column", padding: "72px 0 0 80px", width: 640 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width={44} height={44} viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="10.5" fill="none" stroke={ACCENT} strokeWidth="3" />
            <circle cx="24.5" cy="9" r="4" fill={ACCENT} />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>Orbit</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 64,
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: -3,
          }}
        >
          <div>Stop planning</div>
          <div style={{ display: "flex" }}>
            to start.&nbsp;
            <span style={{ color: XP_FROM }}>Start.</span>
          </div>
        </div>
        <div style={{ marginTop: 32, fontSize: 28, lineHeight: 1.4, color: MUTED, maxWidth: 520 }}>
          Your goals as a plan with clear next steps, and a coach that holds you to it.
        </div>
      </div>

      {/* Right: a Today card. */}
      <div
        style={{
          position: "absolute",
          right: 64,
          top: 96,
          width: 440,
          display: "flex",
          flexDirection: "column",
          borderRadius: 32,
          background: CARD,
          border: `1px solid ${LINE}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 120px rgba(64,200,224,0.18)",
          padding: "30px 30px 26px",
        }}
      >
        <div style={{ fontSize: 17, color: MUTED }}>Thursday 12 November</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>Today</div>
        <div style={{ marginTop: 18, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: MUTED }}>
          MUST-DOS · 1 OF 3 DONE
        </div>
        {TASKS.map((t) => (
          <div key={t.title} style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: t.done ? "none" : `2px solid ${MUTED}`,
                background: t.done ? "#30d158" : "transparent",
              }}
            >
              {t.done ? (
                <svg width={16} height={16} viewBox="0 0 12 12">
                  <path d="M3 6.2 5 8l4-4.2" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div
                style={{
                  fontSize: 22,
                  color: t.done ? MUTED : LABEL,
                  textDecoration: t.done ? "line-through" : "none",
                }}
              >
                {t.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: MUTED }}>
                <div style={{ width: 9, height: 9, borderRadius: 9999, background: t.color }} />
                {t.step}
              </div>
            </div>
          </div>
        ))}
        <div
          style={{
            marginTop: 26,
            height: 56,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: ACCENT,
            color: "#04121a",
            fontSize: 21,
            fontWeight: 700,
          }}
        >
          ▶ Start 5 minutes
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
        { name: "Geist", data: heavy, weight: 800, style: "normal" },
      ],
    },
  );
}
