import { Suspense } from "react";
import App from "@/components/App";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Infografías",
  description: "Algoritmos, protocolos y referencias visuales: BLUE, RUSH, E-FAST y más.",
  path: "/info",
});

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
