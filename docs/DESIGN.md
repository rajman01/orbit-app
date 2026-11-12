# Orbit — Design System

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 2026-11-12 |
| **Companion to** | [PRD.md](./PRD.md) §15 |
| **Basis** | The `apple-design` skill (Apple's WWDC design guidance, translated for the web) + choices made for Orbit |

This document is the contract for every screen in Orbit. Where the skill gives a rule, this doc applies it to Orbit. Where the skill is silent (colour palette, spacing, radii, components), this doc makes the call. If code and this doc disagree, fix one of them; don't let them drift.

---

## 1. Design intent

**The feeling:** *calm confidence.* Orbit is about things you've been putting off, so it should never feel loud, busy or guilt-inducing. It should feel like a quiet, well-organised desk: everything has a place, the next thing to do is obvious, and starting feels easy.

| Principle (from the skill) | What it means in Orbit |
|---|---|
| **Purpose** | Every screen answers "what should I do next?" Anything that doesn't help with that goes one level deeper. |
| **Agency** | Undo everywhere (toast with Undo, AI action log). Confirmation dialogs only for truly destructive actions: deleting goals or people, dropping a goal, bulk AI changes. |
| **Responsibility** | AI actions are always visible and attributed. Journal content stays private by default. |
| **Familiarity** | Linear-style keyboard model on desktop, iOS-style gestures on mobile. Same icon = same action everywhere. |
| **Flexibility** | Dense, keyboard-first layout on desktop; quick, thumb-first layout on phone. Respects text size, reduced motion, reduced transparency and higher contrast. |
| **Simplicity, not minimalism** | Today shows 3 Must-dos first, big and clear; everything else is smaller and further down. Add context when it helps (a task row shows its goal so you know why it matters). |
| **Craft** | Every spacing, colour and timing value comes from the tokens below. No one-off values. |
| **Delight** | Comes from completion feeling good (a crisp check, a soft haptic, the progress ring moving), not from confetti. |

**Accountability tone:** firm, never shaming. Visual warnings use amber, not red, unless something is actually broken (error) or destructive (delete). A stale task is *pinned and highlighted*, not painted red.

---

## 2. Colour

### 2.1 Approach

- Neutral, slightly cool greys do almost all the work. Colour is reserved for meaning: the accent, area identity, status and progress.
- Apple's system colours are the base palette, with separate tuned values for light and dark mode (dark-mode colours are a little brighter so they hold up on dark backgrounds).
- **Rule:** saturated colours are for *fills, dots, icons and rings*. Text in colour uses the `-text` variant, which passes WCAG AA (4.5:1) on its background.

### 2.2 Neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#000000` | App background (mobile), main content (desktop) |
| `--bg-grouped` | `#F2F2F7` | `#000000` | Background behind grouped cards/lists (settings, forms) |
| `--surface` | `#FFFFFF` | `#1C1C1E` | Cards, list groups, sheets |
| `--surface-raised` | `#FFFFFF` | `#2C2C2E` | Popovers, menus, command palette |
| `--surface-sunken` | `#F2F2F7` | `#111113` | Inputs, sidebar background on desktop |
| `--fill` | `rgba(120,120,128,0.12)` | `rgba(120,120,128,0.24)` | Hover/selected rows, chips, segmented control track |
| `--fill-strong` | `rgba(120,120,128,0.20)` | `rgba(120,120,128,0.36)` | Pressed state |
| `--separator` | `rgba(60,60,67,0.18)` | `rgba(84,84,88,0.60)` | Hairlines (0.5px on retina, 1px otherwise) |
| `--label` | `#000000` | `#FFFFFF` | Primary text |
| `--label-secondary` | `rgba(60,60,67,0.72)` | `rgba(235,235,245,0.70)` | Secondary text, metadata |
| `--label-tertiary` | `rgba(60,60,67,0.45)` | `rgba(235,235,245,0.40)` | Placeholders, disabled, timestamps |

> Note: tertiary label is below 4.5:1 and must only be used for non-essential text (placeholders, decorative counts), never for information you need to read.

### 2.3 Accent

Orbit's accent is **teal** — fresh, calm and growth-minded, chosen on 2026-11-12 over indigo and Apple blue (comparison: [design/accent-comparison-light.png](./design/accent-comparison-light.png), [dark](./design/accent-comparison-dark.png)).

Apple's teal (`#30B0C7`) only reaches 2.6:1 contrast with white text, so Orbit uses a **deepened teal** of the same hue for anything carrying white text.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#0E7C8F` | `#138496` | Primary buttons, selection, focus ring, active nav item, links (white text: 4.9:1 / 4.4:1) |
| `--accent-text` | `#0B7285` | `#5ED3E6` | Accent-coloured text (5.6:1 on white / 11.9:1 on black) |
| `--accent-fill` | `rgba(48,176,199,0.14)` | `rgba(64,200,224,0.22)` | Selected row background, accent chips |
| `--accent-on-white` | `#0B7285` | `#0B7285` | Accent text on a white button sitting on a teal surface |
| `--on-accent` | `#FFFFFF` | `#FFFFFF` | Text/icons on accent fills |

### 2.4 Area colours

Each area gets one colour, used **sparingly**: a dot next to the name, the icon, the progress ring and a thin left accent on goal cards. Never as a full card or page background.

| Area (default) | Colour | Light | Dark |
|---|---|---|---|
| Career | Blue | `#007AFF` | `#0A84FF` |
| Relationships | Pink | `#FF2D55` | `#FF375F` |
| Finance | Green | `#34C759` | `#30D158` |
| Learning | Orange | `#FF9500` | `#FF9F0A` |
| *(user-added choices)* | Indigo | `#5856D6` | `#5E5CE6` |
| | Purple | `#AF52DE` | `#BF5AF2` |
| | Mint | `#00C7BE` | `#63E6E2` |
| | Brown | `#A2845E` | `#AC8E68` |
| | Cyan | `#32ADE6` | `#64D2FF` |
| | Yellow | `#FFCC00` | `#FFD60A` |

Each area colour also gets a `-text` variant (darkened ~20% in light mode, lightened in dark) and a `-fill` (12% / 24% alpha), generated by the same formula as the accent.

### 2.5 Semantic colours

| Token | Light | Dark | Meaning in Orbit |
|---|---|---|---|
| `--success` | `#34C759` | `#30D158` | Done, on track, habit checked, synced |
| `--warning` | `#FF9500` | `#FF9F0A` | At risk, stale, overdue, over capacity, missed ritual |
| `--danger` | `#FF3B30` | `#FF453A` | Errors, off track, destructive actions only |
| `--info` | `#007AFF` | `#0A84FF` | Neutral info, AI suggestions |
| `--xp` | `#13867A` → `#0E7C8F` gradient | `#63E6E2` → `#40C8E0` | XP bar, level badge, gradient headline text (deep on light, bright on dark so it stays legible) |
| `--band` | `#13867A` → `#0A6F7F` | same | Large brand surfaces with white text (landing page closing section) |

### 2.6 Priority

Priority uses **icon shape first**, colour second (so it works for colour-blind users):

| Priority | Icon | Colour |
|---|---|---|
| Urgent | Filled square with `!` | `--danger` |
| High | 3 bars | `--label` |
| Medium | 2 bars | `--label-secondary` |
| Low | 1 bar | `--label-tertiary` |
| None | Dashed line | `--label-tertiary` |

### 2.7 Status

Status icons are circles that fill as the task progresses (Linear-style):

| Status | Icon |
|---|---|
| Inbox | Dotted circle |
| Backlog | Dashed circle, tertiary |
| Todo | Empty circle |
| In progress | Half-filled circle, accent |
| Done | Filled circle with check, success |
| Cancelled | Circle with ×, tertiary |

---

## 3. Typography

### 3.1 Font

- **System font only:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif`. That is SF Pro on Apple devices (with optical sizing built in), Segoe UI on Windows and Roboto on Android.
- **Numbers:** `font-variant-numeric: tabular-nums` for counts, timers, XP, dates in tables and anything that changes in place.
- **Monospace** (task IDs like `ORB-142`, code in notes): `ui-monospace, "SF Mono", Menlo, monospace`.
- `font-optical-sizing: auto` everywhere. `-webkit-font-smoothing: antialiased` only in dark mode.

### 3.2 Type scale

Two scales: **Regular** for touch/mobile (based on iOS) and **Compact** for desktop (denser, Linear-like). The root switches at the `lg` breakpoint (§5.1). All sizes are in `rem` so they scale with the user's text size setting.

| Style | Weight | Regular (mobile) size / line-height | Compact (desktop) size / line-height | Tracking | Use |
|---|---|---|---|---|---|
| `display` | 700 | 34 / 41 | 28 / 34 | −0.022em | Today date header, level-up, ritual titles |
| `title1` | 700 | 28 / 34 | 22 / 28 | −0.018em | Page titles (Goals, Cycle) |
| `title2` | 600 | 22 / 28 | 18 / 24 | −0.014em | Section headers, goal title on detail |
| `title3` | 600 | 20 / 25 | 16 / 22 | −0.010em | Card titles, sheet titles |
| `headline` | 600 | 17 / 22 | 14 / 20 | −0.006em | Must-do task titles, emphasised rows |
| `body` | 400 | 17 / 22 | 14 / 20 | −0.004em | Task titles, text, inputs |
| `callout` | 400 | 16 / 21 | 13 / 18 | −0.002em | Descriptions, AI chat |
| `subhead` | 400 | 15 / 20 | 13 / 18 | 0 | Secondary row text (goal name under task) |
| `footnote` | 400 | 13 / 18 | 12 / 16 | 0 | Metadata, timestamps |
| `caption` | 500 | 12 / 16 | 11 / 14 | +0.01em | Badges, chips, small labels |
| `micro` | 600 | 11 / 13 | 10 / 12 | +0.03em | Uppercase section labels only |

Rules from the skill, applied:
- **Large text gets tighter tracking, small text gets looser.** Never one letter-spacing for everything.
- **Large text gets tighter leading, body gets more.** Long-form text (journal, AI chat) uses `body` at line-height 1.5 instead of the table value.
- **Emphasis comes from weight, not size.** A Must-do is `headline` (600) at the same size as a normal `body` task.
- Body text max width: **68ch** for journal, AI chat and descriptions.

---

## 4. Spacing, radius, elevation

### 4.1 Spacing (4-point grid)

| Token | Value | Typical use |
|---|---|---|
| `space-0.5` | 2px | Icon-to-text nudge |
| `space-1` | 4px | Tight inline gaps |
| `space-2` | 8px | Between chips, icon + label |
| `space-3` | 12px | Row vertical padding (compact) |
| `space-4` | 16px | Mobile page gutter, card padding, row padding (regular) |
| `space-5` | 20px | Section gap within a card |
| `space-6` | 24px | Desktop page gutter, gap between cards |
| `space-8` | 32px | Gap between page sections |
| `space-10` | 40px | Top of page to title |
| `space-12` | 48px | Large empty-state spacing |
| `space-16` | 64px | Focus mode spacing |

Spacing is defined in `rem` (4px = 0.25rem) so it scales with text size.

### 4.2 Row heights and touch targets

| Element | Compact (desktop) | Regular (mobile) |
|---|---|---|
| List row (task, habit, person) | 36px | 52px (min 44px target) |
| Must-do row | 48px | 64px |
| Button (default) | 32px | 44px |
| Button (large) | 40px | 50px |
| Input | 32px | 44px |
| Icon button | 28px (hit area padded to 32px) | 44px |
| Tab bar | — | 49px + safe area |

Tap targets on mobile are **never smaller than 44×44px**, padded invisibly if the visible element is smaller.

### 4.3 Corner radius

| Token | Value | Use |
|---|---|---|
| `radius-xs` | 4px | Checkboxes, tiny badges |
| `radius-sm` | 6px | Chips, tags, kbd hints |
| `radius-md` | 10px | Buttons, inputs, list rows on hover/selection |
| `radius-lg` | 14px | Cards, grouped lists, popovers |
| `radius-xl` | 20px | Sheets (top corners), dialogs, command palette |
| `radius-2xl` | 28px | Focus mode card, onboarding cards |
| `radius-full` | 9999px | Pills, avatars, progress rings, FAB |

Nested radius rule: inner radius = outer radius − padding (e.g. a button inside a 14px card with 8px padding gets 6px).

### 4.4 Elevation (shadows)

Bigger surfaces read as thicker: stronger shadow and blur than small chips (skill §12).

| Token | Light | Dark | Use |
|---|---|---|---|
| `shadow-1` | `0 1px 2px rgba(0,0,0,0.06)` | none (use `--surface` contrast) | Cards on grouped background |
| `shadow-2` | `0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)` | `0 4px 12px rgba(0,0,0,0.5)` | Dragged row, menus, popovers |
| `shadow-3` | `0 12px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)` | `0 12px 32px rgba(0,0,0,0.6)` | Command palette, dialogs |
| `shadow-4` | `0 24px 64px rgba(0,0,0,0.18)` | `0 24px 64px rgba(0,0,0,0.7)` | Sheets, focus mode |

In dark mode, depth comes mostly from lighter surfaces (`--surface` → `--surface-raised`), plus a 1px inner top highlight `rgba(255,255,255,0.06)` on raised surfaces.

---

## 5. Layout

### 5.1 Breakpoints

| Name | Width | Layout |
|---|---|---|
| `compact` | < 640px | Phone: single column, bottom tab bar, sheets from bottom, Regular type scale |
| `medium` | 640–1023px | Tablet/small window: single column, sidebar as overlay (hamburger), Regular type scale |
| `regular` | ≥ 1024px | Desktop: sidebar (240px, collapsible to 56px) + content + optional right panel (400px), Compact type scale |
| `wide` | ≥ 1440px | Content max width grows; right panel can stay pinned open |

### 5.2 Desktop shell

```
┌────────────┬──────────────────────────────────┬──────────────┐
│ Sidebar    │ Header (translucent, sticky)     │ Right panel  │
│ 240px      ├──────────────────────────────────┤ 400px        │
│ heavier    │                                  │ (task detail │
│ material   │ Content (max 880px, centred)     │  or AI coach)│
│            │                                  │ no scrim     │
└────────────┴──────────────────────────────────┴──────────────┘
```

- The right panel is a **parallel, non-blocking** surface: it slides in from the right, has no scrim, and the list stays usable (skill §12, "separate to keep flow").
- Board view and Calendar view use the full content width.

### 5.3 Mobile shell

```
┌──────────────────────────┐
│ Large title (scrolls     │  ← collapses into a translucent inline header on scroll
│ into inline header)      │
│                          │
│ Content (16px gutters)   │
│                          │
├──────────────────────────┤
│ Today  Cycle  (+)  Goals  More │ ← translucent tab bar, content scrolls beneath
└──────────────────────────┘
```

- Safe-area insets respected on all edges (`env(safe-area-inset-*)`).
- The `+` button sits in the tab bar, opens Quick Add as a sheet that rises from the button.
- Coach is a button in the top-right of the header.

### 5.4 Wayfinding

Every screen answers: *Where am I?* (title + active nav item), *Where can I go?* (nav + breadcrumbs on detail pages: `Career › Land a senior role › ORB-142`), *How do I get out?* (back button on mobile, `Esc` on desktop, swipe-down on sheets).

Nav labels are specific: "Today", "Cycle", "Goals", "People", "Insights" — never "Home" or "Dashboard".

---

## 6. Materials and depth

### 6.1 Materials

| Token | Light | Dark | Blur | Use |
|---|---|---|---|---|
| `material-chrome` | `rgba(255,255,255,0.72)` | `rgba(28,28,30,0.72)` | `blur(20px) saturate(180%)` | Sticky headers, mobile tab bar, focus-mode controls |
| `material-thick` | `rgba(242,242,247,0.85)` | `rgba(18,18,20,0.85)` | `blur(30px) saturate(180%)` | Desktop sidebar (structural region = heavier) |
| `material-thin` | `rgba(255,255,255,0.55)` | `rgba(44,44,46,0.55)` | `blur(16px) saturate(160%)` | Floating action chips, focus timer pill |
| `material-popover` | `rgba(255,255,255,0.88)` | `rgba(44,44,46,0.88)` | `blur(24px) saturate(180%)` | Menus, command palette, popovers |

Rules:
- **Never stack a translucent surface on another translucent surface.** A menu opened from the translucent header uses `material-popover` over content, not over the header's glass.
- **Text on materials** uses `--label` at weight ≥ 500 and a small tracking bump (+0.005em) for legibility. Coloured content goes on a solid layer, not the glass.
- **Scroll edge, not divider:** sticky headers show no border at rest; when content scrolls under them, a soft 12px gradient mask + the material appears. No 1px line.

### 6.2 Scrims

| Situation | Treatment |
|---|---|
| Modal task (rituals, confirm destructive, onboarding) | Scrim `rgba(0,0,0,0.32)` light / `rgba(0,0,0,0.56)` dark; background scales to 0.98 on mobile (sheet-style push back) |
| Parallel task (task detail panel, AI coach panel, quick add on desktop) | No scrim |
| Stacked sheets (task detail → edit date) | Each parent layer dims 8% more and scales 0.96 further |
| Focus mode | Full-screen; background replaced, not dimmed |

### 6.3 Accessibility overrides

```css
@media (prefers-reduced-transparency: reduce) {
  /* all materials → solid --surface / --surface-sunken, no backdrop-filter */
}
@media (prefers-contrast: more) {
  /* materials solid, separators → --label-secondary at 1px, focus ring 3px */
}
```

---

## 7. Motion

Motion is built with **Motion** (`motion/react`, formerly Framer Motion). Springs for anything a user can touch or that responds to a gesture. Short fades for things that just appear.

### 7.1 Spring tokens

The skill's damping/response values, translated to Motion's `bounce` + `duration` API:

| Token | Skill value | Motion config | Use |
|---|---|---|---|
| `spring.default` | damping 1.0, response 0.4 | `{ type: "spring", bounce: 0, duration: 0.4 }` | Layout changes, panels, reorder settle, most UI |
| `spring.snappy` | damping 1.0, response 0.3 | `{ type: "spring", bounce: 0, duration: 0.3 }` | Small elements: checkbox, toggle, chips, popovers |
| `spring.sheet` | damping 0.8, response 0.3 | `{ type: "spring", bounce: 0.2, duration: 0.35 }` | Sheets and drawers **after a drag/flick release only** |
| `spring.momentum` | damping 0.8, response 0.4 | `{ type: "spring", bounce: 0.2, duration: 0.4 }` | Swipe actions, thrown cards, kanban drop after a fast drag |
| `spring.gentle` | damping 1.0, response 0.6 | `{ type: "spring", bounce: 0, duration: 0.6 }` | Progress rings, XP bar fill, cycle burn-up |

**Rule:** bounce only appears when the *user's gesture* carried momentum. A sheet opened by tapping a button uses `spring.default` (no bounce). The same sheet released after a flick uses `spring.sheet`.

### 7.2 Non-spring timings

| Token | Value | Use |
|---|---|---|
| `press` | 100ms ease-out | Pressed scale (0.97) and fill on pointer-down |
| `fade-fast` | 150ms ease-out | Hover states, tooltips, icon swaps |
| `fade` | 200ms ease-out | Toasts, content cross-fade, reduced-motion replacement for springs |
| `theme` | 300ms ease | Light ↔ dark change (cross-fade background, no brightness jump) |

### 7.3 Motion rules (from the skill)

1. **Respond on pointer-down.** Buttons, rows and checkboxes show pressed state the instant they're pressed. No `click`-only feedback.
2. **No input lock.** Nothing in Orbit disables interaction while an animation runs. You can grab a closing sheet, re-open a closing panel, or drag a row that's still settling.
3. **Animate from the current on-screen value**, never the target. Motion does this by default; any custom animation must read the live value.
4. **Hand off velocity** at the end of a drag: pass the pointer's release velocity into the spring.
5. **Project momentum** before choosing where to snap: `projected = current + (v / 1000) * 0.998 / (1 - 0.998)`, then pick the nearest snap point.
6. **Rubber-band at edges** using the skill's formula (constant 0.55). Applies to sheets dragged past fully open, lists overscrolled in custom scroll areas, and swipe actions dragged past the action threshold.
7. **Enter and exit along the same path.** Right panel: in from right, out to right. Sheet: up from bottom, down to bottom. Quick add sheet: rises from the `+` button, returns to it.
8. **Anchor to the source.** Menus and popovers set `transform-origin` to their trigger and scale from 0.96 → 1.
9. **Only animate `transform` and `opacity`** (plus `backdrop-filter` blur on materials when they materialise). Never animate `width`, `height`, `top`, `left`; use Motion `layout` animations for size and position changes.
10. **Separate X and Y springs** for 2D drags (kanban cards).

### 7.4 Reduced motion

`prefers-reduced-motion: reduce` swaps every spring and slide for a `fade` (200ms opacity cross-fade). Bounce is removed everywhere. Gesture-driven elements still track the finger 1:1 (that is direct manipulation, not decoration), but settle with `fade` instead of a spring. Progress rings and XP bars jump to their value with a short cross-fade.

A single `useOrbitMotion()` hook returns the right config, so components never check the media query themselves.

---

## 8. Gestures

All gestures use Pointer Events with `setPointerCapture`, respect the grab offset, and keep a short position/time history to calculate release velocity.

| Gesture | Where | Behaviour |
|---|---|---|
| **Swipe right** | Task row (mobile) | Reveals green "Done" action. Tracks 1:1. Past 40% of width, or a fast flick (projected end past 40%), commits: row completes with `spring.momentum` + haptic. Below threshold it springs back. |
| **Swipe left** | Task row (mobile) | Reveals amber "Reschedule" action → commits into the **Skip flow** sheet (PRD §8.2). Same thresholds. |
| **Long-press** (500ms) | Task row, habit, person | Context menu, anchored to the press point. Row lifts (scale 1.02, `shadow-2`) at 300ms as a hint. |
| **Drag to reorder** | Today, lists, Must-dos | Desktop: drag handle on hover. Mobile: long-press then drag. Row lifts and follows 1:1; others move aside with `spring.default`. |
| **Drag between columns** | Board view | Card follows 1:1 (separate X/Y springs), drop target highlights with `--accent-fill`. Settle with `spring.momentum` if released fast, else `spring.default`. |
| **Drag to calendar** | Task → Calendar view (desktop) | Ghost block snaps to 15-minute slots as you move; drop creates a time block. |
| **Sheet drag** | All sheets | Drag handle and sheet header drag the sheet 1:1. Snap points: closed / medium (50%) / large (92%). Velocity projected to choose the snap point. Rubber-bands above large. |
| **Pull to refresh** | Today, Inbox, Cycle (mobile) | Triggers sync. Rubber-banded; spinner appears at 60px pull. |
| **Swipe back** | Detail pages (installed PWA, iOS) | Leave to the browser's native back gesture; don't fight it. |
| **Tap** | Everywhere | Pressed state on pointer-down; action on pointer-up inside target + 10px slop; dragging away cancels. |

Thresholds: 10px of movement before a drag commits to a direction (horizontal swipe vs vertical scroll). Detect both from the first move, cancel the loser once intent is clear.

---

## 9. Feedback: haptics and sound

The skill's three rules, applied: **causality** (feedback fires on the actual event), **harmony** (visual, sound and haptic on the same frame), **utility** (only meaningful moments).

| Moment | Visual | Haptic (Android, `navigator.vibrate`) | Sound (optional, off by default) |
|---|---|---|---|
| Task completed | Check draws in, circle fills (`spring.snappy`), row fades to done state | 10ms | Soft "tick" |
| Must-do completed | Same + Must-do slot shows a quiet checkmark | 10ms | Soft "tick" |
| Habit checked | Ring fills | 10ms | — |
| Swipe action committed | Action background expands | 15ms | — |
| Focus session ended | Timer ring completes, gentle pulse | 20, 60, 20ms | Chime |
| Level up | Level badge scales 1 → 1.08 → 1 with `spring.momentum`; XP bar fills | 20, 40, 20ms | Rising two-note |
| Error | Field shakes horizontally 3× (6px, 300ms; fade only in reduced motion) | 30, 40, 30ms | — |

Note: iOS Safari has no web vibration API, so haptics are Android-only. Visual feedback must always stand on its own.

---

## 10. Iconography

- **Library:** Lucide (SF Symbols' licence doesn't allow use outside Apple platforms). Stroke width **1.75**, rounded caps and joins, to sit close to SF Symbols' regular weight.
- **Sizes:** 16px (compact rows, inline), 20px (regular rows, buttons), 24px (tab bar, headers), 28px+ (empty states).
- Icons align to the text's cap height, not the line box.
- Icons inherit `currentColor`; coloured only for areas, status and priority.
- Filled variants mean "active/selected" (e.g. tab bar active tab).

**Fixed meanings** (never reuse these icons for anything else):

| Icon | Meaning |
|---|---|
| `Sun` | Today |
| `Inbox` | Inbox |
| `RefreshCcw` / orbit ring custom | Cycle |
| `Target` | Goals |
| `Repeat` | Habits |
| `Users` | People |
| `CalendarDays` | Calendar |
| `Sparkles` | AI / Coach (and the badge on anything AI did) |
| `Timer` | Focus |
| `Star` (filled) | Must-do |
| `Flame` | Streak |
| `AlertTriangle` | Stale / at risk |
| `Trophy` | Win |

---

## 11. Components

Each component lists **anatomy, states and motion**. All components support light/dark, keyboard focus, and the three accessibility media queries.

### 11.1 Button

- **Variants:** `primary` (accent fill), `secondary` (`--fill`), `plain` (text only, accent text), `destructive` (danger fill, only in confirmation flows), `ghost` (icon buttons).
- **States:** rest → hover (desktop: fill +4% darker) → pressed (scale 0.97, `--fill-strong`, `press` timing, on pointer-down) → disabled (40% opacity) → loading (label stays, spinner replaces icon, width doesn't change).
- **Focus:** 2px `--accent` ring, 2px offset, only for keyboard focus (`:focus-visible`).

### 11.2 Task row

```
[status] [★] Title of the task                     [area•] [P] [effort] [date]
              ↳ next step: open the doc and write the title   · Goal name
