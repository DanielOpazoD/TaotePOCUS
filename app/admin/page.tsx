import { Suspense } from "react";
import type { Metadata } from "next";
import App from "@/components/App";

export const metadata: Metadata = {
  title: "Panel de administración",
  description: "Subir, editar y gestionar casos publicados.",
  alternates: { canonical: "/admin" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
