import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "./profile-view";

export const instant = false;
export const metadata: Metadata = { title: "Career profile" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProfileView />
    </Suspense>
  );
}
