import { Suspense } from "react";
import App from "@/components/App";
import { AppShell } from "@/components/AppShell";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Panel de administración",
  description: "Subir, editar y gestionar casos publicados.",
  path: "/admin",
  noindex: true,
});

export default function Page() {
  return (
    <Suspense fallback={<AppShell />}>
      <App />
    </Suspense>
  );
}
