import { Suspense } from "react";

import CampaignExplorer from "@/components/bulk-send/CampaignExplorer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gönderim Geçmişi — Koç Paneli",
};

export default function Page() {
  return (
    <Suspense fallback={<p style={{ color: "#667781", padding: "1rem" }}>Gönderim geçmişi yükleniyor…</p>}>
      <CampaignExplorer mode="coach" />
    </Suspense>
  );
}
