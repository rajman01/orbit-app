"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // reloadOnOnline is off: Orbit is local-first, so the sync engine already catches up when the
    // connection returns. Serwist's default full reload there aborted the sync push in flight and
    // threw away whatever the user was doing (an open dialog, half-typed text).
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SerwistProvider>
  );
}
