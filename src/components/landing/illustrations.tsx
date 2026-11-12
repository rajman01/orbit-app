/**
 * Flat illustrations for the landing page. All colours come from design tokens, so they
 * adapt to light and dark mode. Each one plays a small looping story using the `il-*`
 * animations in globals.css (off when reduced motion is on). Decorative only (aria-hidden).
 */

const A = "var(--accent)";
const LABEL = "var(--label)";
const MUTED = "var(--label-tertiary)";
const SURFACE = "var(--surface)";
const LINE = "var(--fill-strong)";
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

type P = { className?: string };

/** CSS custom properties for the animation classes (delay, duration, …). */
const vars = (v: Record<string, string>) => v as React.CSSProperties;
const d = (seconds: number) => vars({ "--il-d": `${seconds}s` });

function Svg({ w, h, className, children }: { w: number; h: number; className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`il ${className ?? ""}`}
      fill="none"
      aria-hidden
      focusable="false"
      style={{ fontFamily: "inherit" }}
    >
      {children}
    </svg>
  );
}

/** A tiny card with text lines, used in several scenes. */
function Lines({ x, y, w, n = 2, color = LINE }: { x: number; y: number; w: number; n?: number; color?: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x} y={y + i * 9} width={i === n - 1 ? w * 0.6 : w} height={4} rx={2} fill={color} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- features

/** Steps light up along the path, the next step pulses, the flag waves at the summit. */
export function GoalsIllustration({ className }: P) {
  const blue = "var(--area-blue)";
  return (
    <Svg w={240} h={140} className={className}>
      <path d="M0 122 C 50 104, 90 116, 130 106 S 210 96, 240 108 V140 H0Z" fill={mix(blue, 10)} />
      <path d="M44 124 L118 34 L192 124 Z" fill={mix(blue, 22)} />
      <path d="M118 34 L138 58 L128 54 L118 62 L108 54 L98 58 Z" fill={SURFACE} opacity={0.9} />
      <line x1={118} y1={34} x2={118} y2={10} stroke={LABEL} strokeWidth={2} strokeLinecap="round" />
      <path className="il-wave" d="M118 11 L142 17 L118 24 Z" fill={blue} />
      {/* path of steps up the mountain */}
      <path
        className="il-march-back"
        d="M30 128 C 60 120, 70 110, 82 104 S 100 86, 108 74 S 114 52, 118 40"
        stroke={A}
        strokeWidth={2}
        strokeDasharray="1 7"
        strokeLinecap="round"
      />
      {[
        [36, 126],
        [56, 119],
        [74, 109],
      ].map(([x, y], i) => (
        <circle key={x} className="il-pop" style={d(i * 0.5)} cx={x} cy={y} r={4} fill={A} />
      ))}
      <circle className="il-pulse" style={d(1.5)} cx={92} cy={96} r={7} fill={SURFACE} stroke={A} strokeWidth={2.5} />
      <g className="il-pop" style={d(1.7)}>
        <g transform="translate(150 70)">
          <rect width={74} height={26} rx={13} fill={SURFACE} stroke={LINE} />
          <circle cx={13} cy={13} r={4} fill={A} />
          <text x={23} y={17} fontSize={10} fontWeight={600} fill={LABEL}>
            Next step
          </text>
        </g>
      </g>
      <path
        className="il-march"
        d="M150 83 C 130 86, 112 92, 101 95"
        stroke={MUTED}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
    </Svg>
  );
}

/** The cycle ring fills day by day; the knob travels with it; Review lights up at the end. */
export function CycleIllustration({ className }: P) {
  const cx = 120;
  const cy = 72;
  const r = 46;
  const progress = 0.62;
  const days = Math.round(progress * 14);
  return (
    <Svg w={240} h={140} className={className}>
      <circle cx={cx} cy={cy} r={62} fill={mix("var(--accent)", 7)} />
      {Array.from({ length: 14 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 14) * 2 * Math.PI;
        const done = i / 14 < progress;
        return (
          <circle
            key={i}
            className={done ? "il-dot-on" : undefined}
            style={done ? d((i / days) * 2.1) : undefined}
            cx={cx + Math.cos(a) * (r + 13)}
            cy={cy + Math.sin(a) * (r + 13)}
            r={2.6}
            fill={done ? A : LINE}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r} stroke={LINE} strokeWidth={8} />
      <circle
        className="il-sweep"
        style={vars({ "--il-arc": `${progress * 100}` })}
        cx={cx}
        cy={cy}
        r={r}
        stroke={A}
        strokeWidth={8}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${progress * 100} 100`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <g
        className="il-turn"
        style={{ ...vars({ "--il-angle": `${progress * 360}deg` }), transformOrigin: `${cx}px ${cy}px` }}
      >
        <circle cx={cx} cy={cy - r} r={8} fill={SURFACE} stroke={A} strokeWidth={3} />
      </g>
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={20} fontWeight={700} fill={LABEL}>
        9
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize={9} fontWeight={500} fill={MUTED}>
        of 14 days
      </text>
      <g transform="translate(14 18)">
        <rect width={58} height={22} rx={11} fill={SURFACE} stroke={LINE} />
        <text x={29} y={15} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={LABEL}>
          Commit
        </text>
      </g>
      <g className="il-pop" style={vars({ "--il-t": "7s", "--il-d": "2.3s" })}>
        <g transform="translate(168 104)">
          <rect width={58} height={22} rx={11} fill={A} />
          <text x={29} y={15} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#fff">
            Review
          </text>
        </g>
      </g>
    </Svg>
  );
}

/** The timer runs down, the big task sways, and the small first step gets ticked. */
export function StartIllustration({ className }: P) {
  const orange = "var(--area-orange)";
  return (
    <Svg w={240} h={140} className={className}>
      {/* the big scary task */}
      <g className="il-wobble">
        <g transform="rotate(4 178 76)">
          <rect x={130} y={30} width={96} height={86} rx={16} fill={SURFACE} stroke={LINE} strokeWidth={1.5} />
          <Lines x={144} y={46} w={66} n={3} />
          <rect x={144} y={80} width={40} height={6} rx={3} fill={LINE} />
          <rect x={144} y={92} width={56} height={6} rx={3} fill={LINE} />
        </g>
      </g>
      <path
        className="il-march"
        d="M128 92 C 112 98, 106 104, 98 106"
        stroke={MUTED}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
      <path
        d="M100 101 L96 107 L103 109"
        stroke={MUTED}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the two-minute first step */}
      <g className="il-pop" style={d(0.4)}>
        <rect x={46} y={92} width={50} height={30} rx={10} fill={A} />
        <path
          className="il-draw"
          style={d(0.9)}
          pathLength={1}
          d="M62 107 l5 5 l10 -11"
          stroke="#fff"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* five-minute timer */}
      <circle className="il-pulse" cx={58} cy={48} r={28} fill={mix(orange, 12)} />
      <circle cx={58} cy={48} r={20} stroke={LINE} strokeWidth={5} />
      <circle
        className="il-countdown"
        cx={58}
        cy={48}
        r={20}
        stroke={orange}
        strokeWidth={5}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="22 100"
        transform="rotate(-90 58 48)"
      />
      <text x={58} y={52} textAnchor="middle" fontSize={11} fontWeight={700} fill={LABEL}>
        5:00
      </text>
      <rect x={54} y={16} width={8} height={5} rx={2} fill={orange} />
    </Svg>
  );
}

/** The postponed card gets pinned, its badge pulses, and Orbit asks why. */
export function AccountabilityIllustration({ className }: P) {
  const warn = "var(--warning)";
  return (
    <Svg w={240} h={140} className={className}>
      <g className="il-wobble" style={d(0.6)}>
        <g transform="rotate(-8 100 80)">
          <rect x={52} y={44} width={110} height={62} rx={12} fill={SURFACE} stroke={LINE} />
        </g>
      </g>
      <g className="il-wobble">
        <g transform="rotate(-3 100 80)">
          <rect x={56} y={40} width={110} height={62} rx={12} fill={SURFACE} stroke={LINE} />
        </g>
      </g>
      <rect x={60} y={36} width={110} height={62} rx={12} fill={SURFACE} stroke={mix(warn, 60)} strokeWidth={1.5} />
      <circle cx={78} cy={56} r={6} stroke={MUTED} strokeWidth={1.5} />
      <Lines x={92} y={52} w={58} n={2} />
      <g className="il-pulse" style={d(1)}>
        <g transform="translate(76 76)">
          <rect width={52} height={16} rx={8} fill={mix(warn, 18)} />
          <text x={26} y={11.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--warning-text)">
            Postponed 3×
          </text>
        </g>
      </g>
      {/* pin */}
      <g className="il-pin">
        <circle cx={164} cy={38} r={9} fill={warn} />
        <circle cx={161} cy={35} r={3} fill="#fff" opacity={0.6} />
        <line x1={164} y1={47} x2={160} y2={58} stroke={LABEL} strokeWidth={2} strokeLinecap="round" />
      </g>
      {/* why? bubble */}
      <g className="il-pop" style={d(1.1)}>
        <g transform="translate(176 76)">
          <path
            d="M8 0 H48 a8 8 0 0 1 8 8 V24 a8 8 0 0 1 -8 8 H18 L8 40 L10 32 H8 a8 8 0 0 1 -8 -8 V8 a8 8 0 0 1 8 -8Z"
            fill={A}
          />
          <text x={28} y={21} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
            Why?
          </text>
        </g>
      </g>
    </Svg>
  );
}

function Person({
  x,
  y,
  color,
  r = 18,
  delay = 0,
}: {
  x: number;
  y: number;
  color: string;
  r?: number;
  delay?: number;
}) {
  return (
    <g>
      <circle className="il-pulse" style={d(delay)} cx={x} cy={y} r={r} fill={mix(color, 22)} />
      <circle cx={x} cy={y - r * 0.22} r={r * 0.32} fill={color} />
      <path d={`M${x - r * 0.55} ${y + r * 0.62} a ${r * 0.55} ${r * 0.48} 0 0 1 ${r * 1.1} 0`} fill={color} />
    </g>
  );
}

/** Connections flow between people, the heart beats, a reminder pops up. */
export function PeopleIllustration({ className }: P) {
  const pink = "var(--area-pink)";
  return (
    <Svg w={240} h={140} className={className}>
      <path className="il-march" d="M62 52 Q 120 20 178 52" stroke={LINE} strokeWidth={2} strokeDasharray="4 4" />
      <path className="il-march" d="M62 52 Q 90 100 120 104" stroke={LINE} strokeWidth={2} strokeDasharray="4 4" />
      <path
        className="il-march-back"
        d="M178 52 Q 150 100 120 104"
        stroke={LINE}
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      <Person x={62} y={52} color={pink} />
      <Person x={178} y={52} color="var(--area-orange)" delay={0.7} />
      <Person x={120} y={104} color="var(--area-blue)" r={20} delay={1.4} />
      <path
        className="il-beat"
        d="M120 66 c -4 -6 -14 -5 -14 3 c 0 6 8 11 14 15 c 6 -4 14 -9 14 -15 c 0 -8 -10 -9 -14 -3Z"
        fill={pink}
      />
      <g className="il-pop" style={d(0.8)}>
        <g transform="translate(150 92)">
          <rect width={78} height={30} rx={10} fill={SURFACE} stroke={LINE} />
          <rect x={8} y={8} width={14} height={14} rx={3} fill={mix(pink, 22)} />
          <rect x={8} y={8} width={14} height={4} rx={2} fill={pink} />
          <text x={28} y={14} fontSize={8.5} fontWeight={700} fill={LABEL}>
            Call mum
          </text>
          <text x={28} y={24} fontSize={7.5} fill={MUTED}>
            Saturday · overdue
          </text>
        </g>
      </g>
    </Svg>
  );
}

function Sparkle({
  x,
  y,
  s = 1,
  color = A,
  delay = 0,
}: {
  x: number;
  y: number;
  s?: number;
  color?: string;
  delay?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        className="il-twinkle"
        style={d(delay)}
        d="M0 -10 C 1.5 -3, 3 -1.5, 10 0 C 3 1.5, 1.5 3, 0 10 C -1.5 3, -3 1.5, -10 0 C -3 -1.5, -1.5 -3, 0 -10Z"
        fill={color}
      />
    </g>
  );
}

/** You say what you want; the coach's plan writes itself line by line. */
export function CoachIllustration({ className }: P) {
  const purple = "var(--area-purple)";
  const T = vars({ "--il-t": "7s" });
  return (
    <Svg w={240} h={140} className={className}>
      {/* you */}
      <g className="il-pop" style={T}>
        <g transform="translate(14 18)">
          <path
            d="M10 0 H96 a10 10 0 0 1 10 10 V26 a10 10 0 0 1 -10 10 H24 L12 46 L14 36 H10 a10 10 0 0 1 -10 -10 V10 a10 10 0 0 1 10 -10Z"
            fill={mix(A, 16)}
          />
          <text x={12} y={16} fontSize={9} fontWeight={600} fill={LABEL}>
            I want a better
          </text>
          <text x={12} y={28} fontSize={9} fontWeight={600} fill={LABEL}>
            role this year
          </text>
        </g>
      </g>
      {/* coach's plan */}
      <g className="il-pop" style={{ ...T, ...d(0.9) }}>
        <g transform="translate(96 58)">
          <rect width={130} height={70} rx={14} fill={SURFACE} stroke={LINE} />
          <Sparkle x={16} y={16} s={0.65} color={purple} />
          <text x={28} y={19} fontSize={9} fontWeight={700} fill={LABEL}>
            Plan created
          </text>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(12 ${32 + i * 12})`}>
              <circle cx={4} cy={0} r={4} fill={i === 0 ? A : "none"} stroke={i === 0 ? A : MUTED} strokeWidth={1.2} />
              <rect
                className="il-grow-x"
                style={{ ...T, ...d(1.5 + i * 0.35) }}
                x={14}
                y={-2}
                width={i === 2 ? 50 : 76}
                height={4}
                rx={2}
                fill={LINE}
              />
            </g>
          ))}
          <rect x={86} y={8} width={34} height={14} rx={7} fill={mix(A, 14)} />
          <text x={103} y={18} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--accent-text)">
            Undo
          </text>
        </g>
      </g>
      <Sparkle x={196} y={30} s={1.1} color={purple} />
      <Sparkle x={216} y={48} s={0.55} color={A} delay={0.9} />
      <Sparkle x={70} y={92} s={0.6} color={purple} delay={1.7} />
    </Svg>
  );
}

