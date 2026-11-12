"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type Tag = "div" | "li" | "article";

/**
 * Slides its content into place the first time it scrolls into view. The motion lives in CSS
 * (`.reveal` in globals.css): it's a fade only when reduced motion is on, and content is
 * simply visible without JavaScript. Sideways slides apply on wide screens; phones slide up.
 */
export function Reveal({
  children,
  from = "up",
  delay = 0,
  as = "div",
  className,
}: {
  children: React.ReactNode;
  from?: "up" | "left" | "right" | "scale";
  /** Milliseconds; use to stagger items in a row. */
  delay?: number;
  as?: Tag;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.dataset.shown = "";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.shown = "";
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Component = as as "div";
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn("reveal", `reveal-${from}`, className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Component>
  );
}
