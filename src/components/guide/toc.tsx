"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export interface TocItem {
  id: string;
  title: string;
}

/**
 * The guide's contents. On wide screens it sits beside the text and marks the section being
 * read; on phones it's a collapsible list at the top.
 */
export function GuideToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const { id } of items) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  const list = (onPick?: () => void) => (
    <ol className="flex flex-col gap-0.5">
      {items.map((item, i) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={onPick}
            aria-current={active === item.id ? "location" : undefined}
            className={cn(
              "flex gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] leading-snug transition-colors",
              active === item.id
                ? "bg-accent-fill font-medium text-accent-text"
                : "text-label-secondary hover:bg-fill hover:text-label",
            )}
          >
            <span className="w-5 shrink-0 text-right tabular-nums opacity-60">{i + 1}</span>
            {item.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <nav
        aria-label="Guide contents"
        className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6 lg:block"
      >
        <p className="mb-2 px-2.5 text-[12px] font-semibold tracking-[0.08em] text-label-tertiary uppercase">
          Contents
        </p>
        {list()}
      </nav>
      <details className="group mb-10 rounded-[16px] border border-separator bg-surface lg:hidden">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold">
          Contents
          <span className="text-label-tertiary transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="px-2 pb-3">{list()}</div>
      </details>
    </>
  );
}
