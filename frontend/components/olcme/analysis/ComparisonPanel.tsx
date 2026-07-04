'use client';

import type { ComparisonItem } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function ComparisonPanel({ comparisons }: { comparisons: ComparisonItem[] }) {
  if (!comparisons.length) return <div className={s.analysisEmpty}>Karşılaştırma için yeterli sınav verisi yok.</div>;

  const allSections = Array.from(new Set(comparisons.flatMap(c => Object.keys(c.section_avgs))));

  return (
    <div className={s.analysisPanel}>
      <h3 className={s.analysisPanelTitle}>Karşılaştırmalı Analiz</h3>

      {/* Trend chart */}
      <div className={s.comparisonChart}>
        {comparisons.map(c => {
          const maxNet = Math.max(...comparisons.map(x => x.ortalama_net), 1);
          const pct = (c.ortalama_net / maxNet) * 100;
          return (
            <div key={c.exam_id} className={`${s.comparisonItem} ${c.is_current ? s.comparisonCurrent : ''}`}>
              <div className={s.comparisonBar}>
                <div className={s.comparisonBarFill} style={{ height: `${pct}%` }} />
              </div>
              <div className={s.comparisonVal}>{c.ortalama_net}</div>
              <div className={s.comparisonLabel}>{c.exam_name}</div>
              <div className={s.comparisonDate}>{c.exam_date || '—'}</div>
            </div>
          );
        })}
      </div>

      {/* Detay tablosu */}
      <div className={s.analysisTableWrap} style={{ marginTop: 20 }}>
        <table className={s.analysisTable}>
          <thead>
            <tr>
              <th>Sınav</th>
              <th style={{ textAlign: 'center' }}>Tarih</th>
              <th style={{ textAlign: 'center' }}>Katılım</th>
              <th style={{ textAlign: 'center' }}>Ort. Net</th>
              <th style={{ textAlign: 'center' }}>Maks Net</th>
              <th style={{ textAlign: 'center' }}>Min Net</th>
              {allSections.map(sn => <th key={sn} style={{ textAlign: 'center' }}>{sn}</th>)}
            </tr>
          </thead>
          <tbody>
            {comparisons.map(c => (
              <tr key={c.exam_id} style={c.is_current ? { background: '#eff6ff', fontWeight: 600 } : {}}>
                <td>
                  {c.is_current ? '👉 ' : ''}{c.exam_name}
                </td>
                <td style={{ textAlign: 'center' }}>{c.exam_date || '—'}</td>
                <td style={{ textAlign: 'center' }}>{c.katilim}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.ortalama_net}</td>
                <td style={{ textAlign: 'center', color: '#16a34a' }}>{c.max_net}</td>
                <td style={{ textAlign: 'center', color: '#ef4444' }}>{c.min_net}</td>
                {allSections.map(sn => (
                  <td key={sn} style={{ textAlign: 'center' }}>{c.section_avgs[sn] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
