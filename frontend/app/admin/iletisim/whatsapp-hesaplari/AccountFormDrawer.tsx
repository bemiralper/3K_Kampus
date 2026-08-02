"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createWhatsAppAccount,
  updateWhatsAppAccount,
  WhatsAppAccount,
  WhatsAppAccountScope,
  WhatsAppAccountWritePayload,
} from "@/lib/communication-api";
import RoleService from "@/app/roles/role.service";
import type { Role } from "@/app/roles/role.types";
import { getSubeler } from "@/app/kurum-yonetimi/sube-tanimlari/services";

interface AccountFormDrawerProps {
  open: boolean;
  account: WhatsAppAccount | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  app_secret: string;
  webhook_verify_token: string;
  display_phone: string;
  is_active: boolean;
  is_default: boolean;
  scope_type: WhatsAppAccountScope;
  department: string;
  role_ids: number[];
  sube_ids: number[];
}

const DEPARTMENTS = [
  { id: "COACHING", label: "Koçluk" },
  { id: "ACCOUNTING", label: "Muhasebe" },
  { id: "SECRETARIAT", label: "Sekreterya" },
  { id: "GUIDANCE", label: "Rehberlik" },
  { id: "ADMISSIONS", label: "Kayıt Ofisi" },
  { id: "MANAGEMENT", label: "Yönetim" },
];

function emptyForm(): FormState {
  return {
    name: "",
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    app_secret: "",
    webhook_verify_token: "",
    display_phone: "",
    is_active: true,
    is_default: false,
    scope_type: "ALL_SUBES",
    department: "COACHING",
    role_ids: [],
    sube_ids: [],
  };
}

