"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SerwistProvider>
  );
}
