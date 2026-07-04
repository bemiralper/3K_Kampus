"use client";

import { useEffect, useState } from "react";
import { LookupOption, MetadataResponse, WizardData } from "../Wizard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/ogrenci-kayit";

type PackageOption = {
  id: number;
  ad: string;
  kod?: string;
};

export default function Step5({
  data,
  metadata,
  onChange,
}: {
  data: WizardData;
  metadata: MetadataResponse;
  onChange: (data: WizardData) => void;
}) {
  const [selectedType, setSelectedType] = useState<number | undefined>();
  const [availablePackages, setAvailablePackages] = useState<PackageOption[]>([]);

  const selectedTypeOption = metadata.lookups.package_type?.find(
    (option) => option.id === selectedType
  );

  useEffect(() => {
    if (!selectedTypeOption) {
      setAvailablePackages([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("paket_turu", selectedTypeOption.code);
    if (data.enrollment.sinif_seviyesi) {
      params.set("sinif_seviyesi_id", String(data.enrollment.sinif_seviyesi));
    }
    if (data.enrollment.alan) {
      params.set("alan_id", String(data.enrollment.alan));
    }
    fetch(`${API_BASE}/packages/?${params.toString()}`)
      .then((response) => response.json())
      .then((response) => setAvailablePackages(response.paketler || []))
      .catch(() => setAvailablePackages([]));
  }, [selectedTypeOption, data.enrollment.sinif_seviyesi, data.enrollment.alan]);

  const togglePackage = (pkg: PackageOption) => {
    const exists = data.packages.some((item) => item.paket_id === pkg.id);
    if (exists) {
      onChange({
        ...data,
        packages: data.packages.filter((item) => item.paket_id !== pkg.id),
      });
      return;
    }
    onChange({
      ...data,
      packages: [
        ...data.packages,
        {
          paket_turu: selectedType,
          paket_id: pkg.id,
          paket_adi: pkg.ad,
        },
      ],
    });
  };

  const removePackage = (paketId?: number) => {
    onChange({
      ...data,
      packages: data.packages.filter((item) => item.paket_id !== paketId),
    });
  };

  return (
    <div className="section">
      <h3>Eğitim Paketleri ve Ders Seçimi</h3>
      <div className="form-grid">
        <div className="field">
          <label>Paket Türü</label>
          <select
            value={selectedType ?? ""}
            onChange={(event) => setSelectedType(Number(event.target.value))}
          >
            <option value="">Seçiniz</option>
            {metadata.lookups.package_type?.map((option: LookupOption) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!!availablePackages.length && (
        <div className="section">
          <h3>Uygun Paketler</h3>
          <div className="list-card">
            {availablePackages.map((pkg: PackageOption) => (
              <label key={pkg.id}>
                <input
                  type="checkbox"
                  checked={data.packages.some((item) => item.paket_id === pkg.id)}
                  onChange={() => togglePackage(pkg)}
                />
                {pkg.ad} ({pkg.kod})
              </label>
            ))}
          </div>
        </div>
      )}

      {!!data.packages.length && (
        <div className="section">
          <h3>Seçilen Paketler</h3>
          <div className="list-card">
            {data.packages.map((pkg: WizardData["packages"][number]) => (
              <div key={pkg.paket_id} className="list-actions">
                <span>{pkg.paket_adi}</span>
                <button className="button ghost" onClick={() => removePackage(pkg.paket_id)}>
                  Çıkar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
