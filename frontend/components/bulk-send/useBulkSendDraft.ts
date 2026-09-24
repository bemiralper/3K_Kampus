"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  emptyAudienceQuery,
  hasIncluded,
} from "@/app/admin/iletisim/toplu-gonder/audience-utils";
import {
  AudienceCatalog,
  AudienceFilter,
  AudiencePersonType,
  AudienceQueryPreview,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
  fetchAccessibleWhatsAppAccounts,
  fetchAudienceCatalog,
  previewAudienceQuery,
} from "@/lib/communication-api";

export type BulkSendMode = "admin" | "coach" | "muhasebe";

interface PersistedDraft {
  query: AudienceFilter;
  title: string;
  templateName: string;
  templateLanguage: string;
  variableValues: Record<string, string>;
  accountId: string;
  savedAt: string;
}

const PREVIEW_DEBOUNCE_MS = 260;
const DRAFT_DEBOUNCE_MS = 500;

function draftKey(mode: BulkSendMode) {
  return `bs-draft:${mode}`;
}

function readDraft(mode: BulkSendMode): PersistedDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDraft;
    if (!parsed?.query) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Toplu gönderim stüdyosunun tüm durumunu tek yerde tutar:
 * kitle sorgusu + canlı önizleme (debounce), şablon/değişken/hesap, taslak kalıcılığı.
 * Bileşenler yalnız görünümle uğraşır.
 */
export function useBulkSendDraft(mode: BulkSendMode) {
  const isCoach = mode === "coach";
  const restored = useRef<PersistedDraft | null>(null);
  if (restored.current === null && typeof window !== "undefined") {
    restored.current = readDraft(mode) ?? ({} as PersistedDraft);
  }
  const initial = restored.current && restored.current.query ? restored.current : null;

  const [query, setQuery] = useState<AudienceFilter>(
    () => initial?.query ?? emptyAudienceQuery(isCoach ? ["ogrenci"] : []),
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [templateName, setTemplateName] = useState(initial?.templateName ?? "");
  const [templateLanguage, setTemplateLanguage] = useState(initial?.templateLanguage ?? "tr");
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppMetaTemplateItem | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>(initial?.variableValues ?? {});
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [restoredFromDraft, setRestoredFromDraft] = useState(!!initial);

  const [catalog, setCatalog] = useState<AudienceCatalog | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [preview, setPreview] = useState<AudienceQueryPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const personTypes = useMemo(
    () => (query.person_types || []) as AudiencePersonType[],
    [query.person_types],
  );
  const personTypesKey = personTypes.join("|");

  // Katalog: kişi türü değişince
  useEffect(() => {
    let cancelled = false;
    fetchAudienceCatalog(personTypes.length ? personTypes : undefined)
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch(() => { if (!cancelled) setCatalog(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personTypesKey]);

  // Hesaplar: bir kez
  useEffect(() => {
    let cancelled = false;
    fetchAccessibleWhatsAppAccounts()
      .then((res) => {
        if (cancelled) return;
        const list = res.accounts || [];
        setAccounts(list);
        setAccountId((prev) => prev || res.default_account_id || list[0]?.id || "");
      })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, []);

  // Canlı önizleme (debounce, yarış koruması)
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!personTypes.length && !hasIncluded(query)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const seq = ++previewSeq.current;
    const id = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await previewAudienceQuery(query);
        if (seq === previewSeq.current) {
          setPreview(res);
          setPreviewError(null);
        }
      } catch (err) {
        if (seq === previewSeq.current) {
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : "Kitle hesaplanamadı");
        }
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, personTypes.length]);

  // Taslak kalıcılığı
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const payload: PersistedDraft = {
        query, title, templateName, templateLanguage, variableValues, accountId,
        savedAt: new Date().toISOString(),
      };
      try {
        window.sessionStorage.setItem(draftKey(mode), JSON.stringify(payload));
      } catch {
        /* depolama dolu / kapalı — sessizce geç */
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [mode, query, title, templateName, templateLanguage, variableValues, accountId]);

  const reset = useCallback(() => {
    setQuery(emptyAudienceQuery(isCoach ? ["ogrenci"] : []));
    setTitle("");
    setTemplateName("");
    setTemplateLanguage("tr");
    setSelectedTemplate(null);
    setVariableValues({});
    setRestoredFromDraft(false);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(draftKey(mode));
  }, [isCoach, mode]);

  const onTemplateChange = useCallback(
    (name: string, language: string, tpl: WhatsAppMetaTemplateItem | null) => {
      setTemplateName(name);
      setTemplateLanguage(language || "tr");
      setSelectedTemplate(tpl);
    },
    [],
  );

  return {
    isCoach,
    query, setQuery, personTypes,
    title, setTitle,
    templateName, templateLanguage, selectedTemplate, onTemplateChange,
    variableValues, setVariableValues,
    accountId, setAccountId, accounts,
    catalog,
    preview, previewLoading, previewError,
    restoredFromDraft, dismissRestored: () => setRestoredFromDraft(false),
    reset,
  };
}

export type BulkSendDraft = ReturnType<typeof useBulkSendDraft>;
