"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveKimlik, type KimlikResolveResponse } from "@/lib/kimlik-api";
import { digitsOnlyPhone, flashHighlightedFields } from "@/lib/kimlik-form-utils";

const KIMLIK_CONFLICT_CODES = new Set([
  "duplicate_tc",
  "duplicate_telefon",
  "phone_tc_mismatch",
  "duplicate_personel_tc",
  "kimlik_conflict",
]);

type UseKimlikLookupOptions = {
  context: "personel" | "ogrenci" | "veli";
  enabled?: boolean;
  excludeKisiId?: number;
  tcDebounceMs?: number;
  phoneDebounceMs?: number;
};

export function isKimlikConflictCode(code?: string): boolean {
  return Boolean(code && KIMLIK_CONFLICT_CODES.has(code));
}

export function useKimlikLookup({
  context,
  enabled = true,
  excludeKisiId,
  tcDebounceMs = 350,
  phoneDebounceMs = 400,
}: UseKimlikLookupOptions) {
  const [result, setResult] = useState<KimlikResolveResponse | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());

  const tcDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const phoneDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (tcDebounceRef.current) clearTimeout(tcDebounceRef.current);
      if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
    };
  }, []);

  const runResolve = useCallback(
    async (params: { tc?: string; telefon?: string; openModal?: boolean; phoneErrorMessage?: string }) => {
      if (!enabled) return null;
      const tc = (params.tc || "").trim();
      const telDigits = digitsOnlyPhone(params.telefon || "");
      const tcValid = tc.length === 11;
      if (!tcValid && telDigits.length < 10) return null;

      setChecking(true);
      if (!params.phoneErrorMessage) setPhoneError("");
      setLookupError("");
      try {
        const res = await resolveKimlik({
          tc: tcValid ? tc : undefined,
          telefon: telDigits.length >= 10 ? telDigits : undefined,
          context,
          exclude_kisi_id: excludeKisiId,
        });
        if (!res.success) {
          setLookupError(res.error || "Kimlik kontrolü yapılamadı. Kurum/şube seçimini kontrol edin.");
          return null;
        }
        const data = res.data ?? null;
        if (data?.found) {
          setResult(data);
          if (params.openModal !== false) setShowModal(true);
          if (data.engellenen) {
            setPhoneError(data.engellenen_mesaj || params.phoneErrorMessage || "Bu kayıt tamamlanamaz.");
          } else {
            setPhoneError("");
          }
        } else if (params.phoneErrorMessage) {
          setPhoneError("");
        }
        return data;
      } finally {
        setChecking(false);
      }
    },
    [context, enabled, excludeKisiId],
  );

  const checkTc = useCallback(
    (tc: string, telefon?: string) => {
      if (!enabled || tc.length !== 11) return;
      if (tcDebounceRef.current) clearTimeout(tcDebounceRef.current);
      tcDebounceRef.current = setTimeout(() => {
        void runResolve({ tc, telefon });
      }, tcDebounceMs);
    },
    [enabled, runResolve, tcDebounceMs],
  );

  const checkPhone = useCallback(
    (telefon: string) => {
      const digits = digitsOnlyPhone(telefon);
      if (!enabled || digits.length < 10) {
        setPhoneError("");
        return;
      }
      if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
      phoneDebounceRef.current = setTimeout(() => {
        void runResolve({ telefon: digits });
      }, phoneDebounceMs);
    },
    [enabled, phoneDebounceMs, runResolve],
  );

  const openConflictLookup = useCallback(
    async (tc?: string, telefon?: string) => {
      const data = await runResolve({ tc, telefon, openModal: true });
      return data;
    },
    [runResolve],
  );

  const dismissModal = useCallback(() => setShowModal(false), []);

  const resetKimlik = useCallback(() => {
    setResult(null);
    setShowModal(false);
    setPhoneError("");
    setLookupError("");
    setHighlightedFields(new Set());
  }, []);

  const markHighlighted = useCallback((fields: string[]) => {
    flashHighlightedFields(fields, setHighlightedFields);
  }, []);

  const applyDisabled = Boolean(result?.engellenen);

  return {
    result,
    setResult,
    showModal,
    setShowModal,
    checking,
    phoneError,
    setPhoneError,
    lookupError,
    highlightedFields,
    applyDisabled,
    isBlocked: applyDisabled,
    checkTc,
    checkPhone,
    runResolve,
    openConflictLookup,
    dismissModal,
    resetKimlik,
    markHighlighted,
  };
}
