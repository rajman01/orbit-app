import type { Metadata } from "next";
import { Suspense } from "react";
import { InsightsView } from "./insights-view";

export const instant = false;
export const metadata: Metadata = { title: "Insights" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InsightsView />
    </Suspense>
  );
}
