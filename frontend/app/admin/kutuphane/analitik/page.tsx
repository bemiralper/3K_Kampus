'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchGlobalAnalytics,
  type GlobalAnalyticsData,
} from '@/lib/kutuphane-api';

/* ════════════════════════════════════════
   YARDIMCI FONKSİYONLAR
   ════════════════════════════════════════ */

function formatDate(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

/* ════════════════════════════════════════
   KPI KART
   ════════════════════════════════════════ */
function KpiCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '20px 22px', border: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}40)` }} />
      <div style={{
        width: 46, height: 46, borderRadius: 14, background: `${color}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   TREND CHART (SVG Line/Area)
   ════════════════════════════════════════ */
function TrendChart({ data, color, height = 180 }: {
  data: { tarih: string; katilim: number; toplam: number; var: number; gec: number }[];
  color: string; height?: number;
}) {
  if (!data?.length) return <EmptyState text="Trend verisi yok" />;

  const W = 600;
  const H = height;
  const PAD = { top: 20, right: 10, bottom: 30, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map(d => d.katilim), 100);
  const minVal = Math.min(...data.map(d => d.katilim), 0);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: PAD.left + (i / Math.max(data.length - 1, 1)) * innerW,
    y: PAD.top + innerH - ((d.katilim - minVal) / range) * innerH,
    ...d,
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${points[points.length - 1].x},${PAD.top + innerH} L${points[0].x},${PAD.top + innerH} Z`;

  const yTicks = [0, 25, 50, 75, 100].filter(v => v <= maxVal + 5);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {yTicks.map(v => {
        const y = PAD.top + innerH - ((v - minVal) / range) * innerH;
        return (
          <g key={v}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill="#9ca3af" fontSize={10}>%{v}</text>
          </g>
        );
      })}
      <path d={area} fill={`${color}15`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={color} strokeWidth={2} />
          {(data.length <= 15 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) && (
            <text x={p.x} y={H - 6} textAnchor="middle" fill="#9ca3af" fontSize={9}>
              {formatDate(p.tarih)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ════════════════════════════════════════
   DONUT CHART
   ════════════════════════════════════════ */
function DonutChart({ segments, centerLabel, centerValue, size = 140 }: {
  segments: { label: string; value: number; color: string }[];
  centerLabel?: string; centerValue?: string | number; size?: number;
}) {
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - 30) / 2;
  const circ = 2 * Math.PI * r;
  let cumPct = 0;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.filter(s => s.value > 0).map((s, i) => {
          const pctVal = s.value / total;
          const offset = cumPct;
          cumPct += pctVal;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
              strokeWidth={18} strokeDasharray={`${circ * pctVal} ${circ * (1 - pctVal)}`}
              strokeDashoffset={-circ * offset} transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.5s ease-out' }} />
          );
        })}
        {centerValue !== undefined && (
          <>
            <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 22, fontWeight: 800, fill: '#111827' }}>{centerValue}</text>
            {centerLabel && (
              <text x={cx} y={cy + 16} textAnchor="middle"
                style={{ fontSize: 10, fill: '#9ca3af' }}>{centerLabel}</text>
            )}
          </>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        {segments.filter(s => s.value > 0).map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
              {s.label} <span style={{ fontWeight: 700 }}>({s.value})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   PROGRESS RING
   ════════════════════════════════════════ */
function ProgressRing({ value, max = 100, color, size = 44 }: {
  value: number; max?: number; color: string; size?: number;
}) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = Math.min(value / (max || 1), 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${circ * ratio} ${circ * (1 - ratio)}`}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.5s ease-out' }} />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 11, fontWeight: 700, fill: '#374151' }}>%{Math.round(ratio * 100)}</text>
    </svg>
  );
}

/* ════════════════════════════════════════
   EMPTY STATE
   ════════════════════════════════════════ */
function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
      {text}
    </div>
  );
}

/* ════════════════════════════════════════
   SECTION CARD
   ════════════════════════════════════════ */
