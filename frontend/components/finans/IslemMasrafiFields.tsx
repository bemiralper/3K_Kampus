"use client";

import { FField, FInput, FSelect, FTextarea } from "./FinansFields";
import {
  KESINTI_TURLERI,
  type IslemMasrafiFormState,
} from "@/app/finans/types/islem-masrafi-types";

export type IslemMasrafiFieldsProps = {
  visible: boolean;
  form: IslemMasrafiFormState;
  onChange: (patch: Partial<IslemMasrafiFormState>) => void;
  fieldErrors?: Record<string, string>;
};

export default function IslemMasrafiFields({
  visible,
  form,
  onChange,
  fieldErrors = {},
}: IslemMasrafiFieldsProps) {
  if (!visible) return null;

  return (
    <div className="fd-masraf-block" style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#64748b",
          marginBottom: 8,
          letterSpacing: "0.02em",
        }}
      >
        İşlem Masrafı (opsiyonel)
      </div>
      <div className="fd-row-2">
        <FField label="Kesinti Türü" error={fieldErrors.kesinti_turu}>
          <FSelect
            error={!!fieldErrors.kesinti_turu}
            value={form.kesinti_turu}
            onChange={(e) =>
              onChange({
                kesinti_turu: e.target.value as IslemMasrafiFormState["kesinti_turu"],
              })
            }
          >
            <option value="">Seçiniz (masraf yok)</option>
            {KESINTI_TURLERI.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </FSelect>
        </FField>
        <FField label="Kesinti Tutarı" error={fieldErrors.kesinti_tutar}>
          <FInput
            type="number"
            min="0"
            step="0.01"
            error={!!fieldErrors.kesinti_tutar}
            value={form.kesinti_tutar}
            onChange={(e) => onChange({ kesinti_tutar: e.target.value })}
            placeholder="0,00"
            disabled={!form.kesinti_turu}
          />
        </FField>
      </div>
      <FField label="Masraf Açıklaması">
        <FTextarea
          value={form.kesinti_aciklama}
          onChange={(e) => onChange({ kesinti_aciklama: e.target.value })}
          placeholder="Opsiyonel…"
          rows={2}
          disabled={!form.kesinti_turu}
        />
      </FField>
    </div>
  );
}
