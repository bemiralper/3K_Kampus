'use client';

import { useState } from 'react';
import type { ManualSectionDraft, TemplateSectionLike } from './manual-sections';
import { emptyDraft, rangesFromTree, totalQuestionsFromDrafts } from './manual-sections';
import type { SubjectItem } from './types';
import SubjectPicker, { subjectLabel } from './SubjectPicker';
import t from './section-tree.module.css';

type ManualSectionsEditorProps = {
  drafts: ManualSectionDraft[];
  onChange: (next: ManualSectionDraft[]) => void;
  subjects?: SubjectItem[];
  error?: string;
};

export default function ManualSectionsEditor({ drafts, onChange, subjects = [], error }: ManualSectionsEditorProps) {
  const [mainName, setMainName] = useState('');
  const [mainSubjectId, setMainSubjectId] = useState<number | null>(null);
  const [mainCount, setMainCount] = useState('20');
  const [subDraft, setSubDraft] = useState<Record<number, { name: string; count: string; subject_id: number | null }>>({});
  const ranged = rangesFromTree(drafts);
  const total = totalQuestionsFromDrafts(drafts);

  const addMain = () => {
    const picked = subjects.find(s => s.id === mainSubjectId);
    const name = (picked ? subjectLabel(picked) : mainName).trim();
    const n = Number(mainCount);
    if (!name || !Number.isFinite(n) || n < 1) return;
    if (drafts.some(d => d.name.trim().toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) return;
    onChange([...drafts, emptyDraft(name, n, picked?.id ?? null)]);
    setMainName('');
    setMainSubjectId(null);
  };

  const addSub = (mainIndex: number) => {
    const row = subDraft[mainIndex] || { name: '', count: '5', subject_id: null };
    const picked = subjects.find(s => s.id === row.subject_id);
    const name = (picked ? subjectLabel(picked) : row.name).trim();
    const n = Number(row.count);
    if (!name || !Number.isFinite(n) || n < 1) return;
    const main = drafts[mainIndex];
    if ((main.sub_sections || []).some(d => d.name.trim().toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) {
      return;
    }
    onChange(drafts.map((d, i) => (
      i === mainIndex
        ? { ...d, sub_sections: [...(d.sub_sections || []), emptyDraft(name, n, picked?.id ?? null)] }
        : d
    )));
    setSubDraft(p => ({ ...p, [mainIndex]: { name: '', count: '5', subject_id: null } }));
  };

  return (
    <div className={t.tree}>
      <p className={t.hint}>
        Dersleri müfredattan seçin; kazanım eşlemesi bu bağa göre açılır.
        Üst ders alan olabilir (Fen Bilimleri). Alt ders onun içindeki derstir (Fizik).
      </p>

      {ranged.length > 0 && (
        <>
          <div className={t.meta}>
            <span>Toplam: {total} soru</span>
            <span>{ranged.length} üst ders</span>
          </div>
          {ranged.map((main, i) => {
            const subForm = subDraft[i] || { name: '', count: '5', subject_id: null };
            return (
              <div key={`${main.name}-${i}`} className={t.block}>
                <div className={t.rowMain}>
                  <span className={t.badgeMain}>Üst ders</span>
                  <div className={t.name}>
                    {subjects.length > 0 ? (
                      <SubjectPicker
                        subjects={subjects}
                        value={drafts[i]?.subject_id ?? null}
                        emptyLabel="Alan adı (bağlamadan)"
                        ariaLabel="Üst ders müfredatı"
                        onChange={(id, subject) => onChange(drafts.map((d, j) => (
                          j === i
                            ? { ...d, subject_id: id, name: subject ? subjectLabel(subject) : d.name }
                            : d
                        )))}
                      />
                    ) : null}
                    <input
                      className={t.nameInput}
                      value={drafts[i]?.name ?? main.name}
                      onChange={e => onChange(drafts.map((d, j) => (j === i ? { ...d, name: e.target.value, subject_id: d.subject_id } : d)))}
                      aria-label="Üst ders adı"
                    />
                  </div>
                  <span className={t.range}>{main.question_start}–{main.question_end}</span>
                  {main.sub_sections.length === 0 ? (
                    <input
                      type="number"
                      min={1}
                      className={t.countInput}
                      value={drafts[i]?.question_count ?? main.question_count}
                      onChange={e => {
                        const next = Number(e.target.value);
                        onChange(drafts.map((d, j) => (
                          j === i ? { ...d, question_count: Number.isFinite(next) && next > 0 ? next : 1 } : d
                        )));
                      }}
                      aria-label={`${main.name} soru sayısı`}
                    />
                  ) : (
                    <span className={t.countLabel}>{main.question_count}</span>
                  )}
                  <button type="button" className={t.iconBtn} onClick={() => onChange(drafts.filter((_, j) => j !== i))} aria-label="Üst dersi kaldır">✕</button>
                </div>
                {main.sub_sections.map((sub, j) => (
                  <div key={`${sub.name}-${j}`} className={t.rowSub}>
                    <span className={t.badgeSub}>Alt ders</span>
                    <div className={t.name}>
                      {subjects.length > 0 ? (
                        <SubjectPicker
                          subjects={subjects}
                          value={drafts[i]?.sub_sections?.[j]?.subject_id ?? null}
                          emptyLabel="Müfredattan seç…"
                          ariaLabel="Alt ders müfredatı"
                          onChange={(id, subject) => onChange(drafts.map((d, di) => (
                            di === i
                              ? {
                                ...d,
                                sub_sections: (d.sub_sections || []).map((srow, sj) => (
                                  sj === j
                                    ? { ...srow, subject_id: id, name: subject ? subjectLabel(subject) : srow.name }
                                    : srow
                                )),
                              }
                              : d
                          )))}
                        />
                      ) : (
                        <input
                          className={t.nameInput}
                          value={drafts[i]?.sub_sections?.[j]?.name ?? sub.name}
                          onChange={e => onChange(drafts.map((d, di) => (
                            di === i
                              ? {
                                ...d,
                                sub_sections: (d.sub_sections || []).map((srow, sj) => (
                                  sj === j ? { ...srow, name: e.target.value } : srow
                                )),
                              }
                              : d
                          )))}
                          aria-label="Alt ders adı"
                        />
                      )}
                    </div>
                    <span className={t.range}>{sub.question_start}–{sub.question_end}</span>
                    <input
                      type="number"
                      min={1}
                      className={t.countInput}
                      value={drafts[i]?.sub_sections?.[j]?.question_count ?? sub.question_count}
                      onChange={e => {
                        const next = Number(e.target.value);
                        onChange(drafts.map((d, di) => (
                          di === i
                            ? {
                              ...d,
                              sub_sections: (d.sub_sections || []).map((srow, sj) => (
                                sj === j
                                  ? { ...srow, question_count: Number.isFinite(next) && next > 0 ? next : 1 }
                                  : srow
                              )),
                            }
                            : d
                        )));
                      }}
                      aria-label={`${sub.name} soru sayısı`}
                    />
                    <button
                      type="button"
                      className={t.iconBtn}
                      onClick={() => onChange(drafts.map((d, di) => (
                        di === i
                          ? { ...d, sub_sections: (d.sub_sections || []).filter((_, sj) => sj !== j) }
                          : d
                      )))}
                      aria-label="Alt dersi kaldır"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className={t.rowForm}>
                  <div className={t.fieldGrow}>
                    <label>Alt ders ekle</label>
                    {subjects.length > 0 ? (
                      <SubjectPicker
                        subjects={subjects}
                        value={subForm.subject_id}
                        emptyLabel="Müfredattan seç…"
                        ariaLabel="Eklenecek alt ders"
                        onChange={(id, subject) => setSubDraft(p => ({
                          ...p,
                          [i]: { ...subForm, subject_id: id, name: subject ? subjectLabel(subject) : '' },
                        }))}
                      />
                    ) : (
                      <input
                        value={subForm.name}
                        placeholder="Fizik, Tarih…"
                        onChange={e => setSubDraft(p => ({ ...p, [i]: { ...subForm, name: e.target.value } }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub(i); } }}
                      />
                    )}
                  </div>
                  <div className={t.fieldSm}>
                    <label>Soru</label>
                    <input
                      type="number"
                      min={1}
                      value={subForm.count}
                      onChange={e => setSubDraft(p => ({ ...p, [i]: { ...subForm, count: e.target.value } }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub(i); } }}
                    />
                  </div>
                  <button type="button" className="btn-modern btn-secondary" onClick={() => addSub(i)} style={{ padding: '8px 12px', fontSize: 12 }}>
                    + Alt ders
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className={t.addBar}>
        <div className={t.fieldGrow}>
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
              className={t.nameInput}
              style={{ marginTop: 6 }}
              value={mainName}
              onChange={e => setMainName(e.target.value)}
              placeholder="Alan adı: Fen Bilimleri…"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMain(); } }}
            />
          )}
        </div>
        <div className={t.fieldSm}>
          <label>Soru</label>
          <input
            type="number"
            min={1}
            value={mainCount}
            onChange={e => setMainCount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMain(); } }}
          />
        </div>
        <button type="button" className="btn-modern btn-primary" onClick={addMain} style={{ padding: '8px 14px', fontSize: 13 }}>
          + Üst ders
        </button>
      </div>
      {error && <span className={t.error}>{error}</span>}
    </div>
  );
}

export function TemplatePreview({
  sections,
  subSections,
}: {
  sections: TemplateSectionLike[];
  subSections?: Record<string, TemplateSectionLike[]>;
}) {
  const total = sections.reduce((sum, sec) => sum + (sec.question_end - sec.question_start + 1), 0);
  return (
    <div className={t.tree}>
      <div className={t.meta}>
        <span>Toplam: {total} soru</span>
        <span>{sections.length} üst ders</span>
      </div>
      {sections.map(sec => {
        const subs = subSections?.[sec.name] || [];
        return (
          <div key={sec.name} className={t.block}>
            <div className={t.rowMain}>
              <span className={t.badgeMain}>Üst ders</span>
              <div className={t.name}><span className={t.nameText}>{sec.name}</span></div>
              <span className={t.range}>{sec.question_start}–{sec.question_end}</span>
              <span className={t.countLabel}>{sec.question_end - sec.question_start + 1}</span>
              <span />
            </div>
            {subs.map(sub => (
              <div key={sub.name} className={t.rowSub}>
                <span className={t.badgeSub}>Alt ders</span>
                <div className={t.name}><span className={t.nameText}>{sub.name}</span></div>
                <span className={t.range}>{sub.question_start}–{sub.question_end}</span>
                <span className={t.countLabel}>{sub.question_end - sub.question_start + 1}</span>
                <span />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
