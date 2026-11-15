import type { Metadata } from "next";
import { Suspense } from "react";
import { LearningView } from "./learning-view";

export const instant = false;
export const metadata: Metadata = { title: "Learning" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LearningView />
    </Suspense>
  );
}
