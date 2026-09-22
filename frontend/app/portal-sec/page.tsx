"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { activatePortal, portalHomePath, type PortalView } from "@/lib/profile-api";
import { clearContextGate } from "@/lib/post-login-routing";

const PORTAL_COPY: Record<PortalView, { icon: string; hint: string }> = {
  admin: { icon: "🏛️", hint: "Kurum, personel ve yönetim ekranları" },
  coach: { icon: "🎯", hint: "Öğrenciler, ödev ve koçluk" },
  muhasebe: { icon: "📒", hint: "Finans ve tahsilat" },
};

export default function PortalSecPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, checkAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<PortalView | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  const portals = (user.portals ?? []).filter(
    (portal): portal is { code: PortalView; label: string } =>
      portal.code === "admin" || portal.code === "coach" || portal.code === "muhasebe",
  );

  const handleSelect = async (code: PortalView) => {
    setSubmitting(code);
    setError(null);
    const res = await activatePortal(code);
    if (!res.success) {
      setError(res.error || "Panel seçilemedi");
      setSubmitting(null);
      return;
    }
    clearContextGate();
    await checkAuth();
    window.location.assign(portalHomePath(code));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="px-8 pt-8 pb-6 text-center border-b border-gray-50">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4 text-2xl">
            🗂️
          </div>
          <h1 className="text-xl font-bold text-gray-900 m-0">Panel Seçin</h1>
          <p className="text-sm text-gray-500 mt-2 mb-0">
            Birden fazla göreviniz var. Devam etmek için çalışacağınız paneli seçin. Seçiminiz hatırlanır.
          </p>
        </div>

        <div className="p-6 flex flex-col gap-3">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              {error}
            </div>
          )}

          {portals.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              Açılabilir panel bulunamadı. Yöneticinize başvurun.
            </p>
          ) : (
            portals.map((portal) => {
              const copy = PORTAL_COPY[portal.code];
              const busy = submitting === portal.code;
              return (
                <button
                  key={portal.code}
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => handleSelect(portal.code)}
                  className="w-full text-left px-4 py-4 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition disabled:opacity-60"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden>{copy.icon}</span>
                    <span>
                      <span className="block font-semibold text-gray-900">{portal.label}</span>
                      <span className="block text-sm text-gray-500 mt-0.5">{copy.hint}</span>
                    </span>
                    {busy && <span className="ml-auto text-sm text-emerald-700">Açılıyor…</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
