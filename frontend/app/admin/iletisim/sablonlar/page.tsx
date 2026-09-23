import { Suspense } from "react";
import SablonlarClient from "./SablonlarClient";

export const metadata = {
  title: "Şablonlar — 3K Kampüs",
};

export default function SablonlarPage() {
  // useSearchParams kullanan istemci bileşeni; statik derlemede Suspense sınırı gerekir.
  return (
    <Suspense fallback={<p style={{ color: "#667781", padding: "1rem" }}>Şablonlar yükleniyor…</p>}>
      <SablonlarClient />
    </Suspense>
  );
}
