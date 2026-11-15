import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillsView } from "./skills-view";

export const instant = false;
export const metadata: Metadata = { title: "Skills" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SkillsView />
    </Suspense>
  );
}
