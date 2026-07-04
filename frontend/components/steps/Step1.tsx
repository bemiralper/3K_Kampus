import { CityOption, DistrictOption, LookupOption, MetadataResponse, WizardData } from "../Wizard";

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  let formatted = digits;
  if (digits.length >= 2) {
    formatted = `${digits.slice(0, 4)}`;
  }
  if (digits.length >= 5) {
    formatted = `${digits.slice(0, 4)} ${digits.slice(4, 7)}`;
  }
  if (digits.length >= 8) {
    formatted = `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)}`;
  }
  if (digits.length >= 10) {
    formatted = `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  return formatted;
};

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("tr") + word.slice(1).toLocaleLowerCase("tr"))
    .join(" ");

export default function Step1({
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
  const cityId = data.student.il;
  const districtOptions = cityId ? districts[cityId] || [] : [];

  return (
    <div className="section">
      <h3>Öğrenci Kimlik ve İletişim Bilgileri</h3>
      <div className="form-grid">
        <div className="field">
          <label>Kayıt Türü</label>
          <select
            value={data.student.kayit_turu ?? ""}
            onChange={(event) =>
              onChange({
                ...data,
                student: { ...data.student, kayit_turu: Number(event.target.value) },
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
          {errors.kayit_turu && <small>{errors.kayit_turu}</small>}
        </div>

        <div className="field">
          <label>T.C. Kimlik No</label>
          <input
            value={data.student.tc_kimlik_no}
            maxLength={11}
            onChange={(event) =>
              onChange({
                ...data,
                student: {
                  ...data.student,
                  tc_kimlik_no: event.target.value.replace(/\D/g, "").slice(0, 11),
                },
              })
            }
          />
          {errors.tc_kimlik_no && <small>{errors.tc_kimlik_no}</small>}
        </div>

        <div className="field">
          <label>Ad</label>
          <input
            value={data.student.ad}
            onChange={(event) =>
              onChange({
                ...data,
                student: {
                  ...data.student,
                  ad: titleCase(event.target.value.replace(/\d/g, "")),
                },
              })
            }
          />
          {errors.ad && <small>{errors.ad}</small>}
        </div>

        <div className="field">
          <label>Soyad</label>
          <input
            value={data.student.soyad}
            onChange={(event) =>
              onChange({
                ...data,
                student: {
                  ...data.student,
                  soyad: titleCase(event.target.value.replace(/\d/g, "")),
                },
              })
            }
          />
          {errors.soyad && <small>{errors.soyad}</small>}
        </div>

        <div className="field">
          <label>Doğum Tarihi</label>
          <input
            type="date"
            value={data.student.dogum_tarihi}
            onChange={(event) =>
              onChange({
                ...data,
                student: { ...data.student, dogum_tarihi: event.target.value },
              })
            }
          />
        </div>

        <div className="field">
          <label>Cinsiyet</label>
          <select
            value={data.student.cinsiyet ?? ""}
            onChange={(event) =>
              onChange({
                ...data,
                student: { ...data.student, cinsiyet: Number(event.target.value) },
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
        </div>

        <div className="field">
          <label>E-Posta</label>
          <input
            type="email"
            value={data.student.email}
            onChange={(event) =>
              onChange({
                ...data,
                student: { ...data.student, email: event.target.value },
              })
            }
          />
        </div>

        <div className="field">
          <label>Cep Telefonu</label>
          <input
            value={data.student.telefon}
            placeholder="0530 000 00 00"
            onChange={(event) =>
              onChange({
                ...data,
                student: { ...data.student, telefon: formatPhone(event.target.value) },
              })
            }
          />
          {errors.telefon && <small>{errors.telefon}</small>}
        </div>

        <div className="field">
          <label>İl</label>
          <select
            value={data.student.il ?? ""}
            onChange={(event) => {
              const cityId = Number(event.target.value);
              onChange({
                ...data,
                student: { ...data.student, il: cityId, ilce: undefined },
              });
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
          {errors.il && <small>{errors.il}</small>}
        </div>

        <div className="field">
          <label>İlçe</label>
          <select
            value={data.student.ilce ?? ""}
            onChange={(event) =>
              onChange({
                ...data,
                student: { ...data.student, ilce: Number(event.target.value) },
              })
            }
          >
            <option value="">Seçiniz</option>
            {districtOptions.map((district: DistrictOption) => (
              <option key={district.id} value={district.id}>
                {district.name}
              </option>
            ))}
          </select>
          {errors.ilce && <small>{errors.ilce}</small>}
        </div>
      </div>
    </div>
  );
}
