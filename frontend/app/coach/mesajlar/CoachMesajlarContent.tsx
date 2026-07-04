"use client";

import { useSearchParams } from "next/navigation";
import MesajlarClient from "./MesajlarClient";

export default function CoachMesajlarContent() {
  const searchParams = useSearchParams();
  const initialConversationId = searchParams.get("conversation");

  return (
    <div className="coach-mesajlar-page">
      <div className="coach-mesajlar-body">
        <MesajlarClient initialConversationId={initialConversationId} />
      </div>
    </div>
  );
}
