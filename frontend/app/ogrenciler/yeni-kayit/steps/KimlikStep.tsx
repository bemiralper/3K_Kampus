"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { tr } from "date-fns/locale";
import { dateToIsoLocal, isoToLocalDate } from "@/lib/date-utils";

registerLocale("tr", tr);
import {
  LookupOption,
  MetadataResponse,
  RenewalState,
  TcCheckResponse,
  WizardData,
} from "../types";
import { formatPhone, titleCase, validateTcKimlik } from "../utils";
import { apiFetch } from "@/lib/api";

interface KimlikStepProps {
  data: WizardData;
  metadata: MetadataResponse;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  renewalState: RenewalState;
  onRenewalDecision: (decision: "renew" | "new" | "cancel", tcResult: TcCheckResponse) => void;
}

export default function KimlikStep({
  data,
  metadata,
  errors,
  onChange,
  renewalState,
  onRenewalDecision,
}: KimlikStepProps) {
  const [tcChecking, setTcChecking] = useState(false);
  const [tcResult, setTcResult] = useState<TcCheckResponse | null>(null);
  const [showTcModal, setShowTcModal] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // TC değiştiğinde debounce ile kontrol
  const checkTc = useCallback(async (tc: string) => {
    if (!validateTcKimlik(tc)) return;
    setTcChecking(true);
    try {
      const res = await apiFetch<TcCheckResponse>(`/api/ogrenci-kayit/tc-check/?tc=${tc}`);
      if (res.success && res.data) {
        const result = res.data;
        setTcResult(result);
        if (result.found) {
          setShowTcModal(true);
        }
      }
    } catch {
      // silently ignore
    } finally {
      setTcChecking(false);
    }
  }, []);

  const handleTcChange = (value: string) => {
    const cleanedTc = value.replace(/\D/g, "").slice(0, 11);
    onChange({
      ...data,
      student: { ...data.student, tc_kimlik_no: cleanedTc },
    });

    // Eğer kayıt yenileme modundaysa ve TC değişiyorsa, yenileme modunu sıfırla
    // Bu parent'da yönetilecek

    // Debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (cleanedTc.length === 11) {
      debounceRef.current = setTimeout(() => checkTc(cleanedTc), 300);
    } else {
      setTcResult(null);
    }
  };

  // Component unmount temizliği
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleModalDecision = (decision: "renew" | "new" | "cancel") => {
    setShowTcModal(false);
    if (tcResult) {
      onRenewalDecision(decision, tcResult);
    }
    if (decision === "cancel") {
      onChange({
        ...data,
        student: { ...data.student, tc_kimlik_no: "" },
      });
      setTcResult(null);
    }
  };

  const isReadOnly = renewalState.isRenewal;

  return (
    <div className="wizard-step-content">
      <div className="step-header">
        <div className="step-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <line x1="7" y1="9" x2="17" y2="9" />
            <line x1="7" y1="13" x2="12" y2="13" />
          </svg>
        </div>
        <div>
          <h3>Kimlik Bilgileri</h3>
          <p>Öğrencinin temel kimlik ve iletişim bilgilerini girin</p>
        </div>
      </div>

      {/* Kayıt Yenileme Bilgi Bandı */}
      {renewalState.isRenewal && (
        <div className="tc-renewal-banner">
          <div className="renewal-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </div>
          <div className="renewal-info">
            <strong>Kayıt Yenileme Modu</strong>
            <span>
              Mevcut öğrenci bilgileri otomatik dolduruldu.
              {renewalState.previousEnrollment && (
                <> Son kayıt: <b>{renewalState.previousEnrollment.egitim_yili}</b> — {renewalState.previousEnrollment.sinif_seviyesi}</>
              )}
            </span>
          </div>
          <button
            type="button"
            className="renewal-reset-btn"
            onClick={() => {
              onRenewalDecision("cancel", tcResult!);
              setTcResult(null);
            }}
          >
            Yenileme İptal
          </button>
        </div>
      )}

      <div className="wizard-form-grid">
        {/* Kayıt Türü */}
        <div className="wizard-field">
          <label className="wizard-label required">Kayıt Türü</label>
          <select
            className={`wizard-select ${errors.kayit_turu ? 'error' : ''}`}
            value={data.student.kayit_turu ?? ""}
            onChange={(e) =>
              onChange({
                ...data,
                student: { ...data.student, kayit_turu: Number(e.target.value) || undefined },
              })
            }
          >
            <option value="">Seçiniz</option>
            {metadata.lookups.registration_type?.map((option: LookupOption) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.kayit_turu && <span className="wizard-error">{errors.kayit_turu}</span>}
        </div>

        {/* TC Kimlik No */}
        <div className="wizard-field">
          <label className="wizard-label required">T.C. Kimlik No</label>
          <div className="tc-input-wrapper">
            <input
              type="text"
              className={`wizard-input ${errors.tc_kimlik_no ? 'error' : ''} ${tcResult?.found ? 'tc-found' : ''}`}
              value={data.student.tc_kimlik_no}
              maxLength={11}
              placeholder="11 haneli TC Kimlik No"
              onChange={(e) => handleTcChange(e.target.value)}
            />
            {tcChecking && (
              <div className="tc-spinner">
                <svg className="spinner-svg" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="#0262a7" strokeWidth="3" strokeDasharray="31" strokeLinecap="round" />
                </svg>
              </div>
            )}
            {tcResult?.found && !showTcModal && renewalState.isRenewal && (
              <div className="tc-badge tc-badge-renewal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                </svg>
                Yenileme
              </div>
            )}
          </div>
          {errors.tc_kimlik_no && <span className="wizard-error">{errors.tc_kimlik_no}</span>}
        </div>

        {/* Ad */}
        <div className="wizard-field">
          <label className="wizard-label required">Ad</label>
          <input
            type="text"
            className={`wizard-input ${errors.ad ? 'error' : ''} ${isReadOnly ? 'readonly-field' : ''}`}
            value={data.student.ad}
            placeholder="Öğrenci adı (birden fazla ad girilebilir)"
            readOnly={isReadOnly}
            onChange={(e) =>
              onChange({
                ...data,
                student: {
                  ...data.student,
                  ad: titleCase(e.target.value),
                },
              })
            }
          />
          {errors.ad && <span className="wizard-error">{errors.ad}</span>}
        </div>

        {/* Soyad */}
        <div className="wizard-field">
          <label className="wizard-label required">Soyad</label>
          <input
            type="text"
            className={`wizard-input ${errors.soyad ? 'error' : ''} ${isReadOnly ? 'readonly-field' : ''}`}
            value={data.student.soyad}
            placeholder="Öğrenci soyadı (birden fazla soyad girilebilir)"
            readOnly={isReadOnly}
            onChange={(e) =>
              onChange({
                ...data,
                student: {
                  ...data.student,
                  soyad: titleCase(e.target.value),
                },
              })
            }
          />
          {errors.soyad && <span className="wizard-error">{errors.soyad}</span>}
        </div>

        {/* Doğum Tarihi */}
        <div className="wizard-field">
          <label className="wizard-label required">Doğum Tarihi</label>
          <DatePicker
            selected={isoToLocalDate(data.student.dogum_tarihi || "")}
            onChange={(date: Date | null) =>
              onChange({
                ...data,
                student: {
                  ...data.student,
                  dogum_tarihi: date ? dateToIsoLocal(date) : "",
                },
              })
            }
            locale="tr"
            dateFormat="dd.MM.yyyy"
            maxDate={new Date()}
            showMonthDropdown
            showYearDropdown
            dropdownMode="select"
            placeholderText="GG.AA.YYYY"
            calendarStartDay={1}
            className={`wizard-input ${errors.dogum_tarihi ? 'error' : ''} ${isReadOnly ? 'readonly-field' : ''}`}
            readOnly={isReadOnly}
            disabled={isReadOnly}
          />
          {errors.dogum_tarihi && <span className="wizard-error">{errors.dogum_tarihi}</span>}
        </div>

        {/* Cinsiyet */}
        <div className="wizard-field">
          <label className="wizard-label required">Cinsiyet</label>
          <select
            className={`wizard-select ${errors.cinsiyet ? 'error' : ''} ${isReadOnly ? 'readonly-field' : ''}`}
            value={data.student.cinsiyet ?? ""}
            disabled={isReadOnly}
            onChange={(e) =>
              onChange({
                ...data,
                student: { ...data.student, cinsiyet: Number(e.target.value) || undefined },
              })
            }
          >
            <option value="">Seçiniz</option>
            {metadata.lookups.gender?.map((option: LookupOption) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.cinsiyet && <span className="wizard-error">{errors.cinsiyet}</span>}
        </div>

        {/* E-posta */}
        <div className="wizard-field">
          <label className="wizard-label">E-posta</label>
          <input
            type="email"
            className="wizard-input"
            value={data.student.email}
            placeholder="ornek@email.com"
            onChange={(e) =>
              onChange({
                ...data,
                student: { ...data.student, email: e.target.value },
              })
            }
          />
        </div>

        {/* Telefon */}
        <div className="wizard-field">
          <label className="wizard-label">Telefon</label>
          <input
            type="text"
            className="wizard-input"
            value={data.student.telefon}
            placeholder="(5XX) XXX XX XX"
            onChange={(e) =>
              onChange({
                ...data,
                student: { ...data.student, telefon: formatPhone(e.target.value) },
              })
            }
          />
        </div>
      </div>

      {/* TC BULUNDU MODAL */}
      {showTcModal && tcResult?.found && tcResult.ogrenci && (
        <div className="tc-modal-overlay">
          <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tc-modal-header">
              <div className="tc-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0262a7" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <h3>Mevcut Öğrenci Bulundu</h3>
              <button className="tc-modal-close" onClick={() => handleModalDecision("cancel")}>✕</button>
            </div>

            <div className="tc-modal-body">
              {/* Öğrenci Bilgileri */}
              <div className="tc-modal-student-card">
                <div className="tc-student-avatar">
                  {tcResult.ogrenci.ad.charAt(0)}{tcResult.ogrenci.soyad.charAt(0)}
                </div>
                <div className="tc-student-info">
                  <h4>{tcResult.ogrenci.ad} {tcResult.ogrenci.soyad}</h4>
                  <span className="tc-student-tc">TC: {tcResult.ogrenci.tc_kimlik_no}</span>
                  <span className={`tc-student-status ${tcResult.ogrenci.aktif_mi ? 'active' : 'inactive'}`}>
                    {tcResult.ogrenci.aktif_mi ? '● Aktif' : '○ Pasif'}
                  </span>
                </div>
              </div>

              {/* Kayıt Geçmişi */}
              {tcResult.kayit_gecmisi && tcResult.kayit_gecmisi.length > 0 && (
                <div className="tc-modal-section">
                  <h5>📚 Kayıt Geçmişi</h5>
                  <div className="tc-kayit-list">
                    {tcResult.kayit_gecmisi.map((k, i) => (
                      <div key={i} className="tc-kayit-item">
                        <span className="tc-kayit-yil">{k.egitim_yili}</span>
                        <span className="tc-kayit-seviye">{k.sinif_seviyesi}{k.alan ? ` — ${k.alan}` : ''}</span>
                        <span className={`tc-kayit-durum ${k.aktif_mi ? 'active' : 'inactive'}`}>
                          {k.aktif_mi ? 'Aktif' : 'Tamamlandı'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sözleşme Durumu */}
              {tcResult.son_sozlesme && (
                <div className="tc-modal-section">
                  <h5>📄 Son Sözleşme</h5>
                  <div className="tc-sozlesme-info">
                    <span>{tcResult.son_sozlesme.sozlesme_no}</span>
                    <span>{tcResult.son_sozlesme.paket_adi}</span>
                    <span className={`tc-sozlesme-durum durum-${tcResult.son_sozlesme.durum}`}>
                      {tcResult.son_sozlesme.durum === 'taslak' ? 'Taslak' :
                       tcResult.son_sozlesme.durum === 'aktif' ? 'Aktif' :
                       tcResult.son_sozlesme.durum === 'iptal' ? 'İptal' :
                       tcResult.son_sozlesme.durum === 'tamamlandi' ? 'Tamamlandı' : tcResult.son_sozlesme.durum}
                    </span>
                  </div>
                </div>
              )}

              {/* Aktif yılda kayıtlı uyarısı */}
              {tcResult.aktif_yilda_kayitli && (
                <div className="tc-modal-warning">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>Bu öğrenci aktif eğitim yılında zaten kayıtlı!</span>
                </div>
              )}

              {/* Sonraki seviye önerisi */}
              {tcResult.sonraki_seviye && !tcResult.aktif_yilda_kayitli && (
                <div className="tc-modal-next-level">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0262a7" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                  </svg>
                  <span>Önerilen sınıf seviyesi: <b>{tcResult.sonraki_seviye.ad}</b></span>
                </div>
              )}
            </div>

            <div className="tc-modal-footer">
              <button
                type="button"
                className="tc-modal-btn tc-btn-cancel"
                onClick={() => handleModalDecision("cancel")}
              >
                İptal
              </button>
              {!tcResult.aktif_yilda_kayitli && (
                <>
                  <button
                    type="button"
                    className="tc-modal-btn tc-btn-new"
                    onClick={() => handleModalDecision("new")}
                  >
                    Yeni Kayıt Aç
                  </button>
                  <button
                    type="button"
                    className="tc-modal-btn tc-btn-renew"
                    onClick={() => handleModalDecision("renew")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    </svg>
                    Kayıt Yenile
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
