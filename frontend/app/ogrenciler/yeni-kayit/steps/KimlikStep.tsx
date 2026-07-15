"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppDatePicker from "@/components/ui/AppDatePicker";
import {
  LookupOption,
  MetadataResponse,
  RenewalState,
  TcCheckResponse,
  WizardData,
} from "../types";
import { formatPhone, titleCase, validateTcKimlik } from "../utils";
import { apiFetch } from "@/lib/api";
import KisiBulunduModal from "@/components/kimlik/KisiBulunduModal";
import OgrenciKimlikEkPanel from "@/components/kimlik/OgrenciKimlikEkPanel";
import type { KimlikResolveResponse } from "@/lib/kimlik-api";
import { useKimlikLookup } from "@/hooks/useKimlikLookup";
import {
  kimlikFieldClass,
  mergeKimlikForOgrenci,
  tcReadonlyClass,
} from "@/lib/kimlik-form-utils";

interface KimlikStepProps {
  data: WizardData;
  metadata: MetadataResponse;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  renewalState: RenewalState;
  conflictNonce?: number;
  onRenewalDecision: (decision: "renew" | "new" | "cancel", tcResult: TcCheckResponse) => void;
  onUseExistingStudent: (
    tcResult: TcCheckResponse,
    kimlikResult: KimlikResolveResponse | null,
  ) => void;
}

export default function KimlikStep({
  data,
  metadata,
  errors,
  onChange,
  renewalState,
  onRenewalDecision,
  onUseExistingStudent,
  conflictNonce = 0,
}: KimlikStepProps) {
  const [tcChecking, setTcChecking] = useState(false);
  const [tcResult, setTcResult] = useState<TcCheckResponse | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const kimlik = useKimlikLookup({
    context: "ogrenci",
    excludeKisiId: data.student.kisi_id,
    tcDebounceMs: 300,
  });

  const tcLocked = Boolean(data.student.tc_locked || renewalState.tcLocked || renewalState.existingOgrenciId);
  const modalKimlik = mergeKimlikForOgrenci(kimlik.result, tcResult);

  const checkTc = useCallback(async (tc: string) => {
    if (!validateTcKimlik(tc)) return;
    setTcChecking(true);
    try {
      const [kimlikData, tcRes] = await Promise.all([
        kimlik.runResolve({ tc }),
        apiFetch<TcCheckResponse>(`/api/ogrenci-kayit/tc-check/?tc=${tc}`),
      ]);
      const tcCheck = tcRes.success ? tcRes.data ?? null : null;
      setTcResult(tcCheck);
      if (tcCheck?.found && !kimlikData?.found) {
        kimlik.setShowModal(true);
      }
    } catch {
      // silently ignore
    } finally {
      setTcChecking(false);
    }
  }, [kimlik]);

  useEffect(() => {
    if (!conflictNonce) return;
    void (async () => {
      await kimlik.openConflictLookup(data.student.tc_kimlik_no, data.student.telefon);
      if (data.student.tc_kimlik_no.length === 11) {
        const tcRes = await apiFetch<TcCheckResponse>(
          `/api/ogrenci-kayit/tc-check/?tc=${data.student.tc_kimlik_no}`,
        );
        if (tcRes.success && tcRes.data) setTcResult(tcRes.data);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conflictNonce ile tetiklenir
  }, [conflictNonce]);

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

  const handleApplyExisting = () => {
    kimlik.dismissModal();
    if (tcResult) {
      onUseExistingStudent(tcResult, kimlik.result);
      kimlik.markHighlighted(["ad", "soyad", "telefon", "email", "dogum_tarihi", "tc_kimlik_no"]);
    }
  };

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
              className={`${kimlikFieldClass(`wizard-input ${errors.tc_kimlik_no ? "error" : ""}`, "tc_kimlik_no", kimlik.highlightedFields)}${tcReadonlyClass(tcLocked)}`}
              value={data.student.tc_kimlik_no}
              maxLength={11}
              placeholder="11 haneli TC Kimlik No"
              readOnly={tcLocked}
              onChange={(e) => {
                if (tcLocked) return;
                handleTcChange(e.target.value);
              }}
            />
            {tcChecking || kimlik.checking ? (
              <div className="tc-spinner">
                <svg className="spinner-svg" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="#0262a7" strokeWidth="3" strokeDasharray="31" strokeLinecap="round" />
                </svg>
              </div>
            ) : null}
            {tcResult?.found && renewalState.isRenewal && (
              <div className="tc-badge tc-badge-renewal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                </svg>
                Yenileme
              </div>
            )}
          </div>
          {tcLocked && (
            <span className="kimlik-tc-hint">
              TC Kimlik Numarası sistemde tekil kimlik olarak kullanıldığı için değiştirilemez.
            </span>
          )}
          {errors.tc_kimlik_no && <span className="wizard-error">{errors.tc_kimlik_no}</span>}
        </div>

        {/* Ad */}
        <div className="wizard-field">
          <label className="wizard-label required">Ad</label>
          <input
            type="text"
            className={kimlikFieldClass(`wizard-input ${errors.ad ? "error" : ""}`, "ad", kimlik.highlightedFields)}
            value={data.student.ad}
            placeholder="Öğrenci adı (birden fazla ad girilebilir)"
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
            className={kimlikFieldClass(`wizard-input ${errors.soyad ? "error" : ""}`, "soyad", kimlik.highlightedFields)}
            value={data.student.soyad}
            placeholder="Öğrenci soyadı (birden fazla soyad girilebilir)"
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
          <AppDatePicker
            value={data.student.dogum_tarihi}
            onChange={(iso) =>
              onChange({
                ...data,
                student: {
                  ...data.student,
                  dogum_tarihi: iso,
                },
              })
            }
            style={{ height: 42 }}
            status={errors.dogum_tarihi ? "error" : undefined}
            disableFuture
            className={kimlikFieldClass(
              "",
              "dogum_tarihi",
              kimlik.highlightedFields
            )}
          />
          {errors.dogum_tarihi && <span className="wizard-error">{errors.dogum_tarihi}</span>}
        </div>

        {/* Cinsiyet */}
        <div className="wizard-field">
          <label className="wizard-label required">Cinsiyet</label>
          <select
            className={`wizard-select ${errors.cinsiyet ? "error" : ""}`}
            value={data.student.cinsiyet ?? ""}
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
            className={kimlikFieldClass("wizard-input", "email", kimlik.highlightedFields)}
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
            className={kimlikFieldClass("wizard-input", "telefon", kimlik.highlightedFields)}
            value={data.student.telefon}
            placeholder="(5XX) XXX XX XX"
            onChange={(e) => {
              const formatted = formatPhone(e.target.value);
              onChange({
                ...data,
                student: { ...data.student, telefon: formatted },
              });
              kimlik.checkPhone(formatted);
            }}
            onBlur={() => kimlik.checkPhone(data.student.telefon)}
          />
          {kimlik.phoneError && <span className="kimlik-phone-error">{kimlik.phoneError}</span>}
        </div>
      </div>

      <KisiBulunduModal
        open={kimlik.showModal}
        result={modalKimlik}
        context="ogrenci"
        loading={tcChecking || kimlik.checking}
        extraContent={<OgrenciKimlikEkPanel tcResult={tcResult} />}
        onApply={handleApplyExisting}
        onCancel={kimlik.dismissModal}
      />
    </div>
  );
}
