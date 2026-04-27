import { Suspense } from "react";
import type { Metadata } from "next";
import App from "@/components/App";

export const metadata: Metadata = {
  title: "Casos clínicos",
  description: "Historias clínicas integradas con razonamiento y hallazgos POCUS.",
  alternates: { canonical: "/cases" },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
