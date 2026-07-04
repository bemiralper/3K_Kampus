import { LookupOption, MetadataResponse, WizardData } from "../Wizard";

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

export default function Step4({
  data,
  metadata,
  errors,
  onChange,
}: {
  data: WizardData;
  metadata: MetadataResponse;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
}) {
  const updateGuardian = (index: number, updates: Partial<WizardData["guardians"][number]>) => {
    const guardians = [...data.guardians];
    guardians[index] = { ...guardians[index], ...updates };
    onChange({ ...data, guardians });
  };

  const addGuardian = () => {
    onChange({
      ...data,
      guardians: [
        ...data.guardians,
        {
          tc_kimlik_no: "",
          ad: "",
          soyad: "",
          email: "",
          telefon: "",
          sms_bildirimleri: [],
          egitim_seviyesi: "",
          meslek: "",
          calistigi_kurum: "",
        },
      ],
    });
  };

  const removeGuardian = (index: number) => {
    const guardians = data.guardians.filter((_value: WizardData["guardians"][number], i: number) => i !== index);
    onChange({ ...data, guardians });
  };

  const toggleSms = (index: number, optionId: number) => {
    const current = data.guardians[index].sms_bildirimleri;
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    updateGuardian(index, { sms_bildirimleri: next });
  };

  return (
    <div className="section">
      <h3>Veli Bilgileri</h3>
      <label className="field">
        <span>Öğrenci kendi velisi</span>
        <input
          type="checkbox"
          checked={data.student.ogrenci_kendi_velisi}
          onChange={(event) =>
            onChange({
              ...data,
              student: { ...data.student, ogrenci_kendi_velisi: event.target.checked },
            })
          }
        />
      </label>

      {errors.guardians && <small>{errors.guardians}</small>}

      {data.guardians.map((guardian: WizardData["guardians"][number], index: number) => (
        <div key={index} className="list-card">
          <div className="form-grid">
            <div className="field">
              <label>Veli Türü</label>
              <select
                value={guardian.veli_turu ?? ""}
                onChange={(event) =>
                  updateGuardian(index, { veli_turu: Number(event.target.value) })
                }
              >
                <option value="">Seçiniz</option>
                {metadata.lookups.guardian_type?.map((option: LookupOption) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>T.C. Kimlik No</label>
              <input
                value={guardian.tc_kimlik_no}
                maxLength={11}
                onChange={(event) =>
                  updateGuardian(index, {
                    tc_kimlik_no: event.target.value.replace(/\D/g, "").slice(0, 11),
                  })
                }
              />
            </div>

            <div className="field">
              <label>Ad</label>
              <input
                value={guardian.ad}
                onChange={(event) =>
                  updateGuardian(index, { ad: titleCase(event.target.value.replace(/\d/g, "")) })
                }
              />
            </div>

            <div className="field">
              <label>Soyad</label>
              <input
                value={guardian.soyad}
                onChange={(event) =>
                  updateGuardian(index, { soyad: titleCase(event.target.value.replace(/\d/g, "")) })
                }
              />
            </div>

            <div className="field">
              <label>E-Posta</label>
              <input
                value={guardian.email}
                onChange={(event) => updateGuardian(index, { email: event.target.value })}
              />
            </div>

            <div className="field">
              <label>Cep Telefonu</label>
              <input
                value={guardian.telefon}
                onChange={(event) =>
                  updateGuardian(index, { telefon: formatPhone(event.target.value) })
                }
              />
            </div>

            <div className="field">
              <label>Eğitim Seviyesi</label>
              <input
                value={guardian.egitim_seviyesi}
                onChange={(event) =>
                  updateGuardian(index, { egitim_seviyesi: event.target.value })
                }
              />
            </div>

            <div className="field">
              <label>Meslek</label>
              <input
                value={guardian.meslek}
                onChange={(event) => updateGuardian(index, { meslek: event.target.value })}
              />
            </div>

            <div className="field">
              <label>Çalıştığı Kurum</label>
              <input
                value={guardian.calistigi_kurum}
                onChange={(event) =>
                  updateGuardian(index, { calistigi_kurum: event.target.value })
                }
              />
            </div>
          </div>

          <div className="field">
            <label>SMS Bildirimleri</label>
            <div className="inline-actions">
              {metadata.lookups.sms_notification?.map((option: LookupOption) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={guardian.sms_bildirimleri.includes(option.id)}
                    onChange={() => toggleSms(index, option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div className="list-actions">
            <button className="button ghost" type="button" onClick={() => removeGuardian(index)}>
              Veli Sil
            </button>
          </div>
        </div>
      ))}

      <div className="inline-actions">
        <button className="button secondary" type="button" onClick={addGuardian}>
          Veli Ekle
        </button>
      </div>
    </div>
  );
}
