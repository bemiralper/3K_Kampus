"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import ExportDropdown, { type ExportFormat } from "@/components/finans/ExportDropdown";
import GunSonuWhatsappModal from "@/components/finans/GunSonuWhatsappModal";
import GunSonuDetayView from "./GunSonuDetayView";
import GGProvider from "../gelir-gider-v2/GGProvider";
import { gunSonuService } from "../services/para-hareketi-api";
import type { GunSonuDetayRapor, GunSonuOzet, GunSonuOzetRapor } from "../types/para-hareketi-types";
import { fmtTL } from "@/components/finans/FinansFilterBar";
import { todayIsoLocal } from "@/lib/date-utils";
import "./gun-sonu.css";

function todayIso() { return todayIsoLocal(); }

function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

type ViewTab = "rapor" | "detay" | "canli";

const VIEW_TABS: { value: ViewTab; label: string }[] = [
  { value: "rapor", label: "Özet Rapor" },
  { value: "detay", label: "Detay Rapor" },
  { value: "canli", label: "Canlı Özet" },
];

function GunSonuInner({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum, activeSube } = useKurum();

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
    if (!activeKurum?.id) { setLoading(false); return; }
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

  useEffect(() => { setDetay(null); setDetayError(null); }, [gun, activeSube?.id]);

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
      if (!data?.detay_rapor) throw new Error("Detay rapor verisi alınamadı");
      setDetay(data.detay_rapor);
    } catch (e) {
      setDetay(null);
      setDetayError(e instanceof Error ? e.message : "Detay rapor yüklenemedi");
    } finally {
      setDetayLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, gun]);

  useEffect(() => { if (viewTab === "detay") loadDetay(); }, [viewTab, loadDetay]);

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

  const isToday = gun === todayIso();
  const isYesterday = gun === yesterdayIso();

  if (!activeKurum) {
    return (
      <div className="gs-state">
        <p>Gün sonu özetini görmek için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  return (
    <div className="gs-page">
      {!embedded && (
        <div className="gs-head">
          <h1>Gün Sonu Finans Raporu</h1>
          <p>Seçilen günün tahsilat, gider ve nakit hareketlerini tek bakışta görün; özet halinde inceleyin veya detaylı dökün.</p>
        </div>
      )}

      <div className="gs-toolbar">
        <div className="gs-toolbar__group">
          <span className="gs-toolbar__label">Tarih</span>
          <input
            type="date"
            value={gun}
            max={todayIso()}
            onChange={(e) => e.target.value && setGun(e.target.value)}
          />
          <button type="button" className={`gs-btn ${isYesterday ? "gs-btn--active" : ""}`} onClick={() => setGun(yesterdayIso())}>
            Dün
          </button>
          <button type="button" className={`gs-btn ${isToday ? "gs-btn--active" : ""}`} onClick={() => setGun(todayIso())}>
            Bugün
          </button>
          {activeSube?.ad && <span className="gs-chip">🏢 {activeSube.ad}</span>}
        </div>
        <div className="gs-toolbar__group">
          <ExportDropdown
            buildPath={buildExportPath}
            filenamePrefix={filenamePrefix}
            disabled={loading || (viewTab === "detay" ? detayLoading || !detay : !ozet)}
            label={viewTab === "detay" ? "Detay Rapor İndir" : "Rapor İndir"}
          />
          <button
            type="button"
            className="gs-btn gs-btn--whatsapp"
            disabled={loading || !ozet}
            onClick={() => setWhatsappOpen(true)}
          >
            💬 WhatsApp Gönder
          </button>
        </div>
      </div>

      <div className="gs-tabs">
        {VIEW_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={viewTab === t.value ? "active" : ""}
            onClick={() => setViewTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="gs-state"><div className="gs-spinner" /><p>Yükleniyor…</p></div>
      ) : error ? (
        <div className="gs-state">
          <p className="gs-state__error">{error}</p>
          <button type="button" className="gs-btn gs-btn--danger" onClick={load}>Tekrar Dene</button>
        </div>
      ) : ozet && viewTab === "rapor" ? (
        rapor ? (
          <OzetRaporView rapor={rapor} notlar={notlar} onNotlarChange={setNotlar} onNotlarBlur={load} />
        ) : (
          <div className="gs-state"><p>Rapor verisi alınamadı. Lütfen tekrar deneyin.</p></div>
        )
      ) : viewTab === "detay" ? (
        detayLoading ? (
          <div className="gs-state"><div className="gs-spinner" /><p>Detay rapor yükleniyor…</p></div>
        ) : detay ? (
          <GunSonuDetayView detay={detay} />
        ) : (
          <div className="gs-state">
            <p className="gs-state__error">{detayError || "Detay rapor yüklenemedi."}</p>
            <button type="button" className="gs-btn gs-btn--danger" onClick={loadDetay}>Tekrar Dene</button>
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

/* ─── Özet Rapor ─────────────────────────────────────────────── */

function OzetRaporView({
  rapor, notlar, onNotlarChange, onNotlarBlur,
}: {
  rapor: GunSonuOzetRapor;
  notlar: string;
  onNotlarChange: (v: string) => void;
  onNotlarBlur: () => void;
}) {
  const { meta, gunluk_ozet, tahsilat_dagilimi, islem_sayilari, kullanici_ozeti } = rapor;

  const netSonuc = gunluk_ozet.net_gunluk_finansal_sonuc ?? (
    (gunluk_ozet.toplam_alinan ?? gunluk_ozet.toplam_tahsilat) + gunluk_ozet.toplam_gelir
    - gunluk_ozet.toplam_gider - gunluk_ozet.toplam_iade
  );
  const toplamAlinan = gunluk_ozet.toplam_alinan ?? gunluk_ozet.toplam_tahsilat;
  // `tahsilat_dagilimi` son satırda zaten bir "Toplam" satırı içerir (tip === "toplam").
  const dagilimSatirlari = tahsilat_dagilimi.filter((r) => r.tip !== "toplam");
  const dagilimToplamSatiri = tahsilat_dagilimi.find((r) => r.tip === "toplam");
  const dagilimToplam = dagilimToplamSatiri?.tutar ?? dagilimSatirlari.reduce((s, r) => s + (r.tutar || 0), 0);
  const dagilimPaydasi = dagilimToplam || 1;

  return (
    <div className="gs-page">
      <div className="gs-meta">
        <div className="gs-meta__item"><span className="gs-meta__label">Kurum</span><span className="gs-meta__value">{meta.kurum_ad || meta.marka}</span></div>
        <div className="gs-meta__item"><span className="gs-meta__label">Şube</span><span className="gs-meta__value">{meta.sube}</span></div>
        <div className="gs-meta__item"><span className="gs-meta__label">Tarih</span><span className="gs-meta__value">{meta.tarih}</span></div>
        <div className="gs-meta__item"><span className="gs-meta__label">Hazırlayan</span><span className="gs-meta__value">{meta.hazirlayan}</span></div>
        <div className="gs-meta__item"><span className="gs-meta__label">Oluşturulma</span><span className="gs-meta__value">{meta.olusturulma}</span></div>
      </div>

      <div className="gs-hero-grid">
        <div className="gs-hero gs-hero--in">
          <span className="gs-hero__label">Toplam Alınan</span>
          <span className="gs-hero__value">{fmtTL(toplamAlinan)}</span>
          <span className="gs-hero__hint">Sözleşme tahsilatı + serbest gelir + cari tahsilat</span>
        </div>
        <div className="gs-hero gs-hero--out">
          <span className="gs-hero__label">Toplam Gider</span>
          <span className="gs-hero__value">{fmtTL(gunluk_ozet.toplam_gider)}</span>
          <span className="gs-hero__hint">Bugün ödenen giderler (+ iade {fmtTL(gunluk_ozet.toplam_iade)})</span>
        </div>
        <div className="gs-hero gs-hero--net">
          <span className="gs-hero__label">Net Günlük Sonuç</span>
          <span className="gs-hero__value">{fmtTL(netSonuc)}</span>
          <span className="gs-hero__hint">Alınan − gider − iade</span>
        </div>
        <div className="gs-hero gs-hero--info">
          <span className="gs-hero__label">Net Nakit Girişi (Kasa)</span>
          <span className="gs-hero__value">{fmtTL(gunluk_ozet.net_nakit_girisi)}</span>
          <span className="gs-hero__hint">Fiziksel kasa hesaplarındaki giriş − çıkış</span>
        </div>
      </div>

      <div className="gs-panel">
        <div className="gs-panel__head">
          <h3><span className="gs-panel__head-icon" />Tahsilat Dağılımı</h3>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Ödeme türüne göre</span>
        </div>
        <div className="gs-panel__body">
          {dagilimSatirlari.length === 0 ? (
            <p className="gs-table-empty">Bugün tahsilat kaydı yok.</p>
          ) : (
            <div className="gs-bars">
              {dagilimSatirlari.map((r) => (
                <div className="gs-bar-row" key={r.label}>
                  <div className="gs-bar-row__top">
                    <span className="gs-bar-row__label">{r.label}{r.adet != null && <span className="gs-bar-row__sub"> · {r.adet} işlem</span>}</span>
                    <span className="gs-bar-row__value">{fmtTL(r.tutar)}</span>
                  </div>
                  <div className="gs-bar-track">
                    <div className="gs-bar-fill" style={{ width: `${Math.min(100, (r.tutar / dagilimPaydasi) * 100)}%` }} />
                  </div>
                </div>
              ))}
              <div className="gs-bar-total">
                <span>Toplam</span>
                <strong>{fmtTL(dagilimToplam)}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="gs-panel">
        <div className="gs-panel__head"><h3><span className="gs-panel__head-icon" />İşlem Sayıları</h3></div>
        <div className="gs-panel__body">
          <div className="gs-stat-grid">
            <div className="gs-stat"><div className="gs-stat__label">Tahsilat</div><div className="gs-stat__value">{islem_sayilari.tahsilat}</div></div>
            <div className="gs-stat"><div className="gs-stat__label">Gelir Kaydı</div><div className="gs-stat__value">{islem_sayilari.gelir_kaydi}</div></div>
            <div className="gs-stat"><div className="gs-stat__label">Gider Kaydı</div><div className="gs-stat__value">{islem_sayilari.gider_kaydi}</div></div>
            <div className="gs-stat"><div className="gs-stat__label">İade</div><div className="gs-stat__value">{islem_sayilari.iade}</div></div>
            <div className="gs-stat"><div className="gs-stat__label">İptal</div><div className="gs-stat__value">{islem_sayilari.iptal}</div></div>
          </div>
        </div>
      </div>

      <div className="gs-panel">
        <div className="gs-panel__head"><h3><span className="gs-panel__head-icon" />Kullanıcı Bazlı İşlem Özeti</h3></div>
        <div className="gs-panel__body" style={{ padding: kullanici_ozeti.length === 0 ? 16 : 0 }}>
          {kullanici_ozeti.length === 0 ? (
            <p className="gs-table-empty">Bugün personel bazlı işlem yok.</p>
          ) : (
            <div className="gs-table-wrap">
              <table className="gs-table">
                <thead>
                  <tr>
                    <th>Personel</th>
                    <th className="gs-num">Tahsilat</th>
                    <th className="gs-num">Gelir</th>
                    <th className="gs-num">Gider</th>
                  </tr>
                </thead>
                <tbody>
                  {kullanici_ozeti.map((k) => (
                    <tr key={k.personel}>
                      <td>{k.personel}</td>
                      <td className="gs-num">{fmtTL(k.tahsilat)}</td>
                      <td className="gs-num">{fmtTL(k.gelir)}</td>
                      <td className="gs-num">{fmtTL(k.gider)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="gs-panel">
        <div className="gs-panel__head"><h3><span className="gs-panel__head-icon" />Notlar</h3></div>
        <div className="gs-panel__body gs-notes">
          <textarea
            value={notlar}
            onChange={(e) => onNotlarChange(e.target.value)}
            onBlur={onNotlarBlur}
            placeholder="Gün sonu notlarınızı buraya yazın…"
          />
          <p className="gs-notes__hint">Notlar, PDF/Excel çıktısına ve WhatsApp gönderimine dahil edilir.</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Canlı Özet ─────────────────────────────────────────────── */

function CanliOzetView({ ozet }: { ozet: GunSonuOzet }) {
  return (
    <div className="gs-page">
      <div className="gs-hero-grid">
        <div className="gs-hero gs-hero--in">
          <span className="gs-hero__label">Toplam Tahsilat</span>
          <span className="gs-hero__value">{fmtTL(ozet.tahsilatlar.toplam)}</span>
          <span className="gs-hero__hint">{ozet.tahsilatlar.adet} işlem</span>
        </div>
        <div className="gs-hero gs-hero--out">
          <span className="gs-hero__label">Toplam Ödeme</span>
          <span className="gs-hero__value">{fmtTL(ozet.odemeler.toplam)}</span>
          <span className="gs-hero__hint">{ozet.odemeler.adet} işlem</span>
        </div>
        <div className="gs-hero gs-hero--info">
          <span className="gs-hero__label">İade</span>
          <span className="gs-hero__value">{fmtTL(ozet.iade_toplam)}</span>
        </div>
        <div className={`gs-hero ${ozet.net >= 0 ? "gs-hero--in" : "gs-hero--out"}`}>
          <span className="gs-hero__label">Net</span>
          <span className="gs-hero__value">{fmtTL(ozet.net)}</span>
        </div>
      </div>

      <div className="gs-chart-grid">
        <div className="gs-panel">
          <div className="gs-panel__head"><h3><span className="gs-panel__head-icon" />Tahsilatlar</h3></div>
          <div className="gs-panel__body">
            {ozet.tahsilatlar.kirilim.length === 0 ? (
              <p className="gs-table-empty">Bugün tahsilat yok.</p>
            ) : (
              <div className="gs-bars">
                {ozet.tahsilatlar.kirilim.map((k) => (
                  <div className="gs-bar-row" key={k.tip}>
                    <div className="gs-bar-row__top">
                      <span className="gs-bar-row__label">{k.label} <span className="gs-bar-row__sub">· {k.adet} işlem</span></span>
                      <span className="gs-bar-row__value">{fmtTL(k.toplam)}</span>
                    </div>
                  </div>
                ))}
                <div className="gs-bar-total"><span>Toplam</span><strong>{fmtTL(ozet.tahsilatlar.toplam)}</strong></div>
              </div>
            )}
          </div>
        </div>
        <div className="gs-panel">
          <div className="gs-panel__head"><h3><span className="gs-panel__head-icon" />Ödemeler</h3></div>
          <div className="gs-panel__body">
            {ozet.odemeler.kirilim.length === 0 ? (
              <p className="gs-table-empty">Bugün ödeme yok.</p>
            ) : (
              <div className="gs-bars">
                {ozet.odemeler.kirilim.map((k) => (
                  <div className="gs-bar-row" key={k.tip}>
                    <div className="gs-bar-row__top">
                      <span className="gs-bar-row__label">{k.label} <span className="gs-bar-row__sub">· {k.adet} işlem</span></span>
                      <span className="gs-bar-row__value">{fmtTL(k.toplam)}</span>
                    </div>
                  </div>
                ))}
                <div className="gs-bar-total"><span>Toplam</span><strong>{fmtTL(ozet.odemeler.toplam)}</strong></div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="gs-stat-grid">
        <div className="gs-stat"><div className="gs-stat__label">Kasada Beklenen</div><div className="gs-stat__value">{fmtTL(ozet.kasada_beklenen)}</div></div>
        <div className="gs-stat"><div className="gs-stat__label">Banka Bakiye</div><div className="gs-stat__value">{fmtTL(ozet.banka_bakiye)}</div></div>
        <div className="gs-stat"><div className="gs-stat__label">Kart Bekleyen (POS)</div><div className="gs-stat__value">{fmtTL(ozet.kart_bekleyen)}</div></div>
      </div>

      <div className="gs-panel">
        <div className="gs-panel__head"><h3><span className="gs-panel__head-icon" />Hesap Bakiyeleri (Anlık)</h3></div>
        <div className="gs-panel__body" style={{ padding: ozet.hesap_bakiyeleri.length === 0 ? 16 : 0 }}>
          {ozet.hesap_bakiyeleri.length === 0 ? (
            <p className="gs-table-empty">Tanımlı mali hesap yok.</p>
          ) : (
            <div className="gs-table-wrap">
              <table className="gs-table">
                <thead>
                  <tr><th>Hesap</th><th>Tip</th><th>Şube</th><th className="gs-num">Bakiye</th></tr>
                </thead>
                <tbody>
                  {ozet.hesap_bakiyeleri.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 700, color: "#0f172a" }}>{h.ad}</td>
                      <td>{h.tip_label || "—"}</td>
                      <td>{h.sube_ad || "—"}</td>
                      <td className="gs-num" style={{ fontWeight: 700 }}>{fmtTL(h.bakiye)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GunSonuClient({ embedded = false }: { embedded?: boolean }) {
  return (
    <GGProvider>
      <GunSonuInner embedded={embedded} />
    </GGProvider>
  );
}
