import {
  Activity,
  BookOpen,
  Brain,
  Briefcase,
  Circle,
  Dumbbell,
  Globe,
  GraduationCap,
  Heart,
  Home,
  type LucideIcon,
  Music,
  Palette,
  PiggyBank,
  Plane,
  Sparkles,
  Sprout,
  Users,
  Wallet,
} from "lucide-react";
import { areaColorVar } from "@/features/areas/model";
import { cn } from "@/lib/cn";

export const AREA_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  heart: Heart,
  wallet: Wallet,
  "book-open": BookOpen,
  activity: Activity,
  brain: Brain,
  home: Home,
  sparkles: Sparkles,
  users: Users,
  dumbbell: Dumbbell,
  "graduation-cap": GraduationCap,
  "piggy-bank": PiggyBank,
  plane: Plane,
  palette: Palette,
  music: Music,
  globe: Globe,
  sprout: Sprout,
  circle: Circle,
};

export function AreaIcon({
  icon,
  color,
  className,
}: {
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  const Icon = (icon && AREA_ICONS[icon]) || Circle;
  return (
    <Icon
      className={cn("size-4 shrink-0", className)}
      strokeWidth={1.75}
      style={{ color: areaColorVar(color) }}
      aria-hidden
    />
  );
}

export function AreaDot({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: areaColorVar(color) }}
      aria-hidden
    />
  );
}