```
- Status circle is its own tap target (completes the task); the rest of the row opens the detail.
- Must-dos: `headline` weight, 64/48px tall, star filled, next step shown by default.
- **Stale:** amber `AlertTriangle` + "Postponed 3×" chip; the row is pinned, not recoloured.
- **AI-created:** small `Sparkles` badge for 24h after creation.
- **Completion:** circle fills with `spring.snappy`, title gets a strikethrough that draws left-to-right (200ms), row stays in place for 1.5s (so you can undo), then collapses out with a `layout` animation. An Undo toast appears.
- **Start button** (Today): appears on hover (desktop) or always for Must-dos (mobile). Opens Focus mode.

### 11.3 Checkbox / habit check

- 22px (regular) / 18px (compact), `radius-xs` for subtasks, circle for tasks and habits.
- Check mark draws as an SVG path (`pathLength` 0 → 1, `spring.snappy`).
- Count-based habits show a ring that fills per tap.

### 11.4 Sheet (mobile) — built on Vaul

- Top corners `radius-xl`, grabber 36×5px at top, `material-popover` background, `shadow-4`.
- Snap points: medium (50%) and large (92%). Projected-momentum snapping, velocity handoff, rubber-band beyond large (skill §5, §6, §9).
- Opens from its trigger where one exists (Quick Add from `+`).
- Dismiss: drag down, tap scrim, or `Esc`. Can be grabbed mid-dismiss.
- Used for: Quick Add, Task detail (mobile), Skip flow, filters, date picker, context menus with many items.

### 11.5 Side panel (desktop)

- 400px, `--surface`, left hairline, `shadow-3`. Slides in from right with `spring.default`, exits to the right. No scrim.
- `Esc` closes. `J`/`K` while open moves to the next task in the list and the panel content cross-fades.
- Used for: Task detail, AI Coach (`⌘J`), Person detail.

### 11.6 Dialog

- Centred, max 440px, `radius-xl`, `shadow-3`, scrim. Scales 0.96 → 1 + fade with `spring.snappy`.
- **Only** for: destructive confirmations, ritual flows on desktop (which use a larger 640px version), and onboarding.
- Destructive dialogs name the thing: "Delete 'Land a senior role' and its 14 tasks?" with buttons "Cancel" and "Delete goal" (never "OK").

### 11.7 Command palette (`⌘K`)

- Built on `cmdk`. 640px wide, top-anchored at 20% from the top, `material-popover`, `radius-xl`, `shadow-3`.
- Opens with scale 0.98 → 1 + fade (`spring.snappy`), origin top-centre. No input delay: the field is focused on the same frame.
- Groups: Recent, Navigate, Tasks, Goals, People, Actions, Ask AI ("Ask Coach: …" is always the last item when there's text).
- Each result row shows its keyboard shortcut on the right in a `kbd` chip.

### 11.8 Menus and popovers

- `material-popover`, `radius-lg`, `shadow-2`, min-width 200px.
- `transform-origin` = trigger; scale 0.96 → 1 + fade with `spring.snappy`. Exit reverses.
- Items 32px (compact) / 44px (regular), with icon, label and shortcut.

### 11.9 Toast

- Bottom-centre (desktop) / above tab bar (mobile). `material-popover`, `radius-full` pill.
- Enters by rising 8px + fade; exits the same way down. Auto-dismiss 5s; hovering pauses the timer.
- **Undo toasts** for: complete, delete (soft), reschedule, AI action, bulk edits.
- Swipe down to dismiss (mobile).

### 11.10 Quick Add

- Desktop: `C` opens a centred 560px floating input (no scrim). Mobile: sheet from the `+` tab.
- Natural language is parsed **as you type** and shown as inline tokens: `tomorrow 3pm` → date chip, `#career` → area chip (area colour), `!1` → priority chip. Tokens can be removed with Backspace.
- `Enter` saves and keeps the field open for the next item (rapid capture). `⌘Enter` saves and opens the detail. `Esc` closes.

