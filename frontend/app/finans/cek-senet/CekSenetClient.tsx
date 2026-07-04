"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import FinansToast, { type FinansToastType } from "@/components/finans/FinansToast";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import { cekSenetService, type CekSenetKayit } from "../services/cek-senet-api";
import { financialAccountService, paymentMethodService } from "../services/finans-api";
import { cariHesapService } from "../services/cari-hesap-api";
import { isCekSenetTip } from "@/lib/finans/paymentMethodUtils";
import CekSenetInfoTip from "./CekSenetInfoTip";
import { getDurumHelp, getGecisHelp, TERIM_HELP } from "./cek-senet-help";
import "./cek-senet.css";

type YonTab = "alinan" | "verilen";

const DURUM_CLASS: Record<string, string> = {
  bekliyor: "cs-badge cs-badge--gray",
  portfoyde: "cs-badge cs-badge--blue",
  tahsilde: "cs-badge cs-badge--orange",
  tahsil_edildi: "cs-badge cs-badge--green",
  odendi: "cs-badge cs-badge--green",
  iptal: "cs-badge cs-badge--red",
  karsiliksiz: "cs-badge cs-badge--red",
  iade: "cs-badge cs-badge--yellow",
};

export default function CekSenetClient() {
  const { activeKurum, activeSube } = useKurum();
  const [yon, setYon] = useState<YonTab>("alinan");
  const [items, setItems] = useState<CekSenetKayit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CekSenetKayit | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: FinansToastType } | null>(null);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip?: string }[]>([]);
  const [maliHesapLoading, setMaliHesapLoading] = useState(false);
  const [form, setForm] = useState({
    cek_senet_no: "",
    banka_adi: "",
    keside_eden: "",
    tahsilat_mali_hesap_id: "",
    aciklama: "",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [cekSenetYontemleri, setCekSenetYontemleri] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [cariHesaplar, setCariHesaplar] = useState<{ id: number; gorunen_ad: string }[]>([]);
  const [createForm, setCreateForm] = useState({
    cari_hesap_id: "",
    odeme_yontemi_id: "",
    tutar: "",
    vade_tarihi: "",
    cek_senet_no: "",
    banka_adi: "",
    aciklama: "",
  });

  const load = useCallback(async () => {
    if (!activeKurum?.id) return;
    setLoading(true);
    try {
      const res = await cekSenetService.list({
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
        yon,
      });
      setItems(res.results || []);
    } catch (e: unknown) {
      setToast({ message: e instanceof Error ? e.message : "Liste yüklenemedi", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, yon]);

  useEffect(() => { load(); }, [load]);

  const loadMaliHesaplar = useCallback(async (subeId?: number | null) => {
    if (!activeKurum?.id) return;
    const resolvedSubeId = subeId ?? activeSube?.id ?? null;
    setMaliHesapLoading(true);
    try {
      const res = await financialAccountService.dropdownByKurum(activeKurum.id, resolvedSubeId);
      const raw = res.mali_hesaplar || [];
      const list = raw.filter((h) => h.tip === "banka" || h.tip === "kasa");
      setMaliHesaplar(list.map((h) => ({ id: h.id, ad: h.ad, tip: h.tip })));
    } catch (e: unknown) {
      setMaliHesaplar([]);
      setToast({
        message: e instanceof Error ? e.message : "Banka/kasa hesapları yüklenemedi",
        type: "error",
      });
    } finally {
      setMaliHesapLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id]);

  useEffect(() => {
    if (!activeKurum?.id) return;
    loadMaliHesaplar();
    paymentMethodService.dropdown(activeKurum.id, null, activeSube?.id)
      .then((res) => {
        const list = (res.odeme_yontemleri || []).filter((o) => isCekSenetTip(o.tip));
        setCekSenetYontemleri(list);
      })
      .catch(() => setCekSenetYontemleri([]));
    if (activeSube?.id) {
      cariHesapService.dropdown({ kurum_id: String(activeKurum.id), sube_id: String(activeSube.id) })
        .then((list) => setCariHesaplar(Array.isArray(list) ? list : []))
        .catch(() => setCariHesaplar([]));
    }
  }, [activeKurum?.id, activeSube?.id, loadMaliHesaplar]);

  const canTahsilAlinan = (detail: CekSenetKayit) =>
    detail.yon === "alinan" && (detail.durum === "tahsilde" || detail.durum === "portfoyde");

  const canOdeVerilen = (detail: CekSenetKayit) =>
    detail.yon === "verilen" && detail.durum === "verildi";

  const openDetail = async (item: CekSenetKayit) => {
    try {
      const detail = await cekSenetService.detail(item.id);
      setSelected(detail);
      setForm({
        cek_senet_no: detail.cek_senet_no || "",
        banka_adi: detail.banka_adi || "",
        keside_eden: detail.keside_eden || "",
        tahsilat_mali_hesap_id: detail.tahsilat_mali_hesap_id ? String(detail.tahsilat_mali_hesap_id) : "",
        aciklama: "",
      });
      setDrawerOpen(true);
      void loadMaliHesaplar(detail.sube_id ?? activeSube?.id);
    } catch {
      setToast({ message: "Detay yüklenemedi", type: "error" });
    }
  };

  const doTransition = async (durum: string) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const updated = await cekSenetService.transition(selected.id, {
        durum,
        cek_senet_no: form.cek_senet_no,
        banka_adi: form.banka_adi,
        keside_eden: form.keside_eden,
      });
      setSelected(updated);
      setToast({ message: `Durum güncellendi: ${updated.durum_label}`, type: "success" });
      load();
    } catch (e: unknown) {
      setToast({ message: e instanceof Error ? e.message : "İşlem başarısız", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const doTahsil = async () => {
    if (!selected || !form.tahsilat_mali_hesap_id) {
      setToast({ message: "Tahsilat için banka/kasa hesabı seçin", type: "error" });
      return;
    }
    setActionLoading(true);
    try {
      await cekSenetService.tahsil(selected.id, {
        tahsilat_mali_hesap_id: Number(form.tahsilat_mali_hesap_id),
        aciklama: form.aciklama,
      });
      setToast({ message: "Tahsilat kaydedildi", type: "success" });
      setDrawerOpen(false);
      load();
    } catch (e: unknown) {
      setToast({ message: e instanceof Error ? e.message : "Tahsilat başarısız", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const doOde = async () => {
    if (!selected || !form.tahsilat_mali_hesap_id) {
      setToast({ message: "Ödeme için banka/kasa hesabı seçin", type: "error" });
      return;
    }
    setActionLoading(true);
    try {
      await cekSenetService.ode(selected.id, {
        odeme_mali_hesap_id: Number(form.tahsilat_mali_hesap_id),
        aciklama: form.aciklama,
      });
      setToast({ message: "Ödeme kaydedildi", type: "success" });
      setDrawerOpen(false);
      load();
    } catch (e: unknown) {
      setToast({ message: e instanceof Error ? e.message : "Ödeme başarısız", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const doCreateVerilen = async () => {
    if (!activeKurum?.id || !createForm.odeme_yontemi_id || !createForm.tutar || !createForm.vade_tarihi) {
      setToast({ message: "Cari (opsiyonel), ödeme yöntemi, tutar ve vade zorunlu", type: "error" });
      return;
    }
    setCreateSaving(true);
    try {
      await cekSenetService.createVerilen({
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
        cari_hesap_id: createForm.cari_hesap_id ? Number(createForm.cari_hesap_id) : undefined,
        odeme_yontemi_id: Number(createForm.odeme_yontemi_id),
        tutar: Number(createForm.tutar),
        vade_tarihi: createForm.vade_tarihi,
        cek_senet_no: createForm.cek_senet_no,
        banka_adi: createForm.banka_adi,
        aciklama: createForm.aciklama,
      });
      setToast({ message: "Verilen çek/senet kaydı oluşturuldu", type: "success" });
      setCreateOpen(false);
      setCreateForm({
        cari_hesap_id: "",
        odeme_yontemi_id: "",
        tutar: "",
        vade_tarihi: "",
        cek_senet_no: "",
        banka_adi: "",
        aciklama: "",
      });
      setYon("verilen");
      load();
    } catch (e: unknown) {
      setToast({ message: e instanceof Error ? e.message : "Kayıt oluşturulamadı", type: "error" });
    } finally {
      setCreateSaving(false);
    }
  };

  return (
    <div className="cek-senet-page">
      <div className="cs-header">
        <div>
          <h1 className="cs-title">Çek / Senet Portföyü</h1>
          <p className="cs-subtitle">Plan kaydından oluşan portföy — mali hareket yalnızca tahsil/ödeme anında.</p>
        </div>
        {yon === "verilen" && (
          <button type="button" className="cs-btn cs-btn--primary" onClick={() => setCreateOpen(true)}>
            + Yeni Verilen
          </button>
        )}
      </div>

      <div className="cs-tabs">
        {(["alinan", "verilen"] as YonTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`cs-tab ${yon === tab ? "cs-tab--active" : ""}`}
            onClick={() => setYon(tab)}
          >
            {tab === "alinan" ? "Alınan" : "Verilen"}
            <CekSenetInfoTip
              label={tab === "alinan" ? "Alınan" : "Verilen"}
              text={tab === "alinan" ? TERIM_HELP.alinan : TERIM_HELP.verilen}
            />
          </button>
        ))}
      </div>

      <div className="cs-card">
        {loading ? (
          <div className="cs-empty">Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div className="cs-empty">Kayıt bulunamadı</div>
        ) : (
          <table className="cs-table">
            <thead>
              <tr>
                <th>Cari / Öğrenci</th>
                <th>Sözleşme</th>
                <th>Tutar</th>
                <th>Vade</th>
                <th>Durum</th>
                <th>No / Banka</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.ogrenci_adi || "—"}</td>
                  <td>{row.sozlesme_no || "—"}</td>
                  <td>{fmtTL(row.tutar)}</td>
                  <td>{fmtDate(row.vade_tarihi)}</td>
                  <td><span className={DURUM_CLASS[row.durum] || "cs-badge"}>{row.durum_label}</span></td>
                  <td>{row.cek_senet_no || "—"} {row.banka_adi ? `/ ${row.banka_adi}` : ""}</td>
                  <td>
                    <button type="button" className="cs-link-btn" onClick={() => openDetail(row)}>Detay</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && selected && (
        <div className="cs-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="cs-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cs-drawer-head">
              <h2>
                #{selected.id} — {selected.durum_label}
                <CekSenetInfoTip
                  label={getDurumHelp(selected.durum).baslik}
                  text={getDurumHelp(selected.durum).aciklama}
                />
              </h2>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>
            <div className="cs-drawer-body">
              <div className="cs-meta-grid">
                <span>Tutar</span><strong>{fmtTL(selected.tutar)}</strong>
                <span>Vade</span><strong>{fmtDate(selected.vade_tarihi)}</strong>
                <span>Yöntem</span><strong>{selected.odeme_yontemi_adi || "—"}</strong>
                <span>Sözleşme</span><strong>{selected.sozlesme_no || "—"}</strong>
              </div>

              {(selected.durum === "bekliyor" || selected.durum === "portfoyde") && (
                <div className="cs-form-block">
                  <label>Çek/Senet No</label>
                  <input value={form.cek_senet_no} onChange={(e) => setForm({ ...form, cek_senet_no: e.target.value })} />
                  <label>Banka</label>
                  <input value={form.banka_adi} onChange={(e) => setForm({ ...form, banka_adi: e.target.value })} />
                  <label>
                    Keşide Eden
                    <CekSenetInfoTip label="Keşide eden" text={TERIM_HELP.keside_eden} />
                  </label>
                  <input value={form.keside_eden} onChange={(e) => setForm({ ...form, keside_eden: e.target.value })} />
                </div>
              )}

              {canTahsilAlinan(selected) && (
                <div className="cs-form-block">
                  <label>
                    Tahsilat Mali Hesabı (Banka/Kasa)
                    <CekSenetInfoTip label="Tahsilat hesabı" text={TERIM_HELP.tahsilat_hesabi} />
                  </label>
                  <select
                    value={form.tahsilat_mali_hesap_id}
                    onChange={(e) => setForm({ ...form, tahsilat_mali_hesap_id: e.target.value })}
                    disabled={maliHesapLoading}
                  >
                    <option value="">
                      {maliHesapLoading ? "Hesaplar yükleniyor…" : "Seçin…"}
                    </option>
                    {maliHesaplar.map((h) => (
                      <option key={h.id} value={h.id}>{h.ad}</option>
                    ))}
                  </select>
                  {!maliHesapLoading && maliHesaplar.length === 0 && (
                    <p className="cs-field-hint cs-field-hint--warn">
                      Bu şubede tanımlı banka veya kasa hesabı yok. Finans → Tanımlar → Mali Hesaplar
                      bölümünden en az bir banka veya kasa ekleyin.
                    </p>
                  )}
                  <label>Açıklama</label>
                  <input value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} />
                </div>
              )}

              {canOdeVerilen(selected) && (
                <div className="cs-form-block">
                  <label>
                    Ödeme Mali Hesabı (Banka/Kasa)
                    <CekSenetInfoTip label="Ödeme hesabı" text={TERIM_HELP.odeme_hesabi} />
                  </label>
                  <select
                    value={form.tahsilat_mali_hesap_id}
                    onChange={(e) => setForm({ ...form, tahsilat_mali_hesap_id: e.target.value })}
                    disabled={maliHesapLoading}
                  >
                    <option value="">
                      {maliHesapLoading ? "Hesaplar yükleniyor…" : "Seçin…"}
                    </option>
                    {maliHesaplar.map((h) => (
                      <option key={h.id} value={h.id}>{h.ad}</option>
                    ))}
                  </select>
                  {!maliHesapLoading && maliHesaplar.length === 0 && (
                    <p className="cs-field-hint cs-field-hint--warn">
                      Bu şubede tanımlı banka veya kasa hesabı yok. Finans → Tanımlar → Mali Hesaplar
                      bölümünden en az bir banka veya kasa ekleyin.
                    </p>
                  )}
                  <label>Açıklama</label>
                  <input value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} />
                </div>
              )}

              <div className="cs-actions">
                {selected.allowed_transitions?.map((t) => {
                  if (t.durum === "tahsil_edildi" && selected.yon === "alinan") {
                    return (
                      <div key={t.durum} className="cs-action-row">
                        <button type="button" className="cs-btn cs-btn--primary" disabled={actionLoading} onClick={doTahsil}>
                          Tahsil Et
                        </button>
                        <CekSenetInfoTip label="Tahsil et" text={getGecisHelp("tahsil_edildi")} />
                      </div>
                    );
                  }
                  if (t.durum === "odendi" && selected.yon === "verilen") {
                    return (
                      <div key={t.durum} className="cs-action-row">
                        <button type="button" className="cs-btn cs-btn--primary" disabled={actionLoading} onClick={doOde}>
                          Ödendi İşaretle
                        </button>
                        <CekSenetInfoTip label="Ödendi" text={getGecisHelp("odendi")} />
                      </div>
                    );
                  }
                  return (
                    <div key={t.durum} className="cs-action-row">
                      <button
                        type="button"
                        className="cs-btn cs-btn--secondary"
                        disabled={actionLoading}
                        onClick={() => doTransition(t.durum)}
                      >
                        → {t.label}
                      </button>
                      <CekSenetInfoTip label={t.label} text={getGecisHelp(t.durum)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <FinansToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {createOpen && (
        <div className="cs-drawer-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="cs-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cs-drawer-head">
              <h2>Yeni Verilen Çek/Senet</h2>
              <button type="button" onClick={() => setCreateOpen(false)}>✕</button>
            </div>
            <div className="cs-drawer-body">
              {cekSenetYontemleri.length === 0 && (
                <p style={{ fontSize: 12, color: "#b45309", marginBottom: 12 }}>
                  Önce Finans → Tanımlar → Ödeme Yöntemleri&apos;nden Çek veya Senet tipi tanımlayın.
                </p>
              )}
              <div className="cs-form-block">
                <label>Cari Hesap</label>
                <select value={createForm.cari_hesap_id} onChange={(e) => setCreateForm({ ...createForm, cari_hesap_id: e.target.value })}>
                  <option value="">Seçin (opsiyonel)</option>
                  {cariHesaplar.map((c) => (
                    <option key={c.id} value={c.id}>{c.gorunen_ad}</option>
                  ))}
                </select>
                <label>Ödeme Yöntemi *</label>
                <select
                  required
                  value={createForm.odeme_yontemi_id}
                  onChange={(e) => setCreateForm({ ...createForm, odeme_yontemi_id: e.target.value })}
                >
                  <option value="">Seçin…</option>
                  {cekSenetYontemleri.map((y) => (
                    <option key={y.id} value={y.id}>{y.ad}</option>
                  ))}
                </select>
                <label>Tutar (₺) *</label>
                <input type="number" min="1" value={createForm.tutar} onChange={(e) => setCreateForm({ ...createForm, tutar: e.target.value })} />
                <label>Vade Tarihi *</label>
                <input type="date" value={createForm.vade_tarihi} onChange={(e) => setCreateForm({ ...createForm, vade_tarihi: e.target.value })} />
                <label>Çek/Senet No</label>
                <input value={createForm.cek_senet_no} onChange={(e) => setCreateForm({ ...createForm, cek_senet_no: e.target.value })} />
                <label>Banka</label>
                <input value={createForm.banka_adi} onChange={(e) => setCreateForm({ ...createForm, banka_adi: e.target.value })} />
                <label>Açıklama</label>
                <input value={createForm.aciklama} onChange={(e) => setCreateForm({ ...createForm, aciklama: e.target.value })} />
              </div>
              <div className="cs-actions">
                <button type="button" className="cs-btn cs-btn--secondary" onClick={() => setCreateOpen(false)}>İptal</button>
                <button type="button" className="cs-btn cs-btn--primary" disabled={createSaving} onClick={doCreateVerilen}>
                  {createSaving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
