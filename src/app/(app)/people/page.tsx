import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleView } from "./people-view";

export const instant = false;
export const metadata: Metadata = { title: "People" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PeopleView />
    </Suspense>
  );
}
