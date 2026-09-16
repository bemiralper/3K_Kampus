'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchConversations, type ConversationListItem } from '@/lib/communication-api';
import Student360ChatPanel from './Student360ChatPanel';

interface MesajlarTabProps {
  studentId: number;
  studentName?: string;
  veliTelefon?: string | null;
  veliId?: number | null;
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

  return (
    <div className="student360-panel s360-mesajlar-panel">
      <div className="s360-mesajlar-head">
        <div>
          <h2 className="s360-panel-title">
            {studentName ? `${studentName} ile mesajlar` : 'Mesajlar'}
          </h2>
          <p className="s360-panel-sub">WhatsApp konuşmaları bu öğrenci için filtrelenir.</p>
        </div>
        <Link href="/coach/sohbetler" className="coach-link-btn">
          Mesaj merkezi →
        </Link>
      </div>

      <Student360ChatPanel
        studentId={studentId}
        studentName={studentName}
        veliTelefon={veliTelefon}
        veliId={veliId}
        conversations={conversations}
        loadingList={loading}
        listError={error}
        onReloadList={load}
      />
    </div>
  );
}
