import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsView } from "./jobs-view";

export const instant = false;
export const metadata: Metadata = { title: "Job search" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <JobsView />
    </Suspense>
  );
}
