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

const CHART_COLORS = ["#0262a7", "#2563eb", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626"];

/* ─── Ortak yapı taşları ─────────────────────────────────────── */

function Accordion({
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
    <div className="gs-accordion">
      <button type="button" className="gs-accordion__trigger" onClick={() => setOpen((v) => !v)}>
        <span className="gs-accordion__title">{title}</span>
        <span className="gs-accordion__meta">
          {count !== undefined && <span className="gs-accordion__count">{count} kayıt</span>}
          <svg className={`gs-accordion__chevron ${open ? "open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && <div className="gs-accordion__body">{children}</div>}
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  moneyCols,
}: {
  headers: string[];
  rows: (string | number)[][];
  /** 0-tabanlı sütun indeksleri: yalnız bu sütunlardaki sayılar ₺ olarak biçimlenir.
   *  Belirtilmezse (geriye dönük uyumluluk için) tüm sayısal hücreler ₺ kabul edilir. */
  moneyCols?: number[];
}) {
  if (rows.length === 0) {
    return <p className="gs-table-empty">Kayıt yok.</p>;
  }
  const isMoneyCol = (j: number) => (moneyCols ? moneyCols.includes(j) : true);
  return (
    <div className="gs-table-wrap">
      <table className="gs-table">
        <thead>
          <tr>
            {headers.map((h, i) => <th key={h} className={i > 0 && typeof rows[0][i] === "number" ? "gs-num" : undefined}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={typeof cell === "number" ? "gs-num" : undefined} style={typeof cell === "number" ? { fontWeight: 700 } : undefined}>
                  {typeof cell === "number" ? (isMoneyCol(j) ? fmtTL(cell) : cell.toLocaleString("tr-TR")) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniChart({ title, data, dataKey = "tutar" }: { title: string; data: { label: string; tutar: number }[]; dataKey?: string }) {
  if (!data.length) return null;
  return (
    <div className="gs-chart-card">
      <p className="gs-chart-card__title">{title}</p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v) => (typeof v === "number" ? fmtTL(v) : String(v ?? ""))} />
          <Bar dataKey={dataKey} fill="#0262a7" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieMini({ title, data }: { title: string; data: { label: string; tutar: number }[] }) {
  if (!data.length) return null;
  return (
    <div className="gs-chart-card">
      <p className="gs-chart-card__title">{title}</p>
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

function GroupHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="gs-group__head">
      <span className="gs-group__title">{title}</span>
      {desc && <span className="gs-group__desc">{desc}</span>}
    </div>
  );
}

/* ─── Ana bileşen ────────────────────────────────────────────── */

export default function GunSonuDetayView({ detay }: Props) {
  const ozet = detay.ozet;
  const yo = detay.yonetici_ozeti;
  const kasa = detay.kasa_ozeti;
  const grafik = detay.grafikler;
  const banka = detay.banka_hareketleri;

  const giren = (ozet.toplam_alinan ?? ozet.toplam_tahsilat) + ozet.toplam_gelir;
  const cikan = ozet.toplam_gider + ozet.toplam_iade;
  const fark = giren - cikan;
  const kasaNet = kasa.gunluk_giris - kasa.gunluk_cikis;

  return (
    <div className="gs-page">
      {/* ── Kapak + günün hikâyesi ───────────────────────── */}
      <div className="gs-panel">
        <div className="gs-panel__body">
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0262a7" }}>{detay.kapak.baslik}</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#475569" }}>
            {detay.kapak.kurum_ad} · {detay.kapak.sube} · {detay.kapak.tarih}
          </p>
          <p style={{ marginTop: 10, fontSize: 12.5, color: "#64748b", maxWidth: 720, lineHeight: 1.5 }}>
            Bu rapor seçilen günün parasal hareketlerini özetler.
            {" "}<strong style={{ color: "#059669" }}>Giren</strong> = tahsilat + gelir,
            {" "}<strong style={{ color: "#dc2626" }}>çıkan</strong> = gider ödemeleri + iadeler,
            {" "}<strong style={{ color: "#0262a7" }}>fark</strong> = giren − çıkan.
            Alttaki kasa/banka satırları fiziksel nakit ve banka hesaplarına yansıyan hareketlerdir.
          </p>

          {detay.uyarilar && detay.uyarilar.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {detay.uyarilar.map((u, i) => (
                <div key={i} className={`gs-alert gs-alert--${u.seviye}`}>{u.mesaj}</div>
              ))}
            </div>
          )}

          <div className="gs-hero-grid" style={{ marginTop: 16 }}>
            <div className="gs-hero gs-hero--in">
              <span className="gs-hero__label">1) Bugün giren</span>
              <span className="gs-hero__value">{fmtTL(giren)}</span>
              <span className="gs-hero__hint">Tahsilat {fmtTL(ozet.toplam_alinan ?? ozet.toplam_tahsilat)} + gelir {fmtTL(ozet.toplam_gelir)}</span>
            </div>
            <div className="gs-hero gs-hero--out">
              <span className="gs-hero__label">2) Bugün çıkan</span>
              <span className="gs-hero__value">{fmtTL(cikan)}</span>
              <span className="gs-hero__hint">Gider {fmtTL(ozet.toplam_gider)} + iade {fmtTL(ozet.toplam_iade)}</span>
            </div>
            <div className="gs-hero gs-hero--net">
              <span className="gs-hero__label">3) Günün farkı</span>
              <span className="gs-hero__value">{fmtTL(fark)}</span>
              <span className="gs-hero__hint">{fark >= 0 ? "Giren, çıkandan fazla" : "Çıkan, girenden fazla"}</span>
            </div>
            <div className="gs-hero gs-hero--info">
              <span className="gs-hero__label">4) Kasa net değişim</span>
              <span className="gs-hero__value">{fmtTL(kasaNet)}</span>
              <span className="gs-hero__hint">Kasaya +{fmtTL(kasa.gunluk_giris)} / kasadan −{fmtTL(kasa.gunluk_cikis)}</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Kasa hikâyesi (nakit)</p>
            <div className="gs-flow">
              <div className="gs-flow__step">
                <div className="gs-flow__label">Güne başlangıç</div>
                <div className="gs-flow__value">{fmtTL(kasa.acilis_kasa)}</div>
              </div>
              <div className="gs-flow__op">+</div>
              <div className="gs-flow__step gs-flow__step--in">
                <div className="gs-flow__label">Giriş</div>
                <div className="gs-flow__value">{fmtTL(kasa.gunluk_giris)}</div>
              </div>
              <div className="gs-flow__op">−</div>
              <div className="gs-flow__step gs-flow__step--out">
                <div className="gs-flow__label">Çıkış</div>
                <div className="gs-flow__value">{fmtTL(kasa.gunluk_cikis)}</div>
              </div>
              <div className="gs-flow__op">=</div>
              <div className="gs-flow__step gs-flow__step--result">
                <div className="gs-flow__label">Beklenen kasa</div>
                <div className="gs-flow__value">{fmtTL(kasa.beklenen_kasa)}</div>
              </div>
            </div>
            <p style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
              Formül: başlangıç + giriş − çıkış = beklenen kasa
              {kasa.sayim_yapildi ? ` · Sayılan: ${fmtTL(kasa.sayilan_kasa ?? 0)} · Fark: ${fmtTL(kasa.kasa_farki)}` : " · Sayım yapılmadı"}
            </p>
          </div>

          {banka && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Banka özeti</p>
              <div className="gs-stat-grid" style={{ marginBottom: banka.banka_bazli_toplamlar.length > 0 ? 10 : 0 }}>
                <div className="gs-stat"><div className="gs-stat__label">Banka giriş</div><div className="gs-stat__value" style={{ color: "#059669" }}>{fmtTL(banka.banka_girisleri)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Banka çıkış</div><div className="gs-stat__value" style={{ color: "#dc2626" }}>{fmtTL(banka.banka_cikislari)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Havale</div><div className="gs-stat__value">{fmtTL(banka.havale)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">EFT</div><div className="gs-stat__value">{fmtTL(banka.eft)}</div></div>
              </div>
              {banka.banka_bazli_toplamlar.length > 0 && (
                <SimpleTable
                  headers={["Banka hesabı", "Giriş", "Çıkış", "Net"]}
                  rows={banka.banka_bazli_toplamlar.map((r) => [r.banka, r.giris, r.cikis, r.net])}
                />
              )}
            </div>
          )}

          {yo && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #eef2f7" }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Yönetici özeti</p>
              <div className="gs-stat-grid">
                <div className="gs-stat"><div className="gs-stat__label">Yeni Öğrenci</div><div className="gs-stat__value">{yo.yeni_ogrenci}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Yeni Sözleşme</div><div className="gs-stat__value">{yo.yeni_sozlesme}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Tahsilat</div><div className="gs-stat__value">{fmtTL(yo.tahsilat)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Gelir</div><div className="gs-stat__value">{fmtTL(yo.gelir)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Gider</div><div className="gs-stat__value">{fmtTL(yo.gider)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">İade</div><div className="gs-stat__value">{fmtTL(yo.iade)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">İptal</div><div className="gs-stat__value">{yo.iptal}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Geciken Taksit</div><div className="gs-stat__value">{yo.gecikmeye_dusen_yeni_taksit}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Bekleyen Tahsilat</div><div className="gs-stat__value">{fmtTL(yo.bekleyen_tahsilatlar)}</div></div>
                <div className="gs-stat"><div className="gs-stat__label">Kesilen Fatura</div><div className="gs-stat__value">{yo.kesilen_fatura}</div></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Grafikler ─────────────────────────────────────── */}
      {grafik && (
        <div className="gs-chart-grid">
          <PieMini title="Ödeme Türü Dağılımı" data={grafik.odeme_turu_dagilimi} />
          <MiniChart title="Saat Bazlı Tahsilat" data={grafik.saatlik_tahsilat.map((r) => ({ label: r.saat, tutar: r.tutar }))} />
          <MiniChart title="Gelir Dağılımı" data={grafik.gelir_dagilimi} />
          <MiniChart title="Gider Dağılımı" data={grafik.gider_dagilimi} />
        </div>
      )}

      {/* ── Grup: Nakit Akışı ─────────────────────────────── */}
      <div className="gs-group">
        <GroupHead title="Nakit Akışı" desc="Kasa, banka ve genel finansal özet" />

        {detay.gunluk_finans_ozeti && (
          <Accordion title="Günlük Finans Özeti" defaultOpen>
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
          </Accordion>
        )}

        <Accordion title="Kasa Özeti (detay kalemleri)">
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
            <p style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginTop: 10 }}>⚠ Kasa farkı: {fmtTL(kasa.kasa_farki)}</p>
          )}
          {kasa.not && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, fontStyle: "italic" }}>{kasa.not}</p>}
        </Accordion>

        {detay.kasa_hareketleri && (
          <Accordion title="Kasa Hareketleri" count={detay.kasa_hareketleri.length}>
            <SimpleTable
              headers={["Saat", "Kasa", "Yön", "Kaynak", "Tutar", "Açıklama", "Personel"]}
              rows={detay.kasa_hareketleri.map((r) => [r.saat, r.kasa, r.yon, r.kaynak, r.tutar, r.aciklama, r.personel])}
            />
          </Accordion>
        )}

        {detay.pos_hareketleri && (
          <Accordion title="POS Hareketleri" count={detay.pos_hareketleri.length}>
            <SimpleTable
              headers={["POS Cihazı", "Banka", "Kart Türü", "Tutar", "İşlem Sayısı"]}
              rows={detay.pos_hareketleri.map((r) => [r.pos_cihazi, r.banka, r.kart_turu, r.tutar, r.islem_sayisi])}
              moneyCols={[3]}
            />
          </Accordion>
        )}
      </div>

      {/* ── Grup: Gelir & Tahsilat ─────────────────────────── */}
      <div className="gs-group">
        <GroupHead title="Gelir & Tahsilat" desc="Bugün alınan tüm tahsilat ve gelir kayıtları" />

        <Accordion title="Tahsilat Özeti (Ödeme Türü)" count={(detay.tahsilat_ozeti || detay.odeme_turu_dagilimi.ozet).length} defaultOpen>
          <SimpleTable
            headers={["Ödeme Türü", "Adet", "Tutar", "%"]}
            rows={(detay.tahsilat_ozeti || detay.odeme_turu_dagilimi.ozet).map((r) => [
              r.label,
              r.adet ?? "—",
              r.tutar,
              r.yuzde !== undefined ? `%${r.yuzde}` : "—",
            ])}
            moneyCols={[2]}
          />
        </Accordion>

        <Accordion title="Tahsilat Listesi" count={detay.tahsilat_listesi.length}>
          <SimpleTable
            headers={["Saat", "Sözleşme", "Makbuz", "Öğrenci", "Veli", "Taksit", "Dönem", "Ödeme", "Tutar", "Personel", "Açıklama"]}
            rows={detay.tahsilat_listesi.map((r) => [
              r.saat, r.sozlesme_no ?? "—", r.makbuz, r.ogrenci, r.veli,
              r.taksit_no ?? "—", r.odeme_donemi ?? "—", r.odeme_turu, r.tutar, r.personel, r.aciklama ?? "—",
            ])}
          />
        </Accordion>

        <Accordion title="Gelir Hareketleri" count={detay.gelir_hareketleri.length}>
          <SimpleTable
            headers={["Saat", "Kod", "Kategori", "Kasa", "Ödeme", "Belge", "Açıklama", "Tutar", "Personel"]}
            rows={detay.gelir_hareketleri.map((r) => [
              r.saat, r.gelir_kodu, r.kategori, r.kasa ?? "—", r.odeme_turu ?? "—",
              r.belge_no ?? "—", r.aciklama, r.tutar, r.personel,
            ])}
          />
        </Accordion>

        <Accordion title="Kategori Bazlı Gelirler" count={detay.kategori_gelirler.filter((r) => !r.is_total).length}>
          <SimpleTable headers={["Kategori", "Tutar"]} rows={detay.kategori_gelirler.filter((r) => !r.is_total).map((r) => [r.kategori, r.tutar])} />
        </Accordion>
      </div>

      {/* ── Grup: Gider ────────────────────────────────────── */}
      <div className="gs-group">
        <GroupHead title="Gider" desc="Bugün ödenen giderler" />

        <Accordion title="Gider Hareketleri" count={detay.gider_hareketleri.length}>
          <SimpleTable
            headers={["Saat", "Kod", "Kategori", "Cari", "Ödeme", "Kasa", "Açıklama", "Onaylayan", "Tutar", "Personel"]}
            rows={detay.gider_hareketleri.map((r) => [
              r.saat, r.gider_kodu, r.kategori, r.cari ?? "—", r.odeme_turu ?? "—",
              r.kasa ?? "—", r.aciklama, r.onaylayan ?? "—", r.tutar, r.personel,
            ])}
          />
        </Accordion>

        <Accordion title="Kategori Bazlı Giderler" count={detay.kategori_giderler.filter((r) => !r.is_total).length}>
          <SimpleTable headers={["Kategori", "Tutar"]} rows={detay.kategori_giderler.filter((r) => !r.is_total).map((r) => [r.kategori, r.tutar])} />
        </Accordion>
      </div>

      {/* ── Grup: Cari ve Öğrenci Hareketleri ─────────────── */}
      <div className="gs-group">
        <GroupHead title="Cari ve Öğrenci Hareketleri" />

        <Accordion title="Cari Hareketleri (Bugün)" count={detay.cari_hareketleri.length}>
          <SimpleTable
            headers={["Cari", "Borç", "Alacak", "Gün Sonu Bakiyesi"]}
            rows={detay.cari_hareketleri.map((r) => [r.cari, r.borc, r.alacak, r.bakiye])}
          />
        </Accordion>

        {detay.ogrenci_hareketleri && (
          <Accordion title="Günlük Öğrenci Hareketleri">
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>Yeni Ön Kayıt ({detay.ogrenci_hareketleri.yeni_on_kayit.length})</p>
            <SimpleTable headers={["Öğrenci", "Tarih"]} rows={detay.ogrenci_hareketleri.yeni_on_kayit.map((r) => [r.ogrenci, r.tarih])} />
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "14px 0 6px" }}>Yeni Kesin Kayıt ({detay.ogrenci_hareketleri.yeni_kesin_kayit.length})</p>
            <SimpleTable headers={["Öğrenci", "Tür", "Tarih"]} rows={detay.ogrenci_hareketleri.yeni_kesin_kayit.map((r) => [r.ogrenci, r.giris_turu ?? "—", r.tarih])} />
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "14px 0 6px" }}>Kayıt İptalleri ({detay.ogrenci_hareketleri.kayit_iptalleri.length})</p>
            <SimpleTable headers={["Öğrenci", "Açıklama"]} rows={detay.ogrenci_hareketleri.kayit_iptalleri.map((r) => [r.ogrenci, r.aciklama])} />
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "14px 0 6px" }}>Nakil ({detay.ogrenci_hareketleri.nakil_islemleri.length})</p>
            <SimpleTable headers={["Öğrenci", "Açıklama"]} rows={detay.ogrenci_hareketleri.nakil_islemleri.map((r) => [r.ogrenci, r.aciklama])} />
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "14px 0 6px" }}>Ayrılan ({detay.ogrenci_hareketleri.ayrilan_ogrenciler.length})</p>
            <SimpleTable headers={["Öğrenci", "Açıklama"]} rows={detay.ogrenci_hareketleri.ayrilan_ogrenciler.map((r) => [r.ogrenci, r.aciklama])} />
          </Accordion>
        )}
      </div>

      {/* ── Grup: İstisnalar (iptal / iade) ───────────────── */}
      <div className="gs-group">
        <GroupHead title="İptal ve İade İşlemleri" desc="Dikkat gerektiren istisnai işlemler" />

        <Accordion title="İptal Edilen İşlemler" count={detay.iptal_islemleri.length}>
          <SimpleTable
            headers={["Saat", "İşlem No", "Tür", "Eski Tutar", "Durum", "Sebep", "Kullanıcı"]}
            rows={detay.iptal_islemleri.map((r) => [
              r.saat, r.islem_no, r.islem_turu ?? r.tur, r.eski_tutar ?? r.tutar ?? "—",
              r.yeni_durum ?? "İptal", r.sebep, r.kullanici,
            ])}
          />
        </Accordion>

        <Accordion title="İade İşlemleri" count={detay.iade_islemleri.length}>
          <SimpleTable
            headers={["Saat", "Öğrenci", "Neden", "Tutar", "Tarih", "Onaylayan", "Kullanıcı"]}
            rows={detay.iade_islemleri.map((r) => [
              r.saat, r.ogrenci, r.iade_nedeni ?? r.aciklama, r.tutar,
              r.iade_tarihi ?? "—", r.onaylayan ?? "—", r.kullanici ?? "—",
            ])}
          />
        </Accordion>
      </div>

      {/* ── Grup: Personel ─────────────────────────────────── */}
      <div className="gs-group">
        <GroupHead title="Personel Bazlı Detay" />

        {detay.personel_performans && (
          <Accordion title="Personel Performansı" count={detay.personel_performans.length}>
            <SimpleTable
              headers={["Personel", "Tahsilat #", "Tahsilat ₺", "Gelir #", "Gider #", "İade #", "İptal #", "Toplam İşlem"]}
              rows={detay.personel_performans.map((r) => [
                r.personel, r.tahsilat_sayisi, r.tahsilat_tutari, r.gelir_sayisi,
                r.gider_sayisi, r.iade_sayisi, r.iptal_sayisi, r.toplam_islem,
              ])}
              moneyCols={[2]}
            />
          </Accordion>
        )}

        <Accordion title="Kullanıcı Bazlı İşlem Detayı" count={detay.kullanici_islem_detayi.length}>
          {detay.kullanici_islem_detayi.map((block) => (
            <div key={block.personel} style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                {block.personel} — {block.adet} işlem · {fmtTL(block.toplam)}
              </p>
              <SimpleTable headers={["Saat", "Tür", "Açıklama", "Tutar"]} rows={block.islemler.map((i) => [i.saat, i.tur, i.aciklama, i.tutar])} />
            </div>
          ))}
        </Accordion>
      </div>

      {/* ── Rapor Bilgileri ────────────────────────────────── */}
      <div className="gs-panel">
        <div className="gs-panel__head"><h3><span className="gs-panel__head-icon" />Rapor Bilgileri</h3></div>
        <div className="gs-panel__body">
          <SimpleTable
            headers={["Alan", "Değer"]}
            rows={[
              ["Oluşturma", detay.sistem.olusturulma_tarihi],
              ["Oluşturan", detay.sistem.raporu_olusturan],
              ["Şube", detay.sistem.sube],
              ["Tarih", detay.sistem.tarih],
            ]}
          />
        </div>
      </div>
    </div>
  );
}
