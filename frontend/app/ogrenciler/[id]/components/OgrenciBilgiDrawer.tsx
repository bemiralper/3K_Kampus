"use client";

import { useState, useEffect, useRef } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { tr } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";
import { dateToIsoLocal, isoToLocalDate } from "@/lib/date-utils";
import SchoolAutocomplete from "@/components/okul/SchoolAutocomplete";
import { OgrenciDetay } from "../types";

registerLocale("tr", tr);

type FormStep = 'kisisel' | 'iletisim' | 'egitim';

interface OgrenciBilgiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: OgrenciDetay;
  onSuccess: (updatedData: OgrenciDetay) => void;
  initialStep?: FormStep;
}

interface KayitTuru {
  value: string;
  label: string;
}

interface CinsiyetSecenegi {
  value: string;
  label: string;
}

export default function OgrenciBilgiDrawer({
  isOpen,
  onClose,
  data,
  onSuccess,
  initialStep = 'kisisel',
}: OgrenciBilgiDrawerProps) {
  const [activeStep, setActiveStep] = useState<FormStep>(initialStep);
  const [formData, setFormData] = useState({
    ad: '',
    soyad: '',
    tc_kimlik_no: '',
    dogum_tarihi: '',
    cinsiyet: '',
    telefon: '',
    email: '',
    adres: '',
    kayit_turu: '',
    aktif_mi: true,
    sinif_seviyesi_id: '' as number | '',
    sinif_id: '' as number | '',
    alan_id: '' as number | '',
    school_id: null as number | null,
    school_ad: '',
  });
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<{ id: number; ad: string; kod?: string }[]>([]);
  const [siniflar, setSiniflar] = useState<{ id: number; ad: string; sinif_seviyesi_id: number | null }[]>([]);
  const [alanlar, setAlanlar] = useState<{ id: number; ad: string; kod?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [kayitTurleri, setKayitTurleri] = useState<KayitTuru[]>([]);
  const [cinsiyetSecenekleri, setCinsiyetSecenekleri] = useState<CinsiyetSecenegi[]>([]);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Steps configuration
  const steps: { key: FormStep; label: string; icon: React.ReactNode }[] = [
    { 
      key: 'kisisel', 
      label: 'Kişisel Bilgiler',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    },
    { 
      key: 'iletisim', 
      label: 'İletişim',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
          <line x1="23" y1="11" x2="17" y2="11" />
          <line x1="20" y1="8" x2="20" y2="14" />
        </svg>
      )
    },
    { 
      key: 'egitim', 
      label: 'Eğitim',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      )
    },
  ];

  // Load kayıt türleri ve cinsiyet seçenekleri
  useEffect(() => {
    if (isOpen) {
      // Kayıt türlerini yükle
      fetch('/api/ogrenciler/api/kayit-turleri/', { credentials: 'include' })
        .then(res => res.json())
        .then(result => {
          if (result.success && result.kayit_turleri) {
            setKayitTurleri(result.kayit_turleri);
          }
        })
        .catch(err => console.error('Kayıt türleri yüklenemedi:', err));

      // Cinsiyet seçeneklerini yükle
      fetch('/api/ogrenciler/api/cinsiyet-secenekleri/', { credentials: 'include' })
        .then(res => res.json())
        .then(result => {
          if (result.success && result.cinsiyetler) {
            setCinsiyetSecenekleri(result.cinsiyetler);
          }
        })
        .catch(err => console.error('Cinsiyet seçenekleri yüklenemedi:', err));

      fetch('/api/ogrenciler/api/filter-options/', { credentials: 'include' })
        .then(res => res.json())
        .then(result => {
          const payload = result.data || result;
          setSinifSeviyeleri(payload.sinif_seviyeleri || []);
          setSiniflar(payload.siniflar || []);
          setAlanlar(payload.alanlar || []);
          if (payload.kayit_turleri?.length) {
            setKayitTurleri(payload.kayit_turleri);
          }
        })
        .catch(err => console.error('Sınıf seçenekleri yüklenemedi:', err));
    }
  }, [isOpen]);

  // Load data when drawer opens
  useEffect(() => {
    if (isOpen && data) {
      setFormData({
        ad: data.ad || '',
        soyad: data.soyad || '',
        tc_kimlik_no: data.tc_kimlik_no || '',
        dogum_tarihi: data.dogum_tarihi_iso || '',
        cinsiyet: data.cinsiyet || '',
        telefon: data.telefon || '',
        email: data.email || '',
        adres: data.adres || '',
        kayit_turu: data.kayit_turu || 'asil',
        aktif_mi: data.aktif_mi,
        sinif_seviyesi_id: data.sinif_seviyesi?.id ?? '',
        sinif_id: data.sinif?.id ?? '',
        alan_id: data.alan?.id ?? '',
        school_id: data.school_id ?? null,
        school_ad: data.school_ad || data.geldigi_okul || '',
      });
      setError('');
      setSuccess('');
      setActiveStep(initialStep);
    }
  }, [isOpen, data, initialStep]);

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Proxy üzerinden API çağrısı
      const response = await fetch(`/api/ogrenciler/api/${data.id}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          sinif_seviyesi_id: formData.sinif_seviyesi_id || null,
          sinif_id: formData.sinif_id || null,
          alan_id: formData.alan_id || null,
          school_id: formData.school_id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(result.message || 'Öğrenci bilgileri güncellendi');
        // Update parent with new data - display alanlarını da güncelle
        const cinsiyetMap: Record<string, string> = {};
        cinsiyetSecenekleri.forEach(c => { cinsiyetMap[c.value] = c.label; });
        const kayitTuruMap: Record<string, string> = {};
        kayitTurleri.forEach(k => { kayitTuruMap[k.value] = k.label; });
        const selectedSeviye = sinifSeviyeleri.find(
          (s) => s.id === Number(formData.sinif_seviyesi_id),
        );
        
        const updatedData = { 
          ...data, 
          ...formData, 
          tam_ad: `${formData.ad} ${formData.soyad}`,
          cinsiyet_display: cinsiyetMap[formData.cinsiyet] || data.cinsiyet_display,
          kayit_turu_display: kayitTuruMap[formData.kayit_turu] || data.kayit_turu_display,
          dogum_tarihi_iso: formData.dogum_tarihi,
          school_id: formData.school_id,
          school_ad: formData.school_ad,
          geldigi_okul: formData.school_ad,
          sinif_seviyesi: formData.sinif_seviyesi_id
            ? {
                id: Number(formData.sinif_seviyesi_id),
                ad: selectedSeviye?.ad || data.sinif_seviyesi?.ad || '',
                kod: selectedSeviye?.kod || data.sinif_seviyesi?.kod,
              }
            : data.sinif_seviyesi,
          sinif: formData.sinif_id
            ? {
                id: Number(formData.sinif_id),
                ad: siniflar.find((s) => s.id === Number(formData.sinif_id))?.ad || data.sinif?.ad || '',
              }
            : data.sinif,
          alan: formData.alan_id
            ? {
                id: Number(formData.alan_id),
                ad: alanlar.find((a) => a.id === Number(formData.alan_id))?.ad || data.alan?.ad || '',
                kod: alanlar.find((a) => a.id === Number(formData.alan_id))?.kod,
              }
            : null,
        };
        setTimeout(() => {
          onSuccess(updatedData);
          onClose();
        }, 1500);
      } else {
        setError(result.errors ? Object.values(result.errors).join(', ') : 'Güncelleme başarısız');
      }
    } catch (err) {
      setError('Sunucu hatası oluştu');
      console.error('Update error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="drawer-overlay visible" 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 2000,
        }}
      />
      
      {/* Drawer */}
      <div 
        ref={drawerRef}
        className="drawer open"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '600px',
          maxWidth: '90vw',
          background: 'white',
          zIndex: 2001,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.15)',
          animation: 'slideIn 0.3s ease-out',
        }}
      >
        {/* Header */}
        <div 
          className="drawer-header"
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(99, 102, 241, 0.05))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div 
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                Öğrenci Bilgilerini Düzenle
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748b' }}>
                {data.tam_ad}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: 'none',
              background: 'rgba(100, 116, 139, 0.1)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.color = '#ef4444';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Step Navigation */}
        <div 
          style={{
            display: 'flex',
            gap: '8px',
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
          }}
        >
          {steps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(step.key)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderRadius: '10px',
                border: activeStep === step.key ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                background: activeStep === step.key ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.05))' : 'white',
                color: activeStep === step.key ? '#3b82f6' : '#64748b',
                fontWeight: activeStep === step.key ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ 
                width: '24px', 
                height: '24px', 
                borderRadius: '6px', 
                background: activeStep === step.key ? '#3b82f6' : '#e2e8f0',
                color: activeStep === step.key ? 'white' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
              }}>
                {index + 1}
              </span>
              {step.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {/* Alerts */}
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#dc2626',
                marginBottom: '20px',
                fontSize: '14px',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {error}
              </div>
            )}
            {success && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                color: '#16a34a',
                marginBottom: '20px',
                fontSize: '14px',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                {success}
              </div>
            )}

            {/* Step: Kişisel Bilgiler */}
            {activeStep === 'kisisel' && (
              <div className="step-content">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Ad <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.ad}
                      onChange={(e) => setFormData({ ...formData, ad: e.target.value })}
                      placeholder="Öğrencinin adı"
                      required
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        outline: 'none',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Soyad <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.soyad}
                      onChange={(e) => setFormData({ ...formData, soyad: e.target.value })}
                      placeholder="Öğrencinin soyadı"
                      required
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        outline: 'none',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      TC Kimlik No
                    </label>
                    <input
                      type="text"
                      value={formData.tc_kimlik_no}
                      onChange={(e) => setFormData({ ...formData, tc_kimlik_no: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                      placeholder="11 haneli TC Kimlik No"
                      maxLength={11}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        outline: 'none',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Doğum Tarihi
                    </label>
                    <DatePicker
                      selected={isoToLocalDate(formData.dogum_tarihi)}
                      onChange={(date: Date | null) =>
                        setFormData({ ...formData, dogum_tarihi: date ? dateToIsoLocal(date) : '' })
                      }
                      locale="tr"
                      dateFormat="dd.MM.yyyy"
                      maxDate={new Date()}
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
                      calendarStartDay={1}
                      placeholderText="GG.AA.YYYY"
                      className="wizard-input"
                      wrapperClassName="w-full"
                    />
                  </div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Cinsiyet
                    </label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, cinsiyet: 'E' })}
                        style={{
                          flex: 1,
                          padding: '14px 20px',
                          borderRadius: '10px',
                          border: formData.cinsiyet === 'E' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                          background: formData.cinsiyet === 'E' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.05))' : 'white',
                          color: formData.cinsiyet === 'E' ? '#3b82f6' : '#64748b',
                          fontWeight: formData.cinsiyet === 'E' ? 600 : 500,
                          fontSize: '14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s',
                        }}
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
                        onClick={() => setFormData({ ...formData, cinsiyet: 'K' })}
                        style={{
                          flex: 1,
                          padding: '14px 20px',
                          borderRadius: '10px',
                          border: formData.cinsiyet === 'K' ? '2px solid #ec4899' : '1px solid #e2e8f0',
                          background: formData.cinsiyet === 'K' ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(219, 39, 119, 0.05))' : 'white',
                          color: formData.cinsiyet === 'K' ? '#ec4899' : '#64748b',
                          fontWeight: formData.cinsiyet === 'K' ? 600 : 500,
                          fontSize: '14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s',
                        }}
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
            )}

            {/* Step: İletişim */}
            {activeStep === 'iletisim' && (
              <div className="step-content">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Telefon
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ 
                        position: 'absolute', 
                        left: '16px', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        color: '#94a3b8',
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                          <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                      </span>
                      <input
                        type="tel"
                        value={formData.telefon}
                        onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
                        placeholder="0532 123 45 67"
                        style={{
                          width: '100%',
                          padding: '12px 16px 12px 48px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6';
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      E-posta
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ 
                        position: 'absolute', 
                        left: '16px', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        color: '#94a3b8',
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      </span>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="ornek@email.com"
                        style={{
                          width: '100%',
                          padding: '12px 16px 12px 48px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6';
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Adres
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ 
                        position: 'absolute', 
                        left: '16px', 
                        top: '16px',
                        color: '#94a3b8',
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </span>
                      <textarea
                        value={formData.adres}
                        onChange={(e) => setFormData({ ...formData, adres: e.target.value })}
                        placeholder="Açık adres..."
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '12px 16px 12px 48px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          fontSize: '14px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          transition: 'all 0.2s',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6';
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Eğitim */}
            {activeStep === 'egitim' && (
              <div className="step-content">
                <div style={{ display: 'grid', gap: '20px' }}>
                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Kayıt Türü
                    </label>
                    <select
                      value={formData.kayit_turu}
                      onChange={(e) => setFormData({ ...formData, kayit_turu: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        background: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        outline: 'none',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'none';
                      }}
                    >
                      <option value="">Seçiniz...</option>
                      {kayitTurleri.map((tur) => (
                        <option key={tur.value} value={tur.value}>{tur.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Alan
                    </label>
                    <select
                      value={formData.alan_id}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : '';
                        setFormData({ ...formData, alan_id: val });
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        background: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">Seçiniz (opsiyonel)…</option>
                      {alanlar.map((alan) => (
                        <option key={alan.id} value={alan.id}>{alan.ad}</option>
                      ))}
                    </select>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>
                      Genelde 11–12. sınıf ve mezun kayıtlarında kullanılır.
                    </p>
                  </div>

                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Sınıf Seviyesi
                    </label>
                    <select
                      value={formData.sinif_seviyesi_id}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : '';
                        setFormData({ ...formData, sinif_seviyesi_id: val, sinif_id: '' });
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        background: 'white',
                      }}
                    >
                      <option value="">Seçiniz...</option>
                      {sinifSeviyeleri.map((seviye) => (
                        <option key={seviye.id} value={seviye.id}>{seviye.ad}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Sınıf
                    </label>
                    <select
                      value={formData.sinif_id}
                      disabled={!formData.sinif_seviyesi_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sinif_id: e.target.value ? Number(e.target.value) : '',
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        background: 'white',
                      }}
                    >
                      <option value="">Seçiniz...</option>
                      {siniflar
                        .filter((s) => !formData.sinif_seviyesi_id || s.sinif_seviyesi_id === Number(formData.sinif_seviyesi_id))
                        .map((sinif) => (
                          <option key={sinif.id} value={sinif.id}>{sinif.ad}</option>
                        ))}
                    </select>
                  </div>

                  <div className="form-field">
                    {(() => {
                      const selectedSeviye = sinifSeviyeleri.find(
                        (s) => s.id === Number(formData.sinif_seviyesi_id),
                      );
                      const isMezun =
                        selectedSeviye?.ad?.toLowerCase().includes('mezun') ||
                        selectedSeviye?.kod?.toLowerCase().includes('mezun') ||
                        data.sinif_seviyesi?.ad?.toLowerCase().includes('mezun') ||
                        data.sinif_seviyesi?.kod?.toLowerCase().includes('mezun');
                      return (
                        <SchoolAutocomplete
                          label={isMezun ? 'Mezun Olduğu Okul' : 'Geldiği Okul'}
                          value={formData.school_id}
                          displayValue={formData.school_ad}
                          placeholder="Okul adı yazarak arayın"
                          onChange={(schoolId, schoolAd) =>
                            setFormData({
                              ...formData,
                              school_id: schoolId,
                              school_ad: schoolAd,
                            })
                          }
                        />
                      );
                    })()}
                  </div>

                  <div className="form-field">
                    <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                      Durum
                    </label>
                    <div 
                      onClick={() => setFormData({ ...formData, aktif_mi: !formData.aktif_mi })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        background: formData.aktif_mi ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div 
                        style={{
                          width: '52px',
                          height: '28px',
                          borderRadius: '14px',
                          background: formData.aktif_mi ? '#22c55e' : '#cbd5e1',
                          position: 'relative',
                          transition: 'all 0.3s',
                        }}
                      >
                        <div 
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: 'white',
                            position: 'absolute',
                            top: '3px',
                            left: formData.aktif_mi ? '27px' : '3px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            transition: 'all 0.3s',
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: formData.aktif_mi ? '#16a34a' : '#64748b' }}>
                          {formData.aktif_mi ? 'Aktif Öğrenci' : 'Pasif Öğrenci'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                          {formData.aktif_mi ? 'Öğrenci sisteme aktif olarak kayıtlı' : 'Öğrenci pasif durumda'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info Card */}
                  <div style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.05))',
                    border: '1px solid rgba(59, 130, 246, 0.1)',
                    marginTop: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#3b82f6',
                        flexShrink: 0,
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="16" x2="12" y2="12"/>
                          <line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#334155', marginBottom: '4px', fontSize: '14px' }}>
                          Bilgilendirme
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                          Sınıf, seviye ve geldiği / mezun olduğu okul bilgileri bu ekrandan güncellenebilir. Değişiklikler aktif eğitim yılı kaydına uygulanır.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div 
            style={{
              padding: '20px 24px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 24px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: 'white',
                color: '#64748b',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#f8fafc';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.background = 'white';
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 32px',
                borderRadius: '10px',
                border: 'none',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  Değişiklikleri Kaydet
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
