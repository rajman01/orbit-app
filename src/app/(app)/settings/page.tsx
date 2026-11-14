import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "./settings-view";

// Pages behind the client-side AuthGate render after the session check, so the
// framework cannot validate them as instant; navigation is local-first anyway.
export const instant = false;

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
