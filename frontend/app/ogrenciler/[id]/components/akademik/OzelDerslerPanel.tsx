'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  fetchOgrenciOzelDersOzet,
  fetchOturumlar,
  type BirebirOturum,
} from '@/lib/ozel-ders-api';
import { akademikTabHref } from '@/lib/akademik-routes';
import type { OzelDersDashboard, OzelDersInnerTab, OzelDersKart } from './types';
import './ozel-ders-ogrenci.css';

dayjs.locale('tr');

type Tone = 'green' | 'yellow' | 'red';

const INNER_TABS: { id: OzelDersInnerTab; label: string; icon: ReactNode }[] = [
  {
    id: 'ozet',
    label: 'Özet',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-6 3 3 5-8" />
      </svg>
    ),
  },
  {
    id: 'program',
    label: 'Program',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'gecmis',
    label: 'Geçmiş',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  {
    id: 'paket',
    label: 'Paket & Analiz',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
        <path d="M12 13v8" />
      </svg>
    ),
  },
];

const DURUM_ROWS: { key: string; label: string; filter?: string; telafi_durumu?: string; color: string }[] = [
  { key: 'PLANLANDI', label: 'Planlanan', filter: 'PLANLANDI', color: '#64748b' },
  { key: 'ISLENDI', label: 'İşlenen', filter: 'ISLENDI', color: '#16a34a' },
  { key: 'IPTAL', label: 'İptal', filter: 'IPTAL', color: '#dc2626' },
  { key: 'TELAFI', label: 'Telafi', color: '#2563eb' },
  { key: 'OGRENCI_GELMEDI', label: 'Öğrenci Gelmedi', filter: 'OGRENCI_GELMEDI', color: '#f59e0b' },
  { key: 'OGRETMEN_GELMEDI', label: 'Öğretmen İptal', filter: 'OGRETMEN_GELMEDI', color: '#ef4444' },
  { key: 'TELAFI_BEKLENIYOR', label: 'Telafi Bekliyor', telafi_durumu: 'BEKLENIYOR', color: '#eab308' },
  { key: 'ONLINE', label: 'Online', filter: 'ONLINE', color: '#7c3aed' },
];

type Props = {
  ogrenciId: number;
  innerTab: OzelDersInnerTab;
  onInnerTabChange: (tab: OzelDersInnerTab) => void;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return dayjs(iso).format('D MMMM YYYY');
}

function initials(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function usageTone(pct: number): Tone {
  if (pct >= 80) return 'red';
  if (pct >= 50) return 'yellow';
  return 'green';
}

function healthTone(pct: number): Tone {
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'yellow';
  return 'red';
}

const TONE_COLORS: Record<Tone, string> = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
};

