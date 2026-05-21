import { Suspense } from "react";
import App from "@/components/App";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Ocular",
  description:
    "Ecografía ocular y de nervio óptico: ONSD, retina, cámara vítrea, motilidad ocular.",
  path: "/ocular",
});

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
