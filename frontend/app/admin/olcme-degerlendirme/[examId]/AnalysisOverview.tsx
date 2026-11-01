'use client';

import { Fragment, useMemo, useState } from 'react';
import InfoTip from '../../../../components/olcme/analysis/InfoTip';
import type {
  AnalysisSectionItem,
  AnalysisSummary,
  ComparisonItem,
  ExamDetail,
} from '../../../../components/olcme/types';
import { optionalSectionIds } from '../../../../components/olcme/section-ranges';
import { LoadState, RatioBar } from './analysis-ui';
import { fmt, fmt1, fmtDate, fmtInt, fmtPct, norm, PT_LABEL, type PtKey } from './analysis-utils';
import type { Resource } from './AnalysisTab';
import a from './analysis.module.css';

interface Props {
  exam: ExamDetail;
  summary: Resource<AnalysisSummary>;
  sections: Resource<AnalysisSectionItem[]>;
  comparison: Resource<ComparisonItem[]>;
}

const isAytLike = (t: string) => t === 'YKS_AYT' || t === 'AYT_11';

export default function AnalysisOverview({ exam, summary, sections, comparison }: Props) {
  const sum = summary.data;
  const optionalIds = useMemo(() => optionalSectionIds(exam.sections), [exam.sections]);

  const history = useMemo(() => {
    const list = [...(comparison.data ?? [])].reverse();
    const idx = list.findIndex(c => c.is_current);
    return { list, prev: idx > 0 ? list[idx - 1] : null, current: idx >= 0 ? list[idx] : null };
  }, [comparison.data]);

  return (
    <>
      <LoadState loading={summary.loading} error={summary.error} onRetry={summary.reload} hasData={!!sum}>
        {sum && <Kpis exam={exam} sum={sum} prev={history.prev} current={history.current} />}
      </LoadState>

      <LoadState loading={sections.loading} error={sections.error} onRetry={sections.reload} hasData={!!sections.data}>
        {sections.data && (
          <>
            <Highlights rows={sections.data} optionalIds={optionalIds} />
            <SectionTable exam={exam} rows={sections.data} optionalIds={optionalIds} />
          </>
        )}
      </LoadState>

      <LoadState loading={comparison.loading} error={comparison.error} onRetry={comparison.reload} hasData={!!comparison.data}>
        {comparison.data && <History exam={exam} list={history.list} />}
      </LoadState>
    </>
  );
}

/* ── Göstergeler ─────────────────────────────────────────────────────────── */

