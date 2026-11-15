"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { dayLabel } from "@/lib/dates";
import { useToday } from "@/features/use-today";
import { useMounted } from "@/lib/use-mounted";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** §13 / SET-8: capture into Orbit from outside the app — API tokens, an iOS Shortcut, sharing. */
export function CaptureView() {
  const toast = useToast();
  const todayDay = useToday();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("iPhone");
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);
  const origin = useMounted() ? window.location.origin : "";

  // Bumped to reload the list after a change.
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);
  useEffect(() => {
    let off = false;
    fetch("/api/tokens", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tokens: [] }))
      .then((b: { tokens: TokenRow[] }) => !off && setTokens(b.tokens))
      .catch(() => !off && setTokens([]));
    return () => {
      off = true;
    };
  }, [version]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) {
      toast({
        message: r.status === 409 ? "You have the most tokens allowed. Revoke one first." : "Couldn't create a token",
      });
      return;
    }
    setFresh(((await r.json()) as { token: string }).token);
    load();
  }

  const endpoint = `${origin}/api/capture`;
  const shown = fresh ?? "orb_…your token…";

  return (
    <>
      <PageHeader title="Capture from anywhere" subtitle="Settings" />
      <PageBody className="max-w-[720px]">
        <SectionLabel>API tokens</SectionLabel>
        <p className="mb-3 px-1 text-callout text-label-secondary">
          A token lets a shortcut or script add tasks to your Inbox. Treat it like a password: anyone with it can add
          tasks (but can&rsquo;t read anything).
        </p>
        {fresh ? (
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-accent bg-accent-fill p-3">
            <p className="text-footnote font-semibold text-accent-text">Copy it now: it won&rsquo;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code
                aria-label="New token"
                className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 text-footnote"
              >
                {fresh}
              </code>
              <CopyButton text={fresh} label="Copy token" />
            </div>
          </div>
        ) : null}
        {tokens?.length ? (
          <ul aria-label="Tokens" className="mb-2 flex flex-col">
            {tokens.map((t) => (
              <li key={t.id} className="flex min-h-row items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fill">
                <KeyRound className="size-4 shrink-0 text-label-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{t.name}</span>
                  <span className="block text-footnote text-label-secondary">
                    {t.prefix}… · made {dayLabel(t.createdAt.slice(0, 10), todayDay).toLowerCase()}
                    {t.lastUsedAt
                      ? ` · last used ${dayLabel(t.lastUsedAt.slice(0, 10), todayDay).toLowerCase()}`
                      : " · not used yet"}
                  </span>
                </span>
                <IconButton
                  label={`Revoke ${t.name}`}
                  icon={<Trash2 className="size-4" />}
                  onClick={() => setRevoking(t)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={create} className="flex gap-2">
          <Input
            aria-label="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="flex-1"
          />
          <Button type="submit" disabled={!name.trim()}>
            New token
          </Button>
        </form>

        <SectionLabel>iPhone and iPad: an &ldquo;Add to Orbit&rdquo; shortcut</SectionLabel>
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-callout">
          <li>Make a token above (name it after your phone) and copy it.</li>
          <li>
            Open the <strong>Shortcuts</strong> app → <strong>+</strong> → name it <strong>Add to Orbit</strong>.
          </li>
          <li>
            Add <strong>Ask for Input</strong> (type: Text, prompt: &ldquo;What&rsquo;s on your mind?&rdquo;).
          </li>
          <li>
            Add <strong>Get Contents of URL</strong>:
            <ul className="mt-1 flex flex-col gap-1">
              <li className="flex flex-wrap items-center gap-2">
                URL <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-footnote">{endpoint}</code>
                <CopyButton text={endpoint} label="Copy URL" />
              </li>
              <li>
                Method <strong>POST</strong>; Headers: <code className="text-footnote">Authorization</code> ={" "}
                <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-footnote">Bearer {shown}</code>
                {fresh ? <CopyButton text={`Bearer ${fresh}`} label="Copy header value" /> : null}
              </li>
              <li>
                Request Body <strong>JSON</strong>: key <code className="text-footnote">text</code>, value{" "}
                <em>Provided Input</em>
              </li>
            </ul>
          </li>
          <li>
            Add <strong>Show Notification</strong> with <em>Contents of URL</em>&rsquo;s{" "}
            <code className="text-footnote">message</code> (optional).
          </li>
          <li>
            Say &ldquo;Hey Siri, Add to Orbit&rdquo;, or add it to the Home Screen, Back Tap or the Action Button. In
            the shortcut&rsquo;s settings, turn on <strong>Show in Share Sheet</strong> to send text and links from
            other apps.
          </li>
        </ol>
        <p className="mt-2 px-1 text-footnote text-label-secondary">
          Write naturally: &ldquo;Call the bank tomorrow !2 #finance&rdquo; sets a date, priority and area, just like
          Quick Add.
        </p>

        <SectionLabel>Android and computers</SectionLabel>
        <p className="px-1 text-callout">
          Install Orbit from your browser (Add to Home Screen / Install app). Then <strong>Share → Orbit</strong> from
          any app sends text or a link to your Inbox.
        </p>

        <SectionLabel>Anything else</SectionLabel>
        <pre className="overflow-x-auto rounded-lg bg-surface-sunken p-3 text-footnote">
          {`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${shown}" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Buy milk tomorrow"}'`}
        </pre>
      </PageBody>
      <ConfirmDialog
        open={revoking != null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.name ?? ""}”?`}
        description="Anything using this token stops working straight away."
        confirmLabel="Revoke token"
        onConfirm={() => {
          const t = revoking;
          if (!t) return;
          void fetch(`/api/tokens/${t.id}`, { method: "DELETE" }).then(() => {
            if (fresh) setFresh(null);
            load();
          });
        }}
      />
    </>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? "Copied" : label}
      icon={done ? <Check className="size-4" /> : <Copy className="size-4" />}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    />
  );
}