// ---------------------------------------------------------------- steps

/** Notes drop into the inbox one after another. */
export function CaptureIllustration({ className }: P) {
  return (
    <Svg w={200} h={120} className={className}>
      <g className="il-drop">
        <g transform="rotate(-14 70 30)">
          <rect x={46} y={14} width={54} height={30} rx={8} fill={SURFACE} stroke={LINE} />
          <Lines x={54} y={23} w={36} />
        </g>
      </g>
      <g className="il-drop" style={d(1.8)}>
        <g transform="rotate(10 130 26)">
          <rect x={104} y={10} width={54} height={30} rx={8} fill={SURFACE} stroke={LINE} />
          <Lines x={112} y={19} w={36} />
        </g>
      </g>
      <g className="il-drop" style={d(3.6)}>
        <rect x={76} y={30} width={50} height={28} rx={8} fill={SURFACE} stroke={A} strokeWidth={1.5} />
        <Lines x={84} y={38} w={32} color={mix(A, 40)} />
      </g>
      <path d="M40 74 H160 L150 108 a8 8 0 0 1 -8 6 H58 a8 8 0 0 1 -8 -6 Z" fill="var(--surface-sunken)" />
      <path d="M40 74 H160 L150 108 a8 8 0 0 1 -8 6 H58 a8 8 0 0 1 -8 -6 Z" fill={mix(A, 18)} />
      <path d="M40 74 H76 a24 14 0 0 0 48 0 H160" stroke={A} strokeWidth={2.5} strokeLinejoin="round" />
    </Svg>
  );
}