function Kpis({ exam, sum, prev, current }: {
  exam: ExamDetail;
  sum: AnalysisSummary;
  prev: ComparisonItem | null;
  current: ComparisonItem | null;
}) {
  const ayt = isAytLike(exam.exam_type);
  const diff = prev && current ? current.ortalama_net - prev.ortalama_net : null;
  const singleSession = sum.sessions.length === 1 ? sum.sessions[0] : null;
  const unmatched = singleSession ? Math.max(0, singleSession.total_rows - sum.katilim) : 0;
  const pts = (['SAY', 'EA', 'SOZ'] as PtKey[]).filter(pt => sum.puan_turleri?.[pt]);

  return (
    <section className={a.panel}>
      <div className={a.kpis}>
        <div className={a.kpi}>
          <span>Katılım</span>
          <b>{fmtInt(sum.katilim)}</b>
          <small>öğrenci</small>
        </div>
        <div className={a.kpi}>
          <span>Ortalama net{ayt ? ' (tüm testler)' : ''}</span>
          <b className={a.accent}>{fmt(sum.ortalama_net)}</b>
          {diff != null ? (
            <small className={diff > 0 ? a.up : diff < 0 ? a.down : undefined} title={`Önceki sınav: ${prev!.exam_name} · ${fmt(prev!.ortalama_net)} net`}>
              {diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : ''}{fmt(Math.abs(diff))} önceki sınava göre
            </small>
          ) : <small>{fmt(sum.std_sapma_net)} standart sapma</small>}
        </div>
        <div className={a.kpi}>
          <span>Medyan net <InfoTip tip="medyan" /></span>
          <b>{fmt(sum.medyan_net)}</b>
          {diff != null && <small>{fmt(sum.std_sapma_net)} standart sapma <InfoTip tip="stdSapma" /></small>}
        </div>
        <div className={a.kpi}>
          <span>En yüksek net</span>
          <b className={a.good}>{fmt(sum.max_net)}</b>
          <small>en düşük {fmt(sum.min_net)}</small>
        </div>
        {!ayt && (
          <div className={a.kpi}>
            <span>Ortalama puan</span>
            <b>{fmt(sum.ortalama_puan)}</b>
            <small>{fmt(sum.min_puan)} – {fmt(sum.max_puan)}</small>
          </div>
        )}
        {!ayt && (
          <div className={a.kpi}>
            <span>Başarı <InfoTip tip="basariYuzdesi" /></span>
            <b className={sum.basari_yuzdesi >= 50 ? a.good : a.bad}>{fmtPct(sum.basari_yuzdesi, 1)}</b>
            <small>{fmtInt(sum.basari_esik)} ve üstü net yapan</small>
          </div>
        )}
      </div>

      {ayt && pts.length > 0 && (
        <div className={a.ptRow}>
          {pts.map(pt => {
            const d = sum.puan_turleri![pt];
            return (
              <div key={pt} className={a.ptCard} data-pt={pt}>
                <span>{PT_LABEL[pt]} puanı</span>
                <b>{fmt(d.ortalama)}</b>
                <small>en yüksek {fmt(d.max)} · en düşük {fmt(d.min)} · SS {fmt(d.std_sapma)}</small>
              </div>
            );
          })}
          <p className={a.muted}>
            Puan türü ortalamaları alan ayrımı yapılmadan tüm öğrencilerden hesaplanır.
            {sum.linked_tyt_exam ? ` TYT: ${sum.linked_tyt_exam.name}.` : ''}
          </p>
        </div>
      )}

      {unmatched > 0 && (
        <p className={a.note}>
          {unmatched} optik kayıt bir öğrenciyle eşleşmediği için bu özete ve ortalamalara katılmadı.
          Eşleştirmek için &quot;Sonuç Yükle&quot; sekmesini kullanın.
        </p>
      )}
    </section>
  );
}

/* ── Öne çıkanlar ────────────────────────────────────────────────────────── */

function Highlights({ rows, optionalIds }: { rows: AnalysisSectionItem[]; optionalIds: Set<number> }) {
  const leaves = useMemo(() => {
    const parents = new Set(rows.filter(r => r.is_sub_section && r.parent_id).map(r => r.parent_id));
    return rows
      .filter(r => (r.is_sub_section || !parents.has(r.section_id)) && !optionalIds.has(r.section_id) && r.question_count > 0)
      .map(r => ({ ...r, ratio: r.ortalama_net / r.question_count }));
  }, [rows, optionalIds]);

  if (leaves.length < 2) return null;

  const strong = [...leaves].filter(r => r.ratio >= 0.6).sort((x, y) => y.ratio - x.ratio).slice(0, 3);
  const weak = [...leaves].filter(r => r.ratio < 0.5).sort((x, y) => x.ratio - y.ratio).slice(0, 3);
  const empty = [...leaves].filter(r => r.bos_orani >= 30).sort((x, y) => y.bos_orani - x.bos_orani).slice(0, 3);

  if (!strong.length && !weak.length && !empty.length) return null;

  return (
    <section className={a.highlights}>
      <div className={a.hl}>
        <h4>Güçlü dersler</h4>
        {strong.length ? strong.map(r => (
          <p key={r.section_id}><span>{r.section_name}</span><b className={a.good}>{fmtPct(r.ratio * 100)}</b></p>
        )) : <p className={a.muted}>%60 başarıyı geçen ders yok.</p>}
      </div>
      <div className={a.hl}>
        <h4>Desteklenmesi gereken</h4>
        {weak.length ? weak.map(r => (
          <p key={r.section_id}><span>{r.section_name}</span><b className={r.ratio < 0.3 ? a.bad : a.warn}>{fmtPct(r.ratio * 100)}</b></p>
        )) : <p className={a.muted}>%50 başarının altında ders yok.</p>}
      </div>
      <div className={a.hl}>
        <h4>En çok boş bırakılan</h4>
        {empty.length ? empty.map(r => (
          <p key={r.section_id}><span>{r.section_name}</span><b className={a.warn}>{fmtPct(r.bos_orani)} boş</b></p>
        )) : <p className={a.muted}>Boş oranı %30’u geçen ders yok.</p>}
      </div>
      <p className={a.hlFoot}>Başarı = ortalama net ÷ soru sayısı. Seçmeli bölümler hariç.</p>
    </section>
  );
}

