"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommunicationPageShell, WhatsAppPreviewBubble } from "@/components/communication";
import { headerTypeOf } from "@/components/communication/MetaTemplateSelect";
import { resolvePreviewVariables } from "@/components/communication/composer-utils";
import { useLivePreviewContext } from "@/components/communication/useLivePreviewContext";
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
  fetchNotificationStaffRecipients,
  fetchTemplates,
  fetchWhatsAppAccounts,
  NotificationStaffRecipientItem,
  previewNotificationBinding,
  saveNotificationBinding,
  saveNotificationStaffRecipients,
  seedAcademicScheduleTemplates,
  seedKayitSozlesmeTemplates,
  seedKutuphaneYoklamaTemplates,
} from "@/lib/communication-api";
import { notifyCommunicationTemplateUsageChanged } from "@/lib/communication-template-usage-sync";

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

const sameAccount = (tpl: WhatsAppMetaTemplateItem, accountId: string): boolean =>
  String(tpl.channel_config || "") === String(accountId || "");

function moduleEventMatches(modKey: string, event: NotificationEventItem): boolean {
  if (modKey.startsWith("yoklama:")) {
    return event.module === "yoklama" && event.group === modKey.slice("yoklama:".length);
  }
  return event.module === modKey;
}

function eventModuleKey(event: NotificationEventItem): string {
  if (event.module === "yoklama" && event.group) return `yoklama:${event.group}`;
  return event.module;
}

const slotHasCustomBinding = (slot: NotificationEventSlot): boolean =>
  Boolean(
    slot.binding &&
      (slot.binding.meta_template_id ||
        slot.binding.message_template_id ||
        (slot.binding.send_mode && slot.binding.send_mode !== "AUTO")),
  );

