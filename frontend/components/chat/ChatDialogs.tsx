"use client";

import { useEffect, useMemo, useState } from "react";

import {
  BulkRecipientHit,
  ConversationListItem,
  StarredMessageItem,
  TransferCandidate,
  fetchStarredMessages,
  fetchTransferCandidates,
  forwardMessage,
  openConversationByPhone,
  searchBulkRecipients,
  transferConversation,
} from "@/lib/communication-api";

import { conversationTitle, listTimestamp } from "./chat-utils";
import { ChatDialog } from "./ChatDialog";
import { Avatar } from "./ChatSidebar";

// ─── Yeni sohbet ───

export function NewChatDialog({
  open,
  department,
  onClose,
  onOpened,
}: {
  open: boolean;
  department?: string;
  onClose: () => void;
  onOpened: (conv: ConversationListItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BulkRecipientHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      searchBulkRecipients(trimmed)
        .then((data) => {
          if (!cancelled) setResults(data.results || []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const isPhoneQuery = /^[\d+\s()-]{10,}$/.test(query.trim());

  const start = async (hit?: BulkRecipientHit) => {
    setBusy(true);
    setError(null);
    try {
      const phone = hit?.phone || query.trim();
      if (!phone) throw new Error("Telefon numarası bulunamadı.");
      const conv = await openConversationByPhone(phone, {
        ogrenci_id: hit?.kind === "ogrenci" ? hit.id : undefined,
        veli_id: hit?.kind === "veli" ? hit.id : undefined,
        personel_id: hit?.kind === "personel" ? hit.id : undefined,
        department,
      });
      onOpened(conv);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet açılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChatDialog
      open={open}
      title="Yeni sohbet"
      description="Öğrenci, veli veya personel arayın; ya da doğrudan telefon numarası girin."
      width={520}
      onClose={onClose}
    >
      <input
        type="search"
        className="chat-template-search"
        value={query}
        autoFocus
        placeholder="İsim veya telefon numarası"
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Kişi ara"
      />
      {error ? <p className="chat-composer-error">{error}</p> : null}
      <div className="chat-picker-list">
        {loading ? <p className="chat-quick-empty">Aranıyor…</p> : null}
        {!loading && isPhoneQuery ? (
          <button
            type="button"
            className="chat-picker-item"
            disabled={busy}
            onClick={() => start()}
          >
            <span className="chat-picker-name">{query.trim()}</span>
            <span className="chat-picker-meta">Kayıtsız numaraya yaz</span>
          </button>
        ) : null}
        {results.map((hit) => (
          <button
            key={`${hit.kind}-${hit.id}`}
            type="button"
            className="chat-picker-item"
            disabled={busy || !hit.phone}
            onClick={() => start(hit)}
          >
            <span className="chat-picker-name">{hit.label}</span>
            <span className="chat-picker-meta">
              {[hit.meta, hit.phone || "Telefon kayıtlı değil"].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
        {!loading && query.trim().length >= 2 && results.length === 0 && !isPhoneQuery ? (
          <p className="chat-quick-empty">Eşleşen kişi bulunamadı.</p>
        ) : null}
      </div>
    </ChatDialog>
  );
}

// ─── Mesaj iletme ───

export function ForwardDialog({
  open,
  sourceConversationId,
  messageId,
  conversations,
  onClose,
  onDone,
}: {
  open: boolean;
  sourceConversationId: string | null;
  messageId: string | null;
  conversations: ConversationListItem[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setQuery("");
      setError(null);
    }
  }, [open]);

  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr");
    return conversations
      .filter((c) => c.id !== sourceConversationId && c.status !== "ARCHIVED")
      .filter((c) => !needle || conversationTitle(c).toLocaleLowerCase("tr").includes(needle))
      .slice(0, 60);
  }, [conversations, sourceConversationId, query]);

  const submit = async () => {
    if (!sourceConversationId || !messageId || !selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await forwardMessage(sourceConversationId, messageId, selected);
      const failed = result.results.filter((r) => !r.ok);
      if (failed.length === 0) {
        onDone(`Mesaj ${result.sent} sohbete iletildi.`);
      } else if (result.sent > 0) {
        onDone(`${result.sent} sohbete iletildi, ${failed.length} sohbete iletilemedi.`);
      } else {
        setError(
          failed[0]?.session_expired
            ? "Hedef sohbetlerin 24 saatlik penceresi kapalı; şablon göndermeniz gerekir."
            : failed[0]?.error || "Mesaj iletilemedi.",
        );
        setBusy(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mesaj iletilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChatDialog
      open={open}
      title="Mesajı ilet"
      description="Seçtiğiniz sohbetlere aynı içerik yeni bir mesaj olarak gönderilir."
      width={480}
      onClose={onClose}
      footer={
        <>
          <span className="chat-dialog-note">{selected.length} sohbet seçildi</span>
          <button type="button" className="chat-btn chat-btn--ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            className="chat-btn chat-btn--primary"
            disabled={!selected.length || busy}
            onClick={submit}
          >
            {busy ? "İletiliyor…" : "İlet"}
          </button>
        </>
      }
    >
      <input
        type="search"
        className="chat-template-search"
        value={query}
        placeholder="Sohbet ara"
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Sohbet ara"
      />
      {error ? <p className="chat-composer-error">{error}</p> : null}
      <div className="chat-picker-list">
        {options.map((conv) => {
          const checked = selected.includes(conv.id);
          return (
            <label key={conv.id} className={`chat-picker-item is-checkbox${checked ? " is-active" : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setSelected((prev) =>
                    checked ? prev.filter((id) => id !== conv.id) : [...prev, conv.id],
                  )
                }
              />
              <Avatar name={conversationTitle(conv)} photo={conv.profil_foto} size={32} />
              <span className="chat-picker-name">{conversationTitle(conv)}</span>
              <span className="chat-picker-meta">{listTimestamp(conv.last_message_at)}</span>
            </label>
          );
        })}
        {options.length === 0 ? <p className="chat-quick-empty">Uygun sohbet yok.</p> : null}
      </div>
    </ChatDialog>
  );
}

// ─── Sohbeti devret ───

export function TransferDialog({
  open,
  conversation,
  onClose,
  onTransferred,
}: {
  open: boolean;
  conversation: ConversationListItem | null;
  onClose: () => void;
  onTransferred: (conv: ConversationListItem, message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<TransferCandidate[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setReason("");
      setError(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      fetchTransferCandidates(query.trim())
        .then((data) => {
          if (!cancelled) setCandidates(data.candidates || []);
        })
        .catch(() => {
          if (!cancelled) setCandidates([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query]);

  const submit = async (userId: number, name: string) => {
    if (!conversation) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await transferConversation(conversation.id, userId, reason.trim());
      onTransferred(updated, `Sohbet ${name} kişisine atandı.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet devredilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChatDialog
      open={open}
      title="Sohbeti ata"
      description="Sohbetin sorumluluğu seçtiğiniz personele geçer ve değişiklik kayda alınır."
      width={480}
      onClose={onClose}
    >
      <input
        type="search"
        className="chat-template-search"
        value={query}
        placeholder="Personel ara"
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Personel ara"
      />
      <input
        type="text"
        className="chat-template-search"
        value={reason}
        placeholder="Atama nedeni (isteğe bağlı)"
        onChange={(e) => setReason(e.target.value)}
        aria-label="Atama nedeni"
      />
      {error ? <p className="chat-composer-error">{error}</p> : null}
      <div className="chat-picker-list">
        {candidates.map((candidate) => (
          <button
            key={candidate.user_id}
            type="button"
            className="chat-picker-item"
            disabled={busy}
            onClick={() => submit(candidate.user_id, candidate.name)}
          >
            <span className="chat-picker-name">{candidate.name}</span>
            <span className="chat-picker-meta">
              {[candidate.sube_ad, candidate.email].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
        {candidates.length === 0 ? <p className="chat-quick-empty">Personel bulunamadı.</p> : null}
      </div>
    </ChatDialog>
  );
}

// ─── Yıldızlı mesajlar ───

export function StarredDialog({
  open,
  onClose,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  onJump: (conversationId: string, messageId: string) => void;
}) {
  const [items, setItems] = useState<StarredMessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStarredMessages()
      .then((data) => {
        if (!cancelled) setItems(data.messages || []);
      })
      .catch(() => {
        if (!cancelled) setError("Yıldızlı mesajlar yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <ChatDialog
      open={open}
      title="Yıldızlı mesajlar"
      description="Yıldızladığınız mesajlar en yeniden eskiye doğru listelenir."
      onClose={onClose}
    >
      {error ? <p className="chat-composer-error">{error}</p> : null}
      <div className="chat-picker-list">
        {loading ? <p className="chat-quick-empty">Yükleniyor…</p> : null}
        {!loading && items.length === 0 && !error ? (
          <p className="chat-quick-empty">Henüz yıldızlanmış mesaj yok.</p>
        ) : null}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chat-picker-item"
            onClick={() => {
              onJump(item.conversation_id, item.id);
              onClose();
            }}
          >
            <span className="chat-picker-name">{item.contact_name || "Bilinmeyen kişi"}</span>
            <span className="chat-picker-meta">
              {item.direction === "OUTBOUND" ? "Siz: " : ""}
              {(item.body || "Ek").slice(0, 90)}
              {item.created_at ? ` · ${listTimestamp(item.created_at)}` : ""}
            </span>
          </button>
        ))}
      </div>
    </ChatDialog>
  );
}
