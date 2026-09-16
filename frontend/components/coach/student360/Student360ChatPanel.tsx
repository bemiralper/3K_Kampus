'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FormattedWhatsAppText from '@/components/communication/FormattedWhatsAppText';
import WhatsAppChatButton from '@/components/communication/WhatsAppChatButton';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { useChatThread } from '@/components/chat/useChatThread';
import { formatMessageTime, type ConversationListItem } from '@/lib/communication-api';
import { messageTime } from '@/components/chat/chat-utils';
import '@/components/chat/chat.css';

interface Student360ChatPanelProps {
  studentId: number;
  studentName?: string;
  veliTelefon?: string | null;
  veliId?: number | null;
  conversations: ConversationListItem[];
  loadingList: boolean;
  listError: string | null;
  onReloadList: () => void;
}

export default function Student360ChatPanel({
  studentId,
  studentName,
  veliTelefon,
  veliId,
  conversations,
  loadingList,
  listError,
  onReloadList,
}: Student360ChatPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!conversations.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !conversations.some((c) => c.id === selectedId)) {
      const withUnread = conversations.find((c) => c.unread_count_coach > 0);
      setSelectedId(withUnread?.id ?? conversations[0].id);
    }
  }, [conversations, selectedId]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const thread = useChatThread({
    conversationId: selectedId,
    onSent: onReloadList,
  });

  const showThread = Boolean(selectedId && selected);

  return (
    <div className="s360-chat-shell">
      <aside className="s360-chat-sidebar" aria-label="Konuşmalar">
        <div className="s360-chat-sidebar-head">
          <h3>Konuşmalar</h3>
          {veliTelefon ? (
            <WhatsAppChatButton
              phone={veliTelefon}
              ogrenciId={studentId}
              veliId={veliId ?? undefined}
              contactLabel={studentName ? `${studentName} velisi` : 'Veli'}
              variant="pill"
              label="Yeni"
              title="Veliye uygulama içi WhatsApp mesajı başlat"
            />
          ) : null}
        </div>

        {loadingList ? (
          <div className="s360-chat-sidebar-loading">
            <div className="coach-skeleton" style={{ height: 56, borderRadius: 12 }} />
            <div className="coach-skeleton" style={{ height: 56, borderRadius: 12 }} />
          </div>
        ) : listError ? (
          <div className="s360-chat-sidebar-empty">
            <p>{listError}</p>
            <button type="button" className="coach-link-btn" onClick={onReloadList}>
              Tekrar dene
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="s360-chat-sidebar-empty">
            <p className="s360-chat-empty-title">Henüz konuşma yok</p>
            {veliTelefon ? (
              <p className="coach-muted">Veliye yazmak için <strong>Yeni</strong> düğmesini kullanın.</p>
            ) : (
              <p className="coach-muted">Veli telefonu kayıtlı değil. Veli sekmesinden kontrol edin.</p>
            )}
          </div>
        ) : (
          <ul className="s360-chat-conv-list">
            {conversations.map((conv) => {
              const active = conv.id === selectedId;
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    className={`s360-chat-conv-item${active ? ' active' : ''}${
                      conv.unread_count_coach > 0 ? ' unread' : ''
                    }`}
                    onClick={() => setSelectedId(conv.id)}
                  >
                    <span className="s360-chat-conv-avatar" aria-hidden>
                      {(conv.contact_name || conv.contact_phone || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="s360-chat-conv-body">
                      <span className="s360-chat-conv-top">
                        <strong>{conv.contact_name || conv.contact_phone}</strong>
                        <time dateTime={conv.last_message_at || undefined}>
                          {formatMessageTime(conv.last_message_at)}
                        </time>
                      </span>
                      <span className="s360-chat-conv-preview">
                        {conv.last_message_preview || '—'}
                      </span>
                    </span>
                    {conv.unread_count_coach > 0 ? (
                      <span className="s360-chat-unread">{conv.unread_count_coach}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="s360-chat-thread" aria-label="Mesaj akışı">
        {!showThread ? (
          <div className="s360-chat-thread-empty">
            <div className="s360-chat-thread-empty-icon" aria-hidden>💬</div>
            <h4>Mesaj seçin</h4>
            <p>Soldan bir konuşma seçin veya yeni mesaj başlatın.</p>
          </div>
        ) : (
          <>
            <header className="s360-chat-thread-head">
              <div>
                <strong>{selected?.contact_name || selected?.contact_phone}</strong>
                {selected?.contact_phone ? (
                  <span className="s360-chat-thread-phone">{selected.contact_phone}</span>
                ) : null}
              </div>
            </header>

            <div className="s360-chat-messages" role="log" aria-live="polite">
              {thread.loading ? (
                <div className="s360-chat-messages-loading">Yükleniyor…</div>
              ) : thread.error ? (
                <div className="s360-chat-messages-error">
                  <p>{thread.error}</p>
                  <button type="button" className="coach-link-btn" onClick={() => void thread.reload()}>
                    Yeniden dene
                  </button>
                </div>
              ) : (
                <>
                  {thread.hasMore ? (
                    <button
                      type="button"
                      className="s360-chat-load-older"
                      disabled={thread.loadingOlder}
                      onClick={() => void thread.loadOlder()}
                    >
                      {thread.loadingOlder ? 'Yükleniyor…' : 'Eski mesajları yükle'}
                    </button>
                  ) : null}
                  {thread.messages.length === 0 && thread.pending.length === 0 ? (
                    <div className="s360-chat-messages-empty">
                      <p>Bu konuşmada henüz mesaj yok.</p>
                    </div>
                  ) : (
                    thread.messages.map((msg) => {
                      const outbound = msg.direction === 'OUTBOUND';
                      return (
                        <div
                          key={msg.id}
                          className={`s360-chat-bubble-row${outbound ? ' outbound' : ' inbound'}`}
                        >
                          <div className={`s360-chat-bubble${outbound ? ' outbound' : ''}`}>
                            <FormattedWhatsAppText text={msg.body || ''} />
                            <span className="s360-chat-bubble-meta">{messageTime(msg.created_at)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {thread.pending.map((p) => (
                    <div key={p.tempId} className="s360-chat-bubble-row outbound pending">
                      <div className="s360-chat-bubble outbound">
                        <p>{p.body}</p>
                        <span className="s360-chat-bubble-meta">
                          {p.failed ? 'Gönderilemedi' : 'Gönderiliyor…'}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="s360-chat-compose-wrap">
              <ChatComposer
                session={selected?.session}
                replyTo={null}
                sending={thread.sending}
                disabled={!selected?.session?.is_open && selected?.session?.state !== 'NA'}
                disabledReason="24 saatlik WhatsApp penceresi kapalı. Şablon veya veli yanıtı gerekir."
                quickReplies={[]}
                onSend={(text, file) => void thread.send(text, { file })}
                onCancelReply={() => {}}
                onOpenTemplates={() => {}}
                onUseQuickReply={() => composerRef.current?.focus()}
                composerRef={composerRef}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