function StaffRecipientsPanel({
  eventKey,
  subeId,
  onError,
  onMessage,
}: {
  eventKey: string;
  subeId: number | null;
  onError: (msg: string | null) => void;
  onMessage: (msg: string | null) => void;
}) {
  const [items, setItems] = useState<NotificationStaffRecipientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotificationStaffRecipients(eventKey, subeId);
      setItems(data.items || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Yönetici listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [eventKey, subeId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: number) => {
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, selected: !row.selected } : row)),
    );
  };

  const save = async () => {
    setSaving(true);
    onError(null);
    try {
      const data = await saveNotificationStaffRecipients({
        event_key: eventKey,
        personel_ids: items.filter((row) => row.selected).map((row) => row.id),
        sube_id: subeId,
      });
      setItems(data.items || []);
      onMessage("Alıcı yöneticiler kaydedildi.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Alıcılar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nb-slot">
      <div className="nb-slot-head">
        <strong>Alıcı yöneticiler</strong>
      </div>
      <p className="tplx-field-hint">
        Sözleşme aktif edilince işaretlenen kurum / şube / eğitim yöneticilerine WhatsApp gider.
        Telefonu olmayanlar seçilse bile gönderilmez.
      </p>
      {loading ? (
        <p className="tplx-field-hint">Yöneticiler yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="tplx-field-hint">
          Bu kurumda kurum / şube / eğitim yöneticisi görevlendirmesi veya
          yönetici giriş hesabı olan personel yok.
        </p>
      ) : (
        <div className="nb-staff-list">
          {items.map((row) => (
            <label
              key={row.id}
              className={`nb-staff-row${!row.has_phone ? " is-disabled" : ""}`}
            >
              <input
                type="checkbox"
                checked={row.selected}
                onChange={() => toggle(row.id)}
              />
              <span>
                <strong>{row.ad} {row.soyad}</strong>
                <span className="nb-staff-meta">
                  {row.rol}
                  {row.has_phone ? ` · ${row.telefon}` : " · telefon yok"}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        className="comm-btn-secondary"
        disabled={saving || loading}
        onClick={() => void save()}
      >
        {saving ? "Kaydediliyor…" : "Alıcıları kaydet"}
      </button>
    </div>
  );
}

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
  const [seedingAcademic, setSeedingAcademic] = useState(false);
  const [seedingKayit, setSeedingKayit] = useState(false);
  const [seedingKutuphane, setSeedingKutuphane] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, NotificationPreviewResult>>({});
  const livePreviewContext = useLivePreviewContext();

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
      setSelectedModule(eventModuleKey(match));
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
    () => events.filter((e) => !selectedModule || moduleEventMatches(selectedModule, e)),
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
    (
      event: NotificationEventItem,
      boundId?: string | null,
    ): WhatsAppMetaTemplateItem[] => {
      const scoped = scopeAccountId
        ? metaTemplates.filter((t) => sameAccount(t, scopeAccountId))
        : metaTemplates;

      let required: string[] | null = null;
      if (event.has_image) required = ["IMAGE"];
      else if (event.has_document) required = ["DOCUMENT"];
      // Serbest metin olaylarında medya başlıklı şablonları gizleme —
      // yanlışlıkla DOCUMENT seçilmesin; yine de bağlı olanı göster.
      else required = ["NONE", "TEXT"];

      let list = scoped.filter((t) => required!.includes(headerTypeOf(t)));

      // Bağlı şablon filtre dışında kaldıysa (eski header / başka hesap) yine de göster
      if (boundId) {
        const bound = metaTemplates.find((t) => String(t.id) === String(boundId));
        if (bound && !list.some((t) => String(t.id) === String(boundId))) {
          list = [bound, ...list];
        }
      }

      // İsim eşleşmesi: önerilen meta adları üste
      const base = (event.meta_name_base || "").toLowerCase();
      return [...list].sort((a, b) => {
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        const aHit = base && aName.includes(base) ? 0 : 1;
        const bHit = base && bName.includes(base) ? 0 : 1;
        if (aHit !== bHit) return aHit - bHit;
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
          notifyCommunicationTemplateUsageChanged();
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
          notifyCommunicationTemplateUsageChanged();
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
        notifyCommunicationTemplateUsageChanged();
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

  const handleSeedAcademicSchedule = async () => {
    const accountId = scopeAccountId || accounts[0]?.id || "";
    if (!accountId) {
      setError("WhatsApp hesabı seçin (veya en az bir aktif hesap tanımlayın).");
      return;
    }
    if (!confirm(
      "Sınıf ders programı taslakları oluşturulsun mu?\n\n"
      + "• sinif_programi_veli (DOCUMENT)\n"
      + "• sinif_programi_ogrenci (DOCUMENT)\n\n"
      + "LMS şablonları + Meta DRAFT üretilir ve bu olayın Veli/Öğrenci "
      + "slotlarına bağlanır. Örnek PDF yükleyip Meta onayına göndermeniz gerekir.",
    )) return;
    setSeedingAcademic(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedAcademicScheduleTemplates({
        channel_config_id: accountId,
        sube_id: scopeSube ? activeSubeId : null,
        bind: true,
      });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info || "Akademik program taslakları hazır.")
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      notifyCommunicationTemplateUsageChanged();
      await Promise.all([loadCatalog(), reloadTemplateLists()]);
      setSelectedModule("akademik");
      setSelectedEventKey("akademik.sinif_programi");
      if (!scopeAccountId) setScopeAccountId(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Akademik program taslakları oluşturulamadı.");
    } finally {
      setSeedingAcademic(false);
    }
  };

  const handleSeedKayitSozlesme = async () => {
    const accountId = scopeAccountId || accounts[0]?.id || "";
    if (!accountId) {
      setError("WhatsApp hesabı seçin (veya en az bir aktif hesap tanımlayın).");
      return;
    }
    if (!confirm(
      "Kayıt sözleşmesi taslağı oluşturulsun mu?\n\n"
      + "• ogrenci_kayit_sozlesme_personel (metin)\n\n"
      + "LMS şablonu + Meta DRAFT üretilir ve bu olayın Personel "
      + "slotuna bağlanır. Meta’ya gönderip onaylatmanız gerekir.",
    )) return;
    setSeedingKayit(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedKayitSozlesmeTemplates({
        channel_config_id: accountId,
        sube_id: scopeSube ? activeSubeId : null,
        bind: true,
      });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info || "Kayıt sözleşmesi taslağı hazır.")
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      notifyCommunicationTemplateUsageChanged();
      await Promise.all([loadCatalog(), reloadTemplateLists()]);
      setSelectedModule("ogrenci");
      setSelectedEventKey("ogrenci.kayit_sozlesme");
      if (!scopeAccountId) setScopeAccountId(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt sözleşmesi taslağı oluşturulamadı.");
    } finally {
      setSeedingKayit(false);
    }
  };

  const handleSeedKutuphaneYoklama = async () => {
    const accountId = scopeAccountId || accounts[0]?.id || "";
    if (!accountId) {
      setError("WhatsApp hesabı seçin (veya en az bir aktif hesap tanımlayın).");
      return;
    }
    if (!confirm(
      "Kütüphane yoklama taslakları oluşturulsun mu?\n\n"
      + "• yoklama_gelmedi_veli / yoklama_gec_veli / yoklama_cikis_veli\n\n"
      + "Onaylı şablonlara dokunulmaz. Eksik olanlar Meta DRAFT olarak eklenir "
      + "ve Yoklama → Kütüphane olaylarına bağlanır.",
    )) return;
    setSeedingKutuphane(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedKutuphaneYoklamaTemplates({
        channel_config_id: accountId,
        sube_id: scopeSube ? activeSubeId : null,
        bind: true,
      });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info || "Kütüphane yoklama taslakları hazır.")
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      notifyCommunicationTemplateUsageChanged();
      await Promise.all([loadCatalog(), reloadTemplateLists()]);
      setSelectedModule("yoklama:kutuphane");
      setSelectedEventKey("yoklama.gelmedi");
      if (!scopeAccountId) setScopeAccountId(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kütüphane yoklama taslakları oluşturulamadı.");
    } finally {
      setSeedingKutuphane(false);
    }
  };

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
          <button
            type="button"
            className="comm-btn-secondary"
            onClick={handleSeedAcademicSchedule}
            disabled={seedingAcademic || accounts.length === 0}
            title="Planlama → Programı Bildir için veli/öğrenci DOCUMENT taslakları"
          >
            {seedingAcademic ? "Oluşturuluyor…" : "Ders programı taslakları"}
          </button>
          <button
            type="button"
            className="comm-btn-secondary"
            onClick={handleSeedKutuphaneYoklama}
            disabled={seedingKutuphane || accounts.length === 0}
            title="Kütüphane yoklama gelmedi/geç/çıkış Meta taslakları"
          >
            {seedingKutuphane ? "Oluşturuluyor…" : "Kütüphane yoklama taslakları"}
          </button>
          <button
            type="button"
            className="comm-btn-secondary"
            onClick={handleSeedKayitSozlesme}
            disabled={seedingKayit || accounts.length === 0}
            title="Sözleşme aktif bildirimi için yönetici Meta/LMS taslağı"
          >
            {seedingKayit ? "Oluşturuluyor…" : "Kayıt sözleşmesi taslağı"}
          </button>
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
          sistem sırasıyla şube, hesap ve kurum varsayılanına düşer.           Devamsızlık için <strong>Yoklama</strong> altında{" "}
          <strong>Kütüphane</strong> ve <strong>Sınıf</strong> olaylarını ayrı kullanın.
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
                const modEvents = events.filter((e) => moduleEventMatches(mod.key, e));
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

                {selectedEvent.key === "ogrenci.kayit_sozlesme" && (
                  <StaffRecipientsPanel
                    eventKey={selectedEvent.key}
                    subeId={scopeSubeId}
                    onError={setError}
                    onMessage={setMessage}
                  />
                )}

                {selectedEvent.slots.map((slot) => {
                  const key = slotKey(selectedEvent.key, slot.recipient_type);
                  const busy = savingSlot === key;
                  const preview = previews[key];
                  const options = metaOptionsFor(
                    selectedEvent,
                    slot.binding?.meta_template_id,
                  );
                  const lmsOptions = lmsOptionsFor(selectedEvent);
                  const boundMeta = slot.binding?.meta_template_id
                    ? metaTemplates.find(
                      (t) => String(t.id) === String(slot.binding?.meta_template_id),
                    )
                    : null;
                  const headerFilterHint = selectedEvent.has_image
                    ? "Yalnızca IMAGE başlıklı Meta şablonları listelenir."
                    : selectedEvent.has_document
                      ? "Yalnızca DOCUMENT (PDF) başlıklı Meta şablonları listelenir."
                      : "Yalnızca metin başlıklı (TEXT / başlıksız) Meta şablonları listelenir.";
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
                            {options.map((tpl) => {
                              const htype = headerTypeOf(tpl);
                              const accountTag =
                                !scopeAccountId && tpl.channel_config_name
                                  ? ` · ${tpl.channel_config_name}`
                                  : "";
                              return (
                                <option key={tpl.id} value={tpl.id}>
                                  {tpl.name}
                                  {htype && htype !== "NONE" ? ` [${htype}]` : ""}
                                  {` (${tpl.language})`}
                                  {tpl.status !== "APPROVED"
                                    ? ` — ${tpl.status_label || tpl.status}`
                                    : ""}
                                  {accountTag}
                                </option>
                              );
                            })}
                          </select>
                          <p className="tplx-field-hint">
                            {headerFilterHint}
                            {scopeAccountId
                              ? " Seçili WhatsApp hesabına ait şablonlar."
                              : " Tüm hesaplar — hesap adı seçenek sonunda görünür."}
                            {` (${options.length} şablon)`}
                          </p>
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
                        <WhatsAppPreviewBubble
                          text={resolvePreviewVariables(
                            preview?.body
                              || boundMeta?.body_named
                              || slot.resolved.display_body
                              || slot.resolved.meta_template_body
                              || slot.resolved.body
                              || slot.default_body
                              || "",
                            livePreviewContext,
                          )}
                        />
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
