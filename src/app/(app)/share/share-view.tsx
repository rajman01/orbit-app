"use client";

import { Briefcase, Inbox } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { useSync } from "@/components/app/sync-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";

/** §13 share target (Android, desktop Chromium): something shared to Orbit → a task in the Inbox. */
export function ShareView() {
  const params = useSearchParams();
  const router = useRouter();
  const actions = useActions();
  const toast = useToast();
  const sharedTitle = params.get("title")?.trim() ?? "";
  const sharedText = params.get("text")?.trim() ?? "";
  // Some apps put the link in `text`.
  const link = params.get("url")?.trim() || sharedText.match(/https?:\/\/\S+/)?.[0] || "";
  const textOnly = sharedText.replace(link, "").trim();
  const [title, setTitle] = useState((sharedTitle || textOnly || link).slice(0, 500));
  const [note, setNote] = useState(
    [sharedTitle && textOnly && textOnly !== sharedTitle ? textOnly : "", link].filter(Boolean).join("\n"),
  );
  const [saving, setSaving] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const engine = useSync();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await actions.createTask({ title: title.trim(), description: note.trim(), status: "inbox", createdBy: "capture" });
    toast({ message: "Added to Inbox" });
    router.replace("/inbox");
  }

  return (
    <>
      <PageHeader title="Add to Orbit" subtitle="Shared" />
      <PageBody className="max-w-[560px]">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Task">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
          </Field>
          <Field label="Notes">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="field-sizing-content min-h-20 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.replace("/today")}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={<Briefcase className="size-4" />}
              loading={savingJob}
              disabled={!link && !sharedText}
              onClick={async () => {
                // CAR-5: a shared job posting goes to the job assistant instead of the Inbox.
                setSavingJob(true);
                const r = await fetch("/api/jobs/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(link ? { url: link } : { text: sharedText }),
                }).catch(() => null);
                const b = (await r?.json().catch(() => null)) as { error?: string } | null;
                setSavingJob(false);
                if (!r?.ok) return toast({ message: b?.error ?? "Couldn't save the job right now" });
                await engine.sync().catch(() => {});
                toast({ message: "Saved to Job search" });
                router.replace("/jobs");
              }}
            >
              Save as a job
            </Button>
            <Button type="submit" icon={<Inbox className="size-4" />} disabled={!title.trim()} loading={saving}>
              Add to Inbox
            </Button>
          </div>
        </form>
      </PageBody>
    </>
  );
}
