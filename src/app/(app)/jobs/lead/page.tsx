import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadView } from "./lead-view";

export const instant = false;
export const metadata: Metadata = { title: "Job lead" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeadView />
    </Suspense>
  );
}
