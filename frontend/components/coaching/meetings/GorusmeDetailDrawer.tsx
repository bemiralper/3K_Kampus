'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  aksiyonService,
  gorusmeService,
  hatirlatmaService,
} from '@/app/admin/coaching/meetings/services/gorusme-api';
import {
  AKSIYON_SORUMLULARI,
  GORUSME_DURUMLARI,
  GORUSME_TURLERI,
  GORUSME_YONTEMLERI,
  type GorusmeAksiyon,
  type GorusmeKaydiDetail,
} from '@/app/admin/coaching/meetings/types';

function fmtTarih(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fmtSaat(t: string | null | undefined) {
  if (!t) return '';
  return t.slice(0, 5);
}

export interface GorusmeDetailDrawerProps {
  gorusmeId: number;
  onClose: () => void;
  onEdit?: (id: number) => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
  readOnly?: boolean;
}

export default function GorusmeDetailDrawer({
  gorusmeId,
  onClose,
  onEdit,
  onUpdated,
  onDeleted,
  readOnly = false,
}: GorusmeDetailDrawerProps) {
  const [detailItem, setDetailItem] = useState<GorusmeKaydiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newAksiyon, setNewAksiyon] = useState({
    aciklama: '',
    sorumlu: 'ogrenci',
    deadline: '',
  });
  const [newHatirlatma, setNewHatirlatma] = useState({
    mesaj: '',
    hatirlatma_tarihi: '',
    tip: 'genel',
  });

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const detail = await gorusmeService.get(gorusmeId);
      setDetailItem(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detay yüklenemedi.');
      setDetailItem(null);
    } finally {
      setLoading(false);
    }
  }, [gorusmeId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 3500);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  async function handleDelete() {
    if (!detailItem) return;
    if (!confirm('Bu görüşmeyi silmek istediğinize emin misiniz?')) return;
    try {
      await gorusmeService.delete(detailItem.id);
      setSuccess('Görüşme silindi.');
      onDeleted?.();
      onUpdated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi.');
    }
  }

  async function handleDurumGuncelle(durum: string) {
    if (!detailItem || detailItem.durum === durum) return;
    try {
      const res = await gorusmeService.durumGuncelle(detailItem.id, durum);
      setSuccess(res.detail);
      const updated = await gorusmeService.get(detailItem.id);
      setDetailItem(updated);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durum güncellenemedi.');
    }
  }

  async function handleAddAksiyon() {
    if (!detailItem || !newAksiyon.aciklama.trim()) return;
    try {
      await aksiyonService.create(detailItem.id, {
        aciklama: newAksiyon.aciklama,
        sorumlu: newAksiyon.sorumlu,
        deadline: newAksiyon.deadline || null,
      });
      setNewAksiyon({ aciklama: '', sorumlu: 'ogrenci', deadline: '' });
      const updated = await gorusmeService.get(detailItem.id);
      setDetailItem(updated);
      setSuccess('Aksiyon eklendi.');
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksiyon eklenemedi.');
    }
  }

  async function handleToggleAksiyon(aksiyon: GorusmeAksiyon) {
    try {
      await aksiyonService.update(aksiyon.id, { tamamlandi: !aksiyon.tamamlandi });
      if (detailItem) {
        const updated = await gorusmeService.get(detailItem.id);
        setDetailItem(updated);
        onUpdated?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi.');
    }
  }

  async function handleDeleteAksiyon(id: number) {
    try {
      await aksiyonService.delete(id);
      if (detailItem) {
        const updated = await gorusmeService.get(detailItem.id);
        setDetailItem(updated);
        onUpdated?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi.');
    }
  }

  async function handleAddHatirlatma() {
    if (!detailItem || !newHatirlatma.mesaj.trim() || !newHatirlatma.hatirlatma_tarihi) return;
    try {
      await hatirlatmaService.create(detailItem.id, {
        mesaj: newHatirlatma.mesaj,
        hatirlatma_tarihi: newHatirlatma.hatirlatma_tarihi,
        tip: newHatirlatma.tip,
      });
      setNewHatirlatma({ mesaj: '', hatirlatma_tarihi: '', tip: 'genel' });
      const updated = await gorusmeService.get(detailItem.id);
      setDetailItem(updated);
      setSuccess('Hatırlatma eklendi.');
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hatırlatma eklenemedi.');
    }
  }

  async function handleDeleteHatirlatma(id: number) {
    try {
      await hatirlatmaService.delete(id);
      if (detailItem) {
        const updated = await gorusmeService.get(detailItem.id);
        setDetailItem(updated);
        onUpdated?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi.');
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-gray-950/40 backdrop-blur-sm z-[150]"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-[200] w-full max-w-[680px] flex flex-col bg-white shadow-2xl shadow-gray-900/20">
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-gray-200"
          style={{ background: 'linear-gradient(135deg, #eef2ff, #fff)' }}
        >
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-gray-900 truncate">
              {loading && !detailItem ? 'Yükleniyor…' : detailItem?.konu || 'Görüşme Detayı'}
            </h2>
            {detailItem && (
              <p className="text-[12px] text-gray-500 mt-0.5">
                {detailItem.ogrenci_adi} — {detailItem.koc_adi}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {loading && !detailItem && (
            <div className="space-y-4">
              <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
            </div>
          )}

          {error && !detailItem && !loading && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              {error}
            </div>
          )}

          {detailItem && (
            <>
              {readOnly ? (
                <div className="flex items-center gap-2">
                  {(() => {
                    const d = GORUSME_DURUMLARI.find((x) => x.value === detailItem.durum);
                    return (
                      <span
                        className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border-2 border-current shadow-sm ${
                          d?.color ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {detailItem.durum_display}
                      </span>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {GORUSME_DURUMLARI.map((d) => {
                    const active = detailItem.durum === d.value;
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => !active && handleDurumGuncelle(d.value)}
                        className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border-2 transition-all ${
                          active
                            ? `${d.color} border-current shadow-sm`
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Tür</div>
                  <div className="text-[12px] font-bold text-gray-700">
                    {GORUSME_TURLERI.find((t) => t.value === detailItem.gorusme_turu)?.icon}{' '}
                    {detailItem.gorusme_turu_display}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Yöntem</div>
                  <div className="text-[12px] font-bold text-gray-700">
                    {GORUSME_YONTEMLERI.find((y) => y.value === detailItem.yontem)?.icon}{' '}
                    {detailItem.yontem_display}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Tarih</div>
                  <div className="text-[12px] font-bold text-gray-700">{fmtTarih(detailItem.gorusme_tarihi)}</div>
                  {detailItem.gorusme_saati && (
                    <div className="text-[10px] text-gray-400">{fmtSaat(detailItem.gorusme_saati)}</div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Süre</div>
                  <div className="text-[12px] font-bold text-gray-700">
                    {detailItem.sure_dakika ? `${detailItem.sure_dakika} dk` : '—'}
                  </div>
                </div>
              </div>

              {(detailItem.motivasyon_skoru ||
                detailItem.akademik_ozguven_skoru ||
                detailItem.stres_seviyesi) && (
                <div className="grid grid-cols-3 gap-3">
                  {detailItem.motivasyon_skoru && (
                    <div className="bg-indigo-50 rounded-xl p-2.5 text-center border border-indigo-100">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">Motivasyon</div>
                      <div className="text-[12px] font-bold text-indigo-600 mt-0.5">
                        {['Çok Düşük', 'Düşük', 'Orta', 'İyi', 'Çok İyi'][detailItem.motivasyon_skoru - 1]}
                      </div>
                      <div className="text-[10px] text-indigo-400">{detailItem.motivasyon_skoru}/5</div>
                    </div>
                  )}
                  {detailItem.akademik_ozguven_skoru && (
                    <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-100">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Ak. Özgüven</div>
                      <div className="text-[12px] font-bold text-emerald-600 mt-0.5">
                        {['Çok Düşük', 'Düşük', 'Orta', 'İyi', 'Çok İyi'][detailItem.akademik_ozguven_skoru - 1]}
                      </div>
                      <div className="text-[10px] text-emerald-400">{detailItem.akademik_ozguven_skoru}/5</div>
                    </div>
                  )}
                  {detailItem.stres_seviyesi && (
                    <div className="bg-orange-50 rounded-xl p-2.5 text-center border border-orange-100">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-orange-400">Stres</div>
                      <div className="text-[12px] font-bold text-orange-600 mt-0.5">
                        {['Çok Düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok Yüksek'][detailItem.stres_seviyesi - 1]}
                      </div>
                      <div className="text-[10px] text-orange-400">{detailItem.stres_seviyesi}/5</div>
                    </div>
                  )}
                </div>
              )}

              {detailItem.etiketler && detailItem.etiketler.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detailItem.etiketler.map((e) => (
                    <span
                      key={e}
                      className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-[12px] font-semibold"
                    >
                      #{e}
                    </span>
                  ))}
                </div>
              )}

              {detailItem.notlar && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    Görüşme Notları
                  </h3>
                  <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-4 border border-gray-100">
                    {detailItem.notlar}
                  </div>
                </div>
              )}

              {detailItem.veli_ile_paylasilsin && (
                <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px]">👨‍👩‍👧</span>
                    <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">
                      Veli ile Paylaşılıyor
                    </h3>
                  </div>
                  {detailItem.veli_ozet && (
                    <div className="text-[13px] text-amber-800 bg-amber-100/50 rounded-xl p-3">
                      {detailItem.veli_ozet}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                    Aksiyon Planı ({detailItem.aksiyonlar?.length || 0})
                  </h3>
                  {detailItem.aksiyonlar?.length > 0 && (
                    <span className="text-[11px] font-semibold text-emerald-600">
                      {detailItem.aksiyonlar.filter((a) => a.tamamlandi).length}/{detailItem.aksiyonlar.length}{' '}
                      tamamlandı
                    </span>
                  )}
                </div>

                <div className="divide-y divide-gray-50">
                  {detailItem.aksiyonlar?.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                      {readOnly ? (
                        <span
                          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                            a.tamamlandi
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-gray-300'
                          }`}
                        >
                          {a.tamamlandi && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleAksiyon(a)}
                          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                            a.tamamlandi
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-gray-300 hover:border-indigo-400'
                          }`}
                        >
                          {a.tamamlandi && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[13px] font-medium ${
                            a.tamamlandi ? 'text-gray-400 line-through' : 'text-gray-800'
                          }`}
                        >
                          {a.aciklama}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                          <span className="font-semibold">{a.sorumlu_display}</span>
                          {a.deadline && <span>⏰ {fmtTarih(a.deadline)}</span>}
                        </div>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAksiyon(a.id)}
                          className="p-1 text-gray-300 hover:text-rose-500 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {!readOnly && (
                  <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        placeholder="Yeni aksiyon maddesi..."
                        value={newAksiyon.aciklama}
                        onChange={(e) => setNewAksiyon({ ...newAksiyon, aciklama: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddAksiyon()}
                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                      />
                      <select
                        value={newAksiyon.sorumlu}
                        onChange={(e) => setNewAksiyon({ ...newAksiyon, sorumlu: e.target.value })}
                        className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-[12px] outline-none"
                      >
                        {AKSIYON_SORUMLULARI.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={newAksiyon.deadline}
                        onChange={(e) => setNewAksiyon({ ...newAksiyon, deadline: e.target.value })}
                        className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-[12px] outline-none w-full sm:w-[130px]"
                      />
                      <button
                        type="button"
                        onClick={handleAddAksiyon}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-[12px] font-bold hover:bg-indigo-700 transition-colors"
                      >
                        Ekle
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 01-3.46 0" />
                    </svg>
                    Hatırlatmalar ({detailItem.hatirlatmalar?.length || 0})
                  </h3>
                </div>

                <div className="divide-y divide-gray-50">
                  {detailItem.hatirlatmalar?.map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors">
                      <div>
                        <div className="text-[13px] font-medium text-gray-800">{h.mesaj}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                          <span>📅 {fmtTarih(h.hatirlatma_tarihi)}</span>
                          <span className="font-semibold">{h.tip_display}</span>
                        </div>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => handleDeleteHatirlatma(h.id)}
                          className="p-1 text-gray-300 hover:text-rose-500 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {!readOnly && (
                  <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        placeholder="Hatırlatma mesajı..."
                        value={newHatirlatma.mesaj}
                        onChange={(e) => setNewHatirlatma({ ...newHatirlatma, mesaj: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddHatirlatma()}
                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                      />
                      <input
                        type="date"
                        value={newHatirlatma.hatirlatma_tarihi}
                        onChange={(e) =>
                          setNewHatirlatma({ ...newHatirlatma, hatirlatma_tarihi: e.target.value })
                        }
                        className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-[12px] outline-none w-full sm:w-[130px]"
                      />
                      <button
                        type="button"
                        onClick={handleAddHatirlatma}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-[12px] font-bold hover:bg-indigo-700 transition-colors"
                      >
                        Ekle
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {detailItem.sonraki_gorusme_tarihi && (
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex items-center gap-3">
                  <span className="text-[18px]">📅</span>
                  <div>
                    <div className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest">
                      Sonraki Görüşme
                    </div>
                    <div className="text-[14px] font-bold text-indigo-700">
                      {fmtTarih(detailItem.sonraki_gorusme_tarihi)}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-[11px] text-gray-400">
                {detailItem.olusturan_adi && <span>Oluşturan: {detailItem.olusturan_adi}</span>}
                <span>Oluşturulma: {fmtTarih(detailItem.created_at)}</span>
              </div>
            </>
          )}
        </div>

        {detailItem && (
          <div
            className={`flex items-center px-6 py-4 border-t border-gray-200 ${
              readOnly ? 'justify-end' : 'justify-between'
            }`}
          >
            {!readOnly && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-rose-500 hover:bg-rose-50 rounded-xl text-[13px] font-medium transition-colors"
              >
                Sil
              </button>
            )}
            <div className="flex items-center gap-3">
              {!readOnly && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(detailItem.id)}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[13px] font-medium hover:bg-indigo-700 transition-colors"
                >
                  Düzenle
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-transparent border-2 border-gray-200 rounded-xl text-[14px] font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                Kapat
              </button>
            </div>
          </div>
        )}
      </div>

      {(success || error) && detailItem && (
        <div className="fixed bottom-6 right-6 z-[250]">
          <div
            className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl ${
              success
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-700'
                : 'bg-rose-50/95 border-rose-200 text-rose-700'
            }`}
          >
            <span className="text-[13px] font-semibold">{success || error}</span>
          </div>
        </div>
      )}
    </>
  );
}
