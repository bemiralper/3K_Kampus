"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import UnsavedChangesModal from "@/components/UnsavedChangesModal";
import { 
  WizardData, 
  MetadataResponse, 
  DistrictOption, 
  PackageInfo, 
  EkHizmetInfo,
  DenemePaketiInfo,
  YayinPaketiInfo,
  StepType,
  RenewalState,
  TcCheckResponse,
} from "./types";
import { validateTcKimlik, hasWizardUserInput } from "./utils";
import { apiFetch } from "@/lib/api";
import { isKimlikConflictCode, useKimlikLookup } from "@/hooks/useKimlikLookup";
import type { KimlikResolveResponse } from "@/lib/kimlik-api";
import KimlikStep from "./steps/KimlikStep";
import KurumsalStep from "./steps/KurumsalStep";
import AdresStep from "./steps/AdresStep";
import VeliStep from "./steps/VeliStep";
import PaketStep from "./steps/PaketStep";
import OzetStep from "./steps/OzetStep";

const STEPS: { id: StepType; label: string; icon: JSX.Element }[] = [
  {
    id: "kimlik",
    label: "Kimlik",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "kurumsal",
    label: "Kurumsal",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
  {
    id: "adres",
    label: "Adres",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    id: "veli",
    label: "Veli",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "paket",
    label: "Paket",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    id: "ozet",
    label: "Özet",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

const initialData: WizardData = {
  student: {
    kayit_turu: undefined,
    tc_kimlik_no: "",
    ad: "",
    soyad: "",
    dogum_tarihi: "",
    cinsiyet: undefined,
    email: "",
    telefon: "",
  },
  enrollment: {
    ogrenci_no: "",
    egitim_yili: undefined,
    sinif_seviyesi: undefined,
    alan: undefined,
    sube: undefined,
    giris_tarihi: new Date().toISOString().split("T")[0],
    giris_turu: undefined,
    geldigi_okul: "",
    school_id: null,
    school_ad: "",
    referans: "",
  },
  address: {
    adres_turu: undefined,
    il: undefined,
    ilce: undefined,
    posta_kodu: "",
    acik_adres: "",
  },
  guardians: [],
  package: {
    paketler: [],
    ek_hizmet_ids: [],
    deneme_paketi_ids: [],
    yayin_paketi_ids: [],
  },
  veliSecimi: null,
};

const DRAFT_STORAGE_KEY = "ogrenci_kayit_wizard_draft";

function clearWizardStorage() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function OgrenciKayitClient() {
  const { href: ogrenciHref } = useOgrenciPath();
  const { href: odemeHref } = useOdemePath();
  const { activeSube, activeEgitimYili } = useKurum();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [ekHizmetler, setEkHizmetler] = useState<EkHizmetInfo[]>([]);
  const [denemePaketleri, setDenemePaketleri] = useState<DenemePaketiInfo[]>([]);
  const [yayinPaketleri, setYayinPaketleri] = useState<YayinPaketiInfo[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packageLoadError, setPackageLoadError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredStudent, setRegisteredStudent] = useState<any>(null);
  const [renewalState, setRenewalState] = useState<RenewalState>({
    isRenewal: false,
  });
  const [kimlikConflictNonce, setKimlikConflictNonce] = useState(0);
  const isDirty = useMemo(() => hasWizardUserInput(data), [data]);

  const { leaveDialogProps, markClean, requestNavigation } = useUnsavedChangesGuard({
    isDirty,
    title: "Kayıt Tamamlanmadı",
    message:
      "Girdiğiniz bilgiler henüz kaydedilmedi. Bu sayfadan ayrılırsanız tüm veriler kaybolacaktır.",
  });

  const handleConfirmLeave = useCallback(() => {
    clearWizardStorage();
    markClean();
    leaveDialogProps.onConfirm();
  }, [leaveDialogProps.onConfirm, markClean]);

  const handleDataChange = useCallback((value: WizardData | ((prev: WizardData) => WizardData)) => {
    setData(value);
  }, []);

  useEffect(() => {
    return () => {
      clearWizardStorage();
    };
  }, []);

  // Metadata yükle
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const result = await apiFetch<MetadataResponse>("/api/ogrenci-kayit/metadata/");
        if (!result.success || !result.data) throw new Error(result.error || "Metadata yüklenemedi");
        const meta = result.data;
        setMetadata(meta);
        
        const activeYear = meta.egitim_yillari?.find((y) => y.aktif_mi);
        const contextYearId = activeEgitimYili?.id;
        const defaultEntryType = meta.lookups.entry_type?.find((e) => e.code === "yeni_kayit");
        const defaultCity = meta.cities?.find((c) => c.is_default) || meta.cities?.[0];

        let defaultDistrictId: number | undefined;
        if (defaultCity) {
          try {
            const districtResult = await apiFetch<{ districts?: DistrictOption[] } | DistrictOption[]>(
              `/api/ogrenci-kayit/districts/?city_id=${defaultCity.id}`
            );
            if (districtResult.success && districtResult.data) {
              const raw = districtResult.data;
              const list = Array.isArray(raw) ? raw : raw.districts || [];
              const normalized = list.map((item) => ({
                id: item.id,
                ad: item.ad || "",
              }));
              setDistricts(normalized);
              defaultDistrictId = normalized.find((d) => d.ad === "Yakutiye")?.id;
            }
          } catch (districtError) {
            console.error("Varsayılan ilçe yükleme hatası:", districtError);
          }
        }

        setData((prev) => ({
          ...prev,
          enrollment: {
            ...prev.enrollment,
            egitim_yili: contextYearId || activeYear?.id || meta.egitim_yillari?.[0]?.id,
            giris_turu: defaultEntryType?.id || meta.lookups.entry_type?.[0]?.id,
          },
          address: defaultCity
            ? {
                ...prev.address,
                il: defaultCity.id,
                ilce: defaultDistrictId,
                ilce_adi: "",
              }
            : prev.address,
        }));
      } catch (error) {
        console.error("Metadata yükleme hatası:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, []);

  // Üst bardaki eğitim yılı = kayıt eğitim yılı (Eğitim Paketleri modülü ile aynı kapsam)
  useEffect(() => {
    if (!activeEgitimYili?.id) return;
    setData((prev) => {
      if (prev.enrollment.egitim_yili === activeEgitimYili.id) return prev;
      return {
        ...prev,
        enrollment: {
          ...prev.enrollment,
          egitim_yili: activeEgitimYili.id,
        },
      };
    });
  }, [activeEgitimYili?.id]);

  // Aktif şube (üst bar) = kayıt şubesi
  const prevSubeRef = useRef<number | undefined>();
  useEffect(() => {
    if (!activeSube?.id) return;
    const subeChanged = prevSubeRef.current !== undefined && prevSubeRef.current !== activeSube.id;
    prevSubeRef.current = activeSube.id;

    setData((prev) => ({
      ...prev,
      enrollment: {
        ...prev.enrollment,
        sube: activeSube.id,
        ...(subeChanged ? { sinif: undefined } : {}),
      },
      ...(subeChanged
        ? { package: { paketler: [], ek_hizmet_ids: [], deneme_paketi_ids: [], yayin_paketi_ids: [] } }
        : {}),
    }));

    if (subeChanged) {
      apiFetch<MetadataResponse>("/api/ogrenci-kayit/metadata/").then((result) => {
        if (result.success && result.data) setMetadata(result.data);
      });
    }
  }, [activeSube?.id]);

  // Paketleri yükle
  useEffect(() => {
    if (currentStep !== 4 || !activeSube?.id || !activeEgitimYili?.id) return;

    const fetchPackages = async () => {
      if (!activeSube?.id) {
        setPackageLoadError("Paket listesi için üst menüden şube seçin.");
        setPackages([]);
        setEkHizmetler([]);
        setDenemePaketleri([]);
        setYayinPaketleri([]);
        return;
      }

      setLoadingPackages(true);
      setPackageLoadError(null);
      try {
        const params = new URLSearchParams();
        if (data.enrollment.sinif_seviyesi) {
          params.append("sinif_seviyesi", data.enrollment.sinif_seviyesi.toString());
        }
        if (data.enrollment.alan) {
          params.append("alan", data.enrollment.alan.toString());
        }
        const result = await apiFetch<{
          packages?: PackageInfo[];
          ek_hizmetler?: EkHizmetInfo[];
          deneme_paketleri?: DenemePaketiInfo[];
          yayin_paketleri?: YayinPaketiInfo[];
          warnings?: string[];
        }>(`/api/ogrenci-kayit/packages/?${params}`);
        if (!result.success) {
          throw new Error(result.error || "Paketler yüklenemedi");
        }
        const payload = (result.data || result) as {
          packages?: PackageInfo[];
          ek_hizmetler?: EkHizmetInfo[];
          deneme_paketleri?: DenemePaketiInfo[];
          yayin_paketleri?: YayinPaketiInfo[];
          warnings?: string[];
        };
        const uniquePackages = Array.from(
          new Map((payload.packages || []).map((p) => [p.id, p])).values()
        );
        const uniqueEkHizmetler = Array.from(
          new Map((payload.ek_hizmetler || []).map((h) => [h.id, h])).values()
        );
        const uniqueDenemeler = Array.from(
          new Map((payload.deneme_paketleri || []).map((d) => [d.id, d])).values()
        );
        const uniqueYayinlar = Array.from(
          new Map((payload.yayin_paketleri || []).map((y) => [y.id, y])).values()
        );
        setPackages(uniquePackages);
        setEkHizmetler(uniqueEkHizmetler);
        setDenemePaketleri(uniqueDenemeler);
        setYayinPaketleri(uniqueYayinlar);

        const warningText = (payload.warnings || []).join(" ");
        if (
          uniquePackages.length === 0 &&
          uniqueEkHizmetler.length === 0 &&
          uniqueDenemeler.length === 0 &&
          uniqueYayinlar.length === 0
        ) {
          const yilLabel = activeEgitimYili
            ? `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}`
            : "seçili eğitim yılı";
          const subeLabel = activeSube?.ad || "seçili şube";
          setPackageLoadError(
            warningText ||
              `Bu şube (${subeLabel}) ve eğitim yılı (${yilLabel}) için tanımlı paket bulunamadı. Eğitim Paketleri modülünde üst bardaki şube ve eğitim yılının aynı olduğundan, paketlerin aktif ve (varsa) sınıf seviyesi eşleştiğinden emin olun.`
          );
        }

        const validPackageIds = new Set(uniquePackages.map((p) => p.id));
        setData((prev) => {
          const currentPaketler = prev.package.paketler || [];
          const filteredPaketler = currentPaketler.filter((id) => validPackageIds.has(id));
          if (filteredPaketler.length === currentPaketler.length) {
            return prev;
          }
          return {
            ...prev,
            package: {
              ...prev.package,
              paketler: filteredPaketler,
            },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Paketler yüklenemedi";
        setPackageLoadError(message);
        setPackages([]);
        setEkHizmetler([]);
        setDenemePaketleri([]);
        setYayinPaketleri([]);
        console.error("Paket yükleme hatası:", error);
      } finally {
        setLoadingPackages(false);
      }
    };

    fetchPackages();
  }, [
    currentStep,
    activeSube?.id,
    data.enrollment.sinif_seviyesi,
    data.enrollment.alan,
    activeEgitimYili?.id,
  ]);

  // İlçeleri yükle
  const fetchDistricts = useCallback(async (cityId: number) => {
    try {
      const result = await apiFetch<{ districts?: DistrictOption[] } | DistrictOption[]>(
        `/api/ogrenci-kayit/districts/?city_id=${cityId}`
      );
      if (!result.success || !result.data) throw new Error(result.error || "İlçeler yüklenemedi");
      const raw = result.data;
      const list = Array.isArray(raw) ? raw : raw.districts || [];
      const normalized = list.map((item) => ({
        id: item.id,
        ad: item.ad || "",
      }));
      setDistricts(normalized);
    } catch (error) {
      console.error("İlçe yükleme hatası:", error);
      setDistricts([]);
    }
  }, []);

  const fetchStudentNumber = useCallback(async (sinifSeviyesiId?: number) => {
    if (!sinifSeviyesiId) return;
    try {
      const result = await apiFetch<{ next_number?: string }>(
        `/api/ogrenci-kayit/next-student-number/?sinif_seviyesi=${sinifSeviyesiId}`
      );
      if (!result.success || !result.data?.next_number) {
        throw new Error(result.error || "Numara üretilemedi");
      }
      setData((prev) => ({
        ...prev,
        enrollment: {
          ...prev.enrollment,
          ogrenci_no: result.data!.next_number!,
        },
      }));
    } catch (error) {
      console.error("Numara üretme hatası:", error);
    }
  }, []);

  // Kayıt Yenileme kararı
  const handleRenewalDecision = useCallback((decision: "renew" | "new" | "cancel", tcResult: TcCheckResponse) => {
    if (decision === "renew" && tcResult.ogrenci) {
      const ogr = tcResult.ogrenci;
      const cinsiyetOpt = metadata?.lookups.gender?.find((g) => g.code === ogr.cinsiyet);
      const renewEntryType = metadata?.lookups.entry_type?.find((e) => e.code === "kayit_yenileme");

      const guardians = (tcResult.veliler || []).map((v) => ({
        yakinlik_turu: metadata?.lookups.guardian_type?.find((g) => g.code === v.veli_turu)?.id,
        tc_kimlik_no: v.tc_kimlik_no || "",
        ad: v.ad,
        soyad: v.soyad,
        email: v.email || "",
        telefon: v.telefon || "",
        meslek: v.meslek || "",
        is_sms_enabled: true,
        is_email_enabled: true,
        adres_ayni_mi: true,
      }));

      let addressPatch = {};
      if (tcResult.adres) {
        const city = metadata?.cities?.find(
          (c) => c.name === tcResult.adres!.il || c.ad === tcResult.adres!.il
        );
        const adresTuru = metadata?.lookups.address_type?.find(
          (a) => a.code === tcResult.adres!.adres_turu
        );
        addressPatch = {
          adres_turu: adresTuru?.id,
          il: city?.id,
          ilce_adi: tcResult.adres.ilce || "",
          posta_kodu: tcResult.adres.posta_kodu || "",
          acik_adres: tcResult.adres.acik_adres || "",
        };
        if (city?.id) {
          fetchDistricts(city.id);
        }
      }

      setData((prev) => ({
        ...prev,
        student: {
          ...prev.student,
          tc_kimlik_no: ogr.tc_kimlik_no,
          kisi_id: ogr.kisi_id ?? undefined,
          tc_locked: true,
          ad: ogr.ad,
          soyad: ogr.soyad,
          dogum_tarihi: ogr.dogum_tarihi || "",
          cinsiyet: cinsiyetOpt?.id || prev.student.cinsiyet,
          telefon: ogr.telefon || prev.student.telefon,
          email: ogr.email || prev.student.email,
        },
        enrollment: {
          ...prev.enrollment,
          giris_turu: renewEntryType?.id || prev.enrollment.giris_turu,
          sinif_seviyesi: tcResult.sonraki_seviye?.id || prev.enrollment.sinif_seviyesi,
        },
        guardians: guardians.length ? guardians : prev.guardians,
        veliSecimi: guardians.length ? "add" : prev.veliSecimi,
        address: tcResult.adres ? { ...prev.address, ...addressPatch } : prev.address,
      }));

      setRenewalState({
        isRenewal: true,
        tcLocked: true,
        existingOgrenciId: ogr.id,
        existingKisiId: ogr.kisi_id ?? undefined,
        previousEnrollment: tcResult.son_kayit,
        suggestedSeviye: tcResult.sonraki_seviye,
        existingVeliler: tcResult.veliler,
        existingAdres: tcResult.adres,
      });

      if (tcResult.sonraki_seviye) {
        fetchStudentNumber(tcResult.sonraki_seviye.id);
      }

    } else if (decision === "new" && tcResult.ogrenci) {
      // Yeni kayıt — sadece TC kalsın, diğer alanlar boş
      setRenewalState({ isRenewal: false });
    } else {
      // İptal
      setRenewalState({ isRenewal: false });
      setData((prev) => ({
        ...prev,
        student: { ...initialData.student },
        enrollment: {
          ...prev.enrollment,
          giris_turu: metadata?.lookups.entry_type?.find((e) => e.code === "yeni_kayit")?.id || prev.enrollment.giris_turu,
        },
      }));
    }
  }, [metadata, fetchStudentNumber, fetchDistricts]);

  const handleUseExistingStudent = useCallback(
    (tcResult: TcCheckResponse, kimlikResult: KimlikResolveResponse | null) => {
      handleRenewalDecision("renew", tcResult);
      const kisiId = kimlikResult?.kisi?.id || tcResult.ogrenci?.kisi_id;
      if (kisiId) {
        setData((prev) => ({
          ...prev,
          student: { ...prev.student, kisi_id: kisiId, tc_locked: true },
        }));
        setRenewalState((prev) => ({ ...prev, existingKisiId: kisiId, tcLocked: true }));
      }
    },
    [handleRenewalDecision],
  );

  // Validasyon
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0: // Kimlik
        if (!data.student.kayit_turu) newErrors.kayit_turu = "Kayıt türü seçiniz";
        if (!data.student.tc_kimlik_no) {
          newErrors.tc_kimlik_no = "TC Kimlik No giriniz";
        } else if (data.student.tc_kimlik_no.length !== 11) {
          newErrors.tc_kimlik_no = "TC Kimlik No 11 haneli olmalıdır";
        } else if (!validateTcKimlik(data.student.tc_kimlik_no)) {
          newErrors.tc_kimlik_no = "Geçersiz TC Kimlik No";
        }
        if (!data.student.ad.trim()) newErrors.ad = "Ad giriniz";
        if (!data.student.soyad.trim()) newErrors.soyad = "Soyad giriniz";
        if (!data.student.dogum_tarihi) newErrors.dogum_tarihi = "Doğum tarihi seçiniz";
        if (!data.student.cinsiyet) newErrors.cinsiyet = "Cinsiyet seçiniz";
        break;

      case 1: // Kurumsal
        if (!data.enrollment.ogrenci_no) newErrors.ogrenci_no = "Öğrenci numarası giriniz";
        if (!data.enrollment.egitim_yili) newErrors.egitim_yili = "Eğitim yılı seçiniz";
        if (!data.enrollment.sinif_seviyesi) newErrors.sinif_seviyesi = "Sınıf seviyesi seçiniz";
        // Alan seçimi zorunlu (eğer sınıf seviyesinin alanı varsa)
        const seviye = metadata?.sinif_seviyeleri.find(s => s.id === data.enrollment.sinif_seviyesi);
        if (seviye?.has_alan && !data.enrollment.alan) {
          newErrors.alan = "Alan seçimi zorunludur";
        }
        if (!data.enrollment.giris_tarihi) newErrors.giris_tarihi = "Giriş tarihi seçiniz";
        if (!data.enrollment.giris_turu) newErrors.giris_turu = "Giriş türü seçiniz";
        break;

      case 2: // Adres
        if (!data.address.adres_turu) newErrors.adres_turu = "Adres türü seçiniz";
        if (!data.address.il) newErrors.il = "İl seçiniz";
        if (districts.length > 0) {
          if (!data.address.ilce) newErrors.ilce = "İlçe seçiniz";
        } else {
          if (!data.address.ilce_adi?.trim()) newErrors.ilce = "İlçe giriniz";
        }
        if (!data.address.acik_adres.trim()) newErrors.acik_adres = "Açık adres giriniz";
        break;

      case 3: // Veli
        // Eğer öğrenci kendi velisi ise validasyon gerekmez
        if (data.veliSecimi === 'self') {
          break;
        }
        // Veli seçimi yapılmamışsa hata ver
        if (data.veliSecimi === null) {
          newErrors.veli_secimi = "Veli durumunu seçiniz";
          break;
        }
        // Veli ekleme seçildiyse validasyon yap
        data.guardians.forEach((guardian, index) => {
          if (!guardian.yakinlik_turu) {
            newErrors[`guardian_${index}_yakinlik_turu`] = "Yakınlık türü seçiniz";
          }
          if (!guardian.tc_kimlik_no) {
            newErrors[`guardian_${index}_tc_kimlik_no`] = "TC Kimlik No giriniz";
          } else if (guardian.tc_kimlik_no.length !== 11) {
            newErrors[`guardian_${index}_tc_kimlik_no`] = "TC Kimlik No 11 haneli olmalıdır";
          }
          if (!guardian.ad.trim()) {
            newErrors[`guardian_${index}_ad`] = "Ad giriniz";
          }
          if (!guardian.soyad.trim()) {
            newErrors[`guardian_${index}_soyad`] = "Soyad giriniz";
          }
          if (!guardian.telefon.trim()) {
            newErrors[`guardian_${index}_telefon`] = "Telefon giriniz";
          }
          // Farklı adres seçildiyse adres validasyonu
          if (!guardian.adres_ayni_mi && guardian.adres) {
            if (!guardian.adres.il) {
              newErrors[`guardian_${index}_adres_il`] = "İl seçiniz";
            }
            if (!guardian.adres.acik_adres?.trim()) {
              newErrors[`guardian_${index}_adres_acik_adres`] = "Açık adres giriniz";
            }
          }
        });
        break;

      case 4: // Paket
        {
          const hasPaket = (data.package.paketler || []).length > 0;
          const hasEkHizmet = (data.package.ek_hizmet_ids || []).length > 0;
          const hasDenemePaketi = (data.package.deneme_paketi_ids || []).length > 0;
          const hasYayinPaketi = (data.package.yayin_paketi_ids || []).length > 0;
          if (!hasPaket && !hasEkHizmet && !hasDenemePaketi && !hasYayinPaketi) {
            newErrors.paket = "En az bir grup/özel ders paketi, ek hizmet, deneme veya yayın paketi seçiniz";
          }
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // İleri git
  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  // Geri git
  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  // Kaydet
  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setSaving(true);
    try {
      const { sube: _sube, ...enrollmentPayload } = data.enrollment;
      const payload = {
        student: {
          ...data.student,
          telefon: data.student.telefon || undefined,
        },
        enrollment: enrollmentPayload,
        address: data.address,
        guardians: data.guardians,
        package: data.package,
        veliSecimi: data.veliSecimi,
      };

      const result = await apiFetch<Record<string, unknown>>("/api/ogrenci-kayit/register/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!result.success || !result.data) {
        const code = (result as { code?: string }).code;
        if (isKimlikConflictCode(code)) {
          setKimlikConflictNonce((n) => n + 1);
          setCurrentStep(0);
          setErrors({
            submit: result.error || "Kimlik çakışması tespit edildi. Lütfen mevcut kişiyi kullanın.",
          });
          return;
        }
        throw new Error(result.error || "Kayıt başarısız");
      }

      clearWizardStorage();
      setRegisteredStudent({
        ...result.data,
        ad: result.data.ad ?? data.student.ad,
        soyad: result.data.soyad ?? data.student.soyad,
        tam_ad: result.data.tam_ad ?? `${data.student.ad} ${data.student.soyad}`.trim(),
        ogrenci_no: result.data.ogrenci_no ?? data.enrollment.ogrenci_no,
      });
      markClean();
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error("Kayıt hatası:", error);
      setErrors({ submit: error.message || "Kayıt sırasında bir hata oluştu" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="wizard-loading-screen">
        <div className="spinner-large"></div>
        <p>Yükleniyor...</p>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="wizard-error-screen">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h3>Veriler Yüklenemedi</h3>
        <p>Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.</p>
        <button onClick={() => window.location.reload()} className="wizard-btn-primary">
          Sayfayı Yenile
        </button>
      </div>
    );
  }

  return (
    <>
      <UnsavedChangesModal {...leaveDialogProps} onConfirm={handleConfirmLeave} />
    <div className="wizard-container">
      {/* Header */}
      <div className="wizard-header">
        <div className="wizard-title">
          <h1>Yeni Öğrenci Kaydı</h1>
          <p>Adım adım öğrenci kayıt işlemini tamamlayın</p>
        </div>
      </div>

      {/* Steps Navigation */}
      <div className="wizard-steps-nav">
        {STEPS.map((step, index) => (
          <div
            key={step.id}
            className={`wizard-step-item ${
              index === currentStep
                ? "active"
                : index < currentStep
                ? "completed"
                : "pending"
            }`}
            onClick={() => {
              if (index >= currentStep) return;
              requestNavigation(() => setCurrentStep(index));
            }}
          >
            <div className="step-indicator">
              {index < currentStep ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <div className="step-info">
              {step.icon}
              <span className="step-label">{step.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="wizard-content">
        {currentStep === 0 && (
          <KimlikStep
            data={data}
            metadata={metadata}
            errors={errors}
            onChange={handleDataChange}
            renewalState={renewalState}
            conflictNonce={kimlikConflictNonce}
            onRenewalDecision={handleRenewalDecision}
            onUseExistingStudent={handleUseExistingStudent}
          />
        )}
        {currentStep === 1 && (
          <KurumsalStep
            data={data}
            metadata={metadata}
            errors={errors}
            onChange={handleDataChange}
            onStudentNumberRefresh={fetchStudentNumber}
          />
        )}
        {currentStep === 2 && (
          <AdresStep
            data={data}
            metadata={metadata}
            districts={districts}
            errors={errors}
            onChange={handleDataChange}
            onCityChange={fetchDistricts}
          />
        )}
        {currentStep === 3 && (
          <VeliStep
            data={data}
            metadata={metadata}
            errors={errors}
            onChange={handleDataChange}
            renewalState={renewalState}
          />
        )}
        {currentStep === 4 && (
          <PaketStep
            data={data}
            errors={errors}
            onChange={handleDataChange}
            packages={packages}
            ekHizmetler={ekHizmetler}
            denemePaketleri={denemePaketleri}
            yayinPaketleri={yayinPaketleri}
            loadingPackages={loadingPackages}
            packageLoadError={packageLoadError}
            studentAlanId={data.enrollment.alan}
          />
        )}
        {currentStep === 5 && (
          <OzetStep
            data={data}
            metadata={metadata}
            districts={districts}
            packages={packages}
            ekHizmetler={ekHizmetler}
            denemePaketleri={denemePaketleri}
            yayinPaketleri={yayinPaketleri}
          />
        )}

        {/* Submit Error */}
        {errors.submit && (
          <div className="wizard-submit-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {errors.submit}
          </div>
        )}
      </div>

      {/* ═══ Başarılı Kayıt Modal ═══ */}
      {showSuccessModal && registeredStudent && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: 0, width: 460, maxWidth: "90vw",
            boxShadow: "0 25px 50px rgba(0,0,0,0.25)", overflow: "hidden",
            animation: "modalSlideIn 0.3s ease-out",
          }}>
            {/* Header — Başarı */}
            <div style={{
              background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              padding: "32px 24px 24px", textAlign: "center", position: "relative",
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 12px", backdropFilter: "blur(10px)",
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 700 }}>Kayıt Başarılı!</h2>
              <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
                Öğrenci başarıyla sisteme kaydedildi
              </p>
            </div>

            {/* Öğrenci Bilgisi */}
            <div style={{ padding: "20px 24px 12px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: 14, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", background: "#059669",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: 16,
                }}>
                  {(registeredStudent.ad || registeredStudent.tam_ad || "Ö").charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>
                    {registeredStudent.tam_ad || `${registeredStudent.ad || ""} ${registeredStudent.soyad || ""}`}
                  </div>
                  {registeredStudent.ogrenci_no && (
                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>No: {registeredStudent.ogrenci_no}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Aksiyon Butonları */}
            <div style={{ padding: "8px 24px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Sözleşme Oluştur — Ana buton */}
              <button
                onClick={() => {
                  if (registeredStudent.id) {
                    sessionStorage.setItem(
                      "sozlesme_ogrenci_prefill",
                      JSON.stringify({
                        id: registeredStudent.id,
                        ad: registeredStudent.ad,
                        soyad: registeredStudent.soyad,
                        tam_ad: registeredStudent.tam_ad,
                        ogrenci_no: registeredStudent.ogrenci_no,
                      }),
                    );
                  }
                  requestNavigation(`${odemeHref("sozlesme-olustur")}?ogrenci_id=${registeredStudent.id}`);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 18px", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #0262a7 0%, #0380d4 100%)",
                  color: "#fff", cursor: "pointer", textAlign: "left", transition: "transform 0.15s, box-shadow 0.15s",
                  boxShadow: "0 4px 12px rgba(2,98,167,0.3)",
                }}
                onMouseOver={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(2,98,167,0.4)"; }}
                onMouseOut={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 12px rgba(2,98,167,0.3)"; }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Sözleşme Oluştur</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Hemen ödeme planı ve sözleşme oluştur</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "auto" }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Öğrenci Detay */}
              <button
                onClick={() => requestNavigation(`${ogrenciHref(String(registeredStudent.id))}?success=true`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 18px", borderRadius: 12,
                  border: "1px solid #e5e7eb", background: "#fff",
                  color: "#374151", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                }}
                onMouseOver={e => { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.borderColor = "#d1d5db"; }}
                onMouseOut={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: "#f3f4f6",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Öğrenci Detayına Git</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Öğrenci bilgilerini görüntüle ve düzenle</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ marginLeft: "auto" }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Yeni Kayıt */}
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setRegisteredStudent(null);
                  setData(initialData);
                  setCurrentStep(0);
                  setErrors({});
                  setRenewalState({ isRenewal: false });
                  clearWizardStorage();
                  markClean();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 18px", borderRadius: 12,
                  border: "1px solid #e5e7eb", background: "#fff",
                  color: "#374151", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                }}
                onMouseOver={e => { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.borderColor = "#d1d5db"; }}
                onMouseOut={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: "#f3f4f6",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Yeni Kayıt Oluştur</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Başka bir öğrenci daha kaydet</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ marginLeft: "auto" }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal animation */}
      <style>{`
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Footer */}
      <div className="wizard-footer">
        <button
          type="button"
          className="wizard-btn-secondary"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Geri
        </button>

        <div className="wizard-step-counter">
          {currentStep + 1} / {STEPS.length}
        </div>

        {currentStep < STEPS.length - 1 ? (
          <button type="button" className="wizard-btn-primary" onClick={handleNext}>
            İleri
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="wizard-btn-success"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="spinner-small"></div>
                Kaydediliyor...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Kaydet
              </>
            )}
          </button>
        )}
      </div>
    </div>
    </>
  );
}
