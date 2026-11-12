import type { Metadata } from "next";
import { AreasView } from "./areas-view";

export const instant = false;
export const metadata: Metadata = { title: "Areas" };

export default function Page() {
  return <AreasView />;
}
