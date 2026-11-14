import type { Metadata } from "next";
import { Suspense } from "react";
import { YearView } from "./year-view";

export const instant = false;
export const metadata: Metadata = { title: "Year" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <YearView />
    </Suspense>
  );
}
