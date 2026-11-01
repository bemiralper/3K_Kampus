'use client';

import { useMemo, useState } from 'react';
import type { ExamDetail, StudentAnalysis } from '../../../../components/olcme/types';
import { LoadState, RatioBar, SortTh, type SortDir } from './analysis-ui';
import { avg, fmt, fmtPct, mainSections, median, NO_CLASS, toneVsAvg } from './analysis-utils';
import type { Resource } from './AnalysisTab';
import a from './analysis.module.css';

interface Props {
  exam: ExamDetail;
  students: Resource<StudentAnalysis[]>;
  successThreshold: number | null;
  onOpenClass: (key: string) => void;
}

interface Group {
  key: string;
  label: string;
  count: number;
  net: number;
  puan: number;
  median: number;
  max: number;
  min: number;
  success: number | null;
  sections: Record<number, number | null>;
}

type SortKey = 'label' | 'count' | 'net' | 'puan' | 'success' | `sec:${number}`;

export default function AnalysisClasses({ exam, students, successThreshold, onOpenClass }: Props) {
  const ayt = exam.exam_type === 'YKS_AYT' || exam.exam_type === 'AYT_11';
  const tests = useMemo(() => mainSections(exam.sections), [exam.sections]);
  const [sortKey, setSortKey] = useState<SortKey>('net');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { groups, overall, unmatched } = useMemo(() => {
    const rows = (students.data ?? []).filter(st => st.student_id);
    const build = (key: string, label: string, list: StudentAnalysis[]): Group => {
      const nets = list.map(st => st.alan_net ?? st.toplam_net);
      const sections: Record<number, number | null> = {};
      for (const sec of tests) {
        const vals = list
          .map(st => st.section_details.find(d => d.section_id === sec.id))
          .filter((d): d is NonNullable<typeof d> => !!d && (!ayt || d.correct + d.wrong > 0))
          .map(d => d.net);
        sections[sec.id] = vals.length ? avg(vals) : null;
      }
      return {
        key,
        label,
        count: list.length,
        net: avg(nets),
        puan: avg(list.map(st => st.puan)),
        median: median(nets),
        max: nets.length ? Math.max(...nets) : 0,
        min: nets.length ? Math.min(...nets) : 0,
        success: !ayt && successThreshold
          ? (list.filter(st => st.toplam_net >= successThreshold).length / Math.max(1, list.length)) * 100
          : null,
        sections,
      };
    };
    const byClass = new Map<string, StudentAnalysis[]>();
    for (const st of rows) {
      const key = st.sinif || NO_CLASS;
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key)!.push(st);
    }
    return {
      groups: [...byClass.entries()].map(([key, list]) => build(key, key === NO_CLASS ? 'Sınıfsız' : key, list)),
      overall: build('', 'Tüm öğrenciler', rows),
      unmatched: (students.data ?? []).length - rows.length,
    };
  }, [students.data, tests, ayt, successThreshold]);

  const sorted = useMemo(() => {
    const value = (g: Group): number | string => {
      if (sortKey === 'label') return g.label;
      if (sortKey === 'count') return g.count;
      if (sortKey === 'net') return g.net;
      if (sortKey === 'puan') return g.puan;
      if (sortKey === 'success') return g.success ?? -1;
      return g.sections[Number(sortKey.slice(4))] ?? -999;
    };
    return [...groups].sort((x, y) => {
      const vx = value(x);
      const vy = value(y);
      const cmp = typeof vx === 'string' ? vx.localeCompare(String(vy), 'tr') : vx - (vy as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [groups, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(k);
    setSortDir(k === 'label' ? 'asc' : 'desc');
  };

  const peak = Math.max(1, ...groups.map(g => g.net));
  const toneClass = (v: number | null, ref: number | null) => {
    if (v == null || ref == null) return undefined;
    const t = toneVsAvg(v, ref);
    return t > 0 ? a.heatUp : t < 0 ? a.heatDown : undefined;
  };

  return (
    <LoadState loading={students.loading} error={students.error} onRetry={students.reload} hasData={!!students.data}>
      <section className={a.panel}>
        <header className={a.panelHead}>
          <h3>Sınıflar</h3>
          <span>{groups.length} grup · satıra tıklayınca öğrencileri açılır</span>
        </header>
        {groups.length === 0 ? (
          <div className={a.empty}><span>Eşleşmiş öğrenci yok.</span></div>
        ) : (
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead>
                <tr>
                  <SortTh k="label" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.stickyA}>Sınıf</SortTh>
                  <SortTh k="count" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num}>Öğrenci</SortTh>
                  <SortTh k="net" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>{exam.exam_type === 'YKS_AYT' ? 'Ort. alan neti' : 'Ort. net'}</SortTh>
                  <th className={`${a.num} ${a.hideSm}`}>Medyan · en yüksek · en düşük</th>
                  <SortTh k="puan" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num}>Ort. puan</SortTh>
                  {!ayt && successThreshold != null && (
                    <SortTh k="success" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num} title={`${successThreshold} ve üstü net yapanların oranı`}>
                      Başarı
                    </SortTh>
                  )}
                  {tests.map(sec => (
                    <SortTh key={sec.id} k={`sec:${sec.id}` as SortKey} sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={a.num} title={`${sec.name} ortalama neti · ${sec.question_count} soru`}>
                      {sec.name}
                    </SortTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(g => (
                  <tr key={g.key} className={a.clickRow} onClick={() => onOpenClass(g.key)}>
                    <td className={`${a.stickyA} ${a.name}`}>{g.label}</td>
                    <td className={a.num}>{g.count}</td>
                    <td className={a.ratioCell}>
                      <RatioBar value={g.net / peak} tone={toneVsAvg(g.net, overall.net) > 0 ? 'good' : toneVsAvg(g.net, overall.net) < 0 ? 'bad' : 'mid'} />
                      <span><b>{fmt(g.net)}</b></span>
                    </td>
                    <td className={`${a.num} ${a.hideSm}`}>{fmt(g.median)} · {fmt(g.max)} · {fmt(g.min)}</td>
                    <td className={a.num}>{fmt(g.puan)}</td>
                    {!ayt && successThreshold != null && <td className={a.num}>{fmtPct(g.success ?? 0)}</td>}
                    {tests.map(sec => (
                      <td key={sec.id} className={`${a.num} ${toneClass(g.sections[sec.id], overall.sections[sec.id]) ?? ''}`}>
                        {g.sections[sec.id] != null ? fmt(g.sections[sec.id]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={a.stickyA}>{overall.label}</td>
                  <td className={a.num}>{overall.count}</td>
                  <td className={a.ratioCell}><span><b>{fmt(overall.net)}</b></span></td>
                  <td className={`${a.num} ${a.hideSm}`}>{fmt(overall.median)} · {fmt(overall.max)} · {fmt(overall.min)}</td>
                  <td className={a.num}>{fmt(overall.puan)}</td>
                  {!ayt && successThreshold != null && <td className={a.num}>{fmtPct(overall.success ?? 0)}</td>}
                  {tests.map(sec => (
                    <td key={sec.id} className={a.num}>{overall.sections[sec.id] != null ? fmt(overall.sections[sec.id]) : '—'}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className={a.hlFoot}>
          Yeşil ve kırmızı hücreler kurum ortalamasından en az %10 yüksek veya düşük olanlardır.
          {ayt ? ' AYT’de test ortalamaları yalnızca o testi çözen öğrencilerden hesaplanır.' : ''}
          {unmatched > 0 ? ` Eşleşmemiş ${unmatched} kayıt sınıf hesabına katılmadı.` : ''}
        </p>
      </section>
    </LoadState>
  );
}
