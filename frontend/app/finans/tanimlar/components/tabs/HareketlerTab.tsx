"use client";

import React, { useCallback, useEffect, useState } from "react";
import { paraHareketiService } from "../../../services/para-hareketi-api";
import type { ParaHareketi } from "../../../types/para-hareketi-types";

interface Props {
  kurumId: number;
  maliHesapId: number;
}

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);

const fmtTarih = (d: string) =>
  d ? new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function HareketlerTab({ kurumId, maliHesapId }: Props) {
  const [data, setData] = useState<ParaHareketi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);
  const [toplamGiris, setToplamGiris] = useState(0);
  const [toplamCikis, setToplamCikis] = useState(0);
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    paraHareketiService
      .list({ kurum_id: kurumId, mali_hesap_id: maliHesapId, baslangic: baslangic || undefined, bitis: bitis || undefined, page, page_size: 20 })
      .then((res) => {
        setData(res.results || []);
        setTotalPages(res.total_pages || 1);
        setCount(res.count || 0);
        setToplamGiris(res.sayfa_toplam_giris || 0);
        setToplamCikis(res.sayfa_toplam_cikis || 0);
      })
      .catch((err: any) => setError(err.message || "Hareketler yüklenemedi"))
      .finally(() => setLoading(false));
  }, [kurumId, maliHesapId, baslangic, bitis, page]);

  useEffect(() => { setPage(1); }, [maliHesapId, baslangic, bitis]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3.5 border-b border-gray-50">
        <input
          type="date"
          value={baslangic}
          onChange={(e) => setBaslangic(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
        <span className="text-xs text-gray-400">—</span>
        <input
          type="date"
          value={bitis}
          onChange={(e) => setBitis(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
        {(baslangic || bitis) && (
          <button
            onClick={() => { setBaslangic(""); setBitis(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none"
          >
            Temizle
          </button>
        )}
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-emerald-600 font-semibold">Giriş: {fmtTL(toplamGiris)}</span>
          <span className="text-red-500 font-semibold">Çıkış: {fmtTL(toplamCikis)}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-7 h-7 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-sm text-red-500">{error}</div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm text-gray-400">Bu hesaba ait hareket bulunamadı</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tarih</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">İşlem</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cari</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Açıklama</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ödeme Şekli</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Belge No</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tutar</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtTarih(h.islem_tarihi)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${
                        h.yon === "giris" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                      }`}>
                        {h.kaynak_label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-700 max-w-[160px] truncate">{h.cari_adi || "—"}</td>
                    <td className="px-3 py-3 text-gray-500 max-w-[200px] truncate">{h.aciklama || "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{h.odeme_yontemi_adi || "—"}</td>
                    <td className="px-3 py-3 text-gray-400 font-mono text-xs">{h.belge_no || "—"}</td>
                    <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${h.yon === "giris" ? "text-emerald-600" : "text-red-500"}`}>
                      {h.yon === "giris" ? "+" : "-"}{fmtTL(h.tutar)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600 font-medium whitespace-nowrap">
                      {h.bakiye_sonrasi != null ? fmtTL(h.bakiye_sonrasi) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-50">
              <span className="text-xs text-gray-400">{count} kayıt — Sayfa {page}/{totalPages}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Önceki
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
