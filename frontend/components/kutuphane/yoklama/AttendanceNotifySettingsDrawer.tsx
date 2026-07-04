"use client";

import { useEffect, useState } from "react";
import {
  fetchAttendanceNotifyConfig,
  updateAttendanceNotifyConfig,
  type AttendanceNotifyConfig,
} from "@/lib/kutuphane-api";
import { fetchTemplates } from "@/lib/communication-api";
import "./yoklama-notify.css";
import YoklamaModalPortal from "./YoklamaModalPortal";

interface TemplateOption {
  id: string;
  name: string;
  category: string;
}

interface AttendanceNotifySettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function AttendanceNotifySettingsDrawer({
  open,
  onClose,
  onSaved,
}: AttendanceNotifySettingsDrawerProps) {
  const [config, setConfig] = useState<AttendanceNotifyConfig | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    absent_template_id: "",
    late_template_id: "",
    exit_template_id: "",
    is_active: true,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cfgRes, tplRes] = await Promise.all([
          fetchAttendanceNotifyConfig(),
          fetchTemplates(),
        ]);
        if (cancelled) return;
        const cfg = cfgRes.data;
        setConfig(cfg ?? null);
        const yoklamaTemplates = (tplRes?.templates ?? []).filter((t) =>
          ["yoklama_gelmedi", "yoklama_gec", "yoklama_cikis"].includes(t.category),
        );
        setTemplates(yoklamaTemplates.map((t) => ({ id: t.id, name: t.name, category: t.category })));
        if (cfg) {
          setForm({
            absent_template_id: cfg.absent_template?.id ?? "",
            late_template_id: cfg.late_template?.id ?? "",
            exit_template_id: cfg.exit_template?.id ?? "",
            is_active: cfg.is_active,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const byCategory = (cat: string) => templates.filter((t) => t.category === cat);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAttendanceNotifyConfig({
        absent_template_id: form.absent_template_id || null,
        late_template_id: form.late_template_id || null,
        exit_template_id: form.exit_template_id || null,
        is_active: form.is_active,
      });
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <YoklamaModalPortal>
      <div className="yok-preview-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="yok-preview-modal" style={{ width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
          <div className="yok-preview-header">
            <div>
              <h3>Yoklama bildirim ayarları</h3>
              <p>Gelmedi, geç kalma ve çıkış mesajları için kullanılacak şablonları seçin.</p>
            </div>
            <button type="button" className="yok-notify-btn ghost" onClick={onClose}>✕</button>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Yükleniyor…</div>
          ) : (
            <div className="yok-settings-grid">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Yoklama veli bildirimleri aktif
              </label>

              {(
                [
                  ["yoklama_gelmedi", "Gelmedi şablonu", "absent_template_id"],
                  ["yoklama_gec", "Geç kalma şablonu", "late_template_id"],
                  ["yoklama_cikis", "Çıkış şablonu", "exit_template_id"],
                ] as const
              ).map(([cat, label, field]) => (
                <div key={cat} className="yok-settings-card">
                  <label>{label}</label>
                  <select
                    value={form[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  >
                    <option value="">— Seçin —</option>
                    {byCategory(cat).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div className="yok-preview-footer">
            <button type="button" className="yok-notify-btn ghost" onClick={onClose}>İptal</button>
            <button type="button" className="yok-notify-btn primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </YoklamaModalPortal>
  );
}