/* ── Ders tablosu ────────────────────────────────────────────────────────── */

function SectionTable({ exam, rows, optionalIds }: {
  exam: ExamDetail;
  rows: AnalysisSectionItem[];
  optionalIds: Set<number>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const startOf = useMemo(() => new Map((exam.sections ?? []).map(sec => [sec.id, sec.question_start])), [exam.sections]);
  const byStart = (x: AnalysisSectionItem, y: AnalysisSectionItem) =>
    (startOf.get(x.section_id) ?? 0) - (startOf.get(y.section_id) ?? 0);
  const mains = rows.filter(r => !r.is_sub_section).sort(byStart);
  const subsOf = (id: number) => rows.filter(r => r.is_sub_section && r.parent_id === id).sort(byStart);

  if (!rows.length) return <div className={a.empty}><span>Ders analizi için veri yok.</span></div>;

  const renderRow = (r: AnalysisSectionItem, sub: boolean) => {
    const optional = optionalIds.has(r.section_id);
    const nobody = optional && r.ortalama_dogru + r.ortalama_yanlis === 0;
    const ratio = r.question_count ? r.ortalama_net / r.question_count : 0;
    const isOpen = open === r.section_id;
    const counted = r.dagilim.reduce((s, d) => s + d.count, 0);
    const negatives = Math.max(0, r.student_count - counted);
    const bins = negatives ? [{ label: '0 altı', count: negatives }, ...r.dagilim] : r.dagilim;
    const peak = Math.max(1, ...bins.map(d => d.count));
    const expandable = !nobody && r.dagilim.length > 0;
    const toggle = () => setOpen(isOpen ? null : r.section_id);
    return (
      <Fragment key={r.section_id}>
        <tr
          className={`${sub ? a.subRow : a.mainRow} ${expandable ? a.clickRow : ''}`}
          onClick={expandable ? toggle : undefined}
          onKeyDown={expandable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
          tabIndex={expandable ? 0 : undefined}
          aria-expanded={expandable ? isOpen : undefined}
          title={expandable ? 'Net dağılımını göster' : undefined}
        >
          <td>
            <span className={a.rowToggle}>
              <span className={a.chev} data-open={isOpen || undefined} data-hidden={!expandable || undefined}>›</span>
              {r.section_name}
              {optional && <em className={a.tag}>Seçmeli</em>}
            </span>
          </td>
          <td className={a.num}>{r.question_count}</td>
          {nobody ? (
            <td colSpan={6} className={a.dim}>Bu bölümü çözen öğrenci yok.</td>
          ) : (
            <>
              <td className={a.num}><span className={a.good}>{fmt1(r.ortalama_dogru)}</span></td>
              <td className={a.num}><span className={a.bad}>{fmt1(r.ortalama_yanlis)}</span></td>
              <td className={a.num}>{fmtPct(r.bos_orani)}</td>
              <td className={a.num}><b>{fmt(r.ortalama_net)}</b></td>
              <td className={a.ratioCell}>
                <RatioBar value={ratio} />
                <span>{fmtPct(ratio * 100)}</span>
              </td>
              <td className={`${a.num} ${a.hideSm}`}>{fmt(r.medyan_net)} · {fmt(r.max_net)}</td>
            </>
          )}
        </tr>
        {isOpen && (
          <tr className={a.distRow}>
            <td colSpan={8}>
              <div className={a.dist}>
                {bins.map(d => (
                  <div key={d.label} className={a.distBin} title={`${d.label} net: ${d.count} öğrenci`}>
                    <span className={a.distCount}>{d.count || ''}</span>
                    <span className={a.distBar}><i style={{ height: `${(d.count / peak) * 100}%` }} /></span>
                    <span className={a.distLabel}>{d.label}</span>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <section className={a.panel}>
      <header className={a.panelHead}>
        <h3>Dersler</h3>
        <span>Satıra tıklayınca net dağılımı açılır</span>
      </header>
      <div className={a.tableWrap}>
        <table className={a.table}>
          <thead>
            <tr>
              <th>Ders</th>
              <th className={a.num}>Soru</th>
              <th className={a.num}>Doğru</th>
              <th className={a.num}>Yanlış</th>
              <th className={a.num}>Boş</th>
              <th className={a.num}>Ort. net</th>
              <th>Başarı</th>
              <th className={`${a.num} ${a.hideSm}`}>Medyan · en yüksek</th>
            </tr>
          </thead>
          <tbody>
            {mains.map(main => (
              <Fragment key={main.section_id}>
                {renderRow(main, false)}
                {subsOf(main.section_id).filter(sub => norm(sub.section_name) !== norm(main.section_name)).map(sub => renderRow(sub, true))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Önceki sınavlar ─────────────────────────────────────────────────────── */

function History({ exam, list }: { exam: ExamDetail; list: ComparisonItem[] }) {
  const current = list.find(c => c.is_current);
  if (list.length < 2 || !current) {
    return (
      <section className={a.panel}>
        <header className={a.panelHead}><h3>Önceki sınavlarla karşılaştırma</h3></header>
        <p className={a.muted}>Karşılaştırmak için aynı türde sonucu yüklenmiş başka sınav yok.</p>
      </section>
    );
  }
  const peak = Math.max(1, ...list.map(c => c.ortalama_net));
  const mainNames = (exam.sections ?? [])
    .filter(sec => !sec.is_sub_section)
    .sort((x, y) => x.question_start - y.question_start)
    .map(sec => sec.name)
    .filter(name => list.some(c => c.section_avgs[name] != null));

  return (
    <section className={a.panel}>
      <header className={a.panelHead}>
        <h3>Önceki sınavlarla karşılaştırma</h3>
        <span>Aynı türdeki son {list.length} sınav</span>
      </header>
      <div className={a.tableWrap}>
        <table className={a.table}>
          <thead>
            <tr>
              <th>Sınav</th>
              <th className={a.num}>Katılım</th>
              <th>Ortalama net</th>
              <th className={a.num} title="Bu sınavın ortalaması eksi o sınavın ortalaması">Fark</th>
              {mainNames.map(n => <th key={n} className={`${a.num} ${a.hideSm}`}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map(c => {
              const diff = current.ortalama_net - c.ortalama_net;
              return (
                <tr key={c.exam_id} className={c.is_current ? a.currentRow : undefined}>
                  <td>
                    <div className={a.name}>{c.exam_name}</div>
                    <div className={a.meta}>{fmtDate(c.exam_date)}{c.is_current ? ' · bu sınav' : ''}</div>
                  </td>
                  <td className={a.num}>{c.katilim}</td>
                  <td className={a.ratioCell}>
                    <RatioBar value={c.ortalama_net / peak} tone={c.is_current ? 'good' : 'mid'} />
                    <span><b>{fmt(c.ortalama_net)}</b></span>
                  </td>
                  <td className={a.num}>
                    {c.is_current ? '—' : (
                      <span className={diff > 0 ? a.up : diff < 0 ? a.down : undefined}>
                        {diff > 0 ? '+' : ''}{fmt(diff)}
                      </span>
                    )}
                  </td>
                  {mainNames.map(n => (
                    <td key={n} className={`${a.num} ${a.hideSm}`}>{c.section_avgs[n] != null ? fmt(c.section_avgs[n]) : '—'}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={a.hlFoot}>Fark: bu sınavın ortalaması eksi o sınavın ortalaması. Katılan öğrenciler sınavdan sınava değişebilir.</p>
    </section>
  );
}
