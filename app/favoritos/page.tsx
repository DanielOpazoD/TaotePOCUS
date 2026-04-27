import { Suspense } from "react";
import type { Metadata } from "next";
import App from "@/components/App";

export const metadata: Metadata = {
  title: "Tu colección",
  description: "Casos guardados para revisar más tarde.",
  alternates: { canonical: "/favoritos" },
  // Personal collection — don't index.
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
