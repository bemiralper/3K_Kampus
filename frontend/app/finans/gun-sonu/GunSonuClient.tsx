"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import ExportDropdown, { type ExportFormat } from "@/components/finans/ExportDropdown";
import GunSonuWhatsappModal from "@/components/finans/GunSonuWhatsappModal";
import GunSonuDetayView from "./GunSonuDetayView";
import { gunSonuService } from "../services/para-hareketi-api";
import type { GunSonuDetayRapor, GunSonuOzet, GunSonuOzetRapor } from "../types/para-hareketi-types";
import { fmtTL } from "@/components/finans/FinansFilterBar";

function todayIso() { return new Date().toISOString().slice(0, 10); }

type ViewTab = "rapor" | "canli" | "detay";

export default function GunSonuClient({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum, activeSube } = useKurum();
  const { homeHref, portalHomeHref } = useFinansPath();

  const [gun, setGun] = useState(todayIso());
  const [notlar, setNotlar] = useState("");
  const notlarRef = useRef(notlar);
  notlarRef.current = notlar;
  const [viewTab, setViewTab] = useState<ViewTab>("rapor");
  const [ozet, setOzet] = useState<GunSonuOzet | null>(null);
  const [detay, setDetay] = useState<GunSonuDetayRapor | null>(null);
  const [loading, setLoading] = useState(true);
  const [detayLoading, setDetayLoading] = useState(false);
  const [detayError, setDetayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeKurum?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await gunSonuService.ozetRapor({
        kurum_id: activeKurum.id,
        gun,
        sube_id: activeSube?.id,
        notlar: notlarRef.current,
      });
      setOzet(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gün sonu özeti yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, gun]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setDetay(null);
    setDetayError(null);
  }, [gun, activeSube?.id]);

  const loadDetay = useCallback(async () => {
    if (!activeKurum?.id) return;
    setDetayLoading(true);
    setDetayError(null);
    try {
      const data = await gunSonuService.detayRapor({
        kurum_id: activeKurum.id,
        gun,
        sube_id: activeSube?.id,
        notlar: notlarRef.current,
      });
      if (!data?.detay_rapor) {
        throw new Error("Detay rapor verisi alınamadı");
      }
      setDetay(data.detay_rapor);
    } catch (e) {
      setDetay(null);
      setDetayError(e instanceof Error ? e.message : "Detay rapor yüklenemedi");
    } finally {
      setDetayLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, gun]);

  useEffect(() => {
    if (viewTab === "detay") loadDetay();
  }, [viewTab, loadDetay]);

  const rapor = ozet?.ozet_rapor;

  const buildExportPath = useCallback(
    (format: ExportFormat, orientation: "portrait" | "landscape") =>
      gunSonuService.exportPath({
        kurum_id: activeKurum!.id,
        gun,
        sube_id: activeSube?.id,
        notlar,
        format,
        orientation,
        rapor: viewTab === "detay" ? "detay" : "ozet",
      }),
    [activeKurum, activeSube?.id, gun, notlar, viewTab],
  );

  const filenamePrefix = useMemo(
    () => (viewTab === "detay" ? `gun-sonu-detay-${gun}` : `gun-sonu-ozet-${gun}`),
    [gun, viewTab],
  );

  if (!activeKurum) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 text-3xl">🏢</div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Gün sonu özetini görmek için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  return (
    <div>
      {!embedded && (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Gün Sonu</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Gün Sonu</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-xs font-semibold text-gray-500">Tarih</label>
        <input
          type="date"
          value={gun}
          max={todayIso()}
          onChange={(e) => setGun(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => setGun(todayIso())}
          className="px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition"
        >
          Bugün
        </button>

        <div className="flex-1" />

        <ExportDropdown
          buildPath={buildExportPath}
          filenamePrefix={filenamePrefix}
          disabled={loading || (viewTab === "detay" ? detayLoading || !detay : !ozet)}
          label={viewTab === "detay" ? "Detay Rapor İndir" : "Rapor İndir"}
        />
        <button
          type="button"
          disabled={loading || !ozet}
          onClick={() => setWhatsappOpen(true)}
          className="px-4 py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition disabled:opacity-50"
        >
          WhatsApp Gönder
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <TabButton active={viewTab === "rapor"} onClick={() => setViewTab("rapor")}>Özet Rapor</TabButton>
        <TabButton active={viewTab === "detay"} onClick={() => setViewTab("detay")}>Detay Rapor</TabButton>
        <TabButton active={viewTab === "canli"} onClick={() => setViewTab("canli")}>Canlı Özet</TabButton>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-400">Yükleniyor…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>
          <button onClick={load} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold">Tekrar Dene</button>
        </div>
      ) : ozet && viewTab === "rapor" ? (
        rapor ? (
          <OzetRaporView rapor={rapor} notlar={notlar} onNotlarChange={setNotlar} onNotlarBlur={load} />
        ) : (
          <div className="py-16 text-center text-sm text-gray-500">Rapor verisi alınamadı. Lütfen tekrar deneyin.</div>
        )
      ) : viewTab === "detay" ? (
        detayLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-400">Detay rapor yükleniyor…</p>
          </div>
        ) : detay ? (
          <GunSonuDetayView detay={detay} />
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-red-600 mb-2">{detayError || "Detay rapor yüklenemedi."}</p>
            <button type="button" onClick={loadDetay} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold">
              Tekrar Dene
            </button>
          </div>
        )
      ) : ozet ? (
        <CanliOzetView ozet={ozet} />
      ) : null}

      {whatsappOpen && activeKurum && (
        <GunSonuWhatsappModal
          kurumId={activeKurum.id}
          gun={gun}
          notlar={notlar}
          meta={rapor?.meta}
          onClose={() => setWhatsappOpen(false)}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold rounded-xl border transition ${
        active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function OzetRaporView({
  rapor,
  notlar,
  onNotlarChange,
  onNotlarBlur,
}: {
  rapor: GunSonuOzetRapor;
  notlar: string;
  onNotlarChange: (v: string) => void;
  onNotlarBlur: () => void;
}) {
  const { meta, gunluk_ozet, tahsilat_dagilimi, islem_sayilari, kullanici_ozeti } = rapor;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Rapor başlığı */}
      <div className="px-6 py-5 border-b-2 border-[#1F3C88] bg-gradient-to-r from-slate-50 to-blue-50/40">
        <div className="flex items-start gap-4">
          <img src="/img/3k-logo.png" alt="3K Kampüs" className="w-12 h-12 object-contain" />
          <div className="flex-1">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{meta.marka}</div>
            <h2 className="text-xl font-extrabold text-[#1F3C88] mt-0.5">{meta.baslik}</h2>
            {meta.kurum_ad && <div className="text-sm text-gray-600 mt-0.5">{meta.kurum_ad}</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 p-3 bg-white/70 rounded-xl border border-gray-100">
          <MetaChip label="Tarih" value={meta.tarih} />
          <MetaChip label="Şube" value={meta.sube} />
          <MetaChip label="Hazırlayan" value={meta.hazirlayan} />
          <MetaChip label="Oluşturulma" value={meta.olusturulma} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        <ReportSection title="A. Günlük Özet">
          <ReportTable
            headers={["Bilgi", "Tutar"]}
            rows={[
              ["Toplam Tahsilat", fmtTL(gunluk_ozet.toplam_tahsilat)],
              ["Toplam İade", fmtTL(gunluk_ozet.toplam_iade)],
              ["Toplam Gelir", fmtTL(gunluk_ozet.toplam_gelir)],
              ["Toplam Gider", fmtTL(gunluk_ozet.toplam_gider)],
              ["Net Nakit Girişi", fmtTL(gunluk_ozet.net_nakit_girisi)],
            ]}
            highlightLast
          />
        </ReportSection>

        <ReportSection title="B. Tahsilat Dağılımı">
          <ReportTable
            headers={["Ödeme Türü", "Tutar"]}
            rows={tahsilat_dagilimi.map((r) => [r.label, fmtTL(r.tutar)])}
            highlightLast
          />
        </ReportSection>

        <ReportSection title="C. İşlem Sayıları">
          <ReportTable
            headers={["İşlem", "Adet"]}
            rows={[
              ["Tahsilat", String(islem_sayilari.tahsilat)],
              ["Gelir Kaydı", String(islem_sayilari.gelir_kaydi)],
              ["Gider Kaydı", String(islem_sayilari.gider_kaydi)],
              ["İade", String(islem_sayilari.iade)],
              ["İptal", String(islem_sayilari.iptal)],
            ]}
          />
        </ReportSection>

        <ReportSection title="Kullanıcı Bazlı İşlem Özeti">
          {kullanici_ozeti.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Bugün personel bazlı işlem yok</p>
          ) : (
            <ReportTable
              headers={["Personel", "Tahsilat", "Gelir", "Gider"]}
              rows={kullanici_ozeti.map((k) => [
                k.personel,
                fmtTL(k.tahsilat),
                fmtTL(k.gelir),
                fmtTL(k.gider),
              ])}
            />
          )}
        </ReportSection>

        <ReportSection title="G. Notlar">
          <textarea
            value={notlar}
            onChange={(e) => onNotlarChange(e.target.value)}
            onBlur={onNotlarBlur}
            placeholder="Gün sonu notlarınızı buraya yazın…"
            rows={4}
            className="w-full px-4 py-3 border border-dashed border-gray-200 rounded-xl text-sm outline-none focus:border-blue-300 resize-none bg-gray-50/50"
          />
          <p className="text-[10px] text-gray-400 mt-1">Notlar rapor export ve WhatsApp gönderimine dahil edilir.</p>
        </ReportSection>
      </div>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-semibold text-gray-700 mt-0.5">{value}</div>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-extrabold text-[#1F3C88] mb-2 pl-3 border-l-4 border-blue-500">{title}</h3>
      {children}
    </section>
  );
}

function ReportTable({
  headers,
  rows,
  highlightLast,
}: {
  headers: string[];
  rows: string[][];
  highlightLast?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1F3C88] text-white">
            {headers.map((h) => (
              <th key={h} className="py-2.5 px-3 text-left text-[10px] font-bold uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, i) => (
            <tr
              key={i}
              className={
                highlightLast && i === rows.length - 1
                  ? "bg-blue-50 font-bold text-[#1F3C88]"
                  : i % 2 === 1
                    ? "bg-gray-50/50"
                    : ""
              }
            >
              {row.map((cell, j) => (
                <td key={j} className={`py-2 px-3 ${j > 0 ? "text-right tabular-nums" : "text-gray-700"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CanliOzetView({ ozet }: { ozet: GunSonuOzet }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <SummaryCard label="Toplam Tahsilat" value={fmtTL(ozet.tahsilatlar.toplam)} sub={`${ozet.tahsilatlar.adet} işlem`} color="#059669" />
        <SummaryCard label="Toplam Ödeme" value={fmtTL(ozet.odemeler.toplam)} sub={`${ozet.odemeler.adet} işlem`} color="#dc2626" />
        <SummaryCard label="İade" value={fmtTL(ozet.iade_toplam)} color="#d97706" />
        <SummaryCard label="Net" value={fmtTL(ozet.net)} color={ozet.net >= 0 ? "#059669" : "#dc2626"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Tahsilatlar">
          {ozet.tahsilatlar.kirilim.length === 0 ? (
            <EmptyRow text="Bugün tahsilat yok" />
          ) : (
            <>
              {ozet.tahsilatlar.kirilim.map((k) => (
                <RowLine key={k.tip} label={k.label} value={fmtTL(k.toplam)} sub={`${k.adet} işlem`} />
              ))}
              <TotalLine label="TOPLAM" value={fmtTL(ozet.tahsilatlar.toplam)} color="#059669" />
            </>
          )}
        </Panel>

        <Panel title="Ödemeler">
          {ozet.odemeler.kirilim.length === 0 ? (
            <EmptyRow text="Bugün ödeme yok" />
          ) : (
            <>
              {ozet.odemeler.kirilim.map((k) => (
                <RowLine key={k.tip} label={k.label} value={fmtTL(k.toplam)} sub={`${k.adet} işlem`} />
              ))}
              <TotalLine label="TOPLAM" value={fmtTL(ozet.odemeler.toplam)} color="#dc2626" />
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 mb-5">
        <SummaryCard label="Kasada Beklenen" value={fmtTL(ozet.kasada_beklenen)} color="#0891b2" />
        <SummaryCard label="Banka Bakiye" value={fmtTL(ozet.banka_bakiye)} color="#2563eb" />
        <SummaryCard label="Kart Bekleyen (POS)" value={fmtTL(ozet.kart_bekleyen)} color="#7c3aed" />
      </div>

      <Panel title="Hesap Bakiyeleri (Anlık)">
        {ozet.hesap_bakiyeleri.length === 0 ? (
          <EmptyRow text="Tanımlı mali hesap yok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase">
                  <th className="py-2 px-2">Hesap</th>
                  <th className="py-2 px-2">Tip</th>
                  <th className="py-2 px-2">Şube</th>
                  <th className="py-2 px-2 text-right">Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ozet.hesap_bakiyeleri.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 px-2 font-medium text-gray-800">{h.ad}</td>
                    <td className="py-2 px-2 text-gray-500">{h.tip_label}</td>
                    <td className="py-2 px-2 text-gray-500">{h.sube_ad || "—"}</td>
                    <td className="py-2 px-2 text-right font-bold text-gray-800">{fmtTL(h.bakiye)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4" style={{ borderLeftColor: color }}>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-extrabold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function RowLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <div className="text-sm font-bold text-gray-800">{value}</div>
        {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

function TotalLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between pt-3 mt-1 border-t-2" style={{ borderTopColor: color }}>
      <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
      <span className="text-base font-extrabold" style={{ color }}>{value}</span>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-gray-400">{text}</div>;
}
