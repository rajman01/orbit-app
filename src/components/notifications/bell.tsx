"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useUnreadNotifications } from "@/features/data";
import { cn } from "@/lib/cn";

/** NOT-5: the way into the notification centre, with a count of unread ones. */
export function NotificationBell({ className }: { className?: string }) {
  const unread = useUnreadNotifications();
  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      title="Notifications"
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-md text-label-secondary hover:bg-fill",
        className,
      )}
    >
      <Bell className="size-4" strokeWidth={1.75} />
      {unread ? (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-white tabular"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
