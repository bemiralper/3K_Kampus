"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchKimlikConflicts, type KimlikConflictItem } from "@/lib/kimlik-api";

export default function KimlikCakismalariPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<KimlikConflictItem[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchKimlikConflicts();
      if (!res.success || !res.data) {
        setError(res.error || "Çakışmalar yüklenemedi");
        return;
      }
      setConflicts(res.data.conflicts || []);
      setTotal(res.data.count || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/kurum-yonetimi/kurumlar" className="text-sm text-slate-500 hover:text-slate-700">
            ← Kurum Yönetimi
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Kimlik Çakışmaları</h1>
          <p className="mt-1 text-sm text-slate-600">
            TC veya telefon tekilliği ihlali riski taşıyan kayıtlar. Otomatik birleştirme yapılmaz; manuel inceleme gerekir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Yenile
        </button>
      </div>

      {loading && <p className="text-slate-500">Yükleniyor…</p>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && !error && (
        <>
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            Toplam çakışma grubu: <strong>{total}</strong>
            {total > conflicts.length && (
              <span className="text-slate-500"> (ilk {conflicts.length} gösteriliyor)</span>
            )}
          </div>

          {conflicts.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center text-emerald-900">
              Çakışma bulunamadı. Kimlik constraint migration için hazır görünüyor.
            </div>
          ) : (
            <div className="space-y-4">
              {conflicts.map((item, idx) => (
                <div key={`${item.tip}-${item.tc || item.telefon}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                      {item.tip}
                    </span>
                    {item.kurum_ad && <span className="text-sm text-slate-600">{item.kurum_ad}</span>}
                  </div>
                  {item.tc && <div className="text-sm"><span className="text-slate-500">TC:</span> {item.tc}</div>}
                  {item.telefon && (
                    <div className="text-sm"><span className="text-slate-500">Telefon:</span> {item.telefon}</div>
                  )}
                  {item.kayitlar && item.kayitlar.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                      {item.kayitlar.map((k) => (
                        <li key={`${k.model}-${k.id}`} className="text-slate-700">
                          <strong>{k.model}</strong> #{k.id} — {k.ad}
                          {k.tc ? ` (TC: ${k.tc})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.onerilen_aksiyon && (
                    <p className="mt-3 text-xs text-slate-500">{item.onerilen_aksiyon}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-6 text-xs text-slate-500">
            Sunucuda düzeltme için: <code className="rounded bg-slate-100 px-1">python manage.py backfill_kisi --report=...</code>
          </p>
        </>
      )}
    </div>
  );
}
