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
  /** Modal kapatıldıktan / kişi seçildikten sonra aynı numara için tekrar açma. */
  const suppressedPhoneRef = useRef<string | null>(null);
  const resolveSeqRef = useRef(0);

  const clearPendingLookups = useCallback(() => {
    if (tcDebounceRef.current) {
      clearTimeout(tcDebounceRef.current);
      tcDebounceRef.current = null;
    }
    if (phoneDebounceRef.current) {
      clearTimeout(phoneDebounceRef.current);
      phoneDebounceRef.current = null;
    }
    resolveSeqRef.current += 1;
  }, []);

  useEffect(() => {
    return () => {
      clearPendingLookups();
    };
  }, [clearPendingLookups]);

  const runResolve = useCallback(
    async (params: { tc?: string; telefon?: string; openModal?: boolean; phoneErrorMessage?: string }) => {
      if (!enabled) return null;
      const tc = (params.tc || "").trim();
      const telDigits = digitsOnlyPhone(params.telefon || "");
      const tcValid = tc.length === 11;
      if (!tcValid && telDigits.length < 10) return null;

      // Kullanıcı numarayı değiştirmeyi seçtiyse / kişiyi kullandıysa aynı telefonu tekrar sorma
      if (
        params.openModal !== false &&
        telDigits &&
        suppressedPhoneRef.current &&
        telDigits === suppressedPhoneRef.current
      ) {
        return null;
      }

      const seq = ++resolveSeqRef.current;
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
        if (seq !== resolveSeqRef.current) return null;
        if (!res.success) {
          setLookupError(res.error || "Kimlik kontrolü yapılamadı. Kurum/şube seçimini kontrol edin.");
          return null;
        }
        const data = res.data ?? null;
        if (data?.found) {
          setResult(data);
          const shouldOpen =
            params.openModal !== false &&
            !(telDigits && suppressedPhoneRef.current === telDigits);
          if (shouldOpen) setShowModal(true);
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
        if (seq === resolveSeqRef.current) setChecking(false);
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
        // Kısa/silinmiş numara → bastırmayı kaldır (yeni numara yazılabilsin)
        if (!digits || digits.length < 10) {
          suppressedPhoneRef.current = null;
        }
        return;
      }
      // Bastırılmış numaradan farklı bir şey yazıldıysa tekrar kontrol et
      if (suppressedPhoneRef.current && digits !== suppressedPhoneRef.current) {
        suppressedPhoneRef.current = null;
      }
      if (suppressedPhoneRef.current && digits === suppressedPhoneRef.current) {
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
      suppressedPhoneRef.current = null;
      const data = await runResolve({ tc, telefon, openModal: true });
      return data;
    },
    [runResolve],
  );

  const dismissModal = useCallback(() => {
    clearPendingLookups();
    setShowModal(false);
  }, [clearPendingLookups]);

  /** «Numarayı değiştir» — modalı kapat, aynı numarayı tekrar sorma. Formda telefonu temizleyin. */
  const dismissForChangeNumber = useCallback(
    (telefon?: string) => {
      const digits = digitsOnlyPhone(telefon || "");
      clearPendingLookups();
      if (digits.length >= 10) suppressedPhoneRef.current = digits;
      setShowModal(false);
      setResult(null);
      setPhoneError("");
    },
    [clearPendingLookups],
  );

  /** «Mevcut kişiyi kullan» sonrası blur ile modalın yeniden açılmasını engelle. */
  const acceptLookup = useCallback(
    (telefon?: string) => {
      const digits = digitsOnlyPhone(telefon || "");
      clearPendingLookups();
      if (digits.length >= 10) suppressedPhoneRef.current = digits;
      setShowModal(false);
      setPhoneError("");
    },
    [clearPendingLookups],
  );

  const resetKimlik = useCallback(() => {
    clearPendingLookups();
    suppressedPhoneRef.current = null;
    setResult(null);
    setShowModal(false);
    setPhoneError("");
    setLookupError("");
    setHighlightedFields(new Set());
  }, [clearPendingLookups]);

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
    dismissForChangeNumber,
    acceptLookup,
    resetKimlik,
    markHighlighted,
  };
}
