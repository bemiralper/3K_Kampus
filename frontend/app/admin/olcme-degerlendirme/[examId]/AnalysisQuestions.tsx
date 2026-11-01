'use client';

import { useMemo, useState } from 'react';
import InfoTip from '../../../../components/olcme/analysis/InfoTip';
import { leafExamSections, optionalSectionIds } from '../../../../components/olcme/section-ranges';
import type { ExamDetail, QuestionAnalysis } from '../../../../components/olcme/types';
import Icon from '../../../../components/olcme/ui/Icon';
import { LoadState, SortTh, type SortDir } from './analysis-ui';
import { fmt, fmtPct, norm } from './analysis-utils';
import type { Resource } from './AnalysisTab';
import a from './analysis.module.css';

type Diff = '' | 'Kolay' | 'Orta' | 'Zor' | 'weak';
type SortKey = 'no' | 'correct' | 'disc' | 'empty';

const CHOICES = ['A', 'B', 'C', 'D', 'E'] as const;

const answered = (q: QuestionAnalysis) => Object.values(q.choices).reduce((s, n) => s + n, 0);
const weakDisc = (q: QuestionAnalysis) => !q.is_cancelled && q.answered_count !== 0 && q.discrimination < 0.15;

export default function AnalysisQuestions({ exam, questions }: { exam: ExamDetail; questions: Resource<QuestionAnalysis[]> }) {
  const [sectionId, setSectionId] = useState<number | ''>('');
  const [diff, setDiff] = useState<Diff>('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('no');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const list = useMemo(() => questions.data ?? [], [questions.data]);
  const leaves = useMemo(() => leafExamSections(exam.sections), [exam.sections]);
  const optionalIds = useMemo(() => optionalSectionIds(exam.sections), [exam.sections]);
  const usedSections = useMemo(() => leaves.filter(sec => list.some(q => q.section_id === sec.id)), [leaves, list]);
  const hasOutcomes = list.some(q => q.outcome_code || q.outcome_text);

  // Doğru şıkkı seçen sayısı doğru sayısını tutmuyorsa farklı kitapçıklar aynı numarada birleşmiştir.
  const bookletMixed = useMemo(() => {
    const live = list.filter(q => !q.is_cancelled && q.correct_answer);
    if (live.length < 5) return false;
    const off = live.filter(q => {
      const n = answered(q);
      const expected = (q.correct_pct / 100) * n;
      return Math.abs((q.choices[q.correct_answer] ?? 0) - expected) > Math.max(1.5, n * 0.02);
    }).length;
    return off >= Math.max(3, live.length * 0.1);
  }, [list]);

  const scoped = useMemo(
    () => list.filter(q => sectionId === '' || q.section_id === sectionId),
    [list, sectionId],
  );

  const counts = useMemo(() => ({
    Kolay: scoped.filter(q => q.difficulty === 'Kolay').length,
    Orta: scoped.filter(q => q.difficulty === 'Orta').length,
    Zor: scoped.filter(q => q.difficulty === 'Zor').length,
    weak: scoped.filter(weakDisc).length,
  }), [scoped]);

  const visible = useMemo(() => {
    const s = norm(search);
    const rows = scoped.filter(q => {
      if (diff === 'weak' && !weakDisc(q)) return false;
      if (diff && diff !== 'weak' && q.difficulty !== diff) return false;
      if (s && !norm(`${q.question_number} ${q.outcome_code} ${q.outcome_text} ${q.section_name}`).includes(s)) return false;
      return true;
    });
    const value = (q: QuestionAnalysis) =>
      sortKey === 'no' ? q.question_number
        : sortKey === 'correct' ? q.correct_pct
          : sortKey === 'empty' ? q.empty_pct
            : q.discrimination;
    return rows.sort((x, y) => (sortDir === 'asc' ? value(x) - value(y) : value(y) - value(x)));
  }, [scoped, diff, search, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(k);
    setSortDir(k === 'no' || k === 'correct' ? 'asc' : 'desc');
  };

  const filtersActive = !!(sectionId !== '' || diff || search);

  return (
    <LoadState loading={questions.loading} error={questions.error} onRetry={questions.reload} hasData={!!questions.data}>
      {bookletMixed && (
        <div className={a.alertWarn} role="note">
          <Icon name="alert" size={16} />
          <span>
            <b>Bu tablodaki oranlar güvenilir değil.</b> A ve B kitapçığı cevapları soru numarasına göre birleştiriliyor,
            oysa B kitapçığında sorular farklı sırada. Öğrenci netleri ve puanlar doğrudur; yalnızca soru bazlı oranlar,
            şık dağılımı ve ayırt edicilik etkilenir.
          </span>
        </div>
      )}

      <section className={a.panel}>
        <div className={a.toolbar}>
          <label className={a.searchBox}>
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder={hasOutcomes ? 'Soru no veya kazanım' : 'Soru no'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          {usedSections.length > 1 && (
            <select className={a.select} value={sectionId} onChange={e => setSectionId(e.target.value ? Number(e.target.value) : '')} aria-label="Ders">
              <option value="">Tüm dersler ({list.length})</option>
              {usedSections.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}{optionalIds.has(sec.id) ? ' (seçmeli)' : ''} ({list.filter(q => q.section_id === sec.id).length})
                </option>
              ))}
            </select>
          )}
          <div className={a.chips}>
            <button type="button" className={diff === '' ? a.chipOn : a.chip} onClick={() => setDiff('')}>Tümü <b>{scoped.length}</b></button>
            {(['Kolay', 'Orta', 'Zor'] as const).map(d => (
              <button key={d} type="button" className={diff === d ? a.chipOn : a.chip} onClick={() => setDiff(diff === d ? '' : d)}>
                {d} <b>{counts[d]}</b>
              </button>
            ))}
            <button
              type="button"
              className={diff === 'weak' ? a.chipOn : a.chip}
              onClick={() => setDiff(diff === 'weak' ? '' : 'weak')}
              title="Ayırt edicilik 0,15’in altında: iyi ve zayıf öğrenciyi ayırmıyor"
            >
              Ayırt etmeyen <b>{counts.weak}</b>
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={a.empty}>
            <span>{list.length ? 'Filtreye uyan soru yok.' : 'Soru analizi için veri yok.'}</span>
            {filtersActive && (
              <button type="button" className={a.linkBtn} onClick={() => { setSectionId(''); setDiff(''); setSearch(''); }}>
                Filtreleri temizle
              </button>
            )}
          </div>
        ) : (
          <div className={`${a.tableWrap} ${a.tableTall} ${bookletMixed ? a.stale : ''}`}>
            <table className={a.table}>
              <thead>
                <tr>
                  <SortTh k="no" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={`${a.num} ${a.stickyA}`}>No</SortTh>
                  <th>Ders{hasOutcomes ? ' · kazanım' : ''}</th>
                  <th className={a.num}>Cevap</th>
                  <SortTh k="correct" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Doğru · yanlış · boş</SortTh>
                  <th className={a.num}>Zorluk <InfoTip tip="zorluk" /></th>
                  <SortTh k="disc" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num}>Ayırt. <InfoTip tip="ayirtEdicilik" /></SortTh>
                  <th className={a.hideSm}>Şıklar (öğrenci)</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(q => {
                  const discTone = q.discrimination >= 0.3 ? a.good : q.discrimination >= 0.15 ? a.warn : a.bad;
                  const noOne = q.answered_count === 0;
                  return (
                    <tr key={q.question_number}>
                      <td className={`${a.num} ${a.stickyA}`}><b>{q.question_number}</b></td>
                      <td className={a.qCell}>
                        <div className={a.name}>
                          {q.section_name}
                          {optionalIds.has(q.section_id) && <em className={a.tag}>Seçmeli</em>}
                        </div>
                        {(q.outcome_code || q.outcome_text) && (
                          <div className={a.meta} title={q.outcome_text}>
                            {q.outcome_code && <span className={a.code}>{q.outcome_code}</span>}
                            {q.outcome_text && q.outcome_text !== q.outcome_code ? q.outcome_text : ''}
                          </div>
                        )}
                      </td>
                      <td className={a.num}>
                        {q.is_cancelled ? <span className={a.pillWarn}>İptal</span> : <span className={a.answer}>{q.correct_answer}</span>}
                      </td>
                      <td className={a.stackCell}>
                        <span className={a.stack} aria-hidden>
                          <i className={a.stackGood} style={{ width: `${q.correct_pct}%` }} />
                          <i className={a.stackBad} style={{ width: `${q.wrong_pct}%` }} />
                          <i className={a.stackEmpty} style={{ width: `${q.empty_pct}%` }} />
                        </span>
                        <span className={a.stackText}>
                          <b className={a.good}>{fmtPct(q.correct_pct)}</b>
                          <span className={a.bad}>{fmtPct(q.wrong_pct)}</span>
                          <span className={a.dim}>{fmtPct(q.empty_pct)}</span>
                        </span>
                      </td>
                      <td className={a.num}>
                        {noOne || !q.difficulty
                          ? <span className={a.dim}>Çözen yok</span>
                          : <span className={q.difficulty === 'Kolay' ? a.pillOk : q.difficulty === 'Orta' ? a.pillMid : a.pillBad}>{q.difficulty}</span>}
                      </td>
                      <td className={a.num}>{noOne ? <span className={a.dim}>—</span> : <span className={discTone}>{fmt(q.discrimination)}</span>}</td>
                      <td className={a.hideSm}>
                        <div className={a.choices}>
                          {CHOICES.map(ch => {
                            const n = q.choices[ch] ?? 0;
                            const cls = ch === q.correct_answer ? a.choiceOk : ch === q.top_distractor ? a.choiceBad : a.choice;
                            return (
                              <span key={ch} className={cls} title={`${ch}: ${n} öğrenci`}>
                                <b>{ch}</b>{n}
                              </span>
                            );
                          })}
                          <span className={a.choice} title={`Boş: ${q.choices.EMPTY ?? 0} öğrenci`}><b>–</b>{q.choices.EMPTY ?? 0}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={a.hlFoot}>
          Yeşil şık doğru cevap, kırmızı şık en çok seçilen yanlış (çeldirici). Ayırt edicilik: en başarılı %27 ile en zayıf %27 arasındaki doğru oranı farkı.
        </p>
      </section>
    </LoadState>
  );
}
