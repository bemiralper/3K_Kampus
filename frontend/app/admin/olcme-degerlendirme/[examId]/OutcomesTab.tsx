'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { examApi, answerKeyApi, curriculumApi } from '../../../../components/olcme/api';
import type {
  ExamDetail,
  ExamSection,
  AnswerKey,
  SubjectItem,
  TopicItem,
  OutcomeItem,
} from '../../../../components/olcme/types';
import { curriculumProgramForExam, topicDisplayName } from '../../../../components/olcme/curriculum-band';
import { pickPrimaryAnswerKey } from '../../../../components/olcme/answer-key';
import {
  dottedParts,
  filterTopicsByQuery,
  topicNameBelongsElsewhere,
} from '../../../../components/olcme/outcome-search';
import {
  leafExamSections,
  leafSectionForQuestion,
  optionalSectionIds,
} from '../../../../components/olcme/section-ranges';
import k from './outcomes.module.css';

/**
 * Satır durumu:
 *  linked    — kazanıma bağlı (kayıtlı)
 *  topic     — konu başlığı kodu (21.5) bilerek konuya bağlı (kayıtlı)
 *  suggested — girilen kod müfredatta bulundu ama henüz kaydedilmedi
 *  missed    — girilen kod/metin müfredatta yok
 *  none      — hiçbir şey girilmemiş
 */
type RowState = 'linked' | 'topic' | 'suggested' | 'missed' | 'none';
type Filter = 'all' | 'missing' | 'suggested';

interface OutcomeRow {
  item_id: number;
  question_number: number;
  correct_answer: string;
  is_cancelled: boolean;
  section_id: number;
  imported: string;
  outcome_id: number | null;
  sub_outcome_id: number | null;
  outcome_code: string;
  outcome_text: string;
  topic_name: string;
  state: RowState;
}

interface SectionInfo {
  section: ExamSection;
  subject: SubjectItem | null;
  topics: TopicItem[];
}

const DONE: RowState[] = ['linked', 'topic'];

function isDumpTopic(topic: TopicItem): boolean {
  return (topic.name || '').trim() === 'Toplu Yükleme' || (topic.code || '').trim().toUpperCase() === 'TOPLU';
}

/** '9. sınıf · Nicelikler ve Değişimler' → 'Nicelikler ve Değişimler' */
function withoutGrade(name: string): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s*·\s*/).map(part => part.trim()).filter(Boolean);
  const kept = parts.filter(part => !/^\d+\.\s*s[ıi]n[ıi]f$/i.test(part) && !/^maarif$/i.test(part));
  return (kept.join(' · ') || raw).trim();
}

function findTopicForOutcome(topics: TopicItem[], outcomeId: number): string {
  for (const t of topics) {
    if (isDumpTopic(t)) continue;
    if ((t.outcomes ?? []).some(o => o.id === outcomeId)) return withoutGrade(t.name);
  }
  return '';
}

function topicsForHomeSubject(home: SubjectItem | null, allSubjects: SubjectItem[], program = ''): TopicItem[] {
  return (home?.topics ?? []).filter(t =>
    !isDumpTopic(t)
    && (!program || !t.program || t.program === program)
    && !topicNameBelongsElsewhere(t, home, allSubjects),
  );
}

/** 11. sınıf matematiği tek blok; geometri kazanımları resmi AYT'deki Geometri dersinden gelir. */
function topicsForSection(examType: string, sectionName: string, home: SubjectItem | null, tree: SubjectItem[]): TopicItem[] {
  const program = curriculumProgramForExam(examType);
  const topics = topicsForHomeSubject(home, tree, program);
  if (examType !== 'AYT_11' || sectionName !== 'Matematik') return topics;
  const extra = tree.find(subject => (subject.code || '').toUpperCase() === 'GEOMETRI');
  if (!extra || extra.id === home?.id) return topics;
  const seen = new Set(topics.map(topic => topic.id));
  for (const topic of topicsForHomeSubject(extra, tree, program)) {
    if (!seen.has(topic.id)) topics.push(topic);
  }
  return topics;
}

