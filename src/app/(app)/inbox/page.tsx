import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";

// Pages behind the client-side AuthGate render after the session check, so the
// framework cannot validate them as instant; navigation is local-first anyway.
export const instant = false;

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return (
    <>
      <PageHeader title="Inbox" />
      <EmptyState icon={Inbox} title="Not built yet" body="Capture anything in two seconds and sort it later. Coming in Phase 1." />
    </>
  );
}
