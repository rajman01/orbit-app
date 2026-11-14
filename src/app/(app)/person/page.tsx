import type { Metadata } from "next";
import { Suspense } from "react";
import { PersonView } from "./person-view";

export const instant = false;
export const metadata: Metadata = { title: "Person" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PersonView />
    </Suspense>
  );
}
