'use client';

import { useEffect, useState } from 'react';
import { curriculumApi, examApi } from './api';
import type { ExamDetail, ExamSection, SubjectItem } from './types';
import { BAND_LGS, BAND_YKS, bandIsLocked, bandLabel, resolveBand } from './curriculum-band';
import SubjectPicker, { subjectLabel } from './SubjectPicker';
import t from './section-tree.module.css';
import s from '../../app/admin/olcme-degerlendirme/olcme.module.css';

function errText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function nextMainRange(exam: ExamDetail, count: number) {
  const mains = (exam.sections || []).filter(sec => !sec.is_sub_section);
  const lastEnd = mains.reduce((maxEnd, sec) => Math.max(maxEnd, sec.question_end || 0), 0);
  const start = lastEnd + 1;
  const n = Math.max(1, count);
  return { question_start: start, question_end: start + n - 1 };
}

export default function ExamSectionsEditor({
  exam,
  onExamUpdate,
}: {
  exam: ExamDetail;
  onExamUpdate: (e: ExamDetail) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ question_start: 0, question_end: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mainName, setMainName] = useState('');
  const [mainSubjectId, setMainSubjectId] = useState<number | null>(null);
  const [mainCount, setMainCount] = useState('20');
  const [subDraft, setSubDraft] = useState<Record<number, { name: string; count: string; subject_id: number | null }>>({});
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [adding, setAdding] = useState(false);
  const locked = exam.is_locked;
  const band = resolveBand(exam.exam_type, exam.curriculum_band);

  useEffect(() => {
    curriculumApi.listSubjects(undefined, band)
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [band, exam.id]);

  const mains = (exam.sections || [])
    .filter(sec => !sec.is_sub_section)
    .slice()
    .sort((a, b) => a.order - b.order);
  const subsOf = (main: ExamSection) =>
    (exam.sections || [])
      .filter(sec => sec.is_sub_section && sec.parent_section === main.id)
      .slice()
      .sort((a, b) => a.order - b.order);

  const apply = (updated: ExamDetail) => {
    onExamUpdate(updated);
  };

  const saveRange = async (sectionId: number) => {
    if (editForm.question_end < editForm.question_start) {
      setError('Bitiş sorusu, başlangıç sorusundan küçük olamaz.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      apply(await examApi.updateSection(exam.id, sectionId, {
        question_start: editForm.question_start,
        question_end: editForm.question_end,
      }));
      setEditingId(null);
    } catch (err) {
      setError(errText(err, 'Bölüm güncellenemedi.'));
    } finally {
      setSaving(false);
    }
  };

  const addMain = async () => {
    const picked = subjects.find(row => row.id === mainSubjectId);
    const name = (picked ? subjectLabel(picked) : mainName).trim();
    const count = Number(mainCount);
    if (!name) {
      setError('Üst ders adı zorunludur.');
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      setError('Soru sayısı 1 veya daha büyük olmalıdır.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      apply(await examApi.addSection(exam.id, {
        name, ...nextMainRange(exam, count), subject: picked?.id ?? null,
      }));
      setMainName('');
      setMainSubjectId(null);
    } catch (err) {
      setError(errText(err, 'Üst ders eklenemedi.'));
    } finally {
      setAdding(false);
    }
  };

  const addSub = async (parent: ExamSection) => {
    const row = subDraft[parent.id] || { name: '', count: '5', subject_id: null };
    const picked = subjects.find(item => item.id === row.subject_id);
    const name = (picked ? subjectLabel(picked) : row.name).trim();
    const count = Number(row.count);
    if (!name) {
      setError('Alt ders adı zorunludur.');
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      setError('Soru sayısı 1 veya daha büyük olmalıdır.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      apply(await examApi.addSection(exam.id, {
        name,
        question_count: count,
        parent_section: parent.id,
        subject: picked?.id ?? null,
      }));
      setSubDraft(p => ({ ...p, [parent.id]: { name: '', count: '5', subject_id: null } }));
    } catch (err) {
      setError(errText(err, 'Alt ders eklenemedi.'));
    } finally {
      setAdding(false);
    }
  };

  const removeSec = async (sec: ExamSection) => {
    const label = sec.is_sub_section ? 'alt ders' : 'üst ders';
    if (!confirm(`"${sec.name}" ${label} kaldırılsın mı?`)) return;
    setError('');
    try {
      apply(await examApi.removeSection(exam.id, sec.id));
      if (editingId === sec.id) setEditingId(null);
    } catch (err) {
      setError(errText(err, 'Bölüm kaldırılamadı.'));
    }
  };

  const qCount = (sec: ExamSection) =>
    editingId === sec.id
      ? Math.max(0, editForm.question_end - editForm.question_start + 1)
      : sec.question_end - sec.question_start + 1;

  const rangeCell = (sec: ExamSection) => (
    editingId === sec.id ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={1}
          className={t.countInput}
          value={editForm.question_start}
          onChange={e => setEditForm(f => ({ ...f, question_start: Number(e.target.value) }))}
        />
        <span style={{ color: '#94a3b8' }}>–</span>
        <input
          type="number"
          min={1}
          className={t.countInput}
          value={editForm.question_end}
          onChange={e => setEditForm(f => ({ ...f, question_end: Number(e.target.value) }))}
        />
      </div>
    ) : (
      <span className={t.range}>{sec.question_start}–{sec.question_end} ({qCount(sec)})</span>
    )
  );

  const rowActions = (sec: ExamSection) => {
    if (locked) return null;
    if (editingId === sec.id) {
      return (
        <div className={t.actions}>
          <button className="btn-modern" onClick={() => saveRange(sec.id)} disabled={saving}
            style={{ padding: '2px 8px', fontSize: 11, color: '#16a34a', border: '1px solid #bbf7d0' }}>✓</button>
          <button className="btn-modern" onClick={() => setEditingId(null)}
            style={{ padding: '2px 8px', fontSize: 11, color: '#ef4444', border: '1px solid #fecaca' }}>✕</button>
        </div>
      );
    }
    return (
      <div className={t.actions}>
        <button
          className="btn-modern"
          onClick={() => {
            setEditingId(sec.id);
            setError('');
            setEditForm({ question_start: sec.question_start, question_end: sec.question_end });
          }}
          style={{ padding: '2px 8px', fontSize: 11, color: '#64748b' }}
          title="Soru aralığını düzenle"
        >
          ✏️
        </button>
        <button
          className="btn-modern"
          onClick={() => removeSec(sec)}
          style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger)' }}
          title="Kaldır"
        >
          ✕
        </button>
      </div>
    );
  };

  const preview = nextMainRange(exam, Number(mainCount) || 1);
  const total = mains.reduce((sum, m) => sum + (m.question_end - m.question_start + 1), 0);

  return (
    <div className="card-modern" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="card-modern-header" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
          Bölümler ({mains.length} üst ders)
        </h3>
      </div>
      {error && (
        <div style={{ padding: '10px 22px', background: '#fef2f2', color: '#991b1b', fontSize: 12.5 }}>
          {error}
        </div>
      )}
      <div style={{ padding: '16px 22px 20px' }} className={t.tree}>
        <div className={t.bandRow}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 650 }}>Müfredat</span>
          {bandIsLocked(exam.exam_type) || locked ? (
            <span className={t.bandBtnOn}>{bandLabel(band)}</span>
          ) : (
            <>
              <button type="button" className={band === BAND_YKS ? t.bandBtnOn : t.bandBtn}
                onClick={() => examApi.update(exam.id, { curriculum_band: BAND_YKS } as Partial<ExamDetail>).then(apply).catch(err => setError(errText(err, 'Müfredat düzeyi kaydedilemedi.')))}>
                {bandLabel(BAND_YKS)}
              </button>
              <button type="button" className={band === BAND_LGS ? t.bandBtnOn : t.bandBtn}
                onClick={() => examApi.update(exam.id, { curriculum_band: BAND_LGS } as Partial<ExamDetail>).then(apply).catch(err => setError(errText(err, 'Müfredat düzeyi kaydedilemedi.')))}>
                {bandLabel(BAND_LGS)}
              </button>
            </>
          )}
        </div>
        {mains.length === 0 ? (
          <p className={t.hint}>
            TYT/AYT formatında önce <b>üst ders</b> ekleyin, sonra satırındaki <b>+ Alt ders</b> ile
            alt dersleri yazın. Örnek: Fen Bilimleri → Fizik, Kimya, Biyoloji.
          </p>
        ) : (
          <>
            <div className={t.meta}>
              <span>Toplam: {total} soru</span>
              <span>{mains.length} üst ders</span>
            </div>
            {mains.map(main => {
              const subs = subsOf(main);
              const subForm = subDraft[main.id] || { name: '', count: '5', subject_id: null };
              return (
                <div key={main.id} className={t.block}>
                  <div className={t.main}>
                    <div className={t.name}>
                      <span className={t.badgeMain}>Üst ders</span>
                      <span>{main.name}</span>
                      {!locked && subjects.length > 0 && (
                        <SubjectPicker
                          subjects={subjects}
                          value={main.subject}
                          emptyLabel="Müfredat bağla…"
                          ariaLabel={`${main.name} müfredatı`}
                          onChange={async (id) => {
                            try {
                              apply(await examApi.updateSection(exam.id, main.id, { subject: id }));
                            } catch (err) {
                              setError(errText(err, 'Müfredat bağlanamadı.'));
                            }
                          }}
                        />
                      )}
                    </div>
                    {rangeCell(main)}
                    {rowActions(main)}
                  </div>
                  {subs.map(sub => (
                    <div key={sub.id} className={t.sub}>
                      <div className={t.name}>
                        <span className={t.mark}>↳</span>
                        <span className={t.badgeSub}>Alt ders</span>
                        <span>{sub.name}</span>
                        {!locked && subjects.length > 0 && (
                          <SubjectPicker
                            subjects={subjects}
                            value={sub.subject}
                            emptyLabel="Müfredat bağla…"
                            ariaLabel={`${sub.name} müfredatı`}
                            onChange={async (id) => {
                              try {
                                apply(await examApi.updateSection(exam.id, sub.id, { subject: id }));
                              } catch (err) {
                                setError(errText(err, 'Müfredat bağlanamadı.'));
                              }
                            }}
                          />
                        )}
                      </div>
                      {rangeCell(sub)}
                      {rowActions(sub)}
                    </div>
                  ))}
                  {!locked && (
                    <div className={t.sub}>
                      <div className={t.addRow} style={{ width: '100%' }}>
                        <div className={s.formGroup} style={{ flex: '1 1 140px', minWidth: 120, margin: 0 }}>
                          <label>Alt ders</label>
                          {subjects.length > 0 ? (
                            <SubjectPicker
                              subjects={subjects}
                              value={subForm.subject_id}
                              emptyLabel="Müfredattan seç…"
                              ariaLabel="Eklenecek alt ders"
                              onChange={(id, subject) => setSubDraft(p => ({
                                ...p,
                                [main.id]: { ...subForm, subject_id: id, name: subject ? subjectLabel(subject) : '' },
                              }))}
                            />
                          ) : (
                            <input
                              value={subForm.name}
                              placeholder="Fizik, Tarih…"
                              onChange={e => setSubDraft(p => ({ ...p, [main.id]: { ...subForm, name: e.target.value } }))}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub(main); } }}
                            />
                          )}
                        </div>
                        <div className={s.formGroup} style={{ width: 80, margin: 0 }}>
                          <label>Soru</label>
                          <input
                            type="number"
                            min={1}
                            value={subForm.count}
                            onChange={e => setSubDraft(p => ({ ...p, [main.id]: { ...subForm, count: e.target.value } }))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub(main); } }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-modern btn-secondary"
                          onClick={() => addSub(main)}
                          disabled={adding}
                          style={{ padding: '7px 10px', fontSize: 12 }}
                        >
                          + Alt ders
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {!locked && (
          <div className={t.addRow}>
            <div className={s.formGroup} style={{ flex: '1 1 180px', minWidth: 150, margin: 0 }}>
              <label>Üst ders</label>
              {subjects.length > 0 ? (
                <SubjectPicker
                  subjects={subjects}
                  value={mainSubjectId}
                  emptyLabel="Müfredattan seç veya alan adı yaz…"
                  ariaLabel="Eklenecek üst ders"
                  onChange={(id, subject) => {
                    setMainSubjectId(id);
                    if (subject) setMainName(subjectLabel(subject));
                  }}
                />
              ) : (
                <input
                  value={mainName}
                  onChange={e => setMainName(e.target.value)}
                  placeholder="Fen Bilimleri, Türkçe…"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMain(); } }}
                />
              )}
              {subjects.length > 0 && !mainSubjectId && (
                <input
                  value={mainName}
                  onChange={e => setMainName(e.target.value)}
                  placeholder="Alan adı: Fen Bilimleri…"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMain(); } }}
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
            <div className={s.formGroup} style={{ width: 110, margin: 0 }}>
              <label>Soru sayısı</label>
              <input
                type="number"
                min={1}
                value={mainCount}
                onChange={e => setMainCount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMain(); } }}
              />
            </div>
            <button
              className="btn-modern btn-primary"
              onClick={addMain}
              disabled={adding}
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              {adding ? 'Ekleniyor…' : '+ Üst ders'}
            </button>
            <span className={t.range}>Soru {preview.question_start}–{preview.question_end}</span>
          </div>
        )}
      </div>
    </div>
  );
}
