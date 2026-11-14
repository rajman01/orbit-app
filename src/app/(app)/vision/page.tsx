import type { Metadata } from "next";
import { VisionView } from "./vision-view";

export const instant = false;
export const metadata: Metadata = { title: "Vision" };

export default function Page() {
  return <VisionView />;
}
