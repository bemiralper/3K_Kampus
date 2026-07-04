"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import CommunicationChatDrawer from "./CommunicationChatDrawer";

export interface ChatOpenParams {
  phone: string;
  contactLabel?: string;
  ogrenciId?: number;
  veliId?: number;
}

interface CommunicationChatContextValue {
  openChat: (params: ChatOpenParams) => void;
}

const CommunicationChatContext = createContext<CommunicationChatContextValue | null>(null);

interface CommunicationChatProviderProps {
  children: ReactNode;
  adminInbox?: boolean;
}

export function CommunicationChatProvider({
  children,
  adminInbox = false,
}: CommunicationChatProviderProps) {
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
        adminInbox={adminInbox}
      />
    </CommunicationChatContext.Provider>
  );
}

export function useCommunicationChat() {
  return useContext(CommunicationChatContext);
}
