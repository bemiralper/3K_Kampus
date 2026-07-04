"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import GelirKaydiDrawer from "@/components/finans/GelirKaydiDrawer";
import GelirKayitTable from "@/components/finans/GelirKayitTable";
import TahsilatDrawer from "@/components/finans/TahsilatDrawer";
import { EMPTY_ISLEM_MASRAFI, buildIslemMasrafiPayload } from "@/app/finans/types/islem-masrafi-types";
import { FinansDrawerButton } from "@/components/finans/FinansFormDrawer";
import "@/components/finans/finans-drawer.css";
import { FinansHttpError } from "../services/finans-http";
import { gelirKaydiService, gelirTahsilatService, GelirTahsilatItem, gelirKategoriService } from "../services/gelir-api";
import { cariHesapService } from "../services/cari-hesap-api";
import { paymentMethodService, financialAccountService } from "../services/finans-api";
import {
  GelirKaydiListItem, GelirKaydiDetail,
  GelirKaydiCreatePayload, GelirOzet,
  GELIR_DURUMLARI,
} from "../types/gelir-types";
import { CariHesapDropdownItem, cariTabGorunur } from "../types/cari-hesap-types";
import type { GelirKategorisiTreeItem } from "../types/gelir-kategori-types";

/* ═══════════════════════════════════════════════════════════════
   Gelir Yönetimi — Gelir Kayıt Listesi + CRUD + Onay / İptal
   ═══════════════════════════════════════════════════════════════ */

const KDV_ORANLARI_GELIR = [
  { value: 0,  label: "KDV Yok (%0)" },
  { value: 1,  label: "%1" },
  { value: 10, label: "%10" },
  { value: 20, label: "%20" },
];

function validateGelirForm(form: GelirKaydiCreatePayload): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.cari_hesap_id) errs.cari_hesap_id = "Cari hesap seçiniz.";
  if (!form.gelir_kategorisi_id) errs.gelir_kategorisi_id = "Kategori seçiniz.";
  if (!form.mali_hesap_id) errs.mali_hesap_id = "Mali hesap seçiniz.";
  if (!form.odeme_yontemi_id) errs.odeme_yontemi_id = "Ödeme türü seçiniz (Nakit, POS, Çek vb.).";
  if (!form.fatura_tarihi) errs.fatura_tarihi = "Fatura tarihi zorunludur.";
  if (!form.vade_tarihi) errs.vade_tarihi = "Vade tarihi zorunludur.";
  if (!form.brut_tutar || Number(form.brut_tutar) <= 0) errs.brut_tutar = "Net tutar sıfırdan büyük olmalıdır.";
  return errs;
}

