"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import { formatUserDisplayName } from "@/lib/format-user";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { FinansHttpError } from "../services/finans-http";
import "@/components/finans/finans-drawer.css";
import { formatOdemeYontemiLabel } from "@/components/finans/odeme-yontemi-label";
import FinansCekVadeBanner from "@/components/finans/FinansCekVadeBanner";
import { FAmountHero, FField, FInput, FReviewRow, FSection, FSelect, FSummaryCard, FTextarea } from "@/components/finans/FinansFields";
import FinansWizardDrawer, { type FinansWizardStep } from "@/components/finans/FinansWizardDrawer";
import { GiderTaksitCards, GiderPlannedTaksitCards, GiderOdemeCards } from "@/components/finans/GiderTaksitCards";
import { giderKaydiService, giderOdemeService } from "../services/gider-kaydi-api";
import { cariHesapService } from "../services/cari-hesap-api";
import { paymentMethodService, financialAccountService } from "../services/finans-api";
import { giderKategoriService } from "../services/gider-api";
import {
  GiderKaydiListItem, GiderKaydiDetail, GiderKaydiCreatePayload,
  GiderTaksit, GiderOdeme, GiderOdemeCreatePayload, GiderOzet,
  GIDER_DURUMLARI, KDV_ORANLARI, TaksitPlaniItem,
} from "../types/gider-types";
import { CariHesapDropdownItem, cariTabGorunur, HESAP_TURLERI } from "../types/cari-hesap-types";
import IslemMasrafiFields from "@/components/finans/IslemMasrafiFields";
import GiderKayitTable from "@/components/finans/GiderKayitTable";
import { isCekSenetTip } from "@/lib/finans/paymentMethodUtils";
import { EMPTY_ISLEM_MASRAFI, buildIslemMasrafiPayload, type IslemMasrafiFormState } from "../types/islem-masrafi-types";
import { islemMasrafiGoster } from "../utils/islem-masrafi-eligibility";

/* ═══════════════════════════════════════════════════════════════
   Gider Yönetimi — Kayıt Listesi + CRUD + Onay Workflow
   ═══════════════════════════════════════════════════════════════ */

interface GiderlerClientProps {
  /** true ise başlık, özet kartları gizlenir — tab içinde kullanım */
  embedded?: boolean;
  /** Cari hesap hücresine tıklanınca çağrılır */
  onCariHesapClick?: (cariHesapId: number) => void;
  /** Veri değişince çağrılır (parent'ın özeti güncellemesi için) */
  onDataChange?: () => void;
}

