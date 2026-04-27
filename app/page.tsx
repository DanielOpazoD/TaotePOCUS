import { Suspense } from "react";
import App from "@/components/App";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Atlas POCUS",
  description:
    "Imágenes y videos ecográficos por tema: cardíaco, pulmonar, abdominal, FAST, vascular, obstétrico, procedimientos.",
  path: "/",
});

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
