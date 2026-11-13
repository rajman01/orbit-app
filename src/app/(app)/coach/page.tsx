import type { Metadata } from "next";
import { Suspense } from "react";
import { CoachView } from "./coach-view";

export const instant = false;
export const metadata: Metadata = { title: "Coach" };

export default function Page() {
  return (
    <Suspense>
      <CoachView />
    </Suspense>
  );
}
