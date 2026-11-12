import type { Metadata } from "next";
import { LevelsView } from "./levels-view";

export const instant = false;
export const metadata: Metadata = { title: "Levels" };

export default function Page() {
  return <LevelsView />;
}
