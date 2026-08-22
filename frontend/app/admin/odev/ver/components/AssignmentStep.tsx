'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  StudentResource, BookDetails, Unit, Topic, Content, SelectedContent,
  ResourcesByLesson, CartLessonGroup, ContentTaskHistory, ScopeCompletionMap,
} from '../types';
import { isRoutineQuotaResource } from '../types';
import type { LastQuotaDefault } from '@/lib/resources-api';
import { completionBadgeLabel, isIncompleteHistory } from '@/components/odev/odevCompletionHelpers';
import QuotaAssignCards from './QuotaAssignCards';
import '../odev-ver.css';

type HistoryFilter = 'all' | 'partial' | 'not_done' | 'never';

/** Ödev verilmiş kapsamlarda sade bitirme yüzdesi — yoksa hiçbir şey çizmez */
function ScopePct({
  progress,
  titlePrefix = 'Bitirme',
  wholeBook = false,
}: {
  progress?: { assigned: number; percent: number; total?: number } | null;
  titlePrefix?: string;
  /** Kitap: yüzde tüm içerik sayısına göre */
  wholeBook?: boolean;
}) {
  if (!progress || progress.assigned <= 0) return null;
  const pct = Math.max(0, Math.min(100, progress.percent));
  const color = pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626';
  const detail = wholeBook && progress.total
    ? `${progress.assigned}/${progress.total} içerik ödevlenmiş · kitap geneli`
    : `${progress.assigned} görev`;
  return (
    <span
      title={`${titlePrefix}: %${pct} · ${detail}`}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color,
        letterSpacing: 0.2,
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}
    >
      %{pct}
    </span>
  );
}

interface AssignmentStepProps {
  resources: StudentResource[];
  selectedResource: StudentResource | null;
  bookDetails: BookDetails | null;
  cart: SelectedContent[];
  contentNotes: Record<number, string>;
  resLoading: boolean;
  bookLoading: boolean;
  taskHistory: ContentTaskHistory;
  bookProgress?: ScopeCompletionMap;
  unitProgress?: ScopeCompletionMap;
  /** Kontrolden gelen ders — sol menüde otomatik açılır */
  initialOpenLessonId?: number | null;
  onPickResource: (r: StudentResource) => void;
  onAddQuota: (resource: StudentResource, daily: number) => void;
  lastQuotaDefaults?: Partial<Record<'PARAGRAF' | 'PROBLEM', LastQuotaDefault | null>>;
  onToggleContent: (c: Content, t: Topic, u: Unit) => void;
  onSelectAllUnit: (u: Unit) => void;
  onSelectAllTopic: (t: Topic, u: Unit) => void;
  onSelectIncompleteUnit: (u: Unit) => void;
  onSelectIncompleteTopic: (t: Topic, u: Unit) => void;
  onRemoveContent: (id: number) => void;
  onRemoveContents: (ids: number[]) => void;
  onClearCart: () => void;
  onNoteChange: (id: number, note: string) => void;
  isSelected: (id: number) => boolean;
}

