'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  PersonelOdemeGecmisi,
  AvansKaydi,
  AY_ADLARI,
  HAKEDIS_DURUM_COLORS,
} from '../../types';
import {
  fetchPersonelOdemeGecmisi,
  getBordroPdfTekilUrl,
  createAvans,
  deleteAvans,
} from '../../services/api';

/* ═══════════════════════════════════════════
   Personel Detay — Ödeme Geçmişi Sayfası
   ═══════════════════════════════════════════ */

const fmtPara = (n: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

const fmtTarih = (d: string) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('tr-TR');
};

interface Props {
  personelId: number;
}

export default function PersonelDetayClient({ personelId }: Props) {
  const router = useRouter();

  const [data, setData] = useState<PersonelOdemeGecmisi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'hakedis' | 'avans'>('hakedis');

  // Avans form
  const [avansFormOpen, setAvansFormOpen] = useState(false);
  const [avansForm, setAvansForm] = useState({ tarih: '', tutar: '', aciklama: '', mahsup_yil: new Date().getFullYear(), mahsup_ay: new Date().getMonth() + 1, sozlesme_id: 0 });
  const [avansLoading, setAvansLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPersonelOdemeGecmisi(personelId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Veri yüklenemedi');
      }
    } catch {
      setError('Sunucu hatası');
    } finally {
      setLoading(false);
    }
  }, [personelId]);

  useEffect(() => { load(); }, [load]);

  // ── Avans Ekleme ──
  const handleAvansEkle = async () => {
    if (!avansForm.sozlesme_id || !avansForm.tarih || !avansForm.tutar) return;
    setAvansLoading(true);
    try {
      const res = await createAvans({
        sozlesme_id: avansForm.sozlesme_id,
        tarih: avansForm.tarih,
        tutar: parseFloat(avansForm.tutar),
        aciklama: avansForm.aciklama,
        mahsup_yil: avansForm.mahsup_yil,
        mahsup_ay: avansForm.mahsup_ay,
      });
      if (res.success) {
        setAvansForm({ ...avansForm, tarih: '', tutar: '', aciklama: '' });
        setAvansFormOpen(false);
        load();
      } else {
        alert(res.error || 'Avans eklenemedi');
      }
    } catch {
      alert('Sunucu hatası');
    } finally {
      setAvansLoading(false);
    }
  };

  // ── Avans Silme ──
  const handleAvansSil = async (id: number) => {
    if (!confirm('Bu avans kaydını silmek istediğinize emin misiniz?')) return;
    try {
      const res = await deleteAvans(id);
      if (res.success) {
        load();
      } else {
        alert(res.error || 'Avans silinemedi');
      }
    } catch {
      alert('Sunucu hatası');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">{error || 'Veri bulunamadı'}</div>
        <button onClick={() => router.back()} className="mt-4 text-sm text-indigo-600 hover:underline">← Geri Dön</button>
      </div>
    );
  }

  const { personel, hakedisler, avanslar, ozet } = data;

  // Sözleşme ID'lerini topla (avans formu için)
  const sozlesmeIds = [...new Set(hakedisler.map(h => h.sozlesme_id))];

  return (
    <div className="space-y-5">
      {/* ── Üst Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 text-lg"
            title="Geri Dön"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{personel.tam_ad}</h1>
            <p className="text-xs text-gray-500">Ödeme Geçmişi & Avans Kayıtları</p>
          </div>
        </div>
      </div>

      {/* ── Özet Kartları ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Toplam Ay" value={String(ozet.toplam_ay)} color="indigo" />
        <SummaryCard label="Toplam Brüt" value={fmtPara(ozet.toplam_brut)} color="blue" />
        <SummaryCard label="Toplam Net" value={fmtPara(ozet.toplam_net)} color="emerald" />
        <SummaryCard label="Toplam Ders Saati" value={String(ozet.toplam_ders_saat)} color="purple" />
        <SummaryCard label="Toplam Avans" value={fmtPara(ozet.toplam_avans)} color="red" />
        <SummaryCard label="Ödenen Ay" value={`${ozet.odenen_ay} / ${ozet.toplam_ay}`} color="teal" />
      </div>

      {/* ── Tab Butonları ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('hakedis')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tab === 'hakedis' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📊 Maaş Bordroları ({hakedisler.length})
        </button>
        <button
          onClick={() => setTab('avans')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tab === 'avans' ? 'bg-white shadow text-purple-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          💸 Avans Kayıtları ({avanslar.length})
        </button>
      </div>

      {/* ═══ Hakedis Tab ═══ */}
      {tab === 'hakedis' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
                  <th className="px-3 py-2.5 font-medium text-left">Dönem</th>
                  <th className="px-3 py-2.5 font-medium text-right">Aylık Maaş</th>
                  <th className="px-3 py-2.5 font-medium text-right">Ders Saati</th>
                  <th className="px-3 py-2.5 font-medium text-right">Ders Ücreti</th>
                  <th className="px-3 py-2.5 font-medium text-right">Prim</th>
                  <th className="px-3 py-2.5 font-medium text-right">Fazla Mesai</th>
                  <th className="px-3 py-2.5 font-medium text-right">Ek Ödeme</th>
                  <th className="px-3 py-2.5 font-medium text-right">Avans</th>
                  <th className="px-3 py-2.5 font-medium text-right">Kesintiler</th>
                  <th className="px-3 py-2.5 font-medium text-right">Net Ödeme</th>
                  <th className="px-3 py-2.5 font-medium">Durum</th>
                  <th className="px-3 py-2.5 font-medium text-center">PDF</th>
                </tr>
              </thead>
              <tbody>
                {hakedisler.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Henüz bordro kaydı yok</td></tr>
                ) : (
                  hakedisler.map(h => (
                    <tr key={h.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {AY_ADLARI[h.ay]} {h.yil}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-700">{fmtPara(h.sabit_maas)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-700">{h.toplam_ders_saati || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-700">
                        {h.ders_ucreti_toplam > 0 ? fmtPara(h.ders_ucreti_toplam) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-700">{h.prim > 0 ? fmtPara(h.prim) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-700">{h.fazla_mesai > 0 ? fmtPara(h.fazla_mesai) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-700">{h.ek_odeme > 0 ? fmtPara(h.ek_odeme) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <span className={h.avans > 0 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                          {h.avans > 0 ? fmtPara(h.avans) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <span className={h.kesintiler > 0 ? 'text-red-600' : 'text-gray-700'}>
                          {h.kesintiler > 0 ? fmtPara(h.kesintiler) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">
                        {fmtPara(h.net_hakedis)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                          style={{ backgroundColor: HAKEDIS_DURUM_COLORS[h.durum] }}
                        >
                          {h.durum_display}
                        </span>
                        {h.odeme_tarihi && (
                          <div className="text-[9px] text-gray-400 mt-0.5">{fmtTarih(h.odeme_tarihi)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          className="p-1 rounded-lg hover:bg-indigo-50 text-indigo-500 text-[14px]"
                          title="PDF İndir"
                          onClick={() => window.open(getBordroPdfTekilUrl(h.id), '_blank')}
                        >
                          📄
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {hakedisler.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-700 text-[12px]">
                    <td className="px-3 py-2.5">TOPLAM</td>
                    <td className="px-3 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.sabit_maas, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{hakedisler.reduce((a, h) => a + h.toplam_ders_saati, 0).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.ders_ucreti_toplam, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.prim, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.fazla_mesai, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.ek_odeme, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{fmtPara(hakedisler.reduce((a, h) => a + h.avans, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{fmtPara(hakedisler.reduce((a, h) => a + h.kesintiler, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-700">{fmtPara(hakedisler.reduce((a, h) => a + h.net_hakedis, 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ═══ Avans Tab ═══ */}
      {tab === 'avans' && (
        <div className="space-y-4">
          {/* Avans Ekle Butonu */}
          {sozlesmeIds.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setAvansForm({ ...avansForm, sozlesme_id: sozlesmeIds[0] });
                  setAvansFormOpen(!avansFormOpen);
                }}
                className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors"
              >
                + Avans Ekle
              </button>
            </div>
          )}

          {/* Avans Form */}
          {avansFormOpen && (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
              <h3 className="text-sm font-semibold text-purple-800 mb-3">Yeni Avans Kaydı</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {sozlesmeIds.length > 1 && (
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Sözleşme</label>
                    <select
                      className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg"
                      value={avansForm.sozlesme_id}
                      onChange={e => setAvansForm({ ...avansForm, sozlesme_id: Number(e.target.value) })}
                    >
                      {sozlesmeIds.map(id => (
                        <option key={id} value={id}>Sözleşme #{id}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Tarih</label>
                  <input
                    type="date"
                    className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg"
                    value={avansForm.tarih}
                    onChange={e => setAvansForm({ ...avansForm, tarih: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Tutar (₺)</label>
                  <input
                    type="number"
                    className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg"
                    value={avansForm.tutar}
                    onChange={e => setAvansForm({ ...avansForm, tutar: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Mahsup Yıl</label>
                  <input
                    type="number"
                    className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg"
                    value={avansForm.mahsup_yil}
                    onChange={e => setAvansForm({ ...avansForm, mahsup_yil: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Mahsup Ay</label>
                  <select
                    className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg"
                    value={avansForm.mahsup_ay}
                    onChange={e => setAvansForm({ ...avansForm, mahsup_ay: Number(e.target.value) })}
                  >
                    {Object.entries(AY_ADLARI).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Açıklama</label>
                  <input
                    type="text"
                    className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg"
                    value={avansForm.aciklama}
                    onChange={e => setAvansForm({ ...avansForm, aciklama: e.target.value })}
                    placeholder="İsteğe bağlı"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleAvansEkle}
                  disabled={avansLoading || !avansForm.tarih || !avansForm.tutar}
                  className="px-4 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {avansLoading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                <button
                  onClick={() => setAvansFormOpen(false)}
                  className="px-4 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300 transition-colors"
                >
                  İptal
                </button>
              </div>
            </div>
          )}

          {/* Avans Tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
                    <th className="px-3 py-2.5 font-medium text-left">Tarih</th>
                    <th className="px-3 py-2.5 font-medium text-right">Tutar</th>
                    <th className="px-3 py-2.5 font-medium text-left">Açıklama</th>
                    <th className="px-3 py-2.5 font-medium text-left">Mahsup Dönemi</th>
                    <th className="px-3 py-2.5 font-medium text-left">Oluşturan</th>
                    <th className="px-3 py-2.5 font-medium text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {avanslar.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Henüz avans kaydı yok</td></tr>
                  ) : (
                    avanslar.map(a => (
                      <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2.5 font-medium text-gray-900">{fmtTarih(a.tarih)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-red-600">{fmtPara(a.tutar)}</td>
                        <td className="px-3 py-2.5 text-gray-600">{a.aciklama || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-700">
                          {AY_ADLARI[a.mahsup_ay]} {a.mahsup_yil}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-[11px]">{a.olusturan || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            className="p-1 rounded-lg hover:bg-red-50 text-red-500 text-[14px]"
                            title="Sil"
                            onClick={() => handleAvansSil(a.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {avanslar.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700 text-[12px]">
                      <td className="px-3 py-2.5">TOPLAM</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{fmtPara(avanslar.reduce((a, b) => a + b.tutar, 0))}</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Bilgi Notu ── */}
      <div className="bg-blue-50 rounded-xl p-3 text-[11px] text-blue-700">
        <strong>💡 Bilgi:</strong> Bu sayfada {personel.tam_ad} için tüm aylık maaş bordroları ve avans kayıtları listelenmektedir.
        Avans kayıtları otomatik olarak ilgili ayın bordrosundaki avans alanına yansır.
      </div>
    </div>
  );
}


/* ═══ Özet Kart Bileşeni ═══ */
const CARD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-100' },
};

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  const c = CARD_COLORS[color] || CARD_COLORS.indigo;
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-3`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold ${c.text}`}>{value}</div>
    </div>
  );
}
