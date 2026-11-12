import type { Metadata } from "next";
import { ReportView } from "./report-view";

export const instant = false;
export const metadata: Metadata = { title: "Weekly report" };

export default function Page() {
  return <ReportView />;
}
