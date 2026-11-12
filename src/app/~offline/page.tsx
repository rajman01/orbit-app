import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-bg px-6 text-center">
      <WifiOff className="mb-2 size-8 text-label-tertiary" strokeWidth={1.5} aria-hidden />
      <h1 className="text-title2">You&rsquo;re offline</h1>
      <p className="max-w-sm text-subhead text-label-secondary">
        This page hasn&rsquo;t been saved for offline use yet. Open Today — your tasks are stored on this device.
      </p>
      <a href="/today" className="mt-4 font-semibold text-accent-text">
        Go to Today
      </a>
    </main>
  );
}
