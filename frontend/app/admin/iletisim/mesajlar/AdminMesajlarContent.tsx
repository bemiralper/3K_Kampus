"use client";

import { useSearchParams } from "next/navigation";
import { CommunicationPageShell } from "@/components/communication";
import MesajlarClient from "@/app/coach/mesajlar/MesajlarClient";

export default function AdminMesajlarContent() {
  const searchParams = useSearchParams();
  const initialConversationId = searchParams.get("conversation");

  return (
    <CommunicationPageShell
      title="Mesajlar"
      subtitle="Kurum geneli WhatsApp konuşmaları"
      icon="💬"
      breadcrumbs={[{ label: "İletişim" }, { label: "Mesajlar" }]}
      maxWidth="full"
      variant="inbox"
    >
      <div className="comm-admin-inbox">
        <MesajlarClient initialConversationId={initialConversationId} />
      </div>
    </CommunicationPageShell>
  );
}
