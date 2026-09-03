"use client";

import Link from "next/link";
import { CampaignHistoryPanel, CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import {
  communicationPortalPaths,
  type InboxPortal,
} from "@/lib/communication-api";

export default function KampanyalarClient({ portal = "admin" }: { portal?: InboxPortal }) {
  const paths = communicationPortalPaths(portal);
  return (
    <CommunicationPageShell
      title="Gönderim Geçmişi"
      subtitle="Toplu WhatsApp gönderim geçmişi ve raporları"
      icon="📋"
      breadcrumbs={[
        { label: portal === "muhasebe" ? "WhatsApp" : "İletişim", href: paths.home },
        { label: "Gönderim Geçmişi" },
      ]}
      actions={
        <Link href={paths.bulk} className="comm-btn-primary">
          + Yeni Toplu Gönderim
        </Link>
      }
    >
      <CampaignHistoryPanel detailPath={paths.campaign} emptyHref={paths.bulk} />
    </CommunicationPageShell>
  );
}
