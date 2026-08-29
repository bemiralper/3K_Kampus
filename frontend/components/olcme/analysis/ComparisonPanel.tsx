'use client';

import Icon from '../ui/Icon';
import { Panel, EmptyState, Tag } from '../ui/analysis';
import type { ComparisonItem } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';
import a from '../ui/analysis.module.css';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

export default function ComparisonPanel({ comparisons }: { comparisons: ComparisonItem[] }) {
  if (!comparisons.length) {
    return (
      <Panel title="Karşılaştırmalı Analiz" icon="chart">
        <EmptyState
          title="Karşılaştırma için yeterli sınav yok"
          description="Aynı türde en az iki sınavın sonucu yüklendiğinde dönemsel gelişim burada görünür."
        />
      </Panel>
    );
  }

  const allSections = Array.from(new Set(comparisons.flatMap(c => Object.keys(c.section_avgs))));
  const maxNet = Math.max(...comparisons.map(x => x.ortalama_net), 1);

  // Bu sınavın bir öncekine göre farkı — grafiğin altında yazıyla da verilir.
  const idx = comparisons.findIndex(c => c.is_current);
  const prev = idx > 0 ? comparisons[idx - 1] : null;
  const current = idx >= 0 ? comparisons[idx] : null;
  const diff = current && prev
    ? Math.round((current.ortalama_net - prev.ortalama_net) * 100) / 100
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel
        title="Dönemsel Gelişim"
        icon="chart"
        subtitle="Aynı türdeki sınavların ortalama net değişimi. Vurgulu sütun bu sınavdır."
        actions={diff != null && (
          <Tag tone={diff > 0 ? 'green' : diff < 0 ? 'red' : 'slate'}>
            <Icon name={diff > 0 ? 'chevronUp' : diff < 0 ? 'chevronDown' : 'chevronRight'} size={12} strokeWidth={3} />
            Öncekine göre {diff > 0 ? '+' : ''}{diff} net
          </Tag>
        )}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 190, paddingTop: 20 }}>
          {comparisons.map(c => {
            const pct = (c.ortalama_net / maxNet) * 100;
            return (
              <div
                key={c.exam_id}
                title={`${c.exam_name}: ${c.ortalama_net} net · ${c.katilim} katılım`}
                style={{
                  flex: 1, minWidth: 0, height: '100%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'flex-end',
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: 700, marginBottom: 4,
                  color: c.is_current ? '#1d4ed8' : '#334155',
                }}>
                  {c.ortalama_net}
                </span>
                <div style={{
                  width: '100%', maxWidth: 54,
                  height: `${Math.max(pct, 2)}%`,
                  borderRadius: '6px 6px 2px 2px',
                  background: c.is_current
                    ? 'linear-gradient(180deg,#3b82f6,#1d4ed8)'
                    : 'linear-gradient(180deg,#cbd5e1,#94a3b8)',
                  boxShadow: c.is_current ? '0 0 0 2px rgba(37,99,235,0.25)' : undefined,
                }} />
                <span style={{
                  fontSize: 11, marginTop: 8, textAlign: 'center', lineHeight: 1.35,
                  color: c.is_current ? '#1d4ed8' : '#64748b',
                  fontWeight: c.is_current ? 700 : 400,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {c.exam_name}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  {fmtDate(c.exam_date)}
                </span>
              </div>
            );
          })}
        </div>
        <div className={a.legend}>
          <span className={a.legendItem}>
            <span className={a.legendSwatch} style={{ background: '#1d4ed8' }} />
            Bu sınav
          </span>
          <span className={a.legendItem}>
            <span className={a.legendSwatch} style={{ background: '#94a3b8' }} />
            Önceki sınavlar
          </span>
        </div>
      </Panel>

      <Panel title="Sınav Kıyas Tablosu" icon="document" flush>
        <div className={s.analysisTableWrap}>
          <table className={s.analysisTable}>
            <thead>
              <tr>
                <th>Sınav</th>
                <th style={{ textAlign: 'center' }}>Tarih</th>
                <th style={{ textAlign: 'center' }}>Katılım</th>
                <th style={{ textAlign: 'center' }}>Ort. Net</th>
                <th style={{ textAlign: 'center' }}>En Düşük</th>
                <th style={{ textAlign: 'center' }}>En Yüksek</th>
                {allSections.map(sn => (
                  <th key={sn} style={{ textAlign: 'center' }}>{sn}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisons.map(c => (
                <tr key={c.exam_id} style={c.is_current ? { background: '#eff6ff' } : undefined}>
                  <td style={{ fontWeight: c.is_current ? 700 : 500 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      {c.exam_name}
                      {c.is_current && <Tag tone="blue">Bu sınav</Tag>}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{fmtDate(c.exam_date)}</td>
                  <td style={{ textAlign: 'center' }}>{c.katilim}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.ortalama_net}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{c.min_net}</td>
                  <td style={{ textAlign: 'center', color: '#16a34a' }}>{c.max_net}</td>
                  {allSections.map(sn => (
                    <td key={sn} style={{ textAlign: 'center' }}>{c.section_avgs[sn] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
