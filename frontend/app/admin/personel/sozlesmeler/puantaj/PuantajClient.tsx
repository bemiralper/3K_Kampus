'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  fetchHakedisler, topluHakedisOlustur, updateHakedis,
  onaylaHakedis, odendiHakedis, deleteHakedis, fetchHakedisStats,
  fetchAvanslar, createAvans, deleteAvans,
  topluOnayla, topluOdendi,
  downloadBordroPdfToplu,
} from '../services/api';
import type { Hakedis, HakedisDurumu, HakedisStats, AvansKaydi } from '../types';
import { AY_ADLARI } from '../types';
import AppDatePicker from '@/components/ui/AppDatePicker';
import { fetchHakedisForBordro, type BirebirHakedis } from '@/lib/ozel-ders-api';
import { useKurum } from '@/lib/contexts/KurumContext';
import styles from './bordro.module.css';

const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n || 0);

const fmtKurus = (n: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);

const AY_KISA: Record<number, string> = {
  1: 'Oca', 2: 'Şub', 3: 'Mar', 4: 'Nis', 5: 'May', 6: 'Haz',
  7: 'Tem', 8: 'Ağu', 9: 'Eyl', 10: 'Eki', 11: 'Kas', 12: 'Ara',
};

const DURUM_AD: Record<string, string> = {
  HESAPLANDI: 'Hesaplandı',
  ONAYLANDI: 'Onaylandı',
  ODENDI: 'Ödendi',
  IPTAL: 'İptal',
};

function durumSinif(durum: string) {
  if (durum === 'HESAPLANDI') return styles.d_HESAPLANDI;
  if (durum === 'ONAYLANDI') return styles.d_ONAYLANDI;
  if (durum === 'ODENDI') return styles.d_ODENDI;
  if (durum === 'IPTAL') return styles.d_IPTAL;
  return '';
}

function addMonths(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { yil: Math.floor(index / 12), ay: (index % 12) + 1 };
}

function avansPlani(tutar: number, yil: number, ay: number, taksit: number) {
  const parts = Math.min(24, Math.max(1, taksit || 1));
  const kurus = Math.round(tutar * 100);
  const base = Math.floor(kurus / parts);
  const rows: { yil: number; ay: number; tutar: number }[] = [];
  let cursor = { yil, ay };
  for (let i = 0; i < parts; i += 1) {
    const pay = i === parts - 1 ? kurus - base * (parts - 1) : base;
    rows.push({ ...cursor, tutar: pay / 100 });
    cursor = addMonths(cursor.yil, cursor.ay, 1);
  }
  return rows;
}

