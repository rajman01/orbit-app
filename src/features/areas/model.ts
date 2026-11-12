import type { AREA_COLORS, EntityFields } from "@/lib/sync/entities";

export type AreaFields = EntityFields<"areas">;
export type AreaColor = (typeof AREA_COLORS)[number];

export interface AreaPreset {
  slug: string;
  name: string;
  icon: string;
  color: AreaColor;
  description: string;
  suggested: boolean;
}

/** The owner's four areas are suggested by default; the rest are one tap away during onboarding. */
export const AREA_PRESETS: AreaPreset[] = [
  {
    slug: "career",
    name: "Career",
    icon: "briefcase",
    color: "blue",
    description: "Skills, roles and the work you're proud of.",
    suggested: true,
  },
  {
    slug: "relationships",
    name: "Relationships",
    icon: "heart",
    color: "pink",
    description: "The people who matter.",
    suggested: true,
  },
  {
    slug: "finance",
    name: "Finance",
    icon: "wallet",
    color: "green",
    description: "Money in, money out, money working for you.",
    suggested: true,
  },
  {
    slug: "learning",
    name: "Learning",
    icon: "book-open",
    color: "orange",
    description: "Books, courses and new skills.",
    suggested: true,
  },
  {
    slug: "health",
    name: "Health",
    icon: "activity",
    color: "mint",
    description: "Body, sleep and energy.",
    suggested: false,
  },
  {
    slug: "mind",
    name: "Mind",
    icon: "brain",
    color: "purple",
    description: "Calm, focus and reflection.",
    suggested: false,
  },
  {
    slug: "home",
    name: "Home",
    icon: "home",
    color: "brown",
    description: "Where you live and what keeps it running.",
    suggested: false,
  },
  {
    slug: "fun",
    name: "Fun",
    icon: "sparkles",
    color: "yellow",
    description: "Play, travel and hobbies.",
    suggested: false,
  },
];

/** Preset areas get ids derived from the user, so onboarding on two devices can't duplicate them. */
export function presetAreaId(userId: string, slug: string): string {
  return `a${userId}${slug}`.slice(0, 40);
}

export function areaColorVar(color: string | undefined | null): string {
  return color ? `var(--area-${color})` : "var(--label-tertiary)";
}