export default function AccountFormDrawer({ open, account, onClose, onSaved }: AccountFormDrawerProps) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [roles, setRoles] = useState<Role[]>([]);
  const [subeler, setSubeler] = useState<Array<{ id: number; ad: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      account
        ? {
            name: account.name || "",
            phone_number_id: account.phone_number_id || "",
            waba_id: account.waba_id || "",
            access_token: "",
            app_secret: "",
            webhook_verify_token: account.webhook_verify_token || "",
            display_phone: account.display_phone || "",
            is_active: account.is_active,
            is_default: account.is_default,
            scope_type: account.scope_type || "ALL_SUBES",
            department: account.department || "COACHING",
            role_ids: account.role_ids || [],
            sube_ids: account.sube_ids || [],
          }
        : emptyForm(),
    );
  }, [open, account]);

  useEffect(() => {
    if (!open) return;
    RoleService.listRoles({ is_active: true })
      .then((res) => setRoles(res.success ? res.roles : []))
      .catch(() => setRoles([]));
    getSubeler()
      .then((list) => setSubeler(list || []))
      .catch(() => setSubeler([]));
  }, [open]);

  if (!open) return null;

  const toggleRole = (id: number) => {
    setForm((prev) => ({
      ...prev,
      role_ids: prev.role_ids.includes(id)
        ? prev.role_ids.filter((x) => x !== id)
        : [...prev.role_ids, id],
    }));
  };

  const toggleSube = (id: number) => {
    setForm((prev) => ({
      ...prev,
      sube_ids: prev.sube_ids.includes(id)
        ? prev.sube_ids.filter((x) => x !== id)
        : [...prev.sube_ids, id],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.phone_number_id.trim()) {
      setError("Phone Number ID zorunludur.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: WhatsAppAccountWritePayload = {
        name: form.name.trim() || undefined,
        phone_number_id: form.phone_number_id.trim(),
        waba_id: form.waba_id.trim(),
        webhook_verify_token: form.webhook_verify_token.trim(),
        display_phone: form.display_phone.trim(),
        is_active: form.is_active,
        is_default: form.is_default,
        scope_type: form.scope_type,
        department: form.department,
        role_ids: form.role_ids,
        sube_ids: form.scope_type === "SELECTED_SUBES" ? form.sube_ids : [],
      };
      if (form.access_token.trim()) payload.access_token = form.access_token.trim();
      if (form.app_secret.trim()) payload.app_secret = form.app_secret.trim();

      if (account) {
        await updateWhatsAppAccount(account.id, payload);
      } else {
        await createWhatsAppAccount(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="comm-drawer-overlay" onClick={onClose} role="presentation" />
      <div className="comm-drawer" role="dialog" aria-modal="true" aria-labelledby="account-drawer-title">
        <div className="comm-drawer-header">
          <h2 id="account-drawer-title">{account ? "Hesabı Düzenle" : "Yeni WhatsApp Hesabı"}</h2>
          <button type="button" className="comm-drawer-close" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        {error && <div className="comm-alert comm-alert-danger">{error}</div>}

        <form onSubmit={handleSubmit} className="comm-form-grid">
          <div className="comm-form-field">
            <label htmlFor="acc-name">Hesap adı</label>
            <input
              id="acc-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Örn: Merkez Kampüs WhatsApp"
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="acc-phone-id">Phone Number ID *</label>
            <input
              id="acc-phone-id"
              type="text"
              value={form.phone_number_id}
              onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
              placeholder="Meta phone_number_id"
              required
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="acc-waba">WABA ID</label>
            <input
              id="acc-waba"
              type="text"
              value={form.waba_id}
              onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
              placeholder="WhatsApp Business Account ID"
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="acc-token">Access Token</label>
            <input
              id="acc-token"
              type="password"
              value={form.access_token}
              onChange={(e) => setForm({ ...form, access_token: e.target.value })}
              placeholder={account?.has_token ? "•••••••• (değiştirmek için yeni token)" : "System user token"}
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="acc-secret">App Secret</label>
            <input
              id="acc-secret"
              type="password"
              value={form.app_secret}
              onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
              placeholder="Meta App Secret (webhook imza doğrulama)"
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="acc-verify">Webhook Verify Token</label>
            <input
              id="acc-verify"
              type="text"
              value={form.webhook_verify_token}
              onChange={(e) => setForm({ ...form, webhook_verify_token: e.target.value })}
            />
          </div>
          <div className="comm-form-field">
            <label htmlFor="acc-display">Görünen Numara</label>
            <input
              id="acc-display"
              type="text"
              value={form.display_phone}
              onChange={(e) => setForm({ ...form, display_phone: e.target.value })}
              placeholder="+90 5XX XXX XX XX"
            />
          </div>

          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Aktif</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              />
              <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Varsayılan hesap</span>
            </label>
          </div>

          <div className="comm-form-field">
            <label htmlFor="acc-department">Departman</label>
            <select
              id="acc-department"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="comm-form-field">
            <label htmlFor="acc-scope">Kapsam</label>
            <select
              id="acc-scope"
              value={form.scope_type}
              onChange={(e) => setForm({ ...form, scope_type: e.target.value as WhatsAppAccountScope })}
            >
              <option value="ALL_SUBES">Tüm şubeler</option>
              <option value="SELECTED_SUBES">Seçili şubeler</option>
            </select>
          </div>

          {form.scope_type === "SELECTED_SUBES" && (
            <div className="comm-form-field">
              <label>Şubeler</label>
              <div className="comm-checkbox-grid">
                {subeler.length === 0 ? (
                  <p className="comm-studio-muted">Şube bulunamadı.</p>
                ) : (
                  subeler.map((s) => (
                    <label key={s.id} className="comm-checkbox-item">
                      <input
                        type="checkbox"
                        checked={form.sube_ids.includes(s.id)}
                        onChange={() => toggleSube(s.id)}
                      />
                      <span>{s.ad}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="comm-form-field">
            <label>Bu hesabı kullanabilecek roller (boş = tüm roller — dikkatli kullanın)</label>
            <p className="comm-field-hint" style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>
              Seçili roller sohbetlerde yalnızca bu numarayı görür ve kullanır. Muhasebe hattı için yalnızca
              muhasebe rolünü işaretleyin.
            </p>
            <div className="comm-checkbox-grid">
              {roles.length === 0 ? (
                <p className="comm-studio-muted">Rol bulunamadı.</p>
              ) : (
                roles.map((r) => (
                  <label key={r.id} className="comm-checkbox-item">
                    <input
                      type="checkbox"
                      checked={form.role_ids.includes(r.id)}
                      onChange={() => toggleRole(r.id)}
                    />
                    <span>{r.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="comm-drawer-footer" style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" className="comm-btn-secondary" onClick={onClose} disabled={submitting}>
              İptal
            </button>
            <button type="submit" className="comm-btn-primary" disabled={submitting}>
              {submitting ? "Kaydediliyor…" : account ? "Güncelle" : "Oluştur"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