/** The cycle's days fill in as you commit to them. */
export function PlanIllustration({ className }: P) {
  const filledCells = [1, 3, 4, 8, 10, 12];
  return (
    <Svg w={200} h={120} className={className}>
      <rect x={30} y={14} width={140} height={96} rx={14} fill={SURFACE} stroke={LINE} />
      <rect x={30} y={14} width={140} height={22} rx={14} fill={mix(A, 16)} />
      <rect x={30} y={28} width={140} height={8} fill={mix(A, 16)} />
      <text x={44} y={29} fontSize={9} fontWeight={700} fill="var(--accent-text)">
        Cycle 4 · 14 days
      </text>
      {Array.from({ length: 14 }, (_, i) => {
        const col = i % 7;
        const row = Math.floor(i / 7);
        const x = 42 + col * 18;
        const y = 48 + row * 26;
        const order = filledCells.indexOf(i);
        return (
          <g key={i}>
            <rect x={x} y={y} width={13} height={18} rx={4} fill="var(--fill)" />
            {order >= 0 ? (
              <rect
                className="il-pop"
                style={d(0.3 + order * 0.35)}
                x={x}
                y={y}
                width={13}
                height={18}
                rx={4}
                fill={A}
              />
            ) : null}
            {i === 0 || i === 7 ? <circle cx={x + 6.5} cy={y - 4} r={1.6} fill={MUTED} /> : null}
          </g>
        );
      })}
    </Svg>
  );
}

