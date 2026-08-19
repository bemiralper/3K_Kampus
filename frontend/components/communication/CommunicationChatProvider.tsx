"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import CommunicationChatDrawer from "./CommunicationChatDrawer";
import type { InboxPortal } from "@/lib/communication-api";

export interface ChatOpenParams {
  phone: string;
  contactLabel?: string;
  ogrenciId?: number;
  veliId?: number;
  personelId?: number;
}

interface CommunicationChatContextValue {
  openChat: (params: ChatOpenParams) => void;
}

const CommunicationChatContext = createContext<CommunicationChatContextValue | null>(null);

interface CommunicationChatProviderProps {
  children: ReactNode;
  adminInbox?: boolean;
  inboxPortal?: InboxPortal;
}

export function CommunicationChatProvider({
  children,
  adminInbox = false,
  inboxPortal,
}: CommunicationChatProviderProps) {
  const portal: InboxPortal = inboxPortal ?? (adminInbox ? "admin" : "coach");
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ChatOpenParams | null>(null);

  const openChat = useCallback((params: ChatOpenParams) => {
    if (!params.phone?.trim()) return;
    setTarget(params);
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <CommunicationChatContext.Provider value={{ openChat }}>
      {children}
      <CommunicationChatDrawer
        open={open}
        onClose={handleClose}
        target={target}
        inboxPortal={portal}
      />
    </CommunicationChatContext.Provider>
  );
}

export function useCommunicationChat() {
  return useContext(CommunicationChatContext);
}
