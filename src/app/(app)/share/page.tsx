import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareView } from "./share-view";

export const instant = false;
export const metadata: Metadata = { title: "Share" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ShareView />
    </Suspense>
  );
}