function RingProgress({
  pct,
  tone,
  size = 68,
  strokeWidth = 7,
  children,
}: {
  pct: number;
  tone: Tone;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(pct, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="od-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-color, #dfe6ef)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_COLORS[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="od-ring-center">{children ?? `%${Math.round(clamped)}`}</div>
    </div>
  );
}

function Avatar({ name, size = 34 }: { name: string | null | undefined; size?: number }) {
  return (
    <div className="od-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  );
}

export default function OzelDerslerPanel({ ogrenciId, innerTab, onInnerTabChange }: Props) {
  const [data, setData] = useState<OzelDersDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branş, setBrans] = useState('');
  const [ogretmen, setOgretmen] = useState('');
  const [durum, setDurum] = useState('');
  const [selectedDers, setSelectedDers] = useState<OzelDersKart | null>(null);
  const [modal, setModal] = useState<{ title: string; items: BirebirOturum[] } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = (await fetchOgrenciOzelDersOzet(ogrenciId)) as OzelDersDashboard;
      setData(res);
      if (res.dersler?.length && !selectedDers) {
        setSelectedDers(res.dersler[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ogrenciId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDersler = useMemo(() => {
    if (!data) return [];
    return data.dersler.filter((d) => {
      if (branş && String(d.ders_id) !== branş) return false;
      if (ogretmen && String(d.ogretmen_id) !== ogretmen) return false;
      return true;
    });
  }, [data, branş, ogretmen]);

  const filteredTimeline = useMemo(() => {
    if (!data) return [];
    return data.timeline.filter((t) => {
      if (branş && String(t.ders_id) !== branş) return false;
      if (ogretmen && String(t.ogretmen_id) !== ogretmen) return false;
      if (durum) {
        if (durum.startsWith('telafi:')) return false;
        if (t.durum !== durum) return false;
      }
      return true;
    });
  }, [data, branş, ogretmen, durum]);

  const weeklyByDay = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { gun: number; label: string; slots: OzelDersDashboard['haftalik_program'] }>();
    data.haftalik_program.forEach((s) => {
      if (!map.has(s.gun_label)) map.set(s.gun_label, { gun: s.gun, label: s.gun_label, slots: [] });
      map.get(s.gun_label)!.slots.push(s);
    });
    return Array.from(map.values())
      .map((g) => ({ ...g, slots: [...g.slots].sort((a, b) => a.baslangic.localeCompare(b.baslangic)) }))
      .sort((a, b) => a.gun - b.gun);
  }, [data]);

  const dateProgressPct = useMemo(() => {
    if (!data) return null;
    const start = dayjs(data.tarihler.baslangic || undefined);
    const end = dayjs(data.tarihler.planlanan_bitis || undefined);
    if (!data.tarihler.baslangic || !data.tarihler.planlanan_bitis || !start.isValid() || !end.isValid()) {
      return null;
    }
    const total = end.diff(start, 'day');
    if (total <= 0) return null;
    const elapsed = dayjs().diff(start, 'day');
    return Math.min(Math.max((elapsed / total) * 100, 0), 100);
  }, [data]);

  const maxDurumCount = useMemo(() => {
    if (!selectedDers) return 1;
    return Math.max(1, ...DURUM_ROWS.map((r) => selectedDers.durum_counts[r.key] || 0));
  }, [selectedDers]);

  async function openDurumModal(ders: OzelDersKart, row: (typeof DURUM_ROWS)[number]) {
    setModalLoading(true);
    setModal({ title: `${ders.ders_ad} — ${row.label}`, items: [] });
    try {
      const params: Record<string, string | number> = {
        ogrenci_id: ogrenciId,
      };
      if (row.filter) params.durum = row.filter;
      if (row.telafi_durumu) params.telafi_durumu = row.telafi_durumu;
      if (row.key === 'TELAFI') params.oturum_turu = 'TELAFI';
      const list = await fetchOturumlar(params);
      const items = list.filter((o) => o.ders === ders.ders_id);
      setModal({ title: `${ders.ders_ad} — ${row.label} (${items.length})`, items });
    } catch {
      setModal({ title: `${ders.ders_ad} — ${row.label}`, items: [] });
    } finally {
      setModalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="akademik-loading">
        <div className="akademik-spinner" />
        <p>Özel ders özeti yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return <div className="alert-modern alert-error">{error}</div>;
  }

  if (!data || !data.has_data) {
    return (
      <div className="akd-placeholder">
        <div className="akd-placeholder-card">
          <div className="akd-placeholder-icon" aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-1a6 6 0 0 1 6-6h1" />
              <path d="M16 14l2.5 2.5L22 13" />
            </svg>
          </div>
          <h3>Özel ders kaydı yok</h3>
          <p>Bu öğrenci için henüz birebir program veya oturum bulunamadı.</p>
          <a
            className="akd-btn akd-btn-primary"
            href={akademikTabHref('ozel-ders-yonetimi', 'ogrenci-programlari')}
          >
            Programlara Git
          </a>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const oturumlarHref = akademikTabHref('ozel-ders-yonetimi', 'birebir-ders-oturumlari');
  const sablonHref = akademikTabHref('ozel-ders-yonetimi', 'haftalik-program-sablonlari');
  const primaryTeacherId = data.ogretmenler[0]?.current?.ogretmen_id;

  return (
    <div className="od-panel">
      <div className="od-tabs" role="tablist">
        {INNER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={innerTab === t.id}
            className={`od-tab${innerTab === t.id ? ' is-active' : ''}`}
            onClick={() => onInnerTabChange(t.id)}
          >
            <span className="od-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {(innerTab === 'ozet' || innerTab === 'gecmis') && (
        <div className="od-toolbar">
          <select className="od-select" value={branş} onChange={(e) => setBrans(e.target.value)} aria-label="Branş">
            <option value="">Tüm branşlar</option>
            {data.dersler.map((d) => (
              <option key={d.ders_id} value={String(d.ders_id)}>
                {d.ders_ad}
              </option>
            ))}
          </select>
          <select className="od-select" value={ogretmen} onChange={(e) => setOgretmen(e.target.value)} aria-label="Öğretmen">
            <option value="">Tüm öğretmenler</option>
            {Array.from(
              new Map(data.dersler.map((d) => [d.ogretmen_id, d.ogretmen_ad])).entries(),
            ).map(([id, ad]) => (
              <option key={id} value={String(id)}>
                {ad}
              </option>
            ))}
          </select>
          {innerTab === 'gecmis' && (
            <select className="od-select" value={durum} onChange={(e) => setDurum(e.target.value)} aria-label="Durum">
              <option value="">Tüm durumlar</option>
              {DURUM_ROWS.filter((r) => r.filter || r.telafi_durumu).map((r) => (
                <option key={r.key} value={r.filter || `telafi:${r.telafi_durumu}`}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ================= ÖZET ================= */}
      {innerTab === 'ozet' && (
        <div className="od-view">
          <div className="od-hero-row">
            <div className="od-hero-card">
              <RingProgress pct={k.devam_orani} tone={healthTone(k.devam_orani)} />
              <div className="od-hero-info">
                <span className="od-hero-label">Devam Oranı</span>
                <span className="od-hero-sub">{k.islenen_oturum} / {k.toplam_oturum} oturum işlendi</span>
              </div>
            </div>
            <div className="od-hero-card">
              <div className="od-hero-icon last">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <div className="od-hero-info">
                <span className="od-hero-label">Son Ders</span>
                <span className="od-hero-value">{k.son_ders ? dayjs(k.son_ders).format('D MMMM') : 'Kayıt yok'}</span>
              </div>
            </div>
            <div className="od-hero-card">
              <div className="od-hero-icon next">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <div className="od-hero-info">
                <span className="od-hero-label">Sonraki Ders</span>
                <span className="od-hero-value">{k.sonraki_ders ? dayjs(k.sonraki_ders).format('D MMMM') : 'Planlanmadı'}</span>
              </div>
            </div>
          </div>

          <div className="od-stat-strip">
            <div className="od-stat-chip">
              <span className="value">{k.toplam_ozel_ders}</span>
              <span className="label">Toplam Ders</span>
            </div>
            <div className="od-stat-chip">
              <span className="value">{k.aktif_ders}</span>
              <span className="label">Aktif Ders</span>
            </div>
            <div className="od-stat-chip">
              <span className="value">{k.toplam_saat}</span>
              <span className="label">Toplam Saat</span>
            </div>
            <div className="od-stat-chip">
              <span className="value">{k.ortalama_haftalik}</span>
              <span className="label">Haftalık Ort.</span>
            </div>
            <div className="od-stat-chip warn">
              <span className="value">{k.iptal_oturum}</span>
              <span className="label">İptal</span>
            </div>
            <div className="od-stat-chip warn">
              <span className="value">{k.telafi_bekleyen}</span>
              <span className="label">Telafi Bekleyen</span>
            </div>
          </div>

          {data.uyarilar.length > 0 && (
            <div className="od-alert-list">
              {data.uyarilar.map((u) => (
                <div key={u.code + u.message} className={`od-alert ${u.level}`}>
                  {u.message}
                </div>
              ))}
            </div>
          )}

          <div className="od-actions">
            <a className="akd-btn akd-btn-primary" href={`${oturumlarHref}?ogrenci_id=${ogrenciId}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Ders Planla
            </a>
            <a className="akd-btn" href="/admin/takvim/genel">Takvimi Aç</a>
            <button type="button" className="akd-btn" onClick={() => onInnerTabChange('gecmis')}>Geçmişi Gör</button>
            {data.programs[0] && (
              <a className="akd-btn" href={`${sablonHref}?program_id=${data.programs[0].id}&ogrenci_id=${ogrenciId}`}>
                Programı Aç
              </a>
            )}
            {primaryTeacherId ? (
              <a className="akd-btn" href={`/personel/${primaryTeacherId}`}>Öğretmene Git</a>
            ) : null}
            <button type="button" className="akd-btn" disabled title="Yakında">PDF</button>
            <button type="button" className="akd-btn" disabled title="Yakında">Yazdır</button>
            <button type="button" className="akd-btn" disabled title="Yakında">Mesaj Gönder</button>
          </div>

          <div className="od-section">
            <h3>Öğrencinin Aldığı Dersler</h3>
            <div className="od-ders-grid">
              {filteredDersler.map((d) => (
                <div key={d.ders_id} className="od-ders-card">
                  <div className="od-ders-card-head">
                    <div className="od-ders-card-title">
                      <Avatar name={d.ogretmen_ad} />
                      <div>
                        <h4>{d.ders_kisa_ad || d.ders_ad}</h4>
                        <span className="od-ders-teacher">{d.ogretmen_ad}</span>
                      </div>
                    </div>
                    <RingProgress pct={d.progress_pct} tone={(['green', 'yellow', 'red'].includes(d.progress_tone) ? d.progress_tone : 'green') as Tone} size={52} strokeWidth={5}>
                      <span style={{ fontSize: '0.7rem' }}>{d.islenen}/{d.planlanan}</span>
                    </RingProgress>
                  </div>
                  <div className="od-ders-card-meta">
                    <div className="od-meta-row">
                      <span>Durum</span>
                      <strong>{d.durum}</strong>
                    </div>
                    <div className="od-meta-row">
                      <span>Başlangıç</span>
                      <strong>{d.baslangic ? dayjs(d.baslangic).format('DD.MM.YYYY') : '—'}</strong>
                    </div>
                    <div className="od-meta-row">
                      <span>Bitiş</span>
                      <strong>{d.bitis ? dayjs(d.bitis).format('DD.MM.YYYY') : '—'}</strong>
                    </div>
                    <div className="od-meta-row">
                      <span>Kalan</span>
                      <strong>{d.kalan}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="akd-btn akd-btn-sm akd-btn-block"
                    onClick={() => {
                      setSelectedDers(d);
                      onInnerTabChange('gecmis');
                    }}
                  >
                    Detayı Gör
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= PROGRAM ================= */}
      {innerTab === 'program' && (
        <div className="od-view">
          <div className="od-section">
            <h3>Haftalık Program</h3>
            {weeklyByDay.length === 0 ? (
              <p className="od-empty-note">Aktif haftalık slot yok.</p>
            ) : (
              <div className="od-week-grid">
                {weeklyByDay.map((day) => (
                  <div key={day.label} className="od-week-col">
                    <div className="od-week-col-head">
                      <span>{day.label}</span>
                      <span className="od-week-count">{day.slots.length}</span>
                    </div>
                    <div className="od-week-col-body">
                      {day.slots.map((s) => (
                        <a
                          key={s.slot_id}
                          className="od-slot-card"
                          href={`${sablonHref}?program_id=${s.program_id}&ogrenci_id=${ogrenciId}`}
                        >
                          <span className="od-slot-time">{s.baslangic}–{s.bitis}</span>
                          <span className="od-slot-ders">{s.ders_ad}</span>
                          <span className="od-slot-teacher">{s.ogretmen_ad}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="od-section">
            <h3>Tarih Bilgileri</h3>
            {dateProgressPct !== null && (
              <div className="od-date-track">
                <div className="od-date-track-fill" style={{ width: `${dateProgressPct}%` }} />
                <span className="od-date-track-marker" style={{ left: `${dateProgressPct}%` }} />
              </div>
            )}
            <div className="od-info-grid">
              <div className="od-info-box">
                <div className="label">Başlangıç</div>
                <div className="value">{fmtDate(data.tarihler.baslangic)}</div>
              </div>
              <div className="od-info-box">
                <div className="label">Planlanan Bitiş</div>
                <div className="value">{fmtDate(data.tarihler.planlanan_bitis)}</div>
              </div>
              <div className="od-info-box">
                <div className="label">Tahmini Bitiş</div>
                <div className="value">{fmtDate(data.tarihler.tahmini_bitis)}</div>
              </div>
              <div className="od-info-box accent">
                <div className="label">Kalan Gün</div>
                <div className="value">{data.tarihler.kalan_gun}</div>
              </div>
            </div>
          </div>

          <div className="od-section">
            <h3>Öğretmen Bilgisi</h3>
            <div className="od-teacher-grid">
              {data.ogretmenler.map((og) => (
                <div key={og.ders_id} className="od-teacher-card">
                  <div className="od-teacher-card-head">
                    <Avatar name={og.current?.ogretmen_ad} size={38} />
                    <div>
                      <h4>{og.ders_ad}</h4>
                      <span className="od-ders-teacher">{og.current?.ogretmen_ad || 'Atanmadı'}</span>
                    </div>
                  </div>
                  <div className="od-ders-card-meta">
                    <div className="od-meta-row">
                      <span>Toplam Ders</span>
                      <strong>{og.toplam_ders}</strong>
                    </div>
                    <div className="od-meta-row">
                      <span>Son Ders</span>
                      <strong>{og.son_ders ? dayjs(og.son_ders).format('D MMM') : '—'}</strong>
                    </div>
                    <div className="od-meta-row">
                      <span>Sonraki</span>
                      <strong>{og.sonraki_ders ? dayjs(og.sonraki_ders).format('D MMM') : '—'}</strong>
                    </div>
                    <div className="od-meta-row">
                      <span>Ort. Devam</span>
                      <strong>%{og.ortalama_devam}</strong>
                    </div>
                  </div>
                  {og.history.length > 1 && (
                    <div className="od-teacher-history">
                      {og.history.map((h, idx) => (
                        <span key={h.ogretmen_id} className="od-history-chip">
                          {idx > 0 && '→ '}
                          {h.ogretmen_ad} ({h.ders_sayisi})
                        </span>
                      ))}
                    </div>
                  )}
                  {og.current?.ogretmen_id && (
                    <a className="akd-btn akd-btn-sm akd-btn-block" href={`/personel/${og.current.ogretmen_id}`}>
                      Öğretmene Git
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= GEÇMİŞ ================= */}
      {innerTab === 'gecmis' && (
        <div className="od-view">
          <div className="od-section">
            <h3>Ders Durum İstatistikleri</h3>
            <div className="od-ders-select">
              <select
                className="od-select"
                value={selectedDers ? String(selectedDers.ders_id) : ''}
                onChange={(e) => {
                  const d = data.dersler.find((x) => String(x.ders_id) === e.target.value);
                  setSelectedDers(d || null);
                }}
              >
                {data.dersler.map((d) => (
                  <option key={d.ders_id} value={String(d.ders_id)}>
                    {d.ders_ad}
                  </option>
                ))}
              </select>
              <span className="od-empty-note">Bir satıra tıklayınca oturum listesi açılır.</span>
            </div>

            {selectedDers && (
              <div className="od-status-list">
                {DURUM_ROWS.map((row) => {
                  const n = selectedDers.durum_counts[row.key] || 0;
                  const pct = (n / maxDurumCount) * 100;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className="od-status-row"
                      onClick={() => void openDurumModal(selectedDers, row)}
                    >
                      <span className="od-status-label">{row.label}</span>
                      <span className="od-status-bar">
                        <i style={{ width: `${pct}%`, background: row.color }} />
                      </span>
                      <span className="od-status-count">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="od-section">
            <h3>Devamsızlık</h3>
            <div className="od-stat-strip">
              <div className="od-stat-chip">
                <span className="value">{data.devamsizlik.ogrenci_gelmedi}</span>
                <span className="label">Öğrenci Gelmedi</span>
              </div>
              <div className="od-stat-chip">
                <span className="value">{data.devamsizlik.ogretmen_iptal}</span>
                <span className="label">Öğretmen İptal</span>
              </div>
              <div className="od-stat-chip">
                <span className="value">{data.devamsizlik.telafi_yapildi}</span>
                <span className="label">Telafi Yapıldı</span>
              </div>
              <div className="od-stat-chip warn">
                <span className="value">{data.devamsizlik.telafi_bekliyor}</span>
                <span className="label">Telafi Bekliyor</span>
              </div>
            </div>
          </div>

          {data.son_notlar.length > 0 && (
            <div className="od-section">
              <h3>Son Ders Notları</h3>
              <div className="od-activity-timeline">
                {data.son_notlar.map((n) => (
                  <div key={n.id} className="od-activity-item">
                    <span className="od-activity-dot note" />
                    <div className="od-activity-body">
                      <div className="od-activity-head">
                        <strong>{n.ders_ad}</strong>
                        <span className="od-activity-date">{dayjs(n.session_date).format('D MMM')}</span>
                      </div>
                      <p>{n.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="od-section">
            <h3>Ders Geçmişi</h3>
            {filteredTimeline.length === 0 ? (
              <p className="od-empty-note">Kayıt bulunamadı.</p>
            ) : (
              <div className="od-activity-timeline">
                {filteredTimeline.map((t) => (
                  <div key={t.id} className="od-activity-item">
                    <span className={`od-activity-dot${t.ok ? ' ok' : ' fail'}`} />
                    <div className="od-activity-body">
                      <div className="od-activity-head">
                        <strong>{t.ders_ad}</strong>
                        <span className="od-activity-date">{dayjs(t.session_date).format('D MMM')}</span>
                      </div>
                      <p>{t.durum_display} · {t.start_time}–{t.end_time} · {t.ogretmen_ad}</p>
                      <a className="akd-btn akd-btn-sm" href={`${oturumlarHref}?date=${t.session_date}&oturum_id=${t.id}`}>
                        Oturuma Git
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= PAKET & ANALİZ ================= */}
      {innerTab === 'paket' && (
        <div className="od-view">
          <div className="od-section">
            <h3>Paket Bilgisi{data.paket.label ? ` — ${data.paket.label}` : ''}</h3>
            <div className="od-package-hero">
              <RingProgress pct={data.paket.progress_pct} tone={usageTone(data.paket.progress_pct)} size={92} strokeWidth={9} />
              <div className="od-stat-strip compact">
                <div className="od-stat-chip">
                  <span className="value">{data.paket.satin_alinan}</span>
                  <span className="label">Satın Alınan</span>
                </div>
                <div className="od-stat-chip">
                  <span className="value">{data.paket.kullanilan}</span>
                  <span className="label">Kullanılan</span>
                </div>
                <div className="od-stat-chip">
                  <span className="value">{data.paket.kalan}</span>
                  <span className="label">Kalan</span>
                </div>
              </div>
            </div>
          </div>

          <div className="od-section">
            <h3>Performans Analizi</h3>
            <div className="od-info-grid">
              <div className="od-info-box">
                <div className="label">Toplam Devam</div>
                <div className="value">%{data.performans.toplam_devam}</div>
              </div>
              <div className="od-info-box">
                <div className="label">Son 30 Gün</div>
                <div className="value">%{data.performans.son_30_gun}</div>
                <div className="od-bar"><i style={{ width: `${data.performans.son_30_gun}%` }} /></div>
              </div>
              <div className="od-info-box">
                <div className="label">Son 90 Gün</div>
                <div className="value">%{data.performans.son_90_gun}</div>
                <div className="od-bar"><i style={{ width: `${data.performans.son_90_gun}%` }} /></div>
              </div>
              <div className="od-info-box">
                <div className="label">İptal Eğilimi</div>
                <div className="value">
                  {data.performans.iptal_egilimi === 'azaliyor'
                    ? '↓ Azalıyor'
                    : data.performans.iptal_egilimi === 'artiyor'
                      ? '↑ Artıyor'
                      : '→ Stabil'}
                </div>
              </div>
            </div>
          </div>

          <div className="od-section">
            <h3>Kazanım Takibi</h3>
            <div className="akd-placeholder-card od-note-card">
              <p>{data.kazanim.message}</p>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="od-modal-overlay" onClick={() => setModal(null)}>
          <div className="od-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modal.title}</h3>
            {modalLoading ? (
              <p>Yükleniyor…</p>
            ) : modal.items.length === 0 ? (
              <p className="od-empty-note">Kayıt yok.</p>
            ) : (
              <div className="od-modal-list">
                {modal.items.map((o) => (
                  <div key={o.id} className="od-modal-item">
                    <strong>{dayjs(o.session_date).format('DD.MM.YYYY')}</strong>
                    <div>{o.ders_ad} · {o.ogretmen_ad}</div>
                    <div className="od-empty-note">
                      {o.start_time?.slice(0, 5)}–{o.end_time?.slice(0, 5)} · {o.durum_display}
                    </div>
                    <a className="akd-btn akd-btn-sm" href={`${oturumlarHref}?date=${o.session_date}&oturum_id=${o.id}`}>
                      Oturuma git
                    </a>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="akd-btn" style={{ marginTop: 14 }} onClick={() => setModal(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
