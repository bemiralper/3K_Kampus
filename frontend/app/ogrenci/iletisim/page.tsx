'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCheck,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Megaphone,
  MessageCircle,
  Search,
  Send,
} from 'lucide-react';
import FormattedPortalText from '@/components/student/FormattedPortalText';
import {
  studentPortalApi,
  type AnnouncementFeedItem,
  type AnnouncementsResponse,
  type StudentMessagesResponse,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

const QUICK_PROMPTS = [
  'Hocam haftalık çalışma programımı birlikte gözden geçirebilir miyiz?',
  'Son deneme sınavımdaki yanlışlarım için öneriniz var mı?',
  'Bugünkü konuda zorlandım, ek kaynak önerir misiniz?',
];

function formatTurkishDateTime(isoOrDate: string, publishedAt?: string): string {
  const raw = publishedAt || isoOrDate;
  if (!raw) return '';
  const hasTime = raw.includes('T');
  const d = new Date(hasTime ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  const datePart = d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (!hasTime) return datePart;
  const timePart = d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return timePart === '00:00' ? datePart : `${datePart} · ${timePart}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryVisual(category?: string) {
  switch (category) {
    case 'sinav':
      return {
        icon: GraduationCap,
        chipClass: 'sp-chip-warm',
        accent: 'var(--sp-warm)',
        soft: 'var(--sp-warm-soft)',
        label: 'Sınav & Sonuç',
      };
    case 'odev':
      return {
        icon: BookOpen,
        chipClass: 'sp-chip-accent',
        accent: 'var(--sp-accent)',
        soft: 'var(--sp-accent-soft)',
        label: 'Ödev & Ders Planı',
      };
    case 'yoklama':
      return {
        icon: CalendarCheck,
        chipClass: 'sp-chip',
        accent: '#0ea5e9',
        soft: 'rgba(14, 165, 233, 0.12)',
        label: 'Yoklama & Kampüs',
      };
    default:
      return {
        icon: Megaphone,
        chipClass: 'sp-chip-emerald',
        accent: 'var(--sp-emerald)',
        soft: 'var(--sp-emerald-soft)',
        label: 'Duyuru & Ders Notu',
      };
  }
}

function StudentCoachAndAnnouncementsInner() {
  const searchParams = useSearchParams();
  const { setPortalCounters } = useStudentPortal();
  const explicitTab = searchParams.get('tab');
  const [tab, setTab] = useState<'koc' | 'duyurular'>(
    explicitTab === 'duyurular' ? 'duyurular' : 'koc',
  );
  const [autoSwitchedOnce, setAutoSwitchedOnce] = useState(false);

  const [thread, setThread] = useState<StudentMessagesResponse | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementsResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (explicitTab === 'duyurular') {
      setTab('duyurular');
    } else if (explicitTab === 'koc') {
      setTab('koc');
    }
  }, [explicitTab]);

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

      if (
        !explicitTab &&
        !autoSwitchedOnce &&
        msgRes.messages.length === 0 &&
        annRes.items.length > 0
      ) {
        setTab('duyurular');
        setAutoSwitchedOnce(true);
      }
    } finally {
      setLoading(false);
    }
  }, [autoSwitchedOnce, explicitTab, setPortalCounters]);

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

  const handleMarkSingleRead = async (item: AnnouncementFeedItem) => {
    if (item.is_read) return;
    const key = item.item_key || item.id;
    const updated = await studentPortalApi.markAnnouncementsRead([key]);
    setAnnouncements(updated);
    setPortalCounters({ unreadAnnouncements: updated.unread_count });
  };

  const filteredItems = useMemo(() => {
    const list = announcements?.items || [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return list.filter((it) => {
      if (selectedCategory !== 'ALL' && (it.category || 'duyuru') !== selectedCategory) {
        return false;
      }
      if (onlyUnread && it.is_read) {
        return false;
      }
      if (q) {
        const hay = `${it.title} ${it.content} ${it.summary} ${(it.attachments || [])
          .map((a) => a.name)
          .join(' ')}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [announcements, onlyUnread, searchQuery, selectedCategory]);

  return (
    <>
      <div className="sp-card">
        <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="sp-eyebrow">İletişim & Kampüs Akışı</span>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>
              Koçumla Mesajlaşma, Mesajlar & Duyurular
            </h1>
          </div>

          <div className="sp-pill-bar">
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'duyurular' ? '1' : '0'}
              onClick={() => setTab('duyurular')}
            >
              <Bell size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
              Mesajlar & Duyurular
              {announcements?.unread_count ? ` (${announcements.unread_count} Yeni)` : ''}
            </button>
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'koc' ? '1' : '0'}
              onClick={() => setTab('koc')}
            >
              <MessageCircle size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
              Koçumla Sohbet
              {thread?.messages.length ? ` (${thread.messages.length})` : ''}
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
                          <FormattedPortalText text={msg.body} compact />
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
          <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span className="sp-eyebrow">Kurum Mesajları, Ders Notları & Duyurular</span>
              <h2>
                Gelen Kutusu & Kampüs Duyuruları
                {announcements?.items.length ? (
                  <small
                    style={{
                      marginLeft: 8,
                      fontWeight: 500,
                      fontSize: 13,
                      color: 'var(--sp-muted)',
                    }}
                  >
                    ({filteredItems.length} kayıt)
                  </small>
                ) : null}
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {announcements && announcements.unread_count > 0 ? (
                <>
                  <button
                    type="button"
                    className="sp-pill"
                    data-active={onlyUnread ? '1' : '0'}
                    onClick={() => setOnlyUnread((v) => !v)}
                  >
                    Sadece Yeni ({announcements.unread_count})
                  </button>
                  <button
                    type="button"
                    className="sp-btn sp-btn-secondary sp-btn-sm"
                    onClick={handleMarkAllRead}
                  >
                    <CheckCheck size={15} />
                    <span>Tümünü Okundu İşaretle</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* Kategori Şeridi + Hızlı Arama */}
          {announcements && announcements.items.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div className="sp-pill-bar">
                <button
                  type="button"
                  className="sp-pill"
                  data-active={selectedCategory === 'ALL' ? '1' : '0'}
                  onClick={() => setSelectedCategory('ALL')}
                >
                  Tümü ({announcements.items.length})
                </button>
                {(announcements.categories || []).map((cat) => (
                  <button
                    key={cat.code}
                    type="button"
                    className="sp-pill"
                    data-active={selectedCategory === cat.code ? '1' : '0'}
                    onClick={() => setSelectedCategory(cat.code)}
                  >
                    {cat.label} ({cat.count})
                  </button>
                ))}
              </div>

              <div
                style={{
                  position: 'relative',
                  minWidth: 230,
                  flex: '0 1 280px',
                }}
              >
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: 11,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--sp-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Mesaj, sınav veya ders notu ara…"
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 33px',
                    borderRadius: 11,
                    border: '1px solid var(--sp-border-strong)',
                    background: 'var(--sp-surface-2)',
                    color: 'var(--sp-ink)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          ) : null}

          {filteredItems.length === 0 ? (
            <div className="sp-empty-box">
              <Bell size={30} />
              <p>
                {searchQuery || selectedCategory !== 'ALL' || onlyUnread
                  ? 'Seçili filtreye uygun mesaj veya duyuru bulunamadı.'
                  : 'Henüz yayınlanmış aktif mesaj veya duyuru bulunmuyor.'}
              </p>
            </div>
          ) : (
            <div className="sp-stack" style={{ gap: 12 }}>
              {filteredItems.map((ann) => {
                const vis = categoryVisual(ann.category);
                const IconComp = vis.icon;
                const attachments = ann.attachments || [];
                const itemKey = ann.item_key || String(ann.id);

                return (
                  <article
                    key={itemKey}
                    className="sp-row-card"
                    style={{
                      display: 'block',
                      padding: '15px 17px',
                      borderLeft: !ann.is_read
                        ? `4px solid ${vis.accent}`
                        : '1px solid var(--sp-border)',
                      background: !ann.is_read ? 'var(--sp-surface)' : 'var(--sp-surface-2)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 9,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: vis.soft,
                            color: vis.accent,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <IconComp size={17} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              flexWrap: 'wrap',
                              marginBottom: 2,
                            }}
                          >
                            <span className={`sp-chip ${vis.chipClass}`} style={{ fontSize: 11 }}>
                              {ann.category_label || vis.label}
                            </span>
                            {ann.source_kind === 'message' ? (
                              <span
                                className="sp-chip"
                                style={{ fontSize: 11 }}
                              >
                                {ann.recipient_channel === 'veli_hatti'
                                  ? 'Veli & Öğrenci Bilgilendirmesi'
                                  : 'Sana Gönderilen Mesaj'}
                              </span>
                            ) : null}
                            {!ann.is_read ? (
                              <span className="sp-chip sp-chip-emerald" style={{ fontSize: 11 }}>
                                Yeni
                              </span>
                            ) : null}
                          </div>
                          <strong style={{ fontSize: 15, display: 'block', color: 'var(--sp-ink)' }}>
                            {ann.title}
                          </strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--sp-muted)', whiteSpace: 'nowrap' }}>
                          {formatTurkishDateTime(ann.published_date, ann.published_at)}
                        </span>
                        {!ann.is_read ? (
                          <button
                            type="button"
                            className="sp-btn sp-btn-secondary sp-btn-sm"
                            style={{ padding: '4px 9px', fontSize: 11.5 }}
                            onClick={() => handleMarkSingleRead(ann)}
                            title="Okundu olarak işaretle"
                          >
                            <Check size={13} />
                            <span>Okundu</span>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--sp-ink-2)',
                        paddingLeft: 44,
                      }}
                    >
                      <FormattedPortalText text={ann.content || ann.summary} />

                      {attachments.length > 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginTop: 12,
                          }}
                        >
                          {attachments.map((att) => (
                            <div
                              key={att.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '7px 11px',
                                borderRadius: 10,
                                border: '1px solid var(--sp-border-strong)',
                                background: 'var(--sp-surface)',
                                fontSize: 12.5,
                              }}
                            >
                              {att.is_image ? (
                                <ImageIcon size={15} style={{ color: 'var(--sp-accent)' }} />
                              ) : (
                                <FileText size={15} style={{ color: 'var(--sp-warm)' }} />
                              )}
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: 'var(--sp-ink)',
                                  maxWidth: 240,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={att.name}
                              >
                                {att.name}
                              </span>
                              {att.file_size > 0 ? (
                                <small style={{ color: 'var(--sp-muted)' }}>
                                  ({formatFileSize(att.file_size)})
                                </small>
                              ) : null}
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="sp-chip sp-chip-accent"
                                style={{ textDecoration: 'none', cursor: 'pointer' }}
                              >
                                <ExternalLink size={12} /> Aç
                              </a>
                              <a
                                href={att.url}
                                download={att.name}
                                className="sp-chip"
                                style={{ textDecoration: 'none', cursor: 'pointer' }}
                              >
                                <Download size={12} /> İndir
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
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
