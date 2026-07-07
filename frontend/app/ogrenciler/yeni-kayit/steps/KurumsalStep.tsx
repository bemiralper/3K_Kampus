"use client";

import { useKurum } from "@/lib/contexts/KurumContext";
import SchoolAutocomplete from "@/components/okul/SchoolAutocomplete";
import { LookupOption, MetadataResponse, WizardData } from "../types";

interface KurumsalStepProps {
  data: WizardData;
  metadata: MetadataResponse;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  onStudentNumberRefresh: (sinifSeviyesiId?: number) => void;
}

export default function KurumsalStep({ 
  data, 
  metadata, 
  errors, 
  onChange, 
  onStudentNumberRefresh 
}: KurumsalStepProps) {
  const { activeSube } = useKurum();
  const selectedSeviye = metadata.sinif_seviyeleri.find(
    (seviye) => seviye.id === data.enrollment.sinif_seviyesi
  );

  const isMezun =
    selectedSeviye?.ad?.toLowerCase().includes("mezun") ||
    selectedSeviye?.kod?.toLowerCase().includes("mezun");
  const schoolLabel = isMezun ? "Mezun Olduğu Okul" : "Geldiği Okul";

  const filteredSiniflar = (metadata.siniflar || []).filter((sinif) => {
    if (data.enrollment.egitim_yili && sinif.egitim_yili_id !== data.enrollment.egitim_yili) return false;
    if (data.enrollment.sinif_seviyesi && sinif.sinif_seviyesi_id !== data.enrollment.sinif_seviyesi) return false;
    if (selectedSeviye?.has_alan && data.enrollment.alan) {
      if (sinif.alan_id && sinif.alan_id !== data.enrollment.alan) return false;
    }
    return true;
  });

  return (
    <div className="wizard-step-content">
      <div className="step-header">
        <div className="step-icon green">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>
        <div>
          <h3>Kurumsal Bilgiler</h3>
          <p>Öğrencinin eğitim ve kayıt bilgilerini girin</p>
        </div>
      </div>

      {activeSube && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8,
          background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 13, color: "#1e40af",
        }}>
          Kayıt şubesi: <strong>{activeSube.ad}</strong> (üst bardaki seçim)
        </div>
      )}

      <div className="wizard-form-grid">
        {/* Öğrenci Numarası - Otomatik Üret */}
        <div className="wizard-field">
          <label className="wizard-label required">Öğrenci Numarası</label>
          <input
            type="text"
            className={`wizard-input ${errors.ogrenci_no ? 'error' : ''}`}
            value={data.enrollment.ogrenci_no}
            maxLength={5}
            placeholder="Otomatik oluşturulur, isterseniz düzenleyebilirsiniz"
            onChange={(e) =>
              onChange({
                ...data,
                enrollment: {
                  ...data.enrollment,
                  ogrenci_no: e.target.value.replace(/\D/g, "").slice(0, 5),
                },
              })
            }
          />
          <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
            Sınıf seviyesi seçildiğinde otomatik oluşturulur
          </small>
          {errors.ogrenci_no && <span className="wizard-error">{errors.ogrenci_no}</span>}
        </div>

        {/* Eğitim Yılı - Disabled (Aktif olan) */}
        <div className="wizard-field">
          <label className="wizard-label required">Eğitim Yılı</label>
          <select
            className="wizard-select"
            value={data.enrollment.egitim_yili ?? ""}
            disabled
            style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
          >
            <option value="">Seçiniz</option>
            {metadata.egitim_yillari.map((yil) => (
              <option key={yil.id} value={yil.id}>
                {yil.yil} {yil.aktif_mi ? '(Aktif)' : ''}
              </option>
            ))}
          </select>
          <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
            Aktif eğitim yılı otomatik seçilmiştir
          </small>
        </div>

        {/* Sınıf Seviyesi */}
        <div className="wizard-field">
          <label className="wizard-label required">Sınıf Seviyesi</label>
          <select
            className={`wizard-select ${errors.sinif_seviyesi ? 'error' : ''}`}
            value={data.enrollment.sinif_seviyesi ?? ""}
            onChange={(e) => {
              const seviyeId = Number(e.target.value) || undefined;
              onChange({
                ...data,
                enrollment: {
                  ...data.enrollment,
                  sinif_seviyesi: seviyeId,
                  alan: undefined,
                  sinif: undefined,
                },
              });
              if (seviyeId) onStudentNumberRefresh(seviyeId);
            }}
          >
            <option value="">Seçiniz</option>
            {metadata.sinif_seviyeleri.map((seviye) => (
              <option key={seviye.id} value={seviye.id}>
                {seviye.ad}
              </option>
            ))}
          </select>
          {errors.sinif_seviyesi && <span className="wizard-error">{errors.sinif_seviyesi}</span>}
        </div>

        {/* Alan (koşullu ve zorunlu) */}
        {selectedSeviye?.has_alan && (
          <div className="wizard-field">
            <label className="wizard-label required">Alan</label>
            <select
              className={`wizard-select ${errors.alan ? 'error' : ''}`}
              value={data.enrollment.alan ?? ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  enrollment: { ...data.enrollment, alan: Number(e.target.value) || undefined, sinif: undefined },
                })
              }
            >
              <option value="">Seçiniz</option>
              {metadata.alanlar.map((alan) => (
                <option key={alan.id} value={alan.id}>
                  {alan.ad}
                </option>
              ))}
            </select>
            {errors.alan && <span className="wizard-error">{errors.alan}</span>}
          </div>
        )}

        {/* Sınıf ataması (opsiyonel) */}
        <div className="wizard-field">
          <label className="wizard-label">Sınıf</label>
          <select
            className="wizard-select"
            value={data.enrollment.sinif ?? ""}
            disabled={!data.enrollment.sinif_seviyesi}
            onChange={(e) =>
              onChange({
                ...data,
                enrollment: {
                  ...data.enrollment,
                  sinif: Number(e.target.value) || undefined,
                },
              })
            }
          >
            <option value="">Seçiniz (opsiyonel — manuel atama)</option>
            {filteredSiniflar.map((sinif) => (
              <option key={sinif.id} value={sinif.id}>
                {sinif.ad}
              </option>
            ))}
          </select>
          <small style={{ color: "#666", fontSize: "12px", marginTop: "4px", display: "block" }}>
            Sınıf seviyesi ve alana göre filtrelenir. Boş bırakılırsa kayıt sınıfsız oluşturulur; sınıf daha sonra atanabilir.
          </small>
        </div>

        {/* Giriş Tarihi */}
        <div className="wizard-field">
          <label className="wizard-label required">Giriş Tarihi</label>
          <input
            type="date"
            className={`wizard-input ${errors.giris_tarihi ? 'error' : ''}`}
            value={data.enrollment.giris_tarihi}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, giris_tarihi: e.target.value },
              })
            }
          />
          {errors.giris_tarihi && <span className="wizard-error">{errors.giris_tarihi}</span>}
        </div>

        {/* Giriş Türü */}
        <div className="wizard-field">
          <label className="wizard-label required">Giriş Türü</label>
          <select
            className={`wizard-select ${errors.giris_turu ? 'error' : ''}`}
            value={data.enrollment.giris_turu ?? ""}
            onChange={(e) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, giris_turu: Number(e.target.value) || undefined },
              })
            }
          >
            <option value="">Seçiniz</option>
            {metadata.lookups.entry_type?.map((option: LookupOption) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.giris_turu && <span className="wizard-error">{errors.giris_turu}</span>}
        </div>

        {/* Okul */}
        <SchoolAutocomplete
          label={schoolLabel}
          value={data.enrollment.school_id}
          displayValue={data.enrollment.school_ad}
          placeholder="Okul adı yazarak arayın"
          onChange={(schoolId, schoolAd) =>
            onChange({
              ...data,
              enrollment: {
                ...data.enrollment,
                school_id: schoolId,
                school_ad: schoolAd,
                geldigi_okul: "",
              },
            })
          }
        />

        {/* Referans */}
        <div className="wizard-field">
          <label className="wizard-label">Referans</label>
          <input
            type="text"
            className="wizard-input"
            value={data.enrollment.referans}
            placeholder="Referans kişi veya kurum"
            onChange={(e) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, referans: e.target.value },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
