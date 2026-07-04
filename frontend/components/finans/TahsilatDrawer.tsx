"use client";

import FinansFormDrawer, { FinansDrawerButton } from "./FinansFormDrawer";
import { FField, FInput, FSection, FSelect, FTextarea } from "./FinansFields";
import IslemMasrafiFields from "./IslemMasrafiFields";
import { formatOdemeYontemiLabel } from "./odeme-yontemi-label";
import { islemMasrafiGoster } from "@/app/finans/utils/islem-masrafi-eligibility";
import type { IslemMasrafiFormState } from "@/app/finans/types/islem-masrafi-types";

export type TahsilatDrawerProps = {
  open: boolean;
  onClose: () => void;
  kalanTutar: number;
  fmtTutar: (v: number | string | undefined | null) => string;
  form: {
    odeme_yontemi_id: number;
    mali_hesap_id: number;
    tutar: string;
    tahsilat_tarihi: string;
    aciklama: string;
  } & IslemMasrafiFormState;
  setForm: React.Dispatch<React.SetStateAction<TahsilatDrawerProps["form"]>>;
  fieldErrors: Record<string, string>;
  generalError: string | null;
  saving: boolean;
  onSubmit: () => void;
  odemeYontemleri: { id: number; ad: string; mali_hesap_id: number; tip?: string }[];
  maliHesaplar: { id: number; ad: string; tip?: string }[];
};

export default function TahsilatDrawer({
  open,
  onClose,
  kalanTutar,
  fmtTutar,
  form,
  setForm,
  fieldErrors,
  generalError,
  saving,
  onSubmit,
  odemeYontemleri,
  maliHesaplar,
}: TahsilatDrawerProps) {
  const filtreliOdemeYontemleri = form.mali_hesap_id
    ? odemeYontemleri.filter((o) => o.mali_hesap_id === form.mali_hesap_id)
    : [];

  const selectedYontem = odemeYontemleri.find((o) => o.id === form.odeme_yontemi_id);
  const selectedHesap = maliHesaplar.find((m) => m.id === form.mali_hesap_id);
  const masrafVisible = islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);

  return (
    <FinansFormDrawer
      open={open}
      onClose={onClose}
      variant="gelir"
      title="Tahsilat Yap"
      subtitle="Gelir kaydına ödeme girişi"
      error={generalError}
      footer={
        <>
          <FinansDrawerButton variant="ghost" onClick={onClose}>
            Vazgeç
          </FinansDrawerButton>
          <FinansDrawerButton tone="emerald" onClick={onSubmit} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Tahsilatı Kaydet"}
          </FinansDrawerButton>
        </>
      }
    >
      <div className="fd-balance-badge">
        <div className="fd-balance-badge-label">Kalan Tutar</div>
        <div className="fd-balance-badge-value">{fmtTutar(kalanTutar)} ₺</div>
      </div>

      <FSection title="Ödeme">
        <FField label="Mali Hesap" required error={fieldErrors.mali_hesap_id}>
          <FSelect
            error={!!fieldErrors.mali_hesap_id}
            value={form.mali_hesap_id || ""}
            onChange={(e) =>
              setForm({
                ...form,
                mali_hesap_id: Number(e.target.value),
                odeme_yontemi_id: 0,
                kesinti_turu: "",
                kesinti_tutar: "",
                kesinti_aciklama: "",
              })
            }
          >
            <option value="">Seçiniz</option>
            {maliHesaplar.map((m) => (
              <option key={m.id} value={m.id}>{m.ad}</option>
            ))}
          </FSelect>
        </FField>

        <FField label="Ödeme Yöntemi" required error={fieldErrors.odeme_yontemi_id}>
          <FSelect
            error={!!fieldErrors.odeme_yontemi_id}
            disabled={!form.mali_hesap_id}
            value={form.odeme_yontemi_id || ""}
            onChange={(e) =>
              setForm({
                ...form,
                odeme_yontemi_id: Number(e.target.value),
                kesinti_turu: "",
                kesinti_tutar: "",
                kesinti_aciklama: "",
              })
            }
          >
            <option value="">{form.mali_hesap_id ? "Seçiniz" : "Önce mali hesap seçin"}</option>
            {filtreliOdemeYontemleri.map((o) => (
              <option key={o.id} value={o.id}>
                {formatOdemeYontemiLabel(o, { hideMaliHesap: true })}
              </option>
            ))}
          </FSelect>
        </FField>

        <div className="fd-row-2">
          <FField label="İşlem Tutarı" required error={fieldErrors.tutar}>
            <FInput
              type="number"
              min="0"
              max={kalanTutar}
              step="0.01"
              error={!!fieldErrors.tutar}
              value={form.tutar}
              onChange={(e) => setForm({ ...form, tutar: e.target.value })}
              placeholder="0,00"
            />
          </FField>
          <FField label="Tahsilat Tarihi" required>
            <FInput
              type="date"
              value={form.tahsilat_tarihi}
              onChange={(e) => setForm({ ...form, tahsilat_tarihi: e.target.value })}
            />
          </FField>
        </div>

        <IslemMasrafiFields
          visible={masrafVisible}
          form={form}
          onChange={(patch) => setForm({ ...form, ...patch })}
          fieldErrors={fieldErrors}
        />

        <FField label="Açıklama">
          <FTextarea
            value={form.aciklama}
            onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
            placeholder="Opsiyonel not…"
            rows={2}
          />
        </FField>
      </FSection>
    </FinansFormDrawer>
  );
}
