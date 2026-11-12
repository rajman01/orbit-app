import type { Metadata } from "next";
import { TodayView } from "./today-view";

// Pages behind the client-side AuthGate render after the session check, so the
// framework cannot validate them as instant; navigation is local-first anyway.
export const instant = false;

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return <TodayView />;
}
