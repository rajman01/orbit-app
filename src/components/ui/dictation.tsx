"use client";

import { Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/**
 * AI-10: talk instead of type, with the browser's own speech-to-text (Chrome, Edge, Safari).
 * Words appear in the box as you speak; you fix anything misheard, then send. No audio reaches
 * Orbit (the browser's speech service — Google or Apple — turns it into text). Hidden where the
 * browser has no speech recognition (Firefox).
 */

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const noop = () => () => {};
/** True in browsers that can dictate (false on the server, so the first render matches). */
export const useDictationSupported = () =>
  useSyncExternalStore(
    noop,
    () => ctor() != null,
    () => false,
  );

/** Joins what was in the box with what's being said, with one space between. */
export function joinDictation(base: string, said: string) {
  const s = said.trim();
  if (!s) return base;
  return !base.trim() ? s : `${base.replace(/\s+$/, "")}${/\n$/.test(base) ? "\n" : " "}${s}`;
}

export function useDictation(value: string, onChange: (text: string) => void) {
  const toast = useToast();
  const supported = useDictationSupported();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);
  // Stop listening when the box goes away.
  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C || rec.current) return;
    const r = new C();
    r.lang = navigator.language || "en-GB";
    r.continuous = true;
    r.interimResults = true;
    const base = latest.current.value;
    let finals = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals = `${finals} ${res[0].transcript}`.trim();
        else interim += res[0].transcript;
      }
      latest.current.onChange(joinDictation(base, `${finals} ${interim}`));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        toast({ message: "Microphone access is off for Orbit. Turn it on in your browser's site settings." });
      else if (e.error === "network") toast({ message: "Dictation needs a connection." });
      else if (e.error !== "no-speech" && e.error !== "aborted") toast({ message: "Dictation stopped." });
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
    }
  }, [toast]);

  return { supported, listening, start, stop, toggle: () => (rec.current ? stop() : start()) };
}

/** The mic button for a text box. Renders nothing where dictation isn't available. */
export function DictateButton({
  dictation,
  className,
}: {
  dictation: ReturnType<typeof useDictation>;
  className?: string;
}) {
  if (!dictation.supported) return null;
  return (
    <button
      type="button"
      onClick={dictation.toggle}
      aria-label={dictation.listening ? "Stop dictating" : "Dictate"}
      aria-pressed={dictation.listening}
      title={dictation.listening ? "Stop dictating" : "Dictate"}
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-full transition-colors",
        dictation.listening ? "bg-danger text-white" : "text-label-secondary hover:bg-fill",
        className,
      )}
    >
      {dictation.listening ? (
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-danger/40 motion-reduce:hidden" />
      ) : null}
      <Mic className="relative size-4" />
    </button>
  );
}
