import type { Metadata } from "next";
import { Suspense } from "react";
import { WinsView } from "./wins-view";

export const instant = false;
export const metadata: Metadata = { title: "Wins" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WinsView />
    </Suspense>
  );
}
