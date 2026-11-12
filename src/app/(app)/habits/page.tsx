import type { Metadata } from "next";
import { HabitsView } from "./habits-view";

export const instant = false;
export const metadata: Metadata = { title: "Habits" };

export default function Page() {
  return <HabitsView />;
}
