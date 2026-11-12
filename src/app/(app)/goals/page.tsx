import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalsView } from "./goals-view";

export const instant = false;
export const metadata: Metadata = { title: "Goals" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GoalsView />
    </Suspense>
  );
}
