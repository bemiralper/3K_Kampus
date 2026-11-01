'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveCoachPhotoUrl } from '@/lib/coach-media';
import { downloadBlob } from '@/lib/download-file';
import { analysisApi } from '../../../../components/olcme/api';
import PdfExportModal from '../../../../components/olcme/PdfExportModal';
import KarneNotifyModal from '../../../../components/olcme/analysis/KarneNotifyModal';
import KarneBulkNotifyModal from '../../../../components/olcme/analysis/KarneBulkNotifyModal';
import InfoTip from '../../../../components/olcme/analysis/InfoTip';
import { ALAN_LABELS } from '../../../../components/olcme/pdfExport';
import { leafExamSections } from '../../../../components/olcme/section-ranges';
import type { ExamDetail, ExamSection, StudentAnalysis } from '../../../../components/olcme/types';
import Icon from '../../../../components/olcme/ui/Icon';
import { LoadState, SortTh, type SortDir } from './analysis-ui';
import {
  ALAN_TO_PT, fmt, fmtInt, mainSections, NO_CLASS, norm, PT_LABEL, ptKeysFor, RANKED_EXAM_TYPES,
  studentEstimate, studentNet, studentScore, type PtKey,
} from './analysis-utils';
import type { Resource } from './AnalysisTab';
import a from './analysis.module.css';

type Layout = 'ozet' | 'testler' | 'dersler';
type SortKey = 'rank' | 'name' | 'net' | 'puan' | `sec:${number}` | `pt:${PtKey}`;

type RankingsBundle = Awaited<ReturnType<typeof analysisApi.rankings>>;

interface Props {
  exam: ExamDetail;
  students: Resource<StudentAnalysis[]>;
  sessionId?: number;
  rankingYear: number;
  classFilter: string;
  onClassFilter: (v: string) => void;
  onSelect: (st: StudentAnalysis) => void;
}

function Avatar({ foto }: { foto?: string | null }) {
  const src = resolveCoachPhotoUrl(foto);
  return (
    <span className={a.avatar} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src || '/img/3k-logo.png'} alt="" className={src ? undefined : a.avatarLogo} />
    </span>
  );
}

