"use client";

type UcretStepProps = {
  value: string;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
};

export default function UcretStep({ value, hint, error, onChange }: UcretStepProps) {
  return (
    <div className="wizard-form-grid">
      <div className="wizard-field" style={{ gridColumn: "1 / -1", maxWidth: 360 }}>
        <label className="wizard-label">Deneme ücreti (TL)</label>
        <input
          className={`wizard-input ${error ? "error" : ""}`}
          inputMode="numeric"
          value={value}
          placeholder="Ücret alınmayacaksa boş bırakın"
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ""))}
        />
        {error && <span className="wizard-error">{error}</span>}
        <span style={{ color: "#6b7280", fontSize: 13 }}>
          {hint || "Bu öğrenciden daha önce deneme ücreti alındıysa son tutar yazılır. Değiştirebilirsiniz."}
        </span>
      </div>
    </div>
  );
}
