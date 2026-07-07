"use client";

import type { TcCheckResponse } from "@/app/ogrenciler/yeni-kayit/types";

type Props = {
  tcResult: TcCheckResponse | null;
};

/** Öğrenci kayıt modalında kayıt geçmişi / sözleşme ek bilgileri. */
export default function OgrenciKimlikEkPanel({ tcResult }: Props) {
  if (!tcResult?.found) return null;

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      {tcResult.kayit_gecmisi && tcResult.kayit_gecmisi.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Kayıt geçmişi</div>
          <div className="space-y-1.5">
            {tcResult.kayit_gecmisi.map((k, i) => (
              <div
                key={`${k.egitim_yili}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">{k.egitim_yili}</span>
                <span className="text-slate-600">
                  {k.sinif_seviyesi}
                  {k.alan ? ` — ${k.alan}` : ""}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    k.aktif_mi ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {k.aktif_mi ? "Aktif" : "Tamamlandı"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tcResult.son_sozlesme && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium text-slate-800">Son sözleşme</div>
          <div className="text-slate-600">
            {tcResult.son_sozlesme.sozlesme_no} — {tcResult.son_sozlesme.paket_adi}
          </div>
        </div>
      )}

      {tcResult.aktif_yilda_kayitli && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Bu öğrenci aktif eğitim yılında zaten kayıtlı. Yeni kayıt için farklı bir eğitim yılı seçin veya
          mevcut kaydı güncelleyin.
        </div>
      )}

      {tcResult.sonraki_seviye && !tcResult.aktif_yilda_kayitli && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Önerilen sınıf seviyesi: <strong>{tcResult.sonraki_seviye.ad}</strong>
        </div>
      )}
    </div>
  );
}
