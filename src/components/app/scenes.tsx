/**
 * Small space scenes for empty states. Colours come from design tokens, so they follow
 * light and dark mode. Decorative only; motion is slow orbits and twinkles (off when reduced).
 */

const A = "var(--accent)";
const LINE = "var(--fill-strong)";
const SURFACE = "var(--surface)";
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 224 128" className="w-full" fill="none" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

function Stars({ points }: { points: [number, number, number?][] }) {
  return (
    <>
      {points.map(([x, y, r = 1.4], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          fill="var(--label-tertiary)"
          className="twinkle"
          style={{ animationDelay: `${(i * 0.7) % 3}s` }}
        />
      ))}
    </>
  );
}

/** Today, nothing planned: a sun rising over a planet's horizon. */
export function ClearSkyScene() {
  const orange = "var(--area-orange)";
  return (
    <Scene>
      <Stars
        points={[
          [24, 22],
          [58, 44, 1],
          [176, 18],
          [202, 52, 1],
          [150, 40, 1.1],
          [88, 16, 1],
        ]}
      />
      <circle cx={112} cy={92} r={40} fill={mix(orange, 14)} />
      <circle cx={112} cy={92} r={26} fill={mix(orange, 30)} />
      <circle cx={112} cy={92} r={15} fill={orange} />
      <g className="orbit-spin" style={{ ["--orbit-duration" as string]: "60s", transformOrigin: "112px 92px" }}>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * 2 * Math.PI;
          return (
            <line
              key={i}
              x1={112 + 46 * Math.cos(a)}
              y1={92 + 46 * Math.sin(a)}
              x2={112 + 54 * Math.cos(a)}
              y2={92 + 54 * Math.sin(a)}
              stroke={orange}
              strokeOpacity={0.55}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          );
        })}
      </g>
      {/* horizon */}
      <path d="M-10 128 C 40 84, 184 84, 234 128 Z" fill="var(--bg)" />
      <path d="M-10 128 C 40 84, 184 84, 234 128 Z" fill={mix(A, 22)} />
      <path d="M-10 128 C 40 84, 184 84, 234 128" stroke={A} strokeWidth={2} />
      <circle cx={70} cy={112} r={5} fill={mix(A, 30)} />
      <circle cx={150} cy={108} r={8} fill={mix(A, 26)} />
      <circle cx={112} cy={120} r={3.5} fill={mix(A, 30)} />
    </Scene>
  );
}

/** Inbox zero: an empty tray, and a little rocket carrying the last item off. */
export function InboxZeroScene() {
  return (
    <Scene>
      <Stars
        points={[
          [30, 30],
          [66, 14, 1],
          [190, 26],
          [204, 70, 1],
          [22, 76, 1],
        ]}
      />
      <path
        d="M150 20 C 120 40, 104 58, 96 78"
        stroke={A}
        strokeWidth={2}
        strokeDasharray="1 7"
        strokeLinecap="round"
      />
      <g transform="translate(154 16) rotate(40)">
        <path d="M0 -14 C 8 -6, 8 6, 6 12 H-6 C -8 6, -8 -6, 0 -14 Z" fill={SURFACE} stroke={A} strokeWidth={2} />
        <circle cx={0} cy={-2} r={3} fill={A} />
        <path d="M-6 6 L-11 14 L-6 12 Z M6 6 L11 14 L6 12 Z" fill={A} />
        <path d="M-3 13 L0 21 L3 13 Z" fill="var(--area-orange)" />
      </g>
      <path
        d="M56 78 H168 L184 104 V114 a6 6 0 0 1 -6 6 H46 a6 6 0 0 1 -6 -6 V104 Z"
        fill={SURFACE}
        stroke={LINE}
        strokeWidth={2}
      />
      <path
        d="M40 104 H84 a4 4 0 0 1 4 4 a8 8 0 0 0 8 8 h32 a8 8 0 0 0 8 -8 a4 4 0 0 1 4 -4 H184"
        stroke={LINE}
        strokeWidth={2}
      />
      <path
        d="M100 94 l8 8 l16 -18"
        stroke="var(--success)"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Scene>
  );
}

