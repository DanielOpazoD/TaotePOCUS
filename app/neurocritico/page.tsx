import { Suspense } from "react";
import App from "@/components/App";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Neurocrítico",
  description:
    "Ultrasonido en el paciente neurocrítico: ONSD, Doppler transcraneal, vainas del nervio óptico y aplicaciones en neurointensivo.",
  path: "/neurocritico",
});

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