export default function AnalysisStudents({ exam, students, sessionId, rankingYear, classFilter, onClassFilter, onSelect }: Props) {
  const examType = exam.exam_type;
  const ptKeys = ptKeysFor(examType);
  const multiPt = ptKeys.length > 0;
  const ranked = RANKED_EXAM_TYPES.includes(examType);

  const [search, setSearch] = useState('');
  const [alan, setAlan] = useState('');
  const [pt, setPt] = useState<PtKey | null>(multiPt ? 'SAY' : null);
  const [measure, setMeasure] = useState<'puan' | 'net'>('puan');
  const [layout, setLayout] = useState<Layout>('ozet');
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const [pdfMode, setPdfMode] = useState<'students' | 'rankings' | null>(null);
  const [rankingsData, setRankingsData] = useState<RankingsBundle | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [notify, setNotify] = useState<StudentAnalysis | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => students.data ?? [], [students.data]);

  useEffect(() => { setRankingsData(null); }, [sessionId, rankingYear]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  const classes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const st of list) {
      if (!st.student_id) continue;
      const key = st.sinif || NO_CLASS;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((x, y) => x[0].localeCompare(y[0], 'tr'));
  }, [list]);

  const alanCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const st of list) if (st.alan) counts[st.alan] = (counts[st.alan] ?? 0) + 1;
    return counts;
  }, [list]);

  const unmatchedCount = useMemo(() => list.filter(st => !st.student_id).length, [list]);

  const changeAlan = (value: string) => {
    setAlan(value);
    if (multiPt) {
      const mapped = ALAN_TO_PT[value];
      setPt(mapped && ptKeys.includes(mapped) ? mapped : 'SAY');
    }
  };

  const classValid = !classFilter || classes.some(([k]) => k === classFilter);

  const base = useMemo(() => list.filter(st => {
    if (classFilter && classValid && (!st.student_id || (st.sinif || NO_CLASS) !== classFilter)) return false;
    if (alan && st.alan !== alan) return false;
    return true;
  }), [list, classFilter, classValid, alan]);

  const measureOf = (st: StudentAnalysis) => (measure === 'net' ? studentNet(st, pt) : studentScore(st, pt));

  const ranks = useMemo(() => {
    const ordered = [...base].sort((x, y) => measureOf(y) - measureOf(x));
    const map = new Map<number, number>();
    let prevValue: number | null = null;
    let prevRank = 0;
    ordered.forEach((st, idx) => {
      const v = measureOf(st);
      const rank = prevValue !== null && v === prevValue ? prevRank : idx + 1;
      map.set(st.answer_id, rank);
      prevValue = v;
      prevRank = rank;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, measure, pt]);

  const testSections = useMemo(() => mainSections(exam.sections), [exam.sections]);
  const leafSections = useMemo(() => leafExamSections(exam.sections), [exam.sections]);
  const columns: ExamSection[] = layout === 'testler' ? testSections : layout === 'dersler' ? leafSections : [];

  const secOf = (st: StudentAnalysis, id: number) => st.section_details.find(d => d.section_id === id);

  const visible = useMemo(() => {
    const q = norm(search);
    const rows = base.filter(st => {
      if (onlyUnmatched && st.student_id) return false;
      if (!q) return true;
      return norm(st.student_name).includes(q)
        || (st.raw_student_id || '').includes(q)
        || norm(st.sinif || '').includes(q);
    });
    const value = (st: StudentAnalysis): number | string => {
      if (sortKey === 'rank') return ranks.get(st.answer_id) ?? 0;
      if (sortKey === 'name') return st.student_name;
      if (sortKey === 'net') return studentNet(st, pt);
      if (sortKey === 'puan') return studentScore(st, pt);
      if (sortKey.startsWith('pt:')) return st.puan_turleri?.[sortKey.slice(3) as PtKey]?.puan ?? 0;
      return secOf(st, Number(sortKey.slice(4)))?.net ?? -999;
    };
    return rows.sort((x, y) => {
      const vx = value(x);
      const vy = value(y);
      const cmp = typeof vx === 'string' ? vx.localeCompare(String(vy), 'tr') : vx - (vy as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, search, onlyUnmatched, sortKey, sortDir, ranks, pt]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(k);
    setSortDir(k === 'rank' || k === 'name' ? 'asc' : 'desc');
  };

  const uniqueSiniflar = useMemo(
    () => Array.from(new Set(list.map(st => st.sinif).filter(Boolean))) as string[],
    [list],
  );

  const exportTable = async (format: 'xlsx' | 'csv') => {
    setMenuOpen(false);
    setExporting(format);
    setExportError('');
    try {
      const blob = await analysisApi.exportRankings(format, exam.id, sessionId, rankingYear, alan || null);
      downloadBlob(blob, `${exam.name}_Siralama.${format}`.replace(/\s+/g, '_'));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Dışa aktarılamadı.');
    } finally {
      setExporting('');
    }
  };

  const openRankingsPdf = async () => {
    setMenuOpen(false);
    if (rankingsData) {
      setPdfMode('rankings');
      return;
    }
    setExporting('rankings');
    setExportError('');
    try {
      const data = await analysisApi.rankings(exam.id, sessionId, rankingYear);
      setRankingsData(data);
      setPdfMode('rankings');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Sıralama verisi alınamadı.');
    } finally {
      setExporting('');
    }
  };

  const downloadOne = async (st: StudentAnalysis) => {
    setPdfBusyId(st.answer_id);
    setExportError('');
    try {
      await analysisApi.downloadKarnePdf(exam.id, st.answer_id, rankingYear);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Karne indirilemedi.');
    } finally {
      setPdfBusyId(null);
    }
  };

  const filtersActive = !!(search || alan || (classFilter && classValid) || onlyUnmatched);
  const clearFilters = () => {
    setSearch('');
    changeAlan('');
    onClassFilter('');
    setOnlyUnmatched(false);
  };

  const netHeader = examType === 'YKS_AYT' ? 'Alan neti' : 'Net';

  return (
    <LoadState loading={students.loading} error={students.error} onRetry={students.reload} hasData={!!students.data}>
      <section className={a.panel}>
        <div className={a.toolbar}>
          <label className={a.searchBox}>
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Ad, numara veya sınıf"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          {classes.length > 1 && (
            <select className={a.select} value={classValid ? classFilter : ''} onChange={e => onClassFilter(e.target.value)} aria-label="Sınıf">
              <option value="">Tüm sınıflar</option>
              {classes.map(([k, n]) => (
                <option key={k} value={k}>{k === NO_CLASS ? 'Sınıfsız' : k} ({n})</option>
              ))}
            </select>
          )}
          {Object.keys(alanCounts).length > 1 && (
            <select className={a.select} value={alan} onChange={e => changeAlan(e.target.value)} aria-label="Alan">
              <option value="">Tüm alanlar</option>
              {Object.entries(ALAN_LABELS).map(([k, label]) => alanCounts[k] ? (
                <option key={k} value={k}>{label} ({alanCounts[k]})</option>
              ) : null)}
            </select>
          )}
          {multiPt && (
            <select className={a.select} value={pt ?? 'SAY'} onChange={e => setPt(e.target.value as PtKey)} aria-label="Puan türü" title="Sıra, net ve tahmini sıra bu puan türüne göre">
              {ptKeys.map(k => <option key={k} value={k}>{PT_LABEL[k]} puanı</option>)}
            </select>
          )}
          <select className={a.select} value={measure} onChange={e => setMeasure(e.target.value === 'net' ? 'net' : 'puan')} aria-label="Sıralama ölçütü">
            <option value="puan">Puana göre sıra</option>
            <option value="net">Nete göre sıra</option>
          </select>
          <div className={a.toolbarEnd}>
            <div className={a.menuWrap} ref={menuRef}>
              <button type="button" className={a.btnGhost} onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} disabled={!!exporting}>
                <Icon name="download" size={15} />
                {exporting ? 'Hazırlanıyor…' : 'Dışa aktar'}
              </button>
              {menuOpen && (
                <div className={a.menu} role="menu">
                  <button type="button" role="menuitem" onClick={() => exportTable('xlsx')}>Sıralama · Excel</button>
                  <button type="button" role="menuitem" onClick={() => exportTable('csv')}>Sıralama · CSV</button>
                  <button type="button" role="menuitem" onClick={openRankingsPdf}>Sıralama · PDF</button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setPdfMode('students'); }}>Karneler · PDF</button>
                </div>
              )}
            </div>
            <button type="button" className={a.btnPrimary} onClick={() => setBulkOpen(true)} disabled={list.length === unmatchedCount}>
              Toplu WhatsApp
            </button>
          </div>
        </div>

        <div className={a.subbar}>
          <div className={a.segSmall} role="tablist" aria-label="Tablo düzeni">
            {([['ozet', 'Özet'], ['testler', 'Testler'], ['dersler', 'Dersler']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={layout === k} className={layout === k ? a.segOn : a.segBtn} onClick={() => setLayout(k)}>
                {label}
              </button>
            ))}
          </div>
          <span className={a.count}>
            <b>{visible.length}</b>{visible.length !== list.length ? ` / ${list.length}` : ''} öğrenci
            {unmatchedCount > 0 && (
              <button type="button" className={onlyUnmatched ? a.chipOn : a.chip} onClick={() => setOnlyUnmatched(v => !v)}>
                {unmatchedCount} eşleşmemiş
              </button>
            )}
            {filtersActive && <button type="button" className={a.linkBtn} onClick={clearFilters}>Filtreleri temizle</button>}
          </span>
        </div>

        {exportError && (
          <div className={a.alertErr} role="alert">
            <span>{exportError}</span>
            <button type="button" className={a.x} onClick={() => setExportError('')} aria-label="Kapat">×</button>
          </div>
        )}

        {visible.length === 0 ? (
          <div className={a.empty}>
            <span>{list.length ? 'Filtreye uyan öğrenci yok.' : 'Öğrenci sonucu yok.'}</span>
            {filtersActive && <button type="button" className={a.linkBtn} onClick={clearFilters}>Filtreleri temizle</button>}
          </div>
        ) : (
          <div className={`${a.tableWrap} ${a.tableTall}`}>
            <table className={`${a.table} ${a.studentTable}`}>
              <thead>
                <tr>
                  <SortTh k="rank" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={`${a.num} ${a.stickyA}`} title={`${measure === 'net' ? 'Nete' : 'Puana'} göre. Sınıf veya alan seçiliyse o grup içindeki sıradır.`}>Sıra</SortTh>
                  <SortTh k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.stickyB}>Öğrenci</SortTh>
                  <SortTh k="net" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num}>{multiPt ? `${PT_LABEL[pt ?? 'SAY']} net` : netHeader}</SortTh>
                  {!multiPt && <SortTh k="puan" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num}>Puan</SortTh>}
                  {multiPt && layout === 'ozet' && ptKeys.map(k => (
                    <SortTh key={k} k={`pt:${k}` as SortKey} sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={`${a.num} ${k === pt ? a.ptOn : ''}`}>{PT_LABEL[k]}</SortTh>
                  ))}
                  {columns.map(sec => (
                    <SortTh key={sec.id} k={`sec:${sec.id}` as SortKey} sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num} title={`${sec.name} · ${sec.question_count} soru`}>
                      {sec.name}
                    </SortTh>
                  ))}
                  {layout === 'ozet' && <th className={a.num}>D / Y / B</th>}
                  {layout === 'ozet' && ranked && <th className={a.num}>Tahmini sıra <InfoTip tip="tahminiSiralama" /></th>}
                  {layout === 'ozet' && <th className={a.hideSm}>Güçlü · zayıf</th>}
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {visible.map(st => {
                  const est = studentEstimate(st, examType, multiPt ? pt : null);
                  return (
                    <tr key={st.answer_id} className={a.clickRow} onClick={() => onSelect(st)}>
                      <td className={`${a.num} ${a.stickyA}`}>
                        <span className={a.rank}>{ranks.get(st.answer_id)}</span>
                        <span className={a.rankOf}>/{base.length}</span>
                      </td>
                      <td className={a.stickyB}>
                        <div className={a.who}>
                          <Avatar foto={st.profil_foto} />
                          <div>
                            <div className={a.name}>{st.student_name}</div>
                            <div className={a.meta}>
                              {!st.student_id
                                ? <span className={a.pillWarn}>Eşleşmedi</span>
                                : <>{st.sinif || 'Sınıfsız'}{st.alan ? ` · ${ALAN_LABELS[st.alan] ?? st.alan}` : ''}</>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={a.num} title={examType === 'YKS_AYT' ? `Tüm testler: ${fmt(st.toplam_net)}` : undefined}>
                        <b>{fmt(studentNet(st, pt))}</b>
                      </td>
                      {!multiPt && <td className={a.num}><span className={a.accent}>{fmt(st.puan)}</span></td>}
                      {multiPt && layout === 'ozet' && ptKeys.map(k => {
                        const row = st.puan_turleri?.[k];
                        return (
                          <td key={k} className={`${a.num} ${k === pt ? a.ptOn : ''}`}>
                            {row ? <><b>{fmt(row.puan)}</b><div className={a.meta}>{fmt(row.ayt_net)} net</div></> : '—'}
                          </td>
                        );
                      })}
                      {columns.map(sec => {
                        const d = secOf(st, sec.id);
                        return (
                          <td key={sec.id} className={a.num} title={d ? `${d.correct} doğru · ${d.wrong} yanlış · ${d.empty} boş` : undefined}>
                            {d ? (
                              <>
                                <span className={d.net < 0 ? a.bad : undefined}>{fmt(d.net)}</span>
                                {layout === 'testler' && <div className={a.meta}>{d.correct}D {d.wrong}Y</div>}
                              </>
                            ) : '—'}
                          </td>
                        );
                      })}
                      {layout === 'ozet' && (
                        <td className={a.num}>
                          <span className={a.good}>{st.total_correct}</span>
                          {' / '}<span className={a.bad}>{st.total_wrong}</span>
                          {' / '}<span className={a.dim}>{st.total_empty}</span>
                        </td>
                      )}
                      {layout === 'ozet' && ranked && (
                        <td className={a.num}>
                          {est.sira ? fmtInt(est.sira) : '—'}
                          {est.yuzdelik != null && <div className={a.meta}>%{fmt(est.yuzdelik, 1)} dilim</div>}
                        </td>
                      )}
                      {layout === 'ozet' && (
                        <td className={a.hideSm}>
                          <div className={a.areas}>
                            {st.strong_areas.slice(0, 2).map(x => <span key={`s${x.name}`} className={a.areaGood}>{x.name}</span>)}
                            {st.weak_areas.slice(0, 2).map(x => <span key={`w${x.name}`} className={a.areaBad}>{x.name}</span>)}
                          </div>
                        </td>
                      )}
                      <td onClick={e => e.stopPropagation()}>
                        <div className={a.rowActions}>
                          <button type="button" className={a.iconBtn} onClick={() => downloadOne(st)} disabled={pdfBusyId === st.answer_id} title="Karne PDF" aria-label={`${st.student_name} karnesini indir`}>
                            {pdfBusyId === st.answer_id ? '…' : <Icon name="document" size={15} />}
                          </button>
                          <button type="button" className={a.iconBtn} onClick={() => setNotify(st)} disabled={!st.student_id} title={st.student_id ? 'Karneyi WhatsApp ile gönder' : 'Eşleşmemiş kayıt gönderilemez'} aria-label={`${st.student_name} karnesini gönder`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {ranked && (
          <p className={a.hlFoot}>
            Tahmini sıra ÖSYM {rankingYear} verisine göre Türkiye geneli tahminidir; yayınevinin “genel sıra”sı yalnızca o denemeye katılanlara göredir.
          </p>
        )}
      </section>

      {pdfMode === 'students' && (
        <PdfExportModal
          mode="students"
          examId={exam.id}
          rankingYear={rankingYear}
          examName={exam.name}
          examType={examType}
          students={list}
          uniqueSiniflar={uniqueSiniflar}
          onClose={() => setPdfMode(null)}
        />
      )}
      {pdfMode === 'rankings' && rankingsData && (
        <PdfExportModal
          mode="rankings"
          examName={exam.name}
          examType={examType}
          sections={rankingsData.sections}
          rankings={rankingsData.rankings}
          uniqueSiniflar={uniqueSiniflar}
          referansYil={rankingYear}
          sectionAvgs={rankingsData.section_avgs}
          avgScore={rankingsData.avg_score}
          avgNet={rankingsData.avg_net}
          puanTurleriAvgs={rankingsData.puan_turleri_avgs}
          sinifAvgs={rankingsData.sinif_avgs}
          onClose={() => setPdfMode(null)}
        />
      )}
      {bulkOpen && (
        <KarneBulkNotifyModal
          examId={exam.id}
          examName={exam.name}
          examType={examType}
          students={list.filter(st => st.student_id)}
          uniqueSiniflar={uniqueSiniflar}
          rankingYear={rankingYear}
          unmatchedCount={unmatchedCount}
          onClose={() => setBulkOpen(false)}
        />
      )}
      {notify && (
        <KarneNotifyModal
          examId={exam.id}
          answerId={notify.answer_id}
          studentName={notify.student_name}
          rankingYear={rankingYear}
          onClose={() => setNotify(null)}
        />
      )}
    </LoadState>
  );
}
