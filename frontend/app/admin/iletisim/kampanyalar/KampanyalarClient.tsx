"use client";

import Link from "next/link";
import { CampaignHistoryPanel, CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import { communicationPortalPaths, type InboxPortal } from "@/lib/communication-api";

export default function KampanyalarClient({ portal = "admin" }: { portal?: InboxPortal }) {
  const paths = communicationPortalPaths(portal);
  const crumbs =
    portal === "muhasebe"
      ? [{ label: "WhatsApp", href: "/muhasebe/iletisim/mesajlar" }, { label: "Gönderim Geçmişi" }]
      : [{ label: "İletişim" }, { label: "Gönderim Geçmişi" }];

  return (
    <CommunicationPageShell
      title="Gönderim Geçmişi"
      subtitle="Toplu WhatsApp gönderim geçmişi ve raporları"
      icon="📋"
      breadcrumbs={crumbs}
      actions={
        <Link href={paths.compose} className="comm-btn-primary">
          + Yeni Toplu Gönderim
        </Link>
      }
    >
      <CampaignHistoryPanel
        detailPath={paths.campaignDetail}
        emptyHref={paths.compose}
      />
    </CommunicationPageShell>
  );
}
