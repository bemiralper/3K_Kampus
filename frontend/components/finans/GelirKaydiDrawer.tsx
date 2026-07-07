"use client";

import { useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { formatUserDisplayName } from "@/lib/format-user";
import FinansWizardDrawer, { type FinansWizardStep } from "./FinansWizardDrawer";
import { FAmountHero, FField, FInput, FKpiRow, FReviewRow, FSection, FSelect, FSummaryCard, FTextarea } from "./FinansFields";
import { formatOdemeYontemiLabel } from "./odeme-yontemi-label";
import type { GelirKaydiCreatePayload } from "@/app/finans/types/gelir-types";
import type { CariHesapTuru } from "@/app/finans/types/cari-hesap-types";
import { HESAP_TURLERI } from "@/app/finans/types/cari-hesap-types";

const KDV_OPTIONS = [
  { value: 0, label: "KDV Yok (%0)" },
  { value: 1, label: "%1" },
  { value: 10, label: "%10" },
  { value: 20, label: "%20" },
];

const IconTaraf = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconTutar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path strokeLinecap="round" d="M6 10v.01M18 14v.01" />
  </svg>
);
const IconOdeme = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2 10h20" />
  </svg>
);
const IconOzet = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);
const IconGelir = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export type GelirKaydiDrawerProps = {
  open: boolean;
  onClose: () => void;
  editId: number | null;
  form: GelirKaydiCreatePayload;
  setForm: React.Dispatch<React.SetStateAction<GelirKaydiCreatePayload>>;
  formErrors: Record<string, string>;
  formGeneralError: string | null;
  saving: boolean;
  onSave: () => void;
  cariHesaplar: { id: number; gorunen_ad: string; hesap_turu?: CariHesapTuru; gelir_kategorileri?: number[] }[];
  kategoriler: { id: number; label: string }[];
  onCariHesapChange: (cariHesapId: number) => void;
  maliHesaplar: { id: number; ad: string }[];
  odemeYontemleri: { id: number; ad: string; tip?: string; mali_hesap_id?: number | null }[];
  brutTutar: number;
  kdvTutar: number;
  kdvOrani: number;
  fmtTutar: (v: number | string | undefined | null) => string;
};