### 11.11 Progress ring

- Stroke 3px (small, 16–20px) / 6px (large, 64px+). Track `--fill`, progress in area colour or `--accent`.
- Animates with `spring.gentle` from its current value. Rounded line caps.
- Used for: goal progress, cycle progress, habit count, focus timer, level progress.

### 11.12 Goal card

- `--surface`, `radius-lg`, `shadow-1`, 3px left accent bar in the area colour.
- Contains: title (`title3`), health pill (On track / At risk / Off track), progress ring, target date, next task preview, key results (max 2, "+N more").
- "Needs a next step" state: dashed border + amber prompt "Add a next step" inline.

### 11.13 Health, status and chips

- Pills: `caption` text, `radius-full`, 20px tall, `-fill` background with `-text` colour. E.g. On track = success fill/text.
- Chips (tags, filters): `radius-sm`, `--fill`, removable with ×.

### 11.14 Level badge and XP bar

- Badge: circle with level number (`tabular-nums`, 600 weight) and the XP gradient ring. Lives in the sidebar footer (desktop) and the profile in More (mobile).
- XP gain: a small "+30 XP" label rises 12px and fades out from the completed item (600ms). Not shown in reduced motion; the bar still updates.
- **Level up:** a centred, non-blocking card ("Level 7 — Momentum") appears for 3s with the badge animation (§9), then floats away. It never interrupts typing or a focus session (deferred until the session ends).

