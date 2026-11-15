import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationsView } from "./notifications-view";

export const instant = false;
export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NotificationsView />
    </Suspense>
  );
}
