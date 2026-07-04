'use client';

import React, { useMemo, useState } from 'react';
import type { Student, SelectedContent, CartLessonGroup, ContentTaskHistory } from '../types';

interface ReviewStepProps {
  student: Student;
  selectedStudents?: Student[];
  cart: SelectedContent[];
  contentNotes: Record<number, string>;
  title: string;
  notes: string;
  dueDate: string;
  priority: string;
  coachName: string;
  saving: boolean;
  taskHistory?: ContentTaskHistory;
  onTitleChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onDueDateChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
  onRemove: (id: number) => void;
  onSave: (status: 'PUBLISHED' | 'DRAFT') => void;
  onPrint: () => void;
  getPhotoUrl: (path?: string | null) => string | undefined;
}

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: '🟢 Düşük', color: '#16a34a', bg: '#dcfce7' },
  { value: 'MEDIUM', label: '🟡 Orta', color: '#d97706', bg: '#fef3c7' },
  { value: 'HIGH', label: '🟠 Yüksek', color: '#ea580c', bg: '#ffedd5' },
  { value: 'URGENT', label: '🔴 Acil', color: '#dc2626', bg: '#fee2e2' },
];

export default function ReviewStep({
  student, selectedStudents = [], cart, contentNotes, title, notes, dueDate, priority, coachName,
  saving, taskHistory = {}, onTitleChange, onNotesChange, onDueDateChange, onPriorityChange, onRemove,
  onSave, onPrint, getPhotoUrl,
}: ReviewStepProps) {
  /* ─── Cart grouped by lesson ─── */
  const cartGroups: CartLessonGroup[] = useMemo(() => {
    const map = new Map<number, CartLessonGroup>();
    cart.forEach(item => {
      if (!map.has(item.lessonId)) {
        map.set(item.lessonId, {
          lessonId: item.lessonId, lessonName: item.lessonName,
          topics: [], totalQuestions: 0, totalPages: 0,
        });
      }
      const grp = map.get(item.lessonId)!;
      grp.totalQuestions += item.questionCount || 0;
      grp.totalPages += item.pageCount || 0;
      let topicGrp = grp.topics.find(t => t.topicId === item.topicId);
      if (!topicGrp) {
        topicGrp = { topicId: item.topicId, topicName: item.topicName, items: [] };
        grp.topics.push(topicGrp);
      }
      topicGrp.items.push({ content: item, note: contentNotes[item.id] || '' });
    });
    return Array.from(map.values());
  }, [cart, contentNotes]);

  const totalQ = cart.reduce((s, c) => s + (c.questionCount || 0), 0);
  const totalP = cart.reduce((s, c) => s + (c.pageCount || 0), 0);

  const [openLessons, setOpenLessons] = useState<Set<number>>(new Set());

  const toggleLesson = (lessonId: number) => {
    setOpenLessons(prev => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

  const toggleAll = () => {
    if (openLessons.size === cartGroups.length) {
      setOpenLessons(new Set());
    } else {
      setOpenLessons(new Set(cartGroups.map(g => g.lessonId)));
    }
  };

  const getContentIcon = (type: string) => {
    if (type === 'TEST_SET') return '📝';
    if (type === 'PAGE_RANGE') return '📄';
    if (type === 'VIDEO') return '🎬';
    return '📖';
  };

  return (
    <div>
      {/* Step Header */}
      <div className="step-header">
        <div className="step-icon purple">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <h3>Önizleme & Gönder</h3>
          <p>Ödev detaylarını kontrol edin ve gönderin</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* ─── LEFT: Form + Preview ─── */}
        <div>
          {/* Assignment Info Card */}
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            padding: 20,
            marginBottom: 16,
          }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-color)', marginBottom: 16 }}>
              📝 Ödev Bilgileri
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Title */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Ödev Başlığı
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => onTitleChange(e.target.value)}
                  placeholder="Otomatik oluşturuldu..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    fontSize: 14,
                    color: 'var(--text-color)',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Coach */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Koç
                </label>
                <input
                  type="text"
                  value={coachName}
                  disabled
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    fontSize: 13,
                    background: 'var(--body-bg)',
                    color: 'var(--text-muted)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Due Date */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Teslim Tarihi
                </label>
                <input
                  type="date"
                  value={dueDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => onDueDateChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'var(--text-color)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Priority */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Öncelik Seviyesi
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PRIORITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onPriorityChange(opt.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        border: priority === opt.value ? `2px solid ${opt.color}` : '1.5px solid var(--border-color)',
                        borderRadius: 10,
                        background: priority === opt.value ? opt.bg : 'var(--card-bg)',
                        color: priority === opt.value ? opt.color : 'var(--text-muted)',
                        fontSize: 13,
                        fontWeight: priority === opt.value ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontFamily: 'inherit',
                        boxShadow: priority === opt.value ? `0 2px 8px ${opt.color}20` : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Genel Not (opsiyonel)
                </label>
                <textarea
                  value={notes}
                  onChange={e => onNotesChange(e.target.value)}
                  placeholder="Öğrenciye genel not veya talimat..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    fontSize: 13,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    color: 'var(--text-color)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Content Preview grouped by lesson */}
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--body-bg)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-color)' }}>
                📋 Ödev İçerikleri
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {totalQ > 0 && (
                  <span className="badge-modern success" style={{ fontSize: 11 }}>
                    {totalQ} soru
                  </span>
                )}
                {totalP > 0 && (
                  <span className="badge-modern primary" style={{ fontSize: 11 }}>
                    {totalP} sayfa
                  </span>
                )}
                <span className="badge-modern info" style={{ fontSize: 11 }}>
                  {cart.length} içerik
                </span>
                <button
                  onClick={toggleAll}
                  style={{
                    border: '1px solid var(--border-color)',
                    background: 'var(--card-bg)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    marginLeft: 4,
                  }}
                >
                  {openLessons.size === cartGroups.length ? 'Tümünü Kapat' : 'Tümünü Aç'}
                </button>
              </div>
            </div>

            <div style={{ padding: 16 }}>
              {cartGroups.map(lesson => {
                const isOpen = openLessons.has(lesson.lessonId);
                return (
                  <div key={lesson.lessonId} style={{ marginBottom: 8 }}>
                    {/* Accordion header */}
                    <button
                      onClick={() => toggleLesson(lesson.lessonId)}
                      style={{
                        width: '100%',
                        fontSize: 13, fontWeight: 600, color: 'var(--primary)',
                        padding: '10px 12px',
                        background: isOpen ? 'rgba(0,97,166,0.1)' : 'rgba(0,97,166,0.04)',
                        borderRadius: isOpen ? '8px 8px 0 0' : 8,
                        border: '1px solid',
                        borderColor: isOpen ? 'rgba(0,97,166,0.2)' : 'transparent',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-flex', transition: 'transform 0.2s ease',
                          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                          fontSize: 12,
                        }}>▶</span>
                        📚 {lesson.lessonName}
                        <span style={{
                          fontSize: 10, fontWeight: 400, color: 'var(--text-muted)',
                          background: 'var(--card-bg)', padding: '1px 8px',
                          borderRadius: 10,
                        }}>
                          {lesson.topics.reduce((s, t) => s + t.items.length, 0)} içerik
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                        {lesson.totalQuestions > 0 && `${lesson.totalQuestions} soru`}
                        {lesson.totalQuestions > 0 && lesson.totalPages > 0 && ' · '}
                        {lesson.totalPages > 0 && `${lesson.totalPages} sayfa`}
                      </span>
                    </button>

                    {/* Accordion body */}
                    {isOpen && (
                      <div style={{
                        border: '1px solid rgba(0,97,166,0.15)',
                        borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        padding: '8px 4px 4px',
                        background: 'var(--card-bg)',
                      }}>
                        {lesson.topics.map(topic => (
                          <div key={topic.topicId} style={{ paddingLeft: 12, marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-color)', marginBottom: 4, paddingLeft: 4 }}>
                              {topic.topicName}
                            </div>
                            {topic.items.map(({ content: item, note }) => {
                              const hist = taskHistory[item.contentId];
                              const isCompletion = hist && (hist.completion_status === 'PARTIAL' || hist.completion_status === 'NOT_DONE');
                              return (
                              <div key={item.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '6px 8px',
                                borderRadius: 6,
                                marginBottom: 2,
                                background: isCompletion ? 'rgba(37,99,235,0.06)' : 'rgba(0,0,0,0.02)',
                                borderLeft: isCompletion ? '3px solid #3b82f6' : '3px solid transparent',
                              }}>
                                <span style={{ fontSize: 14 }}>{getContentIcon(item.contentType)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: 12, color: 'var(--text-color)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  }}>
                                    {item.contentName}
                                  </div>
                                  {isCompletion && (
                                    <div style={{
                                      fontSize: 10, color: '#2563eb', marginTop: 2,
                                      display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                      🔄 Eksik Tamamlama
                                      {hist.completion_status === 'PARTIAL' && hist.task_completion_percent > 0 && (
                                        <span style={{
                                          background: '#dbeafe', padding: '1px 6px',
                                          borderRadius: 4, fontWeight: 600, fontSize: 9,
                                        }}>
                                          önceki: %{hist.task_completion_percent}
                                        </span>
                                      )}
                                      {hist.assignment_title && (
                                        <span style={{ color: '#60a5fa', fontSize: 9 }}>
                                          ({hist.assignment_title})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {note && (
                                    <div style={{ fontSize: 11, color: 'var(--primary)', fontStyle: 'italic', marginTop: 2 }}>
                                      📌 {note}
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {item.questionCount ? `${item.questionCount}s` : ''}
                                  {item.pageCount ? `${item.questionCount ? '/' : ''}${item.pageCount}p` : ''}
                                </div>
                                <button
                                  onClick={() => onRemove(item.id)}
                                  style={{
                                    border: 'none', background: 'transparent', cursor: 'pointer',
                                    color: 'var(--danger)', fontSize: 13, opacity: 0.5,
                                  }}
                                  title="Kaldır"
                                >✕</button>
                              </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Student Info + Actions ─── */}
        <div>
          {/* Student Card */}
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            padding: 20,
            marginBottom: 16,
            textAlign: 'center',
          }}>
            {selectedStudents.length > 1 ? (
              /* Çoklu öğrenci gösterimi */
              <>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-color)', marginBottom: 8 }}>
                  {selectedStudents.length} Öğrenci Seçili
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
                  {selectedStudents.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--body-bg)', borderRadius: 8, fontSize: 13 }}>
                      {getPhotoUrl(s.profil_foto) ? (
                        <img src={getPhotoUrl(s.profil_foto)!} alt={`${s.ad}`} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0262a7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {`${(s.ad || '').charAt(0)}${(s.soyad || '').charAt(0)}`}
                        </div>
                      )}
                      <span style={{ fontWeight: 500, color: 'var(--text-color)' }}>{s.ad} {s.soyad}</span>
                      {s.sinif_ad && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{s.sinif_ad}</span>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* Tekli öğrenci gösterimi */
              <>
                {getPhotoUrl(student.profil_foto) ? (
                  <img
                    src={getPhotoUrl(student.profil_foto)!}
                    alt={`${student.ad} ${student.soyad}`}
                    style={{
                      width: 72, height: 72, borderRadius: '50%',
                      objectFit: 'cover', border: '3px solid var(--border-color)',
                      margin: '0 auto 12px', display: 'block',
                    }}
                  />
                ) : (
                  <div className="avatar-circle blue" style={{
                    width: 64, height: 64, fontSize: 20, margin: '0 auto 12px',
                  }}>
                    {`${(student.ad || '').charAt(0)}${(student.soyad || '').charAt(0)}`}
                  </div>
                )}
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-color)', marginBottom: 4 }}>
                  {student.ad} {student.soyad}
                </div>
                {student.sinif_ad && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{student.sinif_ad}</div>
                )}
              </>
            )}
          </div>

          {/* Summary Stats */}
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            padding: 16,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)', marginBottom: 12 }}>
              📊 Özet
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ padding: 10, background: 'var(--body-bg)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{cart.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>İçerik</div>
              </div>
              <div style={{ padding: 10, background: 'var(--body-bg)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>{totalQ}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Soru</div>
              </div>
              <div style={{ padding: 10, background: 'var(--body-bg)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>{totalP}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sayfa</div>
              </div>
              <div style={{ padding: 10, background: 'var(--body-bg)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#ea580c' }}>{cartGroups.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ders</div>
              </div>
            </div>

            {/* Ders - Konu Özeti */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
              {(() => {
                const completionCount = cart.filter(c => {
                  const h = taskHistory[c.contentId];
                  return h && (h.completion_status === 'PARTIAL' || h.completion_status === 'NOT_DONE');
                }).length;
                return completionCount > 0 ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', marginBottom: 10,
                    background: 'rgba(37,99,235,0.08)', borderRadius: 8,
                    border: '1px solid rgba(37,99,235,0.15)',
                  }}>
                    <span style={{ fontSize: 14 }}>🔄</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb' }}>
                      {completionCount} içerik eksik tamamlama
                    </span>
                  </div>
                ) : null;
              })()}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                📋 Verilen Ödevler
              </div>
              {cartGroups.map(lesson => {
                return (
                  <div key={lesson.lessonId} style={{ marginBottom: 10 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <span>📚 {lesson.lessonName}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 500, color: 'var(--text-muted)',
                        background: 'var(--body-bg)', padding: '2px 8px', borderRadius: 8,
                      }}>
                        {lesson.totalQuestions > 0 ? `${lesson.totalQuestions} soru` : ''}
                        {lesson.totalQuestions > 0 && lesson.totalPages > 0 ? ' · ' : ''}
                        {lesson.totalPages > 0 ? `${lesson.totalPages} sayfa` : ''}
                      </span>
                    </div>
                    {lesson.topics.map(topic => {
                      const topicQ = topic.items.reduce((s, i) => s + (i.content.questionCount || 0), 0);
                      const topicP = topic.items.reduce((s, i) => s + (i.content.pageCount || 0), 0);
                      return (
                        <div key={topic.topicId} style={{
                          paddingLeft: 10, marginBottom: 3,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-color)' }}>
                            📂 {topic.topicName}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {topicQ > 0 ? `${topicQ}s` : ''}
                            {topicQ > 0 && topicP > 0 ? ' / ' : ''}
                            {topicP > 0 ? `${topicP}p` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => onSave('PUBLISHED')}
              disabled={saving}
              className="btn-modern btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px 20px' }}
            >
              {saving ? (
                <><div className="spinner-small" /> Kaydediliyor...</>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Gönder
                </>
              )}
            </button>

            <button
              onClick={() => onSave('DRAFT')}
              disabled={saving}
              className="btn-modern btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
              </svg>
              Taslak Kaydet
            </button>

            <button
              onClick={onPrint}
              className="btn-modern btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Yazdır / Önizle
            </button>
          </div>
        </div>
      </div>

      {/* Responsive */}
      <style jsx>{`
        @media (max-width: 900px) {
          div > div:nth-child(2) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