/* ═══ Yardımcılar ═══ */
function fmtTutar(v: number | string | undefined | null) {
  return Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ═══ Ana Bileşen ═══ */

interface GelirlerClientProps {
  embedded?: boolean;
  onCariHesapClick?: (cariHesapId: number) => void;
  onDataChange?: () => void;
}

export default function GelirlerClient({ embedded, onCariHesapClick, onDataChange }: GelirlerClientProps = {}) {
  const { homeHref, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube } = useKurum();
  const kurumId = activeKurum?.id;

  // Listeleme
  const [gelirler, setGelirler] = useState<GelirKaydiListItem[]>([]);
  const [ozet, setOzet] = useState<GelirOzet | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [durumFiltre, setDurumFiltre] = useState("");
  const [aramaFiltre, setAramaFiltre] = useState("");

  // Drawer / Form
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState<GelirKaydiDetail | null>(null);
  const [editId, setEditId] = useState<number | null>(null);

  // Toast
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Dropdown
  const [cariHesaplar, setCariHesaplar] = useState<CariHesapDropdownItem[]>([]);
  const [flatKategoriler, setFlatKategoriler] = useState<{ id: number; label: string }[]>([]);

  // Form state
  const emptyForm: GelirKaydiCreatePayload = {
    kurum_id: 0,
    cari_hesap_id: 0,
    gelir_kategorisi_id: 0,
    fatura_tarihi: new Date().toISOString().slice(0, 10),
    vade_tarihi: new Date().toISOString().slice(0, 10),
    brut_tutar: 0,
    kdv_orani: 20,
  };
  const [form, setForm] = useState<GelirKaydiCreatePayload>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formGeneralError, setFormGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Tahsilat
  const [showTahsilatDrawer, setShowTahsilatDrawer] = useState(false);
  const [tahsilatGelirId, setTahsilatGelirId] = useState<number | null>(null);
  const [tahsilatGelirKalan, setTahsilatGelirKalan] = useState(0);
  const [tahsilatlar, setTahsilatlar] = useState<GelirTahsilatItem[]>([]);
  const [tahsilatForm, setTahsilatForm] = useState({
    odeme_yontemi_id: 0,
    mali_hesap_id: 0,
    tutar: "",
    tahsilat_tarihi: new Date().toISOString().slice(0, 10),
    aciklama: "",
    ...EMPTY_ISLEM_MASRAFI,
  });
  const [tahsilatFieldErrors, setTahsilatFieldErrors] = useState<Record<string, string>>({});
  const [tahsilatGeneralError, setTahsilatGeneralError] = useState<string | null>(null);
  const [tahsilatSaving, setTahsilatSaving] = useState(false);

  // Dropdown: Ödeme yöntemleri & Mali hesaplar
  const [odemeYontemleri, setOdemeYontemleri] = useState<
    { id: number; ad: string; tip: string; mali_hesap_id: number }[]
  >([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip?: string }[]>([]);

  /* ─── Fetch ───────────────────────────────────── */
  const fetchList = useCallback(async () => {
    if (!kurumId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { kurum_id: String(kurumId) };
      if (activeSube?.id) params.sube_id = String(activeSube.id);
      if (durumFiltre) params.durum = durumFiltre;
      if (aramaFiltre) params.arama = aramaFiltre;
      const data = await gelirKaydiService.list(params);
      setGelirler(data);
    } catch {
      setError("Gelir kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, activeSube, durumFiltre, aramaFiltre]);

  const fetchOzet = useCallback(async () => {
    if (!kurumId) return;
    try {
      const params: Record<string, string> = { kurum_id: String(kurumId) };
      if (activeSube?.id) params.sube_id = String(activeSube.id);
      const data = await gelirKaydiService.ozet(params);
      setOzet(data);
    } catch {}
  }, [kurumId, activeSube]);

  useEffect(() => {
    fetchList();
    if (!embedded) fetchOzet();
  }, [fetchList, fetchOzet, embedded]);

  /* ─── Dropdown Fetch ──────────────────────────── */
  useEffect(() => {
    if (!kurumId) return;
    const params: Record<string, string> = { kurum_id: String(kurumId) };
    if (activeSube?.id) params.sube_id = String(activeSube.id);
    cariHesapService.dropdown(params)
      .then(setCariHesaplar)
      .catch(() => {});
    paymentMethodService
      .dropdown(kurumId, undefined, activeSube?.id)
      .then((r) => setOdemeYontemleri(r.odeme_yontemleri || []))
      .catch(() => {});
    financialAccountService
      .dropdownByKurum(kurumId, activeSube?.id)
      .then((r) => setMaliHesaplar(r.mali_hesaplar || []))
      .catch(() => {});
    if (activeSube?.id) {
      gelirKategoriService.tree(kurumId, activeSube.id)
        .then((res) => {
          const flat: { id: number; label: string }[] = [];
          (res.kategoriler || []).forEach((ana: GelirKategorisiTreeItem) => {
            flat.push({ id: ana.id, label: ana.ad });
            (ana.alt_kategoriler || []).forEach((alt) => {
              flat.push({ id: alt.id, label: `${ana.ad} › ${alt.ad}` });
            });
          });
          setFlatKategoriler(flat);
        })
        .catch(() => setFlatKategoriler([]));
    } else {
      setFlatKategoriler([]);
    }
  }, [kurumId, activeSube]);

  /* ─── Toast helpers ───────────────────────────── */
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 3500); return () => clearTimeout(t); } }, [success]);
  useEffect(() => { if (error)   { const t = setTimeout(() => setError(""), 5000);   return () => clearTimeout(t); } }, [error]);

  /* ─── Handlers ────────────────────────────────── */
  function openNewForm() {
    setEditId(null);
    setForm({ ...emptyForm, kurum_id: kurumId || 0, sube_id: activeSube?.id });
    setFormErrors({});
    setFormGeneralError(null);
    setShowForm(true);
  }

  async function openEditForm(id: number) {
    try {
      const detail = await gelirKaydiService.get(id);
      setEditId(id);
      setForm({
        kurum_id: detail.kurum_id,
        cari_hesap_id: detail.cari_hesap_id,
        gelir_kategorisi_id: detail.gelir_kategorisi_id || 0,
        sube_id: detail.sube_id,
        mali_hesap_id: detail.mali_hesap_id,
        odeme_yontemi_id: detail.odeme_yontemi_id,
        egitim_yili_id: detail.egitim_yili_id,
        fatura_no: detail.fatura_no || "",
        fatura_tarihi: detail.fatura_tarihi,
        vade_tarihi: detail.vade_tarihi,
        aciklama: detail.aciklama || "",
        brut_tutar: detail.brut_tutar,
        kdv_orani: detail.kdv_orani,
      });
      setFormErrors({});
      setFormGeneralError(null);
      setShowForm(true);
    } catch {
      setError("Gelir kaydı bilgisi alınamadı.");
    }
  }

  async function handleSave() {
    const clientErrs = validateGelirForm(form);
    if (Object.keys(clientErrs).length > 0) {
      setFormErrors(clientErrs);
      setFormGeneralError("Lütfen zorunlu alanları doldurun.");
      return;
    }

    setSaving(true);
    setFormErrors({});
    setFormGeneralError(null);
    try {
      const payload = { ...form, brut_tutar: brutTutarGelir };
      if (editId) {
        await gelirKaydiService.update(editId, payload as any);
        setSuccess("Gelir kaydı güncellendi.");
      } else {
        await gelirKaydiService.create(payload);
        setSuccess("Gelir kaydı oluşturuldu.");
      }
      setShowForm(false);
      fetchList();
      fetchOzet();
      onDataChange?.();
    } catch (err: unknown) {
      if (err instanceof FinansHttpError) {
        if (Object.keys(err.fieldErrors).length) setFormErrors(err.fieldErrors);
        setFormGeneralError(err.message);
      } else {
        setFormGeneralError(err instanceof Error ? err.message : "Kayıt sırasında hata oluştu.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Gelir kaydını silmek istediğinize emin misiniz?")) return;
    try {
      await gelirKaydiService.delete(id);
      setSuccess("Gelir kaydı silindi.");
      setDetailItem(null);
      fetchList();
      fetchOzet();
      onDataChange?.();
    } catch (err: any) {
      setError(err.message || "Silinemedi.");
    }
  }

  async function handleIptal(id: number) {
    if (!confirm("Gelir kaydını iptal etmek istediğinize emin misiniz?")) return;
    try {
      await gelirKaydiService.iptal(id);
      setSuccess("Gelir kaydı iptal edildi.");
      setDetailItem(null);
      fetchList();
      fetchOzet();
      onDataChange?.();
    } catch (err: any) {
      setError(err.message || "İptal başarısız.");
    }
  }

  async function handleOpenDetail(id: number) {
    try {
      const detail = await gelirKaydiService.get(id);
      setDetailItem(detail);
      // Tahsilatları da yükle
      try {
        const tList = await gelirTahsilatService.list(id);
        setTahsilatlar(tList);
      } catch {
        setTahsilatlar([]);
      }
    } catch {
      setError("Detay yüklenemedi.");
    }
  }

  /* ─── Tahsilat Handlers ───────────────────────── */
  function openTahsilatDrawer(
    gelirId: number,
    kalanTutar: number,
    defaults?: { mali_hesap_id?: number | null; odeme_yontemi_id?: number | null },
  ) {
    setTahsilatGelirId(gelirId);
    setTahsilatGelirKalan(kalanTutar);
    setTahsilatForm({
      odeme_yontemi_id: defaults?.odeme_yontemi_id || 0,
      mali_hesap_id: defaults?.mali_hesap_id || maliHesaplar[0]?.id || 0,
      tutar: String(kalanTutar),
      tahsilat_tarihi: new Date().toISOString().slice(0, 10),
      aciklama: "",
      ...EMPTY_ISLEM_MASRAFI,
    });
    setTahsilatFieldErrors({});
    setShowTahsilatDrawer(true);
  }

  async function handleTahsilatSubmit() {
    setTahsilatFieldErrors({});
    setTahsilatGeneralError(null);
    const clientErrs: Record<string, string> = {};
    if (!tahsilatForm.odeme_yontemi_id) clientErrs.odeme_yontemi_id = "Ödeme yöntemi seçiniz.";
    if (!tahsilatForm.mali_hesap_id) clientErrs.mali_hesap_id = "Mali hesap seçiniz.";
    if (!tahsilatForm.tutar || Number(tahsilatForm.tutar) <= 0) clientErrs.tutar = "Tutar giriniz.";
    else if (Number(tahsilatForm.tutar) > tahsilatGelirKalan) {
      clientErrs.tutar = `Tutar kalan tutardan (${fmtTutar(tahsilatGelirKalan)} ₺) fazla olamaz.`;
    }
    if (Object.keys(clientErrs).length > 0) {
      setTahsilatFieldErrors(clientErrs);
      setTahsilatGeneralError("Lütfen zorunlu alanları doldurun.");
      return;
    }
    if (!tahsilatGelirId) return;
    setTahsilatSaving(true);
    try {
      const masraf = buildIslemMasrafiPayload(tahsilatForm);
      await gelirTahsilatService.create(tahsilatGelirId, {
        gelir_kaydi_id: tahsilatGelirId,
        odeme_yontemi_id: tahsilatForm.odeme_yontemi_id,
        mali_hesap_id: tahsilatForm.mali_hesap_id,
        tutar: Number(tahsilatForm.tutar),
        tahsilat_tarihi: tahsilatForm.tahsilat_tarihi,
        aciklama: tahsilatForm.aciklama || undefined,
        ...masraf,
      });
      setSuccess("Tahsilat başarıyla kaydedildi.");
      setShowTahsilatDrawer(false);
      fetchList();
      fetchOzet();
      onDataChange?.();
      // Eğer detay açıksa güncelle
      if (detailItem && detailItem.id === tahsilatGelirId) {
        handleOpenDetail(tahsilatGelirId);
      }
    } catch (err: unknown) {
      if (err instanceof FinansHttpError) {
        setTahsilatFieldErrors(err.fieldErrors);
        setTahsilatGeneralError(err.message);
      } else {
        setTahsilatGeneralError(err instanceof Error ? err.message : "Tahsilat kaydedilemedi.");
      }
      setError(err instanceof Error ? err.message : "Tahsilat kaydedilemedi.");
    } finally {
      setTahsilatSaving(false);
    }
  }

  async function handleTahsilatIptal(tahsilatId: number) {
    if (!confirm("Bu tahsilatı iptal etmek istediğinize emin misiniz?")) return;
    try {
      await gelirTahsilatService.iptal(tahsilatId);
      setSuccess("Tahsilat iptal edildi.");
      fetchList();
      fetchOzet();
      onDataChange?.();
      // Detayı güncelle
      if (detailItem) {
        handleOpenDetail(detailItem.id);
      }
    } catch (err: any) {
      setError(err.message || "Tahsilat iptal edilemedi.");
    }
  }

  /* ─── Filtreleme ──────────────────────────────── */
  const filteredGelirler = gelirler.filter((g) => {
    if (aramaFiltre) {
      const q = aramaFiltre.toLowerCase();
      const match =
        g.cari_hesap_adi?.toLowerCase().includes(q) ||
        g.aciklama?.toLowerCase().includes(q) ||
        g.fatura_no?.toLowerCase().includes(q) ||
        g.kategori_adi?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  /* ─── KDV Hesaplama (Net giriliyor → Brüt ters hesaplanır) ─── */
  const netTutarGirilen = form.brut_tutar || 0; // form alanı brut_tutar ama kullanıcı net giriyor
  const kdvOraniGelir = form.kdv_orani || 0;
  const brutTutarGelir = kdvOraniGelir > 0
    ? Math.round((netTutarGirilen / (1 + kdvOraniGelir / 100)) * 100) / 100
    : netTutarGirilen;
  const kdvTutar = Math.round((netTutarGirilen - brutTutarGelir) * 100) / 100;
  const netTutar = netTutarGirilen;

  const gelirCariHesaplar = useMemo(
    () => cariHesaplar.filter((c) => cariTabGorunur("gelirler", c.hesap_turu)),
    [cariHesaplar],
  );

  const seciliCariHesap = gelirCariHesaplar.find((t) => t.id === form.cari_hesap_id)
    ?? cariHesaplar.find((t) => t.id === form.cari_hesap_id);
  const cariHesapKategoriIds = seciliCariHesap?.gelir_kategorileri ?? [];
  const filtrelenmisKategoriler = form.cari_hesap_id
    ? (cariHesapKategoriIds.length > 0
        ? flatKategoriler.filter((k) => cariHesapKategoriIds.includes(k.id))
        : flatKategoriler)
    : [];

  const handleCariHesapChange = (cariHesapId: number) => {
    setForm((f) => {
      const updated = { ...f, cari_hesap_id: cariHesapId };
      if (cariHesapId) {
        const hesap = gelirCariHesaplar.find((t) => t.id === cariHesapId)
          ?? cariHesaplar.find((t) => t.id === cariHesapId);
        if (hesap?.gelir_kategorileri?.length) {
          updated.gelir_kategorisi_id = hesap.gelir_kategorileri[0];
        } else {
          updated.gelir_kategorisi_id = 0;
        }
      } else {
        updated.gelir_kategorisi_id = 0;
      }
      return updated;
    });
  };

  /* ═══ RENDER ═══ */
  return (
    <div className="space-y-6">
      {/* ─── Başlık ─── */}
      {!embedded && (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Gelir İşlemleri</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Gelir İşlemleri</span>
              </div>
            </div>
          </div>
          <div className="hero-actions">
            <button onClick={openNewForm} className="btn-hero">
              <span className="btn-hero-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>Yeni Gelir Kaydı</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Quick Stats ─── */}
      {!embedded && ozet && (
        <div className="quick-stats">
          <div className="quick-stat">
            <div className="quick-stat-icon blue">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{fmtTutar(ozet.toplam_gelir)} ₺</h4>
              <span>Toplam Gelir</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{fmtTutar(ozet.toplam_tahsil)} ₺</h4>
              <span>Tahsil Edilen</span>
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
            <div className="quick-stat-icon red">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.tahsil_edilmemis_sayi}</h4>
              <span>Tahsil Edilmemiş</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toolbar ─── */}
      <div className="card-modern">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Arama */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari, açıklama, fatura no veya kategori..."
                value={aramaFiltre}
                onChange={(e) => setAramaFiltre(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 w-[260px]"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Durum filtre */}
            <select
              value={durumFiltre}
              onChange={(e) => setDurumFiltre(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
            >
              <option value="">Tüm Durumlar</option>
              {GELIR_DURUMLARI.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {embedded && (
            <button onClick={openNewForm} className="btn-hero text-[13px] px-4 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Yeni Gelir
            </button>
          )}
        </div>

        {/* ─── Tablo ─── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Yükleniyor...
          </div>
        ) : filteredGelirler.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            <h3>Gelir kaydı bulunamadı</h3>
            <p>Yeni bir gelir kaydı ekleyerek başlayabilirsiniz.</p>
          </div>
        ) : (
          <GelirKayitTable
            items={filteredGelirler}
            fmtTutar={fmtTutar}
            fmtTarih={fmtTarih}
            onCariHesapClick={onCariHesapClick}
            onDetail={handleOpenDetail}
            onTahsilat={(id, kalan) => {
              const g = filteredGelirler.find((x) => x.id === id);
              const oy = odemeYontemleri.find((o) => o.id === g?.odeme_yontemi_id);
              openTahsilatDrawer(id, kalan, {
                mali_hesap_id: oy?.mali_hesap_id,
                odeme_yontemi_id: g?.odeme_yontemi_id,
              });
            }}
            onEdit={openEditForm}
            onDelete={handleDelete}
          />
        )}
      </div>

      <GelirKaydiDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        editId={editId}
        form={form}
        setForm={setForm}
        formErrors={formErrors}
        formGeneralError={formGeneralError}
        saving={saving}
        onSave={handleSave}
        cariHesaplar={gelirCariHesaplar}
        kategoriler={filtrelenmisKategoriler}
        onCariHesapChange={handleCariHesapChange}
        maliHesaplar={maliHesaplar}
        brutTutar={brutTutarGelir}
        kdvTutar={kdvTutar}
        kdvOrani={kdvOraniGelir}
        fmtTutar={fmtTutar}
        odemeYontemleri={odemeYontemleri}
      />

      {/* ═══ Detay Drawer ═══ */}
      {detailItem && (
        <>
          <div className="fd-overlay" onClick={() => setDetailItem(null)} aria-hidden />
          <div className="fd-panel fd-panel--wide fd-panel--gelir" role="dialog" aria-modal="true">
            <header className="fd-header">
              <div className="fd-header-row">
                <span className="fd-badge fd-badge--gelir">Gelir</span>
                <button type="button" className="fd-close" onClick={() => setDetailItem(null)} aria-label="Kapat">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <h2 className="fd-title fd-title--entity">{detailItem.cari_hesap_adi}</h2>
              <p className="fd-subtitle fd-subtitle--meta">
                {detailItem.fatura_no ? (
                  <>Fatura No: <span className="fd-mono">{detailItem.fatura_no}</span></>
                ) : (
                  "Belgesiz kayıt"
                )}
              </p>
            </header>

            <div className="fd-body">
              <div className="fd-detail-actions">
                {(() => {
                  const dm = GELIR_DURUMLARI.find((d) => d.value === detailItem.durum);
                  return <span className={`fd-chip fd-chip--neutral ${dm?.color || ""}`}>{detailItem.durum_display}</span>;
                })()}
                {detailItem.iptal_edilebilir_mi && (
                  <button type="button" onClick={() => handleIptal(detailItem.id)} className="fd-chip fd-chip--rose" style={{ cursor: "pointer", border: "none" }}>
                    İptal Et
                  </button>
                )}
              </div>

              <div className="fd-detail-kpi-grid">
                <div className="fd-detail-kpi">
                  <div className="fd-detail-kpi-label">Net Tutar</div>
                  <div className="fd-detail-kpi-value">{fmtTutar(detailItem.net_tutar)} ₺</div>
                </div>
                <div className="fd-detail-kpi fd-detail-kpi--emerald">
                  <div className="fd-detail-kpi-label">Tahsil Edilen</div>
                  <div className="fd-detail-kpi-value">{fmtTutar(detailItem.tahsil_edilen)} ₺</div>
                </div>
                <div className="fd-detail-kpi fd-detail-kpi--rose">
                  <div className="fd-detail-kpi-label">Kalan</div>
                  <div className="fd-detail-kpi-value">{fmtTutar(detailItem.kalan_tutar)} ₺</div>
                </div>
              </div>

              <div className="fd-progress-card">
                <div className="fd-progress-head">
                  <span className="fd-progress-label">Tahsilat İlerlemesi</span>
                  <span className="fd-progress-pct">%{Math.round(detailItem.tahsilat_yuzdesi)}</span>
                </div>
                <div className="fd-progress-track">
                  <div className="fd-progress-fill" style={{ width: `${Math.min(detailItem.tahsilat_yuzdesi, 100)}%` }} />
                </div>
              </div>

              {(detailItem.durum === "onaylandi" || detailItem.durum === "kismi_tahsil") && detailItem.kalan_tutar > 0 && (
                <FinansDrawerButton
                  type="button"
                  tone="emerald"
                  className="fd-btn--full"
                  onClick={() =>
                    openTahsilatDrawer(detailItem.id, detailItem.kalan_tutar, {
                      mali_hesap_id: detailItem.mali_hesap_id,
                      odeme_yontemi_id: detailItem.odeme_yontemi_id,
                    })
                  }
                >
                  Tahsilat Yap ({fmtTutar(detailItem.kalan_tutar)} ₺ kalan)
                </FinansDrawerButton>
              )}

              {tahsilatlar.length > 0 && (
                <div className="fd-list-card">
                  <div className="fd-list-header">
                    <h3 className="fd-list-title">Tahsilatlar ({tahsilatlar.length})</h3>
                    <span className="fd-chip fd-chip--emerald">
                      Toplam: {fmtTutar(tahsilatlar.filter(t => t.durum === "odendi").reduce((s, t) => s + Number(t.tutar), 0))} ₺
                    </span>
                  </div>
                  {tahsilatlar.map((t) => (
                    <div key={t.id} className="fd-list-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtTutar(t.tutar)} ₺</span>
                          <span className={`fd-chip ${t.durum === "odendi" ? "fd-chip--emerald" : "fd-chip--rose"}`}>{t.durum_display}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94a3b8" }}>
                          <span>{fmtTarih(t.tahsilat_tarihi)}</span>
                          {t.odeme_yontemi_adi && <span>{t.odeme_yontemi_adi}</span>}
                          {t.mali_hesap_adi && <span>• {t.mali_hesap_adi}</span>}
                        </div>
                        {t.aciklama && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.aciklama}</div>}
                      </div>
                      {t.durum === "odendi" && (
                        <button type="button" onClick={() => handleTahsilatIptal(t.id)} className="fd-action-link fd-action-link--rose" title="Tahsilatı İptal Et">
                          İptal
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="fd-section">
                <h3 className="fd-section-title">Kayıt Bilgileri</h3>
                <div className="fd-row-2">
                  <GInfoRow label="Cari Hesap" value={detailItem.cari_hesap_adi} />
                  {detailItem.kategori_adi && (
                    <GInfoRow label="Gelir Kategorisi" value={detailItem.kategori_adi} />
                  )}
                  <GInfoRow label="Fatura No" value={detailItem.fatura_no} mono />
                  <GInfoRow label="Fatura Tarihi" value={fmtTarih(detailItem.fatura_tarihi)} />
                  <GInfoRow label="Vade Tarihi" value={fmtTarih(detailItem.vade_tarihi)} />
                  <GInfoRow label="Brüt Tutar" value={`${fmtTutar(detailItem.brut_tutar)} ₺`} />
                  <GInfoRow label={`KDV (%${detailItem.kdv_orani})`} value={`${fmtTutar(detailItem.kdv_tutar)} ₺`} />
                  {detailItem.sube_adi && <GInfoRow label="Şube" value={detailItem.sube_adi} />}
                  {detailItem.mali_hesap_adi && <GInfoRow label="Mali Hesap" value={detailItem.mali_hesap_adi} />}
                  {detailItem.odeme_yontemi_adi && <GInfoRow label="Ödeme Yöntemi" value={detailItem.odeme_yontemi_adi} />}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="fd-field" style={{ marginBottom: 0 }}>
                    <div className="fd-label" style={{ marginBottom: 4 }}>Açıklama</div>
                    <div className="fd-detail-kpi-value" style={{ fontSize: 14, marginTop: 0, minHeight: "1.25em" }}>
                      {(detailItem.aciklama || "").trim()}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#94a3b8" }}>
                {detailItem.olusturan_adi && <span>Oluşturan: {detailItem.olusturan_adi}</span>}
                <span>Tarih: {fmtTarih(detailItem.created_at)}</span>
              </div>
            </div>

            <footer className="fd-footer">
              <button type="button" onClick={() => handleDelete(detailItem.id)} className="fd-action-link fd-action-link--rose">
                Sil
              </button>
              <div style={{ display: "flex", gap: 10, flex: 1, justifyContent: "flex-end" }}>
                {detailItem.duzenlenebilir_mi && (
                  <FinansDrawerButton type="button" tone="emerald" onClick={() => { setDetailItem(null); openEditForm(detailItem.id); }}>
                    Düzenle
                  </FinansDrawerButton>
                )}
                <FinansDrawerButton type="button" variant="ghost" onClick={() => setDetailItem(null)}>
                  Kapat
                </FinansDrawerButton>
              </div>
            </footer>
          </div>
        </>
      )}

      <TahsilatDrawer
        open={showTahsilatDrawer && !!tahsilatGelirId}
        onClose={() => setShowTahsilatDrawer(false)}
        kalanTutar={tahsilatGelirKalan}
        fmtTutar={fmtTutar}
        form={tahsilatForm}
        setForm={setTahsilatForm}
        fieldErrors={tahsilatFieldErrors}
        generalError={tahsilatGeneralError}
        saving={tahsilatSaving}
        onSubmit={handleTahsilatSubmit}
        odemeYontemleri={odemeYontemleri}
        maliHesaplar={maliHesaplar}
      />

      {/* ═══ Toast ═══ */}
      {(success || error) && (
        <div className="fixed bottom-6 right-6 z-[250] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl ${
            success
              ? "bg-emerald-50/95 border-emerald-200 text-emerald-700"
              : "bg-rose-50/95 border-rose-200 text-rose-700"
          }`}>
            {success ? (
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
              <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            <span className="text-[13px] font-semibold">{success || error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ GInfoRow Helper ═══ */
function GInfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="fd-field" style={{ marginBottom: 0 }}>
      <div className="fd-label" style={{ marginBottom: 4 }}>{label}</div>
      <div className={`fd-detail-kpi-value${mono ? " font-mono" : ""}`} style={{ fontSize: 14, marginTop: 0 }}>
        {value || "—"}
      </div>
    </div>
  );
}
