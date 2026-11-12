import type { Metadata } from "next";
import { Suspense } from "react";
import { CycleView } from "./cycle-view";

// Pages behind the client-side AuthGate render after the session check, so the
// framework cannot validate them as instant; navigation is local-first anyway.
export const instant = false;

export const metadata: Metadata = { title: "Cycle" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CycleView />
    </Suspense>
  );
}
