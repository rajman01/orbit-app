import { CalendarSync, Inbox, Settings, Sun, Target } from "lucide-react";

export const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/cycle", label: "Cycle", icon: CalendarSync },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
