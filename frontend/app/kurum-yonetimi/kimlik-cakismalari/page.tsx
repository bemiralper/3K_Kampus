"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { fetchKimlikConflicts, type KimlikConflictItem } from "@/lib/kimlik-api";

const TIP_LABEL: Record<string, string> = {
  tc_cross_entity: "TC çakışması",
  telefon_farkli_tc: "Aynı telefon, farklı TC",
};

function tipLabel(tip: string) {
  return TIP_LABEL[tip] || tip;
}

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
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/kurum-yonetimi/kurumlar" className="text-sm text-[#5c6b80] no-underline hover:text-[#0061A6]">
            ← Kurum Yönetimi
          </Link>
          <h1 className="m-0 mt-2 text-xl font-semibold tracking-tight text-[#1e3352]">Kimlik Çakışmaları</h1>
          <p className="m-0 mt-1 max-w-3xl text-sm leading-relaxed text-[#5c6b80]">
            Farklı kişilerin aynı TC veya telefonu paylaştığı kayıtlar. Aynı kişinin personel ve veli rolleri çakışma sayılmaz. Otomatik birleştirme yapılmaz; manuel inceleme gerekir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-[40px] shrink-0 cursor-pointer items-center justify-center gap-2 self-start rounded-lg border border-[#d5deea] bg-white px-3.5 text-sm font-[inherit] font-medium text-[#1e3352] transition-colors hover:bg-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Yenile
        </button>
      </div>

      {loading && (
        <p role="status" className="m-0 text-sm text-[#5c6b80]">
          Yükleniyor…
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-lg border border-[#f3c7c3] bg-[#fef3f2] px-3.5 py-3 text-sm text-[#b42318]">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="m-0 text-sm text-[#5c6b80]">
            Toplam çakışma grubu: <strong className="font-semibold text-[#1e3352]">{total}</strong>
            {total > conflicts.length && (
              <span> (ilk {conflicts.length} gösteriliyor)</span>
            )}
          </p>

          {conflicts.length === 0 ? (
            <div className="rounded-lg border border-[#cfe8d8] bg-[#f3faf6] px-4 py-8 text-center text-sm text-[#146c43]">
              Çakışma bulunamadı. Kimlik constraint migration için hazır görünüyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {conflicts.map((item, idx) => (
                <ConflictCard key={`${item.tip}-${item.tc || item.telefon}-${idx}`} item={item} />
              ))}
            </div>
          )}

          <p className="m-0 max-w-3xl break-words text-xs leading-relaxed text-[#8b9bb0]">
            Sunucuda düzeltme için:{" "}
            <code className="rounded bg-[#f1f4f8] px-1.5 py-0.5 font-mono text-[11px] text-[#31445c]">
              python manage.py backfill_kisi --report=...
            </code>
          </p>
        </>
      )}
    </div>
  );
}

function ConflictCard({ item }: { item: KimlikConflictItem }) {
  const known = Boolean(TIP_LABEL[item.tip]);

  return (
    <article className="min-w-0 rounded-lg border border-[#e6ebf2] bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center rounded-md bg-[#fff6e8] px-2 py-0.5 text-xs font-medium text-[#8a5a00]">
          {tipLabel(item.tip)}
        </span>
        {known && <span className="font-mono text-[11px] text-[#8b9bb0]">{item.tip}</span>}
        {item.kurum_ad && <span className="text-sm text-[#5c6b80]">{item.kurum_ad}</span>}
      </div>

      {item.tc && (
        <p className="m-0 mt-3 break-all text-sm text-[#1e3352]">
          <span className="text-[#8b9bb0]">TC: </span>
          <span className="font-medium tabular-nums">{item.tc}</span>
        </p>
      )}
      {item.telefon && (
        <p className="m-0 mt-1 break-all text-sm text-[#1e3352]">
          <span className="text-[#8b9bb0]">Telefon: </span>
          <span className="font-medium">{item.telefon}</span>
        </p>
      )}

      {item.kayitlar && item.kayitlar.length > 0 && (
        <ul className="m-0 mt-3 list-none space-y-1.5 border-t border-[#f0f3f7] p-0 pt-3">
          {item.kayitlar.map((k) => (
            <li key={`${k.model}-${k.id}`} className="break-words text-sm text-[#31445c]">
              <span className="font-medium text-[#1e3352]">{k.model}</span>
              <span className="tabular-nums"> #{k.id}</span>
              <span> — {k.ad}</span>
              {k.tc ? <span className="text-[#5c6b80]"> (TC: {k.tc})</span> : null}
            </li>
          ))}
        </ul>
      )}

      {item.onerilen_aksiyon && (
        <p className="m-0 mt-3 text-xs leading-relaxed text-[#8b9bb0]">{item.onerilen_aksiyon}</p>
      )}
    </article>
  );
}
