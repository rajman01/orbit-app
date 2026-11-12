import type { Metadata } from "next";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "Components", robots: { index: false } };

export default function Page() {
  return <Gallery />;
}
