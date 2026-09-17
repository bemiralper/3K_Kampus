'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import WhatsAppChatButton from '@/components/communication/WhatsAppChatButton';
import {
  ConversationListItem,
  fetchConversations,
  formatMessageTime,
} from '@/lib/communication-api';

interface MesajlarTabProps {
  studentId: number;
  studentName?: string;
  veliTelefon?: string | null;
  veliId?: number | null;
}

function initials(name?: string | null, phone?: string) {
  const src = (name || '').trim();
  if (src) {
    const parts = src.split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || 'WA';
  }
  return (phone || 'WA').replace(/\D/g, '').slice(-2) || 'WA';
}

function kindLabel(kind?: string) {
  if (kind === 'veli') return 'Veli';
  if (kind === 'ogrenci') return 'Öğrenci';
  if (kind === 'koc') return 'Koç';
  if (kind === 'ogretmen') return 'Öğretmen';
  return 'Sohbet';
}

export default function MesajlarTab({
  studentId,
  studentName,
  veliTelefon,
  veliId,
}: MesajlarTabProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversations({ ogrenci_id: studentId });
      setConversations(data.conversations || []);
    } catch {
      setError('Mesaj geçmişi yüklenemedi');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="student360-panel s360w-msg">
        <div className="coach-skeleton" style={{ height: 88, borderRadius: 16 }} />
        <div className="coach-skeleton" style={{ height: 72, borderRadius: 14, marginTop: 10 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="student360-panel s360w-msg">
        <p className="coach-error-text">{error}</p>
        <button type="button" className="coach-btn-secondary" onClick={load}>
          Tekrar dene
        </button>
      </div>
    );
  }

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count_coach || 0), 0);

  return (
    <div className="student360-panel s360w-msg">
      <section className="s360w-msg-hero">
        <div>
          <span className="s360-eyebrow">WhatsApp</span>
          <h2>{studentName || 'Mesajlar'}</h2>
          <p>
            {conversations.length === 0
              ? 'Bu öğrenci için henüz konuşma yok.'
              : `${conversations.length} sohbet${unreadTotal > 0 ? ` · ${unreadTotal} okunmamış` : ''}`}
          </p>
        </div>
        <div className="s360w-msg-hero-actions">
          {veliTelefon ? (
            <WhatsAppChatButton
              phone={veliTelefon}
              ogrenciId={studentId}
              veliId={veliId ?? undefined}
              contactLabel={studentName ? `${studentName} velisi` : 'Veli'}
              variant="pill"
              label="Veliye yaz"
              title="Veliye uygulama içi WhatsApp mesajı başlat"
            />
          ) : null}
          <Link href="/coach/sohbetler" className="s360w-msg-center">
            Mesaj merkezi
          </Link>
        </div>
      </section>

      {conversations.length === 0 ? (
        <div className="s360w-msg-empty">
          <div className="s360w-msg-empty-icon" aria-hidden>
            ✉
          </div>
          <h3>Sohbet henüz başlamamış</h3>
          {veliTelefon ? (
            <p>Velinin numarası kayıtlı. İlk mesajı buradan başlatabilirsiniz.</p>
          ) : (
            <p>Veli telefonu kayıtlı değil. Veli sekmesinden kontrol edin.</p>
          )}
        </div>
      ) : (
        <ul className="s360w-msg-list">
          {conversations.map((conv) => {
            const name = conv.contact_name || conv.veli_ad || conv.contact_phone;
            return (
              <li key={conv.id}>
                <Link
                  href={`/coach/sohbetler?conversation=${conv.id}`}
                  className={`s360w-msg-item${conv.unread_count_coach > 0 ? ' is-unread' : ''}`}
                >
                  <span className="s360w-msg-avatar">{initials(name, conv.contact_phone)}</span>
                  <span className="s360w-msg-body">
                    <span className="s360w-msg-top">
                      <strong>{name}</strong>
                      <time>{formatMessageTime(conv.last_message_at)}</time>
                    </span>
                    <span className="s360w-msg-preview">
                      {conv.last_message_preview || 'Henüz mesaj yok'}
                    </span>
                    <span className="s360w-msg-tags">
                      <span className="s360w-msg-kind">{kindLabel(conv.contact_kind)}</span>
                      {conv.session?.is_open === false && (
                        <span className="s360w-msg-kind is-warn">Pencere kapalı</span>
                      )}
                    </span>
                  </span>
                  {conv.unread_count_coach > 0 && (
                    <span className="s360w-msg-unread">{conv.unread_count_coach}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
