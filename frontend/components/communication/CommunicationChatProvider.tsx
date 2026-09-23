"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Doğrudan dosyadan içe aktarılır; `components/communication` barrel'ı bu sağlayıcıyı
// dışa aktardığı için barrel üzerinden gitmek döngüsel içe aktarma yaratır.
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
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

/**
 * Öğrenci/veli/personel kartlarındaki WhatsApp düğmesi için sohbet yan paneli.
 *
 * `openChat(params)` çağrısı paneli açar; içerik yeni sohbet yığını
 * (`ChatWorkspace` drawer varyantı) ile çizilir. Kabuk: karartma, `role=dialog`,
 * Escape ve arka plana tıklamayla kapanma, sayfa kaydırma kilidi.
 */
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

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Escape: iş alanı (arama / bilgi paneli açıkken) olayı `preventDefault` ile
  // kendine alır; diyaloglar (`ChatDialog`) ise yayılımı durdurur. Kalan Escape paneli kapatır.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Arka plandaki sayfa kaymasın.
  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  return (
    <CommunicationChatContext.Provider value={{ openChat }}>
      {children}
      {open && target ? (
        <div className="chat-drawer-overlay" onClick={close} role="presentation">
          <aside
            className="chat-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="WhatsApp mesajlaşma"
          >
            <header className="chat-drawer-head">
              <div className="chat-drawer-title">
                <h2>{target.contactLabel || "WhatsApp"}</h2>
                <span className="chat-drawer-phone">{target.phone}</span>
              </div>
              <button
                type="button"
                className="chat-icon-btn chat-drawer-close"
                onClick={close}
                aria-label="Kapat"
              >
                ×
              </button>
            </header>
            <div className="chat-drawer-body">
              <ChatWorkspace
                // Hedef değişince iş alanı sıfırdan kurulur (eski sohbet durumu kalmasın).
                key={`${target.phone}|${target.ogrenciId ?? ""}|${target.veliId ?? ""}|${target.personelId ?? ""}`}
                variant="drawer"
                portal={portal}
                initialOpen={target}
                onRequestClose={close}
              />
            </div>
          </aside>
        </div>
      ) : null}
    </CommunicationChatContext.Provider>
  );
}

export function useCommunicationChat() {
  return useContext(CommunicationChatContext);
}
