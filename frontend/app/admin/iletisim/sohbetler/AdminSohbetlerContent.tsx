"use client";

import { useSearchParams } from "next/navigation";

import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { parseChatQuickFilter } from "@/lib/communication-api";

export default function AdminSohbetlerContent() {
  const searchParams = useSearchParams();

  return (
    <ChatWorkspace
      portal="admin"
      initialConversationId={searchParams.get("conversation")}
      initialFilter={parseChatQuickFilter(searchParams.get("filter"))}
      studentHref={(id) => `/admin/ogrenciler/${id}`}
    />
  );
}