function SectionCard({ title, icon, children }: {
  title: string; icon: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>{title}</h3>
      </div>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   QUICK PRESETS
   ════════════════════════════════════════ */
const DATE_PRESETS = [
  { label: 'Son 7 Gün', days: 7 },
  { label: 'Son 14 Gün', days: 14 },
  { label: 'Son 30 Gün', days: 30 },
  { label: 'Son 90 Gün', days: 90 },
];

/* ════════════════════════════════════════
   ANA SAYFA
   ════════════════════════════════════════ */
export default function AnalitikPage() {
  const [data, setData] = useState<GlobalAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState(2);
  const [customRange, setCustomRange] = useState({ baslangic: '', bitis: '' });
  const [sortCol, setSortCol] = useState<string>('doluluk_yuzde');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadData = async (baslangic?: string, bitis?: string) => {
    setLoading(true);
    try {
      const params: { baslangic?: string; bitis?: string } = {};
      if (baslangic) params.baslangic = baslangic;
      if (bitis) params.bitis = bitis;
      const res = await fetchGlobalAnalytics(params);
      if (res.success && res.data) {
        setData(res.data as GlobalAnalyticsData);
      }
    } catch (e) {
      console.error('Analytics error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const days = DATE_PRESETS[activePreset]?.days ?? 30;
    const bitis = new Date();
    const baslangic = new Date();
    baslangic.setDate(baslangic.getDate() - days);
    loadData(baslangic.toISOString().split('T')[0], bitis.toISOString().split('T')[0]);
  }, [activePreset]);

  const handleCustomSearch = () => {
    if (customRange.baslangic && customRange.bitis) {
      setActivePreset(-1);
      loadData(customRange.baslangic, customRange.bitis);
    }
  };

  const sortedSalonlar = useMemo(() => {
    if (!data?.salonlar) return [];
    return [...data.salonlar].sort((a: any, b: any) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [data?.salonlar, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: string }) => (
    <span style={{ fontSize: 10, marginLeft: 3, opacity: sortCol === col ? 1 : 0.3 }}>
      {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </span>
  );

  if (loading && !data) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1.5s linear infinite' }}>⏳</div>
        <p>Analitik verileri yükleniyor...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 8px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 Kütüphane Analitik
          </h1>
          {data?.tarih_araligi && (
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
              {formatDate(data.tarih_araligi.baslangic)} — {formatDate(data.tarih_araligi.bitis)} arası veriler
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {DATE_PRESETS.map((p, i) => (
            <button key={i} onClick={() => { setActivePreset(i); setCustomRange({ baslangic: '', bitis: '' }); }}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid',
                borderColor: activePreset === i ? '#6366f1' : '#e5e7eb',
                background: activePreset === i ? '#6366f1' : '#fff',
                color: activePreset === i ? '#fff' : '#374151',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {p.label}
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <input type="date" value={customRange.baslangic}
              onChange={e => setCustomRange(r => ({ ...r, baslangic: e.target.value }))}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
            <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
            <input type="date" value={customRange.bitis}
              onChange={e => setCustomRange(r => ({ ...r, bitis: e.target.value }))}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
            <button onClick={handleCustomSearch}
              style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid #6366f1',
                background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
              Ara
            </button>
          </div>
        </div>
      </div>

      {!data ? (
        <div style={{
          padding: 48, textAlign: 'center', color: '#6b7280',
          background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Henüz veri yok</h3>
          <p style={{ fontSize: 14 }}>Analitik verisi oluşması için işlem yapılması gerekiyor.</p>
        </div>
      ) : (
        <>
          {/* ─── ROW 1: KPI KARTLARI ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 22 }}>
            <KpiCard icon="🏛️" label="Aktif Salon" value={data.toplam_salon} color="#6366f1" />
            <KpiCard icon="💺" label="Doluluk" value={`%${data.doluluk_yuzde}`}
              sub={`${data.dolu_masa}/${data.toplam_masa} masa`} color="#10b981" />
            <KpiCard icon="📋" label="Aktif Atama" value={data.atama?.aktif ?? 0}
              sub={`${data.atama?.toplam ?? 0} toplam`} color="#8b5cf6" />
            <KpiCard icon="✅" label="Katılım Oranı" value={`%${data.yoklama?.katilim_orani ?? 0}`}
              sub={`${data.yoklama?.toplam_oturum ?? 0} oturum`} color="#f59e0b" />
            <KpiCard icon="🎒" label="Aktif Öğrenci" value={data.aktif_ogrenci}
              sub={`${data.gecici_oturma} geçici`} color="#ef4444" />
          </div>

          {/* ─── ROW 2: TREND + YOKLAMA DAĞILIMI ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 22 }}>
            <SectionCard title="Katılım Trendi" icon="📈">
              <TrendChart
                data={data.yoklama?.gunluk_trend || []}
                color="#6366f1"
              />
              {data.yoklama?.gunluk_trend && data.yoklama.gunluk_trend.length > 0 && (
                <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>En Yüksek</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                      %{Math.max(...data.yoklama.gunluk_trend.map(d => d.katilim))}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>En Düşük</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>
                      %{Math.min(...data.yoklama.gunluk_trend.map(d => d.katilim))}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Ortalama</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#6366f1' }}>
                      %{(data.yoklama.gunluk_trend.reduce((s, d) => s + d.katilim, 0) / data.yoklama.gunluk_trend.length).toFixed(1)}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Yoklama Dağılımı" icon="📋">
              <DonutChart
                segments={(data.yoklama?.durum_dagilimi || []).map(d => ({
                  label: d.durum, value: d.sayi, color: d.renk,
                }))}
                centerValue={data.yoklama?.toplam_kayit ?? 0}
                centerLabel="kayıt"
              />
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16,
                padding: '12px 0 0', borderTop: '1px solid #f3f4f6',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Toplam Oturum</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1' }}>{data.yoklama?.toplam_oturum ?? 0}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Geç Gelme</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{data.yoklama?.gec_sayisi ?? 0}</div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* ─── ROW 3: MASA TİPİ + DOLAP + ATAMA ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 22 }}>
            <SectionCard title="Masa Tipi Dağılımı" icon="📐">
              <DonutChart
                segments={(data.masa_tipi_dagilimi || []).map((d, i) => ({
                  label: d.tip,
                  value: d.sayi,
                  color: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][i % 6],
                }))}
                centerValue={data.toplam_masa}
                centerLabel="masa"
                size={120}
              />
            </SectionCard>

            <SectionCard title="Dolap Durumu" icon="🔒">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                  <ProgressRing value={data.atanmis_dolap} max={data.toplam_dolap} color="#8b5cf6" size={80} />
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>{data.atanmis_dolap}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>/ {data.toplam_dolap} atanmış</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Boş</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{data.toplam_dolap - data.atanmis_dolap}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Dolu</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#8b5cf6' }}>{data.atanmis_dolap}</div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Atama Özeti" icon="📑">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Toplam Atama', value: data.atama?.toplam ?? 0, color: '#6366f1', icon: '📊' },
                  { label: 'Aktif Atama', value: data.atama?.aktif ?? 0, color: '#10b981', icon: '✅' },
                  { label: 'Sonlanan', value: data.atama?.sonlanan ?? 0, color: '#6b7280', icon: '⏹️' },
                  { label: 'Geçici Oturma', value: data.gecici_oturma, color: '#f59e0b', icon: '⏱️' },
                ].map(item => (
                  <div key={item.label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: '#f9fafb', borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{item.icon}</span>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* ─── ROW 4: SALON KARŞILAŞTIRMA TABLOSU ─── */}
          {data.salonlar && data.salonlar.length > 0 && (
            <SectionCard title="Salon Karşılaştırması" icon="🏛️">
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={thStyle}>Salon</th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('doluluk_yuzde')}>
                        Doluluk <SortIcon col="doluluk_yuzde" />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('aktif_atama')}>
                        Aktif Atama <SortIcon col="aktif_atama" />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('katilim_orani')}>
                        Katılım <SortIcon col="katilim_orani" />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('toplam_oturum')}>
                        Oturum <SortIcon col="toplam_oturum" />
                      </th>
                      <th style={thStyle}>Masa</th>
                      <th style={thStyle}>Dolap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSalonlar.map((salon) => {
                      const dolColor = salon.doluluk_yuzde > 80 ? '#ef4444' : salon.doluluk_yuzde > 50 ? '#f59e0b' : '#10b981';
                      const katColor = salon.katilim_orani > 80 ? '#10b981' : salon.katilim_orani > 50 ? '#f59e0b' : '#ef4444';
                      return (
                        <tr key={salon.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: salon.durum === 'ACTIVE' ? '#10b981' : '#ef4444',
                              }} />
                              <span style={{ fontWeight: 600, color: '#111827' }}>{salon.ad}</span>
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>({salon.kod})</span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                              <div style={{ width: 56, height: 7, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.min(salon.doluluk_yuzde, 100)}%`, height: '100%',
                                  background: dolColor, borderRadius: 4, transition: 'width 0.3s',
                                }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: dolColor, minWidth: 36, textAlign: 'right' }}>
                                %{salon.doluluk_yuzde}
                              </span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#8b5cf6' }}>
                            {salon.aktif_atama}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{
                              fontWeight: 700, color: katColor, padding: '2px 8px', borderRadius: 6,
                              background: `${katColor}12`,
                            }}>
                              %{salon.katilim_orani}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#374151' }}>
                            {salon.toplam_oturum}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{ fontSize: 13, color: '#374151' }}>
                              {salon.dolu_masa}/{salon.toplam_masa}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{ fontSize: 13, color: '#374151' }}>
                              {salon.atanmis_dolap}/{salon.toplam_dolap}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   TABLE STYLES
   ════════════════════════════════════════ */
const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
  whiteSpace: 'nowrap', userSelect: 'none',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: 14, whiteSpace: 'nowrap',
};