function donemEtiket(yil: number, ay: number) {
  const bas = ay >= 9 ? yil : yil - 1;
  return `${bas}–${bas + 1}`;
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function eklerToplam(h: Hakedis) {
  return h.prim + h.fazla_mesai + h.ek_odeme + (h.ozel_ders_hakedis_toplam || 0);
}

export default function MaasBordrosuClient() {
  const router = useRouter();
  const { activeSube, initialized } = useKurum();
  const now = new Date();
  const [yil, setYil] = useState(now.getFullYear());
  const [ay, setAy] = useState(now.getMonth() + 1);
  const [hakedisler, setHakedisler] = useState<Hakedis[]>([]);
  const [stats, setStats] = useState<HakedisStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [autoCreated, setAutoCreated] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [arama, setArama] = useState('');
  const [durumFiltre, setDurumFiltre] = useState<'' | HakedisDurumu>('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [editItem, setEditItem] = useState<Hakedis | null>(null);
  const [odemeIds, setOdemeIds] = useState<number[] | null>(null);
  const [odemeTarih, setOdemeTarih] = useState(now.toISOString().slice(0, 10));

  const [avansOpen, setAvansOpen] = useState(false);
  const [avansHakedis, setAvansHakedis] = useState<Hakedis | null>(null);
  const [avanslar, setAvanslar] = useState<AvansKaydi[]>([]);
  const [avansLoading, setAvansLoading] = useState(false);

  const [ozelDetayId, setOzelDetayId] = useState<number | null>(null);
  const [ozelDetayRows, setOzelDetayRows] = useState<BirebirHakedis[]>([]);
  const [ozelDetayLoading, setOzelDetayLoading] = useState(false);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3600);
  };

  const load = useCallback(async () => {
    if (!initialized || !activeSube?.id) return;
    setLoading(true);
    setLoaded(false);
    setSelectedIds(new Set());
    try {
      const [hRes, sRes] = await Promise.all([
        fetchHakedisler(yil, ay),
        fetchHakedisStats(yil, ay),
      ]);
      if (hRes.success && hRes.data) setHakedisler(hRes.data);
      if (sRes.success && sRes.data) setStats(sRes.data);
      setLoaded(true);
    } catch (err) {
      showToast('err', errMsg(err, 'Bordro yüklenemedi.'));
    }
    setLoading(false);
  }, [yil, ay, initialized, activeSube?.id]);

  useEffect(() => { load(); setAutoCreated(false); }, [load]);

  const handleTopluOlustur = useCallback(async () => {
    setBusy(true);
    try {
      const res = await topluHakedisOlustur(yil, ay);
      if (res.success && res.data) {
        showToast('ok', res.data.olusturulan > 0
          ? `${res.data.olusturulan} personel için bordro hazır.`
          : 'Bordrolar güncel.');
        load();
      }
    } catch (err) {
      showToast('err', errMsg(err, 'Bordro oluşturulamadı.'));
    }
    setBusy(false);
  }, [yil, ay, load]);

  useEffect(() => {
    if (loaded && !loading && hakedisler.length === 0 && !autoCreated && initialized && activeSube?.id) {
      setAutoCreated(true);
      handleTopluOlustur();
    }
  }, [loaded, loading, hakedisler.length, autoCreated, initialized, activeSube?.id, handleTopluOlustur]);

  const yilSecenek = useMemo(() => {
    const bu = new Date().getFullYear();
    const set = new Set<number>([yil]);
    for (let y = bu - 4; y <= bu + 1; y += 1) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [yil]);

  const sayac = useMemo(() => {
    const n = (d: HakedisDurumu) => hakedisler.filter((h) => h.durum === d).length;
    return {
      HESAPLANDI: n('HESAPLANDI'),
      ONAYLANDI: n('ONAYLANDI'),
      ODENDI: n('ODENDI'),
      IPTAL: n('IPTAL'),
    };
  }, [hakedisler]);

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    return hakedisler.filter((h) => {
      if (durumFiltre && h.durum !== durumFiltre) return false;
      if (q && !h.personel_ad.toLocaleLowerCase('tr').includes(q)) return false;
      return true;
    });
  }, [hakedisler, arama, durumFiltre]);

  const secilebilir = gorunen.filter((h) => h.durum !== 'ODENDI' && h.durum !== 'IPTAL');
  const hepsiSecili = secilebilir.length > 0 && secilebilir.every((h) => selectedIds.has(h.id));
  const secili = hakedisler.filter((h) => selectedIds.has(h.id));
  const seciliHesap = secili.filter((h) => h.durum === 'HESAPLANDI').length;
  const seciliOnay = secili.filter((h) => h.durum === 'ONAYLANDI').length;

  function shift(delta: number) {
    const next = addMonths(yil, ay, delta);
    setYil(next.yil);
    setAy(next.ay);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (hepsiSecili) setSelectedIds(new Set());
    else setSelectedIds(new Set(secilebilir.map((h) => h.id)));
  }

  async function handleOnayla(ids: number[]) {
    if (ids.length === 0) {
      showToast('err', 'Onaylanacak kayıt yok. Yalnızca hesaplanmış bordrolar onaylanır.');
      return;
    }
    if (!window.confirm(`${ids.length} bordro onaylanacak.`)) return;
    setBusy(true);
    try {
      if (ids.length === 1) {
        await onaylaHakedis(ids[0]);
        showToast('ok', 'Onaylandı.');
      } else {
        const res = await topluOnayla(ids);
        showToast('ok', `${res.data?.onaylanan ?? ids.length} bordro onaylandı.`);
      }
      load();
    } catch (err) {
      showToast('err', errMsg(err, 'Onaylanamadı.'));
    }
    setBusy(false);
  }

  function openOdeme(ids: number[]) {
    if (ids.length === 0) {
      showToast('err', 'Ödenecek kayıt yok. Yalnızca onaylanmış bordrolar işaretlenir.');
      return;
    }
    setOdemeTarih(new Date().toISOString().slice(0, 10));
    setOdemeIds(ids);
  }

  async function confirmOdeme() {
    if (!odemeIds?.length || !odemeTarih) return;
    setBusy(true);
    try {
      if (odemeIds.length === 1) await odendiHakedis(odemeIds[0], odemeTarih);
      else await topluOdendi(odemeIds, odemeTarih);
      showToast('ok', odemeIds.length === 1 ? 'Ödendi olarak işaretlendi.' : `${odemeIds.length} bordro ödendi.`);
      setOdemeIds(null);
      load();
    } catch (err) {
      showToast('err', errMsg(err, 'İşaretlenemedi.'));
    }
    setBusy(false);
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Bu bordro kaydı silinsin mi?')) return;
    try {
      await deleteHakedis(id);
      showToast('ok', 'Silindi.');
      setEditItem(null);
      load();
    } catch (err) {
      showToast('err', errMsg(err, 'Silinemedi.'));
    }
  }

  async function handleSave(id: number, data: Record<string, unknown>) {
    setBusy(true);
    try {
      await updateHakedis(id, data);
      showToast('ok', 'Kaydedildi.');
      setEditItem(null);
      load();
    } catch (err) {
      showToast('err', errMsg(err, 'Kaydedilemedi.'));
    }
    setBusy(false);
  }

  async function openAvans(h: Hakedis) {
    setAvansHakedis(h);
    setAvansOpen(true);
    setAvansLoading(true);
    try {
      const res = await fetchAvanslar({ sozlesme_id: h.sozlesme_id });
      if (res.success && res.data) setAvanslar(res.data);
    } catch (err) {
      showToast('err', errMsg(err, 'Avanslar yüklenemedi.'));
    }
    setAvansLoading(false);
  }

  async function handleAvansEkle(form: {
    tarih: string;
    tutar: number;
    aciklama: string;
    mahsup_yil: number;
    mahsup_ay: number;
    taksit_sayisi: number;
  }) {
    if (!avansHakedis) return false;
    const taksit = Math.min(24, Math.max(1, form.taksit_sayisi || 1));
    try {
      await createAvans({
        sozlesme_id: avansHakedis.sozlesme_id,
        tarih: form.tarih,
        tutar: form.tutar,
        aciklama: form.aciklama,
        mahsup_yil: form.mahsup_yil,
        mahsup_ay: form.mahsup_ay,
        taksit_sayisi: taksit,
      });
      const plan = avansPlani(form.tutar, form.mahsup_yil, form.mahsup_ay, taksit);
      const ozet = plan.map((p) => `${AY_ADLARI[p.ay]} ${p.yil} ${fmtPara(p.tutar)}`).join(', ');
      showToast('ok', taksit === 1 ? `${ozet} bordrosundan düşülecek.` : `${taksit} aya bölündü: ${ozet}`);
      const aRes = await fetchAvanslar({ sozlesme_id: avansHakedis.sozlesme_id });
      if (aRes.success && aRes.data) setAvanslar(aRes.data);
      load();
      return true;
    } catch (err) {
      showToast('err', errMsg(err, 'Avans eklenemedi.'));
      return false;
    }
  }

  async function handleAvansSil(avansId: number) {
    if (!window.confirm('Bu avans kaydı silinsin mi?')) return;
    try {
      await deleteAvans(avansId);
      showToast('ok', 'Avans silindi.');
      if (avansHakedis) {
        const aRes = await fetchAvanslar({ sozlesme_id: avansHakedis.sozlesme_id });
        if (aRes.success && aRes.data) setAvanslar(aRes.data);
      }
      load();
    } catch (err) {
      showToast('err', errMsg(err, 'Silinemedi.'));
    }
  }

  async function openOzel(id: number) {
    setOzelDetayId(id);
    setOzelDetayLoading(true);
    try {
      setOzelDetayRows(await fetchHakedisForBordro(id));
    } catch (err) {
      setOzelDetayRows([]);
      showToast('err', errMsg(err, 'Özel ders satırları yüklenemedi.'));
    }
    setOzelDetayLoading(false);
  }

  async function indirPdf() {
    setPdfLoading(true);
    const res = await downloadBordroPdfToplu(yil, ay);
    setPdfLoading(false);
    if (!res.success) showToast('err', res.error || 'PDF indirilemedi.');
  }

  const ozelAy = hakedisler.reduce((s, h) => s + (h.ozel_ders_hakedis_toplam || 0), 0);
  const filtreli = Boolean(arama.trim() || durumFiltre);

  const aksiyon = (h: Hakedis) => (
    <>
      {h.durum === 'HESAPLANDI' && (
        <button type="button" className={styles.textBtn} onClick={() => setEditItem(h)}>Düzenle</button>
      )}
      {h.durum === 'HESAPLANDI' && (
        <button type="button" className={styles.textBtn} onClick={() => handleOnayla([h.id])}>Onayla</button>
      )}
      {h.durum === 'ONAYLANDI' && (
        <button type="button" className={styles.textBtn} onClick={() => openOdeme([h.id])}>Ödendi</button>
      )}
      <button type="button" className={styles.textBtn} onClick={() => openAvans(h)}>Avans</button>
      {(h.ozel_ders_hakedis_toplam || 0) > 0 && (
        <button type="button" className={styles.textBtn} onClick={() => openOzel(h.id)}>Özel ders</button>
      )}
    </>
  );

  return (
    <div className={styles.page}>
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'ok' ? styles.toastOk : styles.toastErr}`} role="status">
          {toast.msg}
        </div>
      )}

      <header className={styles.top}>
        <div>
          <p className={styles.kicker}>{activeSube?.ad || 'Personel'}</p>
          <h1 className={styles.title}>Maaş bordrosu</h1>
          <p className={styles.lede}>
            {AY_ADLARI[ay]} {yil} · {donemEtiket(yil, ay)} eğitim yılı
          </p>
        </div>
        <button type="button" className={styles.back} onClick={() => router.push('/admin/personel/sozlesmeler')}>
          Sözleşmelere dön
        </button>
      </header>

      <section className={styles.monthBar}>
        <div className={styles.stepper}>
          <button type="button" className={styles.step} aria-label="Önceki ay" onClick={() => shift(-1)}>‹</button>
          <div className={styles.monthLabel}>
            <strong>{AY_ADLARI[ay]} {yil}</strong>
            <span>{donemEtiket(yil, ay)}</span>
          </div>
          <button type="button" className={styles.step} aria-label="Sonraki ay" onClick={() => shift(1)}>›</button>
        </div>
        <div className={styles.jumps}>
          <select className={styles.select} aria-label="Ay" value={ay} onChange={(e) => setAy(Number(e.target.value))}>
            {Object.entries(AY_ADLARI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className={styles.select} aria-label="Yıl" value={yil} onChange={(e) => setYil(Number(e.target.value))}>
            {yilSecenek.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className={styles.monthActions}>
          <button type="button" className={styles.ghost} disabled={busy} onClick={handleTopluOlustur}>
            {busy ? 'Güncelleniyor…' : 'Bordroları güncelle'}
          </button>
          <button type="button" className={styles.primary} disabled={pdfLoading} onClick={indirPdf}>
            {pdfLoading ? 'PDF hazırlanıyor…' : 'PDF indir'}
          </button>
        </div>
      </section>

      <section className={styles.kpis}>
        <article className={styles.kpi}>
          <div className={styles.kpiLabel}>Personel</div>
          <div className={styles.kpiValue}>{stats?.kayit_sayisi ?? '—'}</div>
        </article>
        <article className={styles.kpi}>
          <div className={styles.kpiLabel}>Brüt</div>
          <div className={styles.kpiValue}>{stats ? fmtPara(stats.toplam_brut) : '—'}</div>
        </article>
        <article className={styles.kpi}>
          <div className={styles.kpiLabel}>Net ödeme</div>
          <div className={styles.kpiValue}>{stats ? fmtPara(stats.toplam_net) : '—'}</div>
        </article>
        <article className={styles.kpi}>
          <div className={styles.kpiLabel}>Ders saati</div>
          <div className={styles.kpiValue}>{stats ? stats.toplam_ders_saat : '—'}</div>
        </article>
      </section>

      {sayac.ODENDI > 0 && (sayac.HESAPLANDI + sayac.ONAYLANDI) > 0 && (
        <p className={styles.payNote}>
          Bu ay {sayac.ODENDI} kişi ödendi. Ödenmeyen {sayac.HESAPLANDI + sayac.ONAYLANDI} kişi aynı listede duruyor:{' '}
          {hakedisler
            .filter((h) => h.durum === 'HESAPLANDI' || h.durum === 'ONAYLANDI')
            .map((h) => h.personel_ad)
            .join(', ')}
          . PDF’de ödenenler ve ödenmeyenler ayrı.
        </p>
      )}

      <div className={styles.tools}>
        <input
          className={styles.search}
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Personel ara"
          aria-label="Personel ara"
        />
        <div className={styles.chips} role="tablist" aria-label="Durum">
          <button type="button" className={`${styles.chip} ${durumFiltre === '' ? styles.chipOn : ''}`} onClick={() => setDurumFiltre('')}>
            Tümü
          </button>
          {(['HESAPLANDI', 'ONAYLANDI', 'ODENDI', 'IPTAL'] as const).map((d) => (
            sayac[d] > 0 || durumFiltre === d ? (
              <button
                key={d}
                type="button"
                className={`${styles.chip} ${durumFiltre === d ? styles.chipOn : ''}`}
                onClick={() => setDurumFiltre(durumFiltre === d ? '' : d)}
              >
                {DURUM_AD[d]} {sayac[d]}
              </button>
            ) : null
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className={styles.bulk}>
          <span>{selectedIds.size} seçili</span>
          {seciliHesap > 0 && (
            <button type="button" className={styles.primary} onClick={() => handleOnayla(secili.filter((h) => h.durum === 'HESAPLANDI').map((h) => h.id))}>
              Onayla ({seciliHesap})
            </button>
          )}
          {seciliOnay > 0 && (
            <button type="button" className={styles.ok} onClick={() => openOdeme(secili.filter((h) => h.durum === 'ONAYLANDI').map((h) => h.id))}>
              Ödendi ({seciliOnay})
            </button>
          )}
          <button type="button" className={styles.ghost} onClick={() => setSelectedIds(new Set())}>Temizle</button>
        </div>
      )}

      {loading && hakedisler.length === 0 ? (
        <div className={styles.empty}>Bordro hazırlanıyor…</div>
      ) : hakedisler.length === 0 ? (
        <div className={styles.empty}>
          Bu ay için bordro yok. Aktif sözleşme varsa «Bordroları güncelle» ile oluşturulur.
        </div>
      ) : gorunen.length === 0 ? (
        <div className={styles.empty}>Bu süzgeçte personel yok.</div>
      ) : (
        <>
          <div className={styles.cards}>
            {gorunen.map((h) => (
              <article key={h.id} className={`${styles.card} ${selectedIds.has(h.id) ? styles.cardOn : ''}`}>
                <div className={styles.cardTop}>
                  {h.durum !== 'ODENDI' && h.durum !== 'IPTAL' ? (
                    <input className={styles.check} type="checkbox" checked={selectedIds.has(h.id)} onChange={() => toggleSelect(h.id)} aria-label={`${h.personel_ad} seç`} />
                  ) : <span className={styles.check} />}
                  <div className={styles.who}>
                    <Link className={styles.name} href={`/admin/personel/sozlesmeler/personel-detay/${h.personel_id}`}>
                      {h.personel_ad}
                    </Link>
                    <div className={styles.meta}>{h.sozlesme_turu_display}</div>
                  </div>
                  <div className={styles.cardNet}>
                    <strong>{fmtPara(h.net_hakedis)}</strong>
                    <span className={`${styles.pill} ${durumSinif(h.durum)}`}>{h.durum_display || DURUM_AD[h.durum]}</span>
                  </div>
                </div>
                <p className={styles.metaLine}>
                  Maaş {fmtPara(h.sabit_maas)}
                  {' · '}Ders ücreti {h.ders_ucreti_toplam > 0 ? fmtPara(h.ders_ucreti_toplam) : '—'}
                  {h.ders_basi_ucret > 0 ? ` (${h.toplam_ders_saati || 0} sa × ${fmtKurus(h.ders_basi_ucret)})` : ''}
                  {eklerToplam(h) > 0 ? ` · Ek ${fmtPara(eklerToplam(h))}` : ''}
                  {h.avans > 0 ? ` · Avans ${fmtPara(h.avans)}` : ''}
                  {h.kesintiler > 0 ? ` · Kesinti ${fmtPara(h.kesintiler)}` : ''}
                </p>
                <div className={styles.cardActions}>{aksiyon(h)}</div>
              </article>
            ))}
          </div>

          <div className={styles.desk}>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>
                      <input className={styles.check} type="checkbox" checked={hepsiSecili} onChange={toggleAll} aria-label="Tümünü seç" />
                    </th>
                    <th>Personel</th>
                    <th>Net</th>
                    <th>Durum</th>
                    <th>Maaş</th>
                    <th>Ders saat</th>
                    <th>Birim</th>
                    <th>Ders ücreti</th>
                    <th>Ekler</th>
                    <th>Avans</th>
                    <th>Kesinti</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map((h) => (
                    <tr key={h.id}>
                      <td>
                        {h.durum !== 'ODENDI' && h.durum !== 'IPTAL' ? (
                          <input className={styles.check} type="checkbox" checked={selectedIds.has(h.id)} onChange={() => toggleSelect(h.id)} aria-label={`${h.personel_ad} seç`} />
                        ) : '—'}
                      </td>
                      <td>
                        <Link className={styles.name} href={`/admin/personel/sozlesmeler/personel-detay/${h.personel_id}`}>{h.personel_ad}</Link>
                        <div className={styles.meta}>{h.sozlesme_turu_display}</div>
                      </td>
                      <td className={styles.net}>{fmtPara(h.net_hakedis)}</td>
                      <td><span className={`${styles.pill} ${durumSinif(h.durum)}`}>{h.durum_display || DURUM_AD[h.durum]}</span></td>
                      <td>{fmtPara(h.sabit_maas)}</td>
                      <td>{h.toplam_ders_saati || '—'}</td>
                      <td>{h.ders_basi_ucret > 0 ? fmtKurus(h.ders_basi_ucret) : <span className={styles.muted}>—</span>}</td>
                      <td>{h.ders_ucreti_toplam > 0 ? fmtPara(h.ders_ucreti_toplam) : <span className={styles.muted}>—</span>}</td>
                      <td>{eklerToplam(h) > 0 ? fmtPara(eklerToplam(h)) : <span className={styles.muted}>—</span>}</td>
                      <td className={h.avans > 0 ? styles.neg : undefined}>{h.avans > 0 ? fmtPara(h.avans) : <span className={styles.muted}>—</span>}</td>
                      <td className={h.kesintiler > 0 ? styles.neg : undefined}>{h.kesintiler > 0 ? fmtPara(h.kesintiler) : <span className={styles.muted}>—</span>}</td>
                      <td>
                        <div className={styles.rowActions}>{aksiyon(h)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td>{filtreli ? 'Görünen' : 'Toplam'} ({gorunen.length})</td>
                    <td className={styles.net}>{fmtPara(gorunen.reduce((s, h) => s + h.net_hakedis, 0))}</td>
                    <td />
                    <td>{fmtPara(gorunen.reduce((s, h) => s + h.sabit_maas, 0))}</td>
                    <td>{gorunen.reduce((s, h) => s + h.toplam_ders_saati, 0).toFixed(1)}</td>
                    <td />
                    <td>{fmtPara(gorunen.reduce((s, h) => s + h.ders_ucreti_toplam, 0))}</td>
                    <td>{fmtPara(gorunen.reduce((s, h) => s + eklerToplam(h), 0))}</td>
                    <td className={styles.neg}>{fmtPara(gorunen.reduce((s, h) => s + h.avans, 0))}</td>
                    <td>{fmtPara(gorunen.reduce((s, h) => s + h.kesintiler, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {ozelAy > 0 && (
            <p className={styles.hint}>
              Bu ay bordroya aktarılan özel ders tutarı {fmtPara(ozelAy)}. Satırlar ilgili personelde «Özel ders» ile açılır; yeniden hesaplanmaz.
            </p>
          )}
        </>
      )}

      {editItem && (
        <EditSheet
          key={editItem.id}
          h={editItem}
          busy={busy}
          onClose={() => setEditItem(null)}
          onSave={(data) => handleSave(editItem.id, data)}
          onDelete={() => handleDelete(editItem.id)}
        />
      )}

      {odemeIds && (
        <div className={`${styles.backdrop} ${styles.backdropCenter}`} onClick={() => setOdemeIds(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="odeme-baslik">
            <h2 id="odeme-baslik" className={styles.dialogTitle}>Ödeme tarihi</h2>
            <p className={styles.hint}>{odemeIds.length} bordro ödendi olarak işaretlenecek.</p>
            <div className={styles.field} style={{ marginTop: 12 }}>
              <label>Tarih</label>
              <AppDatePicker value={odemeTarih} onChange={(iso) => setOdemeTarih(iso || odemeTarih)} allowClear={false} />
            </div>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.ghost} onClick={() => setOdemeIds(null)}>Vazgeç</button>
              <button type="button" className={styles.primary} disabled={busy} onClick={confirmOdeme}>İşaretle</button>
            </div>
          </div>
        </div>
      )}

      {ozelDetayId != null && (
        <div className={`${styles.backdrop} ${styles.backdropCenter}`} onClick={() => setOzelDetayId(null)}>
          <div className={`${styles.dialog} ${styles.dialogWide}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ozel-baslik">
            <div className={styles.sheetHead}>
              <div>
                <h2 id="ozel-baslik" className={styles.dialogTitle}>Özel ders satırları</h2>
                <p>Bordroya aktarılmış birebir dersler</p>
              </div>
              <button type="button" className={styles.ghost} onClick={() => setOzelDetayId(null)}>Kapat</button>
            </div>
            {ozelDetayLoading ? <p className={styles.hint}>Yükleniyor…</p> : ozelDetayRows.length === 0 ? (
              <p className={styles.hint}>Kayıt yok.</p>
            ) : (
              <ul className={styles.lineList}>
                {ozelDetayRows.map((r) => (
                  <li key={r.id}>
                    <div>
                      <b>{r.ders_ad}</b>
                      <span>{r.tarih} · {r.durum_display}</span>
                    </div>
                    <strong>{fmtPara(r.tutar)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {avansOpen && avansHakedis && (
        <AvansDrawer
          key={avansHakedis.id}
          h={avansHakedis}
          rows={avanslar}
          loading={avansLoading}
          onClose={() => setAvansOpen(false)}
          onSave={handleAvansEkle}
          onDelete={handleAvansSil}
        />
      )}
    </div>
  );
}

function AvansDrawer({
  h, rows, loading, onClose, onSave, onDelete,
}: {
  h: Hakedis;
  rows: AvansKaydi[];
  loading: boolean;
  onClose: () => void;
  onSave: (form: {
    tarih: string;
    tutar: number;
    aciklama: string;
    mahsup_yil: number;
    mahsup_ay: number;
    taksit_sayisi: number;
  }) => Promise<boolean>;
  onDelete: (id: number) => void;
}) {
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10));
  const [tutar, setTutar] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [mod, setMod] = useState<'toplu' | 'bol'>('toplu');
  const [offset, setOffset] = useState(0);
  const [taksit, setTaksit] = useState(2);
  const [saving, setSaving] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const aylar = useMemo(
    () => Array.from({ length: 18 }, (_, i) => addMonths(h.yil, h.ay, i)),
    [h.yil, h.ay],
  );
  const hedef = aylar[Math.min(offset, aylar.length - 1)];
  const taksitSayisi = mod === 'toplu' ? 1 : taksit;
  const tutarSayi = parseFloat(tutar) || 0;
  const plan = tutarSayi > 0 ? avansPlani(tutarSayi, hedef.yil, hedef.ay, taksitSayisi) : [];
  const sirali = [...rows].sort((a, b) => a.mahsup_yil - b.mahsup_yil || a.mahsup_ay - b.mahsup_ay || a.id - b.id);

  useEffect(() => {
    railRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [offset]);

  async function kaydet() {
    if (tutarSayi <= 0) return;
    setSaving(true);
    const ok = await onSave({
      tarih,
      tutar: tutarSayi,
      aciklama,
      mahsup_yil: hedef.yil,
      mahsup_ay: hedef.ay,
      taksit_sayisi: taksitSayisi,
    });
    if (ok) {
      setTutar('');
      setAciklama('');
      setMod('toplu');
      setOffset(0);
      setTaksit(2);
    }
    setSaving(false);
  }

  return (
    <div className={styles.drawer}>
      <button type="button" className={styles.drawerBg} aria-label="Kapat" onClick={onClose} />
      <div className={styles.drawerPanel} role="dialog" aria-modal="true" aria-labelledby="avans-baslik">
        <div className={styles.drawerHead}>
          <div>
            <h2 id="avans-baslik">Avans</h2>
            <p>{h.personel_ad} · {AY_ADLARI[h.ay]} {h.yil} bordrosu</p>
          </div>
          <button type="button" className={styles.ghost} onClick={onClose}>Kapat</button>
        </div>
        <div className={styles.drawerBody}>
          <div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Veriliş tarihi</label>
                <AppDatePicker value={tarih} onChange={(iso) => setTarih(iso || tarih)} allowClear={false} />
              </div>
              <div className={styles.field}>
                <label>Tutar (₺)</label>
                <input inputMode="decimal" placeholder="0" value={tutar} onChange={(e) => setTutar(e.target.value)} />
              </div>
            </div>
            <div className={styles.field} style={{ marginTop: 10 }}>
              <label>Açıklama</label>
              <input value={aciklama} placeholder="İsteğe bağlı" onChange={(e) => setAciklama(e.target.value)} />
            </div>

            <p className={styles.groupLabel}>Ne zaman kesilsin</p>
            <div className={styles.delay}>
              <button type="button" className={styles.step} aria-label="Daha erken" disabled={offset === 0} onClick={() => setOffset((n) => Math.max(0, n - 1))}>−</button>
              <div>
                <strong>{offset === 0 ? 'Bu ay' : `${offset} ay sonra`}</strong>
                <span>{AY_ADLARI[hedef.ay]} {hedef.yil}</span>
              </div>
              <button type="button" className={styles.step} aria-label="Daha ileri" disabled={offset >= aylar.length - 1} onClick={() => setOffset((n) => Math.min(aylar.length - 1, n + 1))}>+</button>
            </div>
            <div className={styles.monthRail} ref={railRef} role="listbox" aria-label="Kesim ayı">
              {aylar.map((a, i) => (
                <button
                  key={`${a.yil}-${a.ay}`}
                  type="button"
                  className={`${styles.monthChip} ${i === offset ? styles.monthChipOn : ''}`}
                  onClick={() => setOffset(i)}
                  aria-pressed={i === offset}
                >
                  {AY_KISA[a.ay]} {String(a.yil).slice(2)}
                </button>
              ))}
            </div>

            <div className={styles.modes} role="tablist" aria-label="Kesim şekli">
              <button type="button" className={`${styles.mode} ${mod === 'toplu' ? styles.modeOn : ''}`} onClick={() => setMod('toplu')}>
                Toplu kes
              </button>
              <button type="button" className={`${styles.mode} ${mod === 'bol' ? styles.modeOn : ''}`} onClick={() => setMod('bol')}>
                Aylara böl
              </button>
            </div>
            {mod === 'bol' && (
              <div className={styles.delay}>
                <button type="button" className={styles.step} aria-label="Taksiti azalt" disabled={taksit <= 2} onClick={() => setTaksit((n) => Math.max(2, n - 1))}>−</button>
                <div>
                  <strong>{taksit} taksit</strong>
                  <span>{AY_ADLARI[hedef.ay]} {hedef.yil} tarihinden itibaren</span>
                </div>
                <button type="button" className={styles.step} aria-label="Taksiti artır" disabled={taksit >= 24} onClick={() => setTaksit((n) => Math.min(24, n + 1))}>+</button>
              </div>
            )}
            <p className={styles.hint}>
              {mod === 'toplu'
                ? (offset === 0
                  ? 'Tutarın tamamı bu ayın bordrosundan düşer.'
                  : `Tutarın tamamı ${offset} ay sonra, ${AY_ADLARI[hedef.ay]} ${hedef.yil} bordrosundan tek seferde düşer.`)
                : `Tutar ${taksit} eşit aya bölünür. İlk kesim ${AY_ADLARI[hedef.ay]} ${hedef.yil}.`}
            </p>
            {plan.length > 0 && (
              <div className={styles.plan}>
                {plan.map((p) => (
                  <div key={`${p.yil}-${p.ay}`}>
                    <span>{AY_ADLARI[p.ay]} {p.yil}</span>
                    <b>{fmtKurus(p.tutar)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className={styles.groupLabel}>Kayıtlı avanslar ({rows.length})</p>
            {loading ? <p className={styles.hint}>Yükleniyor…</p> : sirali.length === 0 ? (
              <p className={styles.hint}>Henüz avans yok.</p>
            ) : (
              <>
                {sirali.map((a) => (
                  <div key={a.id} className={styles.avansItem}>
                    <div>
                      <b>{fmtKurus(a.tutar)}</b>
                      <span className={styles.meta}> · {a.mahsup_ay_display} {a.mahsup_yil}</span>
                      <div className={styles.meta}>
                        {new Date(a.tarih).toLocaleDateString('tr-TR')}
                        {a.aciklama ? ` — ${a.aciklama}` : ''}
                      </div>
                    </div>
                    <button type="button" className={styles.textBtn} onClick={() => onDelete(a.id)}>Sil</button>
                  </div>
                ))}
                <p className={styles.hint}>Toplam {fmtPara(rows.reduce((s, a) => s + a.tutar, 0))}</p>
              </>
            )}
          </div>
        </div>
        <div className={styles.drawerFoot}>
          <button type="button" className={styles.ghost} onClick={onClose}>Vazgeç</button>
          <button type="button" className={styles.primary} disabled={saving || tutarSayi <= 0} onClick={kaydet}>
            {saving ? 'Kaydediliyor…' : 'Avansı kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSheet({
  h, busy, onClose, onSave, onDelete,
}: {
  h: Hakedis;
  busy: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [dersSaati, setDersSaati] = useState(String(h.toplam_ders_saati || ''));
  const [prim, setPrim] = useState(String(h.prim || ''));
  const [fazlaMesai, setFazlaMesai] = useState(String(h.fazla_mesai || ''));
  const [ekOdeme, setEkOdeme] = useState(String(h.ek_odeme || ''));
  const [avans, setAvans] = useState(String(h.avans || ''));
  const [kesintiler, setKesintiler] = useState(String(h.kesintiler || ''));

  const saat = parseFloat(dersSaati) || 0;
  const dersUcret = h.ders_basi_ucret * saat;
  const ozel = h.ozel_ders_hakedis_toplam || 0;
  const net = h.sabit_maas + dersUcret + (parseFloat(prim) || 0) + (parseFloat(fazlaMesai) || 0) + (parseFloat(ekOdeme) || 0) + ozel - (parseFloat(avans) || 0) - (parseFloat(kesintiler) || 0);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="duzenle-baslik">
        <div className={styles.sheetHead}>
          <div>
            <h2 id="duzenle-baslik">{h.personel_ad}</h2>
            <p>{AY_ADLARI[h.ay]} {h.yil} · {h.sozlesme_turu_display}</p>
          </div>
          <div className={styles.netBanner}>
            <span>Net</span>
            <strong>{fmtPara(net)}</strong>
          </div>
        </div>
        <div className={styles.sheetBody}>
          <p className={styles.groupLabel}>Kazanç</p>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Aylık maaş</label>
              <div className={styles.readonly}>{fmtPara(h.sabit_maas)}</div>
            </div>
            <div className={styles.field}>
              <label>Özel ders</label>
              <div className={styles.readonly}>{ozel ? fmtPara(ozel) : '—'}</div>
            </div>
            <div className={styles.field}>
              <label>Ders saati</label>
              <input inputMode="decimal" value={dersSaati} onChange={(e) => setDersSaati(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Birim ders ücreti</label>
              <div className={styles.readonly}>{h.ders_basi_ucret > 0 ? fmtKurus(h.ders_basi_ucret) : '—'}</div>
            </div>
            <div className={styles.field}>
              <label>Ders ücreti</label>
              <div className={styles.readonly}>{fmtPara(dersUcret)}</div>
            </div>
            <div className={styles.field}>
              <label>Prim</label>
              <input inputMode="decimal" value={prim} onChange={(e) => setPrim(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Fazla mesai</label>
              <input inputMode="decimal" value={fazlaMesai} onChange={(e) => setFazlaMesai(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Ek ödeme</label>
              <input inputMode="decimal" value={ekOdeme} onChange={(e) => setEkOdeme(e.target.value)} />
            </div>
          </div>
          <p className={styles.groupLabel}>Düşülecek</p>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Avans</label>
              <input inputMode="decimal" value={avans} onChange={(e) => setAvans(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Kesintiler</label>
              <input inputMode="decimal" value={kesintiler} onChange={(e) => setKesintiler(e.target.value)} />
            </div>
          </div>
          <p className={styles.hint}>Ders ücreti, saat ile sözleşmedeki birim ücretin çarpımıdır.</p>
        </div>
        <div className={styles.sheetFoot}>
          <button type="button" className={styles.linkDanger} onClick={onDelete}>Sil</button>
          <button type="button" className={styles.ghost} onClick={onClose}>Vazgeç</button>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => onSave({
              toplam_ders_saati: saat,
              prim: parseFloat(prim) || 0,
              fazla_mesai: parseFloat(fazlaMesai) || 0,
              ek_odeme: parseFloat(ekOdeme) || 0,
              avans: parseFloat(avans) || 0,
              kesintiler: parseFloat(kesintiler) || 0,
            })}
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
