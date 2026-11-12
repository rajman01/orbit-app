import type { Metadata } from "next";
import { Target } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";

// Pages behind the client-side AuthGate render after the session check, so the
// framework cannot validate them as instant; navigation is local-first anyway.
export const instant = false;

export const metadata: Metadata = { title: "Goals" };

export default function Page() {
  return (
    <>
      <PageHeader title="Goals" />
      <EmptyState icon={Target} title="Not built yet" body="Goals with key results, milestones and a next step. Coming in Phase 1." />
    </>
  );
}
