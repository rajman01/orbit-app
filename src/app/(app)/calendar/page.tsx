import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarView } from "./calendar-view";

export const instant = false;

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
