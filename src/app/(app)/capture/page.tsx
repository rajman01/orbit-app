import type { Metadata } from "next";
import { Suspense } from "react";
import { CaptureView } from "./capture-view";

export const instant = false;
export const metadata: Metadata = { title: "Capture" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CaptureView />
    </Suspense>
  );
}
