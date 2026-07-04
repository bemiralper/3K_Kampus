'use client';

import InfoTip from './InfoTip';
import type { AnalysisSummary } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function SummaryPanel({ data, examType }: { data: AnalysisSummary; examType?: string }) {
  if (data.katilim === 0) {
    return <div className={s.analysisEmpty}>Henüz sonuç yüklenmedi. Önce &ldquo;Sonuç Yükle&rdquo; sekmesinden DAT dosyası yükleyin.</div>;
  }

  return (
    <div className={s.analysisPanel}>
      <h3 className={s.analysisPanelTitle}>{data.exam_name} — Genel Özet</h3>
      <p className={s.analysisSubtitle}>{data.exam_type_display} · {data.exam_date || '—'}</p>

      {/* Trend göstergesi */}
      {data.trend && (
        <div className={`${s.analysisTrend} ${data.trend.direction === 'up' ? s.trendUp : data.trend.direction === 'down' ? s.trendDown : ''}`}>
          <span className={s.trendIcon}>{data.trend.direction === 'up' ? '📈' : data.trend.direction === 'down' ? '📉' : '➡️'}</span>
          <span>
            Önceki sınava ({data.trend.prev_exam_name}) göre{' '}
            <strong>{data.trend.diff > 0 ? '+' : ''}{data.trend.diff}</strong> net{' '}
            {data.trend.direction === 'up' ? 'artış' : data.trend.direction === 'down' ? 'düşüş' : 'değişim yok'}
          </span>
        </div>
      )}

      {/* Metrik kartları */}
      <div className={s.analysisGrid4}>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue}>{data.katilim}</div>
          <div className={s.analysisStatLabel}>Katılım</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#0262a7' }}>{data.ortalama_net}</div>
          <div className={s.analysisStatLabel}>Ortalama Net</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#7c3aed' }}>{data.medyan_net}</div>
          <div className={s.analysisStatLabel}>Medyan Net <InfoTip tip="medyan" /></div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#059669' }}>{data.ortalama_puan}</div>
          <div className={s.analysisStatLabel}>Ortalama Puan</div>
        </div>
      </div>

      <div className={s.analysisGrid4}>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#16a34a' }}>{data.max_net}</div>
          <div className={s.analysisStatLabel}>En Yüksek Net</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#ef4444' }}>{data.min_net}</div>
          <div className={s.analysisStatLabel}>En Düşük Net</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue}>{data.max_puan}</div>
          <div className={s.analysisStatLabel}>En Yüksek Puan</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue}>{data.min_puan}</div>
          <div className={s.analysisStatLabel}>En Düşük Puan</div>
        </div>
      </div>

      <div className={s.analysisGrid3}>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue}>{data.std_sapma_net}</div>
          <div className={s.analysisStatLabel}>Standart Sapma (Net) <InfoTip tip="stdSapma" /></div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue}>{data.std_sapma_puan}</div>
          <div className={s.analysisStatLabel}>Standart Sapma (Puan) <InfoTip tip="stdSapma" /></div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: data.basari_yuzdesi >= 50 ? '#16a34a' : '#ef4444' }}>
            %{data.basari_yuzdesi}
          </div>
          <div className={s.analysisStatLabel}>Başarı Yüzdesi ({data.basari_esik}+ net) <InfoTip tip="basariYuzdesi" /></div>
        </div>
      </div>

      {/* AYT Puan Türleri (SAY / EA / SÖZ) */}
      {examType !== 'YKS_TYT' && data.puan_turleri && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: '#334155' }}>
            📐 AYT Puan Türleri
            {data.linked_tyt_exam && (
              <span style={{ fontWeight: 400, fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                (TYT bağlantılı: {data.linked_tyt_exam.name})
              </span>
            )}
          </h4>
          <div className={s.analysisGrid3}>
            {(['SAY', 'EA', 'SOZ'] as const).map(pt => {
              const d = data.puan_turleri![pt];
              const label = pt === 'SOZ' ? 'SÖZ' : pt;
              const color = pt === 'SAY' ? '#0262a7' : pt === 'EA' ? '#7c3aed' : '#059669';
              return (
                <div key={pt} className={s.analysisStatCard} style={{ borderLeft: `4px solid ${color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div className={s.analysisStatLabel} style={{ fontWeight: 700, fontSize: 14, color }}>{label} Puanı</div>
                  </div>
                  <div className={s.analysisStatValue} style={{ color, fontSize: 28 }}>{d.ortalama}</div>
                  <div className={s.analysisStatLabel}>Ortalama</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#64748b' }}>
                    <span>Max: <strong style={{ color: '#16a34a' }}>{d.max}</strong></span>
                    <span>Min: <strong style={{ color: '#ef4444' }}>{d.min}</strong></span>
                    <span>SS: <strong>{d.std_sapma}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
