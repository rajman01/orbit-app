import type { Metadata } from "next";
import { CalendarSync } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";

// Pages behind the client-side AuthGate render after the session check, so the
// framework cannot validate them as instant; navigation is local-first anyway.
export const instant = false;

export const metadata: Metadata = { title: "Cycle" };

export default function Page() {
  return (
    <>
      <PageHeader title="Cycle" />
      <EmptyState
        icon={CalendarSync}
        title="Not built yet"
        body="Two-week cycles you commit to, with a Sunday review. Coming in Phase 1."
      />
    </>
  );
}
