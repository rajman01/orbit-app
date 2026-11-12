import type { Metadata } from "next";
import { Welcome } from "./welcome";

export const instant = false;
export const metadata: Metadata = { title: "Welcome" };

export default function Page() {
  return <Welcome />;
}
