"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createOkul,
  fetchOkulAutocomplete,
  type OkulAutocompleteItem,
  type OkulFormData,
} from "@/lib/okul-api";

type SchoolAutocompleteProps = {
  value: number | null;
  displayValue: string;
  label: string;
  placeholder?: string;
  onChange: (schoolId: number | null, schoolAd: string) => void;
  disabled?: boolean;
};

const EMPTY_FORM: OkulFormData = {
  ad: "",
  okul_turu: "",
  il: "",
  ilce: "",
  not_metni: "",
  aktif_mi: true,
};

export default function SchoolAutocomplete({
  value,
  displayValue,
  label,
  placeholder = "Okul adı yazarak arayın",
  onChange,
  disabled = false,
}: SchoolAutocompleteProps) {
  const [query, setQuery] = useState(displayValue);
  const [results, setResults] = useState<OkulAutocompleteItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickForm, setQuickForm] = useState<OkulFormData>(EMPTY_FORM);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(displayValue);
  }, [displayValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const items = await fetchOkulAutocomplete(q);
      setResults(items);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (text: string) => {
    setQuery(text);
    if (value) {
      onChange(null, text);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 250);
  };

  const handleSelect = (item: OkulAutocompleteItem) => {
    onChange(item.id, item.ad);
    setQuery(item.ad);
    setOpen(false);
  };

  const openQuickAdd = () => {
    setQuickForm({ ...EMPTY_FORM, ad: query.trim() });
    setQuickError(null);
    setShowQuickAdd(true);
    setOpen(false);
  };

  const handleQuickSave = async () => {
    if (!quickForm.ad.trim()) {
      setQuickError("Okul adı zorunludur.");
      return;
    }
    setQuickSaving(true);
    setQuickError(null);
    try {
      const created = await createOkul(quickForm);
      onChange(created.id, created.ad);
      setQuery(created.ad);
      setShowQuickAdd(false);
      setQuickForm(EMPTY_FORM);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Okul eklenemedi.";
      setQuickError(message);
    } finally {
      setQuickSaving(false);
    }
  };

  return (
    <>
      <div className="wizard-field" ref={wrapperRef}>
        <label className="wizard-label">{label}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="text"
              className="wizard-input"
              value={query}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => {
                if (query.trim()) runSearch(query);
                else runSearch("");
              }}
              autoComplete="off"
            />
            {open && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 220,
                  overflowY: "auto",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              >
                {loading && (
                  <div style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280" }}>Aranıyor…</div>
                )}
                {!loading && results.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280" }}>Sonuç bulunamadı</div>
                )}
                {!loading &&
                  results.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "none",
                        background: value === item.id ? "#eff6ff" : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {item.ad}
                      {item.okul_turu ? (
                        <span style={{ color: "#6b7280", marginLeft: 8 }}>{item.okul_turu}</span>
                      ) : null}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="wizard-btn secondary"
            onClick={openQuickAdd}
            disabled={disabled}
            title="Yeni Okul Ekle"
            style={{ minWidth: 40, padding: "0 12px", fontSize: 18, lineHeight: 1 }}
          >
            +
          </button>
        </div>
      </div>

      {showQuickAdd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => !quickSaving && setShowQuickAdd(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 440,
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: "0 0 16px", fontSize: 16 }}>Hızlı Okul Ekle</h4>
            <div className="wizard-form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="wizard-field">
                <label className="wizard-label required">Okul Adı</label>
                <input
                  className="wizard-input"
                  value={quickForm.ad}
                  onChange={(e) => setQuickForm({ ...quickForm, ad: e.target.value })}
                />
              </div>
              <div className="wizard-field">
                <label className="wizard-label">Okul Türü</label>
                <input
                  className="wizard-input"
                  value={quickForm.okul_turu || ""}
                  onChange={(e) => setQuickForm({ ...quickForm, okul_turu: e.target.value })}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="wizard-field">
                  <label className="wizard-label">İl</label>
                  <input
                    className="wizard-input"
                    value={quickForm.il || ""}
                    onChange={(e) => setQuickForm({ ...quickForm, il: e.target.value })}
                  />
                </div>
                <div className="wizard-field">
                  <label className="wizard-label">İlçe</label>
                  <input
                    className="wizard-input"
                    value={quickForm.ilce || ""}
                    onChange={(e) => setQuickForm({ ...quickForm, ilce: e.target.value })}
                  />
                </div>
              </div>
            </div>
            {quickError && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{quickError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="wizard-btn secondary"
                disabled={quickSaving}
                onClick={() => setShowQuickAdd(false)}
              >
                İptal
              </button>
              <button type="button" className="wizard-btn primary" disabled={quickSaving} onClick={handleQuickSave}>
                {quickSaving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
