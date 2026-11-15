import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Orbit",
    short_name: "Orbit",
    description: "Plan your life, beat procrastination, become your best self.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // §13: Share → Orbit (Android, desktop Chromium) opens /share with what was shared.
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Today", url: "/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Inbox", url: "/inbox", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