/** Three Must-dos get ticked off, one by one. */
export function DoIllustration({ className }: P) {
  return (
    <Svg w={200} h={120} className={className}>
      {[0, 1, 2].map((i) => {
        const delay = 0.5 + i * 1.1;
        return (
          <g key={i} transform={`translate(34 ${18 + i * 32})`}>
            <rect width={132} height={26} rx={9} fill={SURFACE} stroke={LINE} />
            <rect
              className="il-dot-on"
              style={{ ...vars({ "--il-t": "6s" }), ...d(delay) }}
              width={132}
              height={26}
              rx={9}
              stroke={A}
              strokeWidth={1.5}
            />
            <circle cx={14} cy={13} r={7} stroke={MUTED} strokeWidth={1.5} />
            <circle className="il-pop" style={d(delay)} cx={14} cy={13} r={7.75} fill={A} />
            <path
              className="il-draw"
              style={d(delay + 0.2)}
              pathLength={1}
              d="M10.5 13 l2.5 2.5 l4.5 -5"
              stroke="#fff"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x={28} y={11} width={i === 1 ? 58 : 74} height={4} rx={2} fill={LINE} />
            <g transform="translate(118 13) scale(0.42)">
              <path
                className="il-twinkle"
                style={d(i * 0.6)}
                d="M0 -10 L3 -3 L10 -3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10 -3 L-3 -3Z"
                fill={A}
              />
            </g>
          </g>
        );
      })}
    </Svg>
  );
}

