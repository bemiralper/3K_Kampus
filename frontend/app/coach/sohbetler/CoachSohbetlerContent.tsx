"use client";

import { useSearchParams } from "next/navigation";

import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { parseChatQuickFilter } from "@/lib/communication-api";

export default function CoachSohbetlerContent() {
  const searchParams = useSearchParams();

  return (
    <ChatWorkspace
      portal="coach"
      initialConversationId={searchParams.get("conversation")}
      initialFilter={parseChatQuickFilter(searchParams.get("filter"))}
      studentHref={(id) => `/coach/ogrencilerim/${id}`}
    />
  );
}
