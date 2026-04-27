import { Suspense } from "react";
import type { Metadata } from "next";
import App from "@/components/App";

export const metadata: Metadata = {
  title: "Atlas POCUS",
  description:
    "Imágenes y videos ecográficos por tema: cardíaco, pulmonar, abdominal, FAST, vascular, obstétrico, procedimientos.",
  alternates: { canonical: "/" },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
