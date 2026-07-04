'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchYillikRapor, type YillikRapor } from '../services/api';
import { AY_ADLARI } from '../types';

/* ─── CSS ─── */
const inp = 'w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-900 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10';
const btnSecondary = 'px-4 py-2 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-xl hover:bg-gray-50 transition-colors';

const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const SOZLESME_TURU_LABELS: Record<string, string> = {
  TAM_ZAMANLI: 'Tam Zamanlı',
  DERS_UCRETLI: 'Ders Ücretli',
  KARMA: 'Karma',
};
const DURUM_LABELS: Record<string, string> = {
  HESAPLANDI: 'Hesaplandı',
  ONAYLANDI: 'Onaylandı',
  ODENDI: 'Ödendi',
  IPTAL: 'İptal',
};

/* ─── Bar (basit CSS bar chart) ─── */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
      >
        {pct > 15 && <span className="text-[10px] text-white font-medium">{fmtPara(value)}</span>}
      </div>
    </div>
  );
}

/* ═══ Ana Bileşen ═══ */
export default function RaporClient() {
  const [yil, setYil] = useState(new Date().getFullYear());
  const [rapor, setRapor] = useState<YillikRapor | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchYillikRapor(yil);
    if (res.success && res.data) setRapor(res.data);
    setLoading(false);
  }, [yil]);

  useEffect(() => { load(); }, [load]);

  const maxBrut = rapor ? Math.max(...rapor.aylik.map(a => a.brut_toplam), 1) : 1;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            📈 Personel Maliyet Raporu
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Yıllık ve aylık personel gider özetleri
          </p>
        </div>
        <a href="/admin/personel/sozlesmeler" className={btnSecondary}>
          ← Sözleşmelere Dön
        </a>
      </div>

      {/* Yıl seçimi */}
      <div className="flex items-end gap-4 mb-6 bg-white rounded-2xl border border-gray-100 p-4">
        <div>
          <label className="block text-[12px] text-gray-500 font-medium mb-1">Yıl</label>
          <input type="number" className={inp + ' !w-28'} value={yil} onChange={e => setYil(Number(e.target.value))} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      ) : !rapor ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <p className="text-4xl mb-2">📈</p>
          <p className="text-gray-400 text-[14px]">Rapor verisi bulunamadı.</p>
        </div>
      ) : (
        <>
          {/* Genel Özet Kartları */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[12px] text-gray-500 mb-1">💰 Yıllık Toplam Brüt</div>
              <div className="text-2xl font-bold text-amber-600">{fmtPara(rapor.genel_brut)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[12px] text-gray-500 mb-1">💵 Yıllık Toplam Net</div>
              <div className="text-2xl font-bold text-emerald-600">{fmtPara(rapor.genel_net)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[12px] text-gray-500 mb-1">🕐 Yıllık Toplam Ders Saati</div>
              <div className="text-2xl font-bold text-purple-600">{rapor.genel_ders_saat.toFixed(0)}</div>
            </div>
          </div>

          {/* Aylık Kırılım — Bar Chart + Tablo */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <h2 className="text-[14px] font-bold text-gray-800 mb-4">📊 Aylık Brüt Maliyet</h2>
            <div className="space-y-2">
              {rapor.aylik.map(a => (
                <div key={a.ay} className="flex items-center gap-3">
                  <span className="text-[12px] text-gray-500 w-16 text-right shrink-0">{AY_ADLARI[a.ay]}</span>
                  <div className="flex-1">
                    <Bar value={a.brut_toplam} max={maxBrut} color="#6366f1" />
                  </div>
                  <span className="text-[11px] text-gray-400 w-12 text-right shrink-0">
                    {a.personel_sayisi > 0 ? `${a.personel_sayisi} kişi` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detaylı Aylık Tablo */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto mb-6">
            <h2 className="text-[14px] font-bold text-gray-800 p-4 pb-0">📋 Aylık Detay Tablosu</h2>
            <table className="w-full text-[12px] mt-3">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-3 py-2 font-medium">Ay</th>
                  <th className="px-3 py-2 font-medium text-right">Kişi</th>
                  <th className="px-3 py-2 font-medium text-right">Sabit Maaş</th>
                  <th className="px-3 py-2 font-medium text-right">Ders Ücreti</th>
                  <th className="px-3 py-2 font-medium text-right">Prim</th>
                  <th className="px-3 py-2 font-medium text-right">Fazla Mesai</th>
                  <th className="px-3 py-2 font-medium text-right">Ek Ödeme</th>
                  <th className="px-3 py-2 font-medium text-right">Avans</th>
                  <th className="px-3 py-2 font-medium text-right">Kesintiler</th>
                  <th className="px-3 py-2 font-medium text-right">Brüt Toplam</th>
                  <th className="px-3 py-2 font-medium text-right">Net Toplam</th>
                </tr>
              </thead>
              <tbody>
                {rapor.aylik.map(a => (
                  <tr key={a.ay} className={`border-t border-gray-50 ${a.brut_toplam > 0 ? '' : 'opacity-40'}`}>
                    <td className="px-3 py-2 font-medium text-gray-900">{a.ay_adi}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{a.personel_sayisi}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtPara(a.sabit_maas_toplam)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtPara(a.ders_ucret_toplam)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{a.prim_toplam > 0 ? fmtPara(a.prim_toplam) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{a.fazla_mesai_toplam > 0 ? fmtPara(a.fazla_mesai_toplam) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtPara(a.ek_odeme_toplam)}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-600">{a.avans_toplam > 0 ? fmtPara(a.avans_toplam) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtPara(a.kesinti_toplam)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{fmtPara(a.brut_toplam)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">{fmtPara(a.net_toplam)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-3 py-2">YIL TOPLAMI</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">{fmtPara(rapor.aylik.reduce((a, m) => a + m.sabit_maas_toplam, 0))}</td>
                  <td className="px-3 py-2 text-right">{fmtPara(rapor.aylik.reduce((a, m) => a + m.ders_ucret_toplam, 0))}</td>
                  <td className="px-3 py-2 text-right">{fmtPara(rapor.aylik.reduce((a, m) => a + m.prim_toplam, 0))}</td>
                  <td className="px-3 py-2 text-right">{fmtPara(rapor.aylik.reduce((a, m) => a + m.fazla_mesai_toplam, 0))}</td>
                  <td className="px-3 py-2 text-right">{fmtPara(rapor.aylik.reduce((a, m) => a + m.ek_odeme_toplam, 0))}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmtPara(rapor.aylik.reduce((a, m) => a + m.avans_toplam, 0))}</td>
                  <td className="px-3 py-2 text-right">{fmtPara(rapor.aylik.reduce((a, m) => a + m.kesinti_toplam, 0))}</td>
                  <td className="px-3 py-2 text-right">{fmtPara(rapor.genel_brut)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{fmtPara(rapor.genel_net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tür Bazlı Dağılım */}
          {rapor.tur_dagilimi.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-[14px] font-bold text-gray-800 mb-4">📂 Sözleşme Türü Dağılımı</h2>
                <div className="space-y-3">
                  {rapor.tur_dagilimi.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <span className="text-[13px] font-medium text-gray-800">{SOZLESME_TURU_LABELS[t.tur] || t.tur}</span>
                        <span className="text-[11px] text-gray-400 ml-2">{t.kisi_sayisi} kişi</span>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-bold text-gray-900">{fmtPara(t.toplam_brut)}</div>
                        <div className="text-[11px] text-emerald-600">Net: {fmtPara(t.toplam_net)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ödeme Durumu Dağılımı */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-[14px] font-bold text-gray-800 mb-4">📊 Ödeme Durumu</h2>
                <div className="space-y-3">
                  {rapor.durum_dagilimi.map((d, i) => {
                    const colors: Record<string, string> = {
                      HESAPLANDI: 'bg-blue-100 text-blue-700',
                      ONAYLANDI: 'bg-amber-100 text-amber-700',
                      ODENDI: 'bg-emerald-100 text-emerald-700',
                      IPTAL: 'bg-red-100 text-red-700',
                    };
                    return (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${colors[d.durum] || 'bg-gray-100 text-gray-600'}`}>
                            {DURUM_LABELS[d.durum] || d.durum}
                          </span>
                          <span className="text-[13px] text-gray-600">{d.sayi} kayıt</span>
                        </div>
                        <div className="text-[13px] font-bold text-gray-900">{fmtPara(d.toplam)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
