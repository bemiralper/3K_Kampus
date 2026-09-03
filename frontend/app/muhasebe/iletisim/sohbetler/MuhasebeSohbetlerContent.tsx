"use client";

import { useSearchParams } from "next/navigation";

import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { parseChatQuickFilter } from "@/lib/communication-api";

export default function MuhasebeSohbetlerContent() {
  const searchParams = useSearchParams();

  return (
    <ChatWorkspace
      portal="muhasebe"
      initialConversationId={searchParams.get("conversation")}
      initialFilter={parseChatQuickFilter(searchParams.get("filter"))}
    />
  );
}
