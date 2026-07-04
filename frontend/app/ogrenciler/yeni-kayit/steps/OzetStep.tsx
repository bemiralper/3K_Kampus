"use client";

import { useKurum } from "@/lib/contexts/KurumContext";
import { CityOption, DenemePaketiInfo, DistrictOption, EkHizmetInfo, LookupOption, MetadataResponse, PackageInfo, WizardData } from "../types";
import { formatDate, calculateAge, validateTcKimlik } from "../utils";

interface OzetStepProps {
  data: WizardData;
  metadata: MetadataResponse;
  districts: DistrictOption[];
  packages: PackageInfo[];
  ekHizmetler: EkHizmetInfo[];
  denemePaketleri: DenemePaketiInfo[];
}

export default function OzetStep({ data, metadata, districts, packages, ekHizmetler, denemePaketleri }: OzetStepProps) {
  const { activeSube } = useKurum();
  const getLookupLabel = (category: string, id?: number) => {
    if (!id) return "-";
    const item = metadata.lookups[category]?.find((opt: LookupOption) => opt.id === id);
    return item?.label || "-";
  };

  const getCityName = (id?: number) => {
    if (!id) return "-";
    const city = metadata.cities?.find((c) => c.id === id);
    return city?.name || "-";
  };

  const getDistrictName = (ilId?: number, ilceId?: number, ilceAdi?: string) => {
    // Manuel girilen ilçe adı varsa
    if (ilceAdi) {
      return ilceAdi;
    }
    if (!ilceId) return "-";
    const district = districts.find((d) => d.id === ilceId);
    return district?.ad || ilceId.toString();
  };

  const getSinifSeviyesiName = (id?: number) => {
    if (!id) return "-";
    const seviye = metadata.sinif_seviyeleri.find((s) => s.id === id);
    return seviye?.ad || "-";
  };

  const getAlanName = (id?: number) => {
    if (!id) return "-";
    const alan = metadata.alanlar.find((a) => a.id === id);
    return alan?.ad || "-";
  };

  const getSubeName = (id?: number) => {
    if (!id) return "-";
    const sube = metadata.subeler.find((s) => s.id === id);
    return sube?.ad || "-";
  };

  const getEgitimYiliName = (id?: number) => {
    if (!id) return "-";
    const yil = metadata.egitim_yillari.find((y) => y.id === id);
    return yil?.yil || "-";
  };

  const getPackageName = (id?: string) => {
    if (!id) return "-";
    const pkg = packages.find((p) => p.id === id);
    return pkg?.ad || "-";
  };

  const formatPrice = (price?: number) => {
    if (price == null) return "-";
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(price);
  };

  const formatEkHizmetPrice = (h: EkHizmetInfo) =>
    formatPrice(h.kdv_dahil_fiyat || h.fiyat);

  // Çoklu paket seçimi için seçili paketleri al
  const selectedPackages = packages.filter((p) => (data.package.paketler || []).includes(p.id));

  const dahilDenemePaketiIds = new Set<number>();
  selectedPackages.forEach((pkg) => {
    (pkg.dahil_deneme_paketi_ids || []).forEach((id) => dahilDenemePaketiIds.add(id));
  });

  // Seçili ek hizmetler (ücretli — grup dersine dahil olanlar ayrı gösterilir)
  const selectedEkHizmetler = ekHizmetler.filter((h) =>
    (data.package.ek_hizmet_ids || []).includes(h.id) && h.hizmet_turu !== "deneme"
  );

  const selectedDenemePaketleri = denemePaketleri.filter((p) =>
    (data.package.deneme_paketi_ids || []).includes(p.id)
  );

  const showAlan = Boolean(
    metadata.sinif_seviyeleri.find((s) => s.id === data.enrollment.sinif_seviyesi)?.has_alan
  );

  return (
    <div className="wizard-step-content">
      <div className="step-header">
        <div className="step-icon teal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div>
          <h3>Kayıt Özeti</h3>
          <p>Girilen bilgileri kontrol edin ve kayıt işlemini tamamlayın</p>
        </div>
      </div>

      <div className="summary-sections">
        {/* Kimlik Bilgileri */}
        <div className="summary-section">
          <h4>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Kimlik Bilgileri
          </h4>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="label">Kayıt Türü</span>
              <span className="value">{getLookupLabel("registration_type", data.student.kayit_turu)}</span>
            </div>
            <div className="summary-item">
              <span className="label">TC Kimlik No</span>
              <span className="value">{data.student.tc_kimlik_no || "-"}</span>
            </div>
            <div className="summary-item">
              <span className="label">Ad Soyad</span>
              <span className="value">{`${data.student.ad} ${data.student.soyad}`.trim() || "-"}</span>
            </div>
            <div className="summary-item">
              <span className="label">Doğum Tarihi</span>
              <span className="value">
                {data.student.dogum_tarihi ? 
                  `${formatDate(data.student.dogum_tarihi)} (${calculateAge(data.student.dogum_tarihi)} yaş)` : "-"}
              </span>
            </div>
            <div className="summary-item">
              <span className="label">Cinsiyet</span>
              <span className="value">{getLookupLabel("gender", data.student.cinsiyet)}</span>
            </div>
            <div className="summary-item">
              <span className="label">E-posta</span>
              <span className="value">{data.student.email || "-"}</span>
            </div>
            <div className="summary-item">
              <span className="label">Telefon</span>
              <span className="value">{data.student.telefon || "-"}</span>
            </div>
          </div>
        </div>

        {/* Kurumsal Bilgiler */}
        <div className="summary-section">
          <h4>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            Kurumsal Bilgiler
          </h4>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="label">Öğrenci No</span>
              <span className="value">{data.enrollment.ogrenci_no || "-"}</span>
            </div>
            <div className="summary-item">
              <span className="label">Eğitim Yılı</span>
              <span className="value">{getEgitimYiliName(data.enrollment.egitim_yili)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Sınıf Seviyesi</span>
              <span className="value">{getSinifSeviyesiName(data.enrollment.sinif_seviyesi)}</span>
            </div>
            {showAlan && (
              <div className="summary-item">
                <span className="label">Alan</span>
                <span className="value">{getAlanName(data.enrollment.alan)}</span>
              </div>
            )}
            <div className="summary-item">
              <span className="label">Kayıt Şubesi</span>
              <span className="value">{activeSube?.ad || "-"}</span>
            </div>
            <div className="summary-item">
              <span className="label">Sınıf</span>
              <span className="value">
                {data.enrollment.sinif
                  ? (metadata.siniflar?.find((s) => s.id === data.enrollment.sinif)?.ad || "Seçildi")
                  : "Atanmadı"}
              </span>
            </div>
            <div className="summary-item">
              <span className="label">Giriş Tarihi</span>
              <span className="value">{data.enrollment.giris_tarihi ? formatDate(data.enrollment.giris_tarihi) : "-"}</span>
            </div>
            <div className="summary-item">
              <span className="label">Giriş Türü</span>
              <span className="value">{getLookupLabel("entry_type", data.enrollment.giris_turu)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Geldiği Okul</span>
              <span className="value">{data.enrollment.geldigi_okul || "-"}</span>
            </div>
            <div className="summary-item">
              <span className="label">Referans</span>
              <span className="value">{data.enrollment.referans || "-"}</span>
            </div>
          </div>
        </div>

        {/* Adres Bilgileri */}
        <div className="summary-section">
          <h4>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Adres Bilgileri
          </h4>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="label">Adres Türü</span>
              <span className="value">{getLookupLabel("address_type", data.address.adres_turu)}</span>
            </div>
            <div className="summary-item">
              <span className="label">İl / İlçe</span>
              <span className="value">{getCityName(data.address.il)} / {getDistrictName(data.address.il, data.address.ilce, data.address.ilce_adi)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Posta Kodu</span>
              <span className="value">{data.address.posta_kodu || "-"}</span>
            </div>
            <div className="summary-item full-width">
              <span className="label">Açık Adres</span>
              <span className="value">{data.address.acik_adres || "-"}</span>
            </div>
          </div>
        </div>

        {/* Veli Bilgileri */}
        <div className="summary-section">
          <h4>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Veli Bilgileri
          </h4>
          
          {/* Öğrenci kendi velisi */}
          {data.veliSecimi === 'self' && (
            <div className="self-guardian-info">
              <div className="info-badge success">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Öğrenci Kendi Velisi
              </div>
              <p className="self-guardian-text">
                <strong>{data.student.ad} {data.student.soyad}</strong> 18 yaş üstü olduğu için kendi velisi olarak kaydedilecektir.
              </p>
            </div>
          )}
          
          {/* Veli eklendi */}
          {data.veliSecimi === 'add' && data.guardians.length > 0 && (
            <>
              <span className="guardian-count">{data.guardians.length} veli</span>
              {data.guardians.map((guardian, index) => (
                <div key={index} className="guardian-summary">
                  <h5>{index + 1}. Veli - {getLookupLabel('guardian_type', guardian.yakinlik_turu)}</h5>
                  <div className="summary-grid">
                    <div className="summary-item">
                      <span className="label">TC Kimlik No</span>
                      <span className="value">{guardian.tc_kimlik_no || "-"}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Ad Soyad</span>
                      <span className="value">{`${guardian.ad} ${guardian.soyad}`.trim() || "-"}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Telefon</span>
                      <span className="value">{guardian.telefon || "-"}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">E-posta</span>
                      <span className="value">{guardian.email || "-"}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Meslek</span>
                      <span className="value">{guardian.meslek || "-"}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Bildirimler</span>
                      <span className="value">
                        {[
                          guardian.is_sms_enabled && "SMS",
                          guardian.is_email_enabled && "E-posta",
                        ].filter(Boolean).join(", ") || "Kapalı"}
                      </span>
                    </div>
                    {/* Veli Adresi */}
                    <div className="summary-item full-width">
                      <span className="label">Adres</span>
                      <span className="value">
                        {guardian.adres_ayni_mi ? (
                          <span className="same-address-badge">Öğrenci adresi ile aynı</span>
                        ) : guardian.adres ? (
                          <>
                            {getCityName(guardian.adres.il)} / {getDistrictName(guardian.adres.il, guardian.adres.ilce, guardian.adres.ilce_adi)}
                            {guardian.adres.acik_adres && ` - ${guardian.adres.acik_adres}`}
                          </>
                        ) : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          
          {/* Veli seçimi yapılmamış */}
          {data.veliSecimi === null && (
            <div className="no-guardian-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Veli bilgisi girilmemiş
            </div>
          )}
        </div>

        {/* Paket Bilgileri */}
        <div className="summary-section">
          <h4>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            Eğitim Paketi
          </h4>
          <div className="summary-grid">
            <div className="summary-item full-width">
              <span className="label">Seçili Paketler ({selectedPackages.length})</span>
              <div className="value">
                {selectedPackages.length === 0 ? (
                  <span style={{ color: '#6b7280' }}>Paket seçilmedi</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedPackages.map(pkg => (
                      <div key={pkg.id} style={{ 
                        padding: '10px 14px', 
                        background: '#f0fdf4', 
                        border: '1px solid #22c55e',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span style={{ fontWeight: 500 }}>{pkg.ad}</span>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>{formatPrice(pkg.kdv_dahil_fiyat || pkg.fiyat)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {selectedPackages.length > 0 && (
              <div className="summary-item">
                <span className="label">Paket Tutarı</span>
                <span className="value price">{formatPrice(selectedPackages.reduce((sum, p) => sum + (p.kdv_dahil_fiyat || p.fiyat || 0), 0))}</span>
              </div>
            )}
          </div>
        </div>

        {/* Ek Hizmetler */}
        {selectedEkHizmetler.length > 0 && (
          <div className="summary-section">
            <h4>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Ek Hizmetler ({selectedEkHizmetler.length})
            </h4>
            <div className="summary-grid">
              <div className="summary-item full-width">
                <div className="value">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedEkHizmetler.map(h => (
                      <div key={h.id} style={{ 
                        padding: '10px 14px', 
                        background: '#fffbeb', 
                        border: '1px solid #f59e0b',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <span style={{ fontWeight: 500 }}>{h.ad}</span>
                          <span style={{ fontSize: '12px', color: '#92400e', marginLeft: '8px' }}>
                            {h.hizmet_turu_display}
                          </span>
                        </div>
                        <span style={{ color: '#d97706', fontWeight: 600 }}>{formatEkHizmetPrice(h)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="summary-item">
                <span className="label">Ek Hizmet Tutarı</span>
                <span className="value price">
                  {formatPrice(selectedEkHizmetler.reduce((sum, h) => sum + (h.kdv_dahil_fiyat || h.fiyat || 0), 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Deneme Paketleri */}
        {selectedDenemePaketleri.length > 0 && (
          <div className="summary-section">
            <h4>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Deneme Paketleri ({selectedDenemePaketleri.length})
            </h4>
            <div className="summary-grid">
              <div className="summary-item full-width">
                <div className="value">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedDenemePaketleri.map(p => (
                      <div key={p.id} style={{ 
                        padding: '10px 14px', 
                        background: dahilDenemePaketiIds.has(p.id) ? '#ecfdf5' : '#faf5ff', 
                        border: dahilDenemePaketiIds.has(p.id) ? '1px solid #a7f3d0' : '1px solid #ddd6fe',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <span style={{ fontWeight: 500 }}>{p.ad}</span>
                          <span style={{ fontSize: '12px', color: '#7c3aed', marginLeft: '8px' }}>
                            {p.deneme_sayisi} Deneme
                          </span>
                          {dahilDenemePaketiIds.has(p.id) && (
                            <span style={{ fontSize: '12px', color: '#166534', marginLeft: '8px' }}>
                              (Grup dersine dahil)
                            </span>
                          )}
                        </div>
                        <span style={{ color: dahilDenemePaketiIds.has(p.id) ? '#16a34a' : '#7c3aed', fontWeight: 600 }}>
                          {dahilDenemePaketiIds.has(p.id) ? 'Ücretsiz' : formatPrice(p.kdv_dahil_fiyat)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="summary-item">
                <span className="label">Deneme Paketi Tutarı</span>
                <span className="value price">
                  {formatPrice(
                    selectedDenemePaketleri
                      .filter((p) => !dahilDenemePaketiIds.has(p.id))
                      .reduce((sum, p) => sum + (p.kdv_dahil_fiyat || p.fiyat || 0), 0)
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Genel Toplam */}
        {(selectedPackages.length > 0 || selectedEkHizmetler.length > 0 || selectedDenemePaketleri.length > 0) && (
          <div className="summary-section">
            <div className="summary-grid">
              <div className="summary-item">
                <span className="label" style={{ fontSize: '16px', fontWeight: 700 }}>Genel Toplam</span>
                <span className="value price" style={{ fontSize: '18px' }}>
                  {formatPrice(
                    selectedPackages.reduce((sum, p) => sum + (p.kdv_dahil_fiyat || p.fiyat || 0), 0) +
                    selectedEkHizmetler.reduce((sum, h) => sum + (h.kdv_dahil_fiyat || h.fiyat || 0), 0) +
                    selectedDenemePaketleri
                      .filter((p) => !dahilDenemePaketiIds.has(p.id))
                      .reduce((sum, p) => sum + (p.kdv_dahil_fiyat || p.fiyat || 0), 0)
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
