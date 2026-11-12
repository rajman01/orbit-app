import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalView } from "./goal-view";

export const instant = false;
export const metadata: Metadata = { title: "Goal" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GoalView />
    </Suspense>
  );
}
