import { Suspense } from "react";
import App from "@/components/App";
import { AppShell } from "@/components/AppShell";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "ECG",
  description: "Electrocardiogramas con interpretación clínica y razonamiento.",
  path: "/ecg",
});

export default function Page() {
  return (
    <Suspense fallback={<AppShell />}>
      <App />
    </Suspense>
  );
}
