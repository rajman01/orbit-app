import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxView } from "./inbox-view";

export const instant = false;
export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
