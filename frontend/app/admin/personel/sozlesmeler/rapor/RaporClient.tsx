'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useKurum } from '@/lib/contexts/KurumContext';
import { AY_ADLARI } from '../types';
import { fetchYillikRapor, type YillikRapor, type YillikRaporAylik } from '../services/api';
import styles from './rapor.module.css';

type Kapsam = 'yillik' | 'donem' | 'aylar';

const AY_KISA: Record<number, string> = {
  1: 'Oca', 2: 'Şub', 3: 'Mar', 4: 'Nis', 5: 'May', 6: 'Haz',
  7: 'Tem', 8: 'Ağu', 9: 'Eyl', 10: 'Eki', 11: 'Kas', 12: 'Ara',
};

const DONEMLER = [
  { id: '1', ad: '1. Dönem', aralik: 'Eylül – Ocak' },
  { id: '2', ad: '2. Dönem', aralik: 'Şubat – Haziran' },
  { id: 'yaz', ad: 'Yaz dönemi', aralik: 'Temmuz – Ağustos' },
] as const;

const PARCALAR: { key: keyof YillikRaporAylik; name: string; color: string }[] = [
  { key: 'sabit_maas_toplam', name: 'Sabit maaş', color: '#0262a7' },
  { key: 'ders_ucret_toplam', name: 'Ders ücreti', color: '#0d9488' },
  { key: 'ozel_ders_toplam', name: 'Özel ders', color: '#db2777' },
  { key: 'prim_toplam', name: 'Prim', color: '#d97706' },
  { key: 'fazla_mesai_toplam', name: 'Fazla mesai', color: '#7c3aed' },
  { key: 'ek_odeme_toplam', name: 'Ek ödeme', color: '#0891b2' },
];

const TUR_AD: Record<string, string> = {
  TAM_ZAMANLI: 'Tam zamanlı',
  DERS_UCRETLI: 'Ders ücretli',
  KARMA: 'Karma',
};
const TUR_RENK: Record<string, string> = {
  TAM_ZAMANLI: '#0262a7',
  DERS_UCRETLI: '#7c3aed',
  KARMA: '#0d9488',
};
const DURUM_AD: Record<string, string> = {
  HESAPLANDI: 'Hesaplandı',
  ONAYLANDI: 'Onaylandı',
  ODENDI: 'Ödendi',
  IPTAL: 'İptal',
};
const DURUM_RENK: Record<string, string> = {
  HESAPLANDI: '#0284c7',
  ONAYLANDI: '#d97706',
  ODENDI: '#0f766e',
  IPTAL: '#e11d48',
};

const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtKompakt = (n: number) =>
  new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

const fmtSayi = (n: number) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n || 0);

type AySecim = { yil: number; ay: number; key: string; kisa: string; tam: string };

function egitimAylari(baslangic: number, bitis: number): AySecim[] {
  const kayit = (yil: number, ay: number): AySecim => ({
    yil,
    ay,
    key: `${yil}-${String(ay).padStart(2, '0')}`,
    kisa: AY_KISA[ay],
    tam: `${AY_ADLARI[ay]} ${yil}`,
  });
  const liste: AySecim[] = [];
  for (let ay = 9; ay <= 12; ay += 1) liste.push(kayit(baslangic, ay));
  for (let ay = 1; ay <= 8; ay += 1) liste.push(kayit(bitis, ay));
  return liste;
}

function hucre(n: number, negatif = false) {
  if (!n) return <span className={styles.muted}>—</span>;
  return <span className={negatif ? styles.neg : undefined}>{fmtPara(n)}</span>;
}

function ChartTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: YillikRaporAylik }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className={styles.tip}>
      <div className={styles.tipTitle}>
        {row ? `${row.ay_adi} ${row.yil}` : ''}
        {row && row.personel_sayisi > 0 ? ` · ${row.personel_sayisi} kişi` : ''}
      </div>
      {payload.map((p) => (
        <div key={p.name} className={styles.tipRow}>
          <span>{p.name}</span>
          <strong>{fmtPara(Number(p.value || 0))}</strong>
        </div>
      ))}
    </div>
  );
}

