"use client";

export type WalkOdemeYontemi = {
  id: number;
  ad: string;
  tip: string;
  mali_hesap_id: number | null;
};

export type WalkMaliHesap = {
  id: number;
  ad: string;
  tip: string;
};

type UcretStepProps = {
  value: string;
  odemeYontemiId?: string;
  maliHesapId?: string;
  odemeYontemleri?: WalkOdemeYontemi[];
  maliHesaplar?: WalkMaliHesap[];
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
  onOdemeChange?: (odemeYontemiId: string, maliHesapId: string) => void;
};

export default function UcretStep({
  value,
  odemeYontemiId = "",
  maliHesapId = "",
  odemeYontemleri = [],
  maliHesaplar = [],
  hint,
  error,
  onChange,
  onOdemeChange,
}: UcretStepProps) {
  const cleanNum = Number(value.replace(/[^\d]/g, "")) || 0;

  return (
    <div className="wizard-form-grid">
      <div className="wizard-field" style={{ gridColumn: "1 / -1", maxWidth: 380 }}>
        <label className="wizard-label">Deneme ücreti (TL)</label>
        <input
          className={`wizard-input ${error ? "error" : ""}`}
          inputMode="numeric"
          value={value}
          placeholder="Ücret alınmayacaksa boş bırakın"
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ""))}
        />
        <span style={{ color: "#6b7280", fontSize: 13 }}>
          {hint || "Bu öğrenciden daha önce deneme ücreti alındıysa son tutar yazılır. Değiştirebilirsiniz."}
        </span>
      </div>

      {cleanNum > 0 && onOdemeChange && (
        <>
          <div className="wizard-field" style={{ maxWidth: 380 }}>
            <label className="wizard-label">Ödeme şekli *</label>
            <select
              className={`wizard-input ${error && !odemeYontemiId ? "error" : ""}`}
              value={odemeYontemiId}
              onChange={(event) => {
                const nextYontemId = event.target.value;
                const yontem = odemeYontemleri.find((item) => String(item.id) === nextYontemId);
                const nextHesapId = yontem?.mali_hesap_id ? String(yontem.mali_hesap_id) : maliHesapId;
                onOdemeChange(nextYontemId, nextHesapId);
              }}
            >
              <option value="">Seçiniz</option>
              {odemeYontemleri.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.ad}
                </option>
              ))}
            </select>
          </div>

          <div className="wizard-field" style={{ maxWidth: 380 }}>
            <label className="wizard-label">Mali hesap / Kasa *</label>
            <select
              className={`wizard-input ${error && !maliHesapId ? "error" : ""}`}
              value={maliHesapId}
              onChange={(event) => onOdemeChange(odemeYontemiId, event.target.value)}
            >
              <option value="">Seçiniz</option>
              {maliHesaplar.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.ad}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {error && (
        <div style={{ gridColumn: "1 / -1" }}>
          <span className="wizard-error">{error}</span>
        </div>
      )}
    </div>
  );
}
