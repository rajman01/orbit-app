import type { Metadata } from "next";
import { Suspense } from "react";
import { JournalView } from "./journal-view";

export const instant = false;
export const metadata: Metadata = { title: "Journal" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <JournalView />
    </Suspense>
  );
}