function Spark({ data, dataKey, color }: { data: YillikRaporAylik[]; dataKey: 'brut_toplam' | 'net_toplam'; color: string }) {
  const id = `spark-${dataKey}`;
  return (
    <div className={styles.spark}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.75} fill={`url(#${id})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RaporClient() {
  const router = useRouter();
  const { activeSube, activeEgitimYili, egitimYillari, initialized } = useKurum();
  const [yilId, setYilId] = useState<number | null>(null);
  const [kapsam, setKapsam] = useState<Kapsam>('yillik');
  const [donem, setDonem] = useState<'1' | '2' | 'yaz'>('1');
  const [aylar, setAylar] = useState<string[]>([]);
  const [rapor, setRapor] = useState<YillikRapor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeEgitimYili?.id) setYilId(activeEgitimYili.id);
  }, [activeEgitimYili?.id]);

  const secili = useMemo(
    () => egitimYillari.find((y) => y.id === yilId) || activeEgitimYili,
    [egitimYillari, yilId, activeEgitimYili],
  );

  const ayListesi = useMemo(
    () => (secili ? egitimAylari(secili.baslangic_yil, secili.bitis_yil) : []),
    [secili],
  );

  useEffect(() => {
    setKapsam('yillik');
    setDonem('1');
    if (secili) {
      setAylar(egitimAylari(secili.baslangic_yil, secili.bitis_yil).map((a) => a.key));
    }
  }, [secili?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!initialized || !activeSube?.id || !yilId) return;
    if (kapsam === 'aylar' && aylar.length === 0) {
      setRapor(null);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchYillikRapor({
        egitim_yili_id: yilId,
        kapsam,
        donem: kapsam === 'donem' ? donem : undefined,
        aylar: kapsam === 'aylar' ? aylar.join(',') : undefined,
      });
      if (res.success && res.data) setRapor(res.data);
      else {
        setRapor(null);
        setError(res.error || 'Rapor yüklenemedi.');
      }
    } catch (err) {
      setRapor(null);
      setError(err instanceof Error ? err.message : 'Rapor yüklenemedi.');
    }
    setLoading(false);
  }, [initialized, activeSube?.id, yilId, kapsam, donem, aylar]);

  useEffect(() => { load(); }, [load]);

  const parcalar = useMemo(() => {
    if (!rapor) return [];
    return PARCALAR.filter((p) => rapor.aylik.some((a) => Number(a[p.key] || 0) > 0));
  }, [rapor]);

  const turler = useMemo(() => {
    if (!rapor) return [];
    return rapor.tur_dagilimi
      .filter((t) => t.toplam_brut > 0 || t.kisi_sayisi > 0)
      .map((t) => ({
        ...t,
        label: TUR_AD[t.tur] || t.tur,
        color: TUR_RENK[t.tur] || '#64748b',
      }));
  }, [rapor]);

  const durumlar = useMemo(() => rapor?.durum_dagilimi.filter((d) => d.sayi > 0) ?? [], [rapor]);
  const durumMax = Math.max(...durumlar.map((d) => d.toplam), 1);
  const turToplam = turler.reduce((s, t) => s + t.toplam_brut, 0);
  const dolu = rapor ? rapor.aylik.some((a) => a.brut_toplam > 0 || a.net_toplam > 0) : false;

  const netDelta = useMemo(() => {
    if (!rapor) return null;
    const doluAylar = rapor.aylik.filter((a) => a.net_toplam > 0 || a.brut_toplam > 0);
    if (doluAylar.length < 2) return null;
    const son = doluAylar[doluAylar.length - 1];
    const once = doluAylar[doluAylar.length - 2];
    if (!once.net_toplam) return null;
    const pct = ((son.net_toplam - once.net_toplam) / once.net_toplam) * 100;
    return { pct, ay: `${AY_KISA[once.ay]} → ${AY_KISA[son.ay]}` };
  }, [rapor]);

  const kesintiToplam = rapor
    ? rapor.aylik.reduce((s, a) => s + a.avans_toplam + a.kesinti_toplam, 0)
    : 0;

  function chooseKapsam(next: Kapsam) {
    setKapsam(next);
    if (next === 'aylar' && aylar.length === 0 && ayListesi.length) {
      setAylar(ayListesi.map((a) => a.key));
    }
  }

  function toggleAy(key: string) {
    setAylar((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const kapsamYazi = rapor
    ? [rapor.egitim_yili, rapor.donem_adi || (rapor.kapsam === 'aylar' ? `${rapor.ay_sayisi} ay` : 'Yıllık'), rapor.aralik]
        .filter(Boolean)
        .join(' · ')
    : secili
      ? `${secili.baslangic_yil}–${secili.bitis_yil}`
      : '';

  const yillar = useMemo(() => {
    const liste = [...egitimYillari];
    if (secili && !liste.some((y) => y.id === secili.id)) liste.unshift(secili);
    return liste.sort((a, b) => b.baslangic_yil - a.baslangic_yil);
  }, [egitimYillari, secili]);

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <p className={styles.kicker}>{activeSube?.ad || 'Personel'}</p>
          <h1 className={styles.title}>Maliyet raporu</h1>
          <p className={styles.lede}>{kapsamYazi || 'Eğitim yılı personel gideri'}</p>
        </div>
        <button type="button" className={styles.back} onClick={() => router.push('/admin/personel/sozlesmeler')}>
          Sözleşmelere dön
        </button>
      </header>

      <section className={styles.filters}>
        <div className={styles.filterRow}>
          <select
            className={styles.select}
            aria-label="Eğitim yılı"
            value={yilId ?? ''}
            onChange={(e) => setYilId(Number(e.target.value))}
          >
            {yillar.map((y) => (
              <option key={y.id} value={y.id}>
                {y.baslangic_yil}–{y.bitis_yil}
                {y.id === activeEgitimYili?.id ? ' · aktif dönem' : ''}
              </option>
            ))}
          </select>
          <div className={styles.modes} role="tablist" aria-label="Aralık">
            {([
              ['yillik', 'Yıllık'],
              ['donem', 'Dönem'],
              ['aylar', 'Aylar'],
            ] as const).map(([id, ad]) => (
              <button
                key={id}
                type="button"
                className={`${styles.mode} ${kapsam === id ? styles.modeOn : ''}`}
                onClick={() => chooseKapsam(id)}
              >
                {ad}
              </button>
            ))}
          </div>
        </div>

        {kapsam === 'donem' && (
          <div className={styles.donemler}>
            {DONEMLER.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`${styles.donem} ${donem === d.id ? styles.donemOn : ''}`}
                onClick={() => setDonem(d.id)}
              >
                <strong>{d.ad}</strong>
                <span>{d.aralik}</span>
              </button>
            ))}
          </div>
        )}

        {kapsam === 'aylar' && (
          <div>
            <div className={styles.monthsHead}>
              <p>Eğitim yılı içinden görmek istediğiniz ayları seçin.</p>
              <span>
                <button type="button" className={styles.linkBtn} onClick={() => setAylar(ayListesi.map((a) => a.key))}>
                  Tümü
                </button>
                {' · '}
                <button type="button" className={styles.linkBtn} onClick={() => setAylar([])}>
                  Temizle
                </button>
              </span>
            </div>
            <div className={styles.months}>
              {ayListesi.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className={`${styles.month} ${aylar.includes(a.key) ? styles.monthOn : ''}`}
                  onClick={() => toggleAy(a.key)}
                  aria-pressed={aylar.includes(a.key)}
                >
                  {a.kisa} {String(a.yil).slice(2)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && <div className={styles.error}>{error}</div>}

      {loading && !rapor ? (
        <div className={styles.loading}>Rapor hazırlanıyor…</div>
      ) : !rapor ? (
        <div className={styles.empty}>
          {kapsam === 'aylar' && aylar.length === 0
            ? 'Görmek istediğiniz ayları seçin.'
            : 'Bu aralık için rapor verisi yok.'}
        </div>
      ) : (
        <div className={loading ? styles.busy : undefined}>
          <section className={styles.kpis}>
            <article className={styles.kpi}>
              <div className={styles.kpiLabel}>Brüt maliyet</div>
              <div className={styles.kpiValue}>{fmtPara(rapor.genel_brut)}</div>
              <div className={styles.kpiHint}>{rapor.genel_kisi} kişi · {rapor.ay_sayisi} ay</div>
              {dolu && <Spark data={rapor.aylik} dataKey="brut_toplam" color="#0262a7" />}
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiLabel}>Net ödeme</div>
              <div className={styles.kpiValue}>{fmtPara(rapor.genel_net)}</div>
              <div className={styles.kpiHint}>
                {netDelta ? (
                  <span className={netDelta.pct >= 0 ? styles.up : styles.down}>
                    {netDelta.pct >= 0 ? '+' : ''}{netDelta.pct.toFixed(0)}% {netDelta.ay}
                  </span>
                ) : 'Avans ve kesintiler düşülmüş'}
              </div>
              {dolu && <Spark data={rapor.aylik} dataKey="net_toplam" color="#0f766e" />}
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiLabel}>Avans ve kesinti</div>
              <div className={styles.kpiValue}>{fmtPara(kesintiToplam)}</div>
              <div className={styles.kpiHint}>Brüt ile net arasındaki fark</div>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiLabel}>Ders saati</div>
              <div className={styles.kpiValue}>{fmtSayi(rapor.genel_ders_saat)}</div>
              <div className={styles.kpiHint}>Seçilen aralıktaki toplam saat</div>
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Aylık brüt ve net</h2>
                <p className={styles.cardSub}>İki çizgi arasındaki alan kesintidir</p>
              </div>
              {dolu ? (
                <>
                  <div className={styles.legend}>
                    <span className={styles.legendItem}><i className={styles.dot} style={{ background: '#0262a7' }} /> Brüt</span>
                    <span className={styles.legendItem}><i className={styles.dot} style={{ background: '#0f766e' }} /> Net</span>
                  </div>
                  <div className={styles.chart}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={rapor.aylik} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="brutFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0262a7" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#0262a7" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#eef3f8" vertical={false} />
                        <XAxis dataKey="etiket" tick={{ fontSize: 11, fill: '#7088a4' }} axisLine={false} tickLine={false} tickMargin={8} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} tickFormatter={fmtKompakt} />
                        <Tooltip content={<ChartTip />} />
                        <Area type="monotone" dataKey="brut_toplam" name="Brüt" stroke="#0262a7" strokeWidth={2.25} fill="url(#brutFill)" dot={false} activeDot={{ r: 4 }} />
                        <Area type="monotone" dataKey="net_toplam" name="Net" stroke="#0f766e" strokeWidth={2.25} fill="url(#netFill)" dot={false} activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className={styles.chartEmpty}>Bu aralıkta bordro kaydı yok.</div>
              )}
            </article>

            <article className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Sözleşme türü</h2>
                <p className={styles.cardSub}>Brüt pay</p>
              </div>
              {turler.length === 0 ? (
                <div className={styles.chartEmpty}>Tür dağılımı yok.</div>
              ) : (
                <div className={styles.donutBox}>
                  <div className={styles.donut}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={turler}
                          dataKey="toplam_brut"
                          nameKey="label"
                          innerRadius="68%"
                          outerRadius="90%"
                          paddingAngle={3}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {turler.map((t) => <Cell key={t.tur} fill={t.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmtPara(Number(v || 0))} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className={styles.donutCenter}>
                      <strong>{fmtKompakt(turToplam)}</strong>
                      <span>brüt</span>
                    </div>
                  </div>
                  <ul className={styles.legendList}>
                    {turler.map((t) => (
                      <li key={t.tur}>
                        <i className={styles.dot} style={{ background: t.color }} />
                        <span>{t.label}</span>
                        <b>{fmtPara(t.toplam_brut)}</b>
                        <span className={styles.legendMeta}>{t.kisi_sayisi} kişi · net {fmtPara(t.toplam_net)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Maliyetin bileşenleri</h2>
                <p className={styles.cardSub}>Ay ay yığılmış</p>
              </div>
              {parcalar.length === 0 ? (
                <div className={styles.chartEmpty}>Bileşen tutarı yok.</div>
              ) : (
                <>
                  <div className={styles.legend}>
                    {parcalar.map((p) => (
                      <span key={p.key} className={styles.legendItem}>
                        <i className={styles.dot} style={{ background: p.color }} /> {p.name}
                      </span>
                    ))}
                  </div>
                  <div className={styles.chart}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rapor.aylik} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="#eef3f8" vertical={false} />
                        <XAxis dataKey="etiket" tick={{ fontSize: 11, fill: '#7088a4' }} axisLine={false} tickLine={false} tickMargin={8} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} tickFormatter={fmtKompakt} />
                        <Tooltip content={<ChartTip />} />
                        {parcalar.map((p, i) => (
                          <Bar
                            key={p.key}
                            dataKey={p.key}
                            name={p.name}
                            stackId="maliyet"
                            fill={p.color}
                            maxBarSize={32}
                            radius={i === parcalar.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </article>

            <article className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Ödeme durumu</h2>
                <p className={styles.cardSub}>Bordro kaydı</p>
              </div>
              {durumlar.length === 0 ? (
                <div className={styles.chartEmpty}>Durum dağılımı yok.</div>
              ) : (
                <div className={styles.statusList}>
                  {durumlar.map((d) => (
                    <div key={d.durum}>
                      <div className={styles.statusTop}>
                        <span>{DURUM_AD[d.durum] || d.durum}</span>
                        <b>{fmtPara(d.toplam)}</b>
                      </div>
                      <div className={styles.track}>
                        <div
                          className={styles.fill}
                          style={{
                            width: `${Math.max(4, Math.round((d.toplam / durumMax) * 100))}%`,
                            background: DURUM_RENK[d.durum] || '#64748b',
                          }}
                        />
                      </div>
                      <div className={styles.kpiHint}>{d.sayi} kayıt</div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className={styles.tableWrap}>
            <h2>Ay dökümü</h2>
            <table>
              <thead>
                <tr>
                  <th>Ay</th>
                  <th>Kişi</th>
                  <th>Sabit</th>
                  <th>Ders</th>
                  <th>Özel ders</th>
                  <th>Prim</th>
                  <th>Mesai</th>
                  <th>Ek</th>
                  <th>Avans</th>
                  <th>Kesinti</th>
                  <th>Brüt</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {rapor.aylik.map((a) => (
                  <tr key={`${a.yil}-${a.ay}`}>
                    <td>{a.ay_adi} {a.yil}</td>
                    <td>{a.personel_sayisi || '—'}</td>
                    <td>{hucre(a.sabit_maas_toplam)}</td>
                    <td>{hucre(a.ders_ucret_toplam)}</td>
                    <td>{hucre(a.ozel_ders_toplam)}</td>
                    <td>{hucre(a.prim_toplam)}</td>
                    <td>{hucre(a.fazla_mesai_toplam)}</td>
                    <td>{hucre(a.ek_odeme_toplam)}</td>
                    <td>{hucre(a.avans_toplam, true)}</td>
                    <td>{hucre(a.kesinti_toplam, true)}</td>
                    <td>{fmtPara(a.brut_toplam)}</td>
                    <td className={styles.net}>{fmtPara(a.net_toplam)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Toplam</td>
                  <td>{rapor.genel_kisi}</td>
                  <td>{fmtPara(sum(rapor, 'sabit_maas_toplam'))}</td>
                  <td>{fmtPara(sum(rapor, 'ders_ucret_toplam'))}</td>
                  <td>{fmtPara(sum(rapor, 'ozel_ders_toplam'))}</td>
                  <td>{fmtPara(sum(rapor, 'prim_toplam'))}</td>
                  <td>{fmtPara(sum(rapor, 'fazla_mesai_toplam'))}</td>
                  <td>{fmtPara(sum(rapor, 'ek_odeme_toplam'))}</td>
                  <td className={styles.neg}>{fmtPara(sum(rapor, 'avans_toplam'))}</td>
                  <td>{fmtPara(sum(rapor, 'kesinti_toplam'))}</td>
                  <td>{fmtPara(rapor.genel_brut)}</td>
                  <td className={styles.net}>{fmtPara(rapor.genel_net)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}

function sum(rapor: YillikRapor, key: keyof YillikRaporAylik) {
  return rapor.aylik.reduce((s, a) => s + Number(a[key] || 0), 0);
}
