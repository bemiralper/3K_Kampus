'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getContextHeaders } from '@/lib/api';
import type { PortalMessageItem } from '@/lib/student-portal-api';

function readNamedCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function readCsrfCookie(): string {
  return readNamedCookie('lms_csrftoken') || readNamedCookie('csrftoken');
}

export default function StudentPortalChatPanel({
  studentId,
  studentName,
}: {
  studentId: number;
  studentName?: string;
}) {
  const [messages, setMessages] = useState<PortalMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThread = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/student/coach-threads/${studentId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...getContextHeaders(),
        },
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.success) {
        setMessages(payload.data?.messages || []);
      }
    } catch {
      // keep silent if portal is disabled
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getContextHeaders(),
      };
      const csrf = readCsrfCookie();
      if (csrf) headers['X-CSRFToken'] = csrf;

      const res = await fetch(`/api/student/coach-threads/${studentId}/`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ body: text }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        setError(payload?.error || 'Mesaj gönderilemedi.');
        return;
      }
      setDraft('');
      setMessages((prev) => [...prev, payload.data as PortalMessageItem]);
    } catch {
      setError('Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      style={{
        marginTop: 20,
        padding: 18,
        borderRadius: 16,
        border: '1px solid rgba(15, 23, 42, 0.1)',
        background: '#ffffff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#4f46e5',
            }}
          >
            Öğrenci Portalı İçi Sohbet
          </span>
          <h3 style={{ margin: '2px 0 0', fontSize: 16 }}>
            {studentName ? `${studentName} — Portal Mesajları` : 'Portal Mesajları'}
          </h3>
        </div>
        <button
          type="button"
          className="coach-btn-secondary"
          onClick={loadThread}
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          Yenile
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#64748b' }}>Portal mesajları yükleniyor…</p>
      ) : (
        <>
          <div
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '8px 4px',
              marginBottom: 12,
            }}
          >
            {messages.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Henüz öğrenci portalı üzerinden mesajlaşma başlamamış. Aşağıdan
                öğrencinin portal ekranına doğrudan mesaj bırakabilirsiniz.
              </p>
            ) : (
              messages.map((m) => {
                const isCoach = m.sender_kind === 'coach';
                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: isCoach ? 'flex-end' : 'flex-start',
                      maxWidth: '78%',
                      padding: '9px 13px',
                      borderRadius: 14,
                      background: isCoach ? '#4f46e5' : '#f1f5f9',
                      color: isCoach ? '#fff' : '#0f172a',
                      fontSize: 13.5,
                    }}
                  >
                    <div>{m.body}</div>
                    <small
                      style={{
                        display: 'block',
                        marginTop: 4,
                        fontSize: 10.5,
                        opacity: 0.75,
                      }}
                    >
                      {m.created_at.replace('T', ' ').slice(0, 16)}
                      {isCoach
                        ? m.read_by_student
                          ? ' · Öğrenci okudu ✓✓'
                          : ' · İletildi ✓'
                        : ''}
                    </small>
                  </div>
                );
              })
            )}
          </div>

          {error ? (
            <p style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 8 }}>{error}</p>
          ) : null}

          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Öğrencinin portal ekranına mesaj gönder…"
              maxLength={2000}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 13.5,
              }}
            />
            <button
              type="submit"
              className="coach-btn-primary"
              disabled={sending || !draft.trim()}
              style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13.5 }}
            >
              {sending ? 'Gönderiliyor…' : 'Gönder'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
