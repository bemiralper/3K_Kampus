"use client";

import { useSearchParams } from "next/navigation";
import { CommunicationPageShell } from "@/components/communication";
import MesajlarClient from "@/app/coach/mesajlar/MesajlarClient";
import "@/components/communication/communication.css";

export default function MuhasebeMesajlarContent() {
  const searchParams = useSearchParams();
  const initialConversationId = searchParams.get("conversation");

  return (
    <CommunicationPageShell
      title="WhatsApp"
      subtitle="Şube kapsamındaki muhasebe sohbetleri"
      icon="💬"
      breadcrumbs={[{ label: "WhatsApp" }, { label: "Sohbetler" }]}
      maxWidth="full"
      variant="inbox"
    >
      <div className="comm-admin-inbox">
        <MesajlarClient
          initialConversationId={initialConversationId}
          showAccountFilter
          managerInbox
          showMetaManageLink={false}
        />
      </div>
    </CommunicationPageShell>
  );
}
