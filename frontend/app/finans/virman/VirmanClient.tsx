"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { hesapTransferiService } from "../services/para-hareketi-api";
import FinansToast, { type FinansToastType } from "@/components/finans/FinansToast";
import VirmanModal, { type VirmanMode } from "../para-hareketleri/modals/VirmanModal";
import type { HesapTransferi } from "../types/para-hareketi-types";

type ModalState = { type: "virman"; mode: VirmanMode } | null;

const QUICK_ACTIONS: { key: string; label: string; icon: string; color: string; bg: string; open: ModalState }[] = [
  { key: "virman", label: "Virman", icon: "↔️", color: "#7c3aed", bg: "#f2ecfc", open: { type: "virman", mode: "virman" } },
  { key: "bankaya", label: "Bankaya Yatır", icon: "📥", color: "#2563eb", bg: "#eaf3fb", open: { type: "virman", mode: "kasadan_bankaya" } },
  { key: "kasaya", label: "Bankadan Çek", icon: "📤", color: "#0891b2", bg: "#e5f6fa", open: { type: "virman", mode: "bankadan_kasaya" } },
];

const fmtTL = (v: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(v || 0);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function VirmanClient({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum, activeSube } = useKurum();
  const { homeHref, portalHomeHref } = useFinansPath();

  const [items, setItems] = useState<HesapTransferi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ message: string; type: FinansToastType } | null>(null);

  const load = useCallback(async () => {
    if (!activeKurum?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await hesapTransferiService.list({
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transferler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSuccess = (message: string) => {
    setToast({ message, type: "success" });
    setModal(null);
    load();
  };

  if (!activeKurum) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 text-3xl">🏢</div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Virman işlemlerini görüntülemek için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  return (
    <div>
      {!embedded && (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Virman</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Virman</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setModal(a.open)}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: a.bg, color: a.color }}
            >
              {a.icon}
            </div>
            <span className="text-xs font-bold text-gray-700 text-center leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-sm">
          {error}
        </div>
      )}

      <div className="card-modern">
        <div className="card-modern-header">
          <h3>Son Transferler</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-10">Henüz transfer kaydı yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-semibold">Tarih</th>
                  <th className="px-4 py-3 font-semibold">Tür</th>
                  <th className="px-4 py-3 font-semibold">Kaynak</th>
                  <th className="px-4 py-3 font-semibold">Hedef</th>
                  <th className="px-4 py-3 font-semibold text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">{fmtDate(row.transfer_tarihi)}</td>
                    <td className="px-4 py-3">{row.transfer_turu_label || row.transfer_turu}</td>
                    <td className="px-4 py-3">{row.kaynak_hesap?.ad || "—"}</td>
                    <td className="px-4 py-3">{row.hedef_hesap?.ad || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtTL(row.tutar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal?.type === "virman" && (
        <VirmanModal
          mode={modal.mode}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}

      {toast && (
        <FinansToast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