/** The bars grow, the trend line draws, the level ring fills, and you level up. */
export function ReviewIllustration({ className }: P) {
  const bars = [26, 38, 32, 52, 64];
  return (
    <Svg w={200} h={120} className={className}>
      <line x1={30} y1={104} x2={130} y2={104} stroke={LINE} strokeWidth={2} strokeLinecap="round" />
      {bars.map((h, i) => (
        <rect
          key={i}
          className="il-grow-y"
          style={d(i * 0.22)}
          x={36 + i * 19}
          y={104 - h}
          width={12}
          height={h}
          rx={4}
          fill={i === bars.length - 1 ? A : mix(A, 30)}
        />
      ))}
      <path
        className="il-draw"
        style={d(1.2)}
        pathLength={1}
        d="M42 70 L61 58 L80 64 L99 44 L118 30"
        stroke={MUTED}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={158} cy={52} r={26} fill={mix(A, 12)} />
      <circle
        className="il-sweep"
        style={vars({ "--il-arc": "78", "--il-t": "6s" })}
        cx={158}
        cy={52}
        r={20}
        stroke={A}
        strokeWidth={4}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="78 100"
        transform="rotate(-90 158 52)"
      />
      <text x={158} y={57} textAnchor="middle" fontSize={15} fontWeight={800} fill={LABEL}>
        8
      </text>
      <g className="il-pop" style={d(2)}>
        <g transform="translate(134 86)">
          <rect width={48} height={18} rx={9} fill={A} />
          <text x={24} y={12.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#fff">
            Level up
          </text>
        </g>
      </g>
    </Svg>
  );
}

// ---------------------------------------------------------------- problem + hero

/** A closed elliptical path centred on the origin, rotated by `rot` degrees, for `offset-path`. */
function ellipsePath(rx: number, ry: number, rot: number): string {
  const a = (rot * Math.PI) / 180;
  const x = (rx * Math.cos(a)).toFixed(2);
  const y = (rx * Math.sin(a)).toFixed(2);
  return `M ${x} ${y} A ${rx} ${ry} ${rot} 1 1 ${-x} ${-y} A ${rx} ${ry} ${rot} 1 1 ${x} ${y} Z`;
}

/** Scattered ambitions jitter on the left; on the right they travel in calm orbits. */
export function ChaosToOrbitIllustration({ className }: P) {
  const dots: [number, number, string][] = [
    [34, 40, "var(--area-blue)"],
    [78, 24, "var(--area-pink)"],
    [60, 74, "var(--area-green)"],
    [104, 58, "var(--area-orange)"],
    [26, 98, "var(--area-orange)"],
    [92, 112, "var(--area-blue)"],
    [130, 92, "var(--area-pink)"],
    [124, 30, "var(--area-green)"],
  ];
  const orbit = (rx: number, ry: number, rot: number) => (
    <ellipse cx={0} cy={0} rx={rx} ry={ry} transform={`rotate(${rot})`} stroke={LINE} strokeWidth={1.5} />
  );
  // [rx, ry, rotation, start along the orbit, colour, seconds per orbit]
  const planets: [number, number, number, string, string, number][] = [
    [96, 34, -12, "6%", "var(--area-blue)", 16],
    [96, 34, -12, "57%", "var(--area-orange)", 16],
    [70, 52, 30, "30%", "var(--area-pink)", 11],
    [70, 52, 30, "80%", "var(--area-green)", 11],
  ];
  return (
    <Svg w={520} h={150} className={className}>
      {/* tangled scribble behind the scattered dots */}
      <path
        className="il-march"
        d="M20 70 C 40 20, 90 10, 110 40 S 70 110, 50 90 S 120 30, 140 70 S 90 130, 40 120 S 10 60, 60 50"
        stroke={LINE}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="10 2"
      />
      {dots.map(([x, y, c], i) => (
        <circle
          key={i}
          className="il-jitter"
          style={vars({
            "--dx": `${3 + (i % 3) * 2}px`,
            "--dy": `${4 + ((i * 2) % 3) * 2}px`,
            "--il-t": `${1.1 + (i % 4) * 0.25}s`,
            "--il-d": `${-i * 0.3}s`,
          })}
          cx={x}
          cy={y}
          r={6}
          fill={c}
          opacity={0.85}
        />
      ))}
      {/* arrow */}
      <path
        className="il-march"
        d="M190 75 H300"
        stroke={MUTED}
        strokeWidth={2}
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      <path d="M296 69 L304 75 L296 81" stroke={MUTED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* orbit */}
      <g transform="translate(420 75)">
        {orbit(96, 34, -12)}
        {orbit(70, 52, 30)}
        <circle className="il-pulse" r={20} fill={A} />
        <circle r={8} fill="#fff" opacity={0.9} />
        {planets.map(([rx, ry, rot, start, c, seconds], i) => (
          <circle
            key={i}
            className="il-orbit"
            style={{
              ...vars({ "--il-start": start, "--il-t": `${seconds}s` }),
              offsetPath: `path("${ellipsePath(rx, ry, rot)}")`,
            }}
            r={7}
            fill={c}
            stroke={SURFACE}
            strokeWidth={2.5}
          />
        ))}
      </g>
    </Svg>
  );
}

/** Big faint orbit rings behind the hero mock-up; the planets drift slowly around it. */
export function HeroOrbits({ className }: P) {
  const outer: [number, number, string][] = [
    [-152, 11, "var(--area-blue)"],
    [21, 8, "var(--area-orange)"],
    [159, 9, "var(--area-pink)"],
    [64, 7, "var(--area-green)"],
  ];
  const at = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return { cx: 360 + r * Math.cos(a), cy: 360 + r * Math.sin(a) };
  };
  return (
    <Svg w={720} h={720} className={className}>
      <circle cx={360} cy={360} r={340} stroke={LINE} strokeWidth={1.25} />
      <g className="orbit-spin-reverse" style={vars({ "--orbit-duration": "160s" })}>
        <circle
          cx={360}
          cy={360}
          r={262}
          stroke={LINE}
          strokeWidth={1.25}
          strokeDasharray="2 8"
          strokeLinecap="round"
        />
        <circle {...at(-58, 262)} r={5} fill={A} />
      </g>
      <circle cx={360} cy={360} r={190} stroke={LINE} strokeWidth={1.25} />
      <g className="orbit-spin" style={vars({ "--orbit-duration": "220s" })}>
        {outer.map(([deg, r, c]) => (
          <circle key={deg} {...at(deg, 340)} r={r} fill={c} />
        ))}
      </g>
      <g className="orbit-spin" style={vars({ "--orbit-duration": "120s" })}>
        <circle {...at(-110, 340)} r={6} fill={A} />
      </g>
    </Svg>
  );
}

/** Deterministic star positions: the same sky on the server and in the browser. */
function makeStars(count: number) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, () => ({
    x: +(rand() * 100).toFixed(2),
    y: +(rand() * 100).toFixed(2),
    r: +(0.5 + rand() * 1.1).toFixed(2),
    delay: +(rand() * 3.2).toFixed(2),
    still: rand() < 0.45,
  }));
}
const SKY = makeStars(90);

/** A night sky for the hero and the focus demo. */
export function Starfield({ className, count = 90 }: P & { count?: number }) {
  return (
    <svg className={className} aria-hidden focusable="false">
      {SKY.slice(0, count).map((s, i) => (
        <circle
          key={i}
          cx={`${s.x}%`}
          cy={`${s.y}%`}
          r={s.r}
          fill="white"
          opacity={s.still ? 0.5 : undefined}
          className={s.still ? undefined : "twinkle"}
          style={s.still ? undefined : { animationDelay: `${s.delay}s` }}
        />
      ))}
    </svg>
  );
}
