"use client";

import React, { useState } from "react";
import type { GunSonuDetayRapor } from "../types/para-hareketi-types";
import { fmtTL } from "@/components/finans/FinansFilterBar";

interface Props {
  detay: GunSonuDetayRapor;
}

function Section({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden mb-2 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition"
      >
        <span className="text-sm font-bold text-[#1F3C88]">{title}</span>
        <span className="text-xs text-gray-400">
          {count !== undefined ? `${count} kayıt · ` : ""}{open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="px-4 pb-4 overflow-x-auto">{children}</div>}
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-3 text-center">Kayıt yok</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] font-bold text-gray-400 uppercase">
          {headers.map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className={`py-2 pr-3 ${typeof cell === "number" ? "text-right tabular-nums font-semibold" : "text-gray-700"}`}>
                {typeof cell === "number" ? fmtTL(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function GunSonuDetayView({ detay }: Props) {
  const ozet = detay.ozet;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 border border-gray-100 rounded-2xl p-5">
        <h2 className="text-lg font-extrabold text-[#1F3C88] mb-1">{detay.kapak.baslik}</h2>
        <p className="text-sm text-gray-600">{detay.kapak.kurum_ad} · {detay.kapak.sube} · {detay.kapak.tarih}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <MiniStat label="Toplam Tahsilat" value={fmtTL(ozet.toplam_tahsilat)} />
          <MiniStat label="Toplam Gelir" value={fmtTL(ozet.toplam_gelir)} />
          <MiniStat label="Toplam Gider" value={fmtTL(ozet.toplam_gider)} />
          <MiniStat label="Net Nakit" value={fmtTL(ozet.net_nakit_girisi)} />
        </div>
      </div>

      <Section title="1. Tahsilat Listesi" count={detay.tahsilat_listesi.length} defaultOpen>
        <SimpleTable
          headers={["Saat", "Makbuz", "Öğrenci", "Veli", "Ödeme", "Tutar", "Personel"]}
          rows={detay.tahsilat_listesi.map((r) => [r.saat, r.makbuz, r.ogrenci, r.veli, r.odeme_turu, r.tutar, r.personel])}
        />
      </Section>

      <Section title="2. Gelir Hareketleri" count={detay.gelir_hareketleri.length}>
        <SimpleTable
          headers={["Saat", "Kod", "Kategori", "Açıklama", "Tutar", "Personel"]}
          rows={detay.gelir_hareketleri.map((r) => [r.saat, r.gelir_kodu, r.kategori, r.aciklama, r.tutar, r.personel])}
        />
      </Section>

      <Section title="3. Gider Hareketleri" count={detay.gider_hareketleri.length}>
        <SimpleTable
          headers={["Saat", "Kod", "Kategori", "Açıklama", "Tutar", "Personel"]}
          rows={detay.gider_hareketleri.map((r) => [r.saat, r.gider_kodu, r.kategori, r.aciklama, r.tutar, r.personel])}
        />
      </Section>

      <Section title="4. Cari Hareketleri" count={detay.cari_hareketleri.length}>
        <SimpleTable
          headers={["Cari", "Borç", "Alacak", "Bakiye"]}
          rows={detay.cari_hareketleri.map((r) => [r.cari, r.borc, r.alacak, r.bakiye])}
        />
      </Section>

      <Section title="5. İptal Edilen İşlemler" count={detay.iptal_islemleri.length}>
        <SimpleTable
          headers={["Saat", "İşlem No", "Tür", "Sebep", "Kullanıcı"]}
          rows={detay.iptal_islemleri.map((r) => [r.saat, r.islem_no, r.tur, r.sebep, r.kullanici])}
        />
      </Section>

      <Section title="6. İade İşlemleri" count={detay.iade_islemleri.length}>
        <SimpleTable
          headers={["Saat", "Öğrenci", "Tutar", "Açıklama"]}
          rows={detay.iade_islemleri.map((r) => [r.saat, r.ogrenci, r.tutar, r.aciklama])}
        />
      </Section>

      <Section title="7. Ödeme Türü Dağılımı" count={detay.odeme_turu_dagilimi.ozet.length}>
        <SimpleTable
          headers={["Ödeme Türü", "Adet", "Tutar"]}
          rows={detay.odeme_turu_dagilimi.ozet.map((r) => [r.label, r.adet ?? "—", r.tutar])}
        />
      </Section>

      <Section title="8–9. Kategori Analizi">
        <p className="text-[11px] font-semibold text-gray-500 mb-2">Gelirler</p>
        <SimpleTable
          headers={["Kategori", "Tutar"]}
          rows={detay.kategori_gelirler.filter((r) => !r.is_total).map((r) => [r.kategori, r.tutar])}
        />
        <p className="text-[11px] font-semibold text-gray-500 mb-2 mt-4">Giderler</p>
        <SimpleTable
          headers={["Kategori", "Tutar"]}
          rows={detay.kategori_giderler.filter((r) => !r.is_total).map((r) => [r.kategori, r.tutar])}
        />
      </Section>

      <Section title="10. Kullanıcı Bazlı İşlem Detayı" count={detay.kullanici_islem_detayi.length}>
        {detay.kullanici_islem_detayi.map((block) => (
          <div key={block.personel} className="mb-4">
            <p className="text-xs font-bold text-gray-700 mb-1">
              {block.personel} — {block.adet} işlem · {fmtTL(block.toplam)}
            </p>
            <SimpleTable
              headers={["Saat", "Tür", "Açıklama", "Tutar"]}
              rows={block.islemler.map((i) => [i.saat, i.tur, i.aciklama, i.tutar])}
            />
          </div>
        ))}
      </Section>

      <Section title="11. Kasa Özeti">
        <SimpleTable
          headers={["Kalem", "Tutar"]}
          rows={[
            ["Açılış Kasa", detay.kasa_ozeti.acilis_kasa],
            ["Günlük Giriş", detay.kasa_ozeti.gunluk_giris],
            ["Günlük Çıkış", detay.kasa_ozeti.gunluk_cikis],
            ["Beklenen Kasa", detay.kasa_ozeti.beklenen_kasa],
            ["Sayılan Kasa", detay.kasa_ozeti.sayilan_kasa ?? "—"],
            ["Kasa Farkı", detay.kasa_ozeti.kasa_farki],
          ]}
        />
        {detay.kasa_ozeti.not && (
          <p className="text-[11px] text-gray-400 mt-2 italic">{detay.kasa_ozeti.not}</p>
        )}
      </Section>

      <Section title="12. Sistem Bilgileri">
        <SimpleTable
          headers={["Alan", "Değer"]}
          rows={[
            ["Oluşturma", detay.sistem.olusturma_tarihi],
            ["Oluşturan", detay.sistem.raporu_olusturan],
            ["Şube", detay.sistem.sube],
            ["Tarih", detay.sistem.tarih],
          ]}
        />
      </Section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/80 rounded-xl border border-blue-100 px-3 py-2">
      <div className="text-[10px] text-gray-500 uppercase font-semibold">{label}</div>
      <div className="text-sm font-extrabold text-[#1F3C88]">{value}</div>
    </div>
  );
}
