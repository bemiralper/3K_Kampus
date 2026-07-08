"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { useKurum } from "@/lib/contexts/KurumContext";
import { financialAccountService } from "@/app/finans/services/finans-api";
import { odemeTakipBridge } from "@/app/finans/services/odeme-takip-bridge";
import "./odeme-takip.css";

import { Sozlesme, TahsilatItem, OdemeYontemi, IndirimTuru, DashboardOzet, TabType, TahsilatFormData, Taksit, OgrenciRiskSkoru } from "./types";
import { API_BASE, formatCurrency, durumLabel, postHeaders, apiHeaders, parseApiError } from "./helpers";
import { STATUS_CONFIRM_MESSAGES } from "@/lib/sozlesme-notlar";

import SozlesmelerTab from "./tabs/SozlesmelerTab";
import TahsilatlarTab from "./tabs/TahsilatlarTab";
import RaporlarTab from "./tabs/RaporlarTab";
import TahsilatMakbuzu from "./components/TahsilatMakbuzu";
import OdemePlani from "./components/OdemePlani";
import SozlesmeBelgesi from "./components/SozlesmeBelgesi";
import FesihModal from "./components/FesihModal";
import FesihBelgesi from "./components/FesihBelgesi";
import OdemeNotifySendModal, { formatNotifySentToast } from "@/components/odeme-takip/OdemeNotifySendModal";
import type { OdemeNotifyType } from "@/lib/odeme-notify-api";

// ─── SVG Icons ──────────────────────────────────────────────

const IconSozlesme = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconTahsilat = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconRapor = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

// ─── Component ──────────────────────────────────────────────────

