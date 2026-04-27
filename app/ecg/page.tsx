import { Suspense } from "react";
import type { Metadata } from "next";
import App from "@/components/App";

export const metadata: Metadata = {
  title: "ECG",
  description: "Electrocardiogramas con interpretación clínica y razonamiento.",
  alternates: { canonical: "/ecg" },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
