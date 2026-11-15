import type { Metadata } from "next";
import { Suspense } from "react";
import { TasksView } from "./tasks-view";

export const instant = false;
export const metadata: Metadata = { title: "Tasks" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TasksView />
    </Suspense>
  );
}
