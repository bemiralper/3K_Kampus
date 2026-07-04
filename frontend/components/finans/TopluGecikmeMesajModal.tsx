"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { overdueService } from "@/app/finans/services/overdue-api";
import type { OverduePaymentItem, OverdueReminderRecipient } from "@/app/finans/types/overdue-types";

const TEMPLATE_STORAGE_KEY = "finans_gecikme_sablon_v1";

const DEFAULT_TEMPLATE = `Sayın {veli_ad},

{ogrenci_ad} için {gecikme_gunu} gündür geciken {kalan_tutar} TL tutarındaki {taksit_no}. taksit ödemeniz bulunmaktadır.

Sözleşme No: {sozlesme_no}
Toplam gecikmiş tutar: {toplam_gecikmis_tutar} TL

Lütfen en kısa sürede ödemenizi gerçekleştiriniz.

{kurum_ad}`;

interface TopluGecikmeMesajModalProps {
  selectedItems: OverduePaymentItem[];
  kurumAd?: string;
  onClose: () => void;
  onSent?: (sent: number) => void;
}

type Step = 1 | 2 | 3;

export default function TopluGecikmeMesajModal({
  selectedItems,
  kurumAd,
  onClose,
  onSent,
}: TopluGecikmeMesajModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [recipients, setRecipients] = useState<OverdueReminderRecipient[]>([]);
  const [sendResults, setSendResults] = useState<{ sent: number; skipped: number; errors: string[] } | null>(null);
  const [forceResend, setForceResend] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (saved) setTemplate(saved);
    }
  }, []);

  const taksitIds = useMemo(() => selectedItems.map((i) => i.taksit_id), [selectedItems]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await overdueService.previewReminders({ taksit_ids: taksitIds, template });
      setRecipients(res.recipients || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Önizleme yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [taksitIds, template]);

  useEffect(() => {
    if (step === 1 || step === 2) {
      loadPreview();
    }
  }, [step, loadPreview]);

  const sendable = recipients.filter((r) => !r.skip_reason && r.telefon);
  const skipped = recipients.filter((r) => r.skip_reason || !r.telefon);
  const alreadySent = recipients.filter((r) => r.already_sent_24h);

  const groupedByVeli = useMemo(() => {
    const map = new Map<string, OverdueReminderRecipient[]>();
    for (const r of recipients) {
      const key = r.veli_adi || r.ogrenci_adi;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [recipients]);

  const handleSend = async () => {
    setSending(true);
    setError("");
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, template);
      const res = await overdueService.sendReminders({
        taksit_ids: taksitIds,
        template,
        force_resend: forceResend,
      });
      setSendResults({ sent: res.sent, skipped: res.skipped, errors: res.errors || [] });
      setStep(3);
      onSent?.(res.sent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim başarısız");
    } finally {
      setSending(false);
    }
  };

  const previewSample = sendable[0]?.rendered_body || recipients[0]?.rendered_body || "";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(15,23,42,0.55)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 720,
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                Toplu Gecikme Mesajı
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                {selectedItems.length} taksit seçili · Adım {step}/3
                {kurumAd ? ` · ${kurumAd}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}
            >
              ×
            </button>
          </div>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {(["Alıcılar", "Şablon", "Sonuç"] as const).map((label, i) => (
              <div
                key={label}
                style={{
                  flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: step === i + 1 ? "#2563eb" : step > i + 1 ? "#dbeafe" : "#f1f5f9",
                  color: step === i + 1 ? "#fff" : step > i + 1 ? "#1d4ed8" : "#94a3b8",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {error && (
            <div style={{ padding: 10, background: "#fef2f2", borderRadius: 8, color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {loading && step !== 3 && (
            <p style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 24 }}>Yükleniyor…</p>
          )}

          {/* Step 1: Recipients */}
          {step === 1 && !loading && (
            <div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <StatPill label="Gönderilebilir" value={sendable.length} color="#059669" />
                <StatPill label="Telefon eksik" value={skipped.filter((r) => !r.telefon).length} color="#dc2626" />
                <StatPill label="24s içinde gönderildi" value={alreadySent.length} color="#d97706" />
              </div>
              {groupedByVeli.map(([veli, items]) => (
                <div key={veli} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{veli}</div>
                  {items.map((r) => (
                    <div key={r.taksit_id} style={{ fontSize: 11, color: r.skip_reason || !r.telefon ? "#dc2626" : "#64748b", marginTop: 4 }}>
                      {r.ogrenci_adi} · {r.telefon || "Telefon yok"}
                      {r.skip_reason && ` · ${r.skip_reason}`}
                      {r.already_sent_24h && " · Son 24 saatte gönderildi"}
                    </div>
                  ))}
                </div>
              ))}
              {alreadySent.length > 0 && (
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 12, color: "#92400e" }}>
                  <input type="checkbox" checked={forceResend} onChange={(e) => setForceResend(e.target.checked)} />
                  Son 24 saatte gönderilenlere yine de gönder
                </label>
              )}
            </div>
          )}

          {/* Step 2: Template */}
          {step === 2 && !loading && (
            <div>
              <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Değişkenler: {"{veli_ad}"}, {"{ogrenci_ad}"}, {"{sozlesme_no}"}, {"{taksit_no}"}, {"{vade_tarihi}"}, {"{kalan_tutar}"}, {"{gecikme_gunu}"}, {"{toplam_gecikmis_tutar}"}, {"{kurum_ad}"}
              </p>
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={8}
                style={{
                  width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0",
                  fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
                }}
              />
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Önizleme (ilk alıcı)</div>
                <pre style={{
                  margin: 0, fontSize: 11, color: "#475569", whiteSpace: "pre-wrap",
                  background: "#f8fafc", padding: 12, borderRadius: 8, fontFamily: "inherit",
                }}>
                  {previewSample || "Önizleme yok"}
                </pre>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {step === 3 && sendResults && (
            <div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <StatPill label="Gönderildi" value={sendResults.sent} color="#059669" />
                <StatPill label="Atlandı" value={sendResults.skipped} color="#d97706" />
                <StatPill label="Hata" value={sendResults.errors.length} color="#dc2626" />
              </div>
              {sendResults.errors.length > 0 && (
                <div style={{ background: "#fef2f2", padding: 12, borderRadius: 8, fontSize: 12, color: "#991b1b" }}>
                  {sendResults.errors.map((err, i) => <div key={i}>{err}</div>)}
                </div>
              )}
              {sendResults.sent > 0 && (
                <p style={{ fontSize: 13, color: "#059669", marginTop: 12 }}>
                  {sendResults.sent} kişiye WhatsApp mesajı kuyruğa alındı.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {step === 3 ? (
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              Kapat
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
              >
                İptal
              </button>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  disabled={sending}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                >
                  Geri
                </button>
              )}
              {step < 2 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={loading || sendable.length === 0}
                  style={{
                    padding: "8px 20px", borderRadius: 8, border: "none",
                    background: sendable.length === 0 ? "#93c5fd" : "#2563eb",
                    color: "#fff", fontWeight: 600, cursor: sendable.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  Devam ({sendable.length} alıcı)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || sendable.length === 0}
                  style={{
                    padding: "8px 20px", borderRadius: 8, border: "none",
                    background: sending || sendable.length === 0 ? "#86efac" : "#25D366",
                    color: "#fff", fontWeight: 600, cursor: sending ? "wait" : "pointer",
                  }}
                >
                  {sending ? "Gönderiliyor…" : `${sendable.length} kişiye gönder`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: "8px 14px", borderRadius: 10, background: `${color}12`, border: `1px solid ${color}33` }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}
