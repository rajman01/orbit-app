"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OrbitMark } from "@/components/app/app-shell";
import { cn } from "@/lib/cn";
import { NavAuthLink, PrimaryCta } from "./cta";

/**
 * Translucent nav — content scrolls beneath it. While the dark hero is under it, the nav
 * takes the dark material too, so the top of the page reads as one piece of night sky.
 */
export function LandingNav() {
  const [overHero, setOverHero] = useState(true);
  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero || !("IntersectionObserver" in window)) return;
    // A thin band just under the nav: the hero is "under the nav" while it crosses this band.
    const io = new IntersectionObserver(([entry]) => setOverHero(entry.isIntersecting), {
      rootMargin: "-56px 0px -92% 0px",
    });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  const link =
    "hidden h-9 items-center rounded-full px-4 text-[15px] font-medium text-label-secondary hover:text-label md:inline-flex";
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] text-label material-chrome transition-colors duration-300",
        overHero ? "dark border-transparent" : "border-separator",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Orbit home">
          <OrbitMark size={26} />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">Orbit</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Site">
          <a href="#features" className={link}>
            Features
          </a>
          <a href="#how" className={link}>
            How it works
          </a>
          <NavAuthLink />
          <PrimaryCta size="default" />
        </nav>
      </div>
    </header>
  );
}
