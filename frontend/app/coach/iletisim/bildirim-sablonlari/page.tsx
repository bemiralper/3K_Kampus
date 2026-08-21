import { Suspense } from "react";
import BildirimSablonlariClient from "@/app/admin/iletisim/bildirim-sablonlari/BildirimSablonlariClient";

export default function CoachBildirimSablonlariPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Yükleniyor…</div>}>
      <BildirimSablonlariClient />
    </Suspense>
  );
}
