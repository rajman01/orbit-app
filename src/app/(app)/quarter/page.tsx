import type { Metadata } from "next";
import { Suspense } from "react";
import { QuarterView } from "./quarter-view";

export const instant = false;
export const metadata: Metadata = { title: "Quarter" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuarterView />
    </Suspense>
  );
}