### 11.15 Focus mode

- Full-screen, `--bg` with a very subtle radial gradient in the task's area colour (5% opacity). Materialises: background fades in while the content scales 0.98 → 1 and blur goes 8px → 0 (skill: "materialize, don't just fade").
- Centre: large timer ring (240px, `tabular-nums` display text), task title (`title1`), next step (`title3`, secondary). Below: subtask checklist and scratchpad.
- Controls in a `material-thin` pill at the bottom: Pause, +5 min, Done, End.
- "Just 5 minutes" first session: the ring shows a 5-minute arc; at the end, a calm prompt "Keep going?" with Continue (25 min) / Done / Stop.
- Exit reverses the entry animation back into the task row it came from.

### 11.16 Rituals (Daily Plan, Shutdown, Cycle Review)

- Step-by-step flow: one question per screen, progress dots at the top, `Continue` button at the bottom (primary, large).
- Steps slide horizontally (next = in from right, back = in from left, same path both ways). Swipeable on mobile.
- Mobile: full-screen sheet. Desktop: 640px dialog with scrim (a focused, modal task).
- Tone of copy: short, warm, direct. See §13.

### 11.17 Empty states

- Centred, `space-12` padding, 28px+ icon in `--label-tertiary`, one-line `title3`, one-line `subhead`, one primary action.
- Always offer the next step: "No goals in Finance yet. **Add a goal**" or "Ask Coach to help you set one."

