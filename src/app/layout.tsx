import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

const SITE = (process.env.BETTER_AUTH_URL ?? "https://orbit-app-three-beta.vercel.app").replace(/\/$/, "");

export const metadata: Metadata = {
  // Lets link previews use absolute URLs (the preview image is src/app/opengraph-image.tsx).
  metadataBase: new URL(SITE),
  applicationName: "Orbit",
  title: { default: "Orbit", template: "%s · Orbit" },
  description: "Plan your life, beat procrastination, become your best self.",
  appleWebApp: { capable: true, title: "Orbit", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { type: "website", siteName: "Orbit", locale: "en_GB" },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
