import { AppShell } from "@/components/app/app-shell";
import { AuthGate } from "@/components/app/auth-gate";
import { SyncProvider } from "@/components/app/sync-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <SyncProvider>
        <AppShell>{children}</AppShell>
      </SyncProvider>
    </AuthGate>
  );
}
