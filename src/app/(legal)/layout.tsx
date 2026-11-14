import Link from "next/link";
import { OrbitMark } from "@/components/app/app-shell";

/** Public pages (privacy policy, terms): readable without signing in. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-label">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold">
          <OrbitMark size={20} /> Orbit
        </Link>
        <nav className="flex gap-4 text-[15px] text-label-secondary">
          <Link href="/privacy" className="hover:text-label">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-label">
            Terms
          </Link>
        </nav>
      </header>
      <main className="legal mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-6">{children}</main>
    </div>
  );
}
