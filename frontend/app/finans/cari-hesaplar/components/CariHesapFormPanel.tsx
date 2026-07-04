"use client";
import React, { useState, useEffect, useRef } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { cariHesapService } from "../../services/cari-hesap-api";
import { giderKategoriService } from "../../services/gider-api";
import { gelirKategoriService } from "../../services/gelir-api";
import { CariHesap, HESAP_TURLERI } from "../../types/cari-hesap-types";
import type { GiderKategorisiTreeItem } from "../../types/gider-kategori-types";
import type { GelirKategorisiTreeItem } from "../../types/gelir-kategori-types";

/* ═══════════════════════════════════════════
   Style atoms
═══════════════════════════════════════════ */
const inp =
  "w-full px-3.5 py-3 bg-white border-2 border-gray-200/80 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 outline-none transition-all duration-200 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 hover:border-gray-300";
const sel =
  "w-full px-3.5 py-3 bg-white border-2 border-gray-200/80 rounded-xl text-[14px] text-gray-900 outline-none transition-all duration-200 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 hover:border-gray-300 appearance-none cursor-pointer";

/* ═══════════════════════════════════════════
   SVG atoms
═══════════════════════════════════════════ */
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const Spin = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const ChevDown = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
  </svg>
);
const ChkIco = () => (
  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

/* Step type for form wizard */
type FormStep = "firma" | "iletisim" | "banka" | "kategoriler";

const FORM_STEPS: { key: FormStep; label: string; icon: string }[] = [
  { key: "firma", label: "Firma", icon: "building" },
  { key: "iletisim", label: "İletişim", icon: "phone" },
  { key: "banka", label: "Banka", icon: "card" },
  { key: "kategoriler", label: "Kategoriler", icon: "tag" },
];

function getStepIcon(icon: string, size = 20) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" };
  switch (icon) {
    case "building":
      return <svg {...props}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
    case "phone":
      return <svg {...props}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>;
    case "card":
      return <svg {...props}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>;
    case "tag":
      return <svg {...props}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════
   Helper: FL (Form Label)
═══════════════════════════════════════════ */
function FL({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1">
        <span className="text-[13px] font-medium text-slate-600">{label}</span>
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CariKategoriPicker — İnteraktif tree seçici (gider/gelir)
═══════════════════════════════════════════════════════════ */
type KategoriTreeItem = GiderKategorisiTreeItem | GelirKategorisiTreeItem;

function CariKategoriPicker({ kurumId, subeId, selectedIds, onChange, fetchTree }: {
  kurumId: number;
  subeId?: number;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  fetchTree: (kurumId: number, subeId: number) => Promise<{ kategoriler?: KategoriTreeItem[] }>;
}) {
  const [tree, setTree] = useState<KategoriTreeItem[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!subeId) {
      setTree([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchTree(kurumId, subeId)
      .then((res) => {
        setTree(res.kategoriler || []);
        setExpanded(new Set((res.kategoriler || []).map((k: KategoriTreeItem) => k.id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kurumId, subeId, fetchTree]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  const toggleExp = (id: number) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const q = search.toLowerCase();
  const filtered = tree
    .map((ana) => ({
      ...ana,
      alt_kategoriler: ana.alt_kategoriler.filter((alt) => !q || alt.ad.toLowerCase().includes(q)),
    }))
    .filter((ana) => !q || ana.ad.toLowerCase().includes(q) || ana.alt_kategoriler.length > 0);

  const allItems: { id: number; label: string }[] = [];
  tree.forEach((ana) => {
    allItems.push({ id: ana.id, label: ana.ad });
    ana.alt_kategoriler.forEach((alt) => allItems.push({ id: alt.id, label: `${ana.ad} › ${alt.ad}` }));
  });
  const selLabels = selectedIds
    .map((id) => allItems.find((x) => x.id === id)?.label)
    .filter(Boolean) as string[];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-[13px] transition-all duration-200 hover:border-gray-300 ${
          open ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/20" : "border-gray-200"
        }`}
      >
        <span className="flex-1 text-left truncate">
          {selLabels.length === 0 ? (
            <span className="text-gray-400">Kategori seçin (opsiyonel)</span>
          ) : (
            <span className="text-gray-700 font-semibold">{selLabels.length} kategori seçili</span>
          )}
        </span>
        <span className={`transition-transform duration-200 text-gray-400 ${open ? "rotate-180" : ""}`}>
          <ChevDown />
        </span>
      </button>

      {selLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selLabels.map((lbl, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-semibold">
              {lbl}
              <button
                type="button"
                onClick={() => toggle(selectedIds[i])}
                className="hover:text-indigo-900 transition-colors ml-0.5"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Temizle
          </button>
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-gray-200 rounded-2xl shadow-2xl shadow-gray-900/10 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kategori ara..."
                className="w-full pl-8 pr-3 py-2 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20"
              />
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-400 text-[12px] gap-2">
                <Spin /><span>Yükleniyor...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-6 text-[12px] text-gray-400">
                {search ? "Sonuç bulunamadı" : "Kategori tanımlanmamış"}
              </div>
            ) : (
              filtered.map((ana) => (
                <div key={ana.id} className="mb-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group">
                    <button
                      type="button"
                      onClick={() => toggleExp(ana.id)}
                      className="w-4 h-4 flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform duration-150 ${expanded.has(ana.id) ? "rotate-90" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(ana.id)}
                      className={`w-4 h-4 rounded flex-shrink-0 border transition-all duration-150 flex items-center justify-center ${
                        selectedIds.includes(ana.id)
                          ? "bg-indigo-500 border-indigo-500 text-white"
                          : "border-gray-300 hover:border-indigo-400"
                      }`}
                    >
                      {selectedIds.includes(ana.id) && <ChkIco />}
                    </button>
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-[11px] flex-shrink-0"
                      style={{ background: ana.renk ? `${ana.renk}22` : "#f1f5f9" }}
                    >
                      {ana.ikon || "📂"}
                    </div>
                    <span
                      className="flex-1 text-[12px] font-semibold text-gray-700 cursor-pointer"
                      onClick={() => toggle(ana.id)}
                    >
                      {ana.ad}
                    </span>
                    <span className="text-[10px] text-gray-300 font-medium">{ana.alt_kategoriler.length} alt</span>
                  </div>
                  {expanded.has(ana.id) && ana.alt_kategoriler.length > 0 && (
                    <div className="ml-6 space-y-0.5">
                      {ana.alt_kategoriler
                        .filter((alt) => !q || alt.ad.toLowerCase().includes(q))
                        .map((alt) => (
                          <div
                            key={alt.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggle(alt.id)}
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: ana.renk || "#94a3b8" }}
                            />
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggle(alt.id); }}
                              className={`w-4 h-4 rounded flex-shrink-0 border transition-all duration-150 flex items-center justify-center ${
                                selectedIds.includes(alt.id)
                                  ? "bg-indigo-500 border-indigo-500 text-white"
                                  : "border-gray-300 hover:border-indigo-400"
                              }`}
                            >
                              {selectedIds.includes(alt.id) && <ChkIco />}
                            </button>
                            <span className="text-[12px] text-gray-600">{alt.ad}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-2.5 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <span className="text-[11px] text-gray-400">
              {selectedIds.length > 0 ? `${selectedIds.length} seçili` : "Hiç seçilmedi"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Tamam →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CariHesapFormPanel
═══════════════════════════════════════════════════════════ */
export default function CariHesapFormPanel({
  kurumId, editData, isEdit, onClose, onSuccess, onError,
}: {
  kurumId: number;
  editData: CariHesap | null;
  isEdit: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { activeSube } = useKurum();
  const [form, setForm] = useState({
    unvan: editData?.unvan || "",
    kisa_ad: editData?.kisa_ad || "",
    hesap_turu: editData?.hesap_turu || "tedarikci",
    hesap_kodu: editData?.hesap_kodu || "",
    vergi_no: editData?.vergi_no || "",
    vergi_dairesi: editData?.vergi_dairesi || "",
    telefon: editData?.telefon || "",
    email: editData?.email || "",
    adres: editData?.adres || "",
    il: editData?.il || "",
    ilce: editData?.ilce || "",
    yetkili_kisi: editData?.yetkili_kisi || "",
    yetkili_telefon: editData?.yetkili_telefon || "",
    iban: editData?.iban || "",
    banka_adi: editData?.banka_adi || "",
    hesap_sahibi: editData?.hesap_sahibi || "",
    notlar: editData?.notlar || "",
  });
  const [giderKategoriIds, setGiderKategoriIds] = useState<number[]>(
    editData?.gider_kategorileri?.map((k) => k.id) || []
  );
  const [gelirKategoriIds, setGelirKategoriIds] = useState<number[]>(
    editData?.gelir_kategorileri?.map((k) => k.id) || []
  );
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState<FormStep>("firma");
  const [formError, setFormError] = useState("");

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.unvan.trim()) { setFormError("Ünvan zorunludur."); setActiveStep("firma"); return; }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        gider_kategorileri: giderKategoriIds,
        gelir_kategorileri: gelirKategoriIds,
      };
      if (isEdit && editData) {
        await cariHesapService.update(editData.id, payload);
        onSuccess("Cari hesap güncellendi.");
      } else {
        await cariHesapService.create({ ...payload, kurum_id: kurumId });
        onSuccess("Cari hesap oluşturuldu.");
      }
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLastStep) handleSave();
  };

  const goToStep = (step: FormStep) => setActiveStep(step);

  const goNextStep = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentStepIndex >= FORM_STEPS.length - 1) return;
    const nextStep = FORM_STEPS[currentStepIndex + 1].key;
    // İleri → son adımda Kaydet butonu aynı konuma gelince tıklama submit tetiklemesin
    window.setTimeout(() => goToStep(nextStep), 0);
  };

  const goPrevStep = () => {
    if (currentStepIndex > 0) goToStep(FORM_STEPS[currentStepIndex - 1].key);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA") return;
    e.preventDefault();
  };

  const currentStepIndex = FORM_STEPS.findIndex((s) => s.key === activeStep);
  const isLastStep = currentStepIndex === FORM_STEPS.length - 1;
  const isFirstStep = currentStepIndex === 0;

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex flex-col h-full bg-slate-50" noValidate>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-5 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] flex items-center justify-center shadow-lg shadow-[var(--primary)]/25">
            {isEdit ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? "Cari Hesap Düzenle" : "Yeni Cari Hesap"}
            </h2>
            <p className="text-[13px] text-gray-500">
              {isEdit ? editData?.gorunen_ad : "Hesap bilgilerini girin"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-all"
        >
          <XIcon />
        </button>
      </div>

      {/* ── Step Navigation ── */}
      <div className="flex gap-2 px-6 py-4 bg-white border-b border-gray-200">
        {FORM_STEPS.map((step, index) => (
          <button
            key={step.key}
            type="button"
            onClick={() => goToStep(step.key)}
            className={`flex-1 relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all duration-200 ${
              activeStep === step.key
                ? "bg-[var(--primary)]/[0.06] border-[var(--primary)]"
                : "bg-gray-50 border-transparent hover:bg-gray-100"
            }`}
          >
            <span className={`absolute top-2 right-2 w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center transition-all ${
              activeStep === step.key
                ? "bg-[var(--primary)] text-white"
                : "bg-gray-200 text-gray-500"
            }`}>
              {index + 1}
            </span>
            <span className={`transition-colors ${
              activeStep === step.key ? "text-[var(--primary)]" : "text-gray-400"
            }`}>
              {getStepIcon(step.icon, 20)}
            </span>
            <span className={`text-[12px] font-medium transition-colors ${
              activeStep === step.key ? "text-[var(--primary)]" : "text-gray-500"
            }`}>
              {step.label}
            </span>
            {step.key === "kategoriler" && giderKategoriIds.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                {giderKategoriIds.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Error Alert ── */}
      {formError && (
        <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-[13px]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {formError}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Step: Firma */}
        {activeStep === "firma" && (
          <div className="animate-in fade-in duration-300 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <FL label="Ünvan" required>
                  <input
                    type="text"
                    value={form.unvan}
                    onChange={(e) => set("unvan", e.target.value)}
                    placeholder="Firma / kişi adını yazın"
                    className={inp}
                    autoFocus
                  />
                </FL>
              </div>
              <FL label="Kısa Ad">
                <input type="text" value={form.kisa_ad} onChange={(e) => set("kisa_ad", e.target.value)} placeholder="Kısaltma" className={inp} />
              </FL>
              <FL label="Hesap Türü" required>
                <div className="relative">
                  <select value={form.hesap_turu} onChange={(e) => set("hesap_turu", e.target.value)} className={sel}>
                    {HESAP_TURLERI.map((k) => (
                      <option key={k.value} value={k.value}>{k.icon} {k.label}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><ChevDown /></span>
                </div>
              </FL>
              <FL label="Hesap Kodu" hint="Otomatik oluşturulabilir">
                <input type="text" value={form.hesap_kodu} onChange={(e) => set("hesap_kodu", e.target.value)} placeholder="CH-001" className={`${inp} font-mono`} />
              </FL>
              <FL label="Vergi No / TC">
                <input type="text" maxLength={11} value={form.vergi_no} onChange={(e) => set("vergi_no", e.target.value)} placeholder="12345678901" className={`${inp} font-mono`} />
              </FL>
              <div className="col-span-2">
                <FL label="Vergi Dairesi">
                  <input type="text" value={form.vergi_dairesi} onChange={(e) => set("vergi_dairesi", e.target.value)} placeholder="Vergi dairesi" className={inp} />
                </FL>
              </div>
              <div className="col-span-2">
                <FL label="Notlar">
                  <textarea rows={3} value={form.notlar} onChange={(e) => set("notlar", e.target.value)} placeholder="Ek bilgi notu..." className={`${inp} resize-none`} />
                </FL>
              </div>
            </div>
          </div>
        )}

        {/* Step: İletişim */}
        {activeStep === "iletisim" && (
          <div className="animate-in fade-in duration-300 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FL label="Telefon">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <input type="tel" value={form.telefon} onChange={(e) => set("telefon", e.target.value)} placeholder="0(5XX) XXX XX XX" className={`${inp} pl-10`} />
                </div>
              </FL>
              <FL label="E-posta">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="info@firma.com" className={`${inp} pl-10`} />
                </div>
              </FL>
              <FL label="Yetkili Kişi">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  <input type="text" value={form.yetkili_kisi} onChange={(e) => set("yetkili_kisi", e.target.value)} placeholder="Yetkili kişi adı" className={`${inp} pl-10`} />
                </div>
              </FL>
              <FL label="Yetkili Telefon">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <input type="tel" value={form.yetkili_telefon} onChange={(e) => set("yetkili_telefon", e.target.value)} placeholder="Yetkili telefonu" className={`${inp} pl-10`} />
                </div>
              </FL>
              <FL label="İl">
                <input type="text" value={form.il} onChange={(e) => set("il", e.target.value)} placeholder="İl" className={inp} />
              </FL>
              <FL label="İlçe">
                <input type="text" value={form.ilce} onChange={(e) => set("ilce", e.target.value)} placeholder="İlçe" className={inp} />
              </FL>
              <div className="col-span-2">
                <FL label="Adres">
                  <textarea rows={3} value={form.adres} onChange={(e) => set("adres", e.target.value)} placeholder="Açık adres" className={`${inp} resize-none`} />
                </FL>
              </div>
            </div>
          </div>
        )}

        {/* Step: Banka */}
        {activeStep === "banka" && (
          <div className="animate-in fade-in duration-300 space-y-5">
            <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-100 rounded-2xl mb-2">
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4.5 h-4.5 text-violet-600" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-violet-700">Banka Bilgileri</p>
                <p className="text-[12px] text-violet-600/80 mt-0.5">Ödeme işlemleri için banka hesap bilgilerini girin</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <FL label="IBAN" hint="TR ile başlayan 26 karakter">
                <input
                  type="text"
                  maxLength={34}
                  value={form.iban}
                  onChange={(e) => set("iban", e.target.value)}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  className={`${inp} font-mono tracking-wider`}
                />
              </FL>
              <div className="grid grid-cols-2 gap-4">
                <FL label="Banka Adı">
                  <input type="text" value={form.banka_adi} onChange={(e) => set("banka_adi", e.target.value)} placeholder="Banka adı" className={inp} />
                </FL>
                <FL label="Hesap Sahibi">
                  <input type="text" value={form.hesap_sahibi} onChange={(e) => set("hesap_sahibi", e.target.value)} placeholder="Hesap sahibi" className={inp} />
                </FL>
              </div>
            </div>
          </div>
        )}

        {/* Step: Kategoriler */}
        {activeStep === "kategoriler" && (
          <div className="animate-in fade-in duration-300 space-y-5">
            <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4.5 h-4.5 text-indigo-600" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-indigo-700">Akıllı Kategori Eşleştirme</p>
                <p className="text-[12px] text-indigo-600/80 mt-0.5 leading-relaxed">
                  Bu cari hesabın hangi gider ve gelir kategorilerinde işlem yaptığını işaretleyin.
                  Kayıt oluştururken ilgili kategoriler otomatik önerilir.
                </p>
              </div>
            </div>
            <FL label="İlişkili Gider Kategorileri" hint="Birden fazla seçebilirsiniz — ana veya alt kategori">
              <CariKategoriPicker
                kurumId={kurumId}
                subeId={activeSube?.id}
                selectedIds={giderKategoriIds}
                onChange={setGiderKategoriIds}
                fetchTree={giderKategoriService.tree}
              />
            </FL>
            {giderKategoriIds.length > 0 && (
              <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[13px] text-emerald-700 font-medium">
                  {giderKategoriIds.length} gider kategorisi seçildi
                </p>
              </div>
            )}
            <FL label="İlişkili Gelir Kategorileri" hint="Birden fazla seçebilirsiniz — ana veya alt kategori">
              <CariKategoriPicker
                kurumId={kurumId}
                subeId={activeSube?.id}
                selectedIds={gelirKategoriIds}
                onChange={setGelirKategoriIds}
                fetchTree={gelirKategoriService.tree}
              />
            </FL>
            {gelirKategoriIds.length > 0 && (
              <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[13px] text-emerald-700 font-medium">
                  {gelirKategoriIds.length} gelir kategorisi seçildi
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer with navigation ── */}
      <div className="gv-drawer-footer" style={{ justifyContent: "space-between" }}>
        <button type="button" onClick={onClose} disabled={saving} className="gv-btn gv-btn-secondary">
          İptal
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!isFirstStep && (
            <button type="button" onClick={goPrevStep} disabled={saving} className="gv-btn gv-btn-secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Geri
            </button>
          )}
          {!isLastStep ? (
            <button
              type="button"
              onClick={goNextStep}
              disabled={saving}
              className="gv-btn gv-btn-primary"
              style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)" }}
            >
              İleri
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="gv-btn gv-btn-primary"
              style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)" }}
            >
              {saving ? (
                <><Spin /> Kaydediliyor...</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                  </svg>
                  {isEdit ? "Güncelle" : "Kaydet"}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
