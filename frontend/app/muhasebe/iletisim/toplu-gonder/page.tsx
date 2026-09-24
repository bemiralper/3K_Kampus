import { Suspense } from "react";

import BulkSendStudio from "@/components/bulk-send/BulkSendStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Toplu Gönderim — Muhasebe",
};

export default function Page() {
  return (
    <Suspense fallback={<p style={{ color: "#667781", padding: "1rem" }}>Toplu gönderim yükleniyor…</p>}>
      <BulkSendStudio mode="muhasebe" />
    </Suspense>
  );
}
