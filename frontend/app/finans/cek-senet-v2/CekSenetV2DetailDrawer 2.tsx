"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import type { FinansToastType } from "@/components/finans/FinansToast";
import { cekSenetV2Service } from "../services/cek-senet-v2-api";
import {
  durumMeta,
  type CekSenetV2Dosya,
  type CekSenetV2Kayit,
} from "../types/cek-senet-v2-types";

type MaliHesap = { id: number; ad: string; tip?: string };
type Cari = { id: number; gorunen_ad: string };

interface Props {
  kayitId: number;
  maliHesaplar: MaliHesap[];
  cariHesaplar: Cari[];
  onClose: () => void;
  onChanged: () => void;
  notify: (msg: string, type: FinansToastType) => void;
}

type ActionKind = "tahsil" | "ode" | "ciro" | "protesto" | "iade" | "iptal" | "duzenle" | null;

type DetailForm = {
  mali_hesap_id: string;
  tarih: string;
  aciklama: string;
  ciro_cari_id: string;
  cek_senet_no: string;
  seri_no: string;
  banka_adi: string;
  sube_adi: string;
  hesap_no: string;
  keside_eden: string;
};

const EYLEM_ICON: Record<string, string> = {
  olusturuldu: "✨",
  durum_degisti: "🔄",
  guncellendi: "✏️",
  tahsil_edildi: "💰",
  odendi: "💳",
  ciro_edildi: "🟣",
  protesto_edildi: "🔴",
  iade_edildi: "🟠",
  iptal_edildi: "⚫",
  dosya_eklendi: "📎",
  dosya_silindi: "🗑️",
};

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return "📕";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "🖼️";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["doc", "docx"].includes(ext)) return "📘";
  if (["zip", "rar"].includes(ext)) return "🗜️";
  return "📄";
}

