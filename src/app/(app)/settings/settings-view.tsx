"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useMounted } from "@/lib/use-mounted";
import { PageHeader } from "@/components/app/app-shell";
import { clearCachedUser, useCurrentUser } from "@/components/app/auth-gate";
import { useSync } from "@/components/app/sync-provider";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { authClient } from "@/lib/auth/client";

export function SettingsView() {
  const user = useCurrentUser();
  const engine = useSync();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  async function signOut() {
    await authClient.signOut().catch(() => {});
    clearCachedUser();
    router.replace("/sign-in");
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 lg:px-6">
        <Group title="Account">
          <Row label="Name">{user.name}</Row>
          <Row label="Email">{user.email}</Row>
        </Group>

        <Group title="Appearance">
          <Row label="Theme">
            {mounted ? (
              <Segmented
                label="Theme"
                value={(theme ?? "system") as "system" | "light" | "dark"}
                onChange={setTheme}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            ) : null}
          </Row>
        </Group>

        <Group title="Sync">
          <Row label="Status">
            <SyncIndicator withLabel />
          </Row>
          <Row label="Sync now">
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => void engine.sync()}>
              Sync now
            </Button>
          </Row>
        </Group>

        <div>
          <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-4 text-micro text-label-secondary uppercase lg:px-1">{title}</h2>
      <div className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-1 dark:bg-surface">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-row items-center justify-between gap-4 px-4 py-2">
      <span className="text-body">{label}</span>
      <span className="min-w-0 truncate text-body text-label-secondary">{children}</span>
    </div>
  );
}
