"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { personelAccessService, type MyKurumItem } from "@/lib/personel-access-api";
import {
  resolvePostKurumRedirect,
  STORAGE_KURUM,
  setContextGate,
} from "@/lib/post-login-routing";
import { setActiveContext } from "@/lib/api";

export default function KurumSecPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [kurumlar, setKurumlar] = useState<MyKurumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    personelAccessService
      .myKurumlar()
      .then(async (res) => {
        if (!res.needs_kurum_picker && res.kurumlar.length === 1) {
          const k = res.kurumlar[0];
          localStorage.setItem(STORAGE_KURUM, String(k.id));
          await setActiveContext(k.id, null, null);
          const next = await resolvePostKurumRedirect(user, k.id);
          router.replace(next);
          return;
        }
        if (!res.needs_kurum_picker && res.kurumlar.length > 0) {
          router.replace("/sube-sec");
          return;
        }
        setKurumlar(res.kurumlar);
        if (res.needs_kurum_picker && res.kurumlar.length > 1) {
          setContextGate("kurum");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kurum listesi yüklenemedi"))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  const handleSelect = async (kurum: MyKurumItem) => {
    setSubmitting(kurum.id);
    setError(null);
    try {
      localStorage.setItem(STORAGE_KURUM, String(kurum.id));
      await setActiveContext(kurum.id, null, null);
      window.dispatchEvent(new Event("3k:context-updated"));
      const next = await resolvePostKurumRedirect(user, kurum.id);
      router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kurum seçilemedi");
      setSubmitting(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="px-8 pt-8 pb-6 text-center border-b border-gray-50">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4 text-2xl">
            🏢
          </div>
          <h1 className="text-xl font-bold text-gray-900 m-0">Kurum Seçin</h1>
          <p className="text-sm text-gray-500 mt-2 mb-0">
            Birden fazla kurumda görevlisiniz. Devam etmek için çalışacağınız kurumu seçin.
          </p>
        </div>

        <div className="p-6 flex flex-col gap-3">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              {error}
            </div>
          )}

          {kurumlar.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              Erişilebilir kurum bulunamadı. Yöneticinize başvurun.
            </p>
          ) : (
            kurumlar.map((k) => (
              <button
                key={k.id}
                type="button"
                disabled={submitting !== null}
                onClick={() => handleSelect(k)}
                className="flex items-center justify-between w-full px-5 py-4 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left cursor-pointer disabled:opacity-50 bg-white"
              >
                <div>
                  <div className="text-sm font-bold text-gray-900">{k.ad}</div>
                  {k.kod && (
                    <div className="text-xs text-gray-400 mt-0.5">{k.kod}</div>
                  )}
                </div>
                {submitting === k.id ? (
                  <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin shrink-0" />
                ) : (
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
