import { Suspense } from "react";
import OdemeTakipClient from "./OdemeTakipClient";

export default function OdemeTakipPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Yükleniyor…</div>}>
      <OdemeTakipClient />
    </Suspense>
  );
}
