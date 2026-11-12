import { CalendarDays, CalendarSync, Inbox, LayoutList, Settings, Shapes, Sun, Target } from "lucide-react";

export const NAV_MAIN = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: LayoutList },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/cycle", label: "Cycle", icon: CalendarSync },
] as const;

export const NAV_MORE = [
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: LayoutList },
  { href: "/areas", label: "Areas", icon: Shapes },
  { href: "/cycle", label: "Cycle", icon: CalendarSync },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
