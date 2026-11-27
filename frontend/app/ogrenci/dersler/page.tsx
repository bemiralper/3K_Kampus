'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Download,
  FileText,
  Layers,
  Library,
  PanelRightOpen,
} from 'lucide-react';
import {
  studentPortalApi,
  type CourseNoteItem,
  type CoursesAndNotesResponse,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

function StudentCoursesAndResourcesInner() {
  const searchParams = useSearchParams();
  const { openSplitNote } = useStudentPortal();
  const [data, setData] = useState<CoursesAndNotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [tab, setTab] = useState<'notlar' | 'konular' | 'kaynaklar'>('notlar');

  useEffect(() => {
    const reqTab = searchParams.get('tab');
    if (reqTab === 'konular' || reqTab === 'kaynaklar' || reqTab === 'notlar') {
      setTab(reqTab);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    studentPortalApi
      .courses()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const autoNoteId = Number(searchParams.get('note') || 0);
        if (autoNoteId) {
          const found = res.notes.find((n) => n.id === autoNoteId);
          if (found) openSplitNote(found);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openSplitNote, searchParams]);

  const filteredNotes: CourseNoteItem[] = useMemo(() => {
    if (!data) return [];
    if (!selectedCourseId) return data.notes;
    return data.notes.filter((n) => n.course_id === selectedCourseId);
  }, [data, selectedCourseId]);

  const filteredTopics = useMemo(() => {
    if (!data) return [];
    if (!selectedCourseId) return data.topics;
    return data.topics.filter((t) => t.course_id === selectedCourseId);
  }, [data, selectedCourseId]);

  return (
    <>
      <div className="sp-card">
        <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="sp-eyebrow">
              {data?.classroom ? `Sınıf: ${data.classroom.name}` : 'Akademik Arşiv'}
            </span>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>
              Ders Notları, İşlenen Konular & Kaynaklarım
            </h1>
          </div>

          <div className="sp-pill-bar">
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'notlar' ? '1' : '0'}
              onClick={() => setTab('notlar')}
            >
              Ders Notları ({data?.notes.length ?? 0})
            </button>
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'konular' ? '1' : '0'}
              onClick={() => setTab('konular')}
            >
              İşlenen Konular ({data?.topics.length ?? 0})
            </button>
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'kaynaklar' ? '1' : '0'}
              onClick={() => setTab('kaynaklar')}
            >
              Kaynak Kitaplarım ({data?.resources.length ?? 0})
            </button>
          </div>
        </div>

        {/* Ders Filtre Çipleri */}
        {data && data.courses.length > 0 && tab !== 'kaynaklar' ? (
          <div className="sp-pill-bar">
            <button
              type="button"
              className="sp-pill"
              data-active={selectedCourseId === null ? '1' : '0'}
              onClick={() => setSelectedCourseId(null)}
            >
              Tüm Dersler
            </button>
            {data.courses.map((course) => (
              <button
                key={course.id}
                type="button"
                className="sp-pill"
                data-active={selectedCourseId === course.id ? '1' : '0'}
                onClick={() => setSelectedCourseId(course.id)}
              >
                <span
                  className="sp-dot"
                  style={{
                    backgroundColor: course.color,
                    marginRight: 6,
                    verticalAlign: -1,
                  }}
                />
                {course.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="sp-skeleton" style={{ height: 300 }} />
      ) : tab === 'notlar' ? (
        <section className="sp-card">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Split-View PDF & Görsel Okuyucu</span>
              <h2>Öğretmenlerinin Paylaştığı Ders Notları</h2>
            </div>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="sp-empty-box">
              <FileText size={30} />
              <p>Seçili ders için henüz paylaşılmış ders notu bulunmuyor.</p>
            </div>
          ) : (
            <div className="sp-stack">
              {filteredNotes.map((note) => (
                <div key={note.id} className="sp-row-card">
                  <div className="sp-row-left">
                    <span
                      className="sp-dot"
                      style={{ backgroundColor: note.color }}
                    />
                    <div className="sp-row-copy">
                      <strong>{note.title}</strong>
                      <span>
                        {note.course_name} · {note.teacher_name} ·{' '}
                        {note.created_at.slice(0, 10)}
                      </span>
                      {note.description ? (
                        <span style={{ marginTop: 2 }}>{note.description}</span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="sp-btn sp-btn-primary sp-btn-sm"
                      onClick={() => openSplitNote(note)}
                    >
                      <PanelRightOpen size={14} />
                      <span>Önizle / Yan Panel</span>
                    </button>
                    <a
                      href={studentPortalApi.noteOpenUrl(note.id, true)}
                      className="sp-icon-btn"
                      title="İndir"
                    >
                      <Download size={15} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : tab === 'konular' ? (
        <section className="sp-card">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Ders İçi Müfredat Takibi</span>
              <h2>Sınıfta İşlenen Konular & Kazanımlar</h2>
            </div>
          </div>

          {filteredTopics.length === 0 ? (
            <div className="sp-empty-box">
              <Layers size={30} />
              <p>Henüz kaydedilmiş işlenen konu satırı bulunmuyor.</p>
            </div>
          ) : (
            <div className="sp-stack">
              {filteredTopics.map((topic) => (
                <div key={topic.id} className="sp-row-card" style={{ alignItems: 'flex-start' }}>
                  <div className="sp-row-left" style={{ alignItems: 'flex-start' }}>
                    <div className="sp-time-pill">{topic.date.slice(5)}</div>
                    <span
                      className="sp-dot"
                      style={{ backgroundColor: topic.color, marginTop: 5 }}
                    />
                    <div className="sp-row-copy">
                      <strong>
                        {topic.course_name} — {topic.topic}
                      </strong>
                      <span>
                        {topic.unit ? `${topic.unit} · ` : ''}
                        {topic.teacher_name}
                        {topic.period_no ? ` · ${topic.period_no}. Ders` : ''}
                      </span>
                      {topic.note ? (
                        <span style={{ marginTop: 4, color: 'var(--sp-ink-2)' }}>
                          Not: {topic.note}
                        </span>
                      ) : null}
                      {topic.outcomes.length > 0 ? (
                        <div className="sp-pill-bar" style={{ marginTop: 6 }}>
                          {topic.outcomes.map((oc, idx) => (
                            <span key={`${topic.id}-${idx}`} className="sp-chip">
                              {oc.code ? `${oc.code}: ` : ''}
                              {oc.description}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="sp-card">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Soru Bankaları & Fasiküller</span>
              <h2>Bana Atanan Kaynak Kitaplar</h2>
            </div>
          </div>

          {!data || data.resources.length === 0 ? (
            <div className="sp-empty-box">
              <Library size={30} />
              <p>Henüz koçun tarafından atanmış kaynak kitap kaydı görünmüyor.</p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: 12,
              }}
            >
              {data.resources.map((book) => (
                <div key={book.id} className="sp-row-card">
                  <div className="sp-row-left">
                    <BookOpen size={20} color={book.color} />
                    <div className="sp-row-copy">
                      <strong>{book.name}</strong>
                      <span>
                        {book.subject}
                        {book.publisher ? ` · ${book.publisher}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default function StudentCoursesAndResourcesPage() {
  return (
    <Suspense fallback={<div className="sp-skeleton" style={{ height: 300 }} />}>
      <StudentCoursesAndResourcesInner />
    </Suspense>
  );
}
