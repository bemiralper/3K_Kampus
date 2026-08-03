"use client";

import Link from "next/link";
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

export default function BildirimSablonlariClient() {
  const [catalog, setCatalog] = useState<NotificationEventCatalog | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [lmsTemplates, setLmsTemplates] = useState<MessageTemplateItem[]>([]);
  const [activeSubeId, setActiveSubeId] = useState<number | null>(null);

  const [scopeSube, setScopeSube] = useState(false);
  const [scopeAccountId, setScopeAccountId] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("");
  const [selectedEventKey, setSelectedEventKey] = useState<string>("");

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
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [acc, meta, lms] = await Promise.all([
          fetchWhatsAppAccounts({ activeOnly: true }),
          fetchLocalMetaTemplates({ approved_only: true }),
          fetchTemplates(),
        ]);
        if (cancelled) return;
        setAccounts(acc.accounts || []);
        setMetaTemplates(meta.templates || []);
        setLmsTemplates((lms.templates || []).filter((t) => t.is_active));
      } catch {
        // şablon listeleri yüklenemezse ekran yine de çalışır
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!event.has_document) return scoped;
      return scoped.filter((t) => headerTypeOf(t) === "DOCUMENT");
    },
    [metaTemplates, scopeAccountId],
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
      try {
        await saveNotificationBinding({
          event_key: event.key,
          recipient_type: slot.recipient_type,
          sube_id: scopeSubeId,
          channel_config_id: scopeChannelConfigId,
          meta_template_id: slot.binding?.meta_template_id ?? null,
          message_template_id: slot.binding?.message_template_id ?? null,
          send_mode: slot.binding?.send_mode ?? "AUTO",
          is_active: slot.binding?.is_active ?? true,
          ...patch,
        });
        setMessage(`${event.label} — ${RECIPIENT_LABELS[slot.recipient_type]} güncellendi.`);
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
      subtitle="Hangi olayda hangi WhatsApp şablonunun kullanılacağını buradan yönetin."
      icon="🔗"
      breadcrumbs={[
        { label: "İletişim", href: "/admin/iletisim/panel" },
        { label: "Bildirim Şablonları" },
      ]}
      actions={
        <Link className="comm-btn-secondary" href="/admin/iletisim/meta-sablonlar">
          Meta Şablonları
        </Link>
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
          sistem sırasıyla şube, hesap ve kurum varsayılanına düşer.
        </p>
      </div>

      {loading ? (
        <div className="comm-card">Yükleniyor…</div>
      ) : (
        <div className="nb-layout">
          <aside className="comm-card nb-sidebar">
            {(catalog?.modules || []).map((mod) => (
              <div key={mod.key} className="nb-module">
                <button
                  type="button"
                  className={`nb-module-btn${selectedModule === mod.key ? " is-active" : ""}`}
                  onClick={() => setSelectedModule(mod.key)}
                >
                  {mod.label}
                </button>
                {selectedModule === mod.key && (
                  <ul className="nb-event-list">
                    {events
                      .filter((e) => e.module === mod.key)
                      .map((e) => (
                        <li key={e.key}>
                          <button
                            type="button"
                            className={`nb-event-btn${selectedEventKey === e.key ? " is-active" : ""}`}
                            onClick={() => setSelectedEventKey(e.key)}
                          >
                            {e.label}
                            {e.has_document && <span className="nb-doc-chip">PDF</span>}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
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
                  return (
                    <div key={key} className="nb-slot">
                      <div className="nb-slot-head">
                        <strong>{RECIPIENT_LABELS[slot.recipient_type]}</strong>
                        <span className="comm-status-badge">{slot.resolved.source_label}</span>
                        {!slot.binding && (
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
                              </option>
                            ))}
                          </select>
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
                            <option value="">Varsayılan metin</option>
                            {lmsTemplates.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name}
                              </option>
                            ))}
                          </select>
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
                          Önizle
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
                        <Link
                          className="comm-btn-secondary"
                          href={`/admin/iletisim/meta-sablonlar?event=${selectedEvent.key}&recipient=${slot.recipient_type}`}
                        >
                          Bu olay için şablon oluştur
                        </Link>
                      </div>

                      {preview && (
                        <div className="nb-preview">
                          <div className="tplx-field-hint">
                            {preview.uses_meta
                              ? `Meta şablonu ile gönderilecek: ${preview.meta_template_name}`
                              : "Serbest mesaj olarak gönderilecek"}
                            {!preview.would_send && " — bu bildirim kapalı"}
                          </div>
                          <pre className="nb-preview-body">{preview.body}</pre>
                        </div>
                      )}
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