export default function OdemeTakipClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { basePath, href } = useOdemePath();
  const { portalHomeHref } = useOgrenciPath();
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const [activeTab, setActiveTab] = useState<TabType>("sozlesmeler");
  const [loading, setLoading] = useState(true);

  // Sözleşme
  const [sozlesmeler, setSozlesmeler] = useState<Sozlesme[]>([]);
  const [selectedSozlesme, setSelectedSozlesme] = useState<Sozlesme | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Raporlar
  const [vadesiGecenler, setVadesiGecenler] = useState<Taksit[]>([]);

  // Tahsilat tab
  const [tahsilatlar, setTahsilatlar] = useState<TahsilatItem[]>([]);

  // Raporlar tab
  const [dashboard, setDashboard] = useState<DashboardOzet | null>(null);
  const [riskSkorlari, setRiskSkorlari] = useState<OgrenciRiskSkoru[]>([]);

  // Parametrik
  const [odemeYontemleri, setOdemeYontemleri] = useState<OdemeYontemi[]>([]);
  /** Tahsilat drawer — mali hesaba göre API'den yenilenir (plan-canonical filtre hatasını önler). */
  const [tahsilatOdemeYontemleri, setTahsilatOdemeYontemleri] = useState<OdemeYontemi[]>([]);
  const [indirimTurleri, setIndirimTurleri] = useState<IndirimTuru[]>([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip: string }[]>([]);

  // Drawers & Modals
  const [showTahsilatDrawer, setShowTahsilatDrawer] = useState(false);
  const [tahsilatForm, setTahsilatForm] = useState<TahsilatFormData>({
    sozlesme_id: "", taksit_id: "", odeme_yontemi_id: "", tutar: "", tahsilat_tarihi: "", referans_no: "", aciklama: "",
    cek_senet_no: "", banka_adi: "", cek_senet_vade: "", cek_senet_durum: "portfoyde",
  });
  const [showIptalModal, setShowIptalModal] = useState(false);
  const [iptalTahsilatId, setIptalTahsilatId] = useState<number | null>(null);
  const [iptalNeden, setIptalNeden] = useState("");
  const [iptalHata, setIptalHata] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusSozlesmeId, setStatusSozlesmeId] = useState<number | null>(null);
  const [statusYeniDurum, setStatusYeniDurum] = useState("");
  const [statusAciklama, setStatusAciklama] = useState("");
  const [statusConfirmAck, setStatusConfirmAck] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteSozlesmeId, setDeleteSozlesmeId] = useState<number | null>(null);
  const [makbuzTahsilatId, setMakbuzTahsilatId] = useState<number | null>(null);
  const [odemePlaniSozlesmeId, setOdemePlaniSozlesmeId] = useState<number | null>(null);
  const [sozlesmeBelgesiId, setSozlesmeBelgesiId] = useState<number | null>(null);
  const [fesihModalSozlesme, setFesihModalSozlesme] = useState<{ id: number; no: string; ogrenciAdi: string } | null>(null);
  const [fesihBelgesiSozlesmeId, setFesihBelgesiSozlesmeId] = useState<number | null>(null);
  const [dagitimSonuc, setDagitimSonuc] = useState<{ toplam: number; dagitim: { taksit_no: number | null; tutar: number }[]; tahsilatId?: number | null } | null>(null);
  const [notifyState, setNotifyState] = useState<{
    notifyType: OdemeNotifyType;
    sozlesmeId?: number;
    tahsilatId?: number;
    studentName?: string;
  } | null>(null);
  const [notifyToast, setNotifyToast] = useState<string | null>(null);

  const openWhatsAppNotify = useCallback((
    notifyType: OdemeNotifyType,
    ids: { sozlesmeId?: number; tahsilatId?: number },
    studentName?: string,
  ) => {
    setNotifyState({
      notifyType,
      sozlesmeId: ids.sozlesmeId,
      tahsilatId: ids.tahsilatId,
      studentName,
    });
  }, []);

  // ─── Fetch Functions ────────────────────────────────────────

  const fetchSozlesmeler = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/`, {
        credentials: "include",
        headers: apiHeaders(),
      });
      const data = await res.json();
      setSozlesmeler(Array.isArray(data) ? data : []);
    } catch { setSozlesmeler([]); }
  }, []);

  const fetchSozlesmeDetail = useCallback(async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${id}/`, {
        credentials: "include",
        headers: apiHeaders(),
      });
      const data = await res.json();
      setSelectedSozlesme(data);
      return data;
    } catch { return null; }
  }, []);

  const openSozlesmeDetail = useCallback((id: number) => {
    router.push(`${basePath}?sozlesme=${id}`, { scroll: false });
  }, [router, basePath]);

  const closeSozlesmeDetail = useCallback(() => {
    router.push(basePath, { scroll: false });
  }, [router, basePath]);

  const sozlesmeParam = searchParams.get("sozlesme");
  const prevSubeIdRef = useRef<number | null>(null);

  // Şube değişince önceki şubenin tüm verilerini temizle (ilk yüklemede ?sozlesme= korunur)
  useEffect(() => {
    if (!activeSube?.id) return;
    const prev = prevSubeIdRef.current;
    prevSubeIdRef.current = activeSube.id;
    if (prev === null || prev === activeSube.id) return;

    setSelectedSozlesme(null);
    setSozlesmeler([]);
    setTahsilatlar([]);
    setVadesiGecenler([]);
    setDashboard(null);
    setRiskSkorlari([]);
    setSearchTerm("");
    setShowTahsilatDrawer(false);
    setShowIptalModal(false);
    setShowStatusModal(false);
    setShowDeleteModal(false);
    setMakbuzTahsilatId(null);
    setOdemePlaniSozlesmeId(null);
    setSozlesmeBelgesiId(null);
    setFesihModalSozlesme(null);
    setFesihBelgesiSozlesmeId(null);
    setDagitimSonuc(null);
    setNotifyState(null);
    if (sozlesmeParam) {
      router.push(basePath, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca şube değişiminde sıfırla
  }, [activeSube?.id]);

  useEffect(() => {
    const parsed = sozlesmeParam ? Number.parseInt(sozlesmeParam, 10) : NaN;
    if (sozlesmeParam && !Number.isNaN(parsed)) {
      if (selectedSozlesme?.id !== parsed) {
        void fetchSozlesmeDetail(parsed);
      }
      setActiveTab("sozlesmeler");
      return;
    }
    if (!sozlesmeParam && selectedSozlesme) {
      setSelectedSozlesme(null);
    }
  }, [sozlesmeParam, fetchSozlesmeDetail, selectedSozlesme?.id]);

  const fetchTahsilatlar = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/tahsilatlar/`, {
        credentials: "include",
        headers: apiHeaders(),
      });
      const data = await res.json();
      setTahsilatlar(Array.isArray(data) ? data : []);
    } catch { setTahsilatlar([]); }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/`, {
        credentials: "include",
        headers: apiHeaders(),
      });
      const data = await res.json();
      setDashboard(data);
    } catch { setDashboard(null); }
  }, []);

  const fetchVadesiGecenler = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/taksitler/vadesi-gecenler/`, {
        credentials: "include",
        headers: apiHeaders(),
      });
      const data = await res.json();
      setVadesiGecenler(Array.isArray(data) ? data : []);
    } catch { setVadesiGecenler([]); }
  }, []);

  const fetchRiskSkorlari = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/risk-skorlari/`, {
        credentials: "include",
        headers: apiHeaders(),
      });
      const data = await res.json();
      setRiskSkorlari(Array.isArray(data) ? data : []);
    } catch { setRiskSkorlari([]); }
  }, []);

  const fetchParametrik = useCallback(async () => {
    try {
      const [osRes, itRes] = await Promise.all([
        fetch(`${API_BASE}/odeme-sekilleri/`, { credentials: "include", headers: apiHeaders() }),
        fetch(`${API_BASE}/indirim-turleri/`, { credentials: "include", headers: apiHeaders() }),
      ]);
      const osData = await osRes.json();
      const itData = await itRes.json();
      setOdemeYontemleri(Array.isArray(osData) ? osData : []);
      setIndirimTurleri(Array.isArray(itData) ? itData : []);
    } catch {}
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchSozlesmeler(), fetchParametrik()]);
      setLoading(false);
    };
    load();
  }, [fetchSozlesmeler, fetchParametrik, activeSube?.id, activeEgitimYili?.id]);

  useEffect(() => {
    if (!activeKurum?.id || !activeSube?.id) return;
    financialAccountService
      .dropdownByKurum(activeKurum.id, activeSube.id)
      .then((res) => setMaliHesaplar(res.mali_hesaplar || []))
      .catch(() => setMaliHesaplar([]));
  }, [activeKurum?.id, activeSube?.id]);

  useEffect(() => {
    if (!showTahsilatDrawer) return;
    const maliId = tahsilatForm.mali_hesap_id ? Number(tahsilatForm.mali_hesap_id) : null;
    odemeTakipBridge
      .odemeSekilleri(maliId)
      .then((list) => {
        setTahsilatOdemeYontemleri(Array.isArray(list) ? list : []);
      })
      .catch(() => setTahsilatOdemeYontemleri([]));
  }, [showTahsilatDrawer, tahsilatForm.mali_hesap_id]);

  useEffect(() => {
    if (!showTahsilatDrawer || !tahsilatForm.odeme_yontemi_id) return;
    const exists = tahsilatOdemeYontemleri.some(
      (o) => String(o.id) === String(tahsilatForm.odeme_yontemi_id),
    );
    if (!exists) {
      setTahsilatForm((prev) => ({ ...prev, odeme_yontemi_id: "" }));
    }
  }, [showTahsilatDrawer, tahsilatForm.odeme_yontemi_id, tahsilatOdemeYontemleri]);

  useEffect(() => {
    if (activeTab === "tahsilatlar") fetchTahsilatlar();
    if (activeTab === "raporlar") {
      fetchDashboard();
      fetchVadesiGecenler();
      fetchRiskSkorlari();
    }
  }, [activeTab, activeSube?.id, activeEgitimYili?.id, fetchTahsilatlar, fetchDashboard, fetchVadesiGecenler, fetchRiskSkorlari]);

  useEffect(() => {
    if (!activeSube?.id) return;
    fetchTahsilatlar();
    fetchDashboard();
    fetchVadesiGecenler();
    fetchRiskSkorlari();
  }, [activeSube?.id, activeEgitimYili?.id, fetchTahsilatlar, fetchDashboard, fetchVadesiGecenler, fetchRiskSkorlari]);

  // ─── Actions ────────────────────────────────────────────────

  const handleStatusChangeOpen = (sozlesmeId: number, yeniDurum: string) => {
    if (yeniDurum === "feshedilmis") {
      const s = sozlesmeler.find((s) => s.id === sozlesmeId);
      if (s) {
        setFesihModalSozlesme({
          id: sozlesmeId,
          no: s.sozlesme_no,
          ogrenciAdi: s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}` : "",
        });
      }
      return;
    }
    setStatusSozlesmeId(sozlesmeId);
    setStatusYeniDurum(yeniDurum);
    setStatusAciklama("");
    setStatusConfirmAck(false);
    setShowStatusModal(true);
  };

  const handleFesihComplete = async () => {
    await fetchSozlesmeler();
    if (selectedSozlesme) await fetchSozlesmeDetail(selectedSozlesme.id);
    setFesihModalSozlesme(null);
  };

  const handleKalemChanged = async () => {
    await fetchSozlesmeler();
    if (selectedSozlesme) await fetchSozlesmeDetail(selectedSozlesme.id);
  };

  const handleStatusChange = async () => {
    if (!statusSozlesmeId || !statusYeniDurum) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${statusSozlesmeId}/status/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({ yeni_durum: statusYeniDurum, aciklama: statusAciklama }),
      });
      if (res.ok) {
        await fetchSozlesmeler();
        if (selectedSozlesme?.id === statusSozlesmeId) await fetchSozlesmeDetail(statusSozlesmeId);
        setShowStatusModal(false);
        setStatusAciklama("");
        setStatusConfirmAck(false);
      } else {
        const err = await res.json();
        alert(err.error || "Hata oluştu");
      }
    } catch { alert("Bağlantı hatası"); }
    setSaving(false);
  };

  const handleStatusRevert = async (sozlesmeId: number) => {
    if (!window.confirm("Son durum değişikliğini geri almak istediğinize emin misiniz?")) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/status/revert/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchSozlesmeler();
        if (selectedSozlesme?.id === sozlesmeId) await fetchSozlesmeDetail(sozlesmeId);
      } else {
        const err = await res.json();
        alert(err.error || "Geri alma başarısız");
      }
    } catch { alert("Bağlantı hatası"); }
    setSaving(false);
  };

  const handleTahsilatStart = (form: TahsilatFormData) => {
    const sozlesme = selectedSozlesme?.id === Number(form.sozlesme_id)
      ? selectedSozlesme
      : sozlesmeler.find((s) => s.id === Number(form.sozlesme_id));
    const taksit = sozlesme?.taksitler?.find((t) => t.id === Number(form.taksit_id));
    const defaultMali = form.mali_hesap_id || "";
    const defaultYontem =
      form.odeme_yontemi_id ||
      (taksit?.odeme_yontemi_id ? String(taksit.odeme_yontemi_id) : "") ||
      (sozlesme?.odeme_yontemi_id ? String(sozlesme.odeme_yontemi_id) : "") ||
      (sozlesme?.odeme_yontemi?.id ? String(sozlesme.odeme_yontemi.id) : "");
    setTahsilatForm({
      ...form,
      mali_hesap_id: defaultMali,
      odeme_yontemi_id: defaultYontem,
    });
    setShowTahsilatDrawer(true);
  };

  const handleTahsilatCreate = async () => {
    setSaving(true);
    try {
      const selectedYontem = tahsilatOdemeYontemleri.find((o) => String(o.id) === tahsilatForm.odeme_yontemi_id);
      const isCekSenet = selectedYontem?.tip === "cek" || selectedYontem?.tip === "senet";
      const payload: Record<string, unknown> = {
        sozlesme_id: Number(tahsilatForm.sozlesme_id),
        taksit_id: tahsilatForm.taksit_id ? Number(tahsilatForm.taksit_id) : null,
        odeme_yontemi_id: Number(tahsilatForm.odeme_yontemi_id),
        mali_hesap_id: tahsilatForm.mali_hesap_id ? Number(tahsilatForm.mali_hesap_id) : null,
        tutar: Number(tahsilatForm.tutar),
        tahsilat_tarihi: tahsilatForm.tahsilat_tarihi,
        referans_no: tahsilatForm.referans_no,
        aciklama: tahsilatForm.aciklama,
      };
      if (isCekSenet && tahsilatForm.cek_senet_no) {
        payload.cek_senet_detay = {
          cek_senet_no: tahsilatForm.cek_senet_no,
          banka_adi: tahsilatForm.banka_adi || "",
          vade_tarihi: tahsilatForm.cek_senet_vade || null,
          durum: tahsilatForm.cek_senet_durum || "portfoyde",
        };
      }
      const res = await fetch(`${API_BASE}/tahsilatlar/create/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const tahsilatData = await res.json();
        setShowTahsilatDrawer(false);
        setTahsilatForm({
          sozlesme_id: "", taksit_id: "", odeme_yontemi_id: "", tutar: "", tahsilat_tarihi: "", referans_no: "", aciklama: "",
          cek_senet_no: "", banka_adi: "", cek_senet_vade: "", cek_senet_durum: "portfoyde",
        });
        await fetchTahsilatlar();
        if (selectedSozlesme) await fetchSozlesmeDetail(selectedSozlesme.id);
        await fetchSozlesmeler();

        if (tahsilatData?.dagitim && tahsilatData.dagitim.length > 1) {
          setDagitimSonuc({
            toplam: Number(tahsilatForm.tutar),
            dagitim: tahsilatData.dagitim,
            tahsilatId: tahsilatData.id || null,
          });
        } else {
          if (tahsilatData?.id) {
            setMakbuzTahsilatId(tahsilatData.id);
          }
        }
      } else {
        const err = await res.json();
        alert(Object.values(err).flat().join(", ") || "Hata oluştu");
      }
    } catch { alert("Bağlantı hatası"); }
    setSaving(false);
  };

  const handleTahsilatCancelOpen = (tahsilatId: number) => {
    setIptalTahsilatId(tahsilatId);
    setIptalNeden("");
    setIptalHata(null);
    setShowIptalModal(true);
  };

  const handleDeleteOpen = (sozlesmeId: number) => {
    setDeleteSozlesmeId(sozlesmeId);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteSozlesmeId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${deleteSozlesmeId}/delete/`, {
        method: "DELETE",
        headers: postHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        setShowDeleteModal(false);
        setDeleteSozlesmeId(null);
        closeSozlesmeDetail();
        await fetchSozlesmeler();
      } else {
        const err = await res.json();
        alert(err.error || "Silme işlemi başarısız");
      }
    } catch { alert("Bağlantı hatası"); }
    setSaving(false);
  };

  const handleTahsilatCancel = async () => {
    if (!iptalTahsilatId) return;
    const neden = iptalNeden.trim();
    if (neden.length < 3) {
      setIptalHata("İptal nedeni en az 3 karakter olmalıdır.");
      return;
    }
    setSaving(true);
    setIptalHata(null);
    try {
      const res = await fetch(`${API_BASE}/tahsilatlar/${iptalTahsilatId}/cancel/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({ neden }),
      });
      if (res.ok) {
        setShowIptalModal(false);
        setIptalNeden("");
        setIptalTahsilatId(null);
        await fetchTahsilatlar();
        if (selectedSozlesme) await fetchSozlesmeDetail(selectedSozlesme.id);
        await fetchSozlesmeler();
      } else {
        let message = "Tahsilat iptal edilemedi";
        try {
          message = parseApiError(await res.json(), message);
        } catch {
          message = res.status === 403
            ? "Bu işlem için yetkiniz yok veya oturum süresi dolmuş olabilir."
            : `Tahsilat iptal edilemedi (HTTP ${res.status})`;
        }
        setIptalHata(message);
      }
    } catch {
      setIptalHata("Bağlantı hatası — sunucuya ulaşılamadı.");
    }
    setSaving(false);
  };

  // ─── Tabs ───────────────────────────────────────────────────

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "sozlesmeler", label: "Sözleşmeler", icon: <IconSozlesme /> },
    { key: "tahsilatlar", label: "Tahsilatlar", icon: <IconTahsilat /> },
    { key: "raporlar", label: "Raporlar", icon: <IconRapor /> },
  ];

  if (loading) {
    return (
      <div className="odeme-loading">
        <div style={{ textAlign: "center" }}>
          <div className="odeme-spinner" />
          <p style={{ marginTop: 16, color: "var(--text-muted)" }}>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      {/* ─── Hero Header ──────────────────────────────── */}
      <div className="odeme-hero">
        <div className="odeme-hero-content">
          <div className="odeme-hero-icon">💳</div>
          <div>
            <h1>Sözleşme/Tahsilat</h1>
            <div className="odeme-hero-breadcrumb">
              <a href={portalHomeHref}>Ana Sayfa</a>
              <span>/</span>
              <span>Sözleşme/Tahsilat</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tabs (Modern Pill Style) ─────────────────── */}
      <div className="tabs-modern">
        {tabs.map((tab) => (
          <a
            key={tab.key}
            className={`tab-modern ${activeTab === tab.key ? "active" : ""}`}
            onClick={(e) => { e.preventDefault(); setActiveTab(tab.key); }}
            href="#"
          >
            {tab.icon}
            {tab.label}
            {tab.key === "sozlesmeler" && sozlesmeler.length > 0 && (
              <span className="tab-count">{sozlesmeler.length}</span>
            )}
            {tab.key === "tahsilatlar" && tahsilatlar.length > 0 && (
              <span className="tab-count">{tahsilatlar.length}</span>
            )}
          </a>
        ))}
      </div>

      {/* ─── Tab Content ──────────────────────────────── */}
      {activeTab === "sozlesmeler" && (
        <SozlesmelerTab
          sozlesmeler={sozlesmeler}
          selectedSozlesme={selectedSozlesme}
          searchTerm={searchTerm}
          odemeYontemleri={odemeYontemleri}
          setSearchTerm={setSearchTerm}
          onSelectSozlesme={openSozlesmeDetail}
          onCloseDetail={closeSozlesmeDetail}
          onStatusChange={handleStatusChangeOpen}
          onStatusRevert={handleStatusRevert}
          onTahsilatStart={handleTahsilatStart}
          onTahsilatCancel={handleTahsilatCancelOpen}
          onDelete={handleDeleteOpen}
          onMakbuz={(id) => setMakbuzTahsilatId(id)}
          onOdemePlani={(id) => setOdemePlaniSozlesmeId(id)}
          onSozlesmeBelgesi={(id) => setSozlesmeBelgesiId(id)}
          onFesihBelgesi={(id) => setFesihBelgesiSozlesmeId(id)}
          onEdit={(id) => router.push(`${href("sozlesme-olustur")}?edit=${id}`)}
          onKalemChanged={handleKalemChanged}
          onWhatsAppPlan={(id, name) => openWhatsAppNotify("plan", { sozlesmeId: id }, name)}
          onWhatsAppSozlesme={(id, name) => openWhatsAppNotify("sozlesme", { sozlesmeId: id }, name)}
          onWhatsAppMakbuz={(id, name) => openWhatsAppNotify("makbuz", { tahsilatId: id }, name)}
        />
      )}
      {activeTab === "tahsilatlar" && (
        <TahsilatlarTab
          tahsilatlar={tahsilatlar}
          onTahsilatCancel={handleTahsilatCancelOpen}
          onMakbuz={(id) => setMakbuzTahsilatId(id)}
        />
      )}
      {activeTab === "raporlar" && (
        <RaporlarTab
          dashboard={dashboard}
          vadesiGecenler={vadesiGecenler}
          riskSkorlari={riskSkorlari}
        />
      )}

      {/* ══════ Modals & Drawers ══════════════════════════ */}

      {/* Tahsilat Drawer */}
      {showTahsilatDrawer && (
        <>
          <div className="odeme-drawer-overlay" onClick={() => setShowTahsilatDrawer(false)} />
          <div className="odeme-drawer">
            <div className="odeme-drawer-header">
              <h3>💰 Tahsilat Kaydı</h3>
              <button className="odeme-drawer-close" onClick={() => setShowTahsilatDrawer(false)}>✕</button>
            </div>
            <div className="odeme-drawer-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="odeme-form-group">
                  <label className="odeme-form-label">Mali Hesap (Kasa / Banka)</label>
                  <select
                    className="odeme-form-control"
                    value={tahsilatForm.mali_hesap_id || ""}
                    onChange={(e) => setTahsilatForm({ ...tahsilatForm, mali_hesap_id: e.target.value, odeme_yontemi_id: "" })}
                  >
                    <option value="">Seçiniz (boş bırakılırsa ödeme yönteminin hesabı kullanılır)</option>
                    {maliHesaplar.map((m) => (
                      <option key={m.id} value={m.id}>{m.ad} ({m.tip === "kasa" ? "Kasa" : m.tip === "banka" ? "Banka" : m.tip})</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    Paranın giriş yaptığı kasa/banka hesabıdır — Gün Sonu ve kasa bakiyesi bu seçime göre güncellenir. Seçim yaparsanız aşağıdaki ödeme yöntemi listesi bu hesaba göre filtrelenir.
                  </div>
                </div>

                <div className="odeme-form-group">
                  <label className="odeme-form-label">Ödeme Yöntemi *</label>
                  <select
                    className="odeme-form-control"
                    value={tahsilatForm.odeme_yontemi_id}
                    onChange={(e) => setTahsilatForm({ ...tahsilatForm, odeme_yontemi_id: e.target.value })}
                  >
                    <option value="">Seçin</option>
                    {tahsilatOdemeYontemleri
                      .filter((o) => o.aktif_mi !== false)
                      .map((o) => (
                        <option key={o.id} value={o.id}>{o.ad}</option>
                      ))}
                  </select>
                </div>

                {(() => {
                  const sel = tahsilatOdemeYontemleri.find((o) => String(o.id) === tahsilatForm.odeme_yontemi_id);
                  const isCekSenet = sel?.tip === "cek" || sel?.tip === "senet";
                  if (!isCekSenet) return null;
                  return (
                    <div style={{ padding: 14, borderRadius: 10, background: "#f0f7ff", border: "1px solid #bfdbfe" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 10 }}>
                        {sel?.tip === "cek" ? "Çek" : "Senet"} Bilgileri
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div className="odeme-form-group">
                          <label className="odeme-form-label">{sel?.tip === "cek" ? "Çek No" : "Senet No"} *</label>
                          <input
                            className="odeme-form-control"
                            value={tahsilatForm.cek_senet_no || ""}
                            onChange={(e) => setTahsilatForm({ ...tahsilatForm, cek_senet_no: e.target.value })}
                          />
                        </div>
                        <div className="odeme-form-group">
                          <label className="odeme-form-label">Banka Adı</label>
                          <input
                            className="odeme-form-control"
                            value={tahsilatForm.banka_adi || ""}
                            onChange={(e) => setTahsilatForm({ ...tahsilatForm, banka_adi: e.target.value })}
                          />
                        </div>
                        <div className="odeme-form-group">
                          <label className="odeme-form-label">Vade Tarihi</label>
                          <input
                            className="odeme-form-control"
                            type="date"
                            value={tahsilatForm.cek_senet_vade || ""}
                            onChange={(e) => setTahsilatForm({ ...tahsilatForm, cek_senet_vade: e.target.value })}
                          />
                        </div>
                        <div className="odeme-form-group">
                          <label className="odeme-form-label">Durum</label>
                          <select
                            className="odeme-form-control"
                            value={tahsilatForm.cek_senet_durum || "portfoyde"}
                            onChange={(e) => setTahsilatForm({ ...tahsilatForm, cek_senet_durum: e.target.value })}
                          >
                            <option value="portfoyde">Portföyde</option>
                            <option value="tahsil">Tahsil Edildi</option>
                            <option value="karsiliksiz">Karşılıksız</option>
                            <option value="iptal">İptal</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="odeme-form-group">
                  <label className="odeme-form-label">İşlem Tutarı (₺) *</label>
                  <input
                    className="odeme-form-control"
                    type="number"
                    step="1"
                    value={tahsilatForm.tutar}
                    onChange={(e) => setTahsilatForm({ ...tahsilatForm, tutar: e.target.value })}
                  />
                  {(() => {
                    if (!tahsilatForm.taksit_id || !tahsilatForm.tutar) return null;
                    const secilenTaksit = selectedSozlesme?.taksitler?.find(t => t.id === Number(tahsilatForm.taksit_id));
                    if (!secilenTaksit) return null;
                    const tutar = Number(tahsilatForm.tutar);
                    const fazla = tutar - secilenTaksit.kalan_tutar;
                    if (fazla > 0) {
                      return (
                        <div className="odeme-preview" style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, color: "#1e40af" }}>
                            ℹ️ Taksit {secilenTaksit.taksit_no} kalan tutarı <strong>{formatCurrency(secilenTaksit.kalan_tutar)}</strong>.
                            Fazla ödeme <strong>{formatCurrency(fazla)}</strong> sonraki taksitlere otomatik dağıtılacaktır.
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="odeme-form-group">
                  <label className="odeme-form-label">Tahsilat Tarihi *</label>
                  <input
                    className="odeme-form-control"
                    type="date"
                    value={tahsilatForm.tahsilat_tarihi}
                    onChange={(e) => setTahsilatForm({ ...tahsilatForm, tahsilat_tarihi: e.target.value })}
                  />
                </div>

                <div className="odeme-form-group">
                  <label className="odeme-form-label">Referans No</label>
                  <input
                    className="odeme-form-control"
                    type="text"
                    value={tahsilatForm.referans_no}
                    onChange={(e) => setTahsilatForm({ ...tahsilatForm, referans_no: e.target.value })}
                    placeholder="Dekont / makbuz no"
                  />
                </div>

                <div className="odeme-form-group">
                  <label className="odeme-form-label">Açıklama</label>
                  <textarea
                    className="odeme-form-control"
                    value={tahsilatForm.aciklama}
                    onChange={(e) => setTahsilatForm({ ...tahsilatForm, aciklama: e.target.value })}
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                </div>
              </div>
            </div>
            <div className="odeme-drawer-footer">
              <button className="btn-modern btn-secondary" style={{ flex: 1 }} onClick={() => setShowTahsilatDrawer(false)}>İptal</button>
              <button
                className="btn-modern btn-primary"
                style={{ flex: 1 }}
                onClick={handleTahsilatCreate}
                disabled={saving}
              >{saving ? "Kaydediliyor..." : "💰 Tahsil Et"}</button>
            </div>
          </div>
        </>
      )}

      {/* İptal Modal */}
      {showIptalModal && (
        <>
          <div className="odeme-modal-overlay" onClick={() => { setShowIptalModal(false); setIptalNeden(""); setIptalTahsilatId(null); setIptalHata(null); }} />
          <div className="odeme-modal odeme-modal-sm">
            <h3 style={{ color: "#dc2626" }}>⚠️ Tahsilat İptal</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Bu tahsilatı iptal etmek istediğinize emin misiniz? Lütfen iptal nedenini belirtin.</p>
            <textarea
              className="odeme-form-control"
              value={iptalNeden}
              onChange={(e) => { setIptalNeden(e.target.value); setIptalHata(null); }}
              placeholder="İptal nedeni..."
              rows={3}
              style={{ marginBottom: 8, resize: "vertical" }}
            />
            {iptalHata && (
              <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>{iptalHata}</p>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-modern btn-secondary" style={{ flex: 1 }} onClick={() => { setShowIptalModal(false); setIptalNeden(""); setIptalTahsilatId(null); setIptalHata(null); }}>Vazgeç</button>
              <button
                className="btn-modern"
                style={{ flex: 1, background: "#dc2626", color: "#fff" }}
                onClick={handleTahsilatCancel}
                disabled={saving || iptalNeden.trim().length < 3}
              >{saving ? "İşleniyor..." : "İptal Et"}</button>
            </div>
          </div>
        </>
      )}

      {/* Status Modal */}
      {showStatusModal && (
        <>
          <div className="odeme-modal-overlay" onClick={() => setShowStatusModal(false)} />
          <div className="odeme-modal odeme-modal-sm">
            <h3>
              {STATUS_CONFIRM_MESSAGES[statusYeniDurum]?.title || "Statü Değişikliği"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
              {STATUS_CONFIRM_MESSAGES[statusYeniDurum]?.body || (
                <>
                  Sözleşmeyi <strong>{durumLabel[statusYeniDurum]?.label || statusYeniDurum}</strong> durumuna almak üzeresiniz.
                  Devam etmek istiyor musunuz?
                </>
              )}
            </p>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={statusConfirmAck}
                onChange={(e) => setStatusConfirmAck(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>Bu işlemin sonuçlarını anladım ve devam etmek istiyorum.</span>
            </label>
            <textarea
              className="odeme-form-control"
              value={statusAciklama}
              onChange={(e) => setStatusAciklama(e.target.value)}
              placeholder="Açıklama (opsiyonel)..."
              rows={3}
              style={{ marginBottom: 16, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-modern btn-secondary" style={{ flex: 1 }} onClick={() => setShowStatusModal(false)}>Vazgeç</button>
              <button
                className="btn-modern"
                style={{ flex: 1, background: durumLabel[statusYeniDurum]?.color || "#2563eb", color: "#fff" }}
                onClick={handleStatusChange}
                disabled={saving || !statusConfirmAck}
              >{saving ? "İşleniyor..." : "Onayla"}</button>
            </div>
          </div>
        </>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <>
          <div className="odeme-modal-overlay" onClick={() => { setShowDeleteModal(false); setDeleteSozlesmeId(null); }} />
          <div className="odeme-modal odeme-modal-md">
            <h3 style={{ color: "#dc2626" }}>🗑️ Sözleşme Silme</h3>
            <div style={{ padding: 14, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#991b1b", lineHeight: 1.6 }}>
                <strong>⚠️ Dikkat!</strong> Bu işlem geri alınamaz.<br />
                Sözleşme, tüm taksit planları ve kalemler kalıcı olarak silinecektir.
              </p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-modern btn-secondary" style={{ flex: 1 }} onClick={() => { setShowDeleteModal(false); setDeleteSozlesmeId(null); }}>Vazgeç</button>
              <button
                className="btn-modern"
                style={{ flex: 1, background: "#dc2626", color: "#fff" }}
                onClick={handleDelete}
                disabled={saving}
              >{saving ? "Siliniyor..." : "Evet, Sil"}</button>
            </div>
          </div>
        </>
      )}

      {/* Makbuz Modal */}
      {makbuzTahsilatId && (
        <TahsilatMakbuzu
          tahsilatId={makbuzTahsilatId}
          onClose={() => setMakbuzTahsilatId(null)}
          onWhatsApp={() => {
            const s = selectedSozlesme?.ogrenci
              ? `${selectedSozlesme.ogrenci.ad} ${selectedSozlesme.ogrenci.soyad}`.trim()
              : undefined;
            openWhatsAppNotify("makbuz", { tahsilatId: makbuzTahsilatId }, s);
          }}
        />
      )}

      {/* Ödeme Planı Modal */}
      {odemePlaniSozlesmeId && (
        <OdemePlani
          sozlesmeId={odemePlaniSozlesmeId}
          onClose={() => setOdemePlaniSozlesmeId(null)}
          onWhatsApp={() => {
            const s = selectedSozlesme?.ogrenci
              ? `${selectedSozlesme.ogrenci.ad} ${selectedSozlesme.ogrenci.soyad}`.trim()
              : undefined;
            openWhatsAppNotify("plan", { sozlesmeId: odemePlaniSozlesmeId }, s);
          }}
        />
      )}

      {/* Sözleşme Belgesi Modal */}
      {sozlesmeBelgesiId && (
        <SozlesmeBelgesi
          sozlesmeId={sozlesmeBelgesiId}
          onClose={() => setSozlesmeBelgesiId(null)}
          onWhatsApp={() => {
            const s = selectedSozlesme?.ogrenci
              ? `${selectedSozlesme.ogrenci.ad} ${selectedSozlesme.ogrenci.soyad}`.trim()
              : undefined;
            openWhatsAppNotify("sozlesme", { sozlesmeId: sozlesmeBelgesiId }, s);
          }}
        />
      )}

      {notifyState && (
        <OdemeNotifySendModal
          notifyType={notifyState.notifyType}
          sozlesmeId={notifyState.sozlesmeId}
          tahsilatId={notifyState.tahsilatId}
          studentName={notifyState.studentName}
          onClose={() => setNotifyState(null)}
          onSent={(sent, details) => {
            setNotifyToast(formatNotifySentToast(sent, details));
            setTimeout(() => setNotifyToast(null), 6000);
          }}
        />
      )}

      {notifyToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 4000,
          maxWidth: 420, padding: "12px 16px", borderRadius: 10,
          background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46",
          fontSize: 13, lineHeight: 1.5, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}>
          {notifyToast}
        </div>
      )}

      {/* Fesih Modal */}
      {fesihModalSozlesme && (
        <FesihModal
          sozlesmeId={fesihModalSozlesme.id}
          sozlesmeNo={fesihModalSozlesme.no}
          ogrenciAdi={fesihModalSozlesme.ogrenciAdi}
          onClose={() => setFesihModalSozlesme(null)}
          onFesihComplete={handleFesihComplete}
        />
      )}

      {/* Fesih Belgesi Modal */}
      {fesihBelgesiSozlesmeId && (
        <FesihBelgesi sozlesmeId={fesihBelgesiSozlesmeId} onClose={() => setFesihBelgesiSozlesmeId(null)} />
      )}

      {/* Dağıtım Sonuç Modalı */}
      {dagitimSonuc && (
        <>
          <div className="odeme-modal-overlay" onClick={() => setDagitimSonuc(null)} />
          <div className="odeme-modal odeme-modal-md" style={{ padding: 0, overflow: "hidden" }}>
            <div className="dagitim-header">
              <div className="dagitim-icon">✓</div>
              <h3>Tahsilat Başarıyla Kaydedildi</h3>
              <p>Ödeme birden fazla taksit arasında dağıtıldı</p>
            </div>

            <div style={{ padding: "16px 24px 0" }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 16px", background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0",
              }}>
                <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>Toplam Tahsilat</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{formatCurrency(dagitimSonuc.toplam)}</span>
              </div>
            </div>

            <div style={{ padding: "16px 24px" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", margin: "0 0 10px" }}>Ödeme Dağıtımı</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dagitimSonuc.dagitim.map((d: any, i: number) => {
                  const isEmanet = !d.taksit_no;
                  return (
                    <div key={i} className={`dagitim-item ${isEmanet ? "emanet" : ""}`}>
                      <div className="dagitim-item-left">
                        <div className="dagitim-item-num" style={{ background: isEmanet ? "#f59e0b" : "#0262a7" }}>
                          {isEmanet ? "₺" : d.taksit_no}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                            {isEmanet ? "Emanet (Fazla Ödeme)" : `Taksit ${d.taksit_no}`}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            {isEmanet ? "Sonraki taksitlerde kullanılabilir" : "Ödeme uygulandı"}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: isEmanet ? "#b45309" : "#059669" }}>
                        {formatCurrency(Number(d.tutar))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: "0 24px 20px", display: "flex", gap: 10 }}>
              {dagitimSonuc.tahsilatId && (
                <button
                  className="btn-modern btn-success"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => {
                    const tid = dagitimSonuc.tahsilatId!;
                    setDagitimSonuc(null);
                    setMakbuzTahsilatId(tid);
                  }}
                >🧾 Makbuz Yazdır</button>
              )}
              <button
                className="btn-modern btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setDagitimSonuc(null)}
              >Tamam</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
