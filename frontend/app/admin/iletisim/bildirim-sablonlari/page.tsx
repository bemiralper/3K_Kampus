import { Suspense } from "react";
import BildirimSablonlariClient from "./BildirimSablonlariClient";

export const metadata = {
  title: "Bildirim Şablonları — 3K Kampüs",
};

export default function BildirimSablonlariPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Yükleniyor…</div>}>
      <BildirimSablonlariClient />
    </Suspense>
  );
}
