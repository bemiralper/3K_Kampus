'use client';

import Link from 'next/link';
import type { AdminDashboardData } from '@/lib/admin-dashboard-api';
import {
  DashCard,
  DashDonut,
  DashRankList,
  DashStackedBars,
  DashTrend,
  fmtNum,
} from './DashCharts';

type Props = {
  data: AdminDashboardData['ogrenci'];
};

export default function DashOgrenciSection({ data }: Props) {
  const sinifData = data.sinif_seviyesi_detay.filter((d) => d.toplam > 0);
  const cinsiyetRows = data.cinsiyet.filter((d) => d.value > 0);
  const cinsiyetTotal =
    data.cinsiyet_ozet.toplam || cinsiyetRows.reduce((sum, c) => sum + c.value, 0);
  const birthdays = data.dogum_gunleri;

  return (
    <>
      <div className="adm-grid">
        <DashCard
          title="Sınıf Düzeyi Dağılımı"
          subtitle="Sınıf başına kız / erkek öğrenci"
          href="/ogrenciler"
          span
        >
          <DashStackedBars data={sinifData} emptyText="Sınıf verisi bulunamadı" />
          {sinifData.length > 0 && (
            <div className="adm-card__foot adm-card__foot--legend">
              <span>
                <i className="adm-legend__dot adm-legend__dot--kiz" /> Kız
              </span>
              <span>
                <i className="adm-legend__dot adm-legend__dot--erkek" /> Erkek
              </span>
              <span className="adm-card__foot-total">
                Toplam {fmtNum(sinifData.reduce((s, r) => s + r.toplam, 0))} öğrenci
              </span>
            </div>
          )}
        </DashCard>

        <DashCard
          title="Kız / Erkek Dağılımı"
          subtitle={`${fmtNum(cinsiyetTotal)} aktif öğrenci`}
        >
          <DashDonut
            data={cinsiyetRows}
            centerLabel="Öğrenci"
            emptyText="Cinsiyet verisi bulunamadı"
            colors={['#ec4899', '#0262a7', '#94a3b8']}
          />
        </DashCard>

        <DashCard
          title="Son 12 Ay Kayıt"
          subtitle="Aylık yeni öğrenci kaydı"
          href="/ogrenciler/yeni-kayit"
          linkLabel="Yeni kayıt"
        >
          <DashTrend
            data={data.kayit_12_ay}
            seriesName="Kayıt"
            emptyText="Kayıt verisi bulunamadı"
          />
        </DashCard>

        <DashCard
          title="Eğitim Paketi Dağılımı"
          subtitle="Aktif sözleşmelere göre"
          href="/odeme-takip"
        >
          <DashRankList
            data={data.paket_dagilimi}
            emptyText="Paket verisi bulunamadı"
            limit={8}
          />
        </DashCard>
      </div>

      <DashCard
        title="🎂 Yaklaşan Doğum Günleri"
        subtitle={`Önümüzdeki 30 gün içinde ${fmtNum(birthdays.ozet.otuz_gun_icinde)} doğum günü`}
        action={
          <div className="adm-badges">
            {birthdays.ozet.bugun > 0 && (
              <span className="adm-badge adm-badge--today">Bugün {birthdays.ozet.bugun}</span>
            )}
            {birthdays.ozet.yarin > 0 && (
              <span className="adm-badge adm-badge--tomorrow">Yarın {birthdays.ozet.yarin}</span>
            )}
          </div>
        }
      >
        {birthdays.yaklasan.length === 0 ? (
          <p className="adm-note">Önümüzdeki 30 gün içinde doğum günü kaydı bulunamadı.</p>
        ) : (
          <div className="adm-bd-list">
            {birthdays.yaklasan.map((item) => (
              <Link
                key={`${item.ogrenci_id}-${item.dogum_gunu}`}
                href={`/ogrenciler/${item.ogrenci_id}`}
                className={`adm-bd${item.kalan_gun === 0 ? ' is-today' : ''}${
                  item.kalan_gun === 1 ? ' is-tomorrow' : ''
                }`}
              >
                <span className="adm-bd__date">
                  <span className="adm-bd__etiket">{item.etiket}</span>
                  <span className="adm-bd__gun">{item.dogum_gunu}</span>
                </span>
                <span className="adm-bd__info">
                  <strong>{item.ad_soyad}</strong>
                  <span>
                    {item.sinif} · {item.yas} yaş
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </DashCard>
    </>
  );
}
