"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { getDefaultHomePath } from "@/lib/auth-routes";
import { personelAccessService, type MySubeItem } from "@/lib/personel-access-api";
import { setActiveContext } from "@/lib/api";
import { STORAGE_KURUM, STORAGE_SUBE } from "@/lib/post-login-routing";

function readStoredKurumId(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = localStorage.getItem(STORAGE_KURUM);
  if (!raw) return undefined;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : undefined;
}

export default function SubeSecPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [subeler, setSubeler] = useState<MySubeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [isAdminPicker, setIsAdminPicker] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    const kurumId = readStoredKurumId();

    personelAccessService
      .mySubeler(kurumId ? { kurum_id: kurumId } : undefined)
      .then((res) => {
        const mustSelectSube =
          res.requires_login_sube_selection || res.needs_sube_picker;

        setIsAdminPicker(res.requires_login_sube_selection);

        if (!mustSelectSube && res.subeler.length > 0) {
          router.replace(getDefaultHomePath(user));
          return;
        }

        if (mustSelectSube && res.subeler.length === 1) {
          const s = res.subeler[0];
          localStorage.setItem(STORAGE_SUBE, String(s.id));
          localStorage.setItem(STORAGE_KURUM, String(s.kurum_id));
          setActiveContext(s.kurum_id, s.id, null).finally(() => {
            router.replace(getDefaultHomePath(user));
          });
          return;
        }

        if (mustSelectSube && res.subeler.length === 0) {
          setSubeler([]);
          return;
        }

        setSubeler(res.subeler);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Şube listesi yüklenemedi"))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  const handleSelect = async (sube: MySubeItem) => {
    setSubmitting(sube.id);
    setError(null);
    try {
      localStorage.setItem(STORAGE_SUBE, String(sube.id));
      localStorage.setItem(STORAGE_KURUM, String(sube.kurum_id));
      await setActiveContext(sube.kurum_id, sube.id, null);
      router.replace(getDefaultHomePath(user));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Şube seçilemedi");
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
            🏫
          </div>
          <h1 className="text-xl font-bold text-gray-900 m-0">Şube Seçin</h1>
          <p className="text-sm text-gray-500 mt-2 mb-0">
            {isAdminPicker
              ? "Devam etmek için çalışacağınız şubeyi seçin."
              : "Birden fazla şubede görevlisiniz. Devam etmek için çalışacağınız şubeyi seçin."}
          </p>
        </div>

        <div className="p-6 flex flex-col gap-3">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              {error}
            </div>
          )}

          {subeler.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              Erişilebilir şube bulunamadı. Yöneticinize başvurun.
            </p>
          ) : (
            subeler.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={submitting !== null}
                onClick={() => handleSelect(s)}
                className="flex items-center justify-between w-full px-5 py-4 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left cursor-pointer disabled:opacity-50 bg-white"
              >
                <div>
                  <div className="text-sm font-bold text-gray-900">{s.ad}</div>
                  {s.kurum_ad && (
                    <div className="text-xs text-gray-400 mt-0.5">{s.kurum_ad}</div>
                  )}
                </div>
                {submitting === s.id ? (
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
