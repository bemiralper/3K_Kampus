"use client";

import React, { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GunSonuDetayRapor } from "../types/para-hareketi-types";
import { fmtTL } from "@/components/finans/FinansFilterBar";

interface Props {
  detay: GunSonuDetayRapor;
}

const CHART_COLORS = ["#1F3C88", "#2563eb", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626"];

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

function MiniChart({ title, data, dataKey = "tutar" }: { title: string; data: { label: string; tutar: number }[]; dataKey?: string }) {
  if (!data.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v) => (typeof v === "number" ? fmtTL(v) : String(v ?? ""))} />
          <Bar dataKey={dataKey} fill="#1F3C88" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieMini({ title, data }: { title: string; data: { label: string; tutar: number }[] }) {
  if (!data.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={data} dataKey="tutar" nameKey="label" cx="50%" cy="50%" outerRadius={50} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => (typeof v === "number" ? fmtTL(v) : String(v ?? ""))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function GunSonuDetayView({ detay }: Props) {
  const ozet = detay.ozet;
  const yo = detay.yonetici_ozeti;
  const kasa = detay.kasa_ozeti;
  const grafik = detay.grafikler;

  return (
    <div className="space-y-4">
      {/* Yönetici Özeti */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 border border-gray-100 rounded-2xl p-5">
        <h2 className="text-lg font-extrabold text-[#1F3C88] mb-1">{detay.kapak.baslik}</h2>
        <p className="text-sm text-gray-600">{detay.kapak.kurum_ad} · {detay.kapak.sube} · {detay.kapak.tarih}</p>

        {detay.uyarilar && detay.uyarilar.length > 0 && (
          <div className="mt-3 space-y-1">
            {detay.uyarilar.map((u, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-2 rounded-lg ${
                  u.seviye === "kritik" ? "bg-red-50 text-red-700 border border-red-200"
                  : u.seviye === "uyari" ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-blue-50 text-blue-700 border border-blue-100"
                }`}
              >
                {u.mesaj}
              </div>
            ))}
          </div>
        )}

        {yo && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
            <MiniStat label="Yeni Öğrenci" value={String(yo.yeni_ogrenci)} />
            <MiniStat label="Yeni Sözleşme" value={String(yo.yeni_sozlesme)} />
            <MiniStat label="Tahsilat" value={fmtTL(yo.tahsilat)} />
            <MiniStat label="Gelir" value={fmtTL(yo.gelir)} />
            <MiniStat label="Gider" value={fmtTL(yo.gider)} />
            <MiniStat label="İade" value={fmtTL(yo.iade)} />
            <MiniStat label="İptal" value={String(yo.iptal)} />
            <MiniStat label="Geciken Taksit" value={String(yo.gecikmeye_dusen_yeni_taksit)} />
            <MiniStat label="Bekleyen Tahsilat" value={fmtTL(yo.bekleyen_tahsilatlar)} />
            <MiniStat label="Kesilen Fatura" value={String(yo.kesilen_fatura)} />
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-blue-100">
          <MiniStat label="Toplam Tahsilat" value={fmtTL(ozet.toplam_tahsilat)} />
          <MiniStat label="Toplam Gelir" value={fmtTL(ozet.toplam_gelir)} />
          <MiniStat label="Toplam Gider" value={fmtTL(ozet.toplam_gider)} />
          <MiniStat label="Net Nakit (Kasa)" value={fmtTL(ozet.net_nakit_girisi)} highlight />
        </div>
      </div>

      {/* Grafikler */}
      {grafik && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PieMini title="Ödeme Türü Dağılımı" data={grafik.odeme_turu_dagilimi} />
          <MiniChart title="Saat Bazlı Tahsilat" data={grafik.saatlik_tahsilat.map((r) => ({ label: r.saat, tutar: r.tutar }))} />
          <MiniChart title="Gelir Dağılımı" data={grafik.gelir_dagilimi} />
          <MiniChart title="Gider Dağılımı" data={grafik.gider_dagilimi} />
        </div>
      )}

      {detay.gunluk_finans_ozeti && (
        <Section title="Günlük Finans Özeti" defaultOpen>
          <SimpleTable
            headers={["Kalem", "Tutar"]}
            rows={[
              ["Toplam Sözleşme Tutarı", detay.gunluk_finans_ozeti.toplam_sozlesme_tutari],
              ["Günlük Tahsilat", detay.gunluk_finans_ozeti.gunluk_tahsilat],
              ["Günlük Gelir", detay.gunluk_finans_ozeti.gunluk_gelir],
              ["Günlük Gider", detay.gunluk_finans_ozeti.gunluk_gider],
              ["Günlük İade", detay.gunluk_finans_ozeti.gunluk_iade],
              ["Günlük İskonto", detay.gunluk_finans_ozeti.gunluk_iskonto],
              ["Bekleyen Tahsilatlar", detay.gunluk_finans_ozeti.bekleyen_tahsilatlar],
              ["Net Günlük Finansal Sonuç", detay.gunluk_finans_ozeti.net_gunluk_finansal_sonuc],
            ]}
          />
        </Section>
      )}

      <Section title="Tahsilat Özeti (Ödeme Türü)" count={(detay.tahsilat_ozeti || detay.odeme_turu_dagilimi.ozet).length} defaultOpen>
        <SimpleTable
          headers={["Ödeme Türü", "Adet", "Tutar", "%"]}
          rows={(detay.tahsilat_ozeti || detay.odeme_turu_dagilimi.ozet).map((r) => [
            r.label,
            r.adet ?? "—",
            r.tutar,
            r.yuzde !== undefined ? `%${r.yuzde}` : "—",
          ])}
        />
      </Section>

      <Section title="Tahsilat Listesi" count={detay.tahsilat_listesi.length}>
        <SimpleTable
          headers={["Saat", "Sözleşme", "Makbuz", "Öğrenci", "Veli", "Taksit", "Dönem", "Ödeme", "Tutar", "Personel", "Açıklama"]}
          rows={detay.tahsilat_listesi.map((r) => [
            r.saat, r.sozlesme_no ?? "—", r.makbuz, r.ogrenci, r.veli,
            r.taksit_no ?? "—", r.odeme_donemi ?? "—", r.odeme_turu, r.tutar, r.personel, r.aciklama ?? "—",
          ])}
        />
      </Section>

      <Section title="Gelir Hareketleri" count={detay.gelir_hareketleri.length}>
        <SimpleTable
          headers={["Saat", "Kod", "Kategori", "Kasa", "Ödeme", "Belge", "Açıklama", "Tutar", "Personel"]}
          rows={detay.gelir_hareketleri.map((r) => [
            r.saat, r.gelir_kodu, r.kategori, r.kasa ?? "—", r.odeme_turu ?? "—",
            r.belge_no ?? "—", r.aciklama, r.tutar, r.personel,
          ])}
        />
      </Section>

      <Section title="Gider Hareketleri" count={detay.gider_hareketleri.length}>
        <SimpleTable
          headers={["Saat", "Kod", "Kategori", "Cari", "Ödeme", "Kasa", "Açıklama", "Onaylayan", "Tutar", "Personel"]}
          rows={detay.gider_hareketleri.map((r) => [
            r.saat, r.gider_kodu, r.kategori, r.cari ?? "—", r.odeme_turu ?? "—",
            r.kasa ?? "—", r.aciklama, r.onaylayan ?? "—", r.tutar, r.personel,
          ])}
        />
      </Section>

      <Section title="Cari Hareketleri (Bugün)" count={detay.cari_hareketleri.length}>
        <SimpleTable
          headers={["Cari", "Borç", "Alacak", "Gün Sonu Bakiyesi"]}
          rows={detay.cari_hareketleri.map((r) => [r.cari, r.borc, r.alacak, r.bakiye])}
        />
      </Section>

      {detay.ogrenci_hareketleri && (
        <Section title="Günlük Öğrenci Hareketleri">
          <p className="text-[11px] font-semibold text-gray-500 mb-1">Yeni Ön Kayıt ({detay.ogrenci_hareketleri.yeni_on_kayit.length})</p>
          <SimpleTable headers={["Öğrenci", "Tarih"]} rows={detay.ogrenci_hareketleri.yeni_on_kayit.map((r) => [r.ogrenci, r.tarih])} />
          <p className="text-[11px] font-semibold text-gray-500 mb-1 mt-3">Yeni Kesin Kayıt ({detay.ogrenci_hareketleri.yeni_kesin_kayit.length})</p>
          <SimpleTable headers={["Öğrenci", "Tür", "Tarih"]} rows={detay.ogrenci_hareketleri.yeni_kesin_kayit.map((r) => [r.ogrenci, r.giris_turu ?? "—", r.tarih])} />
          <p className="text-[11px] font-semibold text-gray-500 mb-1 mt-3">Kayıt İptalleri ({detay.ogrenci_hareketleri.kayit_iptalleri.length})</p>
          <SimpleTable headers={["Öğrenci", "Açıklama"]} rows={detay.ogrenci_hareketleri.kayit_iptalleri.map((r) => [r.ogrenci, r.aciklama])} />
          <p className="text-[11px] font-semibold text-gray-500 mb-1 mt-3">Nakil ({detay.ogrenci_hareketleri.nakil_islemleri.length})</p>
          <SimpleTable headers={["Öğrenci", "Açıklama"]} rows={detay.ogrenci_hareketleri.nakil_islemleri.map((r) => [r.ogrenci, r.aciklama])} />
          <p className="text-[11px] font-semibold text-gray-500 mb-1 mt-3">Ayrılan ({detay.ogrenci_hareketleri.ayrilan_ogrenciler.length})</p>
          <SimpleTable headers={["Öğrenci", "Açıklama"]} rows={detay.ogrenci_hareketleri.ayrilan_ogrenciler.map((r) => [r.ogrenci, r.aciklama])} />
        </Section>
      )}

      <Section title="İptal Edilen İşlemler" count={detay.iptal_islemleri.length}>
        <SimpleTable
          headers={["Saat", "İşlem No", "Tür", "Eski Tutar", "Durum", "Sebep", "Kullanıcı"]}
          rows={detay.iptal_islemleri.map((r) => [
            r.saat, r.islem_no, r.islem_turu ?? r.tur, r.eski_tutar ?? r.tutar ?? "—",
            r.yeni_durum ?? "İptal", r.sebep, r.kullanici,
          ])}
        />
      </Section>

      <Section title="İade İşlemleri" count={detay.iade_islemleri.length}>
        <SimpleTable
          headers={["Saat", "Öğrenci", "Neden", "Tutar", "Tarih", "Onaylayan", "Kullanıcı"]}
          rows={detay.iade_islemleri.map((r) => [
            r.saat, r.ogrenci, r.iade_nedeni ?? r.aciklama, r.tutar,
            r.iade_tarihi ?? "—", r.onaylayan ?? "—", r.kullanici ?? "—",
          ])}
        />
      </Section>

      {detay.personel_performans && (
        <Section title="Personel Performansı" count={detay.personel_performans.length}>
          <SimpleTable
            headers={["Personel", "Tahsilat #", "Tahsilat ₺", "Gelir #", "Gider #", "İade #", "İptal #", "Toplam İşlem"]}
            rows={detay.personel_performans.map((r) => [
              r.personel, r.tahsilat_sayisi, r.tahsilat_tutari, r.gelir_sayisi,
              r.gider_sayisi, r.iade_sayisi, r.iptal_sayisi, r.toplam_islem,
            ])}
          />
        </Section>
      )}

      {detay.kasa_hareketleri && (
        <Section title="Kasa Hareketleri" count={detay.kasa_hareketleri.length}>
          <SimpleTable
            headers={["Saat", "Kasa", "Yön", "Kaynak", "Tutar", "Açıklama", "Personel"]}
            rows={detay.kasa_hareketleri.map((r) => [r.saat, r.kasa, r.yon, r.kaynak, r.tutar, r.aciklama, r.personel])}
          />
        </Section>
      )}

      {detay.banka_hareketleri && (
        <Section title="Banka Hareketleri">
          <SimpleTable
            headers={["Kalem", "Tutar"]}
            rows={[
              ["Havale", detay.banka_hareketleri.havale],
              ["EFT", detay.banka_hareketleri.eft],
              ["Banka Girişleri", detay.banka_hareketleri.banka_girisleri],
              ["Banka Çıkışları", detay.banka_hareketleri.banka_cikislari],
            ]}
          />
          {detay.banka_hareketleri.banka_bazli_toplamlar.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-gray-500 mt-3 mb-1">Banka Bazlı Toplamlar</p>
              <SimpleTable
                headers={["Banka", "Giriş", "Çıkış", "Net"]}
                rows={detay.banka_hareketleri.banka_bazli_toplamlar.map((r) => [r.banka, r.giris, r.cikis, r.net])}
              />
            </>
          )}
        </Section>
      )}

      {detay.pos_hareketleri && (
        <Section title="POS Hareketleri" count={detay.pos_hareketleri.length}>
          <SimpleTable
            headers={["POS Cihazı", "Banka", "Kart Türü", "Tutar", "İşlem Sayısı"]}
            rows={detay.pos_hareketleri.map((r) => [r.pos_cihazi, r.banka, r.kart_turu, r.tutar, r.islem_sayisi])}
          />
        </Section>
      )}

      <Section title="Kasa Özeti" defaultOpen>
        <SimpleTable
          headers={["Kalem", "Tutar"]}
          rows={[
            ["Açılış Kasası", kasa.acilis_kasa],
            ["Nakit Tahsilatlar", kasa.nakit_tahsilatlar ?? 0],
            ["Nakit Gelirler", kasa.nakit_gelirler ?? 0],
            ["Nakit Giderler", kasa.nakit_giderler ?? 0],
            ["Nakit İadeler", kasa.nakit_iadeler ?? 0],
            ["Kasaya Para Girişi", kasa.kasaya_para_girisi ?? 0],
            ["Kasadan Para Çıkışı", kasa.kasadan_para_cikisi ?? 0],
            ["Bankaya Aktarım", kasa.bankaya_aktarim ?? 0],
            ["Bankadan Kasaya Aktarım", kasa.bankadan_kasaya_aktarim ?? 0],
            ["Beklenen Kasa", kasa.beklenen_kasa],
            ["Sayılan Kasa", kasa.sayilan_kasa ?? "—"],
            ["Kasa Farkı", kasa.kasa_farki],
          ]}
        />
        {kasa.kasa_farki !== 0 && kasa.sayim_yapildi && (
          <p className="text-sm font-bold text-red-600 mt-2">⚠ Kasa farkı: {fmtTL(kasa.kasa_farki)}</p>
        )}
        {kasa.not && <p className="text-[11px] text-gray-400 mt-2 italic">{kasa.not}</p>}
      </Section>

      <Section title="Kategori Analizi">
        <p className="text-[11px] font-semibold text-gray-500 mb-2">Gelirler</p>
        <SimpleTable headers={["Kategori", "Tutar"]} rows={detay.kategori_gelirler.filter((r) => !r.is_total).map((r) => [r.kategori, r.tutar])} />
        <p className="text-[11px] font-semibold text-gray-500 mb-2 mt-4">Giderler</p>
        <SimpleTable headers={["Kategori", "Tutar"]} rows={detay.kategori_giderler.filter((r) => !r.is_total).map((r) => [r.kategori, r.tutar])} />
      </Section>

      <Section title="Kullanıcı Bazlı İşlem Detayı" count={detay.kullanici_islem_detayi.length}>
        {detay.kullanici_islem_detayi.map((block) => (
          <div key={block.personel} className="mb-4">
            <p className="text-xs font-bold text-gray-700 mb-1">{block.personel} — {block.adet} işlem · {fmtTL(block.toplam)}</p>
            <SimpleTable headers={["Saat", "Tür", "Açıklama", "Tutar"]} rows={block.islemler.map((i) => [i.saat, i.tur, i.aciklama, i.tutar])} />
          </div>
        ))}
      </Section>

      <Section title="Rapor Bilgileri">
        <SimpleTable
          headers={["Alan", "Değer"]}
          rows={[
            ["Oluşturma", detay.sistem.olusturulma_tarihi],
            ["Oluşturan", detay.sistem.raporu_olusturan],
            ["Şube", detay.sistem.sube],
            ["Tarih", detay.sistem.tarih],
          ]}
        />
      </Section>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${highlight ? "bg-blue-600/10 border-blue-300" : "bg-white/80 border-blue-100"}`}>
      <div className="text-[10px] text-gray-500 uppercase font-semibold">{label}</div>
      <div className={`text-sm font-extrabold ${highlight ? "text-blue-700" : "text-[#1F3C88]"}`}>{value}</div>
    </div>
  );
}