function firstOutcomeForImported(topics: TopicItem[], raw: string): OutcomeItem | null {
  const code = (raw || '').trim().replace(/\.+$/, '').toLowerCase();
  if (!code) return null;
  const queryParts = dottedParts(code);
  for (const t of topics) {
    if (isDumpTopic(t)) continue;
    const outcomes = t.outcomes ?? [];
    const exact = outcomes.find(o => (o.code || '').trim().replace(/\.+$/, '').toLowerCase() === code);
    if (exact) return exact;
    const under = outcomes.find(o => {
      const parts = dottedParts(o.code || '');
      return parts.length > queryParts.length && queryParts.every((p, i) => parts[i] === p);
    });
    if (under && queryParts.length >= 3) return under;
  }
  const needle = (raw || '').trim().toLowerCase();
  for (const t of topics) {
    if (isDumpTopic(t)) continue;
    const hit = (t.outcomes ?? []).find(o => (o.text || '').trim().toLowerCase() === needle);
    if (hit) return hit;
  }
  return null;
}

const norm = (v: string) => (v || '').trim().replace(/\.+$/, '').toLocaleLowerCase('tr');

/** Girilen metin bağlı kazanımı anlatmıyorsa (farklı kod yapıştırılmış) gösterilir. */
function importedDiffers(row: OutcomeRow): boolean {
  if (!row.imported || row.state !== 'linked') return false;
  const imp = norm(row.imported);
  return imp !== norm(row.outcome_code) && !norm(row.outcome_text).includes(imp);
}

interface Props {
  exam: ExamDetail;
}