### 11.18 Loading and sync

- Local-first means most screens never load. For online-only content (AI, calendar), use skeleton rows (`--fill`, shimmer disabled in reduced motion).
- Sync status: a small dot next to the avatar/level badge: none when synced, pulsing `--info` while syncing, `--warning` when offline with unsynced changes ("3 changes waiting to sync"). Tapping it explains.
- Offline banner: never a blocking banner. A `material-thin` pill under the header: "Offline — changes will sync".

### 11.19 AI Coach chat

- Messages: user messages right-aligned in `--accent-fill` bubbles (`radius-lg`); Coach messages left-aligned, no bubble, `callout` text at 68ch with `Sparkles` avatar.
- Streaming text appears token by token without layout jumps (reserve space; no cursor blink in reduced motion).
- **Action cards** inline in the conversation: `--surface`, `radius-lg`, `shadow-1`, with icon, summary ("Created goal 'Land a senior role' with 3 milestones and 8 tasks"), and buttons "View" / "Undo".
- **Plan proposals** (when autonomy is "Suggest only"): an editable tree (Goal › Milestones › Tasks) with checkboxes and "Apply plan".

---

## 12. Accessibility checklist

- Text contrast ≥ 4.5:1 (body), ≥ 3:1 (large text, icons, focus rings, UI boundaries).
- Never rely on colour alone: status, priority and health all have icon or text too.
- `:focus-visible` ring on everything interactive; logical tab order; `Esc` always closes the top layer.
- All custom gestures have a non-gesture alternative (swipe → context menu buttons; drag reorder → "Move up/down" in menu; sheet drag → close button).
- Screen reader labels on icon-only buttons; live regions for toasts, timer completion and sync status.
- Layout survives 200% text size: rows grow in height, nothing truncates important information, horizontal scroll never appears.
- Media queries supported: `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`.
- No looping animations except the sync pulse (which is disabled in reduced motion) and the focus timer.

