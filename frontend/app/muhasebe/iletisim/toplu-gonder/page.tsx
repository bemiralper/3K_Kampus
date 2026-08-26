import { Suspense } from "react";
import TopluGonderClient from "@/app/admin/iletisim/toplu-gonder/TopluGonderClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Toplu Gönderim — Muhasebe",
};

export default function MuhasebeTopluGonderPage() {
  return (
    <Suspense fallback={<p style={{ color: "#667781", padding: "1rem" }}>Toplu gönderim yükleniyor…</p>}>
      <TopluGonderClient
        mode="muhasebe"
        campaignDetailPath={(id) => `/admin/iletisim/kampanyalar/${id}`}
      />
    </Suspense>
  );
}
