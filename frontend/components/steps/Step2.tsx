import { LookupOption, MetadataResponse, WizardData } from "../Wizard";

export default function Step2({
  data,
  metadata,
  errors,
  onChange,
  onStudentNumberRefresh,
}: {
  data: WizardData;
  metadata: MetadataResponse;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  onStudentNumberRefresh: (sinifSeviyesiId?: number) => void;
}) {
  const selectedSeviye = metadata.sinif_seviyeleri.find(
    (seviye: MetadataResponse["sinif_seviyeleri"][number]) =>
      seviye.id === data.enrollment.sinif_seviyesi
  );

  return (
    <div className="section">
      <h3>Kurumsal Kayıt Bilgileri</h3>
      <div className="form-grid">
        <div className="field">
          <label>Öğrenci Numarası</label>
          <input
            value={data.enrollment.ogrenci_no}
            maxLength={5}
            onChange={(event) =>
              onChange({
                ...data,
                enrollment: {
                  ...data.enrollment,
                  ogrenci_no: event.target.value.replace(/\D/g, "").slice(0, 5),
                },
              })
            }
          />
          <div className="inline-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => onStudentNumberRefresh(data.enrollment.sinif_seviyesi)}
            >
              Otomatik Üret
            </button>
          </div>
          {errors.ogrenci_no && <small>{errors.ogrenci_no}</small>}
        </div>

        <div className="field">
          <label>Eğitim Yılı</label>
          <select
            value={data.enrollment.egitim_yili ?? ""}
            onChange={(event) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, egitim_yili: Number(event.target.value) },
              })
            }
          >
            <option value="">Seçiniz</option>
            {metadata.egitim_yillari.map((yil: MetadataResponse["egitim_yillari"][number]) => (
              <option key={yil.id} value={yil.id}>
                {yil.yil}
              </option>
            ))}
          </select>
          {errors.egitim_yili && <small>{errors.egitim_yili}</small>}
        </div>

        <div className="field">
          <label>Sınıf Seviyesi</label>
          <select
            value={data.enrollment.sinif_seviyesi ?? ""}
            onChange={(event) => {
              const seviyeId = Number(event.target.value);
              onChange({
                ...data,
                enrollment: {
                  ...data.enrollment,
                  sinif_seviyesi: seviyeId,
                  alan: undefined,
                },
              });
              onStudentNumberRefresh(seviyeId);
            }}
          >
            <option value="">Seçiniz</option>
            {metadata.sinif_seviyeleri.map((seviye: MetadataResponse["sinif_seviyeleri"][number]) => (
              <option key={seviye.id} value={seviye.id}>
                {seviye.ad}
              </option>
            ))}
          </select>
          {errors.sinif_seviyesi && <small>{errors.sinif_seviyesi}</small>}
        </div>

        {selectedSeviye?.has_alan && (
          <div className="field">
            <label>Alan</label>
            <select
              value={data.enrollment.alan ?? ""}
              onChange={(event) =>
                onChange({
                  ...data,
                  enrollment: { ...data.enrollment, alan: Number(event.target.value) },
                })
              }
            >
              <option value="">Seçiniz</option>
              {metadata.alanlar.map((alan: MetadataResponse["alanlar"][number]) => (
                <option key={alan.id} value={alan.id}>
                  {alan.ad}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>Şube (Opsiyonel)</label>
          <select
            value={data.enrollment.sube ?? ""}
            onChange={(event) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, sube: Number(event.target.value) },
              })
            }
          >
            <option value="">Seçiniz</option>
            {metadata.subeler.map((sube: MetadataResponse["subeler"][number]) => (
              <option key={sube.id} value={sube.id}>
                {sube.ad}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Giriş Tarihi</label>
          <input
            type="date"
            value={data.enrollment.giris_tarihi}
            onChange={(event) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, giris_tarihi: event.target.value },
              })
            }
          />
          {errors.giris_tarihi && <small>{errors.giris_tarihi}</small>}
        </div>

        <div className="field">
          <label>Giriş Türü</label>
          <select
            value={data.enrollment.giris_turu ?? ""}
            onChange={(event) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, giris_turu: Number(event.target.value) },
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
          {errors.giris_turu && <small>{errors.giris_turu}</small>}
        </div>

        <div className="field">
          <label>Geldiği Okul</label>
          <input
            value={data.enrollment.geldigi_okul}
            onChange={(event) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, geldigi_okul: event.target.value },
              })
            }
          />
        </div>

        <div className="field">
          <label>Referans Kişi / Kurum</label>
          <input
            value={data.enrollment.referans}
            onChange={(event) =>
              onChange({
                ...data,
                enrollment: { ...data.enrollment, referans: event.target.value },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
