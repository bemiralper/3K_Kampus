"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePersonelPath } from "@/components/personel/PersonelPathProvider";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { useKurum } from "@/lib/contexts/KurumContext";
import { resolveMediaUrl } from "@/lib/resolve-media-url";
import KisiBulunduModal from "@/components/kimlik/KisiBulunduModal";
import { pickPersonelRol } from "@/lib/kimlik-api";
import { useKimlikLookup } from "@/hooks/useKimlikLookup";
import {
  kimlikFieldClass,
  tcReadonlyClass,
} from "@/lib/kimlik-form-utils";

// Tip tanımları
type PersonelData = {
  id: number;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  tam_ad: string;
  dogum_tarihi: string;
  cinsiyet: string;
  cinsiyet_display: string;
  telefon: string;
  cep_telefon: string;
  email: string;
  adres: string;
  il: string;
  ilce: string;
  acil_durum_kisi: string;
  acil_durum_telefon: string;
  aktif_mi: boolean;
  aktif_display: string;
  has_user_account: boolean;
  user_email: string;
  kurum_id: number;
  kurum_ad: string;
  sube_id: number;
  sube_ad: string;
  notlar: string;
  fotograf: string;
  created_at: string;
};

// Telefon numarasını formatla
const formatPhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    return '0' + cleaned;
  }
  return phone;
};

// Form step tipi
type FormStep = 'personal' | 'contact' | 'emergency' | 'settings';

const KIMLIK_REUSE_MSG =
  "Bu kişi kurumda zaten personel olarak kayıtlı. Devam etmek için «Mevcut Personeli Kullan» seçeneğini kullanın.";

const PERSONEL_FORM_STEPS: { key: FormStep; label: string; icon: string }[] = [
  { key: 'personal', label: 'Kişisel', icon: 'user' },
  { key: 'contact', label: 'İletişim', icon: 'phone' },
  { key: 'emergency', label: 'Acil Durum', icon: 'alert' },
  { key: 'settings', label: 'Ayarlar', icon: 'settings' },
];

