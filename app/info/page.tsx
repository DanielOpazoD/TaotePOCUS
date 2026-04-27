import { Suspense } from "react";
import type { Metadata } from "next";
import App from "@/components/App";

export const metadata: Metadata = {
  title: "Infografías",
  description: "Algoritmos, protocolos y referencias visuales: BLUE, RUSH, E-FAST y más.",
  alternates: { canonical: "/info" },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
