import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillView } from "./skill-view";

export const instant = false;
export const metadata: Metadata = { title: "Skill" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SkillView />
    </Suspense>
  );
}