export default function PersonelListesiPage() {
  const { href } = usePersonelPath();
  const router = useRouter();
  const { activeSube, activeEgitimYili } = useKurum();
  const [mounted, setMounted] = useState(false);
  const [personeller, setPersoneller] = useState<PersonelData[]>([]);
  const [filteredPersoneller, setFilteredPersoneller] = useState<PersonelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [stats, setStats] = useState({ toplam: 0, aktif: 0, pasif: 0 });
  const [listError, setListError] = useState("");
  
  // Drawer states
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingPersonel, setEditingPersonel] = useState<PersonelData | null>(null);
  const [activeStep, setActiveStep] = useState<FormStep>('personal');
  const [formData, setFormData] = useState({
    tc_kimlik_no: '',
    ad: '',
    soyad: '',
    dogum_tarihi: '',
    cinsiyet: '',
    telefon: '',
    cep_telefon: '',
    email: '',
    adres: '',
    il: '',
    ilce: '',
    acil_durum_kisi: '',
    acil_durum_telefon: '',
    notlar: '',
    aktif_mi: true,
    create_user_account: false,
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Fotoğraf states
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick view popup
  const [quickViewPersonel, setQuickViewPersonel] = useState<PersonelData | null>(null);
  const [quickViewPosition, setQuickViewPosition] = useState({ x: 0, y: 0 });
  const quickViewRef = useRef<HTMLDivElement>(null);

  // Delete modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingPersonel, setDeletingPersonel] = useState<PersonelData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [kimlikLink, setKimlikLink] = useState<{ kisi_id?: number; use_existing_personel_id?: number }>({});
  const [existingPersonelHasAccount, setExistingPersonelHasAccount] = useState(false);
  const [tcLocked, setTcLocked] = useState(false);
  const kimlikDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const kimlik = useKimlikLookup({
    context: "personel",
    enabled: !editingPersonel,
    excludeKisiId: kimlikLink.kisi_id,
  });

  const pendingKimlikReuse = useMemo(
    () =>
      !editingPersonel &&
      Boolean(
        kimlik.result?.found &&
          pickPersonelRol(kimlik.result.roller) &&
          !kimlikLink.use_existing_personel_id,
      ),
    [editingPersonel, kimlik.result, kimlikLink.use_existing_personel_id],
  );

  const guardKimlikReuse = useCallback((): boolean => {
    if (!pendingKimlikReuse) return false;
    setFormError(KIMLIK_REUSE_MSG);
    kimlik.setShowModal(true);
    return true;
  }, [pendingKimlikReuse, kimlik]);

  const trySetActiveStep = useCallback(
    (step: FormStep) => {
      if (step !== "personal" && guardKimlikReuse()) return;
      setActiveStep(step);
    },
    [guardKimlikReuse],
  );

  const tryAdvanceStep = useCallback(() => {
    if (guardKimlikReuse()) return;
    const currentIndex = PERSONEL_FORM_STEPS.findIndex((s) => s.key === activeStep);
    if (currentIndex < PERSONEL_FORM_STEPS.length - 1) {
      setActiveStep(PERSONEL_FORM_STEPS[currentIndex + 1].key);
    }
  }, [activeStep, guardKimlikReuse]);

  // Steps configuration (alias)
  const steps = PERSONEL_FORM_STEPS;

  // Veri çekme
  const fetchPersoneller = useCallback(async () => {
    try {
      setLoading(true);
      setListError("");
      const result = await apiGet<{
        personeller?: PersonelData[];
        toplam_personel?: number;
        aktif_personel?: number;
      }>(`/personel/api/list/?show_inactive=${showInactive}`);

      if (result.success) {
        const rows = (result.personeller ?? result.data?.personeller ?? []) as PersonelData[];
        const toplam = (result.toplam_personel ?? result.data?.toplam_personel ?? rows.length) as number;
        const aktif = (result.aktif_personel ?? result.data?.aktif_personel ?? 0) as number;
        setPersoneller(rows);
        setStats({
          toplam,
          aktif,
          pasif: toplam - aktif,
        });
      } else {
        setPersoneller([]);
        setListError(result.error || "Personel listesi alınamadı.");
      }
    } catch (error) {
      console.error("Personel listesi alınamadı:", error);
      setListError("Personel listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    fetchPersoneller();
  }, [fetchPersoneller]);

  // Arama filtreleme
  useEffect(() => {
    if (!searchQuery) {
      setFilteredPersoneller(personeller);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredPersoneller(
        personeller.filter(
          (p) =>
            p.ad.toLowerCase().includes(query) ||
            p.soyad.toLowerCase().includes(query) ||
            p.tam_ad.toLowerCase().includes(query) ||
            (p.tc_kimlik_no && p.tc_kimlik_no.includes(query)) ||
            (p.email && p.email.toLowerCase().includes(query)) ||
            (p.cep_telefon && p.cep_telefon.includes(query))
        )
      );
    }
  }, [searchQuery, personeller]);

  // ESC tuşu ile drawer kapatma
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDrawer(false);
        setQuickViewPersonel(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Click outside for quick view
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickViewRef.current && !quickViewRef.current.contains(e.target as Node)) {
        setQuickViewPersonel(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Drawer açma
  const openDrawer = (personel?: PersonelData) => {
    kimlik.resetKimlik();
    setKimlikLink({});
    setExistingPersonelHasAccount(false);
    setTcLocked(false);
    if (personel) {
      setEditingPersonel(personel);
      setFormData({
        tc_kimlik_no: personel.tc_kimlik_no || '',
        ad: personel.ad || '',
        soyad: personel.soyad || '',
        dogum_tarihi: '',
        cinsiyet: personel.cinsiyet || '',
        telefon: personel.telefon || '',
        cep_telefon: personel.cep_telefon || '',
        email: personel.email || '',
        adres: personel.adres || '',
        il: personel.il || '',
        ilce: personel.ilce || '',
        acil_durum_kisi: personel.acil_durum_kisi || '',
        acil_durum_telefon: personel.acil_durum_telefon || '',
        notlar: personel.notlar || '',
        aktif_mi: personel.aktif_mi,
        create_user_account: false,
      });
      // Mevcut fotoğrafı göster
      if (personel.fotograf) {
        setPhotoPreview(resolveMediaUrl(personel.fotograf) || "");
      } else {
        setPhotoPreview('');
      }
    } else {
      setEditingPersonel(null);
      setFormData({
        tc_kimlik_no: '',
        ad: '',
        soyad: '',
        dogum_tarihi: '',
        cinsiyet: '',
        telefon: '',
        cep_telefon: '',
        email: '',
        adres: '',
        il: '',
        ilce: '',
        acil_durum_kisi: '',
        acil_durum_telefon: '',
        notlar: '',
        aktif_mi: true,
        create_user_account: false,
      });
      setPhotoPreview('');
    }
    setSelectedPhoto(null);
    setFormError('');
    setFormSuccess('');
    setActiveStep('personal');
    setShowDrawer(true);
    setQuickViewPersonel(null);
  };

  // Fotoğraf seçme
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Dosya boyutu kontrolü (5MB)
      if (file.size > 5 * 1024 * 1024) {
        setFormError('Fotoğraf boyutu 5MB\'dan küçük olmalıdır');
        return;
      }
      
      // Dosya tipi kontrolü
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setFormError('Sadece JPEG, PNG, GIF veya WebP formatları kabul edilir');
        return;
      }
      
      setSelectedPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setFormError('');
    }
  };

  // Fotoğraf yükleme
  const uploadPhoto = async (personelId: number) => {
    if (!selectedPhoto) return;
    
    setUploadingPhoto(true);
    const formDataPhoto = new FormData();
    formDataPhoto.append('fotograf', selectedPhoto);
    
    try {
      const response = await fetch(`/api/personel/api/${personelId}/upload-foto/`, {
        method: "POST",
        credentials: "include",
        body: formDataPhoto,
      });
      
      const data = await response.json();
      if (!data.success) {
        console.error('Fotoğraf yüklenemedi:', data.error);
      }
    } catch (error) {
      console.error('Fotoğraf yükleme hatası:', error);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Fotoğraf silme
  const deletePhoto = async () => {
    if (!editingPersonel) return;
    
    try {
      const result = await apiDelete(`/personel/api/${editingPersonel.id}/delete-foto/`);
      if (result.success) {
        setPhotoPreview('');
        setSelectedPhoto(null);
        fetchPersoneller();
      }
    } catch (error) {
      console.error('Fotoğraf silme hatası:', error);
    }
  };

  // Quick view açma
  const openQuickView = (e: React.MouseEvent, personel: PersonelData) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setQuickViewPosition({
      x: Math.min(rect.left, window.innerWidth - 380),
      y: Math.min(rect.bottom + 8, window.innerHeight - 400),
    });
    setQuickViewPersonel(personel);
  };

  // Form gönderme
  const applyKimlikToForm = () => {
    if (!kimlik.result) return;
    const ortak = kimlik.result.ortak_alanlar || {};
    const personelRol = pickPersonelRol(kimlik.result.roller);
    const filledFields = ["ad", "soyad", "tc_kimlik_no", "telefon", "cep_telefon", "email", "adres", "dogum_tarihi"];
    setFormData((prev) => ({
      ...prev,
      ad: ortak.ad || personelRol?.ad || prev.ad,
      soyad: ortak.soyad || personelRol?.soyad || prev.soyad,
      tc_kimlik_no: ortak.tc_kimlik_no || prev.tc_kimlik_no,
      telefon: ortak.telefon || prev.telefon,
      cep_telefon: ortak.telefon || prev.cep_telefon,
      dogum_tarihi: ortak.dogum_tarihi || prev.dogum_tarihi,
      cinsiyet: ortak.cinsiyet || prev.cinsiyet,
      email: ortak.email || prev.email,
      adres: ortak.adres || prev.adres,
      il: ortak.il || prev.il,
      ilce: ortak.ilce || prev.ilce,
    }));
    setKimlikLink({
      kisi_id: kimlik.result.kisi?.id,
      use_existing_personel_id: personelRol?.id,
    });
    setExistingPersonelHasAccount(Boolean(personelRol?.has_user_account));
    setTcLocked(true);
    kimlik.setPhoneError("");
    kimlik.markHighlighted(filledFields);
    kimlik.dismissModal();
    setFormError("");
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kimlik.isBlocked) {
      setFormError(kimlik.result?.engellenen_mesaj || "Bu kayıt tamamlanamaz. Lütfen bilgileri kontrol edin.");
      kimlik.setShowModal(true);
      return;
    }
    if (!editingPersonel && kimlik.result?.found && !kimlikLink.use_existing_personel_id) {
      const existingPersonel = pickPersonelRol(kimlik.result.roller);
      if (existingPersonel) {
        kimlik.setShowModal(true);
        setFormError(KIMLIK_REUSE_MSG);
        return;
      }
    }
    if (!editingPersonel && kimlikLink.use_existing_personel_id && !activeEgitimYili?.id) {
      setFormError("Personeli bu şubede listelemek için üst menüden eğitim yılı seçin.");
      return;
    }
    setFormLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const payload: Record<string, unknown> = { ...formData };
      if (!editingPersonel && kimlikLink.use_existing_personel_id) {
        payload.use_existing_personel_id = kimlikLink.use_existing_personel_id;
        payload.create_gorevlendirme = true;
        payload.egitim_yili_id = activeEgitimYili?.id;
        payload.gorev_sube_id = activeSube?.id;
      }
      if (!editingPersonel && kimlikLink.kisi_id) {
        payload.kisi_id = kimlikLink.kisi_id;
      }

      const result = editingPersonel
        ? await apiPut(`/personel/api/${editingPersonel.id}/update/`, formData)
        : await apiPost(`/personel/api/create/`, payload);

      if (result.success) {
        const personelId = editingPersonel
          ? editingPersonel.id
          : (result.personel as { id?: number } | undefined)?.id ??
            (result.data as { personel?: { id?: number } } | undefined)?.personel?.id;
        if (selectedPhoto && personelId) {
          await uploadPhoto(personelId);
        }

        setFormSuccess(
          (result as { reused?: boolean; message?: string }).reused
            ? (result.message as string) || "Mevcut personel bu şubeye bağlandı."
            : editingPersonel
              ? "Personel güncellendi!"
              : "Personel oluşturuldu!",
        );
        fetchPersoneller();
        setTimeout(() => {
          setShowDrawer(false);
        }, 1500);
      } else {
        const conflictCode = (result as { code?: string }).code;
        if (
          !editingPersonel &&
          (conflictCode === "duplicate_personel_tc" ||
            conflictCode === "duplicate_tc" ||
            conflictCode === "duplicate_telefon" ||
            conflictCode === "phone_tc_mismatch")
        ) {
          await kimlik.openConflictLookup(formData.tc_kimlik_no, formData.cep_telefon || formData.telefon);
          setFormError(
            result.error ||
              "Bu kişi sistemde kayıtlı. Açılan pencereden «Mevcut Personeli Kullan» seçeneğini kullanın.",
          );
        } else {
          setFormError(result.error || "Bir hata oluştu");
        }
      }
    } catch {
      setFormError('İşlem sırasında bir hata oluştu');
    } finally {
      setFormLoading(false);
    }
  };

  // Aktif/Pasif durumu değiştirme
  const toggleActiveStatus = async (personel: PersonelData) => {
    try {
      await apiPost(`/personel/api/${personel.id}/toggle-active/`);
      fetchPersoneller();
    } catch (error) {
      console.error('Durum değiştirilemedi:', error);
    }
  };

  // Personel silme modalını aç
  const openDeleteModal = (personel: PersonelData) => {
    setDeletingPersonel(personel);
    setShowDeleteModal(true);
    setQuickViewPersonel(null);
  };

  // Personel silme
  const handleDeletePersonel = async () => {
    if (!deletingPersonel) return;
    
    setDeleteLoading(true);
    try {
      const result = await apiDelete(`/personel/api/${deletingPersonel.id}/delete/`);
      if (result.success) {
        setShowDeleteModal(false);
        setDeletingPersonel(null);
        fetchPersoneller();
      } else {
        alert(result.error || "Silme işlemi başarısız oldu");
      }
    } catch (error) {
      console.error('Silme hatası:', error);
      alert('Silme işlemi sırasında bir hata oluştu');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Step icons
  const getStepIcon = (icon: string) => {
    switch (icon) {
      case 'user':
        return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
      case 'phone':
        return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
      case 'alert':
        return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
      case 'settings':
        return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
      default:
        return null;
    }
  };

  // Hydration tamamlanana kadar bekle
  useEffect(() => {
    setMounted(true);
  }, []);

  // CSS yüklenene kadar sayfa görünmez
  if (!mounted) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: 40, 
            height: 40, 
            border: '3px solid #e2e8f0', 
            borderTop: '3px solid #0066cc', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Hero Header */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Personel Tanımları</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Personel Tanımları</span>
            </div>
          </div>
        </div>
        <button className="btn-hero" onClick={() => openDrawer()}>
          <span className="btn-hero-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>Yeni Personel</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-row">
        <div className="stat-chip">
          <div className="stat-chip-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <span className="stat-chip-value">{stats.toplam}</span>
          <span className="stat-chip-label">Toplam</span>
        </div>
        <div className="stat-chip">
          <div className="stat-chip-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <span className="stat-chip-value">{stats.aktif}</span>
          <span className="stat-chip-label">Aktif</span>
        </div>
        <div className="stat-chip">
          <div className="stat-chip-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <span className="stat-chip-value">{stats.pasif}</span>
          <span className="stat-chip-label">Pasif</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="toolbar">
        <div className="search-container">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Personel ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">Pasif kayıtlar</span>
        </label>
      </div>

      {/* Data Grid */}
      <div className="grid-container">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Yükleniyor...</p>
          </div>
        ) : listError ? (
          <div className="empty-state">
            <h3>Liste yüklenemedi</h3>
            <p>{listError}</p>
            <button className="btn-primary" onClick={() => fetchPersoneller()}>
              Tekrar dene
            </button>
          </div>
        ) : filteredPersoneller.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <h3>Personel Bulunamadı</h3>
            <p>Henüz kayıtlı personel yok veya arama kriterlerinize uygun sonuç bulunamadı.</p>
            <button className="btn-primary" onClick={() => openDrawer()}>
              İlk Personeli Ekle
            </button>
          </div>
        ) : (
          <div className="card-grid">
            {filteredPersoneller.map((personel) => (
              <div 
                key={personel.id} 
                className={`person-card ${!personel.aktif_mi ? 'inactive' : ''}`}
                onClick={() => router.push(href(String(personel.id)))}
              >
                <div className="person-card-header">
                  <div className="person-avatar">
                    {personel.fotograf ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveMediaUrl(personel.fotograf) || ""} alt={personel.tam_ad} />
                    ) : (
                      <span>{personel.ad.charAt(0)}{personel.soyad.charAt(0)}</span>
                    )}
                  </div>
                  <div className="person-main-info">
                    <h3 className="person-name">{personel.tam_ad}</h3>
                    <span className="person-tc">{personel.tc_kimlik_no || 'TC Girilmemiş'}</span>
                  </div>
                  <div className="person-status">
                    <span className={`status-dot ${personel.aktif_mi ? 'active' : 'inactive'}`} />
                  </div>
                </div>
                
                <div className="person-card-body">
                  <div className="person-detail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    <span>{formatPhoneNumber(personel.cep_telefon) || '-'}</span>
                  </div>
                  <div className="person-detail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <span>{personel.email || '-'}</span>
                  </div>
                </div>

                <div className="person-card-footer">
                  <div className="person-badges">
                    {personel.has_user_account && (
                      <span className="badge badge-account" title="Sistem hesabı var">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </span>
                    )}
                    {personel.sube_ad && (
                      <span className="badge badge-branch">{personel.sube_ad}</span>
                    )}
                  </div>
                  <div className="person-actions" onClick={(e) => e.stopPropagation()}>
                    <button 
                      className="action-btn-mini"
                      onClick={(e) => openQuickView(e, personel)}
                      title="Hızlı Görüntüle"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                    <button 
                      className="action-btn-mini"
                      onClick={() => openDrawer(personel)}
                      title="Düzenle"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button 
                      className="action-btn-mini action-btn-danger"
                      onClick={() => openDeleteModal(personel)}
                      title="Sil"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                      </svg>
                    </button>
                    <button 
                      className="action-btn-mini"
                      onClick={() => toggleActiveStatus(personel)}
                      title={personel.aktif_mi ? 'Pasife Al' : 'Aktife Al'}
                    >
                      {personel.aktif_mi ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                          <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick View Popup */}
      {quickViewPersonel && (
        <div className="quick-view-overlay" onClick={() => setQuickViewPersonel(null)}>
          <div 
            ref={quickViewRef}
            className="quick-view-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qv-header">
            <div className="qv-avatar">
              {quickViewPersonel.fotograf ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveMediaUrl(quickViewPersonel.fotograf) || ""} alt={quickViewPersonel.tam_ad} />
              ) : (
                <span>{quickViewPersonel.ad.charAt(0)}{quickViewPersonel.soyad.charAt(0)}</span>
              )}
            </div>
            <div className="qv-info">
              <h4>{quickViewPersonel.tam_ad}</h4>
              <span className={`qv-status ${quickViewPersonel.aktif_mi ? 'active' : 'inactive'}`}>
                {quickViewPersonel.aktif_display}
              </span>
            </div>
            <button className="qv-close" onClick={() => setQuickViewPersonel(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="qv-body">
            <div className="qv-item">
              <span className="qv-label">TC Kimlik No</span>
              <span className="qv-value">{quickViewPersonel.tc_kimlik_no || '-'}</span>
            </div>
            <div className="qv-item">
              <span className="qv-label">Doğum Tarihi</span>
              <span className="qv-value">{quickViewPersonel.dogum_tarihi || '-'}</span>
            </div>
            <div className="qv-item">
              <span className="qv-label">Cep Telefonu</span>
              <span className="qv-value">{formatPhoneNumber(quickViewPersonel.cep_telefon) || '-'}</span>
            </div>
            <div className="qv-item">
              <span className="qv-label">E-posta</span>
              <span className="qv-value">{quickViewPersonel.email || '-'}</span>
            </div>
            {quickViewPersonel.adres && (
              <div className="qv-item full">
                <span className="qv-label">Adres</span>
                <span className="qv-value">
                  {quickViewPersonel.adres}
                  {quickViewPersonel.ilce && `, ${quickViewPersonel.ilce}`}
                  {quickViewPersonel.il && ` / ${quickViewPersonel.il}`}
                </span>
              </div>
            )}
          </div>
          <div className="qv-footer">
            <button className="qv-btn" onClick={() => { setQuickViewPersonel(null); router.push(href(String(quickViewPersonel.id))); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Detay
            </button>
            <button className="qv-btn" onClick={() => { setQuickViewPersonel(null); openDrawer(quickViewPersonel); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Düzenle
            </button>
            <button className="qv-btn delete" onClick={() => openDeleteModal(quickViewPersonel)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
              Sil
            </button>
            {quickViewPersonel.cep_telefon && (
              <a href={`tel:${quickViewPersonel.cep_telefon}`} className="qv-btn call">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                Ara
              </a>
            )}
            {quickViewPersonel.cep_telefon && (
              <a 
                href={`https://wa.me/90${quickViewPersonel.cep_telefon.replace(/\D/g, '').replace(/^0/, '')}`} 
                target="_blank" 
                className="qv-btn whatsapp"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Drawer */}
      {showDrawer && (
        <>
          <div className="drawer-overlay visible" onClick={() => setShowDrawer(false)} />
          <div className="drawer open">
            <div className="drawer-header">
          <div className="drawer-title-area">
            <div className="drawer-icon">
              {editingPersonel ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <line x1="20" y1="8" x2="20" y2="14"/>
                  <line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
              )}
            </div>
            <div>
              <h2>{editingPersonel ? 'Personel Düzenle' : 'Yeni Personel'}</h2>
              <p>{editingPersonel ? editingPersonel.tam_ad : 'Personel bilgilerini girin'}</p>
            </div>
          </div>
          <button className="drawer-close" onClick={() => setShowDrawer(false)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Step Navigation */}
        <div className="drawer-steps">
          {steps.map((step, index) => (
            <button
              key={step.key}
              className={`step-btn ${activeStep === step.key ? 'active' : ''}${pendingKimlikReuse && step.key !== 'personal' ? ' step-btn-locked' : ''}`}
              onClick={() => trySetActiveStep(step.key)}
              type="button"
              disabled={pendingKimlikReuse && step.key !== 'personal'}
            >
              <span className="step-number">{index + 1}</span>
              <span className="step-icon">{getStepIcon(step.icon)}</span>
              <span className="step-label">{step.label}</span>
            </button>
          ))}
        </div>

        {pendingKimlikReuse && (
          <div className="kimlik-reuse-banner" role="alert">
            <strong>Mevcut personel bulundu.</strong>{" "}
            Formu tamamlamak için «Mevcut Personeli Kullan» seçeneğini onaylayın veya TC numarasını değiştirin.
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <div className="drawer-body">
            {/* Alerts */}
            {formError && (
              <div className="alert alert-error">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="alert alert-success">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                {formSuccess}
              </div>
            )}

            {/* Step: Personal */}
            <div className={`step-content ${activeStep === 'personal' ? 'active' : ''}`}>
              {/* Fotoğraf Yükleme Alanı */}
              <div className="photo-upload-section">
                <div className="photo-preview-container">
                  {photoPreview ? (
                    <div className="photo-preview">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="Profil" />
                      <button
                        type="button"
                        className="photo-remove-btn"
                        onClick={() => {
                          if (editingPersonel?.fotograf) {
                            deletePhoto();
                          } else {
                            setSelectedPhoto(null);
                            setPhotoPreview('');
                          }
                        }}
                        title="Fotoğrafı kaldır"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div 
                      className="photo-placeholder"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>Fotoğraf Ekle</span>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
                {photoPreview && (
                  <button
                    type="button"
                    className="photo-change-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    Değiştir
                  </button>
                )}
                {uploadingPhoto && (
                  <div className="photo-uploading">
                    <div className="spinner-small"></div>
                    <span>Yükleniyor...</span>
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">Ad</span>
                    <span className="label-required">*</span>
                  </label>
                  <input
                    type="text"
                    className={kimlikFieldClass("field-input", "ad", kimlik.highlightedFields)}
                    value={formData.ad}
                    onChange={(e) => setFormData({ ...formData, ad: e.target.value })}
                    placeholder="Personelin adı"
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">Soyad</span>
                    <span className="label-required">*</span>
                  </label>
                  <input
                    type="text"
                    className={kimlikFieldClass("field-input", "soyad", kimlik.highlightedFields)}
                    value={formData.soyad}
                    onChange={(e) => setFormData({ ...formData, soyad: e.target.value })}
                    placeholder="Personelin soyadı"
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">TC Kimlik No</span>
                  </label>
                  <input
                    type="text"
                    className={`${kimlikFieldClass("field-input", "tc_kimlik_no", kimlik.highlightedFields)}${tcReadonlyClass(tcLocked && !editingPersonel)}`}
                    value={formData.tc_kimlik_no}
                    readOnly={tcLocked && !editingPersonel}
                    onChange={(e) => {
                      if (tcLocked && !editingPersonel) return;
                      const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setFormData({ ...formData, tc_kimlik_no: cleaned });
                      setKimlikLink({});
                      setExistingPersonelHasAccount(false);
                      setTcLocked(false);
                      if (kimlikDebounceRef.current) clearTimeout(kimlikDebounceRef.current);
                      if (cleaned.length === 11 && !editingPersonel) {
                        kimlikDebounceRef.current = setTimeout(
                          () => kimlik.checkTc(cleaned, formData.cep_telefon || formData.telefon),
                          350,
                        );
                      }
                    }}
                    onBlur={() => {
                      if (formData.tc_kimlik_no.length === 11 && !editingPersonel && !tcLocked) {
                        void kimlik.runResolve({
                          tc: formData.tc_kimlik_no,
                          telefon: formData.cep_telefon || formData.telefon,
                        });
                      }
                    }}
                    placeholder="11 haneli TC Kimlik No"
                    maxLength={11}
                  />
                  {tcLocked && !editingPersonel && (
                    <span className="kimlik-tc-hint">
                      TC Kimlik Numarası sistemde tekil kimlik olarak kullanıldığı için değiştirilemez.
                    </span>
                  )}
                  {kimlik.lookupError && (
                    <span className="kimlik-phone-error">{kimlik.lookupError}</span>
                  )}
                  {kimlik.checking && (
                    <span className="text-xs text-slate-500">Kimlik kontrol ediliyor…</span>
                  )}
                </div>
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">Doğum Tarihi</span>
                  </label>
                  <input
                    type="date"
                    className="field-input"
                    value={formData.dogum_tarihi}
                    onChange={(e) => setFormData({ ...formData, dogum_tarihi: e.target.value })}
                  />
                </div>
                <div className="form-field full-width">
                  <label className="field-label">
                    <span className="label-text">Cinsiyet</span>
                  </label>
                  <div className="gender-selector">
                    <button
                      type="button"
                      className={`gender-btn ${formData.cinsiyet === 'E' ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, cinsiyet: 'E' })}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="10" cy="14" r="5"/>
                        <line x1="19" y1="5" x2="13.6" y2="10.4"/>
                        <line x1="19" y1="5" x2="14" y2="5"/>
                        <line x1="19" y1="5" x2="19" y2="10"/>
                      </svg>
                      Erkek
                    </button>
                    <button
                      type="button"
                      className={`gender-btn ${formData.cinsiyet === 'K' ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, cinsiyet: 'K' })}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="8" r="5"/>
                        <line x1="12" y1="13" x2="12" y2="21"/>
                        <line x1="9" y1="18" x2="15" y2="18"/>
                      </svg>
                      Kadın
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step: Contact */}
            <div className={`step-content ${activeStep === 'contact' ? 'active' : ''}`}>
              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">Cep Telefonu</span>
                  </label>
                  <div className="input-with-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                      <line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                    <input
                      type="tel"
                      className={kimlikFieldClass("field-input", "cep_telefon", kimlik.highlightedFields)}
                      value={formData.cep_telefon}
                      onChange={(e) => {
                        setFormData({ ...formData, cep_telefon: e.target.value });
                        if (!editingPersonel) kimlik.checkPhone(e.target.value);
                      }}
                      onBlur={() => {
                        if (!editingPersonel) kimlik.checkPhone(formData.cep_telefon);
                      }}
                      placeholder="05XX XXX XX XX"
                    />
                  </div>
                  {kimlik.phoneError && (
                    <span className="kimlik-phone-error">{kimlik.phoneError}</span>
                  )}
                </div>
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">Sabit Telefon</span>
                  </label>
                  <div className="input-with-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    <input
                      type="tel"
                      className="field-input"
                      value={formData.telefon}
                      onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
                      placeholder="0XXX XXX XX XX"
                    />
                  </div>
                </div>
                <div className="form-field full-width">
                  <label className="field-label">
                    <span className="label-text">E-posta</span>
                  </label>
                  <div className="input-with-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <input
                      type="email"
                      className={kimlikFieldClass("field-input", "email", kimlik.highlightedFields)}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="ornek@email.com"
                    />
                  </div>
                </div>
                <div className="form-field full-width">
                  <label className="field-label">
                    <span className="label-text">Adres</span>
                  </label>
                  <textarea
                    className={kimlikFieldClass("field-textarea", "adres", kimlik.highlightedFields)}
                    value={formData.adres}
                    onChange={(e) => setFormData({ ...formData, adres: e.target.value })}
                    placeholder="Açık adres"
                    rows={3}
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">İl</span>
                  </label>
                  <input
                    type="text"
                    className="field-input"
                    value={formData.il}
                    onChange={(e) => setFormData({ ...formData, il: e.target.value })}
                    placeholder="İl"
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">İlçe</span>
                  </label>
                  <input
                    type="text"
                    className="field-input"
                    value={formData.ilce}
                    onChange={(e) => setFormData({ ...formData, ilce: e.target.value })}
                    placeholder="İlçe"
                  />
                </div>
              </div>
            </div>

            {/* Step: Emergency */}
            <div className={`step-content ${activeStep === 'emergency' ? 'active' : ''}`}>
              <div className="emergency-notice">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <h4>Acil Durum İletişimi</h4>
                  <p>Personele ulaşılamadığı durumlarda iletişime geçilecek kişi bilgileri</p>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">Kişi Adı Soyadı</span>
                  </label>
                  <input
                    type="text"
                    className="field-input"
                    value={formData.acil_durum_kisi}
                    onChange={(e) => setFormData({ ...formData, acil_durum_kisi: e.target.value })}
                    placeholder="Yakınının adı soyadı"
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">
                    <span className="label-text">Telefon Numarası</span>
                  </label>
                  <input
                    type="tel"
                    className="field-input"
                    value={formData.acil_durum_telefon}
                    onChange={(e) => setFormData({ ...formData, acil_durum_telefon: e.target.value })}
                    placeholder="05XX XXX XX XX"
                  />
                </div>
              </div>
            </div>

            {/* Step: Settings */}
            <div className={`step-content ${activeStep === 'settings' ? 'active' : ''}`}>
              <div className="form-grid">
                <div className="form-field full-width">
                  <label className="field-label">
                    <span className="label-text">Notlar</span>
                  </label>
                  <textarea
                    className="field-textarea"
                    value={formData.notlar}
                    onChange={(e) => setFormData({ ...formData, notlar: e.target.value })}
                    placeholder="Personel hakkında notlar..."
                    rows={4}
                  />
                </div>
                <div className="form-field full-width">
                  <div className="toggle-option">
                    <div className="toggle-info">
                      <span className="toggle-title">Aktif Personel</span>
                      <span className="toggle-desc">Personel sisteme aktif olarak kaydedilsin</span>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={formData.aktif_mi}
                        onChange={(e) => setFormData({ ...formData, aktif_mi: e.target.checked })}
                      />
                      <span className="slider" />
                    </label>
                  </div>
                </div>
                {!editingPersonel && kimlikLink.use_existing_personel_id && existingPersonelHasAccount && (
                  <div className="form-field full-width">
                    <div className="kimlik-reuse-banner kimlik-reuse-banner--info">
                      Bu personelin kurum genelinde aktif bir giriş hesabı var. Şube görevlendirmesi mevcut
                      kullanıcı adı ve şifreyi değiştirmez.
                    </div>
                  </div>
                )}
                {!editingPersonel && formData.email && !kimlikLink.use_existing_personel_id && (
                  <div className="form-field full-width">
                    <div className="toggle-option">
                      <div className="toggle-info">
                        <span className="toggle-title">Sistem Hesabı Oluştur</span>
                        <span className="toggle-desc">Personel için giriş yapabileceği bir hesap oluşturulur</span>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={formData.create_user_account}
                          onChange={(e) => setFormData({ ...formData, create_user_account: e.target.checked })}
                        />
                        <span className="slider" />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn-cancel" onClick={() => setShowDrawer(false)}>
              İptal
            </button>
            <div className="footer-actions">
              {activeStep !== 'personal' && (
                <button 
                  type="button" 
                  className="btn-prev"
                  onClick={() => {
                    const currentIndex = steps.findIndex(s => s.key === activeStep);
                    if (currentIndex > 0) setActiveStep(steps[currentIndex - 1].key);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Geri
                </button>
              )}
              {activeStep !== 'settings' ? (
                <button 
                  type="button" 
                  className="btn-next"
                  disabled={pendingKimlikReuse}
                  onClick={tryAdvanceStep}
                >
                  İleri
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              ) : (
                <button type="submit" className="btn-submit" disabled={formLoading}>
                  {formLoading ? (
                    <>
                      <span className="btn-spinner" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                      {editingPersonel ? 'Güncelle' : 'Kaydet'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
      </>
      )}

      <style jsx>{`
        /* ===== Page Layout ===== */
        .page-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ===== Stats Row ===== */
        .stats-row {
          display: flex;
          gap: 12px;
        }

        .stat-chip {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .stat-chip-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-chip-icon.blue { background: rgba(0, 97, 166, 0.1); color: #0061a6; }
        .stat-chip-icon.green { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
        .stat-chip-icon.orange { background: rgba(249, 115, 22, 0.1); color: #f97316; }

        .stat-chip-value {
          font-size: 20px;
          font-weight: 700;
          color: #1e293b;
        }

        .stat-chip-label {
          font-size: 13px;
          color: #64748b;
        }

        /* ===== Toolbar ===== */
        .toolbar {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .search-container {
          flex: 1;
          max-width: 400px;
          position: relative;
        }

        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .search-input {
          width: 100%;
          padding: 14px 44px;
          background: white;
          border: 2px solid transparent;
          border-radius: 12px;
          font-size: 14px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          transition: all 0.2s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: #0061a6;
          box-shadow: 0 0 0 4px rgba(0, 97, 166, 0.1);
        }

        .search-clear {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
          height: 28px;
          border: none;
          background: #f1f5f9;
          border-radius: 8px;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .filter-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }

        .filter-toggle input { display: none; }

        .toggle-track {
          width: 44px;
          height: 24px;
          background: #e2e8f0;
          border-radius: 12px;
          position: relative;
          transition: background 0.3s ease;
        }

        .filter-toggle input:checked + .toggle-track { background: #0061a6; }

        .toggle-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          transition: transform 0.3s ease;
        }

        .filter-toggle input:checked + .toggle-track .toggle-thumb {
          transform: translateX(20px);
        }

        .toggle-label {
          font-size: 14px;
          color: #475569;
        }

        /* ===== Grid Container ===== */
        .grid-container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          min-height: 400px;
        }

        .loading-state, .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: #64748b;
        }

        .loading-spinner {
          width: 44px;
          height: 44px;
          border: 3px solid #e2e8f0;
          border-top-color: #0061a6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .empty-illustration { color: #cbd5e1; margin-bottom: 20px; }
        .empty-state h3 { font-size: 18px; color: #475569; margin: 0 0 8px; }
        .empty-state p { font-size: 14px; margin: 0 0 20px; }

        .btn-primary {
          padding: 12px 24px;
          background: linear-gradient(135deg, #0061a6 0%, #0085e0 100%);
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          cursor: pointer;
        }

        /* ===== Card Grid ===== */
        .card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
          padding: 20px;
        }

        .person-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .person-card:hover {
          border-color: #0061a6;
          box-shadow: 0 8px 25px rgba(0, 97, 166, 0.12);
          transform: translateY(-2px);
        }

        .person-card.inactive { opacity: 0.6; }

        .person-card-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }

        .person-avatar {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #0061a6 0%, #0085e0 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 16px;
          font-weight: 600;
          overflow: hidden;
        }

        .person-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .person-main-info { flex: 1; min-width: 0; }

        .person-name {
          font-size: 15px;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .person-tc {
          font-size: 12px;
          color: #94a3b8;
          font-family: monospace;
        }

        .person-status { padding: 4px; }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: block;
        }

        .status-dot.active { background: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2); }
        .status-dot.inactive { background: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2); }

        .person-card-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid #f1f5f9;
        }

        .person-detail {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #64748b;
        }

        .person-detail svg { color: #94a3b8; flex-shrink: 0; }
        .person-detail span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .person-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .person-badges { display: flex; gap: 6px; }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
        }

        .badge-account { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
        .badge-branch { background: #f1f5f9; color: #475569; }

        .person-actions { display: flex; gap: 4px; }

        .action-btn-mini {
          width: 32px;
          height: 32px;
          border: none;
          background: #f8fafc;
          border-radius: 8px;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .action-btn-mini:hover { background: #e2e8f0; color: #0061a6; }

        /* ===== Quick View Overlay & Popup ===== */
        .quick-view-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
          padding: 20px;
        }

        .quick-view-popup {
          width: 100%;
          max-width: 400px;
          max-height: 90vh;
          overflow-y: auto;
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
          animation: popupIn 0.25s ease;
        }

        @keyframes popupIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .qv-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: linear-gradient(135deg, #0061a6 0%, #0085e0 100%);
          border-radius: 16px 16px 0 0;
        }

        .qv-avatar {
          width: 44px;
          height: 44px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          font-weight: 600;
          overflow: hidden;
        }

        .qv-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .qv-info { flex: 1; }
        .qv-info h4 { font-size: 16px; font-weight: 600; color: white; margin: 0 0 2px; }

        .qv-status {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .qv-close {
          width: 32px;
          height: 32px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .qv-body {
          padding: 16px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .qv-item { display: flex; flex-direction: column; gap: 2px; }
        .qv-item.full { grid-column: span 2; }
        .qv-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .qv-value { font-size: 13px; color: #1e293b; font-weight: 500; }

        .qv-footer {
          padding: 12px 16px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          gap: 8px;
        }

        .qv-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px;
          border: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          background: #f1f5f9;
          color: #475569;
          transition: all 0.2s ease;
        }

        .qv-btn:hover { background: #e2e8f0; }
        .qv-btn.call { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
        .qv-btn.whatsapp { background: rgba(37, 211, 102, 0.1); color: #25d366; flex: 0 0 44px; }

        /* ===== Drawer ===== */
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          z-index: 1000;
          opacity: 1;
          visibility: visible;
        }

        .drawer-overlay.visible { opacity: 1; visibility: visible; }

        .drawer {
          position: fixed;
          top: 0;
          right: 0;
          width: 520px;
          max-width: 100%;
          height: 100%;
          background: #f8fafc;
          z-index: 1001;
          transform: translateX(0);
          display: flex;
          flex-direction: column;
        }

        .drawer.open { transform: translateX(0); }

        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          background: white;
          border-bottom: 1px solid #e2e8f0;
        }

        .drawer-title-area { display: flex; align-items: center; gap: 14px; }

        .drawer-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #0061a6 0%, #0085e0 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .drawer-title-area h2 { font-size: 18px; font-weight: 600; color: #1e293b; margin: 0; }
        .drawer-title-area p { font-size: 13px; color: #64748b; margin: 0; }

        .drawer-close {
          width: 40px;
          height: 40px;
          border: none;
          background: #f1f5f9;
          border-radius: 10px;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .drawer-close:hover { background: #e2e8f0; color: #1e293b; }

        /* ===== Drawer Steps ===== */
        .drawer-steps {
          display: flex;
          padding: 16px 24px;
          background: white;
          border-bottom: 1px solid #e2e8f0;
          gap: 8px;
        }

        .step-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 12px 8px;
          border: 2px solid transparent;
          border-radius: 12px;
          background: #f8fafc;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .step-btn:hover { background: #f1f5f9; }
        .step-btn.active { background: rgba(0, 97, 166, 0.05); border-color: #0061a6; }
        .step-btn:disabled,
        .step-btn.step-btn-locked {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .kimlik-reuse-banner {
          margin: 0;
          padding: 12px 24px;
          background: #fff7ed;
          border-bottom: 1px solid #fed7aa;
          color: #9a3412;
          font-size: 14px;
          line-height: 1.5;
        }

        .kimlik-reuse-banner--info {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 10px;
          color: #1e40af;
          padding: 12px 14px;
        }

        .step-number {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 18px;
          height: 18px;
          background: #e2e8f0;
          border-radius: 50%;
          font-size: 10px;
          font-weight: 600;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .step-btn.active .step-number { background: #0061a6; color: white; }

        .step-icon { color: #64748b; }
        .step-btn.active .step-icon { color: #0061a6; }

        .step-label { font-size: 12px; font-weight: 500; color: #64748b; }
        .step-btn.active .step-label { color: #0061a6; }

        /* ===== Drawer Body ===== */
        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .alert-error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .alert-success { background: rgba(34, 197, 94, 0.1); color: #22c55e; }

        .step-content { display: none; }
        .step-content.active { display: block; animation: fadeIn 0.3s ease; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .form-field { display: flex; flex-direction: column; gap: 8px; }
        .form-field.full-width { grid-column: span 2; }

        .field-label { display: flex; align-items: center; gap: 4px; }
        .label-text { font-size: 13px; font-weight: 500; color: #475569; }
        .label-required { color: #ef4444; }

        .field-input, .field-textarea {
          padding: 12px 14px;
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .field-input:focus, .field-textarea:focus {
          outline: none;
          border-color: #0061a6;
          box-shadow: 0 0 0 4px rgba(0, 97, 166, 0.1);
        }

        .field-textarea { resize: vertical; min-height: 80px; }

        .input-with-icon { position: relative; }
        .input-with-icon svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .input-with-icon .field-input { padding-left: 44px; }

        /* Fotoğraf Yükleme Stilleri */
        .photo-upload-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid #e2e8f0;
        }

        .photo-preview-container {
          position: relative;
        }

        .photo-preview {
          position: relative;
          width: 120px;
          height: 120px;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid #0061a6;
          box-shadow: 0 4px 15px rgba(0, 97, 166, 0.2);
        }

        .photo-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .photo-remove-btn {
          position: absolute;
          top: 0;
          right: 0;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #ef4444;
          border: 2px solid white;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .photo-remove-btn:hover {
          background: #dc2626;
          transform: scale(1.1);
        }

        .photo-placeholder {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
          border: 3px dashed #cbd5e1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          color: #94a3b8;
        }

        .photo-placeholder:hover {
          border-color: #0061a6;
          color: #0061a6;
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        }

        .photo-placeholder span {
          font-size: 12px;
          font-weight: 500;
        }

        .photo-change-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 13px;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .photo-change-btn:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #0061a6;
        }

        .photo-uploading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #0061a6;
          font-size: 13px;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid #e2e8f0;
          border-top-color: #0061a6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .gender-selector { display: flex; gap: 12px; }

        .gender-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px;
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .gender-btn:hover { border-color: #cbd5e1; }
        .gender-btn.selected { background: rgba(0, 97, 166, 0.05); border-color: #0061a6; color: #0061a6; }

        .emergency-notice {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px;
          background: rgba(249, 115, 22, 0.1);
          border-radius: 12px;
          margin-bottom: 20px;
        }

        .emergency-notice svg { color: #f97316; flex-shrink: 0; margin-top: 2px; }
        .emergency-notice h4 { font-size: 14px; font-weight: 600; color: #f97316; margin: 0 0 4px; }
        .emergency-notice p { font-size: 13px; color: #c2410c; margin: 0; }

        .toggle-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
        }

        .toggle-info { display: flex; flex-direction: column; gap: 2px; }
        .toggle-title { font-size: 14px; font-weight: 500; color: #1e293b; }
        .toggle-desc { font-size: 12px; color: #64748b; }

        .switch { position: relative; width: 48px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }

        .slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: #e2e8f0;
          border-radius: 26px;
          transition: 0.3s;
        }

        .slider::before {
          content: "";
          position: absolute;
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: 0.3s;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .switch input:checked + .slider { background: #0061a6; }
        .switch input:checked + .slider::before { transform: translateX(22px); }

        /* ===== Drawer Footer ===== */
        .drawer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          background: white;
          border-top: 1px solid #e2e8f0;
        }

        .btn-cancel {
          padding: 12px 20px;
          background: transparent;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-cancel:hover { background: #f8fafc; border-color: #cbd5e1; }

        .footer-actions { display: flex; gap: 10px; }

        .btn-prev, .btn-next {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 18px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-prev { background: #f1f5f9; color: #475569; }
        .btn-prev:hover { background: #e2e8f0; }
        .btn-next { background: #0061a6; color: white; }
        .btn-next:hover { background: #0052a3; }

        .btn-submit {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);
        }

        .btn-submit:disabled { opacity: 0.7; cursor: not-allowed; }

        .btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* ===== Settings Card ===== */
        .settings-card {
          margin-top: 20px;
        }

        .settings-card-link {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          border: 1px solid #e5e7eb;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s ease;
        }

        .settings-card-link:hover {
          border-color: #0061a6;
          box-shadow: 0 4px 12px rgba(0, 97, 166, 0.15);
          transform: translateY(-2px);
        }

        .settings-card-icon {
          width: 52px;
          height: 52px;
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .settings-card-content {
          flex: 1;
        }

        .settings-card-content h3 {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
        }

        .settings-card-content p {
          margin: 0;
          font-size: 14px;
          color: #6b7280;
        }

        .settings-card-arrow {
          color: #9ca3af;
          transition: all 0.2s ease;
        }

        .settings-card-link:hover .settings-card-arrow {
          color: #0061a6;
          transform: translateX(4px);
        }

        /* ===== Responsive ===== */
        @media (max-width: 768px) {
          .page-container { padding: 16px; }

          .hero-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
            padding: 20px;
          }

          .btn-create { width: 100%; justify-content: center; }

          .stats-row { flex-wrap: wrap; }
          .stat-chip { flex: 1 1 calc(50% - 6px); }

          .toolbar { flex-direction: column; }
          .search-container { max-width: 100%; }

          .card-grid { grid-template-columns: 1fr; }

          .drawer { width: 100%; }
          .drawer-steps { padding: 12px 16px; gap: 4px; }
          .step-btn { padding: 10px 6px; }
          .step-label { font-size: 11px; }

          .form-grid { grid-template-columns: 1fr; }
          .form-field.full-width { grid-column: span 1; }

          .quick-view-popup {
            max-width: 100%;
            max-height: 80vh;
            border-radius: 16px;
            margin: auto;
          }

          .quick-view-overlay {
            padding: 16px;
            align-items: flex-end;
          }
        }

        /* Delete Modal */
        .delete-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
          animation: fadeIn 0.2s ease;
        }

        .delete-modal {
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 420px;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .delete-modal-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .delete-modal-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #fee2e2, #fecaca);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #dc2626;
        }

        .delete-modal-title h3 {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 4px;
        }

        .delete-modal-title p {
          font-size: 14px;
          color: #64748b;
          margin: 0;
        }

        .delete-modal-content {
          background: #f8fafc;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .delete-personel-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .delete-personel-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea, #764ba2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 16px;
          overflow: hidden;
        }

        .delete-personel-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .delete-personel-details h4 {
          font-size: 15px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 4px;
        }

        .delete-personel-details p {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }

        .delete-warning {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          background: #fef3c7;
          border-radius: 8px;
          margin-top: 12px;
          font-size: 13px;
          color: #92400e;
        }

        .delete-warning svg {
          flex-shrink: 0;
          margin-top: 1px;
        }

        .delete-modal-actions {
          display: flex;
          gap: 12px;
        }

        .delete-modal-actions button {
          flex: 1;
          padding: 12px 20px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn-cancel {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #475569;
        }

        .btn-cancel:hover {
          background: #e2e8f0;
        }

        .btn-delete {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border: none;
          color: white;
        }

        .btn-delete:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        }

        .btn-delete:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Action Button Danger Style */
        .action-btn-mini.action-btn-danger:hover {
          background: #fee2e2;
          color: #dc2626;
        }

        /* Quick View Delete Button */
        .qv-btn.delete {
          color: #dc2626;
        }

        .qv-btn.delete:hover {
          background: #fee2e2;
        }
      `}</style>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingPersonel && (
        <div className="delete-modal-overlay" onClick={() => !deleteLoading && setShowDeleteModal(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <div className="delete-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </div>
              <div className="delete-modal-title">
                <h3>Personeli Sil</h3>
                <p>Bu işlem geri alınamaz</p>
              </div>
            </div>
            
            <div className="delete-modal-content">
              <div className="delete-personel-info">
                <div className="delete-personel-avatar">
                  {deletingPersonel.fotograf ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveMediaUrl(deletingPersonel.fotograf) || ""} alt={deletingPersonel.tam_ad} />
                  ) : (
                    <span>{deletingPersonel.ad.charAt(0)}{deletingPersonel.soyad.charAt(0)}</span>
                  )}
                </div>
                <div className="delete-personel-details">
                  <h4>{deletingPersonel.tam_ad}</h4>
                  <p>{deletingPersonel.tc_kimlik_no || 'TC Girilmemiş'}</p>
                </div>
              </div>
              <div className="delete-warning">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>Bu personel kaydı ve ilişkili tüm veriler (görevlendirmeler, hesap bilgileri vb.) kalıcı olarak silinecektir.</span>
              </div>
            </div>

            <div className="delete-modal-actions">
              <button 
                className="btn-cancel" 
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
              >
                İptal
              </button>
              <button 
                className="btn-delete" 
                onClick={handleDeletePersonel}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <div className="loading-spinner" style={{ width: 16, height: 16 }}></div>
                    Siliniyor...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Evet, Sil
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <KisiBulunduModal
        open={kimlik.showModal}
        result={kimlik.result}
        context="personel"
        loading={kimlik.checking}
        applyDisabled={kimlik.applyDisabled}
        onApply={applyKimlikToForm}
        onCancel={() => {
          kimlik.dismissModal();
          if (pendingKimlikReuse) {
            setFormError(KIMLIK_REUSE_MSG);
          }
        }}
      />
    </div>
  );
}