export default function OutcomesTab({ exam }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([]);
  const [sectionInfos, setSectionInfos] = useState<SectionInfo[]>([]);
  const [allSections, setAllSections] = useState<ExamSection[]>(exam.sections ?? []);
  const [rows, setRows] = useState<OutcomeRow[]>([]);
  const [suggestions, setSuggestions] = useState<Map<number, OutcomeItem>>(new Map());
  const [allSubjects, setAllSubjects] = useState<SubjectItem[]>([]);
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const [filter, setFilter] = useState<Filter>('all');
  const [sectionFilter, setSectionFilter] = useState<number | null>(null);

  const [pickerItemId, setPickerItemId] = useState<number | null>(null);
  const [pasteScope, setPasteScope] = useState<number | 'all' | null>(null);

  const autoLinkedRef = useRef(false);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [listedSubjects, freshExam, keys, tree] = await Promise.all([
        curriculumApi.listSubjects().catch(() => [] as SubjectItem[]),
        examApi.detail(exam.id),
        answerKeyApi.list(exam.id),
        answerKeyApi.outcomes(exam.id),
      ]);
      setAllSubjects(listedSubjects);
      setAnswerKeys(keys);
      const sections = freshExam.sections ?? [];
      setAllSections(sections);

      const infos: SectionInfo[] = leafExamSections(sections).map(sec => {
        const subject = sec.subject ? tree.find(sub => Number(sub.id) === Number(sec.subject)) ?? null : null;
        return {
          section: sec,
          subject,
          topics: subject ? topicsForSection(exam.exam_type, sec.name, subject, tree) : [],
        };
      });

      // Onarım yazma işlemidir (ders bağlar, boş ders kopyalarını temizler):
      // yalnız bağsız ya da müfredatta bulunmayan derse bağlı bölüm varsa bir kez çalışır.
      if (!autoLinkedRef.current && infos.some(i => !i.subject)) {
        autoLinkedRef.current = true;
        try {
          await examApi.linkSubjects(exam.id);
          return fetchData();
        } catch (err) {
          setMsg('⚠️ Bölümlere müfredat dersi otomatik bağlanamadı: '
            + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        }
      }
      setSectionInfos(infos);

      const primary = pickPrimaryAnswerKey(keys);
      const nextSuggestions = new Map<number, OutcomeItem>();
      const nextRows: OutcomeRow[] = (primary?.items ?? [])
        .slice()
        .sort((a, b) => a.question_number - b.question_number)
        .map(item => {
          const leaf = leafSectionForQuestion(sections, item.question_number);
          const info = infos.find(i => i.section.id === (leaf?.id ?? item.section));
          const imported = (item.imported_outcome_text || '').trim();
          const base = {
            item_id: item.id,
            question_number: item.question_number,
            correct_answer: item.correct_answer,
            is_cancelled: item.is_cancelled,
            section_id: leaf?.id ?? item.section,
            imported,
            outcome_id: item.outcome,
            sub_outcome_id: item.sub_outcome ?? null,
            outcome_code: item.outcome_code || '',
            outcome_text: item.outcome_text || '',
            topic_name: withoutGrade(item.topic_name || ''),
          };
          if (item.outcome) {
            return {
              ...base,
              topic_name: base.topic_name || (info ? findTopicForOutcome(info.topics, item.outcome) : ''),
              state: 'linked' as const,
            };
          }
          if (imported && item.outcome_code && item.outcome_text) return { ...base, state: 'topic' as const };
          const guess = imported && info ? firstOutcomeForImported(info.topics, imported) : null;
          if (guess) {
            nextSuggestions.set(item.id, guess);
            return {
              ...base,
              outcome_code: guess.code,
              outcome_text: guess.text,
              topic_name: findTopicForOutcome(info!.topics, guess.id),
              state: 'suggested' as const,
            };
          }
          return { ...base, state: imported ? 'missed' as const : 'none' as const };
        });
      setSuggestions(nextSuggestions);
      setRows(nextRows);
    } catch (err) {
      console.error('OutcomesTab fetchData error:', err);
      setMsg('❌ Veri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [exam.id, exam.exam_type]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const primary = pickPrimaryAnswerKey(answerKeys);
  const optionalIds = useMemo(() => optionalSectionIds(allSections), [allSections]);
  const infoById = useMemo(() => new Map(sectionInfos.map(i => [i.section.id, i])), [sectionInfos]);
  const unlinked = sectionInfos.filter(i => !i.subject && rows.some(r => r.section_id === i.section.id));

  const counts = useMemo(() => {
    const c = { linked: 0, topic: 0, suggested: 0, missed: 0, none: 0 };
    for (const r of rows) c[r.state] += 1;
    return c;
  }, [rows]);
  const doneCount = counts.linked + counts.topic;
  const missingCount = rows.length - doneCount;
  const percent = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;

  const sectionStats = useMemo(() => {
    const map = new Map<number, { total: number; done: number }>();
    for (const r of rows) {
      const cur = map.get(r.section_id) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (DONE.includes(r.state)) cur.done += 1;
      map.set(r.section_id, cur);
    }
    return map;
  }, [rows]);

  const shownRows = useMemo(() => rows.filter(r =>
    (sectionFilter === null || r.section_id === sectionFilter)
    && (filter === 'all' || (filter === 'suggested' ? r.state === 'suggested' : !DONE.includes(r.state))),
  ), [rows, filter, sectionFilter]);

  useEffect(() => {
    if (filter === 'suggested' && counts.suggested === 0) setFilter('all');
  }, [filter, counts.suggested]);

  /* ── Tekil atama: anında kaydedilir, hata olursa geri alınır ─── */
  const assign = useCallback(async (itemId: number, outcome: OutcomeItem | null) => {
    if (!primary) return;
    const before = rows.find(r => r.item_id === itemId);
    if (!before) return;
    const info = infoById.get(before.section_id);
    const next: OutcomeRow = outcome
      ? {
          ...before,
          imported: '',
          outcome_id: outcome.id,
          sub_outcome_id: outcome.sub_outcome_id ?? null,
          outcome_code: outcome.code,
          outcome_text: outcome.text,
          topic_name: info ? findTopicForOutcome(info.topics, outcome.id) : '',
          state: 'linked',
        }
      : {
          ...before,
          imported: '',
          outcome_id: null,
          sub_outcome_id: null,
          outcome_code: '',
          outcome_text: '',
          topic_name: '',
          state: 'none',
        };
    setRows(prev => prev.map(r => (r.item_id === itemId ? next : r)));
    setSuggestions(prev => {
      if (!prev.has(itemId)) return prev;
      const copy = new Map(prev);
      copy.delete(itemId);
      return copy;
    });
    setPickerItemId(null);
    try {
      // Girilen kod temizlenir: kalırsa ekranda seçilen kazanım yerine eski kod görünür.
      await answerKeyApi.updateItem(exam.id, primary.id, {
        item_id: itemId,
        outcome_id: outcome?.id ?? null,
        sub_outcome_id: outcome?.sub_outcome_id ?? null,
        imported_outcome_text: '',
      });
    } catch (err) {
      setRows(prev => prev.map(r => (r.item_id === itemId ? before : r)));
      setMsg('❌ Kaydedilemedi: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  }, [primary, rows, infoById, exam.id]);

  const acceptSuggestions = useCallback(async (ids: number[]) => {
    if (!primary || ids.length === 0) return;
    setBusy(true);
    try {
      await answerKeyApi.bulkUpdateItems(exam.id, primary.id, ids.map(id => {
        const o = suggestions.get(id)!;
        return { item_id: id, outcome_id: o.id, sub_outcome_id: o.sub_outcome_id ?? null };
      }));
      await fetchData();
      setMsg(`✅ ${ids.length} öneri kaydedildi.`);
    } catch (err) {
      setMsg('❌ Öneriler kaydedilemedi: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setBusy(false);
    }
  }, [primary, suggestions, exam.id, fetchData]);

  const clearAll = useCallback(async () => {
    if (!primary) return;
    const targets = rows.filter(r => r.state !== 'none');
    if (targets.length === 0) return;
    if (!confirm(`${targets.length} sorunun kazanım bağı ve girilen kodu silinsin mi?`)) return;
    setBusy(true);
    try {
      await answerKeyApi.bulkUpdateItems(exam.id, primary.id, targets.map(r => ({
        item_id: r.item_id, outcome_id: null, sub_outcome_id: null, imported_outcome_text: '',
      })));
      await fetchData();
      setMsg('✅ Kazanımlar temizlendi.');
    } catch (err) {
      setMsg('❌ Temizlenemedi: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setBusy(false);
    }
  }, [primary, rows, exam.id, fetchData]);

  const linkSubject = useCallback(async (sectionId: number, subjectId: number) => {
    setLinkingId(sectionId);
    try {
      await curriculumApi.linkSection(subjectId, sectionId);
      await fetchData();
      setMsg('✅ Müfredat dersi bağlandı.');
    } catch (err) {
      setMsg('❌ Ders bağlanamadı: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setLinkingId(null);
    }
  }, [fetchData]);

  const repairLinks = useCallback(async () => {
    setBusy(true);
    try {
      await examApi.linkSubjects(exam.id);
      await fetchData();
      setMsg('✅ Dersler yeniden bağlandı.');
    } catch (err) {
      setMsg('❌ Otomatik bağlanamadı: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setBusy(false);
    }
  }, [exam.id, fetchData]);

  const pickerRow = pickerItemId !== null ? rows.find(r => r.item_id === pickerItemId) ?? null : null;

  if (loading && rows.length === 0) return <div className={k.loading}>Kazanımlar yükleniyor…</div>;

  if (!primary || rows.length === 0) return (
    <div className={k.empty}>
      <b>Önce cevap anahtarı girin</b>
      <p>Kazanımlar cevap anahtarındaki sorulara bağlanır. Cevap Anahtarı sekmesinden soruları kaydettikten sonra burada eşleştirebilirsiniz.</p>
    </div>
  );

  const tone = msg.startsWith('❌') ? k.toastErr : msg.startsWith('⚠️') ? k.toastWarn : k.toastOk;

  return (
    <div className={k.page}>
      {msg && (
        <div className={`${k.toast} ${tone}`} role="status">
          <span>{msg.replace(/^(✅|⚠️|❌)\s*/u, '')}</span>
          <button type="button" aria-label="Kapat" onClick={() => setMsg('')}>×</button>
        </div>
      )}

      <section className={k.toolbar}>
        <div className={k.summary}>
          <p className={k.count}>
            <b>{doneCount}</b>/{rows.length} soru kazanımlı
            <span>
              {counts.topic > 0 && `${counts.topic} konu düzeyinde · `}
              {missingCount > 0 ? `${missingCount} eksik` : 'Eksik yok'}
            </span>
          </p>
          <div className={k.meter} aria-hidden><i style={{ width: `${percent}%` }} /></div>
        </div>
        <div className={k.actions}>
          <button type="button" className={k.btnPrimary} onClick={() => setPasteScope('all')} disabled={busy}>
            Toplu yapıştır
          </button>
          {rows.some(r => r.state !== 'none') && (
            <button type="button" className={k.btnDanger} onClick={clearAll} disabled={busy}>Temizle</button>
          )}
        </div>
      </section>

      {counts.suggested > 0 && (
        <div className={k.notice}>
          <p>
            <b>{counts.suggested} soru için öneri var.</b>
            {' '}Girilen kodlar müfredatta bulundu ama soruya bağlanmamış; analizde sayılmaz.
          </p>
          <button
            type="button"
            className={k.btnPrimary}
            disabled={busy}
            onClick={() => acceptSuggestions([...suggestions.keys()])}
          >
            Tümünü kaydet
          </button>
        </div>
      )}

      {unlinked.length > 0 && (
        <div className={k.noticeWarn}>
          <p><b>Müfredat dersi bağlı olmayan bölümler.</b> Bu bölümlerde kazanım aranamaz.</p>
          <button type="button" className={k.btn} onClick={repairLinks} disabled={busy}>Otomatik bağla</button>
          <div className={k.linkList}>
            {unlinked.map(info => (
              <label key={info.section.id} className={k.linkRow}>
                <span>{info.section.name}</span>
                <select
                  disabled={linkingId === info.section.id}
                  defaultValue=""
                  onChange={e => { const id = Number(e.target.value); if (id) linkSubject(info.section.id, id); }}
                >
                  <option value="">Ders seç…</option>
                  {allSubjects.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.display_name || sub.name}
                      {sub.exam_type_filter && sub.exam_type_filter !== 'ALL' ? ` (${sub.exam_type_filter.replace('YKS_', '')})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <section className={k.panel}>
        <div className={k.listHead}>
          <div className={k.filters} role="group" aria-label="Süzgeç">
            <button type="button" className={filter === 'all' ? k.filterOn : k.filter} onClick={() => setFilter('all')}>
              Tümü <b>{rows.length}</b>
            </button>
            <button type="button" className={filter === 'missing' ? k.filterOn : k.filter} onClick={() => setFilter('missing')}>
              Eksik <b>{missingCount}</b>
            </button>
            {counts.suggested > 0 && (
              <button type="button" className={filter === 'suggested' ? k.filterOn : k.filter} onClick={() => setFilter('suggested')}>
                Öneri <b>{counts.suggested}</b>
              </button>
            )}
          </div>
          <select
            className={k.sectionSelect}
            value={sectionFilter ?? ''}
            onChange={e => setSectionFilter(e.target.value ? Number(e.target.value) : null)}
            aria-label="Ders"
          >
            <option value="">Tüm dersler</option>
            {sectionInfos.filter(i => sectionStats.has(i.section.id)).map(i => {
              const st = sectionStats.get(i.section.id)!;
              return <option key={i.section.id} value={i.section.id}>{i.section.name} ({st.done}/{st.total})</option>;
            })}
          </select>
        </div>

        {shownRows.length === 0 ? (
          <p className={k.blank}>{filter === 'missing' ? 'Eksik kazanım yok.' : 'Bu süzgece uyan soru yok.'}</p>
        ) : shownRows.map((row, i) => {
          const prev = shownRows[i - 1];
          const info = infoById.get(row.section_id);
          const st = sectionStats.get(row.section_id);
          return (
            <div key={row.item_id}>
              {(!prev || prev.section_id !== row.section_id) && (
                <div className={k.section}>
                  <b>{info?.section.name ?? 'Bölüm'}</b>
                  {optionalIds.has(row.section_id) && !/seçmeli/i.test(info?.section.name ?? '') && (
                    <em className={k.tag}>Seçmeli</em>
                  )}
                  {info?.subject && norm(info.subject.display_name || info.subject.name) !== norm(info.section.name) && (
                    <small>{info.subject.display_name || info.subject.name}</small>
                  )}
                  {st && <span className={st.done === st.total ? k.sectionDone : ''}>{st.done}/{st.total}</span>}
                  <button type="button" className={k.linkBtn} onClick={() => setPasteScope(row.section_id)} disabled={busy}>
                    Yapıştır
                  </button>
                </div>
              )}
              <Row
                row={row}
                canPick={!!info?.subject}
                busy={busy}
                onPick={() => setPickerItemId(row.item_id)}
                onClear={() => assign(row.item_id, null)}
                onAccept={() => acceptSuggestions([row.item_id])}
              />
            </div>
          );
        })}
      </section>

      {pickerRow && (
        <OutcomePicker
          row={pickerRow}
          info={infoById.get(pickerRow.section_id) ?? null}
          onSelect={o => assign(pickerRow.item_id, o)}
          onClear={pickerRow.state === 'none' ? null : () => assign(pickerRow.item_id, null)}
          onClose={() => setPickerItemId(null)}
        />
      )}

      {pasteScope !== null && (
        <PasteModal
          scope={pasteScope}
          rows={rows}
          sectionInfos={sectionInfos}
          onScope={setPasteScope}
          onClose={() => setPasteScope(null)}
          onDone={async text => {
            setPasteScope(null);
            await fetchData();
            setMsg(text);
          }}
          examId={exam.id}
          answerKeyId={primary.id}
        />
      )}
    </div>
  );
}

/* ── Satır ───────────────────────────────────────────────────────────────── */

function Row({ row, canPick, busy, onPick, onClear, onAccept }: {
  row: OutcomeRow;
  canPick: boolean;
  busy: boolean;
  onPick: () => void;
  onClear: () => void;
  onAccept: () => void;
}) {
  const answer = row.is_cancelled || row.correct_answer === 'INVALID'
    ? 'İptal'
    : row.correct_answer === 'EMPTY' ? 'Boş' : row.correct_answer || '–';
  const differs = importedDiffers(row);
  const hasOutcome = row.state === 'linked' || row.state === 'topic' || row.state === 'suggested';

  return (
    <div className={k.q}>
      <span className={DONE.includes(row.state) ? k.num : k.numMissing}>{row.question_number}</span>
      <span className={answer.length > 1 ? k.ansWide : k.ans}>{answer}</span>

      <button type="button" className={k.cell} onClick={onPick} disabled={!canPick} title={row.outcome_text || row.imported}>
        {hasOutcome ? (
          <>
            <span className={k.line}>
              <b>{row.outcome_code}</b>
              <span>{row.outcome_text}</span>
            </span>
            <small className={k.meta}>
              {row.state === 'topic' && <em className={k.tag}>Konu</em>}
              {row.state === 'suggested' && <em className={k.tagSuggest}>Öneri · kaydedilmedi</em>}
              {row.state !== 'topic' && row.topic_name && <span>{row.topic_name}</span>}
              {differs && <span className={k.warnText}>Girilen: {row.imported}</span>}
            </small>
          </>
        ) : row.state === 'missed' ? (
          <span className={k.missed}>Eşleşmedi: <span>{row.imported}</span></span>
        ) : (
          <span className={k.add}>{canPick ? '+ Kazanım seç' : 'Ders bağlı değil'}</span>
        )}
      </button>

      <div className={k.rowActions}>
        {row.state === 'suggested' && (
          <button type="button" className={k.accept} onClick={onAccept} disabled={busy}>Kaydet</button>
        )}
        {(row.state === 'linked' || row.state === 'topic' || row.state === 'missed') && (
          <button type="button" className={k.x} onClick={onClear} aria-label={`${row.question_number}. sorunun kazanımını kaldır`}>×</button>
        )}
      </div>
    </div>
  );
}

/* ── Toplu yapıştır ──────────────────────────────────────────────────────── */

function PasteModal({ scope, rows, sectionInfos, onScope, onClose, onDone, examId, answerKeyId }: {
  scope: number | 'all';
  rows: OutcomeRow[];
  sectionInfos: SectionInfo[];
  onScope: (s: number | 'all') => void;
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
  examId: number;
  answerKeyId: number;
}) {
  const [text, setText] = useState('');
  const [createMissing, setCreateMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Satırlar soru numarasına göre yerleşir: anahtarda eksik soru varsa sonraki satırlar kaymaz.
  const targets = useMemo(() => {
    const infos = scope === 'all' ? sectionInfos : sectionInfos.filter(i => i.section.id === scope);
    const out: number[] = [];
    for (const i of infos) {
      for (let q = i.section.question_start; q <= i.section.question_end; q++) out.push(q);
    }
    return out;
  }, [scope, sectionInfos]);

  const lines = useMemo(() => {
    const ls = text.split(/\r?\n/).map(l => l.trim());
    while (ls.length && !ls[ls.length - 1]) ls.pop();
    return ls;
  }, [text]);
  const filled = lines.filter(Boolean).length;
  const extra = Math.max(0, lines.length - targets.length);
  const lastQuestion = sectionInfos.reduce((m, i) => Math.max(m, i.section.question_end), 0);
  const scopeInfo = scope === 'all' ? null : sectionInfos.find(i => i.section.id === scope) ?? null;
  const noSubject = scopeInfo ? !scopeInfo.subject : false;

  const submit = async () => {
    const byQuestion = new Map<number, string>();
    targets.forEach((q, i) => { if (lines[i]) byQuestion.set(q, lines[i]); });
    const aligned = rows.map(r => byQuestion.get(r.question_number) ?? '');
    const notInKey = [...byQuestion.keys()].filter(q => !rows.some(r => r.question_number === q)).length;
    setSaving(true);
    setError('');
    try {
      const res = await answerKeyApi.bulkAssignOutcomes(examId, answerKeyId, aligned, createMissing);
      const sent = aligned.filter(Boolean).length;
      const unmatched = Math.max(0, sent - res.matched);
      const notes = [
        res.created ? `${res.created} yeni kazanım eklendi` : '',
        unmatched ? `${unmatched} satır eşleşmedi` : '',
        extra ? `${extra} satır fazla` : '',
        notInKey ? `${notInKey} soru anahtarda yok` : '',
        res.foreign_subject ? `${res.foreign_subject} satır başka dersin kazanımı, yazılmadı` : '',
      ].filter(Boolean);
      await onDone(notes.length
        ? `⚠️ ${res.matched} soruya kazanım bağlandı · ${notes.join(' · ')}.`
        : `✅ ${res.matched} soruya kazanım bağlandı.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eşleştirme yapılamadı.');
      setSaving(false);
    }
  };

  return (
    <div className={k.modal} onClick={() => !saving && onClose()}>
      <div className={k.sheet} role="dialog" aria-modal="true" aria-label="Toplu kazanım yapıştır" onClick={e => e.stopPropagation()}>
        <header className={k.sheetHead}>
          <h3>Kazanımları yapıştır</h3>
          <button type="button" className={k.x} onClick={onClose} disabled={saving} aria-label="Kapat">×</button>
        </header>
        <div className={k.sheetBody}>
          <label className={k.field}>
            <span>Kapsam</span>
            <select value={scope} onChange={e => onScope(e.target.value === 'all' ? 'all' : Number(e.target.value))} disabled={saving}>
              <option value="all">Tüm sınav · 1–{lastQuestion}</option>
              {sectionInfos.map(i => (
                <option key={i.section.id} value={i.section.id}>
                  {i.section.name} · {i.section.question_start}–{i.section.question_end}
                </option>
              ))}
            </select>
          </label>
          <p className={k.help}>
            Her satır bir soru, {targets[0] ?? 1}. sorudan başlar: kazanım kodu (21.5.1) veya açıklaması.
            Boş satır o soruyu atlar, mevcut bağı değiştirmez.
          </p>
          <textarea
            className={k.area}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'21.1.1\n21.1.2\n\nDoğal sayılarla dört işlem yapar'}
            rows={9}
            autoFocus
            disabled={saving}
          />
          <p className={extra || (filled && lines.length < targets.length) ? k.countWarn : k.countOk}>
            {filled} kazanım · {targets.length} soru
            {extra ? ` · ${extra} satır fazla` : ''}
          </p>
          {noSubject && <p className={k.errText}>Bu bölüme müfredat dersi bağlı değil; önce ders bağlayın.</p>}
          {error && <p className={k.errText}>{error}</p>}
          <label className={k.check} title="Eşleşmeyen satırlar için yalnız bu dersin müfredatına yeni kazanım açılır. Başka dersin metni yazılmaz.">
            <input type="checkbox" checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} disabled={saving} />
            Eşleşmeyenleri müfredata yeni kazanım olarak ekle
          </label>
        </div>
        <footer className={k.sheetFoot}>
          <button type="button" className={k.btn} onClick={onClose} disabled={saving}>Vazgeç</button>
          <button type="button" className={k.btnPrimary} onClick={submit} disabled={saving || filled === 0 || noSubject}>
            {saving ? 'Eşleştiriliyor…' : 'Eşleştir ve kaydet'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── Kazanım seçici ──────────────────────────────────────────────────────── */

function OutcomePicker({ row, info, onSelect, onClear, onClose }: {
  row: OutcomeRow;
  info: SectionInfo | null;
  onSelect: (o: OutcomeItem) => void;
  onClear: (() => void) | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const topics = filterTopicsByQuery(info?.topics ?? [], search).filter(t => (t.outcomes ?? []).length > 0);
  const isCurrent = (id: number, subId: number | null) =>
    row.state === 'linked' && row.outcome_id === id && (row.sub_outcome_id ?? null) === subId;

  return (
    <div className={k.modal} onClick={onClose}>
      <div className={k.sheet} role="dialog" aria-modal="true" aria-label="Kazanım seç" onClick={e => e.stopPropagation()}>
        <header className={k.sheetHead}>
          <h3>
            {row.question_number}. soru
            <small>
              {info?.section.name}
              {info?.subject && norm(info.subject.display_name || info.subject.name) !== norm(info.section.name)
                ? ` · ${info.subject.display_name || info.subject.name}` : ''}
            </small>
          </h3>
          <button type="button" className={k.x} onClick={onClose} aria-label="Kapat">×</button>
        </header>
        <div className={k.sheetBody}>
          {row.imported && row.state !== 'linked' && (
            <p className={k.help}>Girilen: <b>{row.imported}</b></p>
          )}
          <input
            className={k.search}
            type="search"
            placeholder="Kod veya metin ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {!info?.subject ? (
            <p className={k.blank}>Bu bölüme müfredat dersi bağlı değil.</p>
          ) : topics.length === 0 ? (
            <p className={k.blank}>Sonuç yok.</p>
          ) : topics.map(topic => (
            <div key={topic.id} className={k.group}>
              <p className={k.topic}>{topicDisplayName(topic.name)}</p>
              {topic.outcomes.map(o => (
                <div key={o.id}>
                  <button
                    type="button"
                    className={isCurrent(o.id, null) ? k.optOn : k.opt}
                    onClick={() => onSelect({ ...o, sub_outcome_id: null })}
                  >
                    <strong>{o.code}</strong>{o.text}
                  </button>
                  {(o.sub_outcomes ?? []).map(sub => (
                    <button
                      key={sub.id}
                      type="button"
                      className={`${isCurrent(o.id, sub.id) ? k.optOn : k.opt} ${k.optSub}`}
                      onClick={() => onSelect({ id: o.id, code: sub.code, text: sub.text, sub_outcome_id: sub.id })}
                    >
                      <strong>{sub.code}</strong>{sub.text}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
        {onClear && (
          <footer className={k.sheetFoot}>
            <button type="button" className={k.btnDanger} onClick={onClear}>
              {row.state === 'missed' ? 'Girilen kodu sil' : 'Kazanımı kaldır'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
