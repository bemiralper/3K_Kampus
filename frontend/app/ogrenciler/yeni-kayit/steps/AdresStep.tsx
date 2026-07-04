"use client";

import { useEffect, useState } from "react";
import { CityOption, DistrictOption, LookupOption, MetadataResponse, WizardData } from "../types";
import { formatAddress } from "../utils";

interface AdresStepProps {
  data: WizardData;
  metadata: MetadataResponse;
  districts: DistrictOption[];
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  onCityChange: (cityId: number) => void;
}

export default function AdresStep({
  data,
  metadata,
  districts,
  errors,
  onChange,
  onCityChange,
}: AdresStepProps) {
  const [manuelIlce, setManuelIlce] = useState("");

  // İlk yüklemede varsayılan il/ilçe yoksa ayarla
  useEffect(() => {
    if (!metadata.cities?.length) return;

    const defaultCity = metadata.cities.find((c) => c.is_default) || metadata.cities[0];
    if (!defaultCity || data.address.il) return;

    onChange({
      ...data,
      address: {
        ...data.address,
        il: defaultCity.id,
        ilce: undefined,
        ilce_adi: "",
      },
    });
    onCityChange(defaultCity.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata.cities]);

  // Erzurum ilçeleri yüklendiğinde varsayılan Yakutiye
  useEffect(() => {
    if (data.address.ilce || !districts.length) return;
    const yakutiye = districts.find((d) => d.ad === "Yakutiye");
    if (!yakutiye) return;

    onChange({
      ...data,
      address: {
        ...data.address,
        ilce: yakutiye.id,
        ilce_adi: "",
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts, data.address.il]);

  const handleCityChange = (cityId: number) => {
    // İl değiştiğinde ilçeyi sıfırla ve ilçeleri yükle
    onChange({
      ...data,
      address: { 
        ...data.address, 
        il: cityId, 
        ilce: undefined, 
        ilce_adi: "" 
      },
    });
    onCityChange(cityId);
  };

  return (
    <div className="wizard-step-content">
      <div className="step-header">
        <div className="step-icon blue">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div>
          <h3>Adres Bilgileri</h3>
          <p>Öğrencinin ikamet adresini girin</p>
        </div>
      </div>

      <div className="wizard-form-grid">
        {/* Adres Türü */}
        <div className="wizard-field">
          <label className="wizard-label required">Adres Türü</label>
          <select
            className={`wizard-select ${errors.adres_turu ? 'error' : ''}`}
            value={data.address.adres_turu ?? ""}
            onChange={(e) =>
              onChange({
                ...data,
                address: { ...data.address, adres_turu: Number(e.target.value) || undefined },
              })
            }
          >
            <option value="">Seçiniz</option>
            {metadata.lookups.address_type?.map((option: LookupOption) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.adres_turu && <span className="wizard-error">{errors.adres_turu}</span>}
        </div>

        {/* İl */}
        <div className="wizard-field">
          <label className="wizard-label required">İl</label>
          <select
            className={`wizard-select ${errors.il ? 'error' : ''}`}
            value={data.address.il ?? ""}
            onChange={(e) => {
              const cityId = Number(e.target.value);
              handleCityChange(cityId);
            }}
          >
            <option value="">Seçiniz</option>
            {metadata.cities?.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          {errors.il && <span className="wizard-error">{errors.il}</span>}
        </div>

        {/* İlçe */}
        <div className="wizard-field">
          <label className="wizard-label required">İlçe</label>
          {districts && districts.length > 0 ? (
            <select
              className={`wizard-select ${errors.ilce ? 'error' : ''}`}
              value={data.address.ilce ?? ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  address: { ...data.address, ilce: Number(e.target.value) || undefined },
                })
              }
            >
              <option value="">Seçiniz</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.ad}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className={`wizard-input ${errors.ilce_adi ? 'error' : ''}`}
              value={data.address.ilce_adi ?? ""}
              placeholder={data.address.il ? "İlçe adını girin" : "Önce il seçiniz"}
              disabled={!data.address.il}
              onChange={(e) =>
                onChange({
                  ...data,
                  address: { ...data.address, ilce_adi: formatAddress(e.target.value) },
                })
              }
            />
          )}
          {errors.ilce && <span className="wizard-error">{errors.ilce}</span>}
          {errors.ilce_adi && <span className="wizard-error">{errors.ilce_adi}</span>}
        </div>

        {/* Posta Kodu */}
        <div className="wizard-field">
          <label className="wizard-label">Posta Kodu</label>
          <input
            type="text"
            className="wizard-input"
            value={data.address.posta_kodu}
            maxLength={5}
            placeholder="25000"
            onChange={(e) =>
              onChange({
                ...data,
                address: { ...data.address, posta_kodu: e.target.value.replace(/\D/g, "").slice(0, 5) },
              })
            }
          />
        </div>

        {/* Açık Adres */}
        <div className="wizard-field full-width">
          <label className="wizard-label required">Açık Adres</label>
          <textarea
            className={`wizard-textarea ${errors.acik_adres ? 'error' : ''}`}
            rows={3}
            value={data.address.acik_adres}
            placeholder="Mahalle, cadde, sokak, bina no, daire no..."
            onChange={(e) =>
              onChange({
                ...data,
                address: { ...data.address, acik_adres: formatAddress(e.target.value) },
              })
            }
          />
          {errors.acik_adres && <span className="wizard-error">{errors.acik_adres}</span>}
        </div>
      </div>
    </div>
  );
}
