"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import {
  MessageTemplateItem,
  NotificationEventCatalog,
  NotificationEventItem,
  NotificationEventSlot,
  NotificationPreviewResult,
  NotificationSendMode,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
  deleteNotificationBinding,
  fetchLocalMetaTemplates,
  fetchNotificationEvents,
  fetchTemplates,
  fetchWhatsAppAccounts,
  previewNotificationBinding,
  saveNotificationBinding,
} from "@/lib/communication-api";

const RECIPIENT_LABELS: Record<string, string> = {
  VELI: "Veli",
  OGRENCI: "Öğrenci",
  PERSONEL: "Personel",
};

const readActiveSubeId = (): number | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("3k_active_sube");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const headerTypeOf = (tpl: WhatsAppMetaTemplateItem): string =>
  ((tpl.header_json as { type?: string } | undefined)?.type || "").toUpperCase();

const slotHasCustomBinding = (slot: NotificationEventSlot): boolean =>
  Boolean(
    slot.binding &&
      (slot.binding.meta_template_id ||
        slot.binding.message_template_id ||
        (slot.binding.send_mode && slot.binding.send_mode !== "AUTO")),
  );

export default function BildirimSablonlariClient() {
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState<NotificationEventCatalog | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [lmsTemplates, setLmsTemplates] = useState<MessageTemplateItem[]>([]);
  const [activeSubeId, setActiveSubeId] = useState<number | null>(null);

  const [scopeSube, setScopeSube] = useState(false);
  const [scopeAccountId, setScopeAccountId] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("");
  const [selectedEventKey, setSelectedEventKey] = useState<string>("");
  const [urlEventApplied, setUrlEventApplied] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, NotificationPreviewResult>>({});

  useEffect(() => {
    setActiveSubeId(readActiveSubeId());
  }, []);

  const scopeSubeId = scopeSube ? activeSubeId : null;
  const scopeChannelConfigId = scopeAccountId || null;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotificationEvents({
        sube_id: scopeSubeId,
        channel_config_id: scopeChannelConfigId,
      });
      setCatalog(data);
      setPreviews({});
      setSelectedModule((current) => {
        if (current && data.modules.some((m) => m.key === current)) return current;
        return data.modules[0]?.key || "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildirim olayları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [scopeSubeId, scopeChannelConfigId]);

  useEffect(() => {
    if (!catalog || urlEventApplied) return;
    const eventKey = (searchParams.get("event") || "").trim();
    if (!eventKey) {
      setUrlEventApplied(true);
      return;
    }
    const match = catalog.events.find((e) => e.key === eventKey);
    if (match) {
      setSelectedModule(match.module);
      setSelectedEventKey(match.key);
    }
    setUrlEventApplied(true);
  }, [catalog, searchParams, urlEventApplied]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const reloadTemplateLists = useCallback(async () => {
    try {
      const [acc, meta, lms] = await Promise.all([
        fetchWhatsAppAccounts({ activeOnly: true }),
        // Bağlamada taslak/pending de seçilebilsin (gönderim yine APPROVED ister)
        fetchLocalMetaTemplates(),
        fetchTemplates(),
      ]);
      setAccounts(acc.accounts || []);
      setMetaTemplates(meta.templates || []);
      setLmsTemplates((lms.templates || []).filter((t) => t.is_active));
    } catch {
      // şablon listeleri yüklenemezse ekran yine de çalışır
    }
  }, []);

  useEffect(() => {
    void reloadTemplateLists();
  }, [reloadTemplateLists]);

  const events = catalog?.events || [];
  const moduleEvents = useMemo(
    () => events.filter((e) => !selectedModule || e.module === selectedModule),
    [events, selectedModule],
  );

  useEffect(() => {
    setSelectedEventKey((current) => {
      if (current && moduleEvents.some((e) => e.key === current)) return current;
      return moduleEvents[0]?.key || "";
    });
  }, [moduleEvents]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.key === selectedEventKey) || null,
    [events, selectedEventKey],
  );

  const metaOptionsFor = useCallback(
    (event: NotificationEventItem) => {
      const scoped = scopeAccountId
        ? metaTemplates.filter((t) => t.channel_config === scopeAccountId)
        : metaTemplates;
      let list = scoped;
      if (event.has_image) {
        list = scoped.filter((t) => headerTypeOf(t) === "IMAGE");
      } else if (event.has_document) {
        list = scoped.filter((t) => headerTypeOf(t) === "DOCUMENT");
      }
      return [...list].sort((a, b) => {
        const aOk = a.status === "APPROVED" ? 0 : 1;
        const bOk = b.status === "APPROVED" ? 0 : 1;
        if (aOk !== bOk) return aOk - bOk;
        return a.name.localeCompare(b.name, "tr");
      });
    },
    [metaTemplates, scopeAccountId],
  );

  const lmsOptionsFor = useCallback(
    (event: NotificationEventItem) => {
      const base = event.meta_name_base || "";
      return [...lmsTemplates].sort((a, b) => {
        const aHit = base && a.name.toLowerCase().includes(base.replace(/_/g, " "))
          ? 0
          : base && a.name.toLowerCase().includes(base.split("_")[0] || "")
            ? 1
            : 2;
        const bHit = base && b.name.toLowerCase().includes(base.replace(/_/g, " "))
          ? 0
          : base && b.name.toLowerCase().includes(base.split("_")[0] || "")
            ? 1
            : 2;
        if (aHit !== bHit) return aHit - bHit;
        return a.name.localeCompare(b.name, "tr");
      });
    },
    [lmsTemplates],
  );

  const slotKey = (eventKey: string, recipientType: string) => `${eventKey}:${recipientType}`;

  const persist = useCallback(
    async (
      event: NotificationEventItem,
      slot: NotificationEventSlot,
      patch: Partial<{
        meta_template_id: string | null;
        message_template_id: string | null;
        send_mode: NotificationSendMode;
        is_active: boolean;
      }>,
    ) => {
      const key = slotKey(event.key, slot.recipient_type);
      setSavingSlot(key);
      setError(null);
      setMessage(null);
      const next = {
        meta_template_id: slot.binding?.meta_template_id ?? null,
        message_template_id: slot.binding?.message_template_id ?? null,
        send_mode: (slot.binding?.send_mode ?? "AUTO") as NotificationSendMode,
        is_active: slot.binding?.is_active ?? true,
        ...patch,
      };
      // Boş + AUTO → özel tanımı sil (null binding satırı bırakma)
      const isEmptyDefault =
        !next.meta_template_id &&
        !next.message_template_id &&
        (next.send_mode === "AUTO" || !next.send_mode) &&
        next.is_active !== false;

      try {
        if (isEmptyDefault && slot.binding) {
          await deleteNotificationBinding({
            event_key: event.key,
            recipient_type: slot.recipient_type,
            sube_id: scopeSubeId,
            channel_config_id: scopeChannelConfigId,
          });
          setMessage(`${event.label} — ${RECIPIENT_LABELS[slot.recipient_type]} varsayılana döndü.`);
        } else if (isEmptyDefault && !slot.binding) {
          setMessage("Zaten varsayılan ayar kullanılıyor.");
        } else {
          await saveNotificationBinding({
            event_key: event.key,
            recipient_type: slot.recipient_type,
            sube_id: scopeSubeId,
            channel_config_id: scopeChannelConfigId,
            ...next,
          });
          setMessage(`${event.label} — ${RECIPIENT_LABELS[slot.recipient_type]} güncellendi.`);
        }
        await loadCatalog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eşleme kaydedilemedi.");
      } finally {
        setSavingSlot("");
      }
    },
    [scopeSubeId, scopeChannelConfigId, loadCatalog],
  );

  const resetSlot = useCallback(
    async (event: NotificationEventItem, slot: NotificationEventSlot) => {
      const key = slotKey(event.key, slot.recipient_type);
      setSavingSlot(key);
      setError(null);
      setMessage(null);
      try {
        await deleteNotificationBinding({
          event_key: event.key,
          recipient_type: slot.recipient_type,
          sube_id: scopeSubeId,
          channel_config_id: scopeChannelConfigId,
        });
        setMessage(`${event.label} — ${RECIPIENT_LABELS[slot.recipient_type]} varsayılana döndü.`);
        await loadCatalog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eşleme silinemedi.");
      } finally {
        setSavingSlot("");
      }
    },
    [scopeSubeId, scopeChannelConfigId, loadCatalog],
  );

  const loadPreview = useCallback(
    async (event: NotificationEventItem, slot: NotificationEventSlot) => {
      const key = slotKey(event.key, slot.recipient_type);
      try {
        const result = await previewNotificationBinding({
          event_key: event.key,
          recipient_type: slot.recipient_type,
          sube_id: scopeSubeId,
          channel_config_id: scopeChannelConfigId,
        });
        setPreviews((prev) => ({ ...prev, [key]: result }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Önizleme alınamadı.");
      }
    },
    [scopeSubeId, scopeChannelConfigId],
  );

  // Seçili olayın slotları için otomatik önizleme
  useEffect(() => {
    if (!selectedEvent) return;
    let cancelled = false;
    (async () => {
      for (const slot of selectedEvent.slots) {
        if (cancelled) return;
        await loadPreview(selectedEvent, slot);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent, loadPreview]);

  const scopeLabel = scopeSube && activeSubeId
    ? scopeAccountId
      ? "Şube + WhatsApp hesabı"
      : "Şube"
    : scopeAccountId
      ? "WhatsApp hesabı"
      : "Kurum varsayılanı";

  return (
    <CommunicationPageShell
      title="Bildirim Şablonları"
      subtitle="Otomatik bildirimlerde hangi Meta / LMS şablonunun kullanılacağını buradan bağlayın. Bağlanan şablonlar Şablonlar ve Meta Şablonlar sayfalarında “Aktif” görünür."
      icon="🔗"
      breadcrumbs={[
        { label: "İletişim", href: "/admin/iletisim/panel" },
        { label: "Bildirim Şablonları" },
      ]}
      actions={
        <>
          <Link className="comm-btn-secondary" href="/admin/iletisim/sablonlar">
            LMS Şablonları
          </Link>
          <Link className="comm-btn-secondary" href="/admin/iletisim/meta-sablonlar">
            Meta Şablonları
          </Link>
        </>
      }
      maxWidth="full"
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {message && <div className="comm-alert comm-alert-success">{message}</div>}

      <div className="comm-card nb-scope">
        <div className="nb-scope-fields">
          <label className="comm-form-field">
            <span>Kapsam</span>
            <select
              className="tplx-select"
              value={scopeSube ? "sube" : "kurum"}
              onChange={(e) => setScopeSube(e.target.value === "sube")}
              disabled={!activeSubeId}
            >
              <option value="kurum">Kurum varsayılanı</option>
              <option value="sube">Aktif şube</option>
            </select>
          </label>
          <label className="comm-form-field">
            <span>WhatsApp hesabı</span>
            <select
              className="tplx-select"
              value={scopeAccountId}
              onChange={(e) => setScopeAccountId(e.target.value)}
            >
              <option value="">Tüm hesaplar</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="tplx-field-hint">
          Düzenlenen kapsam: <strong>{scopeLabel}</strong>. Daha özel bir kapsamda tanım yoksa
          sistem sırasıyla şube, hesap ve kurum varsayılanına düşer. Devamsızlık için{" "}
          <strong>Yoklama</strong> olaylarını kullanın (gelmedi / geç / çıkış).
        </p>
      </div>

      {loading ? (
        <div className="comm-card">Yükleniyor…</div>
      ) : (
        <div className="nb-layout">
          <aside className="comm-card nb-sidebar">
            {(catalog?.modules || []).length === 0 ? (
              <p className="tplx-field-hint">Gösterilecek bildirim modülü yok.</p>
            ) : (
              (catalog?.modules || []).map((mod) => {
                const modEvents = events.filter((e) => e.module === mod.key);
                const boundCount = modEvents.filter((e) =>
                  e.slots.some(slotHasCustomBinding),
                ).length;
                return (
                  <div key={mod.key} className="nb-module">
                    <button
                      type="button"
                      className={`nb-module-btn${selectedModule === mod.key ? " is-active" : ""}`}
                      onClick={() => setSelectedModule(mod.key)}
                    >
                      <span>{mod.label}</span>
                      {boundCount > 0 && (
                        <span className="nb-doc-chip nb-bound-chip">{boundCount}</span>
                      )}
                    </button>
                    {selectedModule === mod.key && (
                      <ul className="nb-event-list">
                        {modEvents.map((e) => (
                          <li key={e.key}>
                            <button
                              type="button"
                              className={`nb-event-btn${selectedEventKey === e.key ? " is-active" : ""}`}
                              onClick={() => setSelectedEventKey(e.key)}
                            >
                              {e.label}
                              {e.slots.some(slotHasCustomBinding) && (
                                <span className="nb-doc-chip nb-bound-chip">Bağlı</span>
                              )}
                              {e.has_document && <span className="nb-doc-chip">PDF</span>}
                              {e.has_image && <span className="nb-doc-chip">GÖRSEL</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </aside>

          <section className="nb-detail">
            {!selectedEvent ? (
              <div className="comm-card">Soldan bir olay seçin.</div>
            ) : (
              <div className="comm-card">
                <header className="nb-event-head">
                  <div>
                    <h2>{selectedEvent.label}</h2>
                    {selectedEvent.description && <p>{selectedEvent.description}</p>}
                  </div>
                  <code className="nb-event-key">{selectedEvent.key}</code>
                </header>

                <p className="tplx-field-hint">
                  Kullanılabilir değişkenler:{" "}
                  {selectedEvent.variables.map((v) => `{{${v}}}`).join(", ")}
                </p>

                {selectedEvent.slots.map((slot) => {
                  const key = slotKey(selectedEvent.key, slot.recipient_type);
                  const busy = savingSlot === key;
                  const preview = previews[key];
                  const options = metaOptionsFor(selectedEvent);
                  const lmsOptions = lmsOptionsFor(selectedEvent);
                  const boundMeta = slot.binding?.meta_template_id
                    ? metaTemplates.find((t) => t.id === slot.binding?.meta_template_id)
                    : null;
                  const createHref = (() => {
                    const qs = new URLSearchParams({
                      event: selectedEvent.key,
                      recipient: slot.recipient_type,
                      bind: "1",
                    });
                    if (scopeAccountId) qs.set("account", scopeAccountId);
                    return `/admin/iletisim/meta-sablonlar?${qs.toString()}`;
                  })();
                  return (
                    <div key={key} className="nb-slot">
                      <div className="nb-slot-head">
                        <strong>{RECIPIENT_LABELS[slot.recipient_type]}</strong>
                        <span className="comm-status-badge">{slot.resolved.source_label}</span>
                        {slotHasCustomBinding(slot) ? (
                          <span className="comm-status-badge is-success">Bu kapsamda tanımlı</span>
                        ) : (
                          <span className="tplx-field-hint">Bu kapsamda özel tanım yok</span>
                        )}
                      </div>

                      <div className="nb-slot-grid">
                        <label className="comm-form-field">
                          <span>Meta şablonu</span>
                          <select
                            className="tplx-select"
                            disabled={busy}
                            value={slot.binding?.meta_template_id || ""}
                            onChange={(e) =>
                              persist(selectedEvent, slot, {
                                meta_template_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">
                              {slot.resolved.meta_template_name
                                ? `Otomatik — ${slot.resolved.meta_template_name}`
                                : "Otomatik / yok"}
                            </option>
                            {options.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name} ({tpl.language})
                                {tpl.status !== "APPROVED"
                                  ? ` — ${tpl.status_label || tpl.status}`
                                  : ""}
                              </option>
                            ))}
                          </select>
                          {boundMeta && boundMeta.status !== "APPROVED" && (
                            <p className="tplx-field-hint" style={{ color: "#b45309" }}>
                              Bu şablon henüz Meta onayında değil; pencere kapalıyken
                              gönderilemez. Meta’ya gönderip onaylatın.
                            </p>
                          )}
                          {slot.binding?.meta_template_id && (
                            <Link
                              className="tplx-field-hint"
                              href={`/admin/iletisim/meta-sablonlar?account=${
                                boundMeta?.channel_config || scopeAccountId || ""
                              }`}
                              style={{ display: "inline-block", marginTop: 4 }}
                            >
                              Meta şablonlarda aç →
                            </Link>
                          )}
                        </label>

                        <label className="comm-form-field">
                          <span>LMS şablonu (serbest mesaj)</span>
                          <select
                            className="tplx-select"
                            disabled={busy}
                            value={slot.binding?.message_template_id || ""}
                            onChange={(e) =>
                              persist(selectedEvent, slot, {
                                message_template_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">
                              {slot.resolved.message_template_name
                                ? `Otomatik — ${slot.resolved.message_template_name}`
                                : "Varsayılan metin"}
                            </option>
                            {lmsOptions.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name}
                              </option>
                            ))}
                          </select>
                          {slot.binding?.message_template_id && (
                            <Link
                              className="tplx-field-hint"
                              href="/admin/iletisim/sablonlar"
                              style={{ display: "inline-block", marginTop: 4 }}
                            >
                              LMS şablonlarda aç →
                            </Link>
                          )}
                        </label>

                        <label className="comm-form-field">
                          <span>Gönderim modu</span>
                          <select
                            className="tplx-select"
                            disabled={busy}
                            value={slot.binding?.send_mode || slot.resolved.send_mode}
                            onChange={(e) =>
                              persist(selectedEvent, slot, {
                                send_mode: e.target.value as NotificationSendMode,
                              })
                            }
                          >
                            {(catalog?.send_modes || []).map((mode) => (
                              <option key={mode.value} value={mode.value}>
                                {mode.label}
                              </option>
                            ))}
                          </select>
                          <p className="tplx-field-hint">
                            Kapalı = gönderilmez. Meta only = her zaman şablon.
                            Serbest = yalnızca 24s penceresinde.
                          </p>
                        </label>
                      </div>

                      {slot.resolved.warnings.map((warning) => (
                        <div key={warning} className="comm-alert comm-alert-warning">
                          {warning}
                        </div>
                      ))}

                      <div className="comm-btn-row">
                        <button
                          type="button"
                          className="comm-btn-secondary"
                          disabled={busy}
                          onClick={() => loadPreview(selectedEvent, slot)}
                        >
                          Önizlemeyi yenile
                        </button>
                        {slot.binding && (
                          <button
                            type="button"
                            className="comm-btn-secondary"
                            disabled={busy}
                            onClick={() => resetSlot(selectedEvent, slot)}
                          >
                            Varsayılana dön
                          </button>
                        )}
                        <Link className="comm-btn-secondary" href={createHref}>
                          Bu olay için şablon oluştur
                        </Link>
                      </div>

                      <div className="nb-preview">
                        <div className="tplx-field-hint">
                          {preview
                            ? (
                              <>
                                {preview.uses_meta
                                  ? `Meta şablonu ile gönderilecek: ${preview.meta_template_name}`
                                  : "Serbest mesaj olarak gönderilecek"}
                                {!preview.would_send && " — bu bildirim kapalı"}
                              </>
                            )
                            : "Önizleme yükleniyor…"}
                        </div>
                        <pre className="nb-preview-body">
                          {preview?.body || slot.resolved.body || "—"}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </CommunicationPageShell>
  );
}
