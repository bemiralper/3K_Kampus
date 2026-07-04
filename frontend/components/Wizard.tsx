"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Step1 from "./steps/Step1";
import Step2 from "./steps/Step2";
import Step3 from "./steps/Step3";
import Step4 from "./steps/Step4";
import Step5 from "./steps/Step5";

export type LookupOption = {
  id: number;
  code: string;
  label: string;
  metadata?: Record<string, unknown> | null;
};

export type CityOption = {
  id: number;
  name: string;
  code: string;
  is_default: boolean;
};

export type DistrictOption = {
  id: number;
  name: string;
};

export type MetadataResponse = {
  lookups: Record<string, LookupOption[]>;
  cities: CityOption[];
  rules: Array<Record<string, unknown>>;
  sinif_seviyeleri: Array<{ id: number; ad: string; kod: string; has_alan: boolean; ogrenci_no_prefix: string }>;
  alanlar: Array<{ id: number; ad: string; kod: string }>;
  subeler: Array<{ id: number; ad: string; kod: string }>;
  egitim_yillari: Array<{ id: number; yil: string; aktif_mi: boolean }>;
};

export type WizardData = {
  student: {
    kayit_turu?: number;
    tc_kimlik_no: string;
    ad: string;
    soyad: string;
    dogum_tarihi: string;
    cinsiyet?: number;
    email: string;
    telefon: string;
    il?: number;
    ilce?: number;
    ogrenci_kendi_velisi: boolean;
  };
  enrollment: {
    ogrenci_no: string;
    egitim_yili?: number;
    sinif_seviyesi?: number;
    alan?: number;
    sube?: number;
    giris_turu?: number;
    giris_tarihi: string;
    geldigi_okul: string;
    referans: string;
  };
  addresses: Array<{
    adres_turu?: number;
    adres: string;
    il?: number;
    ilce?: number;
    posta_kodu: string;
    varsayilan: boolean;
  }>;
  guardians: Array<{
    veli_turu?: number;
    tc_kimlik_no: string;
    ad: string;
    soyad: string;
    email: string;
    telefon: string;
    sms_bildirimleri: number[];
    egitim_seviyesi: string;
    meslek: string;
    calistigi_kurum: string;
  }>;
  packages: Array<{
    paket_turu?: number;
    paket_id?: number;
    paket_adi: string;
  }>;
};

const defaultData: WizardData = {
  student: {
    tc_kimlik_no: "",
    ad: "",
    soyad: "",
    dogum_tarihi: "",
    email: "",
    telefon: "",
    ogrenci_kendi_velisi: false,
  },
  enrollment: {
    ogrenci_no: "",
    giris_tarihi: "",
    geldigi_okul: "",
    referans: "",
  },
  addresses: [
    {
      adres: "",
      posta_kodu: "",
      varsayilan: true,
    },
  ],
  guardians: [],
  packages: [],
};

const stepTitles = [
  "Kimlik",
  "Kurumsal",
  "Adres",
  "Veli",
  "Paket",
];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/ogrenci-kayit";

type DraftResponse = {
  id: string;
  student?: WizardData["student"];
  enrollment?: WizardData["enrollment"];
  addresses?: WizardData["addresses"];
  guardians?: WizardData["guardians"];
  packages?: WizardData["packages"];
};

