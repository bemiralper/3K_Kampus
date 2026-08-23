'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchAdminDashboard,
  type AdminDashboardData,
} from '@/lib/admin-dashboard-api';
import DashKpiCard from './components/DashKpiCard';
import DashOgrenciSection from './components/DashOgrenciSection';
import {
  DashCard,
  DashDonut,
  DashRankList,
  DashRatio,
  DashTrend,
  fmtMoney,
  fmtNum,
  pctOf,
} from './components/DashCharts';
import './admin-dashboard.css';

type TabId = 'ogrenci' | 'personel' | 'finans';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'ogrenci', label: 'Öğrenci', icon: '🎓' },
  { id: 'personel', label: 'Personel', icon: '👥' },
  { id: 'finans', label: 'Finans', icon: '💰' },
];

function QuickLinks({ items }: { items: { href: string; label: string; desc: string; icon: string }[] }) {
  return (
    <ul className="adm-links">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href}>
            <span className="adm-links__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="adm-links__text">
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </span>
            <span className="adm-links__chev" aria-hidden="true">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div className="adm-dash">
      <div className="adm-skel adm-skel--head" />
      <div className="adm-kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="adm-skel adm-skel--kpi" />
        ))}
      </div>
      <div className="adm-skel adm-skel--tabs" />
      <div className="adm-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="adm-skel adm-skel--card" />
        ))}
      </div>
    </div>
  );
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
        <span aria-hidden="true">🏫</span>
        <h2>Bağlam seçilmedi</h2>
        <p>Üst menüden kurum, şube ve eğitim yılını seçtiğinizde panel yüklenir.</p>
      </div>
    );
  }

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="adm-dash adm-dash--state">
        <span aria-hidden="true">⚠️</span>
        <h2>Panel yüklenemedi</h2>
        <p>{error || 'Veri alınamadı.'}</p>
        <button type="button" className="adm-btn" onClick={load}>
          Tekrar dene
        </button>
      </div>
    );
  }

  const ctxChips = [
    activeKurum.ad,
    activeSube.ad,
    activeEgitimYili
      ? `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}`
      : '',
  ].filter(Boolean);

  const tahsilatOrani = pctOf(data.finans.kpis.tahsil_edilen, data.finans.kpis.toplam_kayit);

  return (
    <div className="adm-dash">
      <header className="adm-head">
        <div className="adm-head__row">
          <h1>Yönetim Paneli</h1>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={load}>
            <span aria-hidden="true">↻</span> Yenile
          </button>
        </div>
        <div className="adm-head__chips">
          {ctxChips.map((chip) => (
            <span key={chip} className="adm-chip">
              {chip}
            </span>
          ))}
        </div>
      </header>

      <section className="adm-kpi-grid" aria-label="Genel özet">
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
          hint={`Kasa ${fmtMoney(data.genel.kasa_toplam)} · Banka ${fmtMoney(
            data.genel.banka_toplam,
          )}${data.genel.pos_toplam ? ` · POS ${fmtMoney(data.genel.pos_toplam)}` : ''}`}
          href="/finans"
          tone="amber"
          icon="💰"
        />
      </section>

      <nav className="adm-tabs" aria-label="Panel bölümleri">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`adm-tab${tab === t.id ? ' is-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'ogrenci' && (
        <>
          <section className="adm-kpi-grid adm-kpi-grid--compact" aria-label="Öğrenci özeti">
            <DashKpiCard label="Aktif" value={fmtNum(data.ogrenci.kpis.aktif)} href="/ogrenciler" tone="blue" icon="✅" />
            <DashKpiCard label="Pasif" value={fmtNum(data.ogrenci.kpis.pasif)} href="/ogrenciler" tone="slate" icon="⏸️" />
            <DashKpiCard
              label="Aktif Sözleşme"
              value={fmtNum(data.ogrenci.kpis.aktif_sozlesme)}
              href="/odeme-takip"
              tone="violet"
              icon="📄"
            />
            <DashKpiCard
              label="Bu Ay Yeni Kayıt"
              value={fmtNum(data.ogrenci.kpis.yeni_kayit_bu_ay)}
              href="/ogrenciler/yeni-kayit"
              tone="green"
              icon="🆕"
            />
          </section>
          <DashOgrenciSection data={data.ogrenci} />
        </>
      )}

      {tab === 'personel' && (
        <>
          <section className="adm-kpi-grid adm-kpi-grid--compact" aria-label="Personel özeti">
            <DashKpiCard label="Toplam Personel" value={fmtNum(data.personel.kpis.toplam)} href="/personel" tone="blue" icon="👥" />
            <DashKpiCard label="Öğretmen" value={fmtNum(data.personel.kpis.ogretmen)} href="/personel" tone="green" icon="🧑‍🏫" />
            <DashKpiCard label="İdari Personel" value={fmtNum(data.personel.kpis.idari)} href="/personel" tone="slate" icon="🗂️" />
            <DashKpiCard
              label="Verilen Ders"
              value={`${fmtNum(data.personel.kpis.verilen_ders_saati)} saat`}
              href="/personel/gorevlendirmeler"
              tone="violet"
              icon="⏱️"
            />
          </section>
          <div className="adm-grid">
            <DashCard title="Branşlara Göre Öğretmen" subtitle="En çok öğretmeni olan branşlar" href="/personel" span>
              <DashRankList data={data.personel.brans_dagilimi} emptyText="Branş verisi bulunamadı" />
            </DashCard>
            <DashCard title="Personel Türleri" subtitle="Kadro dağılımı" href="/personel">
              <DashDonut data={data.personel.tur_dagilimi} centerLabel="Personel" emptyText="Tür verisi bulunamadı" />
            </DashCard>
            <DashCard title="Son 12 Ay İşe Başlayan" subtitle="Aylık işe giriş sayısı" href="/personel">
              <DashTrend
                data={data.personel.ise_giris_12_ay}
                seriesName="İşe giriş"
                color="#10b981"
                emptyText="İşe giriş verisi bulunamadı"
              />
            </DashCard>
            <DashCard title="Hızlı İşlemler" subtitle="Personel modülü kısayolları">
              <QuickLinks
                items={[
                  { href: '/personel', label: 'Personel listesi', desc: 'Tüm kadroyu görüntüle ve filtrele', icon: '📋' },
                  { href: '/personel/gorevlendirmeler', label: 'Görevlendirmeler', desc: 'Ders ve görev atamaları', icon: '🗓️' },
                  { href: '/personel/ayarlar', label: 'Personel ayarları', desc: 'Kadro ve unvan tanımları', icon: '⚙️' },
                ]}
              />
            </DashCard>
          </div>
        </>
      )}

      {tab === 'finans' && (
        <>
          <section className="adm-kpi-grid" aria-label="Finans özeti">
            <DashKpiCard
              label="Toplam Kayıt Tutarı"
              value={fmtMoney(data.finans.kpis.toplam_kayit)}
              href="/odeme-takip"
              tone="blue"
              icon="🧾"
            />
            <DashKpiCard
              label="Tahsil Edilen"
              value={fmtMoney(data.finans.kpis.tahsil_edilen)}
              href="/odeme-takip"
              tone="green"
              icon="✅"
            />
            <DashKpiCard
              label="Kalan Tahsilat"
              value={fmtMoney(data.finans.kpis.kalan)}
              href="/finans/gecikmis-odemeler"
              tone="amber"
              icon="⏳"
            />
            <DashKpiCard
              label="Kasa + Banka"
              value={fmtMoney(data.finans.kpis.kasa_banka)}
              href="/finans/tanimlar?tab=mali-hesaplar"
              tone="violet"
              icon="🏦"
            />
          </section>
          <div className="adm-grid">
            <DashCard title="Aylık Tahsilat" subtitle="Son 12 ayın tahsilat tutarı" href="/finans/tahsilat-raporlar" span>
              <DashTrend
                data={data.finans.tahsilat_12_ay}
                format="money"
                seriesName="Tahsilat"
                emptyText="Tahsilat verisi bulunamadı"
              />
            </DashCard>
            <DashCard title="Tahsilat Oranı" subtitle="Kayıt tutarına göre tahsilat">
              <DashRatio
                ratio={tahsilatOrani}
                ratioLabel="tahsil edildi"
                rows={[
                  { label: 'Toplam kayıt', value: data.finans.kpis.toplam_kayit },
                  { label: 'Tahsil edilen', value: data.finans.kpis.tahsil_edilen, tone: 'green' },
                  { label: 'Kalan', value: data.finans.kpis.kalan, tone: 'amber' },
                ]}
              />
            </DashCard>
            <DashCard title="Tahsilat Durumu" subtitle="Taksit durumlarına göre" href="/odeme-takip">
              <DashDonut
                data={data.finans.tahsilat_durumu}
                format="money"
                centerLabel="Tutar"
                emptyText="Durum verisi bulunamadı"
              />
            </DashCard>
            <DashCard title="Kasa Dağılımı" subtitle="Mali hesap bakiyeleri" href="/finans/tanimlar?tab=mali-hesaplar">
              <DashRankList
                data={data.finans.kasa_dagilimi}
                format="money"
                emptyText="Mali hesap verisi bulunamadı"
              />
            </DashCard>
          </div>
        </>
      )}
    </div>
  );
}
