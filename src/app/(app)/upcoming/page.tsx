import type { Metadata } from "next";
import { UpcomingView } from "./upcoming-view";

export const instant = false;

export const metadata: Metadata = { title: "Upcoming" };

export default function Page() {
  return <UpcomingView />;
}
