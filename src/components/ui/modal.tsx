"use client";

import { useIsDesktop } from "@/lib/use-media-query";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";

/** A centred dialog on desktop and a bottom sheet on phones, with the same content. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 480,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: number;
}) {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} width={width}>
        {open ? <div className="mt-5">{children}</div> : null}
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {open ? <div className="pt-2 pb-2">{children}</div> : null}
    </Sheet>
  );
}
