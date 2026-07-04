"use client";

import { DenemePaketiInfo, EkHizmetInfo, PackageInfo, WizardData } from "../types";
import { useState, useMemo, useEffect } from "react";

interface PaketStepProps {
  data: WizardData;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  packages: PackageInfo[];
  ekHizmetler: EkHizmetInfo[];
  denemePaketleri: DenemePaketiInfo[];
  loadingPackages: boolean;
  studentAlanId?: number;
}

// Paket kategorileri
const PACKAGE_CATEGORIES = [
  { id: 'grup_dersleri', label: 'Grup Dersleri', icon: '👥', color: '#3b82f6' },
  { id: 'ozel_dersler', label: 'Özel Dersler', icon: '🎓', color: '#8b5cf6' },
];

export default function PaketStep({ 
  data, 
  errors, 
  onChange, 
  packages, 
  ekHizmetler,
  denemePaketleri,
  loadingPackages,
  studentAlanId,
}: PaketStepProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      // Özel dersler genelde alansızdır — tüm öğrencilere gösterilir; alanlı paket eşleşmeli
      if (pkg.kategori === "ozel_dersler") {
        if (pkg.alan_id == null) return true;
        return studentAlanId != null && pkg.alan_id === studentAlanId;
      }
      // Grup dersleri — sıkı alan eşleşmesi
      if (pkg.alan_id == null) {
        return studentAlanId == null;
      }
      return studentAlanId != null && pkg.alan_id === studentAlanId;
    });
  }, [packages, studentAlanId]);

  // Kategoriye göre paketleri grupla
  const packagesByCategory = useMemo(() => {
    const grouped: Record<string, PackageInfo[]> = {};
    PACKAGE_CATEGORIES.forEach(cat => {
      grouped[cat.id] = filteredPackages.filter(pkg => pkg.kategori === cat.id);
    });
    return grouped;
  }, [filteredPackages]);

  // Seçili paketlerin ve deneme paketlerinin dahil_ek_hizmet_ids'lerini hesapla
  const dahilEkHizmetIds = useMemo(() => {
    const ids = new Set<number>();
    const paketler = data.package.paketler || [];
    packages
      .filter(p => paketler.includes(p.id))
      .forEach(p => {
        (p.dahil_ek_hizmet_ids || []).forEach(id => ids.add(id));
      });
    const denemeIds = data.package.deneme_paketi_ids || [];
    denemePaketleri
      .filter(d => denemeIds.includes(d.id))
      .forEach(d => {
        (d.dahil_ek_hizmet_ids || []).forEach(id => ids.add(id));
      });
    return ids;
  }, [data.package.paketler, packages, data.package.deneme_paketi_ids, denemePaketleri]);

  // Grup dersi paketine dahil deneme paketleri (alanlı öğrencilerde tüm denemeler)
  const dahilDenemePaketiIds = useMemo(() => {
    const ids = new Set<number>();
    const paketler = data.package.paketler || [];
    packages
      .filter(p => p.kategori === 'grup_dersleri' && paketler.includes(p.id))
      .forEach(p => {
        (p.dahil_deneme_paketi_ids || []).forEach(id => ids.add(id));
      });
    return ids;
  }, [data.package.paketler, packages]);

  // İsteğe bağlı ek hizmetler — pakete dahil olanlar ve deneme türü listede gösterilmez
  const secilebilirEkHizmetler = useMemo(() => {
    return ekHizmetler.filter(
      (hizmet) => hizmet.hizmet_turu !== "deneme" && !dahilEkHizmetIds.has(hizmet.id)
    );
  }, [ekHizmetler, dahilEkHizmetIds]);

  // Paket seçimi değiştiğinde, dahil olan ek hizmetleri otomatik olarak 
  // ek_hizmet_ids'den kaldır (çünkü zaten pakete dahil)
  useEffect(() => {
    const currentIds = data.package.ek_hizmet_ids || [];
    const filteredIds = currentIds.filter(id => !dahilEkHizmetIds.has(id));
    if (filteredIds.length !== currentIds.length) {
      onChange({
        ...data,
        package: {
          ...data.package,
          ek_hizmet_ids: filteredIds,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dahilEkHizmetIds]);

  useEffect(() => {
    if (dahilDenemePaketiIds.size === 0) return;
    const currentIds = data.package.deneme_paketi_ids || [];
    const merged = Array.from(new Set([...currentIds, ...dahilDenemePaketiIds]));
    if (merged.length !== currentIds.length || merged.some((id, i) => id !== currentIds[i])) {
      onChange({
        ...data,
        package: {
          ...data.package,
          deneme_paketi_ids: merged,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dahilDenemePaketiIds]);

  // Kategori toggle
  const toggleCategory = (categoryId: string) => {
    setActiveCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Çoklu seçime izin veren kategoriler
  const MULTI_SELECT_CATEGORIES = ['ozel_dersler'];

  // Paket seçimi — Özel dersler çoklu, diğerleri tekli (radio) davranışı
  const handlePackageToggle = (packageId: string, kategori: string) => {
    const currentPaketler = data.package.paketler || [];
    const isSelected = currentPaketler.includes(packageId);
    const isMultiSelect = MULTI_SELECT_CATEGORIES.includes(kategori);
    
    let newPaketler: string[];
    if (isSelected) {
      // Seçimi kaldır
      newPaketler = currentPaketler.filter(id => id !== packageId);
    } else if (isMultiSelect) {
      // Çoklu seçim: mevcut seçimleri koru, yeni paket ekle
      newPaketler = [...currentPaketler, packageId];
    } else {
      // Tekli seçim: aynı kategorideki eski seçimi kaldır, yeni seçimi ekle
      const sameCategoyIds = filteredPackages
        .filter(p => p.kategori === kategori)
        .map(p => p.id);
      newPaketler = [
        ...currentPaketler.filter(id => !sameCategoyIds.includes(id)),
        packageId,
      ];
    }
    
    onChange({
      ...data,
      package: {
        ...data.package,
        paketler: newPaketler,
      },
    });
  };

  // Tüm seçimleri temizle
  const clearAllSelections = () => {
    onChange({
      ...data,
      package: {
        ...data.package,
        paketler: [],
        ek_hizmet_ids: [],
        deneme_paketi_ids: [],
      },
    });
  };

  // Seçili paketlerin bilgileri
  const selectedPackages = useMemo(() => {
    const paketler = data.package.paketler || [];
    return filteredPackages.filter(p => paketler.includes(p.id));
  }, [data.package.paketler, filteredPackages]);

  // Arama filtresi
  const filterBySearch = (pkg: PackageInfo) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      pkg.ad.toLowerCase().includes(term) ||
      pkg.aciklama?.toLowerCase().includes(term) ||
      pkg.kod?.toLowerCase().includes(term)
    );
  };

  // Paket seçili mi kontrol et
  const isPackageSelected = (packageId: string) => {
    return (data.package.paketler || []).includes(packageId);
  };

  // Ek hizmet seçimi toggle
  const handleEkHizmetToggle = (hizmetId: number) => {
    // Pakete dahil olan ek hizmetler seçilemez
    if (dahilEkHizmetIds.has(hizmetId)) return;

    const currentIds = data.package.ek_hizmet_ids || [];
    const isSelected = currentIds.includes(hizmetId);

    let newIds: number[];
    if (isSelected) {
      newIds = currentIds.filter(id => id !== hizmetId);
    } else {
      newIds = [...currentIds, hizmetId];
    }

    onChange({
      ...data,
      package: {
        ...data.package,
        ek_hizmet_ids: newIds,
      },
    });
  };

  // Deneme paketi seçimi toggle
  const handleDenemePaketiToggle = (paketId: number) => {
    if (dahilDenemePaketiIds.has(paketId)) return;

    const currentIds = data.package.deneme_paketi_ids || [];
    const isSelected = currentIds.includes(paketId);

    let newIds: number[];
    if (isSelected) {
      newIds = currentIds.filter(id => id !== paketId);
    } else {
      newIds = [...currentIds, paketId];
    }

    onChange({
      ...data,
      package: {
        ...data.package,
        deneme_paketi_ids: newIds,
      },
    });
  };

  // Fiyat formatlama (backend tutarları TL cinsinden integer döner)
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const displayKdvDahil = (item: { kdv_dahil_fiyat?: number; fiyat: number }) =>
    item.kdv_dahil_fiyat ?? item.fiyat;

  const displayKdvHaric = (item: { net_fiyat?: number; fiyat: number }) =>
    item.net_fiyat ?? item.fiyat;

  const PriceBlock = ({
    item,
    color = '#059669',
    free = false,
  }: {
    item?: { kdv_dahil_fiyat?: number; fiyat: number; kdv_orani?: number; net_fiyat?: number };
    color?: string;
    free?: boolean;
  }) => (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{ fontWeight: 600, color, fontSize: '14px', whiteSpace: 'nowrap' }}>
        {free ? 'Ücretsiz' : formatPrice(displayKdvDahil(item!))}
      </div>
      {!free && item && (
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
          KDV Dahil
          {item.kdv_orani && item.kdv_orani > 0
            ? ` · Hariç: ${formatPrice(displayKdvHaric(item))}`
            : ''}
        </div>
      )}
    </div>
  );

  const getDahilEkHizmetlerForPackage = (pkg: PackageInfo) => {
    const ids = [...new Set(pkg.dahil_ek_hizmet_ids || [])];
    return ids
      .map((id) => ekHizmetler.find((h) => h.id === id))
      .filter((h): h is EkHizmetInfo => !!h);
  };

  const getDahilDenemelerForPackage = (pkg: PackageInfo) => {
    const ids = [...new Set(pkg.dahil_deneme_paketi_ids || [])];
    return ids
      .map((id) => denemePaketleri.find((d) => d.id === id))
      .filter((d): d is DenemePaketiInfo => !!d);
  };

  // Hizmet türü badge rengi
  const getHizmetTuruColor = (turu: string) => {
    switch (turu) {
      case 'kutuphane': return { bg: '#dbeafe', color: '#1e40af', label: '📚' };
      case 'kocluk': return { bg: '#fef3c7', color: '#92400e', label: '🎯' };
      case 'deneme': return { bg: '#d1fae5', color: '#065f46', label: '📋' };
      default: return { bg: '#f3f4f6', color: '#374151', label: '⭐' };
    }
  };

  // Kategorideki seçili paket (tekli kategoriler için)
  const getSelectedInCategory = (categoryId: string) => {
    const paketler = data.package.paketler || [];
    return filteredPackages.find(p => p.kategori === categoryId && paketler.includes(p.id));
  };

  const getSelectedListInCategory = (categoryId: string) => {
    const paketler = data.package.paketler || [];
    return filteredPackages.filter(p => p.kategori === categoryId && paketler.includes(p.id));
  };

  return (
    <div className="wizard-step-content">
      <div className="step-header">
        <div className="step-icon orange">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>
        <div>
          <h3>Eğitim Paketi Seçimi</h3>
          <p>Grup derslerinden 1, özel derslerden birden çok paket seçebilirsiniz. Ek hizmet ve deneme paketleri ayrı listelerden ücretli olarak seçilir; grup dersine dahil olanlar ücretsizdir.</p>
        </div>
      </div>

      {loadingPackages ? (
        <div className="wizard-loading">
          <div className="spinner"></div>
          <span>Paketler yükleniyor...</span>
        </div>
      ) : (
        <>
          {/* Arama */}
          <div className="wizard-search-box" style={{ marginBottom: '20px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="wizard-search-input"
              placeholder="Paket ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Kategori Accordion'ları */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {PACKAGE_CATEGORIES.map(category => {
              const categoryPackages = packagesByCategory[category.id] || [];
              const filteredPackages = categoryPackages.filter(filterBySearch);
              const isOpen = activeCategories.has(category.id);
              const hasPackages = filteredPackages.length > 0;
              const isMultiSelect = MULTI_SELECT_CATEGORIES.includes(category.id);
              const selectedInCat = getSelectedInCategory(category.id);
              const selectedListInCat = isMultiSelect ? getSelectedListInCategory(category.id) : [];

              return (
                <div 
                  key={category.id} 
                  style={{
                    border: isOpen ? `2px solid ${category.color}` : '1px solid #e5e7eb',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: '#fff',
                    boxShadow: isOpen ? '0 4px 12px rgba(0, 0, 0, 0.08)' : 'none',
                  }}
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 20px',
                      background: isOpen ? `${category.color}15` : '#f9fafb',
                      border: 'none',
                      borderBottom: isOpen ? '1px solid #e5e7eb' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '24px' }}>{category.icon}</span>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                        {category.label}
                      </span>
                      <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 400 }}>
                        ({categoryPackages.length} paket)
                      </span>
                      {/* Tekli seçim kategorileri için tek badge */}
                      {!isMultiSelect && selectedInCat && (
                        <span style={{
                          fontSize: '12px',
                          padding: '3px 10px',
                          background: '#dcfce7',
                          color: '#166534',
                          borderRadius: '20px',
                          fontWeight: 600,
                        }}>
                          ✓ {selectedInCat.ad}
                        </span>
                      )}
                      {/* Çoklu seçim kategorileri için çoklu badge */}
                      {isMultiSelect && selectedListInCat.length > 0 && (
                        <span style={{
                          fontSize: '12px',
                          padding: '3px 10px',
                          background: '#dcfce7',
                          color: '#166534',
                          borderRadius: '20px',
                          fontWeight: 600,
                        }}>
                          ✓ {selectedListInCat.length} paket seçili
                        </span>
                      )}
                    </div>
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="#6b7280" 
                      strokeWidth="2"
                      style={{ 
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Accordion Content */}
                  {isOpen && (
                    <div style={{ padding: '16px', background: '#fff' }}>
                      {/* Seçim uyarısı — kategoriye göre */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        background: isMultiSelect ? '#f5f3ff' : '#eff6ff',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: isMultiSelect ? '#6d28d9' : '#1e40af',
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        {isMultiSelect 
                          ? 'Bu kategoriden birden fazla paket seçebilirsiniz.'
                          : 'Bu kategoriden en fazla 1 paket seçebilirsiniz. Yeni seçim öncekinin yerini alır.'
                        }
                      </div>

                      {!hasPackages ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: '14px' }}>
                          {searchTerm 
                            ? `"${searchTerm}" ile eşleşen paket bulunamadı`
                            : "Bu kategoride henüz paket bulunmuyor"
                          }
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {filteredPackages.map(pkg => {
                            const isSelected = isPackageSelected(pkg.id);
                            const dahilEkCount = (pkg.dahil_ek_hizmet_ids || []).length;
                            const dahilDenemeCount = (pkg.dahil_deneme_paketi_ids || []).length;
                            const dahilCount = dahilEkCount + dahilDenemeCount;
                            return (
                              <div
                                key={`${category.id}-${pkg.id}`}
                                onClick={() => handlePackageToggle(pkg.id, category.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  padding: '14px 16px',
                                  border: isSelected ? `2px solid ${category.color}` : '2px solid #e5e7eb',
                                  borderRadius: '10px',
                                  cursor: 'pointer',
                                  background: isSelected ? `${category.color}10` : '#fff',
                                }}
                              >
                                {/* Seçim ikonu: çoklu kategorilerde checkbox, tekli kategorilerde radio */}
                                <div style={{ flexShrink: 0, color: isSelected ? category.color : '#d1d5db' }}>
                                  {isMultiSelect ? (
                                    // Checkbox görünümü
                                    isSelected ? (
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                      </svg>
                                    ) : (
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                      </svg>
                                    )
                                  ) : (
                                    // Radio button görünümü
                                    isSelected ? (
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                                        <circle cx="12" cy="12" r="6" fill="currentColor" />
                                      </svg>
                                    ) : (
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                                      </svg>
                                    )
                                  )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '15px' }}>
                                      {pkg.ad}
                                    </span>
                                    {dahilCount > 0 && (
                                      <span style={{
                                        fontSize: '11px',
                                        padding: '2px 8px',
                                        background: '#dbeafe',
                                        color: '#1e40af',
                                        borderRadius: '6px',
                                        fontWeight: 500,
                                      }}>
                                        📦 {dahilEkCount > 0 && `${dahilEkCount} ek hizmet`}
                                        {dahilEkCount > 0 && dahilDenemeCount > 0 && ', '}
                                        {dahilDenemeCount > 0 && `${dahilDenemeCount} deneme`}
                                        {' '}dahil
                                      </span>
                                    )}
                                  </div>
                                  {pkg.aciklama && (
                                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                                      {pkg.aciklama}
                                    </div>
                                  )}
                                </div>
                                <PriceBlock item={pkg} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Seçili Paketler Özeti */}
          {selectedPackages.length > 0 && (
            <div style={{
              marginTop: '24px',
              border: '2px solid #22c55e',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#f0fdf4',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                background: '#22c55e',
                color: 'white',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '15px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>Seçili Paketler ({selectedPackages.length})</span>
                </div>
                <button
                  type="button"
                  onClick={clearAllSelections}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    color: 'white',
                    background: 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Tümünü Temizle
                </button>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedPackages.map(pkg => {
                  const category = PACKAGE_CATEGORIES.find(c => c.id === pkg.kategori);
                  const dahilHizmetler = getDahilEkHizmetlerForPackage(pkg);
                  const dahilDenemeler = getDahilDenemelerForPackage(pkg);
                  return (
                    <div
                      key={pkg.id}
                      style={{
                        padding: '12px 16px',
                        background: 'white',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1f2937', fontSize: '14px' }}>
                            {pkg.ad}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            {category?.icon} {category?.label || pkg.kategori} • {formatPrice(displayKdvDahil(pkg))} (KDV Dahil)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePackageToggle(pkg.id, pkg.kategori || '');
                          }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            color: '#dc2626',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          Kaldır
                        </button>
                      </div>
                      {/* Dahil ek hizmetler listesi */}
                      {dahilHizmetler.length > 0 && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', fontWeight: 600 }}>
                            📦 Dahil Ek Hizmetler:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {dahilHizmetler.map(h => (
                              <span key={`eh-${pkg.id}-${h.id}`} style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                background: '#ecfdf5',
                                color: '#065f46',
                                borderRadius: '4px',
                                border: '1px solid #a7f3d0',
                              }}>
                                ✓ {h.ad}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Dahil deneme paketleri */}
                      {dahilDenemeler.length > 0 && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', fontWeight: 600 }}>
                            📝 Dahil Deneme Paketleri:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {dahilDenemeler.map(d => (
                              <span key={`dn-${pkg.id}-${d.id}`} style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                background: '#f5f3ff',
                                color: '#6d28d9',
                                borderRadius: '4px',
                                border: '1px solid #ddd6fe',
                              }}>
                                ✓ {d.ad}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ek Hizmetler Bölümü — yalnızca isteğe bağlı hizmetler */}
          {secilebilirEkHizmetler.length > 0 && (
            <div style={{
              marginTop: '24px',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#fff',
            }}>
              <div style={{
                padding: '16px 20px',
                background: '#fffbeb',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <span style={{ fontSize: '24px' }}>⭐</span>
                <div>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                    Ek Hizmetler
                  </span>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0 0' }}>
                    İsteğe bağlı ek hizmetleri seçin. Grup dersine dahil olanlar otomatik eklenir; ayrıca seçilenler ücretlidir.
                  </p>
                </div>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {secilebilirEkHizmetler.map(hizmet => {
                  const isSelected = (data.package.ek_hizmet_ids || []).includes(hizmet.id);
                  const turuInfo = getHizmetTuruColor(hizmet.hizmet_turu);

                  return (
                    <div
                      key={hizmet.id}
                      onClick={() => handleEkHizmetToggle(hizmet.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 16px',
                        border: isSelected ? '2px solid #f59e0b' : '2px solid #e5e7eb',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isSelected ? '#fffbeb' : '#fff',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ flexShrink: 0, color: isSelected ? '#f59e0b' : '#d1d5db' }}>
                        {isSelected ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '15px' }}>
                            {hizmet.ad}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            background: turuInfo.bg,
                            color: turuInfo.color,
                            borderRadius: '6px',
                            fontWeight: 500,
                          }}>
                            {turuInfo.label} {hizmet.hizmet_turu_display}
                          </span>
                        </div>
                        {hizmet.aciklama && (
                          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                            {hizmet.aciklama}
                          </div>
                        )}
                      </div>
                      <PriceBlock item={hizmet} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deneme Paketleri */}
          {denemePaketleri.length > 0 && (
            <div style={{
              marginTop: '24px',
              border: '1px solid #ddd6fe',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#fff',
            }}>
              <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #faf5ff, #f5f3ff)',
                borderBottom: '1px solid #ddd6fe',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <span style={{ fontSize: '24px' }}>📝</span>
                <div>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                    Deneme Paketleri
                  </span>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0 0' }}>
                    Sınıf seviyesine uygun deneme paketlerini seçin. Fiyat otomatik yansır.
                  </p>
                </div>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {denemePaketleri.map(paket => {
                  const isDahil = dahilDenemePaketiIds.has(paket.id);
                  const isSelected = (data.package.deneme_paketi_ids || []).includes(paket.id);

                  return (
                    <div
                      key={paket.id}
                      onClick={() => !isDahil && handleDenemePaketiToggle(paket.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 16px',
                        border: isDahil
                          ? '2px solid #a7f3d0'
                          : isSelected
                            ? '2px solid #7c3aed'
                            : '2px solid #e5e7eb',
                        borderRadius: '10px',
                        cursor: isDahil ? 'default' : 'pointer',
                        background: isDahil ? '#ecfdf5' : isSelected ? '#faf5ff' : '#fff',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ flexShrink: 0, color: isDahil ? '#22c55e' : isSelected ? '#7c3aed' : '#d1d5db' }}>
                        {isDahil || isSelected ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill={isDahil ? 'none' : 'currentColor'} stroke={isDahil ? 'currentColor' : undefined} strokeWidth={isDahil ? '2.5' : undefined}>
                            {isDahil ? (
                              <>
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                              </>
                            ) : (
                              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            )}
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '15px' }}>
                            {paket.ad}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            background: '#ede9fe',
                            color: '#7c3aed',
                            borderRadius: '6px',
                            fontWeight: 600,
                          }}>
                            {paket.deneme_sayisi} Deneme
                          </span>
                          {isDahil && (
                            <span style={{
                              fontSize: '11px',
                              padding: '3px 10px',
                              background: '#22c55e',
                              color: 'white',
                              borderRadius: '20px',
                              fontWeight: 600,
                            }}>
                              ✓ Pakete Dahil
                            </span>
                          )}
                        </div>
                        {paket.sinif_seviyeleri.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {paket.sinif_seviyeleri.map(s => (
                              <span key={s.id} style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                background: '#e0e7ff',
                                color: '#4338ca',
                                borderRadius: '8px',
                              }}>
                                {s.ad}
                              </span>
                            ))}
                          </div>
                        )}
                        {paket.aciklama && (
                          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                            {paket.aciklama}
                          </div>
                        )}
                      </div>
                      <PriceBlock
                        item={paket}
                        color={isDahil ? '#22c55e' : '#7c3aed'}
                        free={isDahil}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hata Mesajı */}
          {errors.paket && (
            <div className="wizard-error-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {errors.paket}
            </div>
          )}
        </>
      )}
    </div>
  );
}