export default function GelirKaydiDrawer({
  open,
  onClose,
  editId,
  form,
  setForm,
  formErrors,
  formGeneralError,
  saving,
  onSave,
  cariHesaplar,
  kategoriler,
  onCariHesapChange,
  maliHesaplar,
  odemeYontemleri,
  brutTutar,
  kdvTutar,
  kdvOrani,
  fmtTutar,
}: GelirKaydiDrawerProps) {
  const { user } = useAuth();
  const islemYapanAdi = formatUserDisplayName(user);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const err = (field: string) => localErrors[field] || formErrors[field];

  const setStepErrors = (fields: string[], errs: Record<string, string>) => {
    setLocalErrors((prev) => {
      const next = { ...prev };
      fields.forEach((f) => delete next[f]);
      return { ...next, ...errs };
    });
  };

  const filtreliOdemeYontemleri = odemeYontemleri;

  const validateTaraf = () => {
    const e: Record<string, string> = {};
    if (!form.cari_hesap_id) e.cari_hesap_id = "Cari hesap seçiniz.";
    if (!form.gelir_kategorisi_id) e.gelir_kategorisi_id = "Kategori seçiniz.";
    setStepErrors(["cari_hesap_id", "gelir_kategorisi_id"], e);
    return Object.keys(e).length === 0;
  };

  const validateTutar = () => {
    const e: Record<string, string> = {};
    if (!form.brut_tutar || Number(form.brut_tutar) <= 0) e.brut_tutar = "Net tutar sıfırdan büyük olmalıdır.";
    if (!form.fatura_tarihi) e.fatura_tarihi = "Fatura tarihi zorunludur.";
    if (!form.vade_tarihi) e.vade_tarihi = "Vade tarihi zorunludur.";
    setStepErrors(["brut_tutar", "fatura_tarihi", "vade_tarihi"], e);
    return Object.keys(e).length === 0;
  };

  const validateOdeme = () => {
    const e: Record<string, string> = {};
    if (!form.mali_hesap_id) e.mali_hesap_id = "Mali hesap seçiniz.";
    if (!form.odeme_yontemi_id) e.odeme_yontemi_id = "Ödeme yöntemi seçiniz.";
    setStepErrors(["mali_hesap_id", "odeme_yontemi_id"], e);
    return Object.keys(e).length === 0;
  };

  const selectedCari = cariHesaplar.find((c) => c.id === form.cari_hesap_id);
  const selectedKategori = kategoriler?.find((k) => k.id === form.gelir_kategorisi_id);
  const selectedMaliHesap = maliHesaplar.find((m) => m.id === form.mali_hesap_id);
  const selectedOdemeYontemi = odemeYontemleri.find((o) => o.id === form.odeme_yontemi_id);

  const steps: FinansWizardStep[] = [
    {
      id: "taraf",
      label: "Taraf & Kategori",
      icon: <IconTaraf />,
      fields: ["cari_hesap_id", "gelir_kategorisi_id"],
      validate: validateTaraf,
      content: (
        <FSection title="Taraf & Kategori">
          <FField label="Cari Hesap" required error={err("cari_hesap_id")}>
            <FSelect
              error={!!err("cari_hesap_id")}
              value={form.cari_hesap_id || ""}
              onChange={(e) => onCariHesapChange(Number(e.target.value))}
            >
              <option value="">Seçiniz</option>
              {cariHesaplar.map((ch) => {
                const tur = ch.hesap_turu
                  ? HESAP_TURLERI.find((h) => h.value === ch.hesap_turu)?.label
                  : null;
                return (
                  <option key={ch.id} value={ch.id}>
                    {ch.gorunen_ad}{tur ? ` (${tur})` : ""}
                  </option>
                );
              })}
            </FSelect>
          </FField>

          <FField label="Gelir Kategorisi" required error={err("gelir_kategorisi_id")}>
            <FSelect
              disabled={!form.cari_hesap_id}
              error={!!err("gelir_kategorisi_id")}
              value={form.gelir_kategorisi_id || ""}
              onChange={(e) => setForm({ ...form, gelir_kategorisi_id: Number(e.target.value) })}
            >
              <option value="">
                {!form.cari_hesap_id ? "Önce cari hesap seçin" : "Kategori seçin"}
              </option>
              {kategoriler?.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </FSelect>
          </FField>

          <FField label="İşlemi Yapan">
            <FInput readOnly value={islemYapanAdi} />
          </FField>
        </FSection>
      ),
    },
    {
      id: "tutar",
      label: "Tutar & Tarihler",
      icon: <IconTutar />,
      fields: ["brut_tutar", "fatura_tarihi", "vade_tarihi"],
      validate: validateTutar,
      content: (
        <>
          <FAmountHero
            variant="gelir"
            label="Net Tutar (KDV Dahil)"
            value={form.brut_tutar || ""}
            onChange={(v) => setForm({ ...form, brut_tutar: v })}
            error={err("brut_tutar")}
          />

          <div style={{ marginBottom: 4 }}>
            <FKpiRow
              items={[
                { label: "Brüt (KDV Hariç)", value: `${fmtTutar(brutTutar)} ₺` },
                { label: `KDV (%${kdvOrani})`, value: `${fmtTutar(kdvTutar)} ₺` },
              ]}
            />
          </div>

          <FSection title="Tarih & Detay">
            <div className="fd-row-2">
              <FField label="Fatura Tarihi" required error={err("fatura_tarihi")}>
                <FInput
                  type="date"
                  error={!!err("fatura_tarihi")}
                  value={form.fatura_tarihi}
                  onChange={(e) => setForm({ ...form, fatura_tarihi: e.target.value })}
                />
              </FField>
              <FField label="Vade Tarihi" required error={err("vade_tarihi")}>
                <FInput
                  type="date"
                  error={!!err("vade_tarihi")}
                  value={form.vade_tarihi}
                  onChange={(e) => setForm({ ...form, vade_tarihi: e.target.value })}
                />
              </FField>
            </div>

            <FField label="Fatura No">
              <FInput
                value={form.fatura_no || ""}
                onChange={(e) => setForm({ ...form, fatura_no: e.target.value })}
                placeholder="Fatura no"
                style={{ fontFamily: "ui-monospace, monospace" }}
              />
            </FField>

            <FField label="KDV Oranı">
              <FSelect
                value={form.kdv_orani ?? 20}
                onChange={(e) => setForm({ ...form, kdv_orani: Number(e.target.value) })}
              >
                {KDV_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </FSelect>
            </FField>

            <FField label="Açıklama">
              <FTextarea
                value={form.aciklama || ""}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                placeholder="Not ekleyin…"
                rows={3}
              />
            </FField>
          </FSection>
        </>
      ),
    },
    {
      id: "odeme",
      label: "Ödeme",
      icon: <IconOdeme />,
      fields: ["mali_hesap_id", "odeme_yontemi_id"],
      validate: validateOdeme,
      content: (
        <FSection title="Ödeme Bilgileri">
          <FField label="Mali Hesap" required error={err("mali_hesap_id")}>
            <FSelect
              error={!!err("mali_hesap_id")}
              value={form.mali_hesap_id || ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setForm({ ...form, mali_hesap_id: id, odeme_yontemi_id: null });
              }}
            >
              <option value="">Seçiniz — Kasa, Banka…</option>
              {maliHesaplar.map((m) => (
                <option key={m.id} value={m.id}>{m.ad}</option>
              ))}
            </FSelect>
          </FField>

          <FField label="Ödeme Yöntemi" required error={err("odeme_yontemi_id")}>
            <FSelect
              error={!!err("odeme_yontemi_id")}
              disabled={!form.mali_hesap_id}
              value={form.odeme_yontemi_id || ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setForm({ ...form, odeme_yontemi_id: id });
              }}
            >
              <option value="">
                {form.mali_hesap_id ? "Seçiniz — Nakit, POS, Çek…" : "Önce mali hesap seçin"}
              </option>
              {filtreliOdemeYontemleri.map((o) => (
                <option key={o.id} value={o.id}>
                  {formatOdemeYontemiLabel(o, { hideMaliHesap: true })}
                </option>
              ))}
            </FSelect>
          </FField>
        </FSection>
      ),
    },
    {
      id: "ozet",
      label: "Özet & Onayla",
      icon: <IconOzet />,
      content: (
        <FSection title="Özet & Onayla">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fd-muted, #64748b)" }}>
            Kaydetmeden önce bilgileri gözden geçirin.
          </p>
          <FSummaryCard>
            <FReviewRow label="İşlemi Yapan" value={islemYapanAdi} />
            <FReviewRow label="Cari Hesap" value={selectedCari?.gorunen_ad || "—"} />
            <FReviewRow label="Kategori" value={selectedKategori?.label || "—"} />
            <FReviewRow label="Net Tutar" value={`${fmtTutar(form.brut_tutar)} ₺`} />
            <FReviewRow label={`KDV (%${kdvOrani})`} value={`${fmtTutar(kdvTutar)} ₺`} muted />
            <FReviewRow label="Mali Hesap" value={selectedMaliHesap?.ad || "—"} />
            <FReviewRow label="Ödeme Yöntemi" value={selectedOdemeYontemi?.ad || "—"} />
            <FReviewRow label="Fatura Tarihi" value={form.fatura_tarihi || "—"} />
            <FReviewRow label="Vade Tarihi" value={form.vade_tarihi || "—"} />
            {form.fatura_no && <FReviewRow label="Fatura No" value={form.fatura_no} muted />}
            {form.aciklama && <FReviewRow label="Açıklama" value={form.aciklama} muted />}
          </FSummaryCard>
        </FSection>
      ),
    },
  ];

  return (
    <FinansWizardDrawer
      open={open}
      onClose={onClose}
      variant="gelir"
      headerIcon={<IconGelir />}
      title={editId ? "Gelir Kaydını Düzenle" : "Yeni Gelir Kaydı"}
      subtitle="Cari hesap, ödeme yöntemi ve tutar bilgilerini adım adım girin."
      steps={steps}
      fieldErrors={{ ...localErrors, ...formErrors }}
      generalError={formGeneralError}
      onSubmit={onSave}
      saving={saving}
      submitLabel={editId ? "Güncelle" : "Kaydet"}
    />
  );
}