export default function CekSenetV2DetailDrawer({
  kayitId,
  maliHesaplar,
  cariHesaplar,
  onClose,
  onChanged,
  notify,
}: Props) {
  const [kayit, setKayit] = useState<CekSenetV2Kayit | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionKind>(null);
  const [busy, setBusy] = useState(false);
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<DetailForm>({
    mali_hesap_id: "",
    tarih: "",
    aciklama: "",
    ciro_cari_id: "",
    cek_senet_no: "",
    seri_no: "",
    banka_adi: "",
    sube_adi: "",
    hesap_no: "",
    keside_eden: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await cekSenetV2Service.detail(kayitId);
      setKayit(d);
      setForm((f) => ({
        ...f,
        cek_senet_no: d.cek_senet_no || "",
        seri_no: d.seri_no || "",
        banka_adi: d.banka_adi || "",
        sube_adi: d.sube_adi || "",
        hesap_no: d.hesap_no || "",
        keside_eden: d.keside_eden || "",
      }));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Detay yüklenemedi", "error");
    } finally {
      setLoading(false);
    }
  }, [kayitId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  const runAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      notify(okMsg, "success");
      setAction(null);
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "İşlem başarısız", "error");
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setBusy(true);
    try {
      for (const file of arr) {
        const fd = new FormData();
        fd.append("dosya", file);
        fd.append("dosya_adi", file.name);
        await cekSenetV2Service.dosyaYukle(kayitId, fd);
      }
      notify(`${arr.length} dosya yüklendi`, "success");
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Yükleme başarısız", "error");
    } finally {
      setBusy(false);
    }
  };

  const silDosya = async (d: CekSenetV2Dosya) => {
    if (!confirm(`"${d.dosya_adi}" silinsin mi?`)) return;
    try {
      await cekSenetV2Service.dosyaSil(kayitId, d.id);
      notify("Dosya silindi", "success");
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Silinemedi", "error");
    }
  };

  const meta = kayit ? durumMeta(kayit.durum) : null;
  const isAlinan = kayit?.yon === "alinan";
  const durum = kayit?.durum;

  const canTahsil = isAlinan && (durum === "portfoyde" || durum === "tahsilde" || durum === "protesto" || durum === "karsiliksiz");
  const canOde = kayit?.yon === "verilen" && durum === "verildi";
  const canCiro = isAlinan && (durum === "portfoyde");
  const canProtesto = durum === "portfoyde" || durum === "tahsilde";
  const canIade = ["portfoyde", "tahsilde", "verildi", "protesto", "karsiliksiz"].includes(durum || "");
  const canIptal = kayit?.aktif_mi;
  const canEdit = kayit?.aktif_mi;

  const transitions = kayit?.allowed_transitions || [];
  const hasPortfoyeAl = transitions.some((t) => t.durum === "portfoyde");
  const hasHazirla = transitions.some((t) => t.durum === "hazirlandi");
  const hasVerildi = transitions.some((t) => t.durum === "verildi");
  const hasTahsilde = transitions.some((t) => t.durum === "tahsilde");

  const doTransition = (hedef: string, okMsg: string) =>
    runAction(() => cekSenetV2Service.transition(kayitId, { durum: hedef }), okMsg);

  return (
    <div className="csv2-overlay" onClick={onClose}>
      <div className="csv2-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="csv2-drawer__head">
          <div className="csv2-drawer__head-main">
            <h2 className="csv2-drawer__title">
              {kayit ? `${kayit.arac_tipi_label} #${kayit.id}` : "Yükleniyor…"}
            </h2>
            {meta && (
              <span className="csv2-badge csv2-badge--lg" style={{ background: meta.bg, color: meta.renk }}>
                {meta.nokta} {kayit?.durum_label}
              </span>
            )}
            {kayit && (
              <span className="csv2-arac">{kayit.yon_label}</span>
            )}
            {kayit && kayit.gecikme_gun > 0 && (
              <span className="csv2-geciken">{kayit.gecikme_gun} gün gecikmiş</span>
            )}
          </div>
          <button type="button" className="csv2-close" onClick={onClose}>✕</button>
        </div>

        <div className="csv2-drawer__body">
          {loading || !kayit ? (
            <div className="csv2-empty">Yükleniyor…</div>
          ) : (
            <div className="csv2-detail">
              {/* SOL — Bilgiler */}
              <div className="csv2-detail__left">
                <div className="csv2-amount-hero">
                  <span className="csv2-amount-hero__val">{fmtTL(kayit.tutar)}</span>
                </div>

                <div className="csv2-section-title">Kimlik Bilgileri</div>
                <dl className="csv2-info-grid">
                  <dt>Cari</dt><dd>{kayit.cari_label || kayit.ogrenci_adi || "—"}</dd>
                  <dt>{isAlinan ? "Kimden Geldi" : "Kime Verildi"}</dt>
                  <dd>{kayit.keside_eden || kayit.cari_label || kayit.ogrenci_adi || "—"}</dd>
                  <dt>Sözleşme</dt><dd>{kayit.sozlesme_no || "—"}</dd>
                  <dt>Ödeme Yöntemi</dt><dd>{kayit.odeme_yontemi_adi || "—"}</dd>
                  <dt>Banka</dt><dd>{kayit.banka_adi || "—"}</dd>
                  <dt>Şube</dt><dd>{kayit.sube_adi || "—"}</dd>
                  <dt>Hesap No</dt><dd>{kayit.hesap_no || "—"}</dd>
                  <dt>Seri No</dt><dd>{kayit.seri_no || "—"}</dd>
                  <dt>Belge No</dt><dd>{kayit.cek_senet_no || "—"}</dd>
                  <dt>Keşide Tarihi</dt><dd>{fmtDate(kayit.keside_tarihi)}</dd>
                  <dt>Vade Tarihi</dt><dd>{fmtDate(kayit.vade_tarihi)}</dd>
                  {kayit.ciro_edilen_cari_label && (<><dt>Ciro Edilen</dt><dd>{kayit.ciro_edilen_cari_label}</dd></>)}
                  {kayit.durum_aciklamasi && (<><dt>Durum Notu</dt><dd>{kayit.durum_aciklamasi}</dd></>)}
                  {kayit.aciklama && (<><dt>Açıklama</dt><dd>{kayit.aciklama}</dd></>)}
                </dl>

                {/* Ek Dosyalar */}
                <div className="csv2-section-title">Ek Dosyalar</div>
                <div
                  className={`csv2-dropzone ${dragover ? "is-dragover" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
                  onDragLeave={() => setDragover(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragover(false);
                    if (e.dataTransfer.files) void uploadFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="csv2-dropzone__icon">📎</div>
                  Dosyaları buraya sürükleyin veya tıklayın
                  <div style={{ fontSize: 11, marginTop: 4 }}>PDF, görsel, Excel, Word, dekont…</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>
                {kayit.dosyalar && kayit.dosyalar.length > 0 && (
                  <ul className="csv2-file-list">
                    {kayit.dosyalar.map((d) => (
                      <li key={d.id} className="csv2-file">
                        <span className="csv2-file__icon">{fileIcon(d.dosya_adi)}</span>
                        <div className="csv2-file__main">
                          <div className="csv2-file__name">{d.dosya_adi}</div>
                          <div className="csv2-file__meta">{d.dosya_boyutu_fmt} · {d.dosya_turu_label}</div>
                        </div>
                        <div className="csv2-file__actions">
                          {d.dosya_url && (
                            <a className="csv2-btn csv2-btn--sm csv2-btn--ghost" href={d.dosya_url} target="_blank" rel="noreferrer">Aç</a>
                          )}
                          <button type="button" className="csv2-btn csv2-btn--sm csv2-btn--ghost" onClick={() => silDosya(d)}>🗑️</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Aksiyon kutusu */}
                {action && (
                  <ActionBox
                    action={action}
                    form={form}
                    setForm={setForm}
                    maliHesaplar={maliHesaplar}
                    cariHesaplar={cariHesaplar}
                    busy={busy}
                    onCancel={() => setAction(null)}
                    onSubmit={() => {
                      if (action === "tahsil") {
                        if (!form.mali_hesap_id) return notify("Banka/kasa seçin", "error");
                        return runAction(() => cekSenetV2Service.tahsil(kayitId, {
                          tahsilat_mali_hesap_id: Number(form.mali_hesap_id),
                          tahsilat_tarihi: form.tarih || undefined,
                          aciklama: form.aciklama,
                        }), "Tahsil edildi");
                      }
                      if (action === "ode") {
                        if (!form.mali_hesap_id) return notify("Banka/kasa seçin", "error");
                        return runAction(() => cekSenetV2Service.ode(kayitId, {
                          odeme_mali_hesap_id: Number(form.mali_hesap_id),
                          odeme_tarihi: form.tarih || undefined,
                          aciklama: form.aciklama,
                        }), "Ödendi");
                      }
                      if (action === "ciro") {
                        if (!form.ciro_cari_id) return notify("Ciro edilecek cari seçin", "error");
                        return runAction(() => cekSenetV2Service.ciro(kayitId, {
                          ciro_edilen_cari_id: Number(form.ciro_cari_id),
                          ciro_tarihi: form.tarih || undefined,
                          aciklama: form.aciklama,
                        }), "Ciro edildi");
                      }
                      if (action === "protesto") {
                        return runAction(() => cekSenetV2Service.protesto(kayitId, {
                          protesto_tarihi: form.tarih || undefined,
                          aciklama: form.aciklama,
                        }), "Protesto işlendi");
                      }
                      if (action === "iade") {
                        return runAction(() => cekSenetV2Service.iade(kayitId, {
                          iade_tarihi: form.tarih || undefined,
                          aciklama: form.aciklama,
                        }), "İade edildi");
                      }
                      if (action === "iptal") {
                        return runAction(() => cekSenetV2Service.iptal(kayitId, { aciklama: form.aciklama }), "İptal edildi");
                      }
                      if (action === "duzenle") {
                        return runAction(() => cekSenetV2Service.update(kayitId, {
                          cek_senet_no: form.cek_senet_no,
                          seri_no: form.seri_no,
                          banka_adi: form.banka_adi,
                          sube_adi: form.sube_adi,
                          hesap_no: form.hesap_no,
                          keside_eden: form.keside_eden,
                        }), "Bilgiler güncellendi");
                      }
                    }}
                  />
                )}
              </div>

              {/* SAĞ — Timeline */}
              <div className="csv2-detail__right">
                <div className="csv2-section-title">İşlem Geçmişi</div>
                {(!kayit.timeline || kayit.timeline.length === 0) ? (
                  <div className="csv2-muted" style={{ fontSize: 13 }}>Henüz işlem yok.</div>
                ) : (
                  <div className="csv2-timeline">
                    {kayit.timeline.map((log) => {
                      const m = log.yeni_durum ? durumMeta(log.yeni_durum) : null;
                      return (
                        <div key={log.id} className="csv2-tl-item">
                          <span className="csv2-tl-dot" style={m ? { background: m.renk } : undefined} />
                          <div className="csv2-tl-title">
                            {EYLEM_ICON[log.eylem] || "•"}{" "}
                            {log.yeni_durum_label
                              ? `${log.onceki_durum_label ? log.onceki_durum_label + " → " : ""}${log.yeni_durum_label}`
                              : log.eylem.replace(/_/g, " ")}
                          </div>
                          {log.aciklama && <div className="csv2-tl-desc">{log.aciklama}</div>}
                          <div className="csv2-tl-meta">
                            <span>{log.created_at ? new Date(log.created_at).toLocaleString("tr-TR") : ""}</span>
                            {log.kullanici_adi && <span>· {log.kullanici_adi}</span>}
                            {log.tutar != null && <span>· {fmtTL(log.tutar)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Aksiyon çubuğu */}
        {kayit && !loading && (
          <div className="csv2-actions-bar">
            {canTahsil && <button type="button" className="csv2-btn csv2-btn--success" onClick={() => setAction("tahsil")}>💰 Tahsil Et</button>}
            {canOde && <button type="button" className="csv2-btn csv2-btn--success" onClick={() => setAction("ode")}>💳 Ödendi İşaretle</button>}
            {hasPortfoyeAl && <button type="button" className="csv2-btn" disabled={busy} onClick={() => doTransition("portfoyde", "Portföye alındı")}>📥 Portföye Al</button>}
            {hasHazirla && <button type="button" className="csv2-btn" disabled={busy} onClick={() => doTransition("hazirlandi", "Hazırlandı")}>📝 Hazırla</button>}
            {hasVerildi && <button type="button" className="csv2-btn" disabled={busy} onClick={() => doTransition("verildi", "Verildi")}>📤 Verildi</button>}
            {hasTahsilde && <button type="button" className="csv2-btn" disabled={busy} onClick={() => doTransition("tahsilde", "Tahsile gönderildi")}>🏦 Tahsile Gönder</button>}
            {canCiro && <button type="button" className="csv2-btn" style={{ borderColor: "#7c3aed", color: "#7c3aed" }} onClick={() => setAction("ciro")}>🟣 Ciro Et</button>}
            {canProtesto && <button type="button" className="csv2-btn csv2-btn--danger" onClick={() => setAction("protesto")}>🔴 Protesto</button>}
            {canIade && <button type="button" className="csv2-btn csv2-btn--warning" onClick={() => setAction("iade")}>🟠 İade</button>}
            {canEdit && <button type="button" className="csv2-btn" onClick={() => setAction("duzenle")}>✏️ Düzenle</button>}
            {canIptal && <button type="button" className="csv2-btn csv2-btn--ghost" onClick={() => setAction("iptal")}>⚫ İptal</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBox({
  action,
  form,
  setForm,
  maliHesaplar,
  cariHesaplar,
  busy,
  onCancel,
  onSubmit,
}: {
  action: Exclude<ActionKind, null>;
  form: DetailForm;
  setForm: React.Dispatch<React.SetStateAction<DetailForm>>;
  maliHesaplar: MaliHesap[];
  cariHesaplar: Cari[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const titles: Record<string, string> = {
    tahsil: "Tahsil Et",
    ode: "Ödendi İşaretle",
    ciro: "Ciro Et",
    protesto: "Protesto Kaydı",
    iade: "İade Kaydı",
    iptal: "İptal Et",
    duzenle: "Bilgileri Düzenle",
  };
  const set = (k: keyof DetailForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="csv2-action-box">
      <h4>{titles[action]}</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(action === "tahsil" || action === "ode") && (
          <div className="csv2-field">
            <label>Banka / Kasa Hesabı *</label>
            <select value={form.mali_hesap_id} onChange={(e) => set("mali_hesap_id", e.target.value)}>
              <option value="">Seçin…</option>
              {maliHesaplar.map((h) => <option key={h.id} value={h.id}>{h.ad}</option>)}
            </select>
          </div>
        )}
        {action === "ciro" && (
          <div className="csv2-field">
            <label>Ciro Edilecek Cari *</label>
            <select value={form.ciro_cari_id} onChange={(e) => set("ciro_cari_id", e.target.value)}>
              <option value="">Seçin…</option>
              {cariHesaplar.map((c) => <option key={c.id} value={c.id}>{c.gorunen_ad}</option>)}
            </select>
          </div>
        )}
        {action === "duzenle" ? (
          <div className="csv2-formgrid">
            <div className="csv2-field"><label>Belge No</label><input value={form.cek_senet_no} onChange={(e) => set("cek_senet_no", e.target.value)} /></div>
            <div className="csv2-field"><label>Seri No</label><input value={form.seri_no} onChange={(e) => set("seri_no", e.target.value)} /></div>
            <div className="csv2-field"><label>Banka</label><input value={form.banka_adi} onChange={(e) => set("banka_adi", e.target.value)} /></div>
            <div className="csv2-field"><label>Şube</label><input value={form.sube_adi} onChange={(e) => set("sube_adi", e.target.value)} /></div>
            <div className="csv2-field"><label>Hesap No</label><input value={form.hesap_no} onChange={(e) => set("hesap_no", e.target.value)} /></div>
            <div className="csv2-field"><label>Keşide Eden</label><input value={form.keside_eden} onChange={(e) => set("keside_eden", e.target.value)} /></div>
          </div>
        ) : (
          action !== "iptal" && (
            <div className="csv2-field">
              <label>{action === "ciro" ? "Ciro" : action === "protesto" ? "Protesto" : action === "iade" ? "İade" : "İşlem"} Tarihi</label>
              <input type="date" value={form.tarih} onChange={(e) => set("tarih", e.target.value)} />
            </div>
          )
        )}
        {action !== "duzenle" && (
          <div className="csv2-field">
            <label>Açıklama</label>
            <input value={form.aciklama} onChange={(e) => set("aciklama", e.target.value)} placeholder="Opsiyonel not" />
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="csv2-btn csv2-btn--primary" disabled={busy} onClick={onSubmit}>
            {busy ? "İşleniyor…" : "Onayla"}
          </button>
          <button type="button" className="csv2-btn" onClick={onCancel}>Vazgeç</button>
        </div>
      </div>
    </div>
  );
}