/** Upcoming, nothing planned: days as stops along an orbit. */
export function UpcomingScene() {
  return (
    <Scene>
      <Stars
        points={[
          [20, 20],
          [200, 24, 1],
          [36, 104, 1],
          [196, 100],
        ]}
      />
      <ellipse
        cx={112}
        cy={64}
        rx={88}
        ry={38}
        stroke={LINE}
        strokeWidth={2}
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      <circle cx={112} cy={64} r={16} fill={mix(A, 20)} />
      <circle cx={112} cy={64} r={9} fill={A} />
      {Array.from({ length: 7 }, (_, i) => {
        const a = Math.PI + (i / 7) * 2 * Math.PI;
        const x = 112 + 88 * Math.cos(a);
        const y = 64 + 38 * Math.sin(a);
        return i === 0 ? (
          <circle key={i} cx={x} cy={y} r={7} fill={SURFACE} stroke={A} strokeWidth={2.5} />
        ) : (
          <circle key={i} cx={x} cy={y} r={4} fill={SURFACE} stroke={LINE} strokeWidth={2} />
        );
      })}
    </Scene>
  );
}

/** No goals: a flag planted on a small planet, with a path of steps toward it. */
export function GoalScene() {
  const blue = "var(--area-blue)";
  return (
    <Scene>
      <Stars
        points={[
          [26, 24],
          [70, 12, 1],
          [188, 20],
          [206, 64, 1],
          [150, 30, 1],
        ]}
      />
      <circle cx={132} cy={96} r={44} fill={mix(blue, 16)} />
      <circle cx={132} cy={96} r={44} stroke={blue} strokeOpacity={0.5} strokeWidth={2} />
      <circle cx={114} cy={84} r={7} fill={mix(blue, 22)} />
      <circle cx={150} cy={104} r={10} fill={mix(blue, 18)} />
      <line x1={132} y1={52} x2={132} y2={22} stroke="var(--label)" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M133 23 L160 31 L133 40 Z" fill={A} />
      <path
        d="M14 116 C 40 112, 60 100, 84 84"
        stroke={A}
        strokeWidth={2}
        strokeDasharray="1 7"
        strokeLinecap="round"
      />
      <circle cx={20} cy={115} r={4} fill={A} />
      <circle cx={46} cy={107} r={4} fill={A} />
      <circle cx={70} cy={94} r={6} fill={SURFACE} stroke={A} strokeWidth={2.5} />
    </Scene>
  );
}

/** No areas: the parts of a life as planets around one centre. */
export function AreasScene() {
  const planets: [number, string, number, number][] = [
    [26, "var(--area-blue)", 5, 0.4],
    [40, "var(--area-pink)", 6, 2.6],
    [54, "var(--area-green)", 5, 4.4],
    [54, "var(--area-orange)", 7, 1.2],
  ];
  return (
    <Scene>
      <Stars
        points={[
          [18, 18],
          [204, 22, 1],
          [30, 108, 1],
          [200, 104],
        ]}
      />
      {[26, 40, 54].map((r) => (
        <circle key={r} cx={112} cy={64} r={r} stroke={LINE} strokeWidth={1.5} />
      ))}
      <circle cx={112} cy={64} r={11} fill={A} />
      <g className="orbit-spin" style={{ ["--orbit-duration" as string]: "120s", transformOrigin: "112px 64px" }}>
        {planets.map(([r, color, size, a], i) => (
          <circle key={i} cx={112 + r * Math.cos(a)} cy={64 + r * Math.sin(a)} r={size} fill={color} />
        ))}
      </g>
    </Scene>
  );
}

/** No habits: a small planet with a dotted orbit of days, a few already lit. */
export function HabitsScene() {
  const lit = [0, 1, 2, 4, 5];
  return (
    <Scene>
      <Stars
        points={[
          [22, 20],
          [200, 26, 1],
          [30, 104, 1],
          [196, 100],
        ]}
      />
      <circle cx={112} cy={64} r={44} stroke={LINE} strokeWidth={1.5} strokeDasharray="2 6" />
      <circle cx={112} cy={64} r={16} fill={mix(A, 22)} />
      <circle cx={112} cy={64} r={9} fill={A} />
      <g className="orbit-spin" style={{ ["--orbit-duration" as string]: "90s", transformOrigin: "112px 64px" }}>
        {Array.from({ length: 7 }, (_, i) => {
          const a = -Math.PI / 2 + (i / 7) * 2 * Math.PI;
          const on = lit.includes(i);
          return (
            <circle
              key={i}
              cx={112 + 44 * Math.cos(a)}
              cy={64 + 44 * Math.sin(a)}
              r={on ? 5.5 : 4.5}
              fill={on ? "var(--area-orange)" : SURFACE}
              stroke={on ? "none" : LINE}
              strokeWidth={2}
            />
          );
        })}
      </g>
    </Scene>
  );
}
