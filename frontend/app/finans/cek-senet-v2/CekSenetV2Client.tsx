"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import FinansToast, { type FinansToastType } from "@/components/finans/FinansToast";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import { isCekSenetTip } from "@/lib/finans/paymentMethodUtils";
import { financialAccountService, paymentMethodService } from "../services/finans-api";
import { cariHesapService } from "../services/cari-hesap-api";
import { cekSenetV2Service } from "../services/cek-senet-v2-api";
import {
  durumMeta,
  SEKMELER,
  type CekSenetV2Dashboard,
  type CekSenetV2Kayit,
} from "../types/cek-senet-v2-types";
import CekSenetV2DashboardPanel from "./CekSenetV2Dashboard";
import CekSenetV2DetailDrawer from "./CekSenetV2DetailDrawer";
import CekSenetV2FormDrawer from "./CekSenetV2FormDrawer";
import "./cek-senet-v2.css";

type MaliHesap = { id: number; ad: string; tip?: string };
type Cari = { id: number; gorunen_ad: string };
type Yontem = { id: number; ad: string; tip: string };

const PAGE_SIZE = 25;

export default function CekSenetV2Client() {
  const { activeKurum, activeSube } = useKurum();
  const [dashboard, setDashboard] = useState<CekSenetV2Dashboard | null>(null);
  const [sekme, setSekme] = useState<string>("portfoy");
  const [items, setItems] = useState<CekSenetV2Kayit[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [arama, setArama] = useState("");
  const [aramaInput, setAramaInput] = useState("");
  const [sort, setSort] = useState("vade");
  const [toast, setToast] = useState<{ message: string; type: FinansToastType } | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [maliHesaplar, setMaliHesaplar] = useState<MaliHesap[]>([]);
  const [cariHesaplar, setCariHesaplar] = useState<Cari[]>([]);
  const [cekSenetYontemleri, setCekSenetYontemleri] = useState<Yontem[]>([]);

  const notify = useCallback((message: string, type: FinansToastType) => {
    setToast({ message, type });
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!activeKurum?.id) return;
    try {
      const d = await cekSenetV2Service.dashboard(activeKurum.id, activeSube?.id);
      setDashboard(d);
    } catch {
      /* dashboard hatası sessiz */
    }
  }, [activeKurum?.id, activeSube?.id]);

  const loadList = useCallback(async () => {
    if (!activeKurum?.id) return;
    setLoading(true);
    try {
      const res = await cekSenetV2Service.list({
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
        sekme,
        arama,
        sort,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(res.results || []);
      setCount(res.count || 0);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Liste yüklenemedi", "error");
    } finally {
      setLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, sekme, arama, sort, page, notify]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { void loadList(); }, [loadList]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setArama(aramaInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [aramaInput]);

  // Yardımcı dropdown'lar
  useEffect(() => {
    if (!activeKurum?.id) return;
    financialAccountService.dropdownByKurum(activeKurum.id, activeSube?.id ?? null)
      .then((res) => {
        const list = (res.mali_hesaplar || []).filter((h) => h.tip === "banka" || h.tip === "kasa");
        setMaliHesaplar(list.map((h) => ({ id: h.id, ad: h.ad, tip: h.tip })));
      })
      .catch(() => setMaliHesaplar([]));
    paymentMethodService.dropdown(activeKurum.id, null, activeSube?.id)
      .then((res) => setCekSenetYontemleri((res.odeme_yontemleri || []).filter((o) => isCekSenetTip(o.tip)) as Yontem[]))
      .catch(() => setCekSenetYontemleri([]));
    if (activeSube?.id) {
      cariHesapService.dropdown({ kurum_id: String(activeKurum.id), sube_id: String(activeSube.id) })
        .then((list) => setCariHesaplar(Array.isArray(list) ? (list as Cari[]) : []))
        .catch(() => setCariHesaplar([]));
    }
  }, [activeKurum?.id, activeSube?.id]);

  const refreshAll = useCallback(() => {
    void loadList();
    void loadDashboard();
  }, [loadList, loadDashboard]);

  const changeSekme = (next: string) => {
    setSekme(next);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const aktifSekme = useMemo(() => SEKMELER.find((s) => s.key === sekme), [sekme]);

  return (
    <div className="csv2-page">
      <div className="csv2-head">
        <div>
          <h1 className="csv2-title">💳 Çek / Senet Yönetimi</h1>
          <p className="csv2-subtitle">
            Portföy, tahsilat, ödeme, ciro ve protesto takibi — cari, banka/kasa ve gelir/gider ile entegre.
          </p>
        </div>
        <div className="csv2-head-actions">
          <button type="button" className="csv2-btn csv2-btn--primary" onClick={() => setFormOpen(true)}>
            + Yeni Çek / Senet
          </button>
        </div>
      </div>

      {dashboard && <CekSenetV2DashboardPanel data={dashboard} onCardClick={changeSekme} />}

      <div className="csv2-tabs">
        {SEKMELER.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`csv2-tab ${sekme === s.key ? "active" : ""}`}
            onClick={() => changeSekme(s.key)}
            title={s.aciklama}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="csv2-toolbar">
        <div className="csv2-search">
          <input
            placeholder={`${aktifSekme?.label || "Kayıt"} içinde ara…`}
            value={aramaInput}
            onChange={(e) => setAramaInput(e.target.value)}
          />
        </div>
        <select className="csv2-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="vade">Vade (yakın)</option>
          <option value="-vade">Vade (uzak)</option>
          <option value="-tutar">Tutar (çok)</option>
          <option value="tutar">Tutar (az)</option>
          <option value="-olusturma">En yeni</option>
        </select>
      </div>

      <div className="csv2-tablewrap">
        {loading ? (
          <div className="csv2-empty">Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div className="csv2-empty">Bu sekmede kayıt bulunamadı.</div>
        ) : (
          <table className="csv2-table">
            <thead>
              <tr>
                <th>Durum</th>
                <th>Tür</th>
                <th>Cari / Kişi</th>
                <th>Belge / Banka</th>
                <th className="csv2-num">Tutar</th>
                <th>Vade</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const m = durumMeta(row.durum);
                return (
                  <tr key={row.id} onClick={() => setDetailId(row.id)}>
                    <td>
                      <span className="csv2-badge" style={{ background: m.bg, color: m.renk }}>
                        {m.nokta} {row.durum_label}
                      </span>
                    </td>
                    <td>
                      <span className="csv2-arac">{row.arac_tipi_label}</span>{" "}
                      <span className="csv2-muted" style={{ fontSize: 11 }}>{row.yon_label}</span>
                    </td>
                    <td className="csv2-strong">{row.cari_label || row.ogrenci_adi || row.keside_eden || "—"}</td>
                    <td>
                      {row.cek_senet_no || "—"}
                      {row.banka_adi ? <span className="csv2-muted"> · {row.banka_adi}</span> : ""}
                    </td>
                    <td className="csv2-num">{fmtTL(row.tutar)}</td>
                    <td>
                      {fmtDate(row.vade_tarihi)}
                      {row.gecikme_gun > 0 && <div className="csv2-geciken" style={{ fontSize: 11 }}>{row.gecikme_gun}g gecikmiş</div>}
                      {row.gecikme_gun === 0 && row.gun_kalan != null && row.gun_kalan >= 0 && row.gun_kalan <= 7 && row.aktif_mi && (
                        <div className="csv2-yaklasan" style={{ fontSize: 11 }}>{row.gun_kalan}g kaldı</div>
                      )}
                    </td>
                    <td className="csv2-muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.durum_aciklamasi || row.aciklama || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {count > PAGE_SIZE && (
        <div className="csv2-pagination">
          <span>{count} kayıt · Sayfa {page}/{totalPages}</span>
          <div className="csv2-pagination-btns">
            <button type="button" className="csv2-btn csv2-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Önceki</button>
            <button type="button" className="csv2-btn csv2-btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki ›</button>
          </div>
        </div>
      )}

      {detailId != null && (
        <CekSenetV2DetailDrawer
          kayitId={detailId}
          maliHesaplar={maliHesaplar}
          cariHesaplar={cariHesaplar}
          onClose={() => setDetailId(null)}
          onChanged={refreshAll}
          notify={notify}
        />
      )}

      {formOpen && activeKurum?.id && (
        <CekSenetV2FormDrawer
          kurumId={activeKurum.id}
          subeId={activeSube?.id}
          cariHesaplar={cariHesaplar}
          cekSenetYontemleri={cekSenetYontemleri}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); refreshAll(); }}
          notify={notify}
        />
      )}

      {toast && <FinansToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
