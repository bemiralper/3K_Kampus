import { CityOption, DistrictOption, LookupOption, MetadataResponse, WizardData } from "../Wizard";

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("tr") + word.slice(1).toLocaleLowerCase("tr"))
    .join(" ");

export default function Step3({
  data,
  metadata,
  districts,
  errors,
  onChange,
  onCityChange,
}: {
  data: WizardData;
  metadata: MetadataResponse;
  districts: Record<number, DistrictOption[]>;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  onCityChange: (cityId: number) => void;
}) {
  const updateAddress = (index: number, updates: Partial<WizardData["addresses"][number]>) => {
    const newAddresses = [...data.addresses];
    newAddresses[index] = { ...newAddresses[index], ...updates };
    onChange({ ...data, addresses: newAddresses });
  };

  return (
    <div className="section">
      <h3>Adres Bilgileri</h3>
      {data.addresses.map((address: WizardData["addresses"][number], index: number) => {
        const districtOptions = address.il ? districts[address.il] || [] : [];
        return (
          <div key={index} className="list-card">
            <div className="form-grid">
              <div className="field">
                <label>Adres Türü</label>
                <select
                  value={address.adres_turu ?? ""}
                  onChange={(event) =>
                    updateAddress(index, { adres_turu: Number(event.target.value) })
                  }
                >
                  <option value="">Seçiniz</option>
                  {metadata.lookups.address_type?.map((option: LookupOption) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {index === 0 && errors.adres_turu && <small>{errors.adres_turu}</small>}
              </div>

              <div className="field">
                <label>İl</label>
                <select
                  value={address.il ?? ""}
                  onChange={(event) => {
                    const cityId = Number(event.target.value);
                    updateAddress(index, { il: cityId, ilce: undefined });
                    onCityChange(cityId);
                  }}
                >
                  <option value="">Seçiniz</option>
                  {metadata.cities.map((city: CityOption) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
                {index === 0 && errors.adres_il && <small>{errors.adres_il}</small>}
              </div>

              <div className="field">
                <label>İlçe</label>
                <select
                  value={address.ilce ?? ""}
                  onChange={(event) =>
                    updateAddress(index, { ilce: Number(event.target.value) })
                  }
                >
                  <option value="">Seçiniz</option>
                  {districtOptions.map((district: DistrictOption) => (
                    <option key={district.id} value={district.id}>
                      {district.name}
                    </option>
                  ))}
                </select>
                {index === 0 && errors.adres_ilce && <small>{errors.adres_ilce}</small>}
              </div>

              <div className="field">
                <label>Posta Kodu</label>
                <input
                  value={address.posta_kodu}
                  onChange={(event) => updateAddress(index, { posta_kodu: event.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>Açık Adres</label>
              <textarea
                value={address.adres}
                onChange={(event) => updateAddress(index, { adres: event.target.value })}
                onBlur={(event) => updateAddress(index, { adres: titleCase(event.target.value) })}
              />
              {index === 0 && errors.adres && <small>{errors.adres}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