export default function GiderlerClient({ embedded, onCariHesapClick, onDataChange }: GiderlerClientProps = {}) {
  const { homeHref, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube } = useKurum();
  const kurumId = activeKurum?.id;

  // Listeleme
  const [giderler, setGiderler] = useState<GiderKaydiListItem[]>([]);
  const [ozet, setOzet] = useState<GiderOzet | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [durumFiltre, setDurumFiltre] = useState("");
  const [aramaFiltre, setAramaFiltre] = useState("");

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState<GiderKaydiDetail | null>(null);

  // Mesajlar
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ─── Fetch ──────────────────────────────────────
  const fetchList = useCallback(async () => {
    if (!kurumId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { kurum_id: String(kurumId) };
      if (activeSube?.id) params.sube_id = String(activeSube.id);
      if (durumFiltre) params.durum = durumFiltre;
      if (aramaFiltre) params.arama = aramaFiltre;
      const ozetParams: Record<string, string> = { kurum_id: String(kurumId) };
      if (activeSube?.id) ozetParams.sube_id = String(activeSube.id);
      const giderData = await giderKaydiService.list(params);
      setGiderler(giderData);
      if (!embedded) {
        const ozetData = await giderKaydiService.ozet(ozetParams);
        setOzet(ozetData);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kurumId, activeSube, durumFiltre, aramaFiltre, embedded]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => { setSuccess(""); setError(""); }, 4000);
      return () => clearTimeout(t);
    }
  }, [success, error]);

  // ─── Durum Workflow ─────────────────────────────
  const handleIptal = async (id: number) => {
    if (!confirm("Bu gider kaydı iptal edilsin mi? Bu işlem geri alınamaz.")) return;
    try {
      const res = await giderKaydiService.iptal(id);
      setSuccess(res.detail);
      fetchList();
      onDataChange?.();
    } catch (e: any) { setError(e.message); }
  };

  const handleSil = async (id: number) => {
    if (!confirm("Bu gider kaydı silinsin mi?")) return;
    try {
      await giderKaydiService.delete(id);
      setSuccess("Gider kaydı silindi.");
      fetchList();
      onDataChange?.();
    } catch (e: any) { setError(e.message); }
  };

  const handleDetail = async (id: number) => {
    try {
      const data = await giderKaydiService.get(id);
      setDetailItem(data);
    } catch (e: any) { setError(e.message); }
  };

  if (!kurumId) {
    return <div className="text-center py-12 text-gray-500">Lütfen bir kurum seçin.</div>;
  }

  return (
    <div className={embedded ? "" : "space-y-5"}>
      {/* Başlık — embedded modda card-modern-header olarak göster */}
      {embedded ? (
        <div className="card-modern-header">
          <h3>Gider Kayıtları</h3>
          <div className="card-modern-header-actions">
            <button
              onClick={() => setShowForm(true)}
              className="btn-hero"
            >
              <span className="btn-hero-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>Yeni Gider</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Gider Kayıtları</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Gider Kayıtları</span>
              </div>
            </div>
          </div>
          <div className="hero-actions">
            <button onClick={() => setShowForm(true)} className="btn-hero">
              <span className="btn-hero-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>Yeni Gider</span>
            </button>
          </div>
        </div>
      )}

      {/* Bildirimler */}
      {kurumId ? <FinansCekVadeBanner kurumId={kurumId} /> : null}
      {error && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-[13px]">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl text-[13px]">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          {success}
        </div>
      )}

      {/* Quick Stats — embedded modda gizle (parent gösterir) */}
      {!embedded && ozet && (
        <div className="quick-stats">
          <div className="quick-stat">
            <div className="quick-stat-icon red">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{Number(ozet.toplam_gider).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</h4>
              <span>Toplam Gider</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{Number(ozet.toplam_odenen).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</h4>
              <span>Toplam Ödenen</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon orange">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.bekleyen_sayi}</h4>
              <span>Bekleyen</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className={`quick-stat-icon ${ozet.geciken_taksit_sayi > 0 ? "red" : "green"}`}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.geciken_taksit_sayi}</h4>
              <span>Geciken Taksit</span>
            </div>
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div className={`flex flex-wrap gap-3 ${embedded ? "px-5 pt-4" : ""}`}>
        <div className="relative flex-1 min-w-[240px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cari, açıklama, fatura no veya kategori ile ara..."
            value={aramaFiltre}
            onChange={(e) => setAramaFiltre(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-[13px] focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 outline-none bg-white transition-all"
          />
        </div>
        <div className="relative">
          <select
            value={durumFiltre}
            onChange={(e) => setDurumFiltre(e.target.value)}
            className="pl-4 pr-9 py-2.5 border border-gray-200 rounded-xl text-[13px] focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 outline-none bg-white appearance-none cursor-pointer transition-all"
          >
            <option value="">Tüm Durumlar</option>
            {GIDER_DURUMLARI.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Tablo */}
      <div className={`${embedded ? "" : "card-modern"}`}>
        <div className="card-modern-body">
          {loading ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <h4>Yükleniyor...</h4>
            </div>
          ) : giderler.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h4>Gider kaydı bulunamadı</h4>
              <p>Yeni bir gider kaydı oluşturarak başlayın.</p>
            </div>
          ) : (
            <GiderKayitTable
              items={giderler}
              onCariHesapClick={onCariHesapClick}
              onDetail={handleDetail}
              onIptal={handleIptal}
              onSil={handleSil}
            />
          )}
        </div>
      </div>

      {showForm && (
        <GiderFormModal
          kurumId={kurumId}
          subeId={activeSube?.id}
          onClose={() => setShowForm(false)}
          onSuccess={(msg) => { setSuccess(msg); setShowForm(false); fetchList(); onDataChange?.(); }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Detay — Slide-over */}
      {detailItem && (
        <>
          <div className="fd-overlay" onClick={() => setDetailItem(null)} aria-hidden />
          <div className="fd-panel fd-panel--wide fd-panel--gider" role="dialog" aria-modal="true">
            <GiderDetailModal
              data={detailItem}
              kurumId={kurumId}
              onClose={() => setDetailItem(null)}
              onAction={(msg) => { setSuccess(msg); setDetailItem(null); fetchList(); onDataChange?.(); }}
              onError={(msg) => setError(msg)}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ═══ Shared UI — gider detay için ══════════════════════════════

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <FField label={label} required={required} error={error}>
      {children}
    </FField>
  );
}

const inputCls = "fd-input";
const selectCls = "fd-select";

// ═══ Gider Wizard — adım ikonları ══════════════════════════════
const IconTaraf = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconTutar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path strokeLinecap="round" d="M6 10v.01M18 14v.01" />
  </svg>
);
const IconTaksit = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
const IconOdeme = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2 10h20" />
  </svg>
);
const IconOzet = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);
const IconGider = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12l7 7 7-7" />
  </svg>
);

// ═══ Gider Form Modal ══════════════════════════════════════════
export function GiderFormModal({
  kurumId,
  subeId,
  defaultCariHesapId,
  lockedCariHesap,
  presetGiderKategorileri,
  onClose,
  onSuccess,
  onError,
}: {
  kurumId: number;
  subeId?: number;
  defaultCariHesapId?: number;
  /** Cari detay sayfasından açıldığında cari sabitlenir */
  lockedCariHesap?: {
    id: number;
    gorunen_ad: string;
    hesap_turu?: CariHesapDropdownItem["hesap_turu"];
    gider_kategorileri: number[];
  };
  /** locked modda kategori seçenekleri (hesap.gider_kategorileri) */
  presetGiderKategorileri?: { id: number; ad: string }[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { activeSube } = useKurum();
  const { user } = useAuth();
  const islemYapanAdi = formatUserDisplayName(user);
  const effectiveSubeId = subeId ?? activeSube?.id;
  const isCariLocked = Boolean(lockedCariHesap);

  const [form, setForm] = useState<GiderKaydiCreatePayload>({
    kurum_id: kurumId,
    cari_hesap_id: defaultCariHesapId || lockedCariHesap?.id || 0,
    gider_kategorisi_id: lockedCariHesap?.gider_kategorileri?.[0] ?? 0,
    sube_id: effectiveSubeId || null,
    mali_hesap_id: null,
    odeme_yontemi_id: null,
    fatura_no: "",
    fatura_tarihi: new Date().toISOString().slice(0, 10),
    vade_tarihi: "",
    aciklama: "",
    brut_tutar: 0,
    kdv_orani: 20,
    taksit_sayisi: 1,
    tekrar_mi: false,
    tekrar_sikligi: "aylik",
  });

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [taksitPlani, setTaksitPlani] = useState<TaksitPlaniItem[]>([]);
  const [taksitPlaniManual, setTaksitPlaniManual] = useState(false);

  const [odemeSimdi, setOdemeSimdi] = useState(false);
  const [masrafForm, setMasrafForm] = useState({ ...EMPTY_ISLEM_MASRAFI });

  // Dropdown verileri
  const [cariHesaplar, setCariHesaplar] = useState<CariHesapDropdownItem[]>([]);
  const [kategoriTree, setKategoriTree] = useState<any[]>([]);
  const [odemeYontemleri, setOdemeYontemleri] = useState<{ id: number; ad: string; mali_hesap_id?: number | null; tip?: string }[]>([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip?: string }[]>([]);
  const filtreliOdemeYontemleri = form.mali_hesap_id
    ? odemeYontemleri.filter(o => o.mali_hesap_id === form.mali_hesap_id)
    : [];
  const cekSenetPlanYontemVar = odemeYontemleri.some((o) => isCekSenetTip(o.tip));

  // Flat kategori listesi (tree → flat)
  const [flatKategoriler, setFlatKategoriler] = useState<{ id: number; label: string }[]>([]);

  useEffect(() => {
    if (!lockedCariHesap) return;
    setCariHesaplar([
      {
        id: lockedCariHesap.id,
        unvan: lockedCariHesap.gorunen_ad,
        kisa_ad: "",
        gorunen_ad: lockedCariHesap.gorunen_ad,
        hesap_turu: lockedCariHesap.hesap_turu ?? "tedarikci",
        gider_kategorileri: lockedCariHesap.gider_kategorileri,
        gelir_kategorileri: [],
      },
    ]);
    setForm((f) => ({
      ...f,
      cari_hesap_id: lockedCariHesap.id,
      gider_kategorisi_id: lockedCariHesap.gider_kategorileri[0] ?? f.gider_kategorisi_id,
      sube_id: effectiveSubeId ?? f.sube_id,
    }));
  }, [lockedCariHesap, effectiveSubeId]);

  useEffect(() => {
    if (!presetGiderKategorileri?.length) return;
    setFlatKategoriler(presetGiderKategorileri.map((k) => ({ id: k.id, label: k.ad })));
  }, [presetGiderKategorileri]);

  useEffect(() => {
    if (!effectiveSubeId) return;
    setForm((f) => ({ ...f, sube_id: effectiveSubeId }));
  }, [effectiveSubeId]);

  useEffect(() => {
    if (!effectiveSubeId) {
      if (!isCariLocked) return;
    }
    const load = async () => {
      try {
        const flattenTree = (tree: any[]) => {
          const flat: { id: number; label: string }[] = [];
          tree.forEach((ana: any) => {
            flat.push({ id: ana.id, label: ana.ad });
            (ana.alt_kategoriler || []).forEach((alt: any) => {
              flat.push({ id: alt.id, label: `${ana.ad} › ${alt.ad}` });
            });
          });
          return flat;
        };

        const loadCariAndKategori = !isCariLocked && effectiveSubeId;
        const loadKategoriOnly =
          effectiveSubeId && isCariLocked && !presetGiderKategorileri?.length;

        const requests: Promise<unknown>[] = [];
        if (loadCariAndKategori) {
          requests.push(
            cariHesapService.dropdown({
              kurum_id: String(kurumId),
              sube_id: String(effectiveSubeId),
            }),
            giderKategoriService.tree(kurumId, effectiveSubeId),
          );
        } else if (loadKategoriOnly) {
          requests.push(giderKategoriService.tree(kurumId, effectiveSubeId));
        }
        if (effectiveSubeId) {
          requests.push(
            paymentMethodService.dropdown(kurumId, undefined, effectiveSubeId),
            financialAccountService.dropdownByKurum(kurumId, effectiveSubeId),
          );
        }

        const results = await Promise.all(requests);
        let idx = 0;

        if (loadCariAndKategori) {
          const cariHesapRes = results[idx++] as CariHesapDropdownItem[];
          const kategoriRes = results[idx++] as { kategoriler?: any[] };
          setCariHesaplar(cariHesapRes);
          const tree = kategoriRes.kategoriler || [];
          setKategoriTree(tree);
          setFlatKategoriler(flattenTree(tree));

          if (defaultCariHesapId) {
            const hesap = cariHesapRes.find((t) => t.id === defaultCariHesapId);
            if (hesap?.gider_kategorileri?.length) {
              setForm((f) => ({ ...f, gider_kategorisi_id: hesap.gider_kategorileri[0] }));
            }
          }
        } else if (loadKategoriOnly) {
          const kategoriRes = results[idx++] as { kategoriler?: any[] };
          const tree = kategoriRes.kategoriler || [];
          setKategoriTree(tree);
          setFlatKategoriler(flattenTree(tree));
        }

        if (effectiveSubeId) {
          const odemeRes = results[idx++] as { odeme_yontemleri?: typeof odemeYontemleri };
          const hesapRes = results[idx++] as { mali_hesaplar?: typeof maliHesaplar };
          setOdemeYontemleri(odemeRes.odeme_yontemleri || []);
          setMaliHesaplar(hesapRes.mali_hesaplar || []);
        }
      } catch (e: any) {
        onError("Dropdown verileri yüklenemedi: " + e.message);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kurumId, effectiveSubeId, isCariLocked]);

  // NET tutar giriliyor → brüt = net / (1 + kdv%)
  const netTutarGirilen = Number(form.brut_tutar) || 0; // form alanı hâlâ brut_tutar ama kullanıcı net giriyor
  const kdvOrani = Number(form.kdv_orani) || 0;
  const brutTutar = kdvOrani > 0
    ? Math.round((netTutarGirilen / (1 + kdvOrani / 100)) * 100) / 100
    : netTutarGirilen;
  const kdvTutar = Math.round((netTutarGirilen - brutTutar) * 100) / 100;
  const netTutar = netTutarGirilen;

  // Taksit planını otomatik oluştur (taksit_sayisi, vade_tarihi veya netTutar değiştiğinde)
  useEffect(() => {
    const count = form.taksit_sayisi ?? 1;
    if (count <= 1 || netTutar <= 0) {
      setTaksitPlani([]);
      setTaksitPlaniManual(false);
      return;
    }
    // Manuel düzenleme yapılmışsa planı bozmayız (taksit sayısı değişmediyse)
    if (taksitPlaniManual && taksitPlani.length === count) return;

    const vadeStr = form.vade_tarihi;
    const baseDate = vadeStr ? new Date(vadeStr) : new Date();
    const birimTutar = Math.floor((netTutar / count) * 100) / 100;

    const plan: TaksitPlaniItem[] = [];
    for (let i = 1; i <= count; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 30 * (i - 1));
      const tutar = i === count ? Math.round((netTutar - birimTutar * (count - 1)) * 100) / 100 : birimTutar;
      plan.push({
        taksit_no: i,
        vade_tarihi: d.toISOString().slice(0, 10),
        tutar,
      });
    }
    setTaksitPlani(plan);
    setTaksitPlaniManual(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.taksit_sayisi, form.vade_tarihi, netTutar]);

  // Taksit toplamı hesapla
  const taksitToplam = taksitPlani.reduce((s, t) => s + (Number(t.tutar) || 0), 0);
  const taksitFark = Math.abs(taksitToplam - netTutar);

  const setStepErrors = (fields: string[], errs: Record<string, string>) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      fields.forEach((f) => delete next[f]);
      return { ...next, ...errs };
    });
  };

  const validateTarafStep = () => {
    const e: Record<string, string> = {};
    if (!form.cari_hesap_id) e.cari_hesap_id = "Cari hesap seçiniz";
    if (!form.gider_kategorisi_id) e.gider_kategorisi_id = "Kategori seçiniz";
    setStepErrors(["cari_hesap_id", "gider_kategorisi_id"], e);
    return Object.keys(e).length === 0;
  };

  const validateTutarStep = () => {
    const e: Record<string, string> = {};
    if (!form.fatura_tarihi) e.fatura_tarihi = "Fatura tarihi zorunludur";
    if (!form.vade_tarihi) e.vade_tarihi = "Vade tarihi seçilmedi. Lütfen vade tarihini belirleyin.";
    if (!form.brut_tutar || Number(form.brut_tutar) <= 0) e.brut_tutar = "Net tutar sıfırdan büyük olmalıdır";
    setStepErrors(["fatura_tarihi", "vade_tarihi", "brut_tutar"], e);
    return Object.keys(e).length === 0;
  };

  const validateTaksitStep = () => {
    const e: Record<string, string> = {};
    if (taksitPlani.length > 0 && taksitFark > 0.02) {
      e.taksit_plani = `Taksit toplamı (${taksitToplam.toFixed(2)} ₺) net tutarla (${netTutar.toFixed(2)} ₺) eşleşmiyor.`;
    }
    setStepErrors(["taksit_plani"], e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    setFieldErrors({});

    // Manuel alan validasyonu
    const errs: Record<string, string> = {};
    if (!form.cari_hesap_id) errs.cari_hesap_id = "Cari hesap seçiniz";
    if (!form.gider_kategorisi_id) errs.gider_kategorisi_id = "Kategori seçiniz";
    if (!form.fatura_tarihi) errs.fatura_tarihi = "Fatura tarihi zorunludur";
    if (!form.vade_tarihi) errs.vade_tarihi = "Vade tarihi seçilmedi. Lütfen vade tarihini belirleyin.";
    if (!form.brut_tutar || Number(form.brut_tutar) <= 0) errs.brut_tutar = "Net tutar sıfırdan büyük olmalıdır";
    if (taksitPlani.length > 0 && taksitFark > 0.02) {
      errs.taksit_plani = `Taksit toplamı (${taksitToplam.toFixed(2)} ₺) net tutarla (${netTutar.toFixed(2)} ₺) eşleşmiyor.`;
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setGeneralError("Lütfen zorunlu alanları doldurun ve hataları düzeltin.");
      return;
    }

    setSaving(true);
    setGeneralError(null);
    try {
      // Kullanıcı net (KDV dahil) giriyor → backend brüt bekliyor
      const payload: GiderKaydiCreatePayload = { ...form, brut_tutar: brutTutar };
      if (taksitPlani.length > 0) {
        payload.taksit_plani = taksitPlani;
      }
      const created = await giderKaydiService.create(payload);

      const odemeHazir = Boolean(form.odeme_yontemi_id && form.mali_hesap_id);
      if (odemeSimdi && odemeHazir && !planliOdeme) {
        const masraf = buildIslemMasrafiPayload(masrafForm);
        await giderOdemeService.create(created.id, {
          gider_kaydi_id: created.id,
          tutar: netTutar,
          odeme_yontemi_id: form.odeme_yontemi_id!,
          mali_hesap_id: form.mali_hesap_id!,
          odeme_tarihi: new Date().toISOString().slice(0, 10),
          ...masraf,
        });
        onSuccess("Gider kaydı oluşturuldu ve ödeme kasadan düşüldü.");
      } else {
        onSuccess(
          odemeHazir
            ? "Gider kaydı oluşturuldu. Ödeme için Ödemeler sekmesinden devam edebilirsiniz."
            : "Gider kaydı oluşturuldu.",
        );
      }
      onClose();
    } catch (e: unknown) {
      if (e instanceof FinansHttpError) {
        if (Object.keys(e.fieldErrors).length) setFieldErrors(e.fieldErrors);
        setGeneralError(e.message);
      } else {
        setGeneralError(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
      }
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const todayIso = () => new Date().toISOString().slice(0, 10);
  const planliOdeme =
    (form.taksit_sayisi ?? 1) > 1 ||
    Boolean(form.vade_tarihi && form.vade_tarihi > todayIso());

  useEffect(() => {
    if (planliOdeme) setOdemeSimdi(false);
  }, [planliOdeme]);

  // Seçili cari hesabın gider kategorileri — dropdown filtresi için
  const giderCariHesaplar = useMemo(
    () => cariHesaplar.filter((c) => cariTabGorunur("giderler", c.hesap_turu)),
    [cariHesaplar],
  );

  const seciliCariHesap = giderCariHesaplar.find(t => t.id === form.cari_hesap_id)
    ?? cariHesaplar.find(t => t.id === form.cari_hesap_id);
  const cariHesapKategoriIds = seciliCariHesap?.gider_kategorileri ?? [];
  const selectedYontem = odemeYontemleri.find(o => o.id === form.odeme_yontemi_id);
  const selectedHesap = maliHesaplar.find(m => m.id === form.mali_hesap_id);
  const masrafVisible = odemeSimdi && !planliOdeme && islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);
  const lockedKategoriOptions = useMemo(
    () => (presetGiderKategorileri || []).map((k) => ({ id: k.id, label: k.ad })),
    [presetGiderKategorileri],
  );

  const filtrelenmisKategoriler = isCariLocked
    ? lockedKategoriOptions
    : form.cari_hesap_id
      ? (cariHesapKategoriIds.length > 0
          ? flatKategoriler.filter((k) => cariHesapKategoriIds.includes(k.id))
          : flatKategoriler)
      : [];

  // Cari hesap seçildiğinde ilişkili gider kategorisini otomatik set et
  const handleCariHesapChange = (cariHesapId: number) => {
    setForm(f => {
      const updated = { ...f, cari_hesap_id: cariHesapId };
      if (cariHesapId) {
        const hesap = giderCariHesaplar.find(t => t.id === cariHesapId)
          ?? cariHesaplar.find(t => t.id === cariHesapId);
        if (hesap?.gider_kategorileri?.length) {
          // İlk kategoriyi otomatik seç
          updated.gider_kategorisi_id = hesap.gider_kategorileri[0];
        } else {
          updated.gider_kategorisi_id = 0;
        }
      } else {
        updated.gider_kategorisi_id = 0;
      }
      return updated;
    });
  };

  const seciliCariHesapAd = giderCariHesaplar.find(t => t.id === form.cari_hesap_id)?.gorunen_ad
    ?? cariHesaplar.find(t => t.id === form.cari_hesap_id)?.gorunen_ad;
  const seciliKategoriLabel = flatKategoriler.find(k => k.id === form.gider_kategorisi_id)?.label;
  const seciliMaliHesapAd = maliHesaplar.find(m => m.id === form.mali_hesap_id)?.ad;
  const seciliOdemeYontemiAd = odemeYontemleri.find(o => o.id === form.odeme_yontemi_id)?.ad;
  const TEKRAR_LABEL: Record<string, string> = { haftalik: "Haftalık", aylik: "Aylık", uc_aylik: "3 Aylık", yillik: "Yıllık" };

  const steps: FinansWizardStep[] = [
    {
      id: "taraf",
      label: "Taraf & Kategori",
      icon: <IconTaraf />,
      fields: ["cari_hesap_id", "gider_kategorisi_id"],
      validate: validateTarafStep,
      content: (
        <FSection title="Taraf & Kategori">
          <FField label="Cari Hesap" required error={fieldErrors.cari_hesap_id}>
            {isCariLocked ? (
              <FInput readOnly value={lockedCariHesap?.gorunen_ad || ""} />
            ) : (
              <FSelect error={!!fieldErrors.cari_hesap_id} value={form.cari_hesap_id || ""} onChange={e => handleCariHesapChange(Number(e.target.value))}>
                <option value="">Seçin…</option>
                {giderCariHesaplar.map(t => {
                  const tur = HESAP_TURLERI.find(h => h.value === t.hesap_turu)?.label;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.gorunen_ad}{tur ? ` (${tur})` : ""}
                    </option>
                  );
                })}
              </FSelect>
            )}
          </FField>
          <FField label="Gider Kategorisi" required error={fieldErrors.gider_kategorisi_id}>
            <FSelect
              disabled={!isCariLocked && !form.cari_hesap_id}
              error={!!fieldErrors.gider_kategorisi_id}
              value={form.gider_kategorisi_id || ""}
              onChange={e => set("gider_kategorisi_id", Number(e.target.value))}
            >
              <option value="">
                {!isCariLocked && !form.cari_hesap_id
                  ? "Önce cari hesap seçin"
                  : "Kategori seçin"}
              </option>
              {filtrelenmisKategoriler.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </FSelect>
          </FField>
          <FField label="İşlemi Yapan">
            <FInput readOnly value={islemYapanAdi} />
          </FField>
        </FSection>
      ),
    },
    {
      id: "tutar",
      label: "Tutar & KDV",
      icon: <IconTutar />,
      fields: ["brut_tutar", "fatura_tarihi", "vade_tarihi"],
      validate: validateTutarStep,
      content: (
        <>
          <FAmountHero
            variant="gider"
            label="Net Tutar (KDV Dahil)"
            value={form.brut_tutar || ""}
            onChange={(v) => set("brut_tutar", v)}
            error={fieldErrors.brut_tutar}
          />

          {netTutar > 0 && (
            <div className="fd-calc-strip">
              <div className="fd-calc-items">
                <div>
                  <div className="fd-calc-item-label">Brüt</div>
                  <div className="fd-calc-item-value">{brutTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</div>
                </div>
                <div>
                  <div className="fd-calc-item-label">KDV %{kdvOrani}</div>
                  <div className="fd-calc-item-value">{kdvTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</div>
                </div>
                {(form.taksit_sayisi ?? 1) > 1 && (
                  <div>
                    <div className="fd-calc-item-label">Taksit</div>
                    <div className="fd-calc-item-value">{(netTutar / (form.taksit_sayisi ?? 1)).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</div>
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="fd-calc-total-label">Net</div>
                <div className="fd-calc-total-value">{netTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</div>
              </div>
            </div>
          )}

          <FSection title="Tutar Detayı">
            <div className="fd-row-2">
              <FField label="KDV Oranı">
                <FSelect value={form.kdv_orani ?? 20} onChange={e => set("kdv_orani", Number(e.target.value))}>
                  {KDV_ORANLARI.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </FSelect>
              </FField>
              <FField label="Taksit Sayısı">
                <FInput type="number" min={1} max={60} value={form.taksit_sayisi || 1} onChange={e => set("taksit_sayisi", Number(e.target.value))} />
              </FField>
            </div>
            <div className="fd-row-3">
              <FField label="Fatura No">
                <FInput value={form.fatura_no || ""} onChange={e => set("fatura_no", e.target.value)} placeholder="Opsiyonel" style={{ fontFamily: "ui-monospace, monospace" }} />
              </FField>
              <FField label="Fatura Tarihi" required error={fieldErrors.fatura_tarihi}>
                <FInput type="date" error={!!fieldErrors.fatura_tarihi} value={form.fatura_tarihi} onChange={e => set("fatura_tarihi", e.target.value)} />
              </FField>
              <FField label="Vade Tarihi" required error={fieldErrors.vade_tarihi}>
                <FInput type="date" error={!!fieldErrors.vade_tarihi} value={form.vade_tarihi} onChange={e => set("vade_tarihi", e.target.value)} />
              </FField>
            </div>
            <FField label="Açıklama">
              <FTextarea rows={2} value={form.aciklama || ""} onChange={e => set("aciklama", e.target.value)} placeholder="Gider hakkında kısa not…" />
            </FField>
          </FSection>
        </>
      ),
    },
    {
      id: "taksit",
      label: "Taksit Planı",
      icon: <IconTaksit />,
      hidden: (form.taksit_sayisi ?? 1) <= 1,
      fields: ["taksit_plani"],
      validate: validateTaksitStep,
      content: (
        <FSection title="Taksit Planı">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{form.taksit_sayisi} Taksit</span>
            <button type="button" onClick={() => {
              setTaksitPlaniManual(false);
              const count = form.taksit_sayisi ?? 1;
              const baseDate = form.vade_tarihi ? new Date(form.vade_tarihi) : new Date();
              const birimTutar = Math.floor((netTutar / count) * 100) / 100;
              const plan: TaksitPlaniItem[] = [];
              for (let i = 1; i <= count; i++) {
                const d = new Date(baseDate);
                d.setDate(d.getDate() + 30 * (i - 1));
                plan.push({ taksit_no: i, vade_tarihi: d.toISOString().slice(0, 10), tutar: i === count ? Math.round((netTutar - birimTutar * (count - 1)) * 100) / 100 : birimTutar });
              }
              setTaksitPlani(plan);
            }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Sıfırla
            </button>
          </div>
          <div className="fd-taksit-edit-list">
            <div className="fd-taksit-edit-row fd-taksit-edit-row--head">
              <span className="fd-taksit-no">#</span>
              <span>Vade</span>
              <span>Tutar</span>
              <span>Ödeme Yöntemi</span>
            </div>
            {taksitPlani.map((t, idx) => (
              <div key={t.taksit_no} className="fd-taksit-edit-row fd-taksit-edit-row--4col">
                <span className="fd-taksit-no">{t.taksit_no}</span>
                <FInput
                  type="date"
                  value={t.vade_tarihi}
                  onChange={e => {
                    const updated = [...taksitPlani];
                    updated[idx] = { ...updated[idx], vade_tarihi: e.target.value };
                    setTaksitPlani(updated);
                    setTaksitPlaniManual(true);
                  }}
                />
                <FInput
                  type="number"
                  step="any"
                  min={0}
                  value={t.tutar || ""}
                  onChange={e => {
                    const updated = [...taksitPlani];
                    updated[idx] = { ...updated[idx], tutar: parseFloat(e.target.value) || 0 };
                    setTaksitPlani(updated);
                    setTaksitPlaniManual(true);
                  }}
                />
                <FSelect
                  value={t.odeme_yontemi_id ?? ""}
                  onChange={(e) => {
                    const updated = [...taksitPlani];
                    updated[idx] = {
                      ...updated[idx],
                      odeme_yontemi_id: e.target.value ? Number(e.target.value) : null,
                    };
                    setTaksitPlani(updated);
                    setTaksitPlaniManual(true);
                  }}
                >
                  <option value="">Nakit/Havale (varsayılan)</option>
                  {odemeYontemleri.map((oy) => (
                    <option key={oy.id} value={oy.id}>
                      {oy.ad}{isCekSenetTip(oy.tip) ? " (çek/senet)" : ""}
                    </option>
                  ))}
                </FSelect>
              </div>
            ))}
          </div>
          {!cekSenetPlanYontemVar && (
            <p style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>
              {!effectiveSubeId
                ? "Ödeme yöntemleri yüklenemedi — üst menüden şube seçin."
                : "Çek/senet taksit için Finans → Tanımlar → Ödeme Yöntemleri'nden Çek/Senet tipi ekleyin."}
            </p>
          )}
          <div className="fd-taksit-total">
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>Toplam</span>
            <span style={{ color: taksitFark > 0.02 ? "#e11d48" : "#047857" }}>
              {taksitToplam.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
            </span>
          </div>
          {fieldErrors.taksit_plani && <p className="fd-field-error">{fieldErrors.taksit_plani}</p>}
        </FSection>
      ),
    },
    {
      id: "odeme",
      label: "Ödeme & Tekrar",
      icon: <IconOdeme />,
      content: (
        <>
          <FSection title="Ödeme">
            <div className="fd-row-2">
              <FField label="Ödenecek Mali Hesap">
                <FSelect
                  value={form.mali_hesap_id || ""}
                  onChange={e => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setForm(f => ({ ...f, mali_hesap_id: id, odeme_yontemi_id: null }));
                    setMasrafForm({ ...EMPTY_ISLEM_MASRAFI });
                  }}
                >
                  <option value="">Seçiniz</option>
                  {maliHesaplar.map(m => <option key={m.id} value={m.id}>{m.ad}</option>)}
                </FSelect>
              </FField>
              <FField label="Planlanan Ödeme Yöntemi">
                <FSelect
                  disabled={!form.mali_hesap_id}
                  value={form.odeme_yontemi_id || ""}
                  onChange={e => {
                    set("odeme_yontemi_id", e.target.value ? Number(e.target.value) : null);
                    setMasrafForm({ ...EMPTY_ISLEM_MASRAFI });
                  }}
                >
                  <option value="">{form.mali_hesap_id ? "Seçiniz" : "Önce mali hesap seçin"}</option>
                  {filtreliOdemeYontemleri.map(o => (
                    <option key={o.id} value={o.id}>
                      {formatOdemeYontemiLabel(o, { hideMaliHesap: true })}
                    </option>
                  ))}
                </FSelect>
              </FField>
            </div>
            {form.odeme_yontemi_id && form.mali_hesap_id ? (
              planliOdeme ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                  Vadeli veya taksitli giderlerde anlık ödeme yapılmaz. Vade tarihinde
                  Ödemeler sekmesinden ödeme girebilirsiniz.
                </p>
              ) : (
                <label className="flex items-start gap-2 text-sm text-slate-600 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={odemeSimdi}
                    onChange={(e) => setOdemeSimdi(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="text-slate-800">Ödemeyi şimdi kaydet</strong>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      İşaretliyse tutar seçilen hesaptan düşülür. İşaretsizse yalnızca gider kaydı oluşturulur;
                      ödeme daha sonra detay → Ödemeler sekmesinden girilir.
                    </span>
                  </span>
                </label>
              )
            ) : (
              <p className="text-xs text-slate-500 mb-3">
                Ödeme yöntemi ve mali hesap seçmek plan bilgisidir; kasadan düşüş için kayıt sonrası
                Ödemeler sekmesinden ödeme girmeniz gerekir.
              </p>
            )}
            {masrafVisible && (
              <IslemMasrafiFields
                visible
                form={masrafForm}
                onChange={(patch) => setMasrafForm((f) => ({ ...f, ...patch }))}
              />
            )}
          </FSection>

          <FSection title="Tekrar">
            <div className="fd-toggle-row">
              <div className="fd-toggle-text">
                <strong>Tekrarlayan Gider</strong>
                <span>Belirli aralıklarla otomatik oluşturulur</span>
              </div>
              <button type="button" className={`fd-switch${form.tekrar_mi ? " is-on" : ""}`} onClick={() => set("tekrar_mi", !form.tekrar_mi)} aria-pressed={form.tekrar_mi}>
                <span className="fd-switch-knob" />
              </button>
            </div>
            {form.tekrar_mi && (
              <FField label="Tekrar Sıklığı">
                <FSelect value={form.tekrar_sikligi || "aylik"} onChange={e => set("tekrar_sikligi", e.target.value)}>
                  <option value="haftalik">Haftalık</option>
                  <option value="aylik">Aylık</option>
                  <option value="uc_aylik">3 Aylık</option>
                  <option value="yillik">Yıllık</option>
                </FSelect>
              </FField>
            )}
          </FSection>
        </>
      ),
    },
    {
      id: "ozet",
      label: "Özet",
      icon: <IconOzet />,
      content: (
        <FSection title="Özet">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fd-muted, #64748b)" }}>
            Kaydetmeden önce bilgileri gözden geçirin.
          </p>
          <FSummaryCard>
            <FReviewRow label="İşlemi Yapan" value={islemYapanAdi} />
            <FReviewRow label="Cari Hesap" value={seciliCariHesapAd || "—"} />
            <FReviewRow label="Kategori" value={seciliKategoriLabel || "—"} />
            <FReviewRow label="Net Tutar" value={`${netTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`} />
            <FReviewRow label={`KDV (%${kdvOrani})`} value={`${kdvTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`} muted />
            {(form.taksit_sayisi ?? 1) > 1 && (
              <FReviewRow label="Taksit Sayısı" value={`${form.taksit_sayisi} Taksit`} />
            )}
            <FReviewRow label="Mali Hesap" value={seciliMaliHesapAd || "Belirtilmedi"} muted={!seciliMaliHesapAd} />
            <FReviewRow label="Ödeme Yöntemi" value={seciliOdemeYontemiAd || "Belirtilmedi"} muted={!seciliOdemeYontemiAd} />
            {odemeSimdi && !planliOdeme && <FReviewRow label="Ödeme Durumu" value="Şimdi kaydedilecek" />}
            {masrafVisible && Number(masrafForm.kesinti_tutar) > 0 && (
              <FReviewRow label="İşlem Masrafı" value={`${Number(masrafForm.kesinti_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`} muted />
            )}
            {form.fatura_no && <FReviewRow label="Fatura No" value={form.fatura_no} muted />}
            <FReviewRow label="Fatura Tarihi" value={form.fatura_tarihi || "—"} />
            <FReviewRow label="Vade Tarihi" value={form.vade_tarihi || "—"} />
            {form.tekrar_mi && (
              <FReviewRow label="Tekrarlayan Gider" value={`Evet (${TEKRAR_LABEL[form.tekrar_sikligi || "aylik"]})`} muted />
            )}
            {form.aciklama && <FReviewRow label="Açıklama" value={form.aciklama} muted />}
          </FSummaryCard>
        </FSection>
      ),
    },
  ];

  return (
    <FinansWizardDrawer
      onClose={onClose}
      variant="gider"
      headerIcon={<IconGider />}
      title="Yeni Gider Kaydı"
      subtitle="Cari hesap, tarih ve taksit bilgilerini adım adım girin."
      steps={steps}
      fieldErrors={fieldErrors}
      generalError={
        !effectiveSubeId
          ? "Mali hesap ve ödeme yöntemi listesi için üst menüden şube seçin."
          : generalError
      }
      onSubmit={handleSubmit}
      saving={saving}
      submitLabel="Kaydet"
    />
  );
}

// ═══ Gider Detay Modal ═════════════════════════════════════════
export function GiderDetailModal({
  data, kurumId, onClose, onAction, onError,
}: {
  data: GiderKaydiDetail;
  kurumId: number;
  onClose: () => void;
  onAction: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const badge = GIDER_DURUMLARI.find(d => d.value === data.durum);
  const [tab, setTab] = useState<"bilgi" | "taksitler" | "odemeler">("bilgi");
  const [odemeler, setOdemeler] = useState<GiderOdeme[]>([]);
  const [showOdemeForm, setShowOdemeForm] = useState(false);
  const [odemeLoading, setOdemeLoading] = useState(false);
  const [selectedTaksitIdForOdeme, setSelectedTaksitIdForOdeme] = useState<number | null>(null);

  const fetchOdemeler = useCallback(async () => {
    setOdemeLoading(true);
    try {
      const res = await giderOdemeService.list(data.id);
      setOdemeler(res);
    } catch (e: any) { onError(e.message); }
    finally { setOdemeLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id]);

  useEffect(() => {
    if (tab === "odemeler") fetchOdemeler();
  }, [tab, fetchOdemeler]);

  const handleIptal = async () => {
    if (!confirm("İptal edilsin mi?")) return;
    try { const r = await giderKaydiService.iptal(data.id); onAction(r.detail); } catch (e: any) { onError(e.message); }
  };

  const kalan = Number(data.kalan_tutar);
  const yuzde = Number(data.odeme_yuzdesi);

  return (
    <div className="fd-form-embedded">
      <header className="fd-header">
        <div className="fd-header-row">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            <span className="fd-badge fd-badge--gider">Gider</span>
            {badge && <span className={`fd-chip fd-chip--neutral ${badge.color}`}>{badge.label}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {data.iptal_edilebilir_mi && (
              <button type="button" onClick={handleIptal} className="fd-chip fd-chip--rose" style={{ cursor: "pointer", border: "none" }}>
                İptal Et
              </button>
            )}
            <button type="button" onClick={onClose} className="fd-close" aria-label="Kapat">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <h2 className="fd-title fd-title--entity">{data.cari_hesap_adi}</h2>
        <p className="fd-subtitle fd-subtitle--meta">
          {[
            data.fatura_no ? `Fatura No: ${data.fatura_no}` : null,
            data.kategori_adi,
          ].filter(Boolean).join(" · ") || "Belgesiz kayıt"}
        </p>

        <div className="fd-detail-kpi-grid fd-detail-kpi-grid--4" style={{ marginTop: 14 }}>
          <div className="fd-detail-kpi">
            <div className="fd-detail-kpi-label">Net Tutar</div>
            <div className="fd-detail-kpi-value">{Number(data.net_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</div>
          </div>
          <div className="fd-detail-kpi fd-detail-kpi--emerald">
            <div className="fd-detail-kpi-label">Ödenen</div>
            <div className="fd-detail-kpi-value">{Number(data.odenen_toplam).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</div>
          </div>
          <div className={`fd-detail-kpi ${kalan > 0 ? "fd-detail-kpi--rose" : "fd-detail-kpi--emerald"}`}>
            <div className="fd-detail-kpi-label">Kalan</div>
            <div className="fd-detail-kpi-value">{kalan.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</div>
          </div>
          <div className="fd-detail-kpi">
            <div className="fd-detail-kpi-label">İlerleme</div>
            <div className="fd-progress-track" style={{ marginTop: 6 }}>
              <div className="fd-progress-fill fd-progress-fill--rose" style={{ width: `${Math.min(100, yuzde)}%` }} />
            </div>
            <div className="fd-detail-kpi-value" style={{ fontSize: 12, marginTop: 4 }}>%{yuzde.toFixed(0)}</div>
          </div>
        </div>
      </header>

      <div className="fd-body-inner">
        <div className="fd-tab-bar fd-tab-bar--compact">
          {(["bilgi", "taksitler", "odemeler"] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`fd-tab${tab === t ? " is-active" : ""}`}>
              {t === "bilgi" ? "Bilgiler" : t === "taksitler" ? `Taksit${data.taksitler.length > 0 ? ` (${data.taksitler.length})` : ""}` : "Ödemeler"}
            </button>
          ))}
        </div>

        <div>
          {tab === "bilgi" && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              <GInfoRow label="Cari Hesap" value={data.cari_hesap_adi} />
              <GInfoRow label="Kategori" value={data.kategori_adi} />
              <GInfoRow label="Şube" value={data.sube_adi || "—"} />
              <GInfoRow label="Mali Hesap" value={data.mali_hesap_adi || "—"} />
              <GInfoRow label="Ödeme Yöntemi" value={data.odeme_yontemi_adi || "—"} />
              <GInfoRow label="Fatura Tarihi" value={data.fatura_tarihi} />
              <GInfoRow label="Vade Tarihi" value={data.vade_tarihi} />
              <GInfoRow label="Brüt Tutar" value={`${Number(data.brut_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`} />
              <GInfoRow label="KDV (%)" value={`${data.kdv_orani}`} />
              <GInfoRow label="KDV Tutarı" value={`${Number(data.kdv_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`} />
              <GInfoRow label="Taksit Sayısı" value={`${data.taksit_sayisi}`} />
              <GInfoRow label="Tekrarlayan" value={data.tekrar_mi ? `Evet (${data.tekrar_sikligi})` : "Hayır"} />
              <GInfoRow label="Oluşturan" value={data.olusturan_adi || "—"} />
              <GInfoRow label="Onaylayan" value={data.onaylayan_adi || "—"} />
              <div className="col-span-2 mt-2">
                <div className="text-[11px] text-gray-400 font-medium mb-1">Açıklama</div>
                <div className="text-[13px] text-gray-700 bg-gray-50/80 rounded-xl p-3.5 border border-gray-100 leading-relaxed min-h-[2.75rem]">
                  {(data.aciklama || "").trim()}
                </div>
              </div>
            </div>
          )}

          {tab === "taksitler" && (
            <div>
              {data.taksitler.length === 0 ? (
                <div>
                  {/* Taksit planı henüz oluşturulmamış — planlanan bilgiyi göster */}
                  {data.taksit_sayisi > 1 ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        <p className="text-[11px] text-amber-700 font-medium">Gider onaylandığında {data.taksit_sayisi} taksit otomatik oluşturulacak</p>
                      </div>
                      <GiderPlannedTaksitCards
                        count={data.taksit_sayisi}
                        netTutar={Number(data.net_tutar)}
                        vadeTarihi={data.vade_tarihi}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      </div>
                      <p className="text-sm text-gray-400">Tek seferlik ödeme</p>
                      <p className="text-[11px] text-gray-300 mt-1">Gider onaylandığında ödeme planı oluşturulacak</p>
                    </div>
                  )}
                </div>
              ) : (
                <GiderTaksitCards
                  taksitler={data.taksitler}
                  odenebilir={data.odenebilir_mi}
                  onPay={(taksitId) => {
                    setSelectedTaksitIdForOdeme(taksitId);
                    setTab("odemeler");
                    setShowOdemeForm(true);
                  }}
                />
              )}

              {data.odenebilir_mi && (
                <div className="mt-4 text-right">
                  <button onClick={() => { setSelectedTaksitIdForOdeme(null); setTab("odemeler"); setShowOdemeForm(true); }}
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all duration-200 text-sm font-semibold shadow-lg shadow-emerald-600/25">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    Ödeme Yap
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "odemeler" && (
            <div>
              {data.odenebilir_mi && !showOdemeForm && (
                <div className="mb-4 text-right">
                  <button onClick={() => { setSelectedTaksitIdForOdeme(null); setShowOdemeForm(true); }}
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all duration-200 text-sm font-semibold shadow-lg shadow-emerald-600/25">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    Ödeme Yap
                  </button>
                </div>
              )}

              {odemeLoading ? (
                <div className="text-center py-8">
                  <svg className="w-8 h-8 animate-spin text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                </div>
              ) : odemeler.length === 0 && !showOdemeForm ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <p className="text-sm text-gray-400">Henüz ödeme yapılmamış</p>
                </div>
              ) : odemeler.length > 0 && (
                <GiderOdemeCards odemeler={odemeler} />
              )}

              {/* Ödeme Formu */}
              {showOdemeForm && (
                <OdemeFormInline
                  giderId={data.id}
                  taksitler={data.taksitler.filter(t => t.durum !== "odendi" && t.durum !== "iptal")}
                  kurumId={kurumId}
                  defaultTaksitId={selectedTaksitIdForOdeme}
                  defaultMaliHesapId={data.mali_hesap_id}
                  defaultOdemeYontemiId={data.odeme_yontemi_id}
                  onClose={() => { setShowOdemeForm(false); setSelectedTaksitIdForOdeme(null); }}
                  onSuccess={(msg) => { onAction(msg); setSelectedTaksitIdForOdeme(null); }}
                  onError={onError}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ Ödeme Formu (Inline) ══════════════════════════════════════
function OdemeFormInline({
  giderId, taksitler, kurumId, defaultTaksitId, defaultMaliHesapId, defaultOdemeYontemiId, onClose, onSuccess, onError,
}: {
  giderId: number;
  taksitler: GiderTaksit[];
  kurumId: number;
  defaultTaksitId?: number | null;
  defaultMaliHesapId?: number | null;
  defaultOdemeYontemiId?: number | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { activeSube } = useKurum();
  // Ön-seçili taksit: defaultTaksitId verilmişse onu kullan, yoksa ilk taksit
  const initialTaksit = defaultTaksitId
    ? taksitler.find(t => t.id === defaultTaksitId) || (taksitler.length > 0 ? taksitler[0] : null)
    : taksitler.length > 0 ? taksitler[0] : null;
  const [form, setForm] = useState<
    Omit<GiderOdemeCreatePayload, "kesinti_turu" | "kesinti_tutar" | "kesinti_aciklama"> & IslemMasrafiFormState
  >({
    gider_kaydi_id: giderId,
    gider_taksit_id: initialTaksit?.id || null,
    odeme_yontemi_id: 0,
    mali_hesap_id: 0,
    tutar: initialTaksit ? Number(initialTaksit.kalan_tutar) : 0,
    odeme_tarihi: new Date().toISOString().slice(0, 10),
    aciklama: "",
    ...EMPTY_ISLEM_MASRAFI,
  });
  const [saving, setSaving] = useState(false);
  const [odemeYontemleri, setOdemeYontemleri] = useState<{ id: number; ad: string; mali_hesap_id: number; tip?: string }[]>([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip?: string }[]>([]);
  const filtreliOdemeYontemleri = form.mali_hesap_id
    ? odemeYontemleri.filter(o => o.mali_hesap_id === form.mali_hesap_id)
    : [];

  useEffect(() => {
    Promise.all([
      paymentMethodService.dropdown(kurumId, undefined, activeSube?.id),
      financialAccountService.dropdownByKurum(kurumId, activeSube?.id),
    ]).then(([oy, mh]) => {
      setOdemeYontemleri(oy.odeme_yontemleri || []);
      setMaliHesaplar(mh.mali_hesaplar || []);
      const maliId = defaultMaliHesapId || mh.mali_hesaplar?.[0]?.id || 0;
      const yontemId = defaultOdemeYontemiId || 0;
      setForm((f) => ({
        ...f,
        mali_hesap_id: maliId,
        odeme_yontemi_id: yontemId,
      }));
    }).catch(e => onError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kurumId, activeSube?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Manuel validation
    if (!form.tutar || form.tutar <= 0) { onError("Tutar sıfırdan büyük olmalıdır"); return; }
    if (!form.odeme_yontemi_id) { onError("Ödeme yöntemi seçiniz"); return; }
    if (!form.mali_hesap_id) { onError("Mali hesap seçiniz"); return; }
    if (!form.odeme_tarihi) { onError("Ödeme tarihi zorunludur"); return; }
    setSaving(true);
    try {
      const masraf = buildIslemMasrafiPayload(form);
      const payload: GiderOdemeCreatePayload = {
        gider_kaydi_id: giderId,
        gider_taksit_id: form.gider_taksit_id || undefined,
        odeme_yontemi_id: form.odeme_yontemi_id,
        mali_hesap_id: form.mali_hesap_id,
        tutar: form.tutar,
        odeme_tarihi: form.odeme_tarihi,
        aciklama: form.aciklama || undefined,
        ...masraf,
      };
      await giderOdemeService.create(giderId, payload);
      onSuccess("Ödeme başarıyla kaydedildi.");
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  };

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const handleTaksitChange = (taksitId: number | null) => {
    set("gider_taksit_id", taksitId);
    if (taksitId) {
      const t = taksitler.find(x => x.id === taksitId);
      if (t) set("tutar", Number(t.kalan_tutar));
    }
  };

  // Seçili taksitin kalan tutarı
  const seciliTaksit = form.gider_taksit_id ? taksitler.find(x => x.id === form.gider_taksit_id) : null;
  const maxTutar = seciliTaksit ? Number(seciliTaksit.kalan_tutar) : undefined;
  const isKismiOdeme = maxTutar !== undefined && form.tutar > 0 && form.tutar < maxTutar;
  const selectedYontem = odemeYontemleri.find(o => o.id === form.odeme_yontemi_id);
  const selectedHesap = maliHesaplar.find(m => m.id === form.mali_hesap_id);
  const masrafVisible = islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);

  return (
    <div className="mt-5 bg-gradient-to-br from-emerald-50/50 to-blue-50/30 border border-emerald-200/60 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <h4 className="text-[13px] font-semibold text-gray-800">Ödeme Yap</h4>
          <span className="text-[11px] text-gray-400 ml-1">Tutarı düzenleyerek kısmi ödeme yapabilirsiniz</span>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {taksitler.length > 0 && (
          <FormField label="Taksit">
            <select value={form.gider_taksit_id || ""} onChange={e => handleTaksitChange(e.target.value ? Number(e.target.value) : null)}
              className={`${selectCls} bg-white`}>
              <option value="">Genel Ödeme</option>
              {taksitler.map(t => <option key={t.id} value={t.id}>Taksit {t.taksit_no} — {Number(t.kalan_tutar).toLocaleString("tr-TR")} ₺ kalan</option>)}
            </select>
          </FormField>
        )}
        <FormField label="İşlem Tutarı" required>
          <div className="relative">
            <input type="number" step="any" min="0.01"
              max={maxTutar}
              required value={form.tutar || ""}
              onChange={e => set("tutar", parseFloat(e.target.value) || 0)}
              className={`${inputCls} bg-white pr-8`}
              placeholder={maxTutar ? `Max: ${maxTutar.toLocaleString("tr-TR")} ₺` : ""}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">₺</span>
          </div>
          {isKismiOdeme && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-amber-600">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Kısmi ödeme — kalan {(maxTutar! - form.tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ sonraki ödemede tahsil edilecek
            </div>
          )}
          {maxTutar !== undefined && (
            <div className="flex gap-2 mt-1.5">
              <button type="button" onClick={() => set("tutar", maxTutar)}
                className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors">
                Tamamını Öde ({maxTutar.toLocaleString("tr-TR")} ₺)
              </button>
              <button type="button" onClick={() => set("tutar", Math.round(maxTutar / 2 * 100) / 100)}
                className="text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors">
                Yarısını Öde ({(maxTutar / 2).toLocaleString("tr-TR")} ₺)
              </button>
            </div>
          )}
        </FormField>
        <FormField label="Mali Hesap" required>
          <select required value={form.mali_hesap_id || ""} onChange={e => {
              const id = Number(e.target.value);
              setForm(f => ({ ...f, mali_hesap_id: id, odeme_yontemi_id: 0, ...EMPTY_ISLEM_MASRAFI }));
            }}
            className={`${selectCls} bg-white`}>
            <option value="">Seçiniz</option>
            {maliHesaplar.map(m => <option key={m.id} value={m.id}>{m.ad}</option>)}
          </select>
        </FormField>
        <FormField label="Ödeme Yöntemi" required>
          <select required disabled={!form.mali_hesap_id} value={form.odeme_yontemi_id || ""} onChange={e => setForm(f => ({ ...f, odeme_yontemi_id: Number(e.target.value), ...EMPTY_ISLEM_MASRAFI }))}
            className={`${selectCls} bg-white`}>
            <option value="">{form.mali_hesap_id ? "Seçiniz" : "Önce mali hesap seçin"}</option>
            {filtreliOdemeYontemleri.map(o => (
              <option key={o.id} value={o.id}>
                {formatOdemeYontemiLabel(o, { hideMaliHesap: true })}
              </option>
            ))}
          </select>
        </FormField>
        <div className="md:col-span-2">
          <IslemMasrafiFields
            visible={masrafVisible}
            form={form}
            onChange={(patch) => setForm(f => ({ ...f, ...patch }))}
          />
        </div>
        <FormField label="Ödeme Tarihi" required>
          <input type="date" required value={form.odeme_tarihi} onChange={e => set("odeme_tarihi", e.target.value)}
            className={`${inputCls} bg-white`} />
        </FormField>
        <FormField label="Açıklama">
          <input type="text" value={form.aciklama || ""} onChange={e => set("aciklama", e.target.value)}
            placeholder="Opsiyonel not" className={`${inputCls} bg-white`} />
        </FormField>
        <div className="md:col-span-2 flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-white/80 rounded-xl transition-all duration-200">
            Vazgeç
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 rounded-xl shadow-lg shadow-emerald-600/25 transition-all duration-200">
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Kaydediliyor...
              </span>
            ) : "Ödemeyi Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ═══ InfoRow helper ════════════════════════════════════════════
function GInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 font-medium mb-0.5">{label}</div>
      <div className="text-[13px] text-gray-800 font-medium">{value}</div>
    </div>
  );
}
