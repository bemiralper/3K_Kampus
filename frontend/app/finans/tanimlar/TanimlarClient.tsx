"use client";

import React, { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import MaliHesaplarTree from "./components/MaliHesaplarTree";
import MaliHesapDetailPanel from "./components/MaliHesapDetailPanel";
import MaliHesapForm from "./components/MaliHesapForm";
import type { MaliHesap, MaliHesapAgacSube } from "../types/financial-account-types";

function TanimlarInner() {
  const { homeHref, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube, globalSubeAccess, filteredSubeler } = useKurum();
  const kurumId = activeKurum?.id;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formEditId, setFormEditId] = useState<number | null>(null);
  const autoSelected = useRef(false);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    setSelectedId(null);
    autoSelected.current = false;
  }, [kurumId]);

  const handleTreeLoaded = useCallback((subeler: MaliHesapAgacSube[]) => {
    if (autoSelected.current) return;
    autoSelected.current = true;
    const firstHesap = subeler.flatMap((s) => s.hesaplar)[0];
    if (firstHesap) setSelectedId(firstHesap.id);
  }, []);

  const openCreate = () => { setFormEditId(null); setFormOpen(true); };
  const openEdit = (id: number) => { setFormEditId(id); setFormOpen(true); };
  const closeForm = () => setFormOpen(false);

  const handleFormSuccess = (msg: string, hesap: MaliHesap) => {
    setFormOpen(false);
    showToast(msg);
    setTreeRefreshKey((k) => k + 1);
    setPanelRefreshKey((k) => k + 1);
    setSelectedId(hesap.id);
  };

  const handleAccountDeleted = () => {
    setSelectedId(null);
    autoSelected.current = false;
    setTreeRefreshKey((k) => k + 1);
  };

  const handleChanged = () => {
    setTreeRefreshKey((k) => k + 1);
  };

  const subelerOptions = kurumId ? filteredSubeler.map((s) => ({ id: s.id, ad: s.ad })) : [];
  const formSubeId = activeSube?.id ?? subelerOptions[0]?.id;

  if (!kurumId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Mali hesapları görüntülemek için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  if (!activeSube) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Şube Seçiniz</h3>
        <p className="text-sm text-gray-500">Finans tanımları için üst menüden aktif şube seçin.</p>
      </div>
    );
  }

  return (
    <>
      {/* Hero Header */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Mali Hesaplar</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>Ana Sayfa</a>
              <span>/</span>
              <a href={homeHref}>Finans</a>
              <span>/</span>
              <span>Mali Hesaplar</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tree + Detail Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start" style={{ minHeight: "60vh" }}>
        <div className="lg:sticky lg:top-4" style={{ height: "calc(100vh - 180px)", minHeight: 480 }}>
          <MaliHesaplarTree
            kurumId={kurumId}
            subeId={activeSube?.id}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreateNew={openCreate}
            refreshKey={treeRefreshKey}
            onLoaded={handleTreeLoaded}
          />
        </div>

        <div style={{ height: "calc(100vh - 180px)", minHeight: 480 }}>
          {selectedId ? (
            <MaliHesapDetailPanel
              kurumId={kurumId}
              maliHesapId={selectedId}
              refreshKey={panelRefreshKey}
              onToast={showToast}
              onEdit={openEdit}
              onDeleted={handleAccountDeleted}
              onChanged={handleChanged}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                <svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Bir mali hesap seçin</h3>
              <p className="text-sm text-gray-500 max-w-xs mb-5">
                Detaylarını görmek için soldaki listeden bir hesap seçin veya yeni bir mali hesap oluşturun.
              </p>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Yeni Mali Hesap
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {formOpen && formSubeId && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,.45)" }}
          onClick={closeForm}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <MaliHesapForm
              subeId={formSubeId}
              subeler={subelerOptions}
              editId={formEditId || undefined}
              onBack={closeForm}
              onSuccess={handleFormSuccess}
            />
          </div>
        </div>
      )}
      {formOpen && !formSubeId && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,.45)" }}
          onClick={closeForm}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm">
            <h4 className="text-base font-bold text-gray-800 mb-1">Şube Bulunamadı</h4>
            <p className="text-sm text-gray-500">Mali hesap oluşturmak için önce kuruma bir şube tanımlanmalı.</p>
            <button onClick={closeForm} className="mt-4 text-sm text-emerald-600 hover:underline cursor-pointer bg-transparent border-none">Kapat</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[3500] px-5 py-3.5 rounded-xl text-sm font-semibold text-white shadow-lg flex items-center gap-2
          ${toast.type === "success" ? "bg-gradient-to-r from-emerald-600 to-emerald-700" :
            toast.type === "error" ? "bg-gradient-to-r from-red-600 to-red-700" :
            "bg-gradient-to-r from-blue-600 to-blue-700"}`}>
          {toast.type === "success" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          {toast.type === "error" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
          {toast.type === "info" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          {toast.message}
        </div>
      )}
    </>
  );
}

export default function TanimlarClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="w-8 h-8 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" /></div>}>
      <TanimlarInner />
    </Suspense>
  );
}
