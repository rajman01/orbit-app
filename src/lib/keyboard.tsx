"use client";

import { useEffect } from "react";

const NOT_TYPING = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

function isTypingField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !NOT_TYPING.has((el as HTMLInputElement).type);
}

/**
 * Phones: bars pinned to the bottom of the screen ride up on top of the on-screen keyboard and
 * cover what's being typed. This sets `data-keyboard="open"` on <html> while a text field has
 * focus and the visible area has shrunk (the keyboard is up), so CSS can hide those bars.
 * A hardware keyboard doesn't shrink the screen, so nothing is hidden then.
 */
export function KeyboardWatcher() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const vv = window.visualViewport;
    const height = () => vv?.height ?? window.innerHeight;
    // The full height with no keyboard; re-measured whenever nothing is being typed (rotation…).
    let baseline = Math.max(height(), window.innerHeight);
    let frame = 0;
    let wasOpen = false;
    // Bars pinned to the bottom (the tab bar and what sits above it) are placed against the
    // layout viewport. After the keyboard closes on a scrolled page, iOS can leave that viewport
    // as short as it was with the keyboard up, so the bars float mid-screen with the page showing
    // underneath. A zero-height probe pinned to the bottom shows where "bottom" currently is; if
    // it's far from the bottom of what's actually visible, shift the bars by the difference
    // (--pin-fix). Small gaps (Safari's toolbars animating) are left alone.
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;pointer-events:none;visibility:hidden";
    document.body.appendChild(probe);
    let fix = 0;
    const realign = () => {
      const root = document.documentElement;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const gap = Math.round(visibleBottom - probe.getBoundingClientRect().bottom);
      const next = root.dataset.keyboard !== "open" && Math.abs(gap) > 40 ? gap : 0;
      if (next !== fix) {
        fix = next;
        if (fix) root.style.setProperty("--pin-fix", `${fix}px`);
        else root.style.removeProperty("--pin-fix");
      }
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const typing = isTypingField(document.activeElement);
        if (!typing) baseline = Math.max(height(), window.innerHeight);
        const open = typing && (vv ? baseline - height() > 120 : true);
        const root = document.documentElement;
        root.dataset.keyboard = open ? "open" : "closed";
        // Where the visible area is: full-screen views pin themselves to it while typing, so iOS
        // scrolling the page up for the keyboard doesn't carry their heading away (.keyboard-fit).
        root.style.setProperty("--vv-height", `${Math.round(height())}px`);
        root.style.setProperty("--vv-top", `${Math.round(vv?.offsetTop ?? 0)}px`);
        if (wasOpen && !open) {
          // iOS sometimes keeps the shrunken layout after the keyboard closes; a scroll in place
          // asks it to lay the page out again.
          window.scrollTo(window.scrollX, window.scrollY);
        }
        wasOpen = open;
        realign();
      });
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      probe.remove();
      document.documentElement.style.removeProperty("--pin-fix");
      delete document.documentElement.dataset.keyboard;
    };
  }, []);
  return null;
}
