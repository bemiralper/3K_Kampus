import { Suspense } from "react";
import SozlesmeOlusturClient from "./SozlesmeOlusturClient";

export default function SozlesmeOlusturPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>Yükleniyor…</div>}>
      <SozlesmeOlusturClient />
    </Suspense>
  );
}
