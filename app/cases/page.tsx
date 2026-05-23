import { Suspense } from "react";
import App from "@/components/App";
import { AppShell } from "@/components/AppShell";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Casos clínicos",
  description: "Historias clínicas integradas con razonamiento y hallazgos POCUS.",
  path: "/cases",
});

export default function Page() {
  return (
    <Suspense fallback={<AppShell />}>
      <App />
    </Suspense>
  );
}
