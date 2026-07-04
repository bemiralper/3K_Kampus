'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ConversationListItem,
  fetchConversations,
  formatMessageTime,
} from '@/lib/communication-api';

interface MesajlarTabProps {
  studentId: number;
  studentName?: string;
}

export default function MesajlarTab({ studentId, studentName }: MesajlarTabProps) {
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
      <div className="student360-panel">
        <div className="coach-skeleton" style={{ height: 80, borderRadius: 12 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="student360-panel">
        <p className="coach-error-text">{error}</p>
        <button type="button" className="coach-btn-secondary" onClick={load}>
          Tekrar dene
        </button>
      </div>
    );
  }

  return (
    <div className="student360-panel mesajlar-tab-panel">
      <div className="mesajlar-tab-header">
        <h3>{studentName ? `${studentName} — WhatsApp` : 'WhatsApp Mesajları'}</h3>
        <Link href="/coach/mesajlar" className="coach-link-btn">
          Mesaj Merkezi →
        </Link>
      </div>

      {conversations.length === 0 ? (
        <p className="coach-muted">Bu öğrenci için henüz konuşma yok.</p>
      ) : (
        <ul className="mesajlar-tab-list">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <Link href={`/coach/mesajlar?conversation=${conv.id}`} className="mesajlar-tab-item">
                <div className="mesajlar-tab-item-top">
                  <strong>{conv.contact_name || conv.contact_phone}</strong>
                  <span>{formatMessageTime(conv.last_message_at)}</span>
                </div>
                <p>{conv.last_message_preview || '—'}</p>
                {conv.unread_count_coach > 0 && (
                  <span className="mesajlar-unread-badge">{conv.unread_count_coach}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
