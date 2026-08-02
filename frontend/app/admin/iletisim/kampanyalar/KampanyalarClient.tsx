"use client";

import Link from "next/link";
import { CampaignHistoryPanel, CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";

export default function KampanyalarClient() {
  return (
    <CommunicationPageShell
      title="Gönderim Geçmişi"
      subtitle="Toplu WhatsApp gönderim geçmişi ve raporları"
      icon="📋"
      breadcrumbs={[{ label: "İletişim" }, { label: "Gönderim Geçmişi" }]}
      actions={
        <Link href="/admin/iletisim/toplu-gonder" className="comm-btn-primary">
          + Yeni Toplu Gönderim
        </Link>
      }
    >
      <CampaignHistoryPanel />
    </CommunicationPageShell>
  );
}
