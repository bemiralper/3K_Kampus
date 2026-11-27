'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bell, CheckCheck, MessageCircle, Send } from 'lucide-react';
import {
  studentPortalApi,
  type AnnouncementsResponse,
  type StudentMessagesResponse,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

const QUICK_PROMPTS = [
  'Hocam haftalık çalışma programımı birlikte gözden geçirebilir miyiz?',
  'Son deneme sınavımdaki yanlışlarım için öneriniz var mı?',
  'Bugünkü konuda zorlandım, ek kaynak önerir misiniz?',
];

function StudentCoachAndAnnouncementsInner() {
  const searchParams = useSearchParams();
  const { setPortalCounters } = useStudentPortal();
  const [tab, setTab] = useState<'koc' | 'duyurular'>('koc');
  const [thread, setThread] = useState<StudentMessagesResponse | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementsResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchParams.get('tab') === 'duyurular') {
      setTab('duyurular');
    }
  }, [searchParams]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [msgRes, annRes] = await Promise.all([
        studentPortalApi.messages(true),
        studentPortalApi.announcements(),
      ]);
      setThread(msgRes);
      setAnnouncements(annRes);
      setPortalCounters({
        unreadCoach: msgRes.unread_count,
        unreadAnnouncements: annRes.unread_count,
      });
    } finally {
      setLoading(false);
    }
  }, [setPortalCounters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab === 'koc') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tab, thread?.messages.length]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const created = await studentPortalApi.sendMessage(text);
      setDraft('');
      setThread((prev) =>
        prev ? { ...prev, messages: [...prev.messages, created] } : prev,
      );
    } finally {
      setSending(false);
    }
  };

  const handleMarkAllRead = async () => {
    const updated = await studentPortalApi.markAnnouncementsRead();
    setAnnouncements(updated);
    setPortalCounters({ unreadAnnouncements: updated.unread_count });
  };

  return (
    <>
      <div className="sp-card">
        <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="sp-eyebrow">İletişim & Bilgilendirme</span>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>
              Koçumla Mesajlaşma & Kampüs Duyuruları
            </h1>
          </div>

          <div className="sp-pill-bar">
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'koc' ? '1' : '0'}
              onClick={() => setTab('koc')}
            >
              <MessageCircle size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
              Koçum
            </button>
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'duyurular' ? '1' : '0'}
              onClick={() => setTab('duyurular')}
            >
              <Bell size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
              Duyurular
              {announcements?.unread_count ? ` (${announcements.unread_count})` : ''}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="sp-skeleton" style={{ height: 340 }} />
      ) : tab === 'koc' ? (
        <section className="sp-card">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Portal İçi Doğrudan Hat</span>
              <h2>
                {thread?.coach
                  ? `Rehber / Akademik Koçun: ${thread.coach.full_name}`
                  : 'Koç Ataması Bekleniyor'}
              </h2>
            </div>
          </div>

          {!thread?.can_send ? (
            <div className="sp-empty-box">
              <MessageCircle size={32} />
              <p>
                Şu anda aktif bir birincil koç ataman görünmüyor. Koçun tanımlandığında
                buradan doğrudan mesajlaşabilirsin.
              </p>
            </div>
          ) : (
            <>
              <div className="sp-pill-bar" style={{ marginBottom: 10 }}>
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="sp-chip"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDraft(prompt)}
                  >
                    + {prompt}
                  </button>
                ))}
              </div>

              <div className="sp-chat-box">
                <div className="sp-chat-messages">
                  {thread.messages.length === 0 ? (
                    <div className="sp-empty-box">
                      <p>Koçuna ilk mesajını aşağıdan gönderebilirsin.</p>
                    </div>
                  ) : (
                    thread.messages.map((msg) => {
                      const mine = msg.sender_kind === 'student';
                      return (
                        <div
                          key={msg.id}
                          className="sp-bubble"
                          data-mine={mine ? '1' : '0'}
                        >
                          <div>{msg.body}</div>
                          <span className="sp-bubble-meta">
                            {msg.created_at.replace('T', ' ').slice(0, 16)}
                            {mine
                              ? msg.read_by_coach
                                ? ' · Koçun gördü ✓✓'
                                : ' · İletildi ✓'
                              : ''}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSend} className="sp-chat-composer">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Koçuna mesaj yaz…"
                    maxLength={2000}
                  />
                  <button
                    type="submit"
                    className="sp-btn sp-btn-primary"
                    disabled={sending || !draft.trim()}
                  >
                    <Send size={16} />
                    <span>Gönder</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="sp-card">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Kurum & Kampüs Bilgilendirmeleri</span>
              <h2>Duyurular</h2>
            </div>

            {announcements && announcements.unread_count > 0 ? (
              <button
                type="button"
                className="sp-btn sp-btn-secondary sp-btn-sm"
                onClick={handleMarkAllRead}
              >
                <CheckCheck size={15} />
                <span>Tümünü Okundu İşaretle</span>
              </button>
            ) : null}
          </div>

          {!announcements || announcements.items.length === 0 ? (
            <div className="sp-empty-box">
              <Bell size={30} />
              <p>Henüz yayınlanmış aktif duyuru bulunmuyor.</p>
            </div>
          ) : (
            <div className="sp-stack">
              {announcements.items.map((ann) => (
                <article
                  key={ann.id}
                  className="sp-row-card"
                  style={{ display: 'block' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <strong>{ann.title}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!ann.is_read ? (
                        <span className="sp-chip sp-chip-emerald">Yeni</span>
                      ) : null}
                      <span style={{ fontSize: 12, color: 'var(--sp-muted)' }}>
                        {ann.published_date}
                      </span>
                    </div>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      color: 'var(--sp-ink-2)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {ann.content || ann.summary}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default function StudentCoachAndAnnouncementsPage() {
  return (
    <Suspense fallback={<div className="sp-skeleton" style={{ height: 340 }} />}>
      <StudentCoachAndAnnouncementsInner />
    </Suspense>
  );
}