export default function AssignmentStep({
  resources, selectedResource, bookDetails, cart, contentNotes,
  resLoading, bookLoading, taskHistory,
  bookProgress = {}, unitProgress = {},
  initialOpenLessonId = null,
  onPickResource, onAddQuota, lastQuotaDefaults = {},
  onToggleContent, onSelectAllUnit, onSelectAllTopic,
  onSelectIncompleteUnit, onSelectIncompleteTopic,
  onRemoveContent, onRemoveContents, onClearCart, onNoteChange, isSelected,
}: AssignmentStepProps) {
  const [openLessons, setOpenLessons] = useState<Record<number, boolean>>({});
  const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
  const [openUnits, setOpenUnits] = useState<Record<number, boolean>>({});
  const [openTopics, setOpenTopics] = useState<Record<number, boolean>>({});
  const [openCartLessons, setOpenCartLessons] = useState<Record<number, boolean>>({});
  const [openCartTopics, setOpenCartTopics] = useState<Record<string, boolean>>({});
  const [noteExpanded, setNoteExpanded] = useState<Record<number, boolean>>({});
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  useEffect(() => {
    if (initialOpenLessonId == null || initialOpenLessonId <= 0) return;
    setOpenLessons((prev) => ({ ...prev, [initialOpenLessonId]: true }));
  }, [initialOpenLessonId]);

  /* Kitap değişince filtreyi sıfırla */
  useEffect(() => {
    setHistoryFilter('all');
  }, [bookDetails?.id]);

  /* Filtre değişince eşleşen ünite/konuları otomatik aç */
  useEffect(() => {
    if (!bookDetails?.units?.length || historyFilter === 'all') return;
    const nextUnits: Record<number, boolean> = {};
    const nextTopics: Record<number, boolean> = {};
    for (const unit of bookDetails.units) {
      let unitHas = false;
      for (const topic of unit.topics || []) {
        const has = (topic.contents || []).some((c) => {
          const h = taskHistory[c.id] ?? taskHistory[String(c.id) as unknown as number];
          if (historyFilter === 'partial') return h?.completion_status === 'PARTIAL';
          if (historyFilter === 'not_done') return h?.completion_status === 'NOT_DONE';
          return !h || h.completion_status === 'PENDING';
        });
        if (has) {
          unitHas = true;
          nextTopics[topic.id] = true;
        }
      }
      if (unitHas) nextUnits[unit.id] = true;
    }
    setOpenUnits((prev) => ({ ...prev, ...nextUnits }));
    setOpenTopics((prev) => ({ ...prev, ...nextTopics }));
  }, [historyFilter, bookDetails, taskHistory]);

  /* ─── Group resources: Ders → Kaynak Türü → Kitap ─── */
  const groupedResources: ResourcesByLesson[] = useMemo(() => {
    const map = new Map<number, ResourcesByLesson>();
    resources.filter((r) => !isRoutineQuotaResource(r)).forEach(r => {
      if (!map.has(r.lesson)) {
        map.set(r.lesson, { lessonId: r.lesson, lessonName: r.lesson_name, types: [] });
      }
      const lesson = map.get(r.lesson)!;
      const typeName = r.resource_type_display || r.resource_type || 'Diğer';
      let typeGroup = lesson.types.find(t => t.typeName === typeName);
      if (!typeGroup) {
        typeGroup = { typeName, books: [] };
        lesson.types.push(typeGroup);
      }
      typeGroup.books.push({
        bookId: r.resource_book,
        bookName: r.resource_name,
        resource: r,
      });
    });
    return Array.from(map.values());
  }, [resources]);

  const lessonsWithRegularHomework = useMemo(() => {
    const ids = new Set<number>();
    for (const item of cart) {
      if (!item.quotaKind) ids.add(item.lessonId);
    }
    return ids;
  }, [cart]);

  /* ─── Group cart: Ders → Konu → Kaynak ─── */
  const cartGroups: CartLessonGroup[] = useMemo(() => {
    const map = new Map<number, CartLessonGroup>();
    cart.forEach(item => {
      if (!map.has(item.lessonId)) {
        map.set(item.lessonId, {
          lessonId: item.lessonId,
          lessonName: item.lessonName,
          topics: [],
          totalQuestions: 0,
          totalPages: 0,
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

  const totalQuestions = cart.reduce((s, c) => s + (c.questionCount || 0), 0);
  const totalPages = cart.reduce((s, c) => s + (c.pageCount || 0), 0);
  const cartCompletionCount = cart.filter((c) => isIncompleteHistory(taskHistory[c.contentId])).length;

  const countIncomplete = useCallback((contents: Content[] | undefined) => {
    let n = 0;
    for (const c of contents || []) {
      if (isIncompleteHistory(taskHistory[c.id]) && !isSelected(c.id)) n += 1;
    }
    return n;
  }, [taskHistory, cart]);

  const getHistory = useCallback((contentId: number) => {
    return taskHistory[contentId] ?? (taskHistory as Record<string, typeof taskHistory[number]>)[String(contentId)];
  }, [taskHistory]);

  const matchesHistoryFilter = useCallback((contentId: number) => {
    const h = getHistory(contentId);
    if (historyFilter === 'all') return true;
    if (historyFilter === 'partial') return h?.completion_status === 'PARTIAL';
    if (historyFilter === 'not_done') return h?.completion_status === 'NOT_DONE';
    // never (Verilmemiş): geçmiş yok veya sadece PENDING (henüz kontrol edilmemiş atama)
    return !h || h.completion_status === 'PENDING';
  }, [historyFilter, getHistory]);

  const filterMatchCount = useMemo(() => {
    if (!bookDetails?.units || historyFilter === 'all') return null;
    let n = 0;
    for (const unit of bookDetails.units) {
      for (const topic of unit.topics || []) {
        for (const c of topic.contents || []) {
          if (matchesHistoryFilter(c.id)) n += 1;
        }
      }
    }
    return n;
  }, [bookDetails, historyFilter, matchesHistoryFilter]);

  const toggle = (set: React.Dispatch<React.SetStateAction<Record<number, boolean>>>, id: number) =>
    set(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleStr = (set: React.Dispatch<React.SetStateAction<Record<string, boolean>>>, id: string) =>
    set(prev => ({ ...prev, [id]: !prev[id] }));

  const getContentIcon = (type: string) => {
    if (type === 'TEST_SET') return '📝';
    if (type === 'PAGE_RANGE') return '📄';
    if (type === 'VIDEO') return '🎬';
    if (type === 'QUOTA') return '🎯';
    return '📖';
  };

  const quotaMark = (item: SelectedContent) => {
    if (item.quotaKind === 'PROBLEM') {
      return { icon: '🔢', label: 'Problem', color: '#b45309', bg: 'rgba(180,83,9,0.08)', border: '#fbbf24' };
    }
    if (item.quotaKind === 'PARAGRAF') {
      return { icon: '📄', label: 'Paragraf', color: '#0369a1', bg: 'rgba(3,105,161,0.08)', border: '#38bdf8' };
    }
    return null;
  };

  const clearBtnStyle: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
    background: 'rgba(239,68,68,0.08)', fontSize: 10, fontWeight: 600,
    color: 'var(--danger)', cursor: 'pointer', flexShrink: 0,
  };

  const filterChip = (key: HistoryFilter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setHistoryFilter(key)}
      style={{
        padding: '3px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer',
        border: historyFilter === key ? '1px solid #2563eb' : '1px solid var(--border-color)',
        background: historyFilter === key ? 'rgba(37,99,235,0.1)' : 'var(--card-bg)',
        color: historyFilter === key ? '#2563eb' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Step Header */}
      <div className="step-header">
        <div className="step-icon green">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
        <div>
          <h3>Ödev İçeriği Seçimi</h3>
          <p>Paragraf / problem kartlarından veya sol menüden kaynak seçin</p>
        </div>
      </div>

      <QuotaAssignCards
        resources={resources}
        cart={cart}
        lastDefaults={lastQuotaDefaults}
        onAdd={onAddQuota}
        onRemove={onRemoveContent}
      />

      {/* 3-Column Layout */}
      <div className="odev-assign-grid">
        {/* ─── LEFT: Accordion Menu ─── */}
        <div className="odev-assign-panel">
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--body-bg)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)' }}>📚 Kaynaklar</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {resources.length} kaynak
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {resLoading ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div className="spinner" />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Yükleniyor...</div>
              </div>
            ) : groupedResources.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                Kaynak bulunamadı
              </div>
            ) : (
              groupedResources.map(lesson => (
                <div key={lesson.lessonId}>
                  {/* Lesson */}
                  <button
                    onClick={() => toggle(setOpenLessons, lesson.lessonId)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      border: 'none',
                      background: openLessons[lesson.lessonId] ? 'rgba(0,97,166,0.06)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-color)',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{
                      transition: 'transform 0.2s',
                      transform: openLessons[lesson.lessonId] ? 'rotate(90deg)' : 'rotate(0)',
                      fontSize: 10,
                    }}>▶</span>
                    <span style={{ flex: 1 }}>{lesson.lessonName}</span>
                    {lessonsWithRegularHomework.has(lesson.lessonId) && (
                      <span title="Bu dersten ödev seçildi" style={{ color: '#16a34a', fontSize: 14, lineHeight: 1 }}>✓</span>
                    )}
                    <span className="badge-modern primary" style={{ fontSize: 10, padding: '2px 6px' }}>
                      {lesson.types.reduce((s, t) => s + t.books.length, 0)}
                    </span>
                  </button>

                  {openLessons[lesson.lessonId] && lesson.types.map(type => (
                    <div key={`${lesson.lessonId}-${type.typeName}`} style={{ paddingLeft: 16 }}>
                      {/* Type */}
                      <button
                        onClick={() => toggleStr(setOpenTypes, `${lesson.lessonId}-${type.typeName}`)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 12px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--text-muted)',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{
                          transition: 'transform 0.2s',
                          transform: openTypes[`${lesson.lessonId}-${type.typeName}`] ? 'rotate(90deg)' : 'rotate(0)',
                          fontSize: 8,
                        }}>▶</span>
                        {type.typeName}
                      </button>

                      {openTypes[`${lesson.lessonId}-${type.typeName}`] && type.books.map(book => {
                        const active = selectedResource?.id === book.resource.id;
                        const bp = bookProgress[book.bookId];
                        return (
                          <button
                            key={book.bookId}
                            onClick={() => onPickResource(book.resource)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px 8px 28px',
                              border: 'none',
                              background: active ? 'rgba(0,97,166,0.1)' : 'transparent',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: active ? 600 : 400,
                              color: active ? 'var(--primary)' : 'var(--text-color)',
                              textAlign: 'left',
                              borderRadius: 6,
                              margin: '2px 4px',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isRoutineQuotaResource(book.resource) ? '🎯' : '📘'} {book.bookName}
                            </span>
                            <ScopePct progress={bp} titlePrefix="Kitap bitirme" wholeBook />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── CENTER: Content Tree ─── */}
        <div className="odev-assign-panel">
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--body-bg)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)' }}>
                  {bookDetails ? `📖 ${bookDetails.name || bookDetails.ad}` : '📖 Görevler'}
                </div>
                {bookDetails && (
                  <ScopePct progress={bookProgress[bookDetails.id]} titlePrefix="Kitap bitirme" wholeBook />
                )}
              </div>
              {bookDetails && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {bookDetails.total_units || bookDetails.units?.length || 0} ünite · {bookDetails.total_topics || 0} konu
                  {' · '}Eksikleri ünite veya konudan ekleyin
                </div>
              )}
            </div>
            {bookDetails && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {filterChip('all', 'Hepsi')}
                {filterChip('partial', 'Eksik')}
                {filterChip('not_done', 'Yapılmadı')}
                {filterChip('never', 'Verilmemiş')}
                {historyFilter !== 'all' && filterMatchCount != null && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
                    {filterMatchCount} sonuç
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {!selectedResource ? (
              <div className="empty-state" style={{ padding: '48px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
                <h4 style={{ fontSize: 15, marginBottom: 4 }}>Kaynak Seçin</h4>
                <p style={{ fontSize: 13 }}>Sol menüden bir kitap seçerek içerikleri görüntüleyin</p>
              </div>
            ) : bookLoading ? (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <div className="spinner" />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>İçerikler yükleniyor...</div>
              </div>
            ) : !bookDetails || !bookDetails.units?.length ? (
              <div className="empty-state" style={{ padding: '48px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <h4 style={{ fontSize: 15, marginBottom: 4 }}>İçerik bulunamadı</h4>
                <p style={{ fontSize: 13 }}>Bu kaynakta henüz içerik tanımlanmamış</p>
              </div>
            ) : historyFilter !== 'all' && filterMatchCount === 0 ? (
              <div className="empty-state" style={{ padding: '48px 20px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔎</div>
                <h4 style={{ fontSize: 15, marginBottom: 4 }}>Sonuç yok</h4>
                <p style={{ fontSize: 13 }}>
                  Bu filtreye uyan içerik yok. &quot;Hepsi&quot;ne dönün veya başka filtre deneyin.
                </p>
              </div>
            ) : (
              bookDetails.units.map((unit: Unit) => {
                const filteredTopics = (unit.topics || [])
                  .map((topic) => ({
                    topic,
                    contents: (topic.contents || []).filter((c) => matchesHistoryFilter(c.id)),
                  }))
                  .filter((t) => historyFilter === 'all' || t.contents.length > 0);
                if (historyFilter !== 'all' && filteredTopics.length === 0) return null;

                const unitIncomplete = (unit.topics || []).reduce(
                  (s, t) => s + countIncomplete(t.contents),
                  0,
                );
                const up = unitProgress[unit.id];
                return (
                <div key={unit.id} style={{ marginBottom: 4 }}>
                  {/* Unit header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: openUnits[unit.id] ? 'rgba(0,97,166,0.05)' : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <button
                      onClick={() => toggle(setOpenUnits, unit.id)}
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: 10, color: 'var(--text-muted)', padding: 4,
                        transition: 'transform 0.2s',
                        transform: openUnits[unit.id] ? 'rotate(90deg)' : 'rotate(0)',
                      }}
                    >▶</button>
                    <div
                      onClick={() => toggle(setOpenUnits, unit.id)}
                      style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {unit.name || unit.ad}
                        </div>
                        <ScopePct progress={up} titlePrefix="Ünite bitirme" />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {historyFilter === 'all'
                          ? `${unit.topics?.length || 0} konu`
                          : `${filteredTopics.reduce((s, t) => s + t.contents.length, 0)} içerik`}
                        {unitIncomplete > 0 && (
                          <span style={{ color: '#2563eb', fontWeight: 600 }}> · {unitIncomplete} eksik</span>
                        )}
                      </div>
                    </div>
                    {unitIncomplete > 0 && (
                      <button
                        type="button"
                        onClick={() => onSelectIncompleteUnit(unit)}
                        style={{
                          padding: '4px 8px', borderRadius: 6, border: '1px solid #93c5fd',
                          background: '#eff6ff', fontSize: 10, fontWeight: 600,
                          color: '#1d4ed8', cursor: 'pointer',
                        }}
                        title="Bu ünitedeki eksik / yapılmayanlar"
                      >
                        Eksikler ({unitIncomplete})
                      </button>
                    )}
                    {cart.some((c) => c.unitId === unit.id) && (
                      <button
                        type="button"
                        onClick={() => onRemoveContents(cart.filter((c) => c.unitId === unit.id).map((c) => c.id))}
                        style={clearBtnStyle}
                      >
                        Temizle
                      </button>
                    )}
                    <button
                      onClick={() => onSelectAllUnit(unit)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)',
                        background: 'var(--card-bg)', fontSize: 11, fontWeight: 500,
                        color: 'var(--primary)', cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      Tümünü Ekle
                    </button>
                  </div>

                  {openUnits[unit.id] && filteredTopics.map(({ topic, contents }) => {
                    const topicIncomplete = countIncomplete(topic.contents);
                    return (
                    <div key={topic.id} style={{ paddingLeft: 20, marginBottom: 2 }}>
                      {/* Topic header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 6,
                      }}>
                        <button
                          onClick={() => toggle(setOpenTopics, topic.id)}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            fontSize: 9, color: 'var(--text-muted)', padding: 4,
                            transition: 'transform 0.2s',
                            transform: openTopics[topic.id] ? 'rotate(90deg)' : 'rotate(0)',
                          }}
                        >▶</button>
                        <div
                          onClick={() => toggle(setOpenTopics, topic.id)}
                          style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text-color)', cursor: 'pointer' }}
                        >
                          {topic.name || topic.ad}
                          {topicIncomplete > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#2563eb' }}>
                              {topicIncomplete} eksik
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {historyFilter === 'all' ? (topic.contents?.length || 0) : contents.length}
                        </span>
                        {topicIncomplete > 0 && (
                          <button
                            type="button"
                            onClick={() => onSelectIncompleteTopic(topic, unit)}
                            style={{
                              padding: '3px 8px', borderRadius: 4, border: '1px solid #93c5fd',
                              background: '#eff6ff', fontSize: 10, fontWeight: 600,
                              color: '#1d4ed8', cursor: 'pointer',
                            }}
                            title="Bu konudaki eksik / yapılmayanlar"
                          >
                            Eksikler ({topicIncomplete})
                          </button>
                        )}
                        {cart.some((c) => c.topicId === topic.id) && (
                          <button
                            type="button"
                            onClick={() => onRemoveContents(cart.filter((c) => c.topicId === topic.id).map((c) => c.id))}
                            style={clearBtnStyle}
                          >
                            Temizle
                          </button>
                        )}
                        <button
                          onClick={() => onSelectAllTopic(topic, unit)}
                          style={{
                            padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-color)',
                            background: 'transparent', fontSize: 10, color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Tümü
                        </button>
                      </div>

                      {openTopics[topic.id] && contents.map((content: Content) => {
                        const selected = isSelected(content.id);
                        const history = getHistory(content.id);
                        const isDone = history?.completion_status === 'DONE';
                        const isPartial = history?.completion_status === 'PARTIAL';
                        const isNotDone = history?.completion_status === 'NOT_DONE';
                        const hasHistory = !!history && history.completion_status !== 'PENDING';
                        const isLocked = isDone; // %100 tamamlanmışlar seçilemez
                        return (
                          <div key={content.id} style={{ paddingLeft: 16, marginBottom: 2 }}>
                            <div
                              onClick={() => !isLocked && onToggleContent(content, topic, unit)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: isDone
                                  ? '1px solid #86efac'
                                  : isPartial
                                    ? '1px solid #fcd34d'
                                    : isNotDone
                                      ? '1px solid #fca5a5'
                                      : selected
                                        ? '1px solid var(--primary)'
                                        : '1px solid transparent',
                                background: isDone
                                  ? 'rgba(16,185,129,0.06)'
                                  : isPartial
                                    ? 'rgba(245,158,11,0.06)'
                                    : isNotDone
                                      ? 'rgba(220,38,38,0.05)'
                                      : selected
                                        ? 'rgba(0,97,166,0.05)'
                                        : 'transparent',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s',
                                opacity: isLocked ? 0.75 : 1,
                              }}
                            >
                              {isLocked ? (
                                <span style={{ fontSize: 16, width: 16, textAlign: 'center' }}>🔒</span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {}}
                                  style={{ width: 16, height: 16, accentColor: isPartial ? '#d97706' : 'var(--primary)', cursor: isLocked ? 'not-allowed' : 'pointer' }}
                                />
                              )}
                              <span style={{ fontSize: 16 }}>{getContentIcon(content.content_type)}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 12, fontWeight: (selected || hasHistory) ? 600 : 400,
                                  color: isDone ? '#059669' : isPartial ? '#d97706' : selected ? 'var(--primary)' : 'var(--text-color)',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {content.name || content.ad}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 1 }}>
                                  {content.question_count && <span>{content.question_count} soru</span>}
                                  {content.page_count && <span>{content.page_count} sayfa</span>}
                                  {content.difficulty_display && <span>{content.difficulty_display}</span>}
                                </div>
                                {/* History bilgisi */}
                                {hasHistory && (
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
                                    fontSize: 10, fontWeight: 600,
                                    color: isDone ? '#059669' : isPartial ? '#d97706' : isNotDone ? '#dc2626' : '#64748b',
                                  }}>
                                    {isDone && (
                                      <>
                                        <span style={{
                                          padding: '1px 8px', borderRadius: 10,
                                          background: '#dcfce7', color: '#059669',
                                          fontSize: 9, fontWeight: 700,
                                        }}>✅ YAPILDI</span>
                                        <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                                          ({history.assignment_title})
                                        </span>
                                      </>
                                    )}
                                    {isPartial && (
                                      <>
                                        <span style={{
                                          padding: '1px 8px', borderRadius: 10,
                                          background: '#fef3c7', color: '#d97706',
                                          fontSize: 9, fontWeight: 700,
                                        }}>⚠️ EKSİK %{history.task_completion_percent}</span>
                                        {history.question_count > 0 && (
                                          <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                                            ({history.completed_question_count}/{history.question_count} soru)
                                          </span>
                                        )}
                                      </>
                                    )}
                                    {isNotDone && (
                                      <span style={{
                                        padding: '1px 8px', borderRadius: 10,
                                        background: '#fee2e2', color: '#dc2626',
                                        fontSize: 9, fontWeight: 700,
                                      }}>❌ YAPILMADI</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Inline note for selected content */}
                            {selected && !isLocked && (
                              <div style={{ paddingLeft: 36, paddingTop: 4, paddingBottom: 4 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setNoteExpanded(p => ({ ...p, [content.id]: !p[content.id] })); }}
                                  style={{
                                    border: 'none', background: 'transparent', cursor: 'pointer',
                                    fontSize: 11, color: 'var(--primary)', fontWeight: 500,
                                  }}
                                >
                                  {noteExpanded[content.id] ? '✏️ Notu gizle' : '✏️ Not ekle'}
                                </button>
                                {noteExpanded[content.id] && (
                                  <textarea
                                    placeholder="Bu içerik için öğrenciye not..."
                                    value={contentNotes[content.id] || ''}
                                    onChange={e => onNoteChange(content.id, e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                      display: 'block',
                                      width: '100%',
                                      marginTop: 6,
                                      padding: '8px 10px',
                                      border: '1px solid var(--border-color)',
                                      borderRadius: 6,
                                      fontSize: 12,
                                      resize: 'vertical',
                                      minHeight: 48,
                                      fontFamily: 'inherit',
                                      color: 'var(--text-color)',
                                    }}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    );
                  })}
                </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── RIGHT: Cart ─── */}
        <div className="odev-assign-panel">
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--body-bg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)' }}>
                🛒 Sepet
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {cart.length} görev seçildi
                {cartCompletionCount > 0 && (
                  <span style={{ color: '#2563eb', fontWeight: 600 }}> · {cartCompletionCount} tekrar</span>
                )}
              </div>
            </div>
            {cart.length > 0 && (
              <button
                onClick={onClearCart}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)', fontSize: 11, fontWeight: 500,
                  color: 'var(--danger)', cursor: 'pointer',
                }}
              >
                Temizle
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 16px' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                <h4 style={{ fontSize: 14, marginBottom: 4 }}>Sepet Boş</h4>
                <p style={{ fontSize: 12 }}>İçerikleri seçerek sepete ekleyin</p>
              </div>
            ) : (
              cartGroups.map(lesson => (
                <div key={lesson.lessonId} style={{
                  marginBottom: 8,
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden',
                }}>
                  {/* Lesson header */}
                  <div
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      background: 'linear-gradient(135deg, rgba(0,97,166,0.08), rgba(0,97,166,0.03))',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(setOpenCartLessons, lesson.lessonId)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                        border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: 0,
                      }}
                    >
                      <span style={{
                        fontSize: 9,
                        transition: 'transform 0.2s',
                        transform: openCartLessons[lesson.lessonId] ? 'rotate(90deg)' : 'rotate(0)',
                      }}>▶</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                          {lesson.lessonName}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {lesson.totalQuestions > 0 && `${lesson.totalQuestions} soru`}
                          {lesson.totalQuestions > 0 && lesson.totalPages > 0 && ' · '}
                          {lesson.totalPages > 0 && `${lesson.totalPages} sayfa`}
                        </div>
                      </div>
                      <span className="badge-modern primary" style={{ fontSize: 10, padding: '2px 6px' }}>
                        {lesson.topics.reduce((s, t) => s + t.items.length, 0)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveContents(lesson.topics.flatMap((t) => t.items.map((i) => i.content.id)))}
                      style={clearBtnStyle}
                    >
                      Temizle
                    </button>
                  </div>

                  {openCartLessons[lesson.lessonId] && (
                    <div style={{ padding: '4px 8px 8px' }}>
                      {lesson.topics.map(topic => {
                        const topicKey = `${lesson.lessonId}:${topic.topicId}`;
                        const topicOpen = Boolean(openCartTopics[topicKey]);
                        const hasQuota = topic.items.some((i) => i.content.quotaKind);
                        const topicQuestions = topic.items.reduce((s, i) => s + (i.content.questionCount || 0), 0);
                        return (
                        <div key={topic.topicId} style={{ marginBottom: 4 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 4px 4px',
                            borderBottom: '1px solid var(--border-color)',
                          }}>
                            <button
                              type="button"
                              onClick={() => setOpenCartTopics((p) => ({ ...p, [topicKey]: !p[topicKey] }))}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                                border: 'none', background: 'transparent', cursor: 'pointer',
                                textAlign: 'left', padding: 0,
                              }}
                            >
                              <span style={{
                                fontSize: 8, color: 'var(--text-muted)',
                                transform: topicOpen ? 'rotate(90deg)' : 'rotate(0)',
                                transition: 'transform 0.2s',
                              }}>▶</span>
                              <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: hasQuota ? (topic.items[0]?.content.quotaKind === 'PROBLEM' ? '#b45309' : '#0369a1') : 'var(--text-color)',
                              }}>
                                {hasQuota ? quotaMark(topic.items[0].content)?.icon : ''} {topic.topicName}
                              </span>
                              {topicQuestions > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>
                                  {topicQuestions} soru
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveContents(topic.items.map((i) => i.content.id))}
                              style={clearBtnStyle}
                            >
                              Temizle
                            </button>
                          </div>
                          {topicOpen && topic.items.map(({ content: item }) => {
                            const hist = taskHistory[item.contentId];
                            const incomplete = isIncompleteHistory(hist);
                            const mark = quotaMark(item);
                            return (
                            <div
                              key={item.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 4px',
                                borderBottom: '1px solid rgba(0,0,0,0.04)',
                                borderLeft: mark
                                  ? `3px solid ${mark.border}`
                                  : incomplete ? '3px solid #3b82f6' : '3px solid transparent',
                                background: mark ? mark.bg : incomplete ? 'rgba(37,99,235,0.05)' : 'transparent',
                                borderRadius: 4,
                              }}
                            >
                              <span style={{ fontSize: 14 }}>{mark?.icon || getContentIcon(item.contentType)}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 11, color: 'var(--text-color)',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {item.contentName}
                                </div>
                                <div style={{ fontSize: 10, color: mark?.color || 'var(--text-muted)' }}>
                                  {mark ? `${mark.label} · ` : ''}
                                  {item.questionCount ? `${item.questionCount} soru` : ''}
                                  {item.pageCount ? `${item.questionCount ? ' · ' : ''}${item.pageCount} sayfa` : ''}
                                </div>
                                {incomplete && (
                                  <div style={{ fontSize: 9, fontWeight: 700, color: '#2563eb', marginTop: 2 }}>
                                    🔄 {completionBadgeLabel(hist)}
                                    {hist.assignment_title && (
                                      <span style={{ fontWeight: 500, color: '#64748b' }}> · {hist.assignment_title}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => onRemoveContent(item.id)}
                                style={{
                                  border: 'none', background: 'transparent', cursor: 'pointer',
                                  color: 'var(--danger)', fontSize: 14, padding: 2,
                                  opacity: 0.6, transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                                title="Kaldır"
                              >
                                ✕
                              </button>
                            </div>
                            );
                          })}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Cart Summary Footer */}
          {cart.length > 0 && (
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--body-bg)',
              display: 'flex',
              justifyContent: 'space-around',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{cart.length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Görev</div>
              </div>
              {cartCompletionCount > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#2563eb' }}>{cartCompletionCount}</div>
                  <div style={{ fontSize: 10, color: '#2563eb' }}>Tekrar</div>
                </div>
              )}
              {totalQuestions > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{totalQuestions}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Soru</div>
                </div>
              )}
              {totalPages > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#7c3aed' }}>{totalPages}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sayfa</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
