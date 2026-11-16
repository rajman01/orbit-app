import type { Metadata } from "next";
import { Suspense } from "react";
import { LearningItemView } from "./item-view";

export const instant = false;
export const metadata: Metadata = { title: "Learning" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LearningItemView />
    </Suspense>
  );
}
