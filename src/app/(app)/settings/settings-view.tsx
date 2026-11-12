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
import { useActions } from "@/features/actions";
import { useSettings } from "@/features/data";
import { WEEKDAYS } from "@/features/settings/model";
import { authClient } from "@/lib/auth/client";
import { deviceTimezone } from "@/lib/dates";
import Link from "next/link";

export function SettingsView() {
  const user = useCurrentUser();
  const engine = useSync();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const settings = useSettings();
  const actions = useActions();
  const save = (patch: Parameters<typeof actions.saveSettings>[0]) => void actions.saveSettings(patch);
  const deviceTz = mounted ? deviceTimezone() : settings.timezone;

  async function signOut() {
    await authClient.signOut().catch(() => {});
    clearCachedUser();
    router.replace("/sign-in");
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pb-16 lg:px-6">
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

        <Group title="Planning">
          <Row label="Time zone">
            <span className="flex items-center gap-2">
              {settings.timezone}
              {settings.timezone !== deviceTz ? (
                <Button variant="plain" onClick={() => save({ timezone: deviceTz })}>
                  Use {deviceTz}
                </Button>
              ) : null}
            </span>
          </Row>
          <Row label="Week starts on">
            <select
              aria-label="Week starts on"
              value={settings.weekStartDay}
              onChange={(e) => save({ weekStartDay: Number(e.target.value) })}
              className="rounded-md bg-fill px-2 py-1 text-body text-label"
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Cycle length">
            <NumberField
              label="Cycle length in days"
              value={settings.cycleLengthDays}
              min={7}
              max={28}
              suffix="days"
              onCommit={(v) => save({ cycleLengthDays: v })}
            />
          </Row>
          <Row label="Daily capacity">
            <NumberField
              label="Daily capacity in points"
              value={settings.dailyCapacityPts}
              min={1}
              max={100}
              suffix="points"
              onCommit={(v) => save({ dailyCapacityPts: v })}
            />
          </Row>
          <Row label="Cycle capacity">
            <NumberField
              label="Cycle capacity in points"
              value={settings.cycleCapacityPts}
              min={1}
              max={500}
              suffix="points"
              onCommit={(v) => save({ cycleCapacityPts: v })}
            />
          </Row>
          <Row label="Focus session">
            <NumberField
              label="Focus session length in minutes"
              value={settings.focusMinutes ?? 25}
              min={5}
              max={180}
              suffix="min"
              onCommit={(v) => save({ focusMinutes: v })}
            />
          </Row>
          <Row label="Break">
            <NumberField
              label="Break length in minutes"
              value={settings.breakMinutes ?? 5}
              min={1}
              max={60}
              suffix="min"
              onCommit={(v) => save({ breakMinutes: v })}
            />
          </Row>
          <Row label="Working hours">
            <span className="flex items-center gap-1.5">
              <input
                aria-label="Start of working hours"
                type="time"
                value={settings.workingHours.start}
                onChange={(e) =>
                  e.target.value && save({ workingHours: { ...settings.workingHours, start: e.target.value } })
                }
                className="rounded-md bg-fill px-2 py-1 text-body text-label"
              />
              –
              <input
                aria-label="End of working hours"
                type="time"
                value={settings.workingHours.end}
                onChange={(e) =>
                  e.target.value && save({ workingHours: { ...settings.workingHours, end: e.target.value } })
                }
                className="rounded-md bg-fill px-2 py-1 text-body text-label"
              />
            </span>
          </Row>
          <Row label="Areas">
            <Link href="/areas" className="font-medium text-accent-text">
              Manage areas
            </Link>
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
      <div className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-1 dark:bg-surface">
        {children}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onCommit: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        key={value}
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        defaultValue={value}
        onBlur={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v) && v >= min && v <= max && v !== value) onCommit(v);
          else e.target.value = String(value);
        }}
        className="w-16 rounded-md bg-fill px-2 py-1 text-right text-body text-label tabular"
      />
      {suffix}
    </span>
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
