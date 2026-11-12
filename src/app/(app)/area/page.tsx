import type { Metadata } from "next";
import { Suspense } from "react";
import { AreaView } from "./area-view";

export const instant = false;
export const metadata: Metadata = { title: "Area" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AreaView />
    </Suspense>
  );
}
