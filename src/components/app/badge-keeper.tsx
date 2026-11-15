"use client";

import { useEffect } from "react";
import { useAllTasks, useSettings, useUnreadNotifications } from "@/features/data";
import { isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * PWA-6: the number on the installed app's icon — unread notifications (default), tasks due today,
 * or nothing. Where the browser supports it (installed apps on Chromium; iOS 16.4+ home-screen
 * apps); elsewhere it does nothing. The service worker sets it too when a push arrives.
 */
export function BadgeKeeper() {
  const { badge } = useSettings();
  const unread = useUnreadNotifications();
  const tasks = useAllTasks();
  const today = useToday();
  const due = (tasks ?? []).filter(
    (t) => !t.parentTaskId && isOpen(t) && t.status !== "inbox" && t.dueDate != null && t.dueDate <= today,
  ).length;
  const mode = badge ?? "unread";
  const count = mode === "off" ? 0 : mode === "due" ? due : unread;
  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    if (!nav.setAppBadge) return;
    const p = count > 0 ? nav.setAppBadge(count) : (nav.clearAppBadge?.() ?? nav.setAppBadge(0));
    void p?.catch(() => {});
  }, [count]);
  return null;
}
