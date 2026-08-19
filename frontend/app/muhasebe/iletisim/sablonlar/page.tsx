import { Suspense } from "react";
import SablonlarClient from "@/app/admin/iletisim/sablonlar/SablonlarClient";
import "@/components/communication/communication.css";

export default function MuhasebeSablonlarPage() {
  return (
    <Suspense fallback={<p style={{ color: "#667781", padding: "1rem" }}>Şablonlar yükleniyor…</p>}>
      <SablonlarClient portal="muhasebe" />
    </Suspense>
  );
}