export default function Wizard() {
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<WizardData>(defaultData);
  const [districts, setDistricts] = useState<Record<number, DistrictOption[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const progress = useMemo(() => (currentStep / 5) * 100, [currentStep]);

  const fetchJson = useCallback(async <T,>(url: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...options,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "İşlem sırasında hata oluştu");
    }
    return response.json();
  }, []);

  const loadDistricts = useCallback(
    async (cityId: number) => {
      if (districts[cityId]) return;
      try {
        const response = await fetchJson<{ districts: DistrictOption[] }>(
          `${API_BASE}/districts/?city_id=${cityId}`
        );
        setDistricts((prev: Record<number, DistrictOption[]>) => ({
          ...prev,
          [cityId]: response.districts,
        }));
      } catch {
        return;
      }
    },
    [districts, fetchJson]
  );

  useEffect(() => {
    const fetchMetadata = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetchJson<MetadataResponse>(`${API_BASE}/metadata/`);
        setMetadata(response);
        const defaultCity = response.cities.find((city: CityOption) => city.is_default);
        const defaultYear = response.egitim_yillari[0];
        const defaultKayitTuru = response.lookups.registration_type?.find(
          (option: LookupOption) => option.code === "asil"
        );
        const defaultGirisTuru = response.lookups.entry_type?.find(
          (option: LookupOption) => option.code === "yeni_kayit"
        );
        setData((prev: WizardData) => ({
          ...prev,
          student: {
            ...prev.student,
            il: defaultCity?.id ?? prev.student.il,
            kayit_turu: defaultKayitTuru?.id ?? prev.student.kayit_turu,
          },
          enrollment: {
            ...prev.enrollment,
            egitim_yili: defaultYear?.id ?? prev.enrollment.egitim_yili,
            giris_turu: defaultGirisTuru?.id ?? prev.enrollment.giris_turu,
            giris_tarihi: prev.enrollment.giris_tarihi || new Date().toISOString().slice(0, 10),
          },
        }));
        if (defaultCity) {
          loadDistricts(defaultCity.id);
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Veriler yüklenemedi");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [fetchJson, loadDistricts]);

  useEffect(() => {
    const storedDraftId = localStorage.getItem("wizardDraftId");
    const storedStep = localStorage.getItem("wizardStep");
    if (storedStep) {
      setCurrentStep(Number(storedStep));
    }
    if (storedDraftId) {
      setDraftId(storedDraftId);
      fetchJson<DraftResponse>(`${API_BASE}/drafts/${storedDraftId}/`).then(
        (response: DraftResponse) => {
        hydrateDraft(response);
        }
      );
    }
  }, [fetchJson]);

  const hydrateDraft = (response: DraftResponse) => {
    setData({
      student: {
        kayit_turu: response.student?.kayit_turu,
        tc_kimlik_no: response.student?.tc_kimlik_no || "",
        ad: response.student?.ad || "",
        soyad: response.student?.soyad || "",
        dogum_tarihi: response.student?.dogum_tarihi || "",
        cinsiyet: response.student?.cinsiyet,
        email: response.student?.email || "",
        telefon: response.student?.telefon || "",
        il: response.student?.il,
        ilce: response.student?.ilce,
        ogrenci_kendi_velisi: response.student?.ogrenci_kendi_velisi || false,
      },
      enrollment: {
        ogrenci_no: response.enrollment?.ogrenci_no || "",
        egitim_yili: response.enrollment?.egitim_yili,
        sinif_seviyesi: response.enrollment?.sinif_seviyesi,
        alan: response.enrollment?.alan,
        sube: response.enrollment?.sube,
        giris_turu: response.enrollment?.giris_turu,
        giris_tarihi: response.enrollment?.giris_tarihi || "",
        geldigi_okul: response.enrollment?.geldigi_okul || "",
        referans: response.enrollment?.referans || "",
      },
      addresses: response.addresses?.length
        ? response.addresses
        : defaultData.addresses,
      guardians: response.guardians || [],
      packages: response.packages || [],
    });
  };

  const ensureDraft = async () => {
    if (draftId) return draftId;
    const created = await fetchJson<DraftResponse>(`${API_BASE}/drafts/`, { method: "POST" });
    localStorage.setItem("wizardDraftId", created.id);
    setDraftId(created.id);
    return created.id as string;
  };

  const validateStep = (step: number) => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!data.student.kayit_turu) newErrors.kayit_turu = "Kayıt türü zorunlu";
      if (!/^\d{11}$/.test(data.student.tc_kimlik_no)) newErrors.tc_kimlik_no = "TC Kimlik No 11 haneli olmalı";
      if (!data.student.ad) newErrors.ad = "Ad zorunlu";
      if (!data.student.soyad) newErrors.soyad = "Soyad zorunlu";
      if (!data.student.telefon) newErrors.telefon = "Telefon zorunlu";
      if (!data.student.il) newErrors.il = "İl zorunlu";
      if (!data.student.ilce) newErrors.ilce = "İlçe zorunlu";
    }
    if (step === 2) {
      if (!data.enrollment.ogrenci_no) newErrors.ogrenci_no = "Öğrenci no zorunlu";
      if (!data.enrollment.egitim_yili) newErrors.egitim_yili = "Eğitim yılı zorunlu";
      if (!data.enrollment.sinif_seviyesi) newErrors.sinif_seviyesi = "Sınıf seviyesi zorunlu";
      if (!data.enrollment.giris_turu) newErrors.giris_turu = "Giriş türü zorunlu";
      if (!data.enrollment.giris_tarihi) newErrors.giris_tarihi = "Giriş tarihi zorunlu";
    }
    if (step === 3) {
      const address = data.addresses[0];
      if (!address?.adres_turu) newErrors.adres_turu = "Adres türü zorunlu";
      if (!address?.adres) newErrors.adres = "Adres zorunlu";
      if (!address?.il) newErrors.adres_il = "İl zorunlu";
      if (!address?.ilce) newErrors.adres_ilce = "İlçe zorunlu";
    }
    if (step === 4) {
      if (!data.guardians.length && !data.student.ogrenci_kendi_velisi) {
        newErrors.guardians = "En az bir veli ekleyin";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveStep = async (step: number) => {
    const id = await ensureDraft();
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = { step };
      if (step === 1) payload.student = data.student;
      if (step === 2) payload.enrollment = data.enrollment;
      if (step === 3) payload.addresses = data.addresses;
      if (step === 4) payload.guardians = data.guardians;
      if (step === 5) payload.packages = data.packages;
      const response = await fetchJson<DraftResponse>(`${API_BASE}/drafts/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      hydrateDraft(response);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) return;
    await saveStep(currentStep);
    const nextStep = Math.min(currentStep + 1, 5);
    setCurrentStep(nextStep);
    localStorage.setItem("wizardStep", String(nextStep));
  };

  const handlePrev = () => {
    const prevStep = Math.max(currentStep - 1, 1);
    setCurrentStep(prevStep);
    localStorage.setItem("wizardStep", String(prevStep));
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) return;
    await saveStep(5);
    const id = await ensureDraft();
    await fetchJson(`${API_BASE}/drafts/${id}/submit/`, { method: "POST" });
    setShowModal(true);
  };

  const refreshStudentNumber = async (sinifSeviyesiId?: number) => {
    if (!sinifSeviyesiId) return;
    const response = await fetchJson<{ ogrenci_no: string }>(
      `${API_BASE}/next-student-number/?sinif_seviyesi_id=${sinifSeviyesiId}`
    );
    setData((prev: WizardData) => ({
      ...prev,
      enrollment: { ...prev.enrollment, ogrenci_no: response.ogrenci_no },
    }));
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="wizard-card">Yükleniyor...</div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="container">
        <div className="wizard-card">
          <h3>Veriler yüklenemedi</h3>
          <p className="muted">{loadError ?? "Lütfen backend servisinin çalıştığından emin olun."}</p>
          <div className="actions">
            <button className="button primary" type="button" onClick={() => location.reload()}>
              Yeniden Dene
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="wizard-card">
        <div className="header">
          <h1>Yeni Öğrenci Kaydı</h1>
          <p>Adım adım ilerleyerek bilgileri tamamlayın.</p>
          <span className="badge">Taslak destekli</span>
        </div>

        <div className="progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="step-labels">
            {stepTitles.map((title, index) => (
              <span key={title} className={index + 1 === currentStep ? "active" : undefined}>
                {title}
              </span>
            ))}
          </div>
        </div>

        {currentStep === 1 && (
          <Step1
            data={data}
            metadata={metadata}
            districts={districts}
            errors={errors}
            onChange={setData}
            onCityChange={loadDistricts}
          />
        )}
        {currentStep === 2 && (
          <Step2
            data={data}
            metadata={metadata}
            errors={errors}
            onChange={setData}
            onStudentNumberRefresh={refreshStudentNumber}
          />
        )}
        {currentStep === 3 && (
          <Step3
            data={data}
            metadata={metadata}
            districts={districts}
            errors={errors}
            onChange={setData}
            onCityChange={loadDistricts}
          />
        )}
        {currentStep === 4 && (
          <Step4
            data={data}
            metadata={metadata}
            errors={errors}
            onChange={setData}
          />
        )}
        {currentStep === 5 && (
          <Step5
            data={data}
            metadata={metadata}
            onChange={setData}
          />
        )}

        <div className="actions">
          <button className="button ghost" onClick={handlePrev} disabled={currentStep === 1}>
            Geri
          </button>
          {currentStep < 5 ? (
            <button className="button primary" onClick={handleNext} disabled={isSaving}>
              İleri
            </button>
          ) : (
            <button className="button primary" onClick={handleSubmit} disabled={isSaving}>
              Kaydet
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Kayıt tamamlandı</h3>
            <p>İsterseniz sözleşme oluşturabilirsiniz.</p>
            <div className="inline-actions">
              <button className="button primary" onClick={() => setShowModal(false)}>
                Sözleşme Oluştur
              </button>
              <button className="button ghost" onClick={() => setShowModal(false)}>
                Çık
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
