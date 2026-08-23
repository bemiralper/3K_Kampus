"use client";

import { useCallback, useEffect, useState } from "react";
import { gunSonuService } from "@/app/finans/services/para-hareketi-api";
import type { GunSonuWhatsappRecipient } from "@/app/finans/types/para-hareketi-types";

function fmtTl(value?: number | null) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value || 0);
}

interface GunSonuWhatsappModalProps {
  kurumId: number;
  gun: string;
  notlar: string;
  raporTipi: "ozet" | "detay";
  meta?: { tarih?: string; sube?: string; baslik?: string };
  gunlukOzet?: {
    toplam_alinan?: number;
    toplam_tahsilat?: number;
    toplam_gider?: number;
    toplam_iade?: number;
  };
  onClose: () => void;
  onSent?: (sent: number) => void;
}

export default function GunSonuWhatsappModal({
  kurumId,
  gun,
  notlar,
  raporTipi,
  meta,
  gunlukOzet,
  onClose,
  onSent,
}: GunSonuWhatsappModalProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [recipients, setRecipients] = useState<GunSonuWhatsappRecipient[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sentCount, setSentCount] = useState<number | null>(null);
  const tarih = meta?.tarih || gun;
  const toplamGiren = fmtTl(gunlukOzet?.toplam_alinan ?? gunlukOzet?.toplam_tahsilat);
  const toplamCikan = fmtTl((gunlukOzet?.toplam_gider || 0) + (gunlukOzet?.toplam_iade || 0));
  const ozetSatirlari = `Kuruma giren: ${toplamGiren} TL\nKurumdan çıkan: ${toplamCikan} TL`;
  const raporAd = raporTipi === "detay" ? "Gün Sonu Detay Raporu" : "Gün Sonu Raporu";
  const messageBody = `Değerli Yetkilimiz,\n${tarih} tarihine ait ${raporAd} ekte PDF olarak bilgilerinize sunulmuştur.\n\n${ozetSatirlari}\n\nİyi çalışmalar dileriz.`;

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await gunSonuService.whatsappPreview({
        kurum_id: kurumId,
        rapor_tipi: raporTipi,
      });
      const list = res.recipients || [];
      setRecipients(list);
      const preselected = list.filter((r) => r.selected !== false).map((r) => r.id);
      setSelected(new Set(preselected.length ? preselected : list.map((r) => r.id)));
      if (res.warning && !list.length) {
        setError(res.warning);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alıcı listesi yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [kurumId, raporTipi]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0) {
      setError("En az bir alıcı seçin.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await gunSonuService.whatsappSend({
        kurum_id: kurumId,
        gun,
        notlar,
        recipient_ids: Array.from(selected),
        rapor_tipi: raporTipi,
      });
      setSentCount(res.sent);
      onSent?.(res.sent);
      if (!res.success) {
        setError((res.errors || []).join(" ") || "Gönderim tamamlanamadı.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim başarısız");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-800">WhatsApp ile Gönder</h3>
            <p className="text-xs text-gray-500 mt-0.5">{raporAd} PDF’i seçili yetkililere gider</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {sentCount !== null && sentCount > 0 ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
              {sentCount} yetkiliye rapor gönderildi.
            </div>
          ) : null}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
          )}

          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-500 block">Gönderilecek mesaj</span>
            <div className="px-3 py-2 border border-gray-100 rounded-xl bg-gray-50">
              <div className="text-[11px] font-semibold text-emerald-700 mb-1">{raporAd}</div>
              <p className="text-sm text-gray-700 whitespace-pre-line m-0">{messageBody}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">Alıcılar (yetkili / yöneticiler)</span>
              {!loading && recipients.length > 0 && (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-blue-600"
                  onClick={() => setSelected(new Set(recipients.map((r) => r.id)))}
                >
                  Tümünü seç
                </button>
              )}
            </div>
            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">Yükleniyor…</div>
            ) : recipients.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                {error
                  ? "Alıcı listesi yüklenemedi."
                  : "Gönderilecek kişi yok. Finans → Mali Hesaplar → Yetkililer’den tüm hesaplar için yetkili ekleyin."}
              </div>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {recipients.map((r) => (
                  <li key={r.id}>
                    <label className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800">{r.ad_soyad}</div>
                        <div className="text-[11px] text-gray-500">
                          {[r.rol, r.mali_hesap_ad, r.telefon_maskeli].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-xl">
            {sentCount ? "Kapat" : "İptal"}
          </button>
          {sentCount === null || sentCount === 0 ? (
            <button
              type="button"
              disabled={sending || loading || recipients.length === 0}
              onClick={handleSend}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
            >
              {sending ? "Gönderiliyor…" : "WhatsApp Gönder"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
