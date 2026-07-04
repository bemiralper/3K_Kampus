"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import UnsavedChangesModal from "@/components/UnsavedChangesModal";
import { apiGet } from "@/lib/api";
import { useKurum } from "@/lib/contexts/KurumContext";
import { API_BASE, formatCurrency, formatDate, postHeaders, apiHeaders, taksitPeriyoduLabel, odemeTuruTaksitPlaniMi } from "../helpers";
import {
  addMonths,
  buildEqualTaksitRows,
  clampTaksitSayisi,
  defaultEgitimYiliBitis,
  rowsMatchEqualPlan,
  type ManuelTaksitRow,
} from "../utils/taksitPlan";
import type { Veli } from "../types";
import { buildTaksitOdemeYontemleri, isCekSenetYontem } from "@/lib/finans/paymentMethodUtils";

const KURUM_COLOR = "#0262a7";

/* ───────── Interfaces ───────── */
interface EgitimPaketi {
  id: number;
  paket_turu: string;
  paket_turu_label: string;
  paket_id: number;
  paket_adi: string;
  fiyat: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_fiyat: number;
}

interface EkHizmet {
  id: number;
  ek_hizmet_id: number;
  ad: string;
  hizmet_turu: string;
  fiyat: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_fiyat: number;
}

interface DahilHizmet {
  id: number;
  ek_hizmet_id: number;
  ad: string;
  hizmet_turu: string;
  kaynak_paket_turu: string;
  kaynak_paket_id: number | null;
  deneme_paket_id: number | null;
  fiyat?: number;
  kdv_orani?: number;
  kdv_dahil_fiyat?: number;
}

interface Kayit {
  id: number;
  kurum_id: number;
  kurum_adi: string;
  sube_id: number;
  sube_adi: string;
  islem_sube_id?: number;
  islem_sube_adi?: string;
  egitim_yili_id: number;
  egitim_yili_adi: string;
  sinif: string;
  kayit_tarihi: string | null;
}

interface OdemeYontemiDropdown {
  id: number;
  ad: string;
  tip: string;
  mali_hesap_id: number;
}

interface MaliHesapDropdown {
  id: number;
  ad: string;
  tip: string;
}

interface KalemRow {
  key: string;
  kalem_turu: "paket" | "ek_hizmet";
  paket_turu?: string;
  kalem_id: number;
  kalem_adi: string;
  brut_tutar: number;
  kdv_orani: number;
  indirim_orani: number;
  kdv_haric: number;
  kdv_tutari: number;
  indirim_tutari: number;
  net_tutar: number;
}

interface TaksitPreview {
  taksit_no: number;
  vade_tarihi: string;
  tutar: number;
}

/* ───────── Kalem Hesaplama (Tam sayı — kuruş yok) ───────── */
// brut_tutar = KDV dahil liste fiyatı; net_tutar = indirim sonrası ödenecek (KDV dahil)
function hesaplaKalem(brut: number, kdvOrani: number, indirimOrani: number, indirimTutari?: number) {
  let kdvHaric: number;
  let kdv: number;
  if (kdvOrani === 0) {
    kdvHaric = brut;
    kdv = 0;
  } else {
    kdvHaric = Math.round(brut / (1 + kdvOrani / 100) / 100) * 100;
    kdv = brut - kdvHaric;
  }
  let ind: number;
  if (indirimTutari !== undefined && indirimTutari >= 0) {
    ind = Math.round(indirimTutari);
  } else {
    ind = Math.round(brut * indirimOrani / 100);
  }
  const net = Math.max(0, brut - ind);
  const oran = brut > 0 ? Math.round(ind / brut * 10000) / 100 : 0;
  return {
    kdv_haric: kdvHaric,
    kdv_tutari: kdv,
    indirim_tutari: ind,
    indirim_orani: oran,
    net_tutar: net,
  };
}

function mergeKalemRow(
  rowKey: string,
  base: { kalem_turu: "paket" | "ek_hizmet"; kalem_id: number; kalem_adi: string; fiyat: number; kdv_orani: number; paket_turu?: string },
  prev?: KalemRow,
): KalemRow {
  const brut = prev?.brut_tutar ?? base.fiyat;
  const kdvO = prev?.kdv_orani ?? base.kdv_orani;
  let calc;
  if (prev) {
    if (prev.indirim_tutari > 0) {
      calc = hesaplaKalem(brut, kdvO, 0, prev.indirim_tutari);
    } else if (prev.net_tutar > 0 && prev.net_tutar < brut) {
      calc = hesaplaKalem(brut, kdvO, 0, brut - prev.net_tutar);
    } else if (prev.indirim_orani > 0) {
      calc = hesaplaKalem(brut, kdvO, prev.indirim_orani);
    } else {
      calc = hesaplaKalem(brut, kdvO, 0);
    }
  } else {
    calc = hesaplaKalem(brut, kdvO, 0);
  }
  return {
    key: rowKey,
    kalem_turu: base.kalem_turu,
    paket_turu: base.paket_turu,
    kalem_id: base.kalem_id,
    kalem_adi: base.kalem_adi,
    brut_tutar: brut,
    kdv_orani: kdvO,
    indirim_orani: calc.indirim_orani,
    kdv_haric: calc.kdv_haric,
    kdv_tutari: calc.kdv_tutari,
    indirim_tutari: calc.indirim_tutari,
    net_tutar: calc.net_tutar,
  };
}

function finalizeKalemPayload(k: KalemRow) {
  const indirim = k.indirim_tutari > 0
    ? Math.round(k.indirim_tutari)
    : Math.max(0, Math.round(k.brut_tutar - k.net_tutar));
  const net = k.net_tutar > 0
    ? Math.round(k.net_tutar)
    : Math.max(0, Math.round(k.brut_tutar - indirim));
  return {
    kalem_turu: k.kalem_turu,
    kalem_id: k.kalem_id,
    kalem_adi: k.kalem_adi,
    brut_tutar: Math.round(k.brut_tutar),
    kdv_orani: k.kdv_orani,
    indirim_orani: k.indirim_orani,
    indirim_tutari: indirim,
    net_tutar: net,
  };
}

function paketKalemKey(paketTuru: string, paketId: number) {
  return `paket-${paketTuru}-${paketId}`;
}

// Net ödenecek tutardan liste fiyatını hesapla (ters hesaplama)
function hesaplaBrutFromNet(odenecek: number, kdvOrani: number, indirimOrani: number) {
  const indirimCarpan = 1 - indirimOrani / 100;
  if (indirimCarpan <= 0) return 0;
  return Math.round(odenecek / indirimCarpan);
}

function resolvePaketTuruForKalem(
  kalem: { kalem_id: number; kalem_adi: string },
  paketList: EgitimPaketi[],
  mainPaket?: { paket_id?: number; paket_turu?: string }
): string {
  if (mainPaket?.paket_id === kalem.kalem_id && mainPaket.paket_turu) {
    return mainPaket.paket_turu;
  }
  const byName = paketList.find(p => p.paket_id === kalem.kalem_id && p.paket_adi === kalem.kalem_adi);
  if (byName) return byName.paket_turu;
  const first = paketList.find(p => p.paket_id === kalem.kalem_id);
  return first?.paket_turu || "grup_dersi";
}

