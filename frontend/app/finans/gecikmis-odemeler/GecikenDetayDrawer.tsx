"use client";

import Link from "next/link";
import FinansFormDrawer from "@/components/finans/FinansFormDrawer";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import type { OverduePaymentDetail, OverduePaymentItem } from "../types/overdue-types";

interface GecikenDetayDrawerProps {
  item: OverduePaymentItem | null;
  detail: OverduePaymentDetail | null;
  loading: boolean;
  odemeHref: (path?: string) => string;
  homeHref: string;
  onClose: () => void;
  onTahsilat: () => void;
  onWhatsapp: () => void;
  onCall: () => void;
  onNotEkle: () => void;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}

export default function GecikenDetayDrawer({
  item,
  detail,
  loading,
  odemeHref,
  homeHref,
  onClose,
  onTahsilat,
  onWhatsapp,
  onCall,
  onNotEkle,
}: GecikenDetayDrawerProps) {
  const { href: ogrenciHref } = useOgrenciPath();
  if (!item) return null;

  const finans = detail?.finans;
  const iletisim = detail?.iletisim;
  const gecmis = detail?.gecmis;

  return (
    <FinansFormDrawer
      open
      onClose={onClose}
      title={item.ogrenci_adi}
      subtitle={`${item.sozlesme_no} · Taksit #${item.taksit_no}`}
      wide
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fd-btn fd-btn--emerald" onClick={onTahsilat}>Tahsilat Al</button>
          <button type="button" className="fd-btn" onClick={onWhatsapp}>WhatsApp</button>
          <button type="button" className="fd-btn" onClick={onCall}>Ara</button>
          <button type="button" className="fd-btn" onClick={onNotEkle}>Not Ekle</button>
        </div>
      }
    >
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Detay yükleniyor…</div>
      ) : (
        <div className="space-y-5">
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Öğrenci Bilgileri</h4>
            <div className="bg-gray-50 rounded-xl p-3">
              <InfoRow label="Ad Soyad" value={item.ogrenci_adi} />
              <InfoRow label="Numara" value={item.ogrenci_no || "—"} />
              <InfoRow label="Şube" value={item.sube_ad || "—"} />
              <InfoRow label="Sınıf" value={item.sinif_ad || "—"} />
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Finans Bilgileri</h4>
            <div className="bg-gray-50 rounded-xl p-3">
              <InfoRow label="Sözleşme No" value={item.sozlesme_no} />
              <InfoRow label="Toplam Sözleşme" value={finans ? fmtTL(finans.sozlesme_tutari) : "—"} />
              <InfoRow label="Toplam Ödenen" value={finans ? fmtTL(finans.toplam_odenen) : "—"} />
              <InfoRow label="Kalan Borç" value={finans ? fmtTL(finans.kalan_borc) : "—"} />
              <InfoRow label="Geciken Tutar" value={finans ? fmtTL(finans.geciken_tutar) : fmtTL(item.kalan_tutar)} />
              <InfoRow label="Geciken Taksit" value={finans?.geciken_taksit_sayisi ?? "—"} />
              <InfoRow label="Son Tahsilat" value={item.son_tahsilat_tarihi ? fmtDate(item.son_tahsilat_tarihi) : "—"} />
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">İletişim</h4>
            <div className="bg-gray-50 rounded-xl p-3">
              <InfoRow label="Veli" value={item.veli_adi || "—"} />
              <InfoRow label="Telefon" value={item.veli_telefon || "—"} />
              <InfoRow label="E-posta" value={iletisim?.email || "—"} />
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Geçmiş</h4>
            <div className="bg-gray-50 rounded-xl p-3">
              <InfoRow label="Son WhatsApp" value={gecmis?.son_whatsapp ? fmtDate(gecmis.son_whatsapp) : "—"} />
              <InfoRow label="Son Arama" value={gecmis?.son_arama ? fmtDate(gecmis.son_arama) : "—"} />
              <InfoRow label="Son Not" value={gecmis?.son_not || "—"} />
            </div>
          </section>

          <section className="flex flex-wrap gap-2 pt-1">
            <Link href={`${odemeHref()}?sozlesme=${item.sozlesme_id}`} className="text-xs font-semibold text-blue-600 hover:underline">
              Sözleşmeyi Aç
            </Link>
            {item.ogrenci_id && (
              <Link href={ogrenciHref(String(item.ogrenci_id))} className="text-xs font-semibold text-blue-600 hover:underline">
                Öğrenci Finansı
              </Link>
            )}
            <Link href={`${homeHref}/cari-hesaplar`} className="text-xs font-semibold text-blue-600 hover:underline">
              Cari Hesaplar
            </Link>
          </section>
        </div>
      )}
    </FinansFormDrawer>
  );
}
