import type { Metadata } from "next";
import { Suspense } from "react";
import { MoneyView } from "./money-view";

export const instant = false;
export const metadata: Metadata = { title: "Money" };

export default function Page() {
  return (
    <Suspense>
      <MoneyView />
    </Suspense>
  );
}