/* ═══════════════════════════════════════════ */
export default function SozlesmeOlusturClient() {
  const { basePath, href } = useOdemePath();
  const { activeSube } = useKurum();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit"); // düzenleme modu
  const isEditMode = !!editId;
  const preselectedOgrenciId = searchParams.get("ogrenci_id");

  // ─── Step ─────────────────────────
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // ─── Step 1: Öğrenci Arama ────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedOgrenci, setSelectedOgrenci] = useState<any>(null);

  // ─── Paket Data ───────────────────
  const [paketData, setPaketData] = useState<{
    kayit: Kayit;
    egitim_paketleri: EgitimPaketi[];
    ek_hizmetler: EkHizmet[];
    dahil_hizmetler?: DahilHizmet[];
    dahil_deneme_paket_ids?: number[];
    veliler: Veli[];
    odeme_yontemleri: OdemeYontemiDropdown[];
    mali_hesaplar: MaliHesapDropdown[];
    mevcut_sozlesme?: { id: number; sozlesme_no: string; durum: string; net_tutar: number; brut_tutar: number; paket_adi: string; paket_turu: string } | null;
    mevcut_kalemler?: { kalem_turu: string; kalem_id: number; kalem_adi: string; brut_tutar: number; net_tutar: number }[];
  } | null>(null);
  const [paketLoading, setPaketLoading] = useState(false);

  // ─── Step 1: Veli Seçimi ──────────
  const [selectedVeliId, setSelectedVeliId] = useState<number | "">("");

  // ─── Step 2: Paket + Kalemler ─────
  const [selectedPaketIdx, setSelectedPaketIdx] = useState<number | null>(null); // Grup dersi (tek seçim)
  const [selectedOzelDersIdxs, setSelectedOzelDersIdxs] = useState<Set<number>>(new Set()); // Özel dersler (çoklu seçim)
  const [selectedDenemePaketIdxs, setSelectedDenemePaketIdxs] = useState<Set<number>>(new Set()); // Deneme paketleri (çoklu seçim)
  const [selectedEkHizmetIds, setSelectedEkHizmetIds] = useState<Set<number>>(new Set());
  const [kalemler, setKalemler] = useState<KalemRow[]>([]);
  const skipKalemAutoBuild = useRef(false);

  // ─── Step 3: Ödeme Bilgileri ──────
  const [odemeTuru, setOdemeTuru] = useState("pesin");
  const [taksitSayisi, setTaksitSayisi] = useState(2);
  const [taksitPeriyodu, setTaksitPeriyodu] = useState("aylik");
  const [ilkOdemeTarihi, setIlkOdemeTarihi] = useState(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [baslangicTarihi, setBaslangicTarihi] = useState(() => new Date().toISOString().slice(0, 10));
  const [bitisTarihi, setBitisTarihi] = useState(() => {
    // Varsayılan: mevcut eğitim yılı sonu (30 Haziran)
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear(); // Eylül’den sonraysa gelecek yıl
    return `${year}-06-30`;
  });
  const [selectedOdemeYontemiId, setSelectedOdemeYontemiId] = useState<number | "">("");
  const [notlar, setNotlar] = useState("");

  // ─── Taksit Planı (eşit başlangıç + düzenlenebilir) ────────
  const [pesinatTutar, setPesinatTutar] = useState("");
  const [manuelRows, setManuelRows] = useState<ManuelTaksitRow[]>([{ tutar: "", vade_tarihi: "" }]);
  const [taksitPlanDirty, setTaksitPlanDirty] = useState(false);

  // ─── Yeni Paket/Hizmet Ekleme ─────
  const [showPaketEkle, setShowPaketEkle] = useState(false);
  const [tumPaketler, setTumPaketler] = useState<{grupDersleri: any[], ozelDersler: any[], denemeler: any[], ekHizmetler: any[]} | null>(null);
  const [tumPaketlerLoading, setTumPaketlerLoading] = useState(false);

  const loadTumPaketler = useCallback(async () => {
    setTumPaketlerLoading(true);
    try {
      const base = `/api/egitim-paketleri/api`;
      const [gRes, oRes, dRes, eRes] = await Promise.all([
        fetch(`${base}/grup-dersleri/`, { credentials: "include" }),
        fetch(`${base}/ozel-dersler/`, { credentials: "include" }),
        fetch(`${base}/denemeler/`, { credentials: "include" }),
        fetch(`${base}/ek-hizmetler/`, { credentials: "include" }),
      ]);
      const [gData, oData, dData, eData] = await Promise.all([gRes.json(), oRes.json(), dRes.json(), eRes.json()]);
      setTumPaketler({
        grupDersleri: (gData.data || []).filter((p: any) => p.aktif_mi),
        ozelDersler: (oData.data || []).filter((p: any) => p.aktif_mi),
        denemeler: (dData.data || []).filter((p: any) => p.aktif_mi),
        ekHizmetler: (eData.data || []).filter((p: any) => p.aktif_mi),
      });
    } catch { setTumPaketler(null); }
    setTumPaketlerLoading(false);
  }, []);

  const addPaketFromCatalog = (paket: any, turu: string) => {
    if (!paketData) return;
    const paketKey = `${turu}-${paket.id}`;
    const mevcutPaketKeys = paketData.egitim_paketleri.map((p: EgitimPaketi) => `${p.paket_turu}-${p.paket_id}`);
    if (mevcutPaketKeys.includes(paketKey)) return;
    if (turu === "deneme" && hasGrupDersiSelected && (paketData.dahil_deneme_paket_ids || []).includes(paket.id)) return;
    if (kalemler.some(k => k.kalem_turu === "paket" && k.paket_turu === turu && k.kalem_id === paket.id)) return;
    if (paketData.mevcut_kalemler?.some(k => k.kalem_turu === "paket" && k.kalem_id === paket.id)) return;
    const yeniPaket: EgitimPaketi = {
      id: Date.now(), // geçici id
      paket_turu: turu,
      paket_turu_label: turu === 'grup_dersi' ? 'Grup Dersi' : turu === 'ozel_ders' ? 'Özel Ders' : 'Deneme',
      paket_id: paket.id,
      paket_adi: paket.ad,
      fiyat: paket.fiyat || 0,
      kdv_orani: paket.kdv_orani || 10,
      kdv_tutari: 0,
      kdv_dahil_fiyat: paket.kdv_dahil_fiyat || 0,
    };
    const yeniListe = [...paketData.egitim_paketleri, yeniPaket];
    setPaketData({ ...paketData, egitim_paketleri: yeniListe });
    const newIdx = yeniListe.length - 1;
    if (turu === 'grup_dersi') {
      setSelectedPaketIdx(newIdx);
    } else if (turu === 'ozel_ders') {
      setSelectedOzelDersIdxs(prev => new Set([...prev, newIdx]));
    } else if (turu === 'deneme') {
      setSelectedDenemePaketIdxs(prev => new Set([...prev, newIdx]));
    }
  };

  const addEkHizmetFromCatalog = (hizmet: any) => {
    if (!paketData) return;
    const dahilIds = new Set((paketData.dahil_hizmetler || []).map(d => d.ek_hizmet_id));
    if (hasGrupDersiSelected && dahilIds.has(hizmet.id)) return;
    const mevcutEkIds = paketData.ek_hizmetler.map((e: EkHizmet) => e.ek_hizmet_id);
    if (mevcutEkIds.includes(hizmet.id)) return;
    if (kalemler.some(k => k.kalem_turu === "ek_hizmet" && k.kalem_id === hizmet.id)) return;
    if (paketData.mevcut_kalemler?.some(k => k.kalem_turu === "ek_hizmet" && k.kalem_id === hizmet.id)) return;
    const yeniEk: EkHizmet = {
      id: Date.now(),
      ek_hizmet_id: hizmet.id,
      ad: hizmet.ad,
      hizmet_turu: hizmet.hizmet_turu || '',
      fiyat: hizmet.fiyat || 0,
      kdv_orani: hizmet.kdv_orani || 10,
      kdv_tutari: 0,
      kdv_dahil_fiyat: hizmet.kdv_dahil_fiyat || 0,
    };
    const yeniListe = [...paketData.ek_hizmetler, yeniEk];
    setPaketData({ ...paketData, ek_hizmetler: yeniListe });
    setSelectedEkHizmetIds(prev => new Set([...prev, yeniEk.id]));
  };

  // ─── Submit ───────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const initialSnapshotRef = useRef<string | null>(null);
  const [snapshotReady, setSnapshotReady] = useState(false);

  const buildFormSnapshot = useCallback(
    () =>
      JSON.stringify({
        step,
        ogrenciId: selectedOgrenci?.id ?? null,
        veliId: selectedVeliId,
        kalemler,
        odemeTuru,
        taksitSayisi,
        taksitPeriyodu,
        ilkOdemeTarihi,
        baslangicTarihi,
        bitisTarihi,
        selectedOdemeYontemiId,
        notlar,
        pesinatTutar,
        manuelRows,
        taksitPlanDirty,
      }),
    [
      step,
      selectedOgrenci?.id,
      selectedVeliId,
      kalemler,
      odemeTuru,
      taksitSayisi,
      taksitPeriyodu,
      ilkOdemeTarihi,
      baslangicTarihi,
      bitisTarihi,
      selectedOdemeYontemiId,
      notlar,
      pesinatTutar,
      manuelRows,
      taksitPlanDirty,
    ]
  );

  const isDirty =
    snapshotReady &&
    initialSnapshotRef.current !== null &&
    buildFormSnapshot() !== initialSnapshotRef.current;

  const { leaveDialogProps, markClean, requestNavigation } = useUnsavedChangesGuard({
    isDirty,
    title: "Sözleşme Ekranından Ayrıl",
    message:
      "Sözleşme oluşturma işlemi tamamlanmadan bu sayfadan ayrılmak istediğinize emin misiniz? Girdiğiniz bilgiler kaybolabilir.",
  });

  // ═════════════════════════════════════════
  // Öğrenci Arama
  // ═════════════════════════════════════════
  const searchOgrenci = useCallback(async () => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await apiGet<{ ogrenciler?: any[] }>(
        `/ogrenciler/api/search/?q=${encodeURIComponent(searchQuery.trim())}`
      );
      if (!res.success) {
        setSearchResults([]);
        setSearchError(res.error || "Öğrenci araması yapılamadı");
        return;
      }
      const payload = res.data as { ogrenciler?: any[] } | any[] | undefined;
      const list = Array.isArray(payload)
        ? payload
        : payload?.ogrenciler || (payload as any)?.results || [];
      setSearchResults(list);
      if (list.length === 0) {
        setSearchError("Bu eğitim yılında aktif kaydı olan öğrenci bulunamadı. Kurum/şube seçimini kontrol edin.");
      }
    } catch {
      setSearchResults([]);
      setSearchError("Bağlantı hatası. Sayfayı yenileyip tekrar deneyin.");
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (selectedOgrenci || searchQuery.trim().length < 2) {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        setSearchError(null);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      void searchOgrenci();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery, selectedOgrenci, searchOgrenci]);

  // ═════════════════════════════════════════
  // Öğrenci seçilince paket bilgisi getir
  // ═════════════════════════════════════════
  const loadPaketData = useCallback(async (ogrenciId: number, contractRestore?: {
    kalemler?: Array<{
      kalem_turu: string; kalem_id: number; kalem_adi: string;
      brut_tutar: number; kdv_orani: number; kdv_tutari?: number;
      indirim_orani: number; indirim_tutari: number; net_tutar: number;
    }>;
    paket_id?: number;
    paket_turu?: string;
  }) => {
    setPaketLoading(true);
    try {
      const r = await fetch(`${API_BASE}/ogrenci/${ogrenciId}/paketler/`, {
        credentials: "include",
        headers: apiHeaders(),
      });
      if (!r.ok) {
        const err = await r.json();
        setError(err.error || "Paket bilgisi alınamadı");
        setPaketData(null);
        setPaketLoading(false);
        return;
      }
      const data = await r.json();
      setPaketData(data);
      setError(null);
      setSelectedOdemeYontemiId("");
      if (data.kayit?.egitim_yili_bitis_yil && !contractRestore) {
        setBitisTarihi(defaultEgitimYiliBitis(data.kayit.egitim_yili_bitis_yil));
      }
      setTaksitPlanDirty(false);
      // Varsayılan veliyi seç
      const defVeli = data.veliler?.find((v: Veli) => v.varsayilan);
      if (defVeli) setSelectedVeliId(defVeli.id);

      // Düzenleme modu: mevcut sözleşme kalemlerini geri yükle
      if (contractRestore?.kalemler?.length) {
        const ozelDersIdxs = new Set<number>();
        const denemeIdxs = new Set<number>();
        let grupDersiIdx: number | null = null;
        const ekIds = new Set<number>();
        const restoredRows: KalemRow[] = [];

        for (const k of contractRestore.kalemler) {
          if (k.kalem_turu === "paket") {
            const tur = resolvePaketTuruForKalem(
              k,
              data.egitim_paketleri,
              { paket_id: contractRestore.paket_id, paket_turu: contractRestore.paket_turu }
            );
            const idx = data.egitim_paketleri.findIndex(
              (p: EgitimPaketi) => p.paket_id === k.kalem_id && p.paket_turu === tur
            );
            if (tur === "grup_dersi" && idx !== -1) grupDersiIdx = idx;
            if (tur === "ozel_ders" && idx !== -1) ozelDersIdxs.add(idx);
            if (tur === "deneme" && idx !== -1) denemeIdxs.add(idx);
            const kdvHaric = hesaplaKalem(k.brut_tutar, k.kdv_orani, 0).kdv_haric;
            restoredRows.push({
              key: paketKalemKey(tur, k.kalem_id),
              kalem_turu: "paket",
              paket_turu: tur,
              kalem_id: k.kalem_id,
              kalem_adi: k.kalem_adi,
              brut_tutar: k.brut_tutar,
              kdv_orani: k.kdv_orani,
              indirim_orani: k.indirim_orani,
              kdv_haric: kdvHaric,
              kdv_tutari: k.kdv_tutari ?? hesaplaKalem(k.brut_tutar, k.kdv_orani, 0).kdv_tutari,
              indirim_tutari: k.indirim_tutari,
              net_tutar: k.net_tutar,
            });
          } else {
            const eh = data.ek_hizmetler.find((e: EkHizmet) => e.ek_hizmet_id === k.kalem_id);
            if (eh) ekIds.add(eh.id);
            const kdvHaric = hesaplaKalem(k.brut_tutar, k.kdv_orani, 0).kdv_haric;
            restoredRows.push({
              key: `ek-${k.kalem_id}`,
              kalem_turu: "ek_hizmet",
              kalem_id: k.kalem_id,
              kalem_adi: k.kalem_adi,
              brut_tutar: k.brut_tutar,
              kdv_orani: k.kdv_orani,
              indirim_orani: k.indirim_orani,
              kdv_haric: kdvHaric,
              kdv_tutari: k.kdv_tutari ?? hesaplaKalem(k.brut_tutar, k.kdv_orani, 0).kdv_tutari,
              indirim_tutari: k.indirim_tutari,
              net_tutar: k.net_tutar,
            });
          }
        }

        setSelectedPaketIdx(grupDersiIdx);
        setSelectedOzelDersIdxs(ozelDersIdxs);
        setSelectedDenemePaketIdxs(denemeIdxs);
        setSelectedEkHizmetIds(ekIds);
        skipKalemAutoBuild.current = true;
        setKalemler(restoredRows);
        setPaketLoading(false);
        return;
      }

      // Tüm paket ve hizmetleri otomatik seç
      if (data.egitim_paketleri && data.egitim_paketleri.length > 0) {
        const grupDersiIdx = data.egitim_paketleri.findIndex((p: EgitimPaketi) => p.paket_turu === "grup_dersi");
        if (grupDersiIdx !== -1) {
          setSelectedPaketIdx(grupDersiIdx);
        }
        const ozelDersIdxs = new Set<number>();
        const denemeIdxs = new Set<number>();
        data.egitim_paketleri.forEach((p: EgitimPaketi, idx: number) => {
          if (p.paket_turu === "ozel_ders") ozelDersIdxs.add(idx);
          if (p.paket_turu === "deneme") denemeIdxs.add(idx);
        });
        setSelectedOzelDersIdxs(ozelDersIdxs);
        if (grupDersiIdx === -1) {
          const dahilDenemeIds = new Set<number>(data.dahil_deneme_paket_ids || []);
          const filteredDeneme = new Set<number>();
          denemeIdxs.forEach(idx => {
            const p = data.egitim_paketleri[idx];
            if (p && !dahilDenemeIds.has(p.paket_id)) filteredDeneme.add(idx);
          });
          setSelectedDenemePaketIdxs(filteredDeneme);
        } else {
          setSelectedDenemePaketIdxs(new Set());
        }
      }
      if (data.ek_hizmetler && data.ek_hizmetler.length > 0) {
        // Deneme paketi veya grup dersi seçiliyse, deneme türündeki ek hizmetleri otomatik seçme (zaten dahil)
        const hasDenemePaketi = data.egitim_paketleri?.some((p: EgitimPaketi) => p.paket_turu === 'deneme');
        const hasGrupDersi = data.egitim_paketleri?.some((p: EgitimPaketi) => p.paket_turu === 'grup_dersi');
        const allEkIds = new Set<number>();
        data.ek_hizmetler.forEach((eh: EkHizmet) => {
          // Deneme paketi veya grup dersi varsa deneme türü ek hizmetleri seçme
          if (eh.hizmet_turu === 'deneme' && (hasDenemePaketi || hasGrupDersi)) return;
          allEkIds.add(eh.id);
        });
        setSelectedEkHizmetIds(allEkIds);
      }
    } catch { setError("Paket bilgisi alınamadı"); }
    setPaketLoading(false);
  }, []);

  const selectOgrenci = (ogr: any) => {
    setSelectedOgrenci(ogr);
    setSearchResults([]);
    setSearchQuery("");
    // Seçimleri sıfırla — loadPaketData otomatik olarak hepsini işaretleyecek
    setSelectedPaketIdx(null);
    setSelectedOzelDersIdxs(new Set());
    setSelectedDenemePaketIdxs(new Set());
    setSelectedEkHizmetIds(new Set());
    setKalemler([]);
    setSelectedOdemeYontemiId("");
    loadPaketData(ogr.id);
  };

  // Aktif şube değişince mali hesap listesini yenile
  useEffect(() => {
    if (!selectedOgrenci?.id || isEditMode) return;
    loadPaketData(selectedOgrenci.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSube?.id]);

  // ═════════════════════════════════════════
  // Edit Mode: Mevcut sözleşme verilerini yükle
  // ═════════════════════════════════════════
  const [editLoaded, setEditLoaded] = useState(false);
  useEffect(() => {
    if (!isEditMode || editLoaded) return;
    const loadEditData = async () => {
      try {
        const r = await fetch(`${API_BASE}/sozlesmeler/${editId}/`, { credentials: "include" });
        if (!r.ok) { setError("Sözleşme bulunamadı"); return; }
        const sz = await r.json();
        if (!(["taslak", "aktif"].includes(sz.durum))) { setError("Sadece taslak veya aktif sözleşmeler düzenlenebilir"); return; }

        // Öğrenci bilgisini set et
        setSelectedOgrenci({ id: sz.ogrenci?.id || sz.ogrenci_id, ad: sz.ogrenci?.ad, soyad: sz.ogrenci?.soyad });
        // Paket bilgisi yükle (mevcut kalemlerle)
        await loadPaketData(sz.ogrenci?.id || sz.ogrenci_id, {
          kalemler: sz.kalemler,
          paket_id: sz.paket_id,
          paket_turu: sz.paket_turu,
        });

        // Ödeme bilgileri
        setOdemeTuru(sz.odeme_turu || "taksitli");
        setTaksitSayisi(sz.taksit_sayisi || 2);
        setTaksitPeriyodu(sz.taksit_periyodu || "aylik");
        if (sz.ilk_odeme_tarihi) setIlkOdemeTarihi(sz.ilk_odeme_tarihi);
        if (sz.baslangic_tarihi) setBaslangicTarihi(sz.baslangic_tarihi);
        if (sz.bitis_tarihi) setBitisTarihi(sz.bitis_tarihi);
        setNotlar(sz.notlar || "");
        if (sz.odeme_yontemi_id) setSelectedOdemeYontemiId(sz.odeme_yontemi_id);
        if (sz.veli_id) setSelectedVeliId(sz.veli_id);

        if (sz.taksitler?.length) {
          setManuelRows(
            sz.taksitler.map((t: { tutar: number; vade_tarihi: string; odeme_yontemi_id?: number | null }) => ({
              tutar: String(t.tutar),
              vade_tarihi: t.vade_tarihi || "",
              ...(t.odeme_yontemi_id ? { odeme_yontemi_id: t.odeme_yontemi_id } : {}),
            })),
          );
          setTaksitPlanDirty(true);
        }

        // Tüm adımlardan başla (öğrenci ve kalemler yüklendi)
        setStep(1);
        setEditLoaded(true);
      } catch { setError("Sözleşme bilgisi yüklenemedi"); }
    };
    loadEditData();
  }, [isEditMode, editId, editLoaded, loadPaketData]);

  // ═════════════════════════════════════════
  // Preselected Öğrenci: URL'den ogrenci_id ile gelirse otomatik seç
  // ═════════════════════════════════════════
  const [preselectedLoaded, setPreselectedLoaded] = useState(false);
  useEffect(() => {
    if (!preselectedOgrenciId || isEditMode || preselectedLoaded || selectedOgrenci) return;
    const loadPreselected = async () => {
      try {
        const raw = typeof window !== "undefined"
          ? sessionStorage.getItem("sozlesme_ogrenci_prefill")
          : null;
        if (raw) {
          const cached = JSON.parse(raw) as { id?: number; ad?: string; soyad?: string; tam_ad?: string; ogrenci_no?: string };
          if (cached.id && String(cached.id) === String(preselectedOgrenciId)) {
            sessionStorage.removeItem("sozlesme_ogrenci_prefill");
            selectOgrenci(cached);
            setPreselectedLoaded(true);
            return;
          }
        }

        const res = await apiGet<Record<string, unknown>>(`/ogrenciler/api/${preselectedOgrenciId}/`);
        if (res.success && res.data) {
          const ogr = res.data;
          const id = ogr.id ?? ogr.ogrenci_id;
          if (id != null) {
            selectOgrenci({ ...ogr, id: Number(id) });
          }
        }
      } catch { /* sessiz hata */ }
      setPreselectedLoaded(true);
    };
    void loadPreselected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedOgrenciId, isEditMode, preselectedLoaded, selectedOgrenci]);

  useEffect(() => {
    if (isEditMode && !editLoaded) return;
    if (!isEditMode && preselectedOgrenciId && !preselectedLoaded) return;
    if (paketLoading) return;
    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = buildFormSnapshot();
      setSnapshotReady(true);
    }
  }, [
    isEditMode,
    editLoaded,
    preselectedOgrenciId,
    preselectedLoaded,
    paketLoading,
    buildFormSnapshot,
  ]);

  // ═════════════════════════════════════════
  // Grup dersi seçildiğinde deneme paketlerini temizle
  // ═════════════════════════════════════════
  const hasGrupDersiSelected = selectedPaketIdx !== null && paketData?.egitim_paketleri[selectedPaketIdx]?.paket_turu === "grup_dersi";

  const dahilEkHizmetIdSet = useMemo(
    () => new Set((paketData?.dahil_hizmetler || []).map(d => d.ek_hizmet_id)),
    [paketData?.dahil_hizmetler]
  );
  const dahilDenemePaketIdSet = useMemo(
    () => new Set(paketData?.dahil_deneme_paket_ids || []),
    [paketData?.dahil_deneme_paket_ids]
  );

  const isPaketKalemiMevcut = useCallback((paketTuru: string, paketId: number) => {
    if (!paketData) return false;
    if (paketData.egitim_paketleri.some(p => p.paket_turu === paketTuru && p.paket_id === paketId)) return true;
    if (kalemler.some(k => k.kalem_turu === "paket" && k.paket_turu === paketTuru && k.kalem_id === paketId)) return true;
    if (paketTuru === "deneme" && hasGrupDersiSelected && dahilDenemePaketIdSet.has(paketId)) return true;
    return false;
  }, [paketData, kalemler, dahilDenemePaketIdSet, hasGrupDersiSelected]);

  const isEkHizmetMevcut = useCallback((hizmetId: number) => {
    if (!paketData) return false;
    if (hasGrupDersiSelected && dahilEkHizmetIdSet.has(hizmetId)) return true;
    if (paketData.ek_hizmetler.some(eh => eh.ek_hizmet_id === hizmetId)) return true;
    if (kalemler.some(k => k.kalem_turu === "ek_hizmet" && k.kalem_id === hizmetId)) return true;
    if (paketData.mevcut_kalemler?.some(k => k.kalem_turu === "ek_hizmet" && k.kalem_id === hizmetId)) return true;
    return false;
  }, [paketData, kalemler, dahilEkHizmetIdSet, hasGrupDersiSelected]);

  const selectableEkHizmetler = useMemo(() => {
    if (!paketData) return [] as EkHizmet[];
    const dahilEk = hasGrupDersiSelected
      ? []
      : (paketData.dahil_hizmetler || []).map((dh): EkHizmet => ({
          id: dh.id,
          ek_hizmet_id: dh.ek_hizmet_id,
          ad: dh.ad,
          hizmet_turu: dh.hizmet_turu,
          fiyat: dh.fiyat || 0,
          kdv_orani: dh.kdv_orani || 10,
          kdv_tutari: 0,
          kdv_dahil_fiyat: dh.kdv_dahil_fiyat || dh.fiyat || 0,
        }));
    const seen = new Set<number>();
    const merged: EkHizmet[] = [];
    for (const eh of [...paketData.ek_hizmetler, ...dahilEk]) {
      if (seen.has(eh.ek_hizmet_id)) continue;
      seen.add(eh.ek_hizmet_id);
      merged.push(eh);
    }
    return merged;
  }, [paketData, hasGrupDersiSelected]);

  useEffect(() => {
    if (hasGrupDersiSelected && selectedDenemePaketIdxs.size > 0) {
      setSelectedDenemePaketIdxs(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGrupDersiSelected]);

  // Deneme paketi seçildiğinde, deneme türündeki ek hizmetleri otomatik kaldır
  useEffect(() => {
    if (selectedDenemePaketIdxs.size > 0 && paketData) {
      const denemeEkIds = new Set(
        paketData.ek_hizmetler
          .filter((h: any) => h.hizmet_turu === "deneme")
          .map((h: any) => h.id)
      );
      if (denemeEkIds.size > 0) {
        setSelectedEkHizmetIds(prev => {
          const next = new Set(prev);
          let changed = false;
          denemeEkIds.forEach(id => { if (next.has(id)) { next.delete(id); changed = true; } });
          return changed ? next : prev;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDenemePaketIdxs.size]);

  // ═════════════════════════════════════════
  // Kalemler: paket + ek hizmet → KalemRow[]
  // ═════════════════════════════════════════
  useEffect(() => {
    if (!paketData) return;
    if (skipKalemAutoBuild.current) {
      skipKalemAutoBuild.current = false;
      return;
    }
    const rows: KalemRow[] = [];

    // Grup dersi (ana paket - tek seçim)
    if (selectedPaketIdx !== null && paketData.egitim_paketleri[selectedPaketIdx]) {
      const p = paketData.egitim_paketleri[selectedPaketIdx];
      if (p.paket_turu === "grup_dersi") {
        const rowKey = paketKalemKey(p.paket_turu, p.paket_id);
        rows.push(mergeKalemRow(rowKey, {
          kalem_turu: "paket", paket_turu: p.paket_turu, kalem_id: p.paket_id,
          kalem_adi: p.paket_adi, fiyat: p.fiyat, kdv_orani: p.kdv_orani,
        }, kalemler.find(k => k.key === rowKey)));
      }
    }

    for (const idx of selectedOzelDersIdxs) {
      const p = paketData.egitim_paketleri[idx];
      if (!p || p.paket_turu !== "ozel_ders") continue;
      const rowKey = paketKalemKey(p.paket_turu, p.paket_id);
      rows.push(mergeKalemRow(rowKey, {
        kalem_turu: "paket", paket_turu: p.paket_turu, kalem_id: p.paket_id,
        kalem_adi: p.paket_adi, fiyat: p.fiyat, kdv_orani: p.kdv_orani,
      }, kalemler.find(k => k.key === rowKey)));
    }

    for (const idx of selectedDenemePaketIdxs) {
      const p = paketData.egitim_paketleri[idx];
      if (!p || p.paket_turu !== "deneme") continue;
      if (hasGrupDersiSelected && dahilDenemePaketIdSet.has(p.paket_id)) continue;
      const rowKey = paketKalemKey(p.paket_turu, p.paket_id);
      rows.push(mergeKalemRow(rowKey, {
        kalem_turu: "paket", paket_turu: p.paket_turu, kalem_id: p.paket_id,
        kalem_adi: p.paket_adi, fiyat: p.fiyat, kdv_orani: p.kdv_orani,
      }, kalemler.find(k => k.key === rowKey)));
    }

    for (const eh of selectableEkHizmetler) {
      if (!selectedEkHizmetIds.has(eh.id)) continue;
      const rowKey = `ek-${eh.ek_hizmet_id}`;
      rows.push(mergeKalemRow(rowKey, {
        kalem_turu: "ek_hizmet", kalem_id: eh.ek_hizmet_id,
        kalem_adi: eh.ad, fiyat: eh.fiyat, kdv_orani: eh.kdv_orani,
      }, kalemler.find(k => k.key === rowKey)));
    }

    setKalemler(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPaketIdx, selectedOzelDersIdxs, selectedDenemePaketIdxs, selectedEkHizmetIds, paketData, dahilDenemePaketIdSet, hasGrupDersiSelected, selectableEkHizmetler]);

  // Kalem KDV/İndirim/Brüt/Ödenecek değişikliği
  const updateKalem = (key: string, field: "kdv_orani" | "indirim_orani" | "brut_tutar" | "net_tutar" | "indirim_tutari", value: number) => {
    setKalemler(prev => prev.map(k => {
      if (k.key !== key) return k;
      if (field === "net_tutar") {
        const net = Math.max(0, Math.round(value));
        const brut = k.brut_tutar;
        const indTutar = Math.max(0, brut - net);
        const calc = hesaplaKalem(brut, k.kdv_orani, 0, indTutar);
        return { ...k, ...calc, net_tutar: net };
      }
      if (field === "brut_tutar") {
        const calc = k.indirim_tutari > 0
          ? hesaplaKalem(value, k.kdv_orani, 0, k.indirim_tutari)
          : k.net_tutar > 0 && k.net_tutar < k.brut_tutar
            ? hesaplaKalem(value, k.kdv_orani, 0, value - k.net_tutar)
            : hesaplaKalem(value, k.kdv_orani, k.indirim_orani);
        return { ...k, brut_tutar: value, ...calc };
      }
      if (field === "indirim_tutari") {
        const indTutar = Math.max(0, Math.round(value));
        const calc = hesaplaKalem(k.brut_tutar, k.kdv_orani, 0, indTutar);
        return { ...k, ...calc };
      }
      if (field === "indirim_orani") {
        const calc = hesaplaKalem(k.brut_tutar, k.kdv_orani, value);
        return { ...k, ...calc };
      }
      const newK = { ...k, [field]: value };
      const calc = hesaplaKalem(newK.brut_tutar, newK.kdv_orani, newK.indirim_orani);
      return { ...newK, ...calc };
    }));
  };

  // ═════════════════════════════════════════
  // Toplamlar
  // ═════════════════════════════════════════
  const toplamlar = useMemo(() => {
    let brut = 0, kdvHaric = 0, kdv = 0, indirim = 0, net = 0;
    for (const k of kalemler) {
      brut += k.brut_tutar;
      kdvHaric += k.kdv_haric;
      kdv += k.kdv_tutari;
      indirim += k.indirim_tutari;
      net += k.net_tutar;
    }
    return {
      brut: Math.round(brut),
      kdvHaric: Math.round(kdvHaric),
      kdv: Math.round(kdv),
      indirim: Math.round(indirim),
      net: Math.round(net),
    };
  }, [kalemler]);

  // ═════════════════════════════════════════
  // Manuel akıllı yardımcılar
  // ═════════════════════════════════════════
  const hedefTutar = toplamlar.net;
  const pesinatVal = parseFloat(pesinatTutar) || 0;

  const defaultCekYontemId = useMemo(() => {
    if (odemeTuru !== "cek_senet") return "" as number | "";
    const cekYontemleri = (paketData?.odeme_yontemleri || []).filter(isCekSenetYontem);
    return cekYontemleri.length === 1 ? cekYontemleri[0].id : "";
  }, [odemeTuru, paketData?.odeme_yontemleri]);

  const taksitPlanOptions = useMemo(
    () => ({
      preserveFrom: manuelRows,
      defaultOdemeYontemiId: defaultCekYontemId,
    }),
    [manuelRows, defaultCekYontemId],
  );

  const rebuildEqualPlan = useCallback(
    (count: number) => {
      if (!odemeTuruTaksitPlaniMi(odemeTuru) || hedefTutar <= 0 || !ilkOdemeTarihi) return;
      const safeCount = clampTaksitSayisi(count);
      setManuelRows(
        buildEqualTaksitRows(
          hedefTutar,
          pesinatVal,
          safeCount,
          ilkOdemeTarihi,
          taksitPeriyodu,
          taksitPlanOptions,
        ),
      );
    },
    [odemeTuru, hedefTutar, pesinatVal, ilkOdemeTarihi, taksitPeriyodu, taksitPlanOptions],
  );

  const applyTaksitSayisi = useCallback(
    (raw: number) => {
      const safeCount = clampTaksitSayisi(raw);
      setTaksitSayisi(safeCount);
      setTaksitPlanDirty(false);
      rebuildEqualPlan(safeCount);
    },
    [rebuildEqualPlan],
  );

  useEffect(() => {
    if (!odemeTuruTaksitPlaniMi(odemeTuru) || taksitPlanDirty || hedefTutar <= 0) return;
    rebuildEqualPlan(taksitSayisi);
  }, [odemeTuru, hedefTutar, pesinatVal, ilkOdemeTarihi, taksitPeriyodu, taksitPlanDirty, taksitSayisi, rebuildEqualPlan]);

  const handleManuelDateChange = (index: number, value: string) => {
    setTaksitPlanDirty(true);
    const rows = [...manuelRows];
    rows[index].vade_tarihi = value;
    for (let i = index + 1; i < rows.length; i++) {
      rows[i].vade_tarihi = addMonths(value, i - index);
    }
    setManuelRows(rows);
  };

  const handleManuelTutarChange = (index: number, value: string) => {
    setTaksitPlanDirty(true);
    const rows = [...manuelRows];
    rows[index].tutar = value;
    let ustToplam = 0;
    for (let i = 0; i <= index; i++) ustToplam += parseFloat(rows[i].tutar) || 0;
    const altSatirSayisi = rows.length - index - 1;
    if (altSatirSayisi > 0) {
      const kalanBakiye = hedefTutar - ustToplam;
      const herBirine = Math.max(0, kalanBakiye / altSatirSayisi);
      const yuvarlanmis = Math.floor(herBirine);
      for (let i = index + 1; i < rows.length; i++) {
        rows[i].tutar = i === rows.length - 1
          ? String(Math.round(hedefTutar - ustToplam - yuvarlanmis * (altSatirSayisi - 1)))
          : String(yuvarlanmis);
      }
    }
    setManuelRows(rows);
  };

  const manuelToplam = manuelRows.reduce((s, r) => s + (parseFloat(r.tutar) || 0), 0);

  const taksitPreview = useMemo((): TaksitPreview[] => {
    if (!odemeTuruTaksitPlaniMi(odemeTuru) || toplamlar.net <= 0) return [];
    return manuelRows
      .filter((r) => r.tutar && r.vade_tarihi)
      .map((r, i) => ({
        taksit_no: i + 1,
        vade_tarihi: r.vade_tarihi,
        tutar: parseFloat(r.tutar) || 0,
      }));
  }, [odemeTuru, toplamlar.net, manuelRows]);

  // ═════════════════════════════════════════
  // Submit
  // ═════════════════════════════════════════
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    if (!selectedOgrenci || !paketData) {
      setError("Öğrenci seçimi zorunludur.");
      setSubmitting(false);
      return;
    }
    if (kalemler.length === 0) {
      setError("En az bir ücretli kalem (paket, özel ders, deneme paketi veya ek hizmet) seçilmelidir.");
      setSubmitting(false);
      return;
    }
    const isCekSenetMode = odemeTuru === "cek_senet";
    const isTaksitMode = odemeTuruTaksitPlaniMi(odemeTuru);

    if ((odemeTuru === "pesin" || odemeTuru === "taksitli") && !selectedOdemeYontemiId) {
      setError("Ödeme yöntemi seçimi zorunludur.");
      setSubmitting(false);
      return;
    }
    if (!bitisTarihi) {
      setError("Sözleşme bitiş tarihi zorunludur. Eğitim tamamlanma tarihini mutlaka girin.");
      setSubmitting(false);
      return;
    }
    if (bitisTarihi < baslangicTarihi) {
      setError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
      setSubmitting(false);
      return;
    }

    const validManuelRows = manuelRows.filter((r) => r.tutar && r.vade_tarihi);

    if (isCekSenetMode && validManuelRows.length === 0) {
      setError("Çek/senet sözleşmesi için en az bir taksit tanımlayın.");
      setSubmitting(false);
      return;
    }

    const cekSenetRowsForSubmit: ManuelTaksitRow[] = validManuelRows.map((row) => ({
      ...row,
      odeme_yontemi_id: (row.odeme_yontemi_id || defaultCekYontemId || "") as number | "",
    }));

    if (isCekSenetMode) {
      const missingYontem = cekSenetRowsForSubmit.some((r) => !r.odeme_yontemi_id);
      if (missingYontem) {
        setError("Çek/senet sözleşmesinde her taksit satırı için ödeme yöntemi (çek/senet) seçilmelidir.");
        setSubmitting(false);
        return;
      }
    }

    const isEqualPlan = !isTaksitMode || rowsMatchEqualPlan(
      cekSenetRowsForSubmit,
      hedefTutar,
      pesinatVal,
      taksitSayisi,
      ilkOdemeTarihi,
      taksitPeriyodu,
    );
    const allSelectedPaketIdxs: number[] = [];
    if (selectedPaketIdx !== null) allSelectedPaketIdxs.push(selectedPaketIdx);
    for (const idx of selectedOzelDersIdxs) allSelectedPaketIdxs.push(idx);
    for (const idx of selectedDenemePaketIdxs) allSelectedPaketIdxs.push(idx);

    const firstPaketIdx = allSelectedPaketIdxs.length > 0 ? allSelectedPaketIdxs[0] : null;
    const paket = firstPaketIdx !== null ? paketData.egitim_paketleri[firstPaketIdx] : null;
    const anaKalem = paket
      ? kalemler.find(k => k.kalem_turu === "paket" && k.paket_turu === paket.paket_turu && k.kalem_id === paket.paket_id)
      : kalemler.find(k => k.kalem_turu === "paket");

    const anaPayload = anaKalem ? finalizeKalemPayload(anaKalem) : null;

    const body: any = {
      ogrenci_id: selectedOgrenci.id,
      ogrenci_kayit_id: paketData.kayit.id,
      egitim_yili_id: paketData.kayit.egitim_yili_id,
      kurum_id: paketData.kayit.kurum_id,
      sube_id: activeSube?.id ?? paketData.kayit.islem_sube_id ?? paketData.kayit.sube_id,
      baslangic_tarihi: baslangicTarihi,
      bitis_tarihi: bitisTarihi,
      paket_turu: paket?.paket_turu || "ek_hizmet",
      paket_id: paket?.paket_id || undefined,
      paket_adi: paket?.paket_adi || "Ek Hizmetler",
      brut_tutar: anaPayload?.brut_tutar ?? paket?.fiyat ?? 0,
      kdv_orani: anaPayload?.kdv_orani ?? paket?.kdv_orani ?? 0,
      indirim_orani: anaPayload?.indirim_orani ?? 0,
      indirim_tutari: anaPayload?.indirim_tutari ?? 0,
      net_tutar: anaPayload?.net_tutar ?? anaPayload?.brut_tutar ?? paket?.fiyat ?? 0,
      odeme_turu: odemeTuru,
      taksit_sayisi: odemeTuru === "pesin" ? 1 : taksitSayisi,
      ilk_odeme_tarihi: ilkOdemeTarihi,
      taksit_periyodu: taksitPeriyodu,
      taksit_yontemi: isTaksitMode ? (isEqualPlan ? "esit" : "manuel") : undefined,
      pesinat: pesinatVal > 0 ? pesinatVal : undefined,
      manuel_taksitler: isTaksitMode && !isEqualPlan
        ? cekSenetRowsForSubmit.map((r) => ({
            tutar: parseFloat(r.tutar),
            vade_tarihi: r.vade_tarihi,
            ...(isCekSenetMode && r.odeme_yontemi_id ? { odeme_yontemi_id: Number(r.odeme_yontemi_id) } : {}),
          }))
        : undefined,
      taksit_odeme_yontemleri: isCekSenetMode && isTaksitMode
        ? buildTaksitOdemeYontemleri(cekSenetRowsForSubmit)
        : undefined,
      notlar,
      // Yeni alanlar
      veli_id: selectedVeliId || null,
      odeme_yontemi_id: isCekSenetMode ? null : selectedOdemeYontemiId || null,
      mali_hesap_id: null,
      // Tüm kalemler (ana paket hariç — ana paket zaten paket_id/paket_adi ile gönderiliyor)
      kalemler: kalemler
        .filter(k => {
          if (k.kalem_turu === "paket" && paket && k.paket_turu === paket.paket_turu && k.kalem_id === paket.paket_id) return false;
          return true;
        })
        .map(k => finalizeKalemPayload(k)),
    };

    try {
      const url = isEditMode ? `${API_BASE}/sozlesmeler/${editId}/update/` : `${API_BASE}/sozlesmeler/create/`;
      const method = isEditMode ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        // Backend: { errors: { field: msg } } veya { error: msg }
        if (data.errors && typeof data.errors === "object") {
          setFieldErrors(data.errors);
          const msgs = Object.values(data.errors).join(", ");
          setError(msgs);
        } else if (data.error) {
          setError(data.error);
        } else if (typeof data === "object") {
          // Legacy format: direct field errors
          const msgs = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(", ");
          setError(msgs);
        } else {
          setError("Sözleşme oluşturulamadı");
        }
        setSubmitting(false);
        return;
      }
      markClean();
      router.push(basePath);
    } catch (e: any) {
      setError(e.message || "Bir hata oluştu");
    }
    setSubmitting(false);
  };

  // ═════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════
  const canNext = () => {
    if (step === 1) return !!selectedOgrenci && !!paketData;
    if (step === 2) {
      const hasPaket = selectedPaketIdx !== null;
      const hasOzelDers = selectedOzelDersIdxs.size > 0;
      const hasDenemePaket = selectedDenemePaketIdxs.size > 0;
      const hasEkHizmet = selectedEkHizmetIds.size > 0;
      return (hasPaket || hasOzelDers || hasDenemePaket || hasEkHizmet) && kalemler.length > 0;
    }
    if (step === 3) return true;
    return true;
  };

  return (
    <>
      <UnsavedChangesModal {...leaveDialogProps} />
    <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{isEditMode ? "Sözleşme Düzenle" : "Yeni Sözleşme Oluştur"}</h1>
          <p style={{ color: "#6b7280", margin: "4px 0 0" }}>Adım {step} / {totalSteps}</p>
        </div>
        <button onClick={() => requestNavigation(basePath)}
          style={{ padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
          ← Geri Dön
        </button>
      </div>

      {/* Step Indicator */}
      <div style={{ display: "flex", gap: 4, marginBottom: 32 }}>
        {["Öğrenci & Veli", "Paketler & Kalemler", "Ödeme Bilgileri", "Özet & Onayla"].map((label, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              height: 4, borderRadius: 2, marginBottom: 6,
              background: i + 1 <= step ? "#2563eb" : "#e5e7eb",
            }} />
            <span style={{ fontSize: 12, color: i + 1 <= step ? "#2563eb" : "#9ca3af", fontWeight: i + 1 === step ? 700 : 400 }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", marginBottom: 16, fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ═══════ STEP 1: Öğrenci & Veli ═══════ */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Öğrenci Arama */}
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>👤 Öğrenci Seçimi</h3>
            {!selectedOgrenci ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && searchOgrenci()}
                    placeholder="Ad, soyad veya öğrenci no ile arayın..."
                    style={{ ...inputStyle, flex: "1 1 220px", minHeight: 44 }}
                    autoComplete="off"
                  />
                  <button onClick={searchOgrenci} disabled={searching || searchQuery.trim().length < 2}
                    style={{ ...btnPrimary, opacity: searching ? 0.6 : 1, minWidth: 100, minHeight: 44 }}>
                    {searching ? "..." : "Ara"}
                  </button>
                </div>
                {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                  <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 13 }}>En az 2 karakter girin.</p>
                )}
                {searchError && (
                  <p style={{ margin: "8px 0 0", color: "#dc2626", fontSize: 13 }}>{searchError}</p>
                )}
                {searchResults.length > 0 && (
                  <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, maxHeight: 250, overflow: "auto" }}>
                    {searchResults.map((o: any) => (
                      <div key={o.id} onClick={() => selectOgrenci(o)}
                        style={{ padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", minHeight: 44 }}
                        onMouseOver={e => (e.currentTarget.style.background = "#f0f9ff")}
                        onMouseOut={e => (e.currentTarget.style.background = "")}>
                        <span style={{ fontWeight: 600 }}>{o.ad || o.tam_ad?.split(' ')[0]} {o.soyad || o.tam_ad?.split(' ').slice(1).join(' ')}</span>
                        <span style={{ color: "#6b7280", fontSize: 13 }}>
                          {[o.ogrenci_no, o.sinif, o.tc_kimlik_no ? `${o.tc_kimlik_no.slice(0, 3)}***` : null].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "#f0fdf4", borderRadius: 8 }}>
                <div>
                  <strong>{selectedOgrenci.tam_ad || `${selectedOgrenci.ad} ${selectedOgrenci.soyad}`}</strong>
                  {(selectedOgrenci.ogrenci_no || selectedOgrenci.tc_kimlik_no) && (
                    <span style={{ marginLeft: 12, color: "#6b7280", fontSize: 13 }}>{selectedOgrenci.ogrenci_no || selectedOgrenci.tc_kimlik_no}</span>
                  )}
                  {paketData?.kayit && (
                    <span style={{ marginLeft: 12, color: "#6b7280", fontSize: 13 }}>
                      {paketData.kayit.sinif} — {paketData.kayit.egitim_yili_adi}
                    </span>
                  )}
                </div>
                <button onClick={() => { setSelectedOgrenci(null); setPaketData(null); setSelectedPaketIdx(null); setSelectedOzelDersIdxs(new Set()); setSelectedDenemePaketIdxs(new Set()); setKalemler([]); setSelectedVeliId(""); }}
                  style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}>
                  Değiştir
                </button>
              </div>
            )}
            {paketLoading && <p style={{ color: "#6b7280", marginTop: 8 }}>Paket bilgileri yükleniyor...</p>}
          </div>

          {/* Mevcut Sözleşme Uyarısı */}
          {paketData?.mevcut_sozlesme && !isEditMode && (
            <div style={{
              padding: 16, background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 12,
              display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontWeight: 700, color: "#92400e", fontSize: 15, marginBottom: 4 }}>
                  ⚠️ Bu öğrencinin bu eğitim yılında zaten bir sözleşmesi var
                </div>
                <div style={{ color: "#78350f", fontSize: 13 }}>
                  <strong>{paketData.mevcut_sozlesme.sozlesme_no}</strong> — {paketData.mevcut_sozlesme.paket_adi || "Ek Hizmetler"}
                  {" · "}
                  <span style={{ textTransform: "capitalize" }}>{paketData.mevcut_sozlesme.durum}</span>
                  {" · "}
                  {formatCurrency(paketData.mevcut_sozlesme.net_tutar)}
                </div>
                <div style={{ color: "#92400e", fontSize: 12, marginTop: 4 }}>
                  Yeni sözleşme oluşturmak yerine mevcut sözleşme üzerinden kalem ekleyebilir veya düzenleyebilirsiniz.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => router.push(`${href("sozlesme-olustur")}?edit=${paketData.mevcut_sozlesme!.id}`)}
                  style={{
                    padding: "8px 16px", background: "#f59e0b", color: "#fff", border: "none",
                    borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  }}>
                  ✏️ Sözleşmeyi Düzenle
                </button>
                <button
                  onClick={() => router.push(basePath)}
                  style={{
                    padding: "8px 16px", background: "#fff", color: "#92400e", border: "1px solid #f59e0b",
                    borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  }}>
                  ← Listeye Dön
                </button>
              </div>
            </div>
          )}

          {/* Veli Seçimi */}
          {paketData && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>👨‍👩‍👧 Veli Seçimi <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 13 }}>(Sözleşmeyi imzalayan kişi)</span></h3>
              {paketData.veliler.length === 0 ? (
                <p style={{ color: "#d97706", fontSize: 14 }}>⚠️ Bu öğrenciye tanımlı veli bulunamadı. Veli seçimi opsiyoneldir.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {paketData.veliler.map(v => (
                    <label key={v.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                        border: `2px solid ${selectedVeliId === v.id ? "#2563eb" : "#e5e7eb"}`,
                        borderRadius: 8, cursor: "pointer", background: selectedVeliId === v.id ? "#eff6ff" : "#fff",
                      }}>
                      <input type="radio" name="veli" checked={selectedVeliId === v.id}
                        onChange={() => setSelectedVeliId(v.id)}
                        style={{ accentColor: "#2563eb" }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{v.tam_ad}</span>
                        <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 13 }}>({v.veli_turu_label})</span>
                        {v.varsayilan && <span style={{ marginLeft: 8, color: "#059669", fontSize: 12, fontWeight: 600 }}>✓ Varsayılan</span>}
                      </div>
                      <span style={{ color: "#6b7280", fontSize: 13 }}>{v.telefon}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ STEP 2: Paketler & Kalemler ═══════ */}
      {step === 2 && paketData && (() => {
        // Paketleri kategorilerine göre ayır
        const grupDersleri = paketData.egitim_paketleri
          .map((p, idx) => ({ ...p, _idx: idx }))
          .filter(p => p.paket_turu === "grup_dersi");
        const ozelDersler = paketData.egitim_paketleri
          .map((p, idx) => ({ ...p, _idx: idx }))
          .filter(p => p.paket_turu === "ozel_ders");
        const denemePaketleri = paketData.egitim_paketleri
          .map((p, idx) => ({ ...p, _idx: idx }))
          .filter(p => p.paket_turu === "deneme");
        // Ek hizmetleri ayır: deneme türü olanlar ve olmayanlar
        const filteredEkHizmetler = selectableEkHizmetler.filter(eh => eh.hizmet_turu !== "deneme");
        const denemeEkHizmetler = selectableEkHizmetler.filter(eh => eh.hizmet_turu === "deneme");
        const dahilEkHizmetler = (paketData.dahil_hizmetler || []).filter(d => d.hizmet_turu !== "deneme");
        const dahilDenemeHizmetler = (paketData.dahil_hizmetler || []).filter(d => d.hizmet_turu === "deneme");

        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Grup Dersleri */}
          {grupDersleri.length > 0 && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>👥 Grup Dersleri <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 13 }}>(Tek seçim)</span></h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grupDersleri.map(p => (
                  <label key={p.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                      border: `2px solid ${selectedPaketIdx === p._idx ? "#3b82f6" : "#e5e7eb"}`,
                      borderRadius: 8, cursor: "pointer", background: selectedPaketIdx === p._idx ? "#eff6ff" : "#fff",
                    }}>
                    <input type="radio" name="grupDersi" checked={selectedPaketIdx === p._idx}
                      onChange={() => setSelectedPaketIdx(prev => prev === p._idx ? null : p._idx)}
                      style={{ accentColor: "#3b82f6" }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{p.paket_adi}</span>
                      <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 13 }}>({p.paket_turu_label})</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 700, color: "#059669" }}>{formatCurrency(p.kdv_dahil_fiyat)}</span>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>KDV Hariç: {formatCurrency(p.fiyat)}</div>
                    </div>
                  </label>
                ))}
                {/* Seçimi kaldır butonu */}
                {selectedPaketIdx !== null && grupDersleri.some(p => p._idx === selectedPaketIdx) && (
                  <button onClick={() => setSelectedPaketIdx(null)}
                    style={{ alignSelf: "flex-start", padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                    ✕ Seçimi Kaldır
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Özel Dersler — Çoklu Seçim */}
          {ozelDersler.length > 0 && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>🎓 Özel Dersler <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 13 }}>(Birden fazla seçilebilir)</span></h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ozelDersler.map(p => {
                  const isSelected = selectedOzelDersIdxs.has(p._idx);
                  return (
                    <label key={p.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                        border: `2px solid ${isSelected ? "#8b5cf6" : "#e5e7eb"}`,
                        borderRadius: 8, cursor: "pointer", background: isSelected ? "#f5f3ff" : "#fff",
                      }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => {
                          setSelectedOzelDersIdxs(prev => {
                            const n = new Set(prev);
                            n.has(p._idx) ? n.delete(p._idx) : n.add(p._idx);
                            return n;
                          });
                        }}
                        style={{ accentColor: "#8b5cf6" }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{p.paket_adi}</span>
                        <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 13 }}>({p.paket_turu_label})</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 700, color: "#059669" }}>{formatCurrency(p.kdv_dahil_fiyat)}</span>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>KDV Hariç: {formatCurrency(p.fiyat)}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pakete Dahil Hizmetler (ücretsiz — sözleşmeye eklenmez) */}
          {hasGrupDersiSelected && (dahilEkHizmetler.length > 0 || dahilDenemeHizmetler.length > 0) && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>✓ Pakete Dahil Hizmetler <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 13 }}>(Ücretsiz — sözleşmeye eklenmez)</span></h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...dahilEkHizmetler, ...dahilDenemeHizmetler].map(dh => (
                  <div key={dh.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      border: "2px solid #a7f3d0", borderRadius: 8, background: "#ecfdf5",
                    }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, color: "#1f2937" }}>{dh.ad}</span>
                      <span style={{
                        marginLeft: 8, fontSize: 11, padding: "3px 10px", background: "#22c55e", color: "white",
                        borderRadius: 20, fontWeight: 600,
                      }}>Grup Dersine Dahil</span>
                    </div>
                    <div style={{ fontWeight: 600, color: "#22c55e", fontSize: 14 }}>Ücretsiz</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deneme Paketleri — Grup dersi seçiliyken gizle */}
          {denemePaketleri.length > 0 && !hasGrupDersiSelected && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>📝 Deneme Paketleri <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 13 }}>(Birden fazla seçilebilir)</span></h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {denemePaketleri.map(p => {
                  const isSelected = selectedDenemePaketIdxs.has(p._idx);
                  return (
                    <label key={p.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                        border: `2px solid ${isSelected ? "#f59e0b" : "#e5e7eb"}`,
                        borderRadius: 8, cursor: "pointer", background: isSelected ? "#fffbeb" : "#fff",
                      }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => {
                          setSelectedDenemePaketIdxs(prev => {
                            const n = new Set(prev);
                            n.has(p._idx) ? n.delete(p._idx) : n.add(p._idx);
                            return n;
                          });
                        }}
                        style={{ accentColor: "#f59e0b" }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{p.paket_adi}</span>
                        <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 13 }}>({p.paket_turu_label})</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 700, color: "#059669" }}>{formatCurrency(p.kdv_dahil_fiyat)}</span>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>KDV Hariç: {formatCurrency(p.fiyat)}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deneme Ek Hizmetleri (Ek Hizmet Satışından gelen denemeler) — Grup dersi seçiliyken gizle */}
          {denemeEkHizmetler.length > 0 && !hasGrupDersiSelected && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>🎯 Deneme Hizmetleri <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 13 }}>(Ek hizmet satışından gelen denemeler)</span></h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {denemeEkHizmetler.map(eh => {
                  // Deneme paketi seçiliyse — bu hizmet pakete dahil, fiyat eklenmez
                  if (selectedDenemePaketIdxs.size > 0) {
                    return (
                      <div key={eh.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                          border: "2px solid #a7f3d0", borderRadius: 8, cursor: "default", background: "#ecfdf5",
                        }}>
                        <div style={{ flexShrink: 0, color: "#22c55e" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, color: "#1f2937" }}>{eh.ad}</span>
                            <span style={{
                              fontSize: 11, padding: "3px 10px", background: "#22c55e", color: "white",
                              borderRadius: 20, fontWeight: 600,
                            }}>✓ Deneme Paketine Dahil</span>
                          </div>
                        </div>
                        <div style={{ fontWeight: 600, color: "#22c55e", fontSize: 14, whiteSpace: "nowrap" }}>
                          Ücretsiz
                        </div>
                      </div>
                    );
                  }

                  const isSelected = selectedEkHizmetIds.has(eh.id);
                  return (
                    <label key={eh.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                        border: `2px solid ${isSelected ? "#7c3aed" : "#e5e7eb"}`,
                        borderRadius: 8, cursor: "pointer", background: isSelected ? "#f5f3ff" : "#fff",
                      }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => {
                          setSelectedEkHizmetIds(prev => {
                            const n = new Set(prev);
                            n.has(eh.id) ? n.delete(eh.id) : n.add(eh.id);
                            return n;
                          });
                        }}
                        style={{ accentColor: "#7c3aed" }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{eh.ad}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 700, color: "#059669" }}>{formatCurrency(eh.kdv_dahil_fiyat)}</span>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>KDV Hariç: {formatCurrency(eh.fiyat)}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ek Hizmetler */}
          {filteredEkHizmetler.length > 0 && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>➕ Ek Hizmetler</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredEkHizmetler.map(eh => (
                  <label key={eh.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      border: `2px solid ${selectedEkHizmetIds.has(eh.id) ? "#059669" : "#e5e7eb"}`,
                      borderRadius: 8, cursor: "pointer", background: selectedEkHizmetIds.has(eh.id) ? "#ecfdf5" : "#fff",
                    }}>
                    <input type="checkbox" checked={selectedEkHizmetIds.has(eh.id)}
                      onChange={() => {
                        setSelectedEkHizmetIds(prev => {
                          const n = new Set(prev);
                          n.has(eh.id) ? n.delete(eh.id) : n.add(eh.id);
                          return n;
                        });
                      }}
                      style={{ accentColor: "#059669" }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{eh.ad}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(eh.kdv_dahil_fiyat)}</span>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>KDV Hariç: {formatCurrency(eh.fiyat)}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Yeni Paket / Hizmet Ekleme Butonu ═══ */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => { setShowPaketEkle(true); if (!tumPaketler) loadTumPaketler(); }}
              style={{
                padding: "12px 24px", borderRadius: 10, cursor: "pointer",
                border: `2px dashed ${KURUM_COLOR}`, background: "#f0f7ff",
                color: KURUM_COLOR, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8,
              }}
            >
              ➕ Yeni Paket veya Hizmet Ekle
            </button>
          </div>

          {/* ═══ Yeni Paket Ekleme Modal ═══ */}
          {showPaketEkle && (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div onClick={() => setShowPaketEkle(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
              <div style={{ position: "relative", width: 720, maxHeight: "80vh", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {/* Modal Header */}
                <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>➕ Yeni Paket / Hizmet Ekle</h3>
                  <button onClick={() => setShowPaketEkle(false)} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>✕</button>
                </div>
                {/* Modal Body */}
                <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
                  {tumPaketlerLoading ? (
                    <p style={{ textAlign: "center", color: "#6b7280" }}>Paketler yükleniyor...</p>
                  ) : !tumPaketler ? (
                    <p style={{ textAlign: "center", color: "#dc2626" }}>Paketler yüklenemedi</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                      {/* Grup Dersleri */}
                      {tumPaketler.grupDersleri.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>👥 Grup Dersleri</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {tumPaketler.grupDersleri.map((p: any) => {
                              const zatenVar = isPaketKalemiMevcut("grup_dersi", p.id);
                              return (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: zatenVar ? "#f0fdf4" : "#f9fafb", borderRadius: 8, border: `1px solid ${zatenVar ? "#bbf7d0" : "#e5e7eb"}` }}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.ad}</span>
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#059669", fontWeight: 700 }}>{formatCurrency(p.kdv_dahil_fiyat)}</span>
                                    <span style={{ marginLeft: 4, fontSize: 11, color: "#9ca3af" }}>KDV Dahil</span>
                                  </div>
                                  {zatenVar ? (
                                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Mevcut</span>
                                  ) : (
                                    <button onClick={() => { addPaketFromCatalog(p, "grup_dersi"); }}
                                      style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: KURUM_COLOR, color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                      + Ekle
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Özel Dersler */}
                      {tumPaketler.ozelDersler.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🎓 Özel Dersler</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {tumPaketler.ozelDersler.map((p: any) => {
                              const zatenVar = isPaketKalemiMevcut("ozel_ders", p.id);
                              return (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: zatenVar ? "#f0fdf4" : "#f9fafb", borderRadius: 8, border: `1px solid ${zatenVar ? "#bbf7d0" : "#e5e7eb"}` }}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.ad}</span>
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#059669", fontWeight: 700 }}>{formatCurrency(p.kdv_dahil_fiyat)}</span>
                                    <span style={{ marginLeft: 4, fontSize: 11, color: "#9ca3af" }}>KDV Dahil</span>
                                  </div>
                                  {zatenVar ? (
                                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Mevcut</span>
                                  ) : (
                                    <button onClick={() => { addPaketFromCatalog(p, "ozel_ders"); }}
                                      style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#8b5cf6", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                      + Ekle
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Deneme Paketleri */}
                      {tumPaketler.denemeler.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📝 Deneme Paketleri</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {tumPaketler.denemeler.map((p: any) => {
                              const grupDahil = hasGrupDersiSelected && (paketData?.dahil_deneme_paket_ids || []).includes(p.id);
                              const zatenVar = isPaketKalemiMevcut("deneme", p.id);
                              return (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: zatenVar || grupDahil ? "#f0fdf4" : "#f9fafb", borderRadius: 8, border: `1px solid ${zatenVar || grupDahil ? "#bbf7d0" : "#e5e7eb"}` }}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.ad}</span>
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#059669", fontWeight: 700 }}>{formatCurrency(p.kdv_dahil_fiyat)}</span>
                                    <span style={{ marginLeft: 4, fontSize: 11, color: "#9ca3af" }}>KDV Dahil</span>
                                  </div>
                                  {grupDahil ? (
                                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>Grup dersine dahil</span>
                                  ) : zatenVar ? (
                                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Mevcut</span>
                                  ) : (
                                    <button onClick={() => { addPaketFromCatalog(p, "deneme"); }}
                                      style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#f59e0b", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                      + Ekle
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Deneme Hizmetleri (ek hizmet satışı) */}
                      {tumPaketler.ekHizmetler.filter((h: any) => h.hizmet_turu === "deneme" && !(hasGrupDersiSelected || selectedDenemePaketIdxs.size > 0)).length > 0 && (
                        <div>
                          <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🎯 Deneme Hizmetleri</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {tumPaketler.ekHizmetler.filter((h: any) => h.hizmet_turu === "deneme" && !(hasGrupDersiSelected || selectedDenemePaketIdxs.size > 0)).map((h: any) => {
                              const zatenVar = isEkHizmetMevcut(h.id);
                              return (
                                <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: zatenVar ? "#f0fdf4" : "#f9fafb", borderRadius: 8, border: `1px solid ${zatenVar ? "#bbf7d0" : "#e5e7eb"}` }}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{h.ad}</span>
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#059669", fontWeight: 700 }}>{formatCurrency(h.kdv_dahil_fiyat)}</span>
                                  </div>
                                  {zatenVar ? (
                                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Mevcut</span>
                                  ) : (
                                    <button onClick={() => { addEkHizmetFromCatalog(h); }}
                                      style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                      + Ekle
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Ek Hizmetler */}
                      {tumPaketler.ekHizmetler.filter((h: any) => h.hizmet_turu !== "deneme").length > 0 && (
                        <div>
                          <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🧩 Ek Hizmetler</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {tumPaketler.ekHizmetler.filter((h: any) => h.hizmet_turu !== "deneme").map((h: any) => {
                              const zatenVar = isEkHizmetMevcut(h.id);
                              return (
                                <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: zatenVar ? "#f0fdf4" : "#f9fafb", borderRadius: 8, border: `1px solid ${zatenVar ? "#bbf7d0" : "#e5e7eb"}` }}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{h.ad}</span>
                                    <span style={{ marginLeft: 6, fontSize: 11, color: "#6b7280" }}>({h.hizmet_turu_display})</span>
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#059669", fontWeight: 700 }}>{formatCurrency(h.kdv_dahil_fiyat)}</span>
                                    <span style={{ marginLeft: 4, fontSize: 11, color: "#9ca3af" }}>KDV Dahil</span>
                                  </div>
                                  {zatenVar ? (
                                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Mevcut</span>
                                  ) : (
                                    <button onClick={() => { addEkHizmetFromCatalog(h); }}
                                      style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                      + Ekle
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fiyat Tablosu — Net Fiyat, KDV & İndirim Edit */}
          {kalemler.length > 0 && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>💰 Fiyat Detayları <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 13 }}>(Brüt tutar, KDV oranı, indirim oranı veya indirim tutarı düzenlenebilir)</span></h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                      <th style={thStyle}>Kalem</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>KDV Hariç</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 110 }}>Brüt (KDV Dahil)</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 90 }}>KDV %</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>KDV Tutarı</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 90 }}>İndirim %</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 100 }}>İndirim (₺)</th>
                      <th style={{ ...thStyle, textAlign: "right", fontWeight: 700, color: "#059669" }}>Ödenecek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kalemler.map(k => (
                      <tr key={k.key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={tdStyle}>
                          {k.kalem_adi}
                          <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>
                            {k.kalem_turu === "paket" ? "Paket" : "Ek Hizmet"}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#6b7280" }}>{formatCurrency(k.kdv_haric)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <input type="number" min={0} step={0.01}
                            value={Math.round(k.brut_tutar * 100) / 100}
                            onChange={e => updateKalem(k.key, "brut_tutar", parseFloat(e.target.value) || 0)}
                            style={{ ...inputSmallStyle, width: 90, textAlign: "right" }} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <input type="number" min={0} max={50} step={1}
                            value={k.kdv_orani}
                            onChange={e => updateKalem(k.key, "kdv_orani", parseFloat(e.target.value) || 0)}
                            style={{ ...inputSmallStyle, width: 60, textAlign: "center" }} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#6b7280" }}>{formatCurrency(k.kdv_tutari)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <input type="number" min={0} max={100} step={0.01}
                            value={Math.round(k.indirim_orani * 100) / 100}
                            onChange={e => updateKalem(k.key, "indirim_orani", parseFloat(e.target.value) || 0)}
                            style={{ ...inputSmallStyle, width: 60, textAlign: "center" }} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <input type="number" min={0} step={1}
                            value={Math.round(k.indirim_tutari)}
                            onChange={e => updateKalem(k.key, "indirim_tutari", parseFloat(e.target.value) || 0)}
                            style={{ ...inputSmallStyle, width: 90, textAlign: "right", color: "#dc2626", fontWeight: 600 }} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <input type="number" min={0} step={0.01}
                            value={Math.round(k.net_tutar * 100) / 100}
                            onChange={e => updateKalem(k.key, "net_tutar", parseFloat(e.target.value) || 0)}
                            style={{ ...inputSmallStyle, width: 100, textAlign: "right", fontWeight: 700, color: "#059669" }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#f0fdf4", fontWeight: 700, borderTop: "2px solid #059669" }}>
                      <td style={tdStyle}>TOPLAM</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(toplamlar.kdvHaric)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(toplamlar.brut)}</td>
                      <td style={tdStyle}></td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(toplamlar.kdv)}</td>
                      <td style={tdStyle}></td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>
                        {toplamlar.indirim > 0 ? `-${formatCurrency(toplamlar.indirim)}` : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontSize: 16, color: "#059669" }}>{formatCurrency(toplamlar.net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ═══════ STEP 3: Ödeme Bilgileri ═══════ */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>💳 Ödeme Ayarları</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Ödeme Türü */}
              <div>
                <label style={labelStyle}>Ödeme Türü</label>
                <select
                  value={odemeTuru}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOdemeTuru(val);
                    if (val === "cek_senet") {
                      setSelectedOdemeYontemiId("");
                      if (taksitSayisi < 2) setTaksitSayisi(2);
                      setTaksitPlanDirty(false);
                    }
                  }}
                  style={inputStyle}
                >
                  <option value="pesin">Peşin</option>
                  <option value="taksitli">Taksitli</option>
                  <option value="cek_senet">Çek / Senet</option>
                </select>
                {odemeTuru === "cek_senet" && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#b45309" }}>
                    Mali hesap sözleşmede seçilmez; tahsilatta belirlenir. Her taksit satırında ödeme yöntemi seçin.
                  </p>
                )}
              </div>
              {(odemeTuru === "pesin" || odemeTuru === "taksitli") && (
                <div>
                  <label style={labelStyle}>Ödeme Yöntemi <span style={{ color: "#dc2626" }}>*</span></label>
                  <select
                    value={selectedOdemeYontemiId}
                    onChange={e => setSelectedOdemeYontemiId(e.target.value ? Number(e.target.value) : "")}
                    style={inputStyle}
                  >
                    <option value="">Seçiniz...</option>
                    {paketData?.odeme_yontemleri?.map((oy) => (
                      <option key={oy.id} value={oy.id}>
                        {oy.ad}{isCekSenetYontem(oy) ? " (çek/senet)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Başlangıç Tarihi */}
              <div>
                <label style={labelStyle}>Sözleşme Başlangıç Tarihi</label>
                <input type="date" value={baslangicTarihi} onChange={e => setBaslangicTarihi(e.target.value)} style={inputStyle} />
              </div>
              {/* Bitiş Tarihi — kritik alan */}
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{
                  padding: "12px 14px", borderRadius: 10, marginBottom: 10,
                  background: bitisTarihi ? "#fffbeb" : "#fef2f2",
                  border: `1px solid ${bitisTarihi ? "#fde68a" : "#fecaca"}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>
                    ⚠️ Sözleşme Bitiş Tarihi (zorunlu)
                  </div>
                  <div style={{ fontSize: 12, color: "#78716c", marginBottom: 8 }}>
                    Eğitim tamamlanma / sözleşme sonu tarihi. Varsayılan olarak eğitim yılı sonu (30 Haziran) önerilir.
                  </div>
                  <input
                    type="date"
                    value={bitisTarihi}
                    onChange={(e) => setBitisTarihi(e.target.value)}
                    style={{ ...inputStyle, borderColor: bitisTarihi ? "#f59e0b" : "#dc2626", maxWidth: 220 }}
                  />
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notlar</label>
                <textarea value={notlar} onChange={e => setNotlar(e.target.value)}
                  rows={2} placeholder="Sözleşme ile ilgili notlar..."
                  style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>
          </div>

          {/* ═══ GELİŞMİŞ TAKSİT PLANI OLUŞTURUCU ═══ */}
          {odemeTuruTaksitPlaniMi(odemeTuru) && toplamlar.net > 0 && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>{odemeTuru === "cek_senet" ? "📄 Çek / Senet Planı" : "📅 Taksit Planı Oluşturucu"}</h3>

              {/* Finans Özeti Kartları */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Net Tutar", value: formatCurrency(toplamlar.net), color: KURUM_COLOR, bg: "#f0f7ff", border: "#dbeafe" },
                  { label: "Peşinat", value: pesinatVal > 0 ? formatCurrency(pesinatVal) : "-", color: "#059669", bg: "#ecfdf5", border: "#bbf7d0" },
                  { label: "Taksitlenecek", value: formatCurrency(toplamlar.net - pesinatVal), color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
                ].map((c, i) => (
                  <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: c.bg, border: `1px solid ${c.border}` }}>
                    <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 3 }}>{c.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* ── Peşinat ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, padding: 16, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <div>
                  <label style={labelStyle}>💰 Peşinat (₺) <span style={{ color: "#9ca3af", fontWeight: 400 }}>opsiyonel</span></label>
                  <input type="number" min={0} step="1000" value={pesinatTutar}
                    onChange={(e) => { setPesinatTutar(e.target.value); setTaksitPlanDirty(false); }}
                    placeholder="0" style={inputStyle} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                  {pesinatVal > 0 && (
                    <div style={{ fontSize: 13, color: "#374151", padding: "8px 14px", borderRadius: 8, background: "#ecfdf5", border: "1px solid #bbf7d0", width: "100%" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span>Peşinat:</span>
                        <span style={{ fontWeight: 700, color: "#059669" }}>{formatCurrency(pesinatVal)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Taksitlenecek kalan:</span>
                        <span style={{ fontWeight: 700, color: "#d97706" }}>{formatCurrency(Math.max(0, toplamlar.net - pesinatVal))}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Plan parametreleri */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Taksit Sayısı {pesinatVal > 0 && <span style={{ color: "#9ca3af", fontWeight: 400 }}>(peşinat dahil)</span>}</label>
                  <input type="number" min={1} max={48} value={taksitSayisi}
                    onChange={(e) => applyTaksitSayisi(parseInt(e.target.value, 10) || 1)}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>İlk Vade</label>
                  <input type="date" value={ilkOdemeTarihi}
                    onChange={(e) => { setIlkOdemeTarihi(e.target.value); setTaksitPlanDirty(false); }}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Periyot</label>
                  <select value={taksitPeriyodu}
                    onChange={(e) => { setTaksitPeriyodu(e.target.value); setTaksitPlanDirty(false); }}
                    style={inputStyle}>
                    {Object.entries(taksitPeriyoduLabel).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button type="button"
                    onClick={() => applyTaksitSayisi(taksitSayisi)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${KURUM_COLOR}`, background: "#f0f7ff", color: KURUM_COLOR, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                    ↻ Eşit Böl
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                {odemeTuru === "cek_senet"
                  ? "Her taksit satırında ödeme yöntemi seçin (çek, nakit, havale vb.)."
                  : "Taksit sayısı girildiğinde plan otomatik oluşur. Satırları düzenlerseniz manuel plan olarak kaydedilir."}
                {!paketData?.odeme_yontemleri?.length && (
                  <span style={{ display: "block", marginTop: 6, color: "#b45309" }}>
                    Ödeme yöntemi listesi boş — Finans → Tanımlar → Ödeme Yöntemleri&apos;nden tanım ekleyin.
                  </span>
                )}
              </div>

              {/* Düzenlenebilir taksit tablosu */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 12, background: "#fafafa", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "grid", gridTemplateColumns: odemeTuru === "cek_senet" ? "40px 1fr 1fr 1fr 40px" : "40px 1fr 1fr 40px", gap: 8, fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                  <span>#</span><span>Tutar (₺)</span><span>Vade Tarihi</span>
                  {odemeTuru === "cek_senet" && <span>Ödeme Yöntemi</span>}
                  <span></span>
                </div>
                {manuelRows.map((row, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: odemeTuru === "cek_senet" ? "40px 1fr 1fr 1fr 40px" : "40px 1fr 1fr 40px", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{i + 1}</span>
                    <input type="number" min="0" step="1" value={row.tutar}
                      onChange={(e) => handleManuelTutarChange(i, e.target.value)}
                      style={inputSmallStyle} placeholder="Tutar" />
                    <input type="date" value={row.vade_tarihi}
                      onChange={(e) => handleManuelDateChange(i, e.target.value)}
                      style={inputSmallStyle} />
                    {odemeTuru === "cek_senet" && (
                      <select
                        value={row.odeme_yontemi_id ?? ""}
                        onChange={(e) => {
                          const rows = [...manuelRows];
                          rows[i].odeme_yontemi_id = e.target.value ? Number(e.target.value) : "";
                          setManuelRows(rows);
                          setTaksitPlanDirty(true);
                        }}
                        style={inputSmallStyle}
                      >
                        <option value="">Seçiniz...</option>
                        {paketData?.odeme_yontemleri?.map((oy) => (
                          <option key={oy.id} value={oy.id}>
                            {oy.ad}{isCekSenetYontem(oy) ? " (çek/senet)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" onClick={() => {
                      if (manuelRows.length <= 1) return;
                      applyTaksitSayisi(taksitSayisi - 1);
                    }}
                      disabled={manuelRows.length <= 1}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, opacity: manuelRows.length <= 1 ? 0.3 : 1 }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => applyTaksitSayisi(taksitSayisi + 1)}
                  style={{ padding: "8px 0", borderRadius: 6, border: "1px dashed #d1d5db", background: "#fff", fontSize: 12, cursor: "pointer", color: KURUM_COLOR, fontWeight: 600 }}>
                  + Taksit Ekle
                </button>
                <div style={{ padding: 10, borderRadius: 8, background: Math.abs(manuelToplam - hedefTutar) < 1 ? "#ecfdf5" : "#fef2f2", border: `1px solid ${Math.abs(manuelToplam - hedefTutar) < 1 ? "#bbf7d0" : "#fecaca"}` }}>
                  <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                    <span>Plan Toplamı:</span>
                    <span style={{ fontWeight: 700 }}>{formatCurrency(manuelToplam)}</span>
                  </div>
                  <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                    <span>Hedef (Net):</span>
                    <span style={{ fontWeight: 700 }}>{formatCurrency(hedefTutar)}</span>
                  </div>
                  {Math.abs(manuelToplam - hedefTutar) >= 1 && (
                    <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>⚠️ Fark: {formatCurrency(Math.abs(manuelToplam - hedefTutar))}</div>
                  )}
                </div>
              </div>

              {/* ── Taksit Planı Önizleme Tablosu ── */}
              {taksitPreview.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📋 Oluşacak Taksit Planı</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                        <th style={thStyle}>Taksit No</th>
                        <th style={thStyle}>Vade Tarihi</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taksitPreview.map(t => (
                        <tr key={t.taksit_no} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={tdStyle}>{t.taksit_no}. Taksit</td>
                          <td style={tdStyle}>{formatDate(t.vade_tarihi)}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{formatCurrency(t.tutar)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f0fdf4", fontWeight: 700, borderTop: "2px solid #059669" }}>
                        <td style={tdStyle} colSpan={2}>TOPLAM</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#059669" }}>
                          {formatCurrency(taksitPreview.reduce((s, t) => s + t.tutar, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ STEP 4: Özet & Onay ═══════ */}
      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Genel Bilgiler */}
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>📋 Sözleşme Özeti</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <SummaryRow label="Öğrenci" value={selectedOgrenci ? `${selectedOgrenci.ad} ${selectedOgrenci.soyad}` : "-"} />
              <SummaryRow label="Veli" value={
                paketData?.veliler.find(v => v.id === selectedVeliId)
                  ? `${paketData.veliler.find(v => v.id === selectedVeliId)!.tam_ad} (${paketData.veliler.find(v => v.id === selectedVeliId)!.veli_turu_label})`
                  : "Seçilmedi"
              } />
              <SummaryRow label="Sınıf" value={paketData?.kayit.sinif || "-"} />
              <SummaryRow label="Eğitim Yılı" value={paketData?.kayit.egitim_yili_adi || "-"} />
              <SummaryRow label="Başlangıç" value={formatDate(baslangicTarihi)} />
              <SummaryRow label="Bitiş" value={formatDate(bitisTarihi)} />
              <SummaryRow label="Ödeme Türü" value={
                odemeTuru === "pesin"
                  ? "Peşin"
                  : odemeTuru === "cek_senet"
                    ? `Çek / Senet (${taksitSayisi} taksit)`
                    : `Taksitli (${taksitSayisi} taksit)`
              } />
              {odemeTuru !== "cek_senet" && (
                <SummaryRow label="Ödeme Yöntemi" value={
                  paketData?.odeme_yontemleri?.find(oy => oy.id === selectedOdemeYontemiId)
                    ? `${paketData.odeme_yontemleri.find(oy => oy.id === selectedOdemeYontemiId)!.ad}`
                    : "Seçilmedi"
                } />
              )}
            </div>
          </div>

          {/* Fiyat Özeti */}
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>💰 Fiyat Özeti</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                  <th style={thStyle}>Kalem</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Brüt</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>KDV</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>İndirim</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {kalemler.map(k => (
                  <tr key={k.key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={tdStyle}>{k.kalem_adi}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(k.brut_tutar)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(k.kdv_tutari)} (%{k.kdv_orani})</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>
                      {k.indirim_tutari > 0 ? `-${formatCurrency(k.indirim_tutari)} (%${k.indirim_orani})` : "-"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{formatCurrency(k.net_tutar)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f0fdf4", fontWeight: 700, borderTop: "2px solid #059669" }}>
                  <td style={tdStyle}>TOPLAM</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(toplamlar.brut)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(toplamlar.kdv)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>
                    {toplamlar.indirim > 0 ? `-${formatCurrency(toplamlar.indirim)}` : "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontSize: 16, color: "#059669" }}>{formatCurrency(toplamlar.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Taksit Plan */}
          {taksitPreview.length > 0 && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>📅 Taksit Planı</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {taksitPreview.map(t => (
                  <div key={t.taksit_no} style={{ padding: "8px 12px", background: "#f9fafb", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "#6b7280" }}>{t.taksit_no}. Taksit — {formatDate(t.vade_tarihi)}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{formatCurrency(t.tutar)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ Navigation Buttons ═══════ */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
        {step > 1 ? (
          <button onClick={() => setStep(s => s - 1)}
            style={{ padding: "10px 24px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            ← Geri
          </button>
        ) : <div />}

        {step < totalSteps ? (
          <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
            style={{ ...btnPrimary, opacity: canNext() ? 1 : 0.5, fontSize: 14, fontWeight: 600 }}>
            İleri →
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting}
            style={{
              padding: "10px 32px", borderRadius: 8, border: "none", cursor: submitting ? "not-allowed" : "pointer",
              background: submitting ? "#93c5fd" : "#059669", color: "#fff", fontSize: 15, fontWeight: 700,
            }}>
            {submitting ? (isEditMode ? "Güncelleniyor..." : "Oluşturuluyor...") : (isEditMode ? "✓ Sözleşmeyi Güncelle" : "✓ Sözleşmeyi Oluştur")}
          </button>
        )}
      </div>
    </div>
    </>
  );
}

/* ───────── Summary Row ───────── */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ color: "#6b7280", fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{value}</span>
    </div>
  );
}

/* ───────── Styles ───────── */
const cardStyle: React.CSSProperties = {
  padding: 20, background: "#fff", borderRadius: 12,
  border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};
const cardTitleStyle: React.CSSProperties = { margin: "0 0 16px", fontSize: 16, fontWeight: 700 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db",
  borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
};
const inputSmallStyle: React.CSSProperties = {
  padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none",
};
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, fontSize: 13, marginBottom: 4, color: "#374151" };
const btnPrimary: React.CSSProperties = {
  padding: "10px 24px", borderRadius: 8, border: "none",
  background: "#2563eb", color: "#fff", cursor: "pointer",
};
const thStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "#6b7280" };
const tdStyle: React.CSSProperties = { padding: "8px 12px" };
