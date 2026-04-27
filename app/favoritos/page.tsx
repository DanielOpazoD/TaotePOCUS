import { Suspense } from "react";
import App from "@/components/App";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Tu colección",
  description: "Casos guardados para revisar más tarde.",
  path: "/favoritos",
  noindex: true,
});

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