---

## 13. Voice and copy

Orbit talks like a good coach: brief, warm, direct, on your side.

| Do | Don't |
|---|---|
| "This one's been moved 3 times. What's getting in the way?" | "You failed to complete this task again." |
| "Start with 5 minutes." | "Get to work!" |
| "Nice — that's your 3rd Must-do today." | "AMAZING!!! 🎉🎉" |
| "Add a next step" | "No tasks found" |
| "Drop goal" / "Delete person" | "OK" / "Submit" |
| "Skip reason" | "Excuse" |

- Sentence case everywhere (not Title Case).
- Buttons are verbs naming the result ("Start focus", "Commit to cycle", "Log win").
- Numbers as digits ("3 tasks", not "three tasks").
- No exclamation marks except level-up.
- Time in the user's locale; relative where it helps ("Due tomorrow", "Postponed 3×").

---

## 14. Implementation

### 14.1 Stack

| Need | Choice |
|---|---|
| Styling | Tailwind CSS v4, tokens as CSS variables in `@theme` |
| Theme switching | `next-themes` (`class="dark"` on `<html>`, default `system`) |
| Motion | `motion` (`motion/react`) |
| Sheets | `vaul` |
| Command palette | `cmdk` |
| Accessible primitives | Radix UI (dialog, popover, dropdown, tooltip, switch) |
| Icons | `lucide-react` (strokeWidth 1.75) |
| Gestures (custom) | Pointer Events + Motion `drag` / `useDragControls`; `@use-gesture/react` if needed |

