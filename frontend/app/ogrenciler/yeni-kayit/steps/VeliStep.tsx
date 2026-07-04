"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GuardianAddressData, LookupOption, MetadataResponse, RenewalState, VeliTcCheckResponse, WizardData } from "../types";
import { formatAddress, formatPhone, titleCase, validateTcKimlik } from "../utils";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface VeliStepProps {
  data: WizardData;
  metadata: MetadataResponse;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  renewalState: RenewalState;
}

export default function VeliStep({ data, metadata, errors, onChange, renewalState }: VeliStepProps) {
  
  // Veli TC kontrolü state'leri
  const [veliTcChecking, setVeliTcChecking] = useState<number | null>(null);
  const [veliTcResult, setVeliTcResult] = useState<VeliTcCheckResponse | null>(null);
  const [showVeliTcModal, setShowVeliTcModal] = useState(false);
  const [veliTcModalIndex, setVeliTcModalIndex] = useState<number>(0);
  const veliDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Varsayılan ili bul (Erzurum)
  const defaultCity = metadata.cities?.find(c => c.is_default) || metadata.cities?.[0];
  
  // Öğrenci adresini göster
  const getOgrenciAdresBilgisi = () => {
    const { address } = data;
    const il = metadata.cities?.find(c => c.id === address.il);
    let ilce = "";
    if (address.ilce) {
      // İlçe ID'si varsa, metadata'dan al
      ilce = address.ilce.toString();
    } else {
      ilce = address.ilce_adi || "";
    }
    
    return {
      il: il?.name || "Belirtilmemiş",
      ilce: ilce || "Belirtilmemiş",
      acik_adres: address.acik_adres || "Belirtilmemiş",
      posta_kodu: address.posta_kodu || "Belirtilmemiş",
    };
  };

  const handleVeliSecimi = (secim: 'self' | 'add') => {
    if (secim === 'self') {
      // Öğrenci kendi velisi, guardians'ı boşalt
      onChange({ ...data, veliSecimi: 'self', guardians: [] });
    } else {
      // Veli ekle seçildi
      if (data.guardians.length === 0) {
        // İlk veliyi ekle
        onChange({
          ...data,
          veliSecimi: 'add',
          guardians: [{
            yakinlik_turu: undefined,
            tc_kimlik_no: "",
            ad: "",
            soyad: "",
            telefon: "",
            email: "",
            meslek: "",
            is_sms_enabled: true,
            is_email_enabled: true,
            adres_ayni_mi: true,
            adres: undefined,
          }]
        });
      } else {
        onChange({ ...data, veliSecimi: 'add' });
      }
    }
  };

  const handleTcChange = (index: number, value: string) => {
    const cleanValue = value.replace(/\D/g, "").slice(0, 11);
    const newGuardians = [...data.guardians];
    newGuardians[index] = { ...newGuardians[index], tc_kimlik_no: cleanValue };
    onChange({ ...data, guardians: newGuardians });

    // Debounce ile veli TC kontrolü
    if (veliDebounceRef.current) clearTimeout(veliDebounceRef.current);
    if (cleanValue.length === 11 && validateTcKimlik(cleanValue)) {
      veliDebounceRef.current = setTimeout(() => checkVeliTc(cleanValue, index), 300);
    } else {
      setVeliTcResult(null);
    }
  };

  const checkVeliTc = useCallback(async (tc: string, index: number) => {
    setVeliTcChecking(index);
    try {
      const res = await fetch(`${API_BASE}/api/ogrenci-kayit/veli-tc-check/?tc=${tc}`, {
        headers: { "X-Kurum-ID": "1", "X-Sube-ID": "1" },
      });
      if (res.ok) {
        const result: VeliTcCheckResponse = await res.json();
        setVeliTcResult(result);
        if (result.found) {
          setVeliTcModalIndex(index);
          setShowVeliTcModal(true);
        }
      }
    } catch {
      // silently ignore
    } finally {
      setVeliTcChecking(null);
    }
  }, []);

  // Component unmount temizliği
  useEffect(() => {
    return () => {
      if (veliDebounceRef.current) clearTimeout(veliDebounceRef.current);
    };
  }, []);

  const handleVeliTcModalDecision = (decision: "use" | "new" | "cancel") => {
    setShowVeliTcModal(false);
    if (decision === "use" && veliTcResult?.veli) {
      // Mevcut veli bilgilerini otomatik doldur
      const v = veliTcResult.veli;
      const newGuardians = [...data.guardians];
      newGuardians[veliTcModalIndex] = {
        ...newGuardians[veliTcModalIndex],
        tc_kimlik_no: v.tc_kimlik_no,
        ad: v.ad,
        soyad: v.soyad,
        telefon: v.telefon,
        email: v.email,
        meslek: v.meslek,
      };
      onChange({ ...data, guardians: newGuardians });
    } else if (decision === "cancel") {
      // TC'yi temizle
      const newGuardians = [...data.guardians];
      newGuardians[veliTcModalIndex] = {
        ...newGuardians[veliTcModalIndex],
        tc_kimlik_no: "",
      };
      onChange({ ...data, guardians: newGuardians });
      setVeliTcResult(null);
    }
    // decision === "new" → TC bırak, ama otomatik doldurma
  };

  const handleFieldChange = (index: number, field: string, value: any) => {
    const newGuardians = [...data.guardians];
    newGuardians[index] = { ...newGuardians[index], [field]: value };
    onChange({ ...data, guardians: newGuardians });
  };

  const handlePhoneChange = (index: number, field: string, value: string) => {
    const formatted = formatPhone(value);
    handleFieldChange(index, field, formatted);
  };

  const handleAdresSecimi = (index: number, ayniMi: boolean) => {
    const newGuardians = [...data.guardians];
    if (ayniMi) {
      // Öğrenci adresi ile aynı
      newGuardians[index] = { 
        ...newGuardians[index], 
        adres_ayni_mi: true, 
        adres: undefined 
      };
    } else {
      // Farklı adres ekle - varsayılan değerlerle
      newGuardians[index] = { 
        ...newGuardians[index], 
        adres_ayni_mi: false, 
        adres: {
          adres_turu: 1,
          il: defaultCity?.id,
          ilce: undefined,
          ilce_adi: undefined,
          posta_kodu: "",
          acik_adres: "",
        }
      };
    }
    onChange({ ...data, guardians: newGuardians });
  };

  const handleAdresFieldChange = (index: number, field: keyof GuardianAddressData, value: any) => {
    const newGuardians = [...data.guardians];
    const currentAdres = newGuardians[index].adres || {
      adres_turu: 1,
      il: defaultCity?.id,
      ilce: undefined,
      posta_kodu: "",
      acik_adres: "",
    };
    
    if (field === 'il') {
      // İl değiştiğinde ilçeyi sıfırla
      newGuardians[index] = { 
        ...newGuardians[index], 
        adres: { ...currentAdres, il: value, ilce: undefined, ilce_adi: "" }
      };
    } else {
      newGuardians[index] = { 
        ...newGuardians[index], 
        adres: { ...currentAdres, [field]: value }
      };
    }
    onChange({ ...data, guardians: newGuardians });
  };

  const addGuardian = () => {
    if (data.guardians.length >= 3) return;
    onChange({
      ...data,
      guardians: [
        ...data.guardians,
        {
          yakinlik_turu: undefined,
          tc_kimlik_no: "",
          ad: "",
          soyad: "",
          telefon: "",
          email: "",
          meslek: "",
          is_sms_enabled: true,
          is_email_enabled: true,
          adres_ayni_mi: true,
          adres: undefined,
        },
      ],
    });
  };

  const removeGuardian = (index: number) => {
    if (data.guardians.length <= 1) return;
    const newGuardians = data.guardians.filter((_, i) => i !== index);
    onChange({ ...data, guardians: newGuardians });
  };

  const ogrenciAdres = getOgrenciAdresBilgisi();

  return (
    <div className="wizard-step-content">
      <div className="step-header">
        <div className="step-icon purple">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <h3>Veli Bilgileri</h3>
          <p>Öğrencinin veli/vasi bilgilerini girin</p>
        </div>
      </div>

      {/* Veli Seçimi */}
      {data.veliSecimi === null && (
        <div className="veli-secim-container">
          <h4 className="secim-baslik">Veli durumunu seçin</h4>
          <div className="veli-secim-grid">
            <button
              type="button"
              className="veli-secim-card"
              onClick={() => handleVeliSecimi('self')}
            >
              <div className="secim-icon green">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h5>Öğrenci Kendi Velisi</h5>
              <p>18 yaş üstü öğrenci kendi velisi olarak kaydedilecek</p>
            </button>
            
            <button
              type="button"
              className="veli-secim-card"
              onClick={() => handleVeliSecimi('add')}
            >
              <div className="secim-icon purple">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </div>
              <h5>Veli Ekle</h5>
              <p>Öğrenci için veli/vasi bilgilerini gireceksiniz</p>
            </button>
          </div>
        </div>
      )}

      {/* Öğrenci Kendi Velisi */}
      {data.veliSecimi === 'self' && (
        <div className="veli-self-info">
          <div className="info-card success">
            <div className="info-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="info-content">
              <h4>Öğrenci Kendi Velisi Olarak Kaydedilecek</h4>
              <p>
                <strong>{data.student.ad} {data.student.soyad}</strong> 18 yaş üstü olduğu için 
                kendi velisi olarak sisteme kaydedilecektir.
              </p>
            </div>
          </div>
          
          <button
            type="button"
            className="wizard-btn-secondary"
            onClick={() => onChange({ ...data, veliSecimi: null })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Seçimi Değiştir
          </button>
        </div>
      )}

      {/* Veli Ekleme Formu */}
      {data.veliSecimi === 'add' && (
        <>
          <button
            type="button"
            className="wizard-btn-secondary mb-4"
            onClick={() => onChange({ ...data, veliSecimi: null })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Seçimi Değiştir
          </button>

          {data.guardians.map((guardian, index) => (
            <div key={index} className="guardian-card">
              <div className="guardian-card-header">
                <h4>{index + 1}. Veli</h4>
                {data.guardians.length > 1 && (
                  <button
                    type="button"
                    className="wizard-btn-danger-sm"
                    onClick={() => removeGuardian(index)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Kaldır
                  </button>
                )}
              </div>

              <div className="wizard-form-grid">
                {/* Yakınlık Türü */}
                <div className="wizard-field">
                  <label className="wizard-label required">Yakınlık Türü</label>
                  <select
                    className={"wizard-select " + (errors["guardian_" + index + "_yakinlik_turu"] ? "error" : "")}
                    value={guardian.yakinlik_turu ?? ""}
                    onChange={(e) =>
                      handleFieldChange(index, "yakinlik_turu", Number(e.target.value) || undefined)
                    }
                  >
                    <option value="">Seçiniz</option>
                    {metadata.lookups.guardian_type?.map((option: LookupOption) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors["guardian_" + index + "_yakinlik_turu"] && (
                    <span className="wizard-error">{errors["guardian_" + index + "_yakinlik_turu"]}</span>
                  )}
                </div>

                {/* TC Kimlik No */}
                <div className="wizard-field">
                  <label className="wizard-label required">TC Kimlik No</label>
                  <div className="tc-input-wrapper">
                    <input
                      type="text"
                      className={"wizard-input " + (errors["guardian_" + index + "_tc_kimlik_no"] ? "error" : "")}
                      value={guardian.tc_kimlik_no}
                      maxLength={11}
                      placeholder="11 haneli TC Kimlik No"
                      onChange={(e) => handleTcChange(index, e.target.value)}
                    />
                    {veliTcChecking === index && (
                      <div className="tc-spinner">
                        <svg className="spinner-svg" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="#0262a7" strokeWidth="3" strokeDasharray="31" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {guardian.tc_kimlik_no.length === 11 && !validateTcKimlik(guardian.tc_kimlik_no) && (
                    <span className="wizard-warning">Geçersiz TC Kimlik No</span>
                  )}
                  {errors["guardian_" + index + "_tc_kimlik_no"] && (
                    <span className="wizard-error">{errors["guardian_" + index + "_tc_kimlik_no"]}</span>
                  )}
                </div>

                {/* Ad */}
                <div className="wizard-field">
                  <label className="wizard-label required">Ad</label>
                  <input
                    type="text"
                    className={"wizard-input " + (errors["guardian_" + index + "_ad"] ? "error" : "")}
                    value={guardian.ad}
                    placeholder="Veli adı"
                    onChange={(e) => handleFieldChange(index, "ad", titleCase(e.target.value))}
                  />
                  {errors["guardian_" + index + "_ad"] && (
                    <span className="wizard-error">{errors["guardian_" + index + "_ad"]}</span>
                  )}
                </div>

                {/* Soyad */}
                <div className="wizard-field">
                  <label className="wizard-label required">Soyad</label>
                  <input
                    type="text"
                    className={"wizard-input " + (errors["guardian_" + index + "_soyad"] ? "error" : "")}
                    value={guardian.soyad}
                    placeholder="Veli soyadı"
                    onChange={(e) => handleFieldChange(index, "soyad", titleCase(e.target.value))}
                  />
                  {errors["guardian_" + index + "_soyad"] && (
                    <span className="wizard-error">{errors["guardian_" + index + "_soyad"]}</span>
                  )}
                </div>

                {/* Telefon */}
                <div className="wizard-field">
                  <label className="wizard-label required">Telefon</label>
                  <input
                    type="tel"
                    className={"wizard-input " + (errors["guardian_" + index + "_telefon"] ? "error" : "")}
                    value={guardian.telefon}
                    placeholder="(5XX) XXX XX XX"
                    onChange={(e) => handlePhoneChange(index, "telefon", e.target.value)}
                  />
                  {errors["guardian_" + index + "_telefon"] && (
                    <span className="wizard-error">{errors["guardian_" + index + "_telefon"]}</span>
                  )}
                </div>

                {/* E-posta */}
                <div className="wizard-field">
                  <label className="wizard-label">E-posta</label>
                  <input
                    type="email"
                    className="wizard-input"
                    value={guardian.email}
                    placeholder="veli@email.com"
                    onChange={(e) => handleFieldChange(index, "email", e.target.value)}
                  />
                </div>

                {/* Meslek */}
                <div className="wizard-field">
                  <label className="wizard-label">Meslek</label>
                  <input
                    type="text"
                    className="wizard-input"
                    value={guardian.meslek}
                    placeholder="Meslek"
                    onChange={(e) => handleFieldChange(index, "meslek", e.target.value)}
                  />
                </div>

                {/* Bildirim Tercihleri */}
                <div className="wizard-field full-width">
                  <label className="wizard-label">Bildirim Tercihleri</label>
                  <div className="wizard-checkbox-group">
                    <label className="wizard-checkbox">
                      <input
                        type="checkbox"
                        checked={guardian.is_sms_enabled}
                        onChange={(e) => handleFieldChange(index, "is_sms_enabled", e.target.checked)}
                      />
                      <span className="checkbox-label">SMS Bildirimleri</span>
                    </label>
                    <label className="wizard-checkbox">
                      <input
                        type="checkbox"
                        checked={guardian.is_email_enabled}
                        onChange={(e) => handleFieldChange(index, "is_email_enabled", e.target.checked)}
                      />
                      <span className="checkbox-label">E-posta Bildirimleri</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Veli Adresi Bölümü */}
              <div className="veli-adres-section">
                <h5 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Veli Adresi
                </h5>

                {/* Adres Seçimi */}
                <div className="adres-secim-group">
                  <label className="adres-secim-option">
                    <input
                      type="radio"
                      name={"adres_secim_" + index}
                      checked={guardian.adres_ayni_mi}
                      onChange={() => handleAdresSecimi(index, true)}
                    />
                    <span className="radio-label">Öğrenci adresi ile aynı</span>
                  </label>
                  <label className="adres-secim-option">
                    <input
                      type="radio"
                      name={"adres_secim_" + index}
                      checked={!guardian.adres_ayni_mi}
                      onChange={() => handleAdresSecimi(index, false)}
                    />
                    <span className="radio-label">Farklı adres gir</span>
                  </label>
                </div>

                {/* Öğrenci Adresi Gösterimi */}
                {guardian.adres_ayni_mi && (
                  <div className="ogrenci-adres-preview">
                    <div className="adres-preview-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span>Öğrenci Adresi Kullanılacak</span>
                    </div>
                    <div className="adres-detay">
                      <p><strong>İl:</strong> {ogrenciAdres.il}</p>
                      <p><strong>İlçe:</strong> {ogrenciAdres.ilce}</p>
                      <p><strong>Açık Adres:</strong> {ogrenciAdres.acik_adres}</p>
                      {ogrenciAdres.posta_kodu && <p><strong>Posta Kodu:</strong> {ogrenciAdres.posta_kodu}</p>}
                    </div>
                  </div>
                )}

                {/* Farklı Adres Formu */}
                {!guardian.adres_ayni_mi && guardian.adres && (
                  <div className="veli-adres-form">
                    <div className="wizard-form-grid">
                      {/* İl */}
                      <div className="wizard-field">
                        <label className="wizard-label required">İl</label>
                        <select
                          className="wizard-select"
                          value={guardian.adres.il ?? ""}
                          onChange={(e) => handleAdresFieldChange(index, 'il', Number(e.target.value))}
                        >
                          <option value="">Seçiniz</option>
                          {metadata.cities?.map((city) => (
                            <option key={city.id} value={city.id}>
                              {city.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* İlçe */}
                      <div className="wizard-field">
                        <label className="wizard-label required">İlçe</label>
                        <input
                          type="text"
                          className="wizard-input"
                          value={guardian.adres.ilce_adi || ""}
                          placeholder="İlçe adını girin"
                          onChange={(e) =>
                            handleAdresFieldChange(index, 'ilce_adi', formatAddress(e.target.value))
                          }
                        />
                      </div>

                      {/* Posta Kodu */}
                      <div className="wizard-field">
                        <label className="wizard-label">Posta Kodu</label>
                        <input
                          type="text"
                          className="wizard-input"
                          value={guardian.adres.posta_kodu}
                          placeholder="Posta kodu"
                          maxLength={5}
                          onChange={(e) => handleAdresFieldChange(index, 'posta_kodu', e.target.value.replace(/\D/g, ""))}
                        />
                      </div>

                      {/* Açık Adres */}
                      <div className="wizard-field full-width">
                        <label className="wizard-label required">Açık Adres</label>
                        <textarea
                          className="wizard-textarea"
                          value={guardian.adres.acik_adres}
                          placeholder="Mahalle, sokak, bina no, daire no vb."
                          rows={3}
                          onChange={(e) =>
                            handleAdresFieldChange(index, 'acik_adres', formatAddress(e.target.value))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {data.guardians.length < 3 && (
            <button type="button" className="wizard-btn-add" onClick={addGuardian}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              Veli Ekle
            </button>
          )}
        </>
      )}

      <style jsx>{`
        .veli-secim-container {
          padding: 20px 0;
        }

        .secim-baslik {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 20px;
          text-align: center;
        }

        .veli-secim-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        @media (max-width: 640px) {
          .veli-secim-grid {
            grid-template-columns: 1fr;
          }
        }

        .veli-secim-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 30px 20px;
          background: var(--bg-secondary);
          border: 2px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }

        .veli-secim-card:hover {
          border-color: var(--primary-color);
          background: var(--bg-hover);
          transform: translateY(-2px);
        }

        .secim-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }

        .secim-icon.green {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }

        .secim-icon.purple {
          background: rgba(139, 92, 246, 0.1);
          color: #8b5cf6;
        }

        .veli-secim-card h5 {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .veli-secim-card p {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        .veli-self-info {
          padding: 20px 0;
        }

        .info-card {
          display: flex;
          gap: 16px;
          padding: 20px;
          border-radius: 12px;
          margin-bottom: 20px;
        }

        .info-card.success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .info-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .info-content h4 {
          font-size: 15px;
          font-weight: 600;
          color: #10b981;
          margin-bottom: 8px;
        }

        .info-content p {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0;
        }

        .mb-4 {
          margin-bottom: 16px;
        }

        .veli-adres-section {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--border-color);
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 16px;
        }

        .adres-secim-group {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
        }

        .adres-secim-option {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .adres-secim-option input[type="radio"] {
          width: 18px;
          height: 18px;
          accent-color: var(--primary-color);
        }

        .radio-label {
          font-size: 14px;
          color: var(--text-primary);
        }

        .ogrenci-adres-preview {
          background: rgba(59, 130, 246, 0.05);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 8px;
          padding: 16px;
        }

        .adres-preview-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #3b82f6;
          font-weight: 500;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .adres-detay {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .adres-detay p {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        .adres-detay p:last-child {
          grid-column: 1 / -1;
        }

        .veli-adres-form {
          margin-top: 16px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
        }
      `}</style>

      {/* VELİ TC BULUNDU MODAL */}
      {showVeliTcModal && veliTcResult?.found && veliTcResult.veli && (
        <div className="tc-modal-overlay">
          <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tc-modal-header">
              <div className="tc-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0262a7" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Mevcut Veli Bulundu</h3>
              <button className="tc-modal-close" onClick={() => handleVeliTcModalDecision("cancel")}>✕</button>
            </div>

            <div className="tc-modal-body">
              <div className="tc-modal-student-card">
                <div className="tc-student-avatar" style={{ background: "linear-gradient(135deg, #8b5cf6, #6d28d9)" }}>
                  {veliTcResult.veli.ad.charAt(0)}{veliTcResult.veli.soyad.charAt(0)}
                </div>
                <div className="tc-student-info">
                  <h4>{veliTcResult.veli.ad} {veliTcResult.veli.soyad}</h4>
                  <span className="tc-student-tc">TC: {veliTcResult.veli.tc_kimlik_no}</span>
                  <span style={{ fontSize: "13px", color: "#6b7280" }}>
                    {veliTcResult.veli.veli_turu_display}
                    {veliTcResult.veli.meslek ? ` • ${veliTcResult.veli.meslek}` : ""}
                  </span>
                </div>
              </div>

              {/* Bağlantılı Öğrenciler */}
              {veliTcResult.bagli_ogrenciler && veliTcResult.bagli_ogrenciler.length > 0 && (
                <div className="tc-modal-section">
                  <h5>👨‍👧‍👦 Bağlantılı Öğrenciler</h5>
                  <div className="tc-kayit-list">
                    {veliTcResult.bagli_ogrenciler.map((ogr, i) => (
                      <div key={i} className="tc-kayit-item">
                        <span className="tc-kayit-seviye">{ogr.ad} {ogr.soyad}</span>
                        <span className="tc-kayit-yil">{ogr.yakinlik}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="tc-modal-footer">
              <button
                type="button"
                className="tc-modal-btn tc-btn-cancel"
                onClick={() => handleVeliTcModalDecision("cancel")}
              >
                İptal
              </button>
              <button
                type="button"
                className="tc-modal-btn tc-btn-new"
                onClick={() => handleVeliTcModalDecision("new")}
              >
                Yeni Veli Olarak Ekle
              </button>
              <button
                type="button"
                className="tc-modal-btn tc-btn-renew"
                onClick={() => handleVeliTcModalDecision("use")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Mevcut Veliyi Kullan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
