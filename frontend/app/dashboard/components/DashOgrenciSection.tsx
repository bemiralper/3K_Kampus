'use client';

import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminDashboardData } from '@/lib/admin-dashboard-api';
import { CHART_COLORS } from './DashCharts';

type Props = {
  data: AdminDashboardData['ogrenci'];
};

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="adm-chart-card">
      <div className="adm-chart-card__head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="adm-chart-card__sub">{subtitle}</p>}
        </div>
      </div>
      <div className="adm-chart-card__body">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="adm-chart-empty">{text}</div>;
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('tr-TR').format(n);
}

function pct(part: number, total: number) {
  if (total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export default function DashOgrenciSection({ data }: Props) {
  const sinifData = data.sinif_seviyesi_detay.filter((d) => d.toplam > 0);
  const cinsiyetTotal = data.cinsiyet_ozet.toplam || data.cinsiyet.reduce((s, c) => s + c.value, 0);
  const kayitData = data.kayit_12_ay;
  const paketData = [...data.paket_dagilimi].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);

  return (
    <>
      <section className="adm-chart-grid adm-chart-grid--ogrenci">
        <ChartCard
          title="Sınıf Düzeyi Dağılımı"
          subtitle="Her sınıfta kız / erkek öğrenci sayısı"
        >
          {sinifData.length === 0 ? (
            <Empty text="Sınıf verisi yok" />
          ) : (
            <div className="adm-sinif-chart">
              <div className="adm-sinif-chart__graph">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sinifData} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 10 }} width={28} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={((value: number, name: string) => [fmtNum(value), name === 'kiz' ? 'Kız' : 'Erkek']) as never}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 10 }}
                      formatter={(v) => (v === 'kiz' ? 'Kız' : 'Erkek')}
                    />
                    <Bar dataKey="kiz" stackId="sinif" fill="#ec4899" name="kiz" radius={[0, 0, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="erkek" stackId="sinif" fill="#0262a7" name="erkek" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="adm-sinif-table-wrap">
                <table className="adm-sinif-table">
                  <thead>
                    <tr>
                      <th>Sınıf</th>
                      <th>Toplam</th>
                      <th>Kız</th>
                      <th>Erkek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinifData.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td><strong>{fmtNum(row.toplam)}</strong></td>
                        <td>{fmtNum(row.kiz)}</td>
                        <td>{fmtNum(row.erkek)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Kız / Erkek Dağılımı"
          subtitle={`Toplam ${fmtNum(cinsiyetTotal)} öğrenci`}
        >
          {cinsiyetTotal === 0 ? (
            <Empty text="Cinsiyet verisi yok" />
          ) : (
            <div className="adm-cinsiyet-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.cinsiyet.filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="46%"
                    innerRadius="48%"
                    outerRadius="72%"
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {data.cinsiyet.map((entry) => (
                      <Cell key={entry.label} fill={entry.label === 'Kız' ? '#ec4899' : '#0262a7'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={((value: number, name: string) => [
                      `${fmtNum(value)} (${pct(value, cinsiyetTotal)})`,
                      name,
                    ]) as never}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="adm-cinsiyet-legend">
                <span><i className="dot dot--kiz" /> Kız: {fmtNum(data.cinsiyet_ozet.kiz)}</span>
                <span><i className="dot dot--erkek" /> Erkek: {fmtNum(data.cinsiyet_ozet.erkek)}</span>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Son 12 Ay Kayıt" subtitle="Aylık yeni öğrenci kayıtları">
          {kayitData.every((d) => d.value === 0) ? (
            <Empty text="Kayıt verisi yok" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kayitData} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={28} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={((value: number) => [fmtNum(value), 'Kayıt']) as never}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0262a7"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#0262a7' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Eğitim Paketi Dağılımı" subtitle="Aktif sözleşmelere göre">
          {paketData.length === 0 ? (
            <Empty text="Paket verisi yok" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={paketData.slice(0, 8)} margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={88} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={((value: number) => [fmtNum(value), 'Öğrenci']) as never}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {paketData.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      <section className="adm-birthdays">
        <div className="adm-birthdays__head">
          <div>
            <h3>🎂 Yaklaşan Doğum Günleri</h3>
            <p>
              {data.dogum_gunleri.ozet.bugun > 0 && (
                <span className="adm-birthdays__badge adm-birthdays__badge--today">
                  Bugün {data.dogum_gunleri.ozet.bugun}
                </span>
              )}
              {data.dogum_gunleri.ozet.yarin > 0 && (
                <span className="adm-birthdays__badge adm-birthdays__badge--tomorrow">
                  Yarın {data.dogum_gunleri.ozet.yarin}
                </span>
              )}
              <span className="adm-birthdays__hint">
                Önümüzdeki 30 gün içinde {fmtNum(data.dogum_gunleri.ozet.otuz_gun_icinde)} doğum günü
              </span>
            </p>
          </div>
        </div>
        {data.dogum_gunleri.yaklasan.length === 0 ? (
          <p className="adm-birthdays__empty">Önümüzdeki 30 gün içinde doğum günü kaydı bulunamadı.</p>
        ) : (
          <div className="adm-birthdays__list">
            {data.dogum_gunleri.yaklasan.map((item) => (
              <Link
                key={`${item.ogrenci_id}-${item.dogum_gunu}`}
                href={`/ogrenciler/${item.ogrenci_id}`}
                className={`adm-birthday-card${item.kalan_gun === 0 ? ' is-today' : ''}${item.kalan_gun === 1 ? ' is-tomorrow' : ''}`}
              >
                <div className="adm-birthday-card__date">
                  <span className="adm-birthday-card__etiket">{item.etiket}</span>
                  <span className="adm-birthday-card__gun">{item.dogum_gunu}</span>
                </div>
                <div className="adm-birthday-card__info">
                  <strong>{item.ad_soyad}</strong>
                  <span>{item.sinif} · {item.yas} yaş</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
