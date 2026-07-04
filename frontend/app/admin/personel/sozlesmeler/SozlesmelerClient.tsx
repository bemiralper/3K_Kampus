'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  fetchSozlesmeler, fetchSozlesmeStats, fetchHelperData,
  createSozlesme, updateSozlesme, deleteSozlesme, changeSozlesmeDurum,
} from './services/api';
import type {
  Sozlesme, SozlesmeFormData, SozlesmeStats, HelperData,
  SozlesmeTuru, SozlesmeDurumu, DersUcret, UcretTipi, UcretDonemi, FesihData,
} from './types';
import {
  SOZLESME_TURU_COLORS, DURUM_COLORS, DURUM_LABELS,
} from './types';

/* ─── Ortak CSS ─── */
const inp = 'w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10';
const sel = inp + ' appearance-none cursor-pointer';
const btnPrimary = 'px-4 py-2 bg-indigo-600 text-white text-[13px] font-medium rounded-xl hover:bg-indigo-700 transition-colors';
const btnSecondary = 'px-4 py-2 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-xl hover:bg-gray-50 transition-colors';

/* ─── Format ─── */
const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtTarih = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/* ═══ Ana Bileşen ═══ */
export default function SozlesmelerClient() {
  const { activeKurum } = useKurum();

  // ── State ──
  const [sozlesmeler, setSozlesmeler] = useState<Sozlesme[]>([]);
  const [stats, setStats] = useState<SozlesmeStats | null>(null);
  const [helper, setHelper] = useState<HelperData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [search, setSearch] = useState('');
  const [durumFiltre, setDurumFiltre] = useState('');
  const [turFiltre, setTurFiltre] = useState('');

  // Form drawer
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Sozlesme | null>(null);
  const [saving, setSaving] = useState(false);

  // Detay drawer
  const [detayItem, setDetayItem] = useState<Sozlesme | null>(null);

  // Fesih modal
  const [fesihItem, setFesihItem] = useState<Sozlesme | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Veri yükleme ──
  const load = useCallback(async () => {
    setLoading(true);
    const filters: Record<string, string> = {};
    if (search) filters.search = search;
    if (durumFiltre) filters.durum = durumFiltre;
    if (turFiltre) filters.sozlesme_turu = turFiltre;

    const [sRes, stRes, hRes] = await Promise.all([
      fetchSozlesmeler(filters),
      fetchSozlesmeStats(),
      fetchHelperData(),
    ]);
    if (sRes.success && sRes.data) setSozlesmeler(sRes.data);
    if (stRes.success && stRes.data) setStats(stRes.data);
    if (hRes.success && hRes.data) setHelper(hRes.data);
    setLoading(false);
  }, [search, durumFiltre, turFiltre]);

  useEffect(() => { load(); }, [load]);

  // ── Form kaydet ──
  const handleSave = async (data: SozlesmeFormData) => {
    setSaving(true);
    try {
      const res = editItem
        ? await updateSozlesme(editItem.id, data)
        : await createSozlesme(data);
      if (res.success) {
        showToast('success', editItem ? 'Sözleşme güncellendi.' : 'Sözleşme oluşturuldu.');
        setShowForm(false);
        setEditItem(null);
        load();
      } else {
        showToast('error', res.error || 'Bir hata oluştu.');
      }
    } catch {
      showToast('error', 'Sunucu hatası.');
    }
    setSaving(false);
  };

  // ── Sil ──
  const handleDelete = async (id: number) => {
    if (!confirm('Sözleşmeyi silmek istediğinize emin misiniz?')) return;
    const res = await deleteSozlesme(id);
    if (res.success) {
      showToast('success', 'Sözleşme silindi.');
      load();
    } else {
      showToast('error', res.error || 'Silinemedi.');
    }
  };

  // ── Durum değiştir ──
  const handleDurum = async (id: number, durum: string) => {
    const res = await changeSozlesmeDurum(id, durum);
    if (res.success) {
      showToast('success', 'Durum güncellendi.');
      load();
    } else {
      showToast('error', res.error || 'Durum değiştirilemedi.');
    }
  };

  // ── Fesih ──
  const handleFesih = async (data: FesihData) => {
    if (!fesihItem) return;
    const res = await changeSozlesmeDurum(fesihItem.id, 'FESHEDILDI', data);
    if (res.success) {
      showToast('success', 'Sözleşme feshedildi.');
      setFesihItem(null);
      load();
    } else {
      showToast('error', res.error || 'Fesih işlemi başarısız.');
    }
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-lg text-white text-[13px] font-medium ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Başlık ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            📄 Personel Sözleşmeleri
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Sözleşmeleri yönetin, maaş ve ders ücretlerini takip edin
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin/personel/sozlesmeler/puantaj" className={btnSecondary}>
            💰 Maaş Bordrosu
          </a>
          <a href="/admin/personel/sozlesmeler/odeme-onay" className={btnSecondary}>
            ✅ Ödeme Onay
          </a>
          <a href="/admin/personel/sozlesmeler/rapor" className={btnSecondary}>
            📈 Rapor
          </a>
          <button className={btnPrimary} onClick={() => { setEditItem(null); setShowForm(true); }}>
            + Yeni Sözleşme
          </button>
        </div>
      </div>

      {/* ── İstatistik Kartları ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon="📄" label="Toplam" value={stats.toplam} color="#6366f1" />
          <StatCard icon="✅" label="Aktif" value={stats.aktif} color="#10b981" />
          <StatCard icon="📝" label="Taslak" value={stats.taslak} color="#6b7280" />
          <StatCard icon="💰" label="Toplam Brüt Maaş" value={fmtPara(stats.toplam_brut_maas)} color="#f59e0b" />
        </div>
      )}

      {/* ── Filtreler ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className={inp + ' !w-64'}
          placeholder="🔍 Personel ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={sel + ' !w-44'} value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)}>
          <option value="">Tüm Durumlar</option>
          {helper?.sozlesme_durumlari.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <select className={sel + ' !w-52'} value={turFiltre} onChange={e => setTurFiltre(e.target.value)}>
          <option value="">Tüm Türler</option>
          {helper?.sozlesme_turleri.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* ── Liste ── */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      ) : sozlesmeler.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <p className="text-4xl mb-2">📄</p>
          <p className="text-gray-400 text-[14px]">Henüz sözleşme bulunmuyor.</p>
          <button className={btnPrimary + ' mt-4'} onClick={() => { setEditItem(null); setShowForm(true); }}>
            İlk Sözleşmeyi Oluştur
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="px-4 py-3 font-medium">Personel</th>
                <th className="px-4 py-3 font-medium">Tür</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium text-right">Brüt Maaş</th>
                <th className="px-4 py-3 font-medium text-right">Net Maaş</th>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium text-center">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sozlesmeler.map(s => (
                <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      className="text-left hover:text-indigo-600 transition-colors"
                      onClick={() => setDetayItem(s)}
                    >
                      <div className="font-medium text-gray-900 hover:text-indigo-600">{s.personel_ad}</div>
                    </button>
                    {s.ders_ucreti_aktif && (
                      <div className="text-[11px] text-purple-500 mt-0.5">
                        💎 {s.ders_ucretleri.length} ders ücreti tanımı
                      </div>
                    )}
                    {s.ucret_donemleri && s.ucret_donemleri.length > 0 && (
                      <div className="text-[11px] text-blue-500 mt-0.5">
                        📊 {s.ucret_donemleri.length} ücret dönemi
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                      style={{ backgroundColor: SOZLESME_TURU_COLORS[s.sozlesme_turu] }}
                    >
                      {s.sozlesme_turu_display}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                      style={{ backgroundColor: DURUM_COLORS[s.durum] }}
                    >
                      {s.durum_display}
                    </span>
                    {s.durum === 'FESHEDILDI' && s.fesih_tarihi && (
                      <div className="text-[10px] text-red-400 mt-0.5">
                        {fmtTarih(s.fesih_tarihi)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{fmtPara(s.brut_maas)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{fmtPara(s.net_maas)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {fmtTarih(s.baslangic_tarihi)} – {fmtTarih(s.bitis_tarihi)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {/* Detay */}
                      <button
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                        title="Detay Görüntüle"
                        onClick={() => setDetayItem(s)}
                      >👁️</button>
                      {/* Düzenle */}
                      <button
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors"
                        title="Düzenle"
                        onClick={() => { setEditItem(s); setShowForm(true); }}
                      >✏️</button>
                      {/* Aktifleştir (TASLAK) */}
                      {s.durum === 'TASLAK' && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                          title="Aktifleştir"
                          onClick={() => handleDurum(s.id, 'AKTIF')}
                        >✅</button>
                      )}
                      {/* Askıya Al (AKTIF) */}
                      {s.durum === 'AKTIF' && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
                          title="Askıya Al"
                          onClick={() => handleDurum(s.id, 'ASKIDA')}
                        >⏸️</button>
                      )}
                      {/* Aktif Et (ASKIDA) */}
                      {s.durum === 'ASKIDA' && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                          title="Aktif Et"
                          onClick={() => handleDurum(s.id, 'AKTIF')}
                        >▶️</button>
                      )}
                      {/* Feshet (AKTIF veya ASKIDA veya TASLAK) */}
                      {(s.durum === 'AKTIF' || s.durum === 'ASKIDA' || s.durum === 'TASLAK') && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          title="Feshet"
                          onClick={() => setFesihItem(s)}
                        >❌</button>
                      )}
                      {/* Sil */}
                      <button
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                        title="Sil"
                        onClick={() => handleDelete(s.id)}
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Form Drawer ── */}
      {showForm && helper && (
        <SozlesmeFormDrawer
          helper={helper}
          initial={editItem}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {/* ── Detay Drawer ── */}
      {detayItem && (
        <SozlesmeDetayDrawer
          sozlesme={detayItem}
          onClose={() => setDetayItem(null)}
          onEdit={() => { setDetayItem(null); setEditItem(detayItem); setShowForm(true); }}
        />
      )}

      {/* ── Fesih Modal ── */}
      {fesihItem && (
        <FesihModal
          sozlesme={fesihItem}
          onConfirm={handleFesih}
          onClose={() => setFesihItem(null)}
        />
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════
   İstatistik Kartı
   ═══════════════════════════════════════════ */
function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-[12px] text-gray-500 font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}


/* ═══════════════════════════════════════════
   Sözleşme Detay Drawer (#5)
   ═══════════════════════════════════════════ */
function SozlesmeDetayDrawer({
  sozlesme: s,
  onClose,
  onEdit,
}: {
  sozlesme: Sozlesme;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[100]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[560px] bg-white z-[101] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            📋 Sözleşme Detayı
          </h2>
          <div className="flex items-center gap-2">
            <button className="text-indigo-500 hover:text-indigo-700 text-[13px] font-medium" onClick={onEdit}>
              ✏️ Düzenle
            </button>
            <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Personel */}
          <div className="flex items-center gap-3">
            {s.personel_foto ? (
              <img src={s.personel_foto} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                {s.personel_ad.charAt(0)}
              </div>
            )}
            <div>
              <div className="font-bold text-gray-900 text-[15px]">{s.personel_ad}</div>
              <div className="text-[12px] text-gray-500">{s.egitim_yili_display}</div>
            </div>
          </div>

          {/* Durum & Tür */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block px-2.5 py-1 rounded-full text-[11px] font-medium text-white"
              style={{ backgroundColor: SOZLESME_TURU_COLORS[s.sozlesme_turu] }}
            >
              {s.sozlesme_turu_display}
            </span>
            <span
              className="inline-block px-2.5 py-1 rounded-full text-[11px] font-medium text-white"
              style={{ backgroundColor: DURUM_COLORS[s.durum] }}
            >
              {s.durum_display}
            </span>
          </div>

          {/* Tarihler */}
          <InfoRow label="Başlangıç" value={fmtTarih(s.baslangic_tarihi)} />
          <InfoRow label="Bitiş" value={fmtTarih(s.bitis_tarihi)} />

          {/* Maaş */}
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Brüt Maaş" value={fmtPara(s.brut_maas)} />
            <InfoRow label="Net Maaş" value={fmtPara(s.net_maas)} />
          </div>
          <InfoRow label="SGK Gün" value={String(s.sgk_gun)} />

          {/* ── Ücret Dönemleri ── */}
          {s.ucret_donemleri && s.ucret_donemleri.length > 0 && (
            <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/30">
              <h3 className="text-[14px] font-semibold text-blue-800 mb-3 flex items-center gap-1.5">
                📊 Dönemsel Ücretlendirme
              </h3>
              <div className="space-y-2">
                {s.ucret_donemleri.map((ud, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-100">
                    <div>
                      <div className="text-[13px] font-medium text-gray-900">
                        {ud.baslangic_ay}. ay – {ud.bitis_ay === 0 ? 'sonrası' : `${ud.bitis_ay}. ay`}
                      </div>
                      {ud.aciklama && (
                        <div className="text-[11px] text-gray-500">{ud.aciklama}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-bold text-blue-700">{fmtPara(ud.brut_maas)}</div>
                      {ud.net_maas > 0 && (
                        <div className="text-[11px] text-gray-500">Net: {fmtPara(ud.net_maas)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Ders Ücretleri ── */}
          {s.ders_ucreti_aktif && s.ders_ucretleri.length > 0 && (
            <div className="border border-purple-100 rounded-xl p-4 bg-purple-50/30">
              <h3 className="text-[14px] font-semibold text-purple-800 mb-3 flex items-center gap-1.5">
                💎 Ders Ücreti Tanımları
              </h3>
              <div className="space-y-2">
                {s.ders_ucretleri.map((du, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-100">
                    <div>
                      <div className="text-[13px] font-medium text-gray-900">{du.brans_ad || 'Genel'}</div>
                      <div className="text-[11px] text-gray-500">{du.ucret_tipi_display} • Haftalık {du.haftalik_saat} saat</div>
                    </div>
                    <div className="text-[14px] font-bold text-purple-700">{fmtPara(du.birim_ucret)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Fesih Bilgileri ── */}
          {s.durum === 'FESHEDILDI' && (
            <div className="border border-red-100 rounded-xl p-4 bg-red-50/30">
              <h3 className="text-[14px] font-semibold text-red-800 mb-3 flex items-center gap-1.5">
                ❌ Fesih Bilgileri
              </h3>
              <InfoRow label="Fesih Tarihi" value={fmtTarih(s.fesih_tarihi)} />
              {s.fesih_sebebi && (
                <div className="mt-2">
                  <span className="text-[12px] text-gray-500 font-medium">Fesih Sebebi:</span>
                  <p className="text-[13px] text-gray-800 mt-1 whitespace-pre-wrap">{s.fesih_sebebi}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Açıklama / Notlar ── */}
          {s.notlar && (
            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/30">
              <h3 className="text-[14px] font-semibold text-gray-700 mb-2">📝 Notlar / Açıklama</h3>
              <p className="text-[13px] text-gray-600 whitespace-pre-wrap">{s.notlar}</p>
            </div>
          )}

          {/* Dosya */}
          {s.sozlesme_dosya && (
            <div>
              <span className="text-[12px] text-gray-500 font-medium">Sözleşme Dosyası:</span>
              <a
                href={s.sozlesme_dosya}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-1 text-[13px] text-indigo-600 hover:underline"
              >
                📎 Dosyayı İndir
              </a>
            </div>
          )}

          {/* Oluşturulma */}
          <InfoRow label="Oluşturulma" value={fmtTarih(s.created_at)} />
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[12px] text-gray-500 font-medium">{label}</span>
      <span className="text-[13px] text-gray-900 font-medium">{value}</span>
    </div>
  );
}


/* ═══════════════════════════════════════════
   Fesih Modal (#2)
   ═══════════════════════════════════════════ */
function FesihModal({
  sozlesme,
  onConfirm,
  onClose,
}: {
  sozlesme: Sozlesme;
  onConfirm: (data: FesihData) => void;
  onClose: () => void;
}) {
  const [sebebi, setSebebi] = useState('');
  const [tarihi, setTarihi] = useState(new Date().toISOString().split('T')[0]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[200]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-full max-w-[480px] bg-white rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            ❌ Sözleşme Fesih
          </h3>
          <p className="text-[13px] text-gray-500 mt-1">
            <strong>{sozlesme.personel_ad}</strong> adlı personelin sözleşmesi feshedilecek.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Fesih Tarihi *</label>
            <input type="date" className={inp} value={tarihi} onChange={e => setTarihi(e.target.value)} required />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Fesih Sebebi *</label>
            <textarea
              className={inp + ' !h-28 resize-none'}
              value={sebebi}
              onChange={e => setSebebi(e.target.value)}
              placeholder="Fesih gerekçesini yazınız..."
              required
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button className={btnSecondary} onClick={onClose}>İptal</button>
          <button
            className="px-4 py-2 bg-red-600 text-white text-[13px] font-medium rounded-xl hover:bg-red-700 transition-colors"
            onClick={() => {
              if (!sebebi.trim()) {
                alert('Fesih sebebi zorunludur.');
                return;
              }
              onConfirm({ fesih_sebebi: sebebi, fesih_tarihi: tarihi });
            }}
          >
            Feshet
          </button>
        </div>
      </div>
    </>
  );
}


/* ═══════════════════════════════════════════
   Sözleşme Form Drawer
   ═══════════════════════════════════════════ */
interface FormDrawerProps {
  helper: HelperData;
  initial: Sozlesme | null;
  saving: boolean;
  onSave: (data: SozlesmeFormData) => void;
  onClose: () => void;
}

function SozlesmeFormDrawer({ helper, initial, saving, onSave, onClose }: FormDrawerProps) {
  const isEdit = !!initial;

  // Form state
  const [personelId, setPersonelId] = useState(initial?.personel_id || 0);
  const [sozlesmeTuru, setSozlesmeTuru] = useState<SozlesmeTuru>(initial?.sozlesme_turu || 'TAM_ZAMANLI');
  const [baslangic, setBaslangic] = useState(initial?.baslangic_tarihi || '');
  const [bitis, setBitis] = useState(initial?.bitis_tarihi || '');
  const [brutMaas, setBrutMaas] = useState(String(initial?.brut_maas ?? '0'));
  const [netMaas, setNetMaas] = useState(String(initial?.net_maas ?? '0'));
  const [sgkGun, setSgkGun] = useState(String(initial?.sgk_gun ?? '30'));
  const [notlar, setNotlar] = useState(initial?.notlar || '');

  // Ders ücretleri
  const [dersUcretleri, setDersUcretleri] = useState<DersUcret[]>(
    initial?.ders_ucretleri || []
  );

  // Ücret dönemleri (#1)
  const [ucretDonemleri, setUcretDonemleri] = useState<UcretDonemi[]>(
    initial?.ucret_donemleri || []
  );

  const showDersUcreti = sozlesmeTuru === 'DERS_UCRETLI' || sozlesmeTuru === 'KARMA';

  const addDersUcret = () => {
    setDersUcretleri([
      ...dersUcretleri,
      { brans_id: null, ucret_tipi: 'SAAT_BASI' as UcretTipi, birim_ucret: 0, haftalik_saat: 0, min_saat: null, max_saat: null, notlar: '' },
    ]);
  };

  const updateDersUcret = (idx: number, field: string, val: unknown) => {
    const arr = [...dersUcretleri];
    (arr[idx] as unknown as Record<string, unknown>)[field] = val;
    setDersUcretleri(arr);
  };

  const removeDersUcret = (idx: number) => {
    setDersUcretleri(dersUcretleri.filter((_, i) => i !== idx));
  };

  // Ücret dönemi yardımcıları
  const addUcretDonemi = () => {
    const lastBitis = ucretDonemleri.length > 0
      ? ucretDonemleri[ucretDonemleri.length - 1].bitis_ay
      : 0;
    setUcretDonemleri([
      ...ucretDonemleri,
      {
        baslangic_ay: lastBitis + 1,
        bitis_ay: 0,
        brut_maas: 0,
        net_maas: 0,
        aciklama: '',
      },
    ]);
  };

  const updateUcretDonemi = (idx: number, field: string, val: unknown) => {
    const arr = [...ucretDonemleri];
    (arr[idx] as unknown as Record<string, unknown>)[field] = val;
    setUcretDonemleri(arr);
  };

  const removeUcretDonemi = (idx: number) => {
    setUcretDonemleri(ucretDonemleri.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      personel_id: personelId,
      sozlesme_turu: sozlesmeTuru,
      baslangic_tarihi: baslangic,
      bitis_tarihi: bitis,
      brut_maas: parseFloat(brutMaas) || 0,
      net_maas: parseFloat(netMaas) || 0,
      sgk_gun: parseInt(sgkGun) || 30,
      ders_ucreti_aktif: showDersUcreti,
      notlar,
      ders_ucretleri: showDersUcreti ? dersUcretleri : [],
      ucret_donemleri: ucretDonemleri,
    });
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-[100]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[640px] bg-white z-[101] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? '✏️ Sözleşme Düzenle' : '📄 Yeni Sözleşme'}
          </h2>
          <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Personel */}
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Personel *</label>
            <select className={sel} value={personelId} onChange={e => setPersonelId(Number(e.target.value))} required>
              <option value={0}>Seçiniz...</option>
              {helper.personeller.map(p => (
                <option key={p.id} value={p.id}>{p.tam_ad}</option>
              ))}
            </select>
          </div>

          {/* Sözleşme Türü */}
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Sözleşme Türü *</label>
            <select className={sel} value={sozlesmeTuru} onChange={e => setSozlesmeTuru(e.target.value as SozlesmeTuru)}>
              {helper.sozlesme_turleri.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Tarihler */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Başlangıç *</label>
              <input type="date" className={inp} value={baslangic} onChange={e => setBaslangic(e.target.value)} required />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Bitiş *</label>
              <input type="date" className={inp} value={bitis} onChange={e => setBitis(e.target.value)} required />
            </div>
          </div>

          {/* Maaş */}
          {(sozlesmeTuru === 'TAM_ZAMANLI' || sozlesmeTuru === 'KARMA') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Brüt Maaş (₺) *</label>
                <input type="number" step="0.01" className={inp} value={brutMaas} onChange={e => setBrutMaas(e.target.value)} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Net Maaş (₺)</label>
                <input type="number" step="0.01" className={inp} value={netMaas} onChange={e => setNetMaas(e.target.value)} />
              </div>
            </div>
          )}

          {/* SGK */}
          <div className="w-32">
            <label className="block text-[12px] font-medium text-gray-600 mb-1">SGK Gün</label>
            <input type="number" min={0} max={30} className={inp} value={sgkGun} onChange={e => setSgkGun(e.target.value)} />
          </div>

          {/* ── Ücret Dönemleri Bölümü (#1) ── */}
          {(sozlesmeTuru === 'TAM_ZAMANLI' || sozlesmeTuru === 'KARMA') && (
            <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-blue-800 flex items-center gap-1.5">
                  📊 Dönemsel Ücretlendirme
                  <span className="text-[11px] font-normal text-blue-500 ml-1">(opsiyonel)</span>
                </h3>
                <button type="button" className="text-[12px] text-blue-600 font-medium hover:underline" onClick={addUcretDonemi}>
                  + Dönem Ekle
                </button>
              </div>

              {ucretDonemleri.length === 0 ? (
                <p className="text-[12px] text-gray-400 text-center py-3">
                  Dönem tanımı yoksa sözleşmedeki sabit maaş kullanılır.
                  <br />
                  <span className="text-blue-500">Ör: İlk 3 ay 30.000₺, sonrası 40.000₺</span>
                </p>
              ) : (
                <div className="space-y-3">
                  {ucretDonemleri.map((ud, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-gray-100 p-3 relative">
                      <button
                        type="button"
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-[12px]"
                        onClick={() => removeUcretDonemi(idx)}
                      >✕</button>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Başlangıç Ayı</label>
                          <input
                            type="number" min={1} className={inp + ' !text-[12px] !py-2'}
                            value={ud.baslangic_ay || ''}
                            onChange={e => updateUcretDonemi(idx, 'baslangic_ay', parseInt(e.target.value) || 1)}
                            placeholder="1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Bitiş Ayı <span className="text-gray-400">(0=sonra)</span></label>
                          <input
                            type="number" min={0} className={inp + ' !text-[12px] !py-2'}
                            value={ud.bitis_ay === 0 ? '' : ud.bitis_ay}
                            onChange={e => updateUcretDonemi(idx, 'bitis_ay', parseInt(e.target.value) || 0)}
                            placeholder="0 (sonsuza kadar)"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Brüt Maaş (₺)</label>
                          <input
                            type="number" step="0.01" className={inp + ' !text-[12px] !py-2'}
                            value={ud.brut_maas || ''}
                            onChange={e => updateUcretDonemi(idx, 'brut_maas', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Net Maaş (₺)</label>
                          <input
                            type="number" step="0.01" className={inp + ' !text-[12px] !py-2'}
                            value={ud.net_maas || ''}
                            onChange={e => updateUcretDonemi(idx, 'net_maas', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="block text-[11px] text-gray-500 mb-0.5">Açıklama</label>
                        <input
                          type="text" className={inp + ' !text-[12px] !py-2'}
                          value={ud.aciklama || ''}
                          onChange={e => updateUcretDonemi(idx, 'aciklama', e.target.value)}
                          placeholder="Ör: Deneme süresi, Zam sonrası..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Ders Ücreti Bölümü ── */}
          {showDersUcreti && (
            <div className="border border-purple-100 rounded-xl p-4 bg-purple-50/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-purple-800 flex items-center gap-1.5">
                  💎 Ders Ücreti Tanımları
                </h3>
                <button type="button" className="text-[12px] text-purple-600 font-medium hover:underline" onClick={addDersUcret}>
                  + Ekle
                </button>
              </div>

              {dersUcretleri.length === 0 ? (
                <p className="text-[12px] text-gray-400 text-center py-4">
                  Henüz ders ücreti tanımı eklenmedi.
                </p>
              ) : (
                <div className="space-y-3">
                  {dersUcretleri.map((du, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-gray-100 p-3 relative">
                      <button
                        type="button"
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-[12px]"
                        onClick={() => removeDersUcret(idx)}
                      >✕</button>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Branş</label>
                          <select
                            className={sel + ' !text-[12px] !py-2'}
                            value={du.brans_id || ''}
                            onChange={e => updateDersUcret(idx, 'brans_id', e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">Genel</option>
                            {helper.branslar.map(b => (
                              <option key={b.id} value={b.id}>{b.ad}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Ücret Tipi</label>
                          <select
                            className={sel + ' !text-[12px] !py-2'}
                            value={du.ucret_tipi}
                            onChange={e => updateDersUcret(idx, 'ucret_tipi', e.target.value)}
                          >
                            {helper.ucret_tipleri.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Birim Ücret (₺)</label>
                          <input
                            type="number" step="0.01" className={inp + ' !text-[12px] !py-2'}
                            value={du.birim_ucret || ''}
                            onChange={e => updateDersUcret(idx, 'birim_ucret', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Haftalık Saat</label>
                          <input
                            type="number" step="0.5" className={inp + ' !text-[12px] !py-2'}
                            value={du.haftalik_saat || ''}
                            onChange={e => updateDersUcret(idx, 'haftalik_saat', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notlar */}
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Notlar</label>
            <textarea className={inp + ' !h-20 resize-none'} value={notlar} onChange={e => setNotlar(e.target.value)} placeholder="Opsiyonel notlar..." />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button type="button" className={btnSecondary} onClick={onClose}>İptal</button>
          <button
            className={btnPrimary}
            disabled={saving}
            onClick={() => {
              const form = document.querySelector('form');
              form?.requestSubmit();
            }}
          >
            {saving ? '⏳ Kaydediliyor...' : isEdit ? 'Güncelle' : 'Oluştur'}
          </button>
        </div>
      </div>
    </>
  );
}
