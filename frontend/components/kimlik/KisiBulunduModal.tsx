"use client";

import type { ReactNode } from "react";
import type { KimlikResolveResponse } from "@/lib/kimlik-api";
import { KIMLIK_APPLY_LABELS, formatKimlikPhone } from "@/lib/kimlik-form-utils";

type KisiBulunduModalProps = {
  open: boolean;
  result: KimlikResolveResponse | null;
  context: "personel" | "ogrenci" | "veli";
  loading?: boolean;
  applyDisabled?: boolean;
  applyLabel?: string;
  extraContent?: ReactNode;
  onApply: () => void;
  onCancel: () => void;
};

const ROL_LABEL: Record<string, string> = {
  personel: "Personel",
  ogrenci: "Öğrenci",
  veli: "Veli",
};

export default function KisiBulunduModal({
  open,
  result,
  context,
  loading = false,
  applyDisabled = false,
  applyLabel,
  extraContent,
  onApply,
  onCancel,
}: KisiBulunduModalProps) {
  if (!open || !result?.found) return null;

  const blocked = applyDisabled || Boolean(result.engellenen);

  const kisi = result.kisi;
  const displayName =
    kisi?.tam_ad ||
    result.roller?.[0]?.tam_ad ||
    `${result.roller?.[0]?.ad || ""} ${result.roller?.[0]?.soyad || ""}`.trim();

  const tc = kisi?.tc_kimlik_no || "";
  const telefon = kisi?.telefon || result.roller?.find((r) => r.telefon)?.telefon;
  const email = kisi?.email || result.roller?.find((r) => r.email)?.email;

  const primaryLabel = applyLabel || KIMLIK_APPLY_LABELS[context];

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kisi-bulundu-title"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              ✓
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="kisi-bulundu-title" className="text-lg font-semibold text-slate-900">
                Kişi Bulundu
              </h3>
              <p className="text-sm text-slate-600">
                Girilen bilgilerle eşleşen bir kişi sistemde bulundu.
                {result.eslesme === "telefon" && (
                  <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                    Telefon eşleşmesi
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow label="Ad Soyad" value={displayName || "—"} wide />
            <InfoRow label="TC Kimlik No" value={tc || "—"} />
            <InfoRow label="Telefon" value={formatKimlikPhone(telefon)} />
            <InfoRow label="E-posta" value={email || "—"} />
            {typeof kisi?.aktif_mi === "boolean" && (
              <InfoRow
                label="Durum"
                value={kisi.aktif_mi ? "Aktif" : "Pasif"}
                badge={kisi.aktif_mi ? "success" : "muted"}
              />
            )}
          </div>

          {result.roller && result.roller.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Roller</div>
              <div className="space-y-2">
                {result.roller.map((rol) => (
                  <div
                    key={`${rol.tip}-${rol.id}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{ROL_LABEL[rol.tip] || rol.tip}</span>
                      {typeof rol.aktif_mi === "boolean" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            rol.aktif_mi ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {rol.aktif_mi ? "Aktif" : "Pasif"}
                        </span>
                      )}
                    </div>
                    {rol.subeler && rol.subeler.length > 0 && (
                      <div className="mt-1 text-slate-600">Şubeler: {rol.subeler.join(", ")}</div>
                    )}
                    {rol.gorev_sube && <div className="text-slate-600">Görev şubesi: {rol.gorev_sube}</div>}
                    {rol.egitim_yili && <div className="text-slate-600">Eğitim yılı: {rol.egitim_yili}</div>}
                    {rol.sinif_seviyesi && <div className="text-slate-600">Sınıf seviyesi: {rol.sinif_seviyesi}</div>}
                    {rol.bagli_ogrenciler && rol.bagli_ogrenciler.length > 0 && (
                      <div className="text-slate-600">
                        Bağlı öğrenciler:{" "}
                        {rol.bagli_ogrenciler.map((o) => `${o.ad} ${o.soyad}`).join(", ")}
                      </div>
                    )}
                    {rol.meslek && <div className="text-slate-600">Meslek: {rol.meslek}</div>}
                    {rol.veli_turu_display && <div className="text-slate-600">{rol.veli_turu_display}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.engellenen && result.engellenen_mesaj && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {result.engellenen_mesaj}
            </div>
          )}

          {result.uyarilar && result.uyarilar.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {result.uyarilar.map((u) => (
                <div key={u}>{u}</div>
              ))}
            </div>
          )}

          {extraContent}

          <p className="text-xs text-slate-500">
            TC Kimlik Numarası değiştirilemez. Telefon ve diğer iletişim bilgilerini gerekirse formda
            güncelleyebilirsiniz.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={loading || blocked}
            onClick={onApply}
            className="rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2d5a87] disabled:opacity-60"
            title={blocked ? result.engellenen_mesaj || "Bu kayıt tamamlanamaz" : undefined}
          >
            {loading ? "Yükleniyor…" : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  wide,
  badge,
}: {
  label: string;
  value: string;
  wide?: boolean;
  badge?: "success" | "muted";
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="text-xs text-slate-500">{label}</div>
      {badge ? (
        <span
          className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-sm font-medium ${
            badge === "success" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          {value}
        </span>
      ) : (
        <div className="text-sm font-medium text-slate-900">{value}</div>
      )}
    </div>
  );
}