### 14.2 Token files

```
src/styles/
├── tokens.css        # all CSS variables: colour (light/dark), type, space, radius, shadow, material
├── globals.css       # @import tailwind; @theme mapping tokens → utilities; base styles
└── a11y.css          # prefers-reduced-motion / transparency / contrast overrides
src/lib/motion/
├── springs.ts        # spring tokens (§7.1) as typed constants
├── useOrbitMotion.ts # returns springs or fades depending on reduced motion
├── project.ts        # momentum projection (§7.3 rule 5)
└── rubberband.ts     # rubber-band function (§7.3 rule 6)
```

### 14.3 Token sketch

```css
/* tokens.css */
:root {
  --bg: #FFFFFF;
  --surface: #FFFFFF;
  --label: #000000;
  --accent: #0E7C8F;
  --area-career: #007AFF;
  /* ... */
  --radius-md: 0.625rem;
  --material-chrome: rgba(255, 255, 255, 0.72);
}
.dark {
  --bg: #000000;
  --surface: #1C1C1E;
  --label: #FFFFFF;
  --accent: #138496;
  --area-career: #0A84FF;
  /* ... */
  --material-chrome: rgba(28, 28, 30, 0.72);
}
```

```ts
// springs.ts
export const spring = {
  default:  { type: "spring", bounce: 0,   duration: 0.4  },
  snappy:   { type: "spring", bounce: 0,   duration: 0.3  },
  sheet:    { type: "spring", bounce: 0.2, duration: 0.35 },
  momentum: { type: "spring", bounce: 0.2, duration: 0.4  },
  gentle:   { type: "spring", bounce: 0,   duration: 0.6  },
} as const;
```

### 14.4 Build process

1. Build tokens and the core components (§11.1–11.10) first, on a hidden `/dev/components` page that shows every component in light, dark, reduced motion and compact/regular.
2. Prototype the interactive pieces (swipe row, sheet, focus mode) and try them on a real phone before building screens, as the skill recommends.
3. Review motion in slow motion (Chrome DevTools → Animations → 10%) before calling a component done.
4. Every screen ships with: light + dark checked, keyboard-only pass, 200% text pass, reduced-motion pass.

---

## 15. Open design decisions

1. ~~**Accent colour**~~ — decided: deepened teal (§2.3). Teal replaced the user-added "teal" area colour, which is now indigo, so areas never look like buttons.
2. **App icon:** the orbit mark (a ring with one small planet) in white on teal — in `public/icons`, generated by `pnpm icons`. Refine later if wanted.
3. **Sounds:** off by default. Worth turning on by default for task completion?
4. **Level titles:** space-themed names (Spark → Constellation) per the PRD, shown in the level-up card; confirm or switch to numbers only.
