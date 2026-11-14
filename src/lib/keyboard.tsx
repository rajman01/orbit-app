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
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const typing = isTypingField(document.activeElement);
        if (!typing) baseline = Math.max(height(), window.innerHeight);
        const open = typing && (vv ? baseline - height() > 120 : true);
        document.documentElement.dataset.keyboard = open ? "open" : "closed";
      });
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      delete document.documentElement.dataset.keyboard;
    };
  }, []);
  return null;
}
