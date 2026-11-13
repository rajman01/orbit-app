import {
  BarChart3,
  CalendarDays,
  CalendarSync,
  Repeat,
  Trophy,
  Inbox,
  LayoutList,
  Settings,
  Shapes,
  Sparkles,
  Sun,
  Target,
} from "lucide-react";

export const NAV_MAIN = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: LayoutList },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/habits", label: "Habits", icon: Repeat },
  { href: "/cycle", label: "Cycle", icon: CalendarSync },
  { href: "/report", label: "Report", icon: BarChart3 },
  { href: "/levels", label: "Levels", icon: Trophy },
] as const;

export const NAV_MORE = [
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/habits", label: "Habits", icon: Repeat },
  { href: "/tasks", label: "Tasks", icon: LayoutList },
  { href: "/areas", label: "Areas", icon: Shapes },
  { href: "/cycle", label: "Cycle", icon: CalendarSync },
  { href: "/report", label: "Weekly report", icon: BarChart3 },
  { href: "/levels", label: "Levels", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
