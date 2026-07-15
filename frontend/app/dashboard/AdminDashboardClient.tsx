'use client';

import { useCallback, useEffect, useState } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchAdminDashboard,
  type AdminDashboardData,
} from '@/lib/admin-dashboard-api';
import DashKpiCard from './components/DashKpiCard';
import DashOgrenciSection from './components/DashOgrenciSection';
import {
  DashBarChart,
  DashDonutChart,
  DashHBarChart,
  DashLineChart,
} from './components/DashCharts';
import './admin-dashboard.css';

type TabId = 'ogrenci' | 'personel' | 'finans';

const TABS: { id: TabId; label: string }[] = [
  { id: 'ogrenci', label: 'Öğrenci' },
  { id: 'personel', label: 'Personel' },
  { id: 'finans', label: 'Finans' },
];

function fmtMoney(n: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('tr-TR').format(n);
}

export default function AdminDashboardClient() {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const [tab, setTab] = useState<TabId>('ogrenci');
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeKurum || !activeSube || !activeEgitimYili) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminDashboard();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dashboard yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [activeKurum, activeSube, activeEgitimYili]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeKurum || !activeSube || !activeEgitimYili) {
    return (
      <div className="adm-dash adm-dash--state">
        <p>Kurum, şube ve eğitim yılı seçin — üst menüden bağlamı belirleyin.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="adm-dash adm-dash--state">
        <div className="adm-dash-spinner" />
        <p>Dashboard yükleniyor…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="adm-dash adm-dash--state">
        <p>{error || 'Veri alınamadı'}</p>
        <button type="button" className="adm-dash-btn" onClick={load}>
          Tekrar dene
        </button>
      </div>
    );
  }

  const ctxLabel = [
    activeKurum.ad,
    activeSube.ad,
    activeEgitimYili
      ? `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="adm-dash">
      <header className="adm-dash-head">
        <div>
          <h1>Yönetim Paneli</h1>
          <p>{ctxLabel}</p>
        </div>
        <button type="button" className="adm-dash-btn adm-dash-btn--ghost" onClick={load}>
          Yenile
        </button>
      </header>

      <section className="adm-kpi-row adm-kpi-row--global">
        <DashKpiCard
          label="Aktif Öğrenci"
          value={fmtNum(data.genel.aktif_ogrenci)}
          href="/ogrenciler"
          tone="blue"
          icon="🎓"
        />
        <DashKpiCard
          label="Aktif Personel"
          value={fmtNum(data.genel.aktif_personel)}
          href="/personel"
          tone="green"
          icon="👥"
        />
        <DashKpiCard
          label="Aktif Sözleşme"
          value={fmtNum(data.genel.aktif_sozlesme)}
          href="/odeme-takip"
          tone="violet"
          icon="📄"
        />
        <DashKpiCard
          label="Kasa + Banka"
          value={fmtMoney(data.genel.kasa_banka_toplam)}
          hint={`Kasa ${fmtMoney(data.genel.kasa_toplam)} · Banka ${fmtMoney(data.genel.banka_toplam)}${
            data.genel.pos_toplam ? ` · POS ${fmtMoney(data.genel.pos_toplam)}` : ''
          }`}
          href="/finans"
          tone="amber"
          icon="💰"
        />
      </section>

      <nav className="adm-tabs" aria-label="Dashboard sekmeleri">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`adm-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'ogrenci' && (
        <>
          <section className="adm-kpi-row">
            <DashKpiCard label="Aktif Öğrenci" value={fmtNum(data.ogrenci.kpis.aktif)} href="/ogrenciler" tone="blue" />
            <DashKpiCard label="Pasif Öğrenci" value={fmtNum(data.ogrenci.kpis.pasif)} href="/ogrenciler" tone="slate" />
            <DashKpiCard label="Aktif Sözleşme" value={fmtNum(data.ogrenci.kpis.aktif_sozlesme)} href="/odeme-takip" tone="violet" />
            <DashKpiCard label="Bu Ay Yeni Kayıt" value={fmtNum(data.ogrenci.kpis.yeni_kayit_bu_ay)} href="/ogrenciler/yeni-kayit" tone="green" />
          </section>
          <DashOgrenciSection data={data.ogrenci} />
        </>
      )}

      {tab === 'personel' && (
        <>
          <section className="adm-kpi-row">
            <DashKpiCard label="Toplam Personel" value={fmtNum(data.personel.kpis.toplam)} href="/personel" tone="blue" />
            <DashKpiCard label="Öğretmen" value={fmtNum(data.personel.kpis.ogretmen)} href="/personel" tone="green" />
            <DashKpiCard label="İdari Personel" value={fmtNum(data.personel.kpis.idari)} href="/personel" tone="slate" />
            <DashKpiCard
              label="Verilen Ders (saat)"
              value={fmtNum(data.personel.kpis.verilen_ders_saati)}
              href="/personel/gorevlendirmeler"
              tone="violet"
            />
          </section>
          <section className="adm-chart-grid">
            <DashDonutChart title="Personel Türleri" data={data.personel.tur_dagilimi} href="/personel" />
            <DashHBarChart title="Branşlara Göre Öğretmen" data={data.personel.brans_dagilimi} href="/personel" />
            <DashLineChart title="Son 12 Ay İşe Başlayan" data={data.personel.ise_giris_12_ay} href="/personel" />
            <div className="adm-chart-card adm-chart-card--placeholder">
              <div className="adm-chart-card__head">
                <h3>İK Özeti</h3>
              </div>
              <div className="adm-chart-card__body adm-placeholder-body">
                <p>Görevlendirme ve sözleşme detayları için Personel modülünü kullanın.</p>
                <a href="/personel">Personel listesi →</a>
              </div>
            </div>
          </section>
        </>
      )}

      {tab === 'finans' && (
        <>
          <section className="adm-kpi-row">
            <DashKpiCard label="Toplam Kayıt Tutarı" value={fmtMoney(data.finans.kpis.toplam_kayit)} href="/odeme-takip" tone="blue" />
            <DashKpiCard label="Tahsil Edilen" value={fmtMoney(data.finans.kpis.tahsil_edilen)} href="/odeme-takip" tone="green" />
            <DashKpiCard label="Kalan Tahsilat" value={fmtMoney(data.finans.kpis.kalan)} href="/odeme-takip" tone="amber" />
            <DashKpiCard label="Kasa + Banka" value={fmtMoney(data.finans.kpis.kasa_banka)} href="/finans" tone="violet" />
          </section>
          <section className="adm-chart-grid">
            <DashDonutChart title="Tahsilat Durumu" data={data.finans.tahsilat_durumu} href="/odeme-takip" />
            <DashLineChart title="Aylık Tahsilat (12 ay)" data={data.finans.tahsilat_12_ay} href="/finans" />
            <DashDonutChart title="Kasa Dağılımı" data={data.finans.kasa_dagilimi} href="/finans" />
            <div className="adm-chart-card adm-chart-card--placeholder">
              <div className="adm-chart-card__head">
                <h3>Detaylı Finans</h3>
              </div>
              <div className="adm-chart-card__body adm-placeholder-body">
                <p>Gelir/gider, cari ve dönem raporları finans modülünde.</p>
                <a href="/finans/dashboard">Finans dashboard →</a>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
