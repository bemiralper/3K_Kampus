"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CommunicationPageShell from "@/components/communication/CommunicationPageShell";
import "@/components/communication/communication.css";
import {
  CommunicationDepartment,
  DEPARTMENT_LABELS,
  ROUTING_CONTACT_TYPE_LABELS,
  ROUTING_QUEUE_BEHAVIOR_LABELS,
  RoutingContactType,
  RoutingQueueBehavior,
  RoutingRule,
  RoutingRuleActions,
  RoutingRuleConditions,
  RoutingSetStatus,
  createRoutingRule,
  deleteRoutingRule,
  fetchRoutingRules,
  updateRoutingRule,
} from "@/lib/communication-api";

const DEPARTMENTS: CommunicationDepartment[] = [
  "COACHING",
  "ACCOUNTING",
  "SECRETARIAT",
  "GUIDANCE",
  "ADMISSIONS",
  "MANAGEMENT",
];

const CONTACT_TYPES: RoutingContactType[] = ["RAW_PHONE", "OGRENCI", "VELI", "PERSONEL"];

const QUEUE_BEHAVIORS: RoutingQueueBehavior[] = ["unclaimed", "assign_coach", "needs_support"];

const SET_STATUSES: Array<RoutingSetStatus | ""> = ["", "NEW", "WAITING", "NEEDS_SUPPORT"];

type HasCoachFilter = "any" | "yes" | "no";

interface RuleFormState {
  name: string;
  department: CommunicationDepartment;
  priority: number;
  is_active: boolean;
  has_coach: HasCoachFilter;
  contact_types: RoutingContactType[];
  queue_behavior: RoutingQueueBehavior | "";
  set_status: RoutingSetStatus | "";
  set_department: CommunicationDepartment | "";
}

const EMPTY_FORM: RuleFormState = {
  name: "",
  department: "COACHING",
  priority: 100,
  is_active: true,
  has_coach: "no",
  contact_types: [],
  queue_behavior: "unclaimed",
  set_status: "",
  set_department: "",
};

function formToConditions(form: RuleFormState): RoutingRuleConditions {
  const conditions: RoutingRuleConditions = {};
  if (form.has_coach === "yes") conditions.has_coach = true;
  if (form.has_coach === "no") conditions.has_coach = false;
  if (form.contact_types.length > 0) conditions.contact_types = form.contact_types;
  return conditions;
}

function formToActions(form: RuleFormState): RoutingRuleActions {
  const actions: RoutingRuleActions = {};
  if (form.queue_behavior) actions.queue_behavior = form.queue_behavior;
  if (form.set_status) actions.set_status = form.set_status;
  if (form.set_department) actions.set_department = form.set_department;
  return actions;
}

function ruleToForm(rule: RoutingRule): RuleFormState {
  const cond = rule.conditions || {};
  const act = rule.actions || {};
  let has_coach: HasCoachFilter = "any";
  if (cond.has_coach === true) has_coach = "yes";
  if (cond.has_coach === false) has_coach = "no";
  return {
    name: rule.name,
    department: (rule.department as CommunicationDepartment) || "COACHING",
    priority: rule.priority ?? 100,
    is_active: rule.is_active,
    has_coach,
    contact_types: Array.isArray(cond.contact_types) ? [...cond.contact_types] : [],
    queue_behavior: (act.queue_behavior as RoutingQueueBehavior) || "",
    set_status: (act.set_status as RoutingSetStatus) || "",
    set_department: (act.set_department as CommunicationDepartment) || "",
  };
}

function conditionChips(rule: RoutingRule): string[] {
  const chips: string[] = [];
  const cond = rule.conditions || {};
  if (cond.has_coach === true) chips.push("Koçu var");
  if (cond.has_coach === false) chips.push("Koçu yok");
  if (Array.isArray(cond.contact_types)) {
    for (const t of cond.contact_types) {
      chips.push(ROUTING_CONTACT_TYPE_LABELS[t] || t);
    }
  }
  if (cond.queue) chips.push(`Kuyruk: ${cond.queue}`);
  return chips.length ? chips : ["Tüm eşleşmeler"];
}

function actionChips(rule: RoutingRule): string[] {
  const chips: string[] = [];
  const act = rule.actions || {};
  const dept = act.set_department || rule.department;
  if (dept) chips.push(DEPARTMENT_LABELS[dept] || dept);
  if (act.queue_behavior) {
    chips.push(ROUTING_QUEUE_BEHAVIOR_LABELS[act.queue_behavior] || act.queue_behavior);
  }
  if (act.set_status) chips.push(`Durum: ${act.set_status}`);
  return chips;
}

export default function YonlendirmePage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoutingRules();
      setRules(data.rules || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "tr")),
    [rules],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSuccess(null);
    setDrawerOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditing(rule);
    setForm(ruleToForm(rule));
    setSuccess(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      name: form.name.trim(),
      department: form.department,
      priority: Number(form.priority) || 100,
      is_active: form.is_active,
      conditions: formToConditions(form),
      actions: formToActions(form),
    };
    try {
      if (editing) {
        await updateRoutingRule(editing.id, payload);
        setSuccess("Kural güncellendi.");
      } else {
        await createRoutingRule(payload);
        setSuccess("Kural eklendi.");
      }
      closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rule: RoutingRule) => {
    setBusyId(rule.id);
    setError(null);
    try {
      await updateRoutingRule(rule.id, { is_active: !rule.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (rule: RoutingRule) => {
    if (!confirm(`"${rule.name}" kuralını silmek istediğinize emin misiniz?`)) return;
    setBusyId(rule.id);
    setError(null);
    try {
      await deleteRoutingRule(rule.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    } finally {
      setBusyId(null);
    }
  };

  const addDefaultRule = async () => {
    setSaving(true);
    setError(null);
    try {
      await createRoutingRule({
        name: "Koçsuz / bilinmeyen → Yeni Gelenler",
        department: "COACHING",
        priority: 100,
        is_active: true,
        conditions: { has_coach: false },
        actions: { queue_behavior: "unclaimed", set_status: "NEW" },
      });
      setSuccess("Varsayılan kural eklendi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  const toggleContactType = (type: RoutingContactType) => {
    setForm((prev) => {
      const set = new Set(prev.contact_types);
      if (set.has(type)) set.delete(type);
      else set.add(type);
      return { ...prev, contact_types: Array.from(set) as RoutingContactType[] };
    });
  };

  return (
    <CommunicationPageShell
      title="Yönlendirme Kuralları"
      subtitle="Departman bazlı kuyruk davranışını kod değiştirmeden yapılandırın"
      icon="🔀"
      breadcrumbs={[{ label: "İletişim" }, { label: "Yönlendirme Kuralları" }]}
      actions={
        <button type="button" className="comm-btn-primary" onClick={openCreate}>
          + Yeni Kural
        </button>
      }
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {success && <div className="comm-alert comm-alert-success">{success}</div>}

      <div className="comm-dash-card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
          Varsayılan departman{" "}
          <Link href="/admin/iletisim/whatsapp-hesaplari" style={{ color: "#0f766e", fontWeight: 600 }}>
            WhatsApp hesabından
          </Link>{" "}
          gelir. Aktif kurallar öncelik sırasıyla (küçük sayı önce) değerlendirilir; ilk eşleşen
          kural departman ve kuyruk durumunu override eder. Eşleşme yoksa mevcut varsayılan davranış
          (koçsuz / bilinmeyen → Yeni Gelenler) uygulanır.
        </p>
      </div>

      {loading ? (
        <p className="comm-studio-muted">Yükleniyor…</p>
      ) : sortedRules.length === 0 ? (
        <div className="comm-card" style={{ textAlign: "center", padding: "2.5rem" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem" }}>📭</span>
          <p className="comm-studio-muted" style={{ margin: "0 0 0.5rem" }}>
            Henüz kural yok.
          </p>
          <p className="comm-studio-muted" style={{ margin: "0 0 1.25rem", fontSize: 13 }}>
            Varsayılan davranış: koçsuz / bilinmeyen numara → Yeni Gelenler kuyruğu.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" className="comm-btn-primary" onClick={addDefaultRule} disabled={saving}>
              {saving ? "Ekleniyor…" : "Varsayılan kuralı ekle"}
            </button>
            <button type="button" className="comm-btn-secondary" onClick={openCreate}>
              Özel kural oluştur
            </button>
          </div>
        </div>
      ) : (
        <div className="comm-table-wrap">
          <table className="comm-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Öncelik</th>
                <th>Koşullar</th>
                <th>Aksiyon</th>
                <th>Aktif</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => openEdit(rule)}
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        fontWeight: 600,
                        color: "#128c7e",
                        cursor: "pointer",
                      }}
                    >
                      {rule.name}
                    </button>
                  </td>
                  <td>{rule.priority}</td>
                  <td>
                    <div className="comm-ops-tags">
                      {conditionChips(rule).map((chip) => (
                        <span key={chip} className="comm-sablon-card-badge">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="comm-ops-tags">
                      {actionChips(rule).map((chip) => (
                        <span key={chip} className="comm-sablon-card-badge">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`comm-filter-chip-toggle${rule.is_active ? " active" : ""}`}
                      disabled={busyId === rule.id}
                      onClick={() => handleToggleActive(rule)}
                    >
                      {rule.is_active ? "Aktif" : "Pasif"}
                    </button>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      className="comm-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.75rem", marginRight: 6 }}
                      onClick={() => openEdit(rule)}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="comm-btn-secondary comm-btn-danger"
                      style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                      disabled={busyId === rule.id}
                      onClick={() => handleDelete(rule)}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerOpen && (
        <>
          <div className="comm-drawer-overlay" onClick={closeDrawer} role="presentation" />
          <div
            className="comm-drawer comm-sablon-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="routing-drawer-title"
          >
            <form onSubmit={handleSubmit} className="comm-sablon-drawer-form">
              <div className="comm-drawer-header">
                <h2 id="routing-drawer-title">{editing ? "Kuralı düzenle" : "Yeni kural"}</h2>
                <button type="button" className="comm-btn-secondary" onClick={closeDrawer}>
                  Kapat
                </button>
              </div>

              <div className="comm-form-field">
                <label htmlFor="rule-name">Kural adı</label>
                <input
                  id="rule-name"
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  placeholder="Örn. Koçsuz → Yeni Gelenler"
                />
              </div>

              <div className="comm-filter-row">
                <div className="comm-form-field">
                  <label htmlFor="rule-dept">Departman (kural)</label>
                  <select
                    id="rule-dept"
                    className="form-control"
                    value={form.department}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, department: e.target.value as CommunicationDepartment }))
                    }
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
                    ))}
                  </select>
                </div>
                <div className="comm-form-field">
                  <label htmlFor="rule-priority">Öncelik</label>
                  <input
                    id="rule-priority"
                    type="number"
                    min={1}
                    max={9999}
                    className="form-control"
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) || 100 }))}
                  />
                  <small className="comm-studio-muted">Küçük sayı önce uygulanır.</small>
                </div>
              </div>

              <label className="comm-recipient-check" style={{ marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                <span><strong>Aktif</strong></span>
              </label>

              <div className="comm-filter-block-title">Koşullar</div>
              <div className="comm-form-field">
                <label htmlFor="rule-has-coach">Koç durumu</label>
                <select
                  id="rule-has-coach"
                  className="form-control"
                  value={form.has_coach}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, has_coach: e.target.value as HasCoachFilter }))
                  }
                >
                  <option value="any">Fark etmez</option>
                  <option value="no">Koçu yok</option>
                  <option value="yes">Koçu var</option>
                </select>
              </div>

              <div className="comm-form-field">
                <div className="comm-filter-block-title">İletişim tipi</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {CONTACT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`comm-filter-chip-toggle${form.contact_types.includes(t) ? " active" : ""}`}
                      onClick={() => toggleContactType(t)}
                    >
                      {ROUTING_CONTACT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <small className="comm-studio-muted">Boş bırakılırsa tüm tipler.</small>
              </div>

              <div className="comm-filter-block-title" style={{ marginTop: 12 }}>Aksiyonlar</div>
              <div className="comm-form-field">
                <label htmlFor="rule-queue-behavior">Kuyruk davranışı</label>
                <select
                  id="rule-queue-behavior"
                  className="form-control"
                  value={form.queue_behavior}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      queue_behavior: e.target.value as RoutingQueueBehavior | "",
                    }))
                  }
                >
                  <option value="">Seçilmedi</option>
                  {QUEUE_BEHAVIORS.map((b) => (
                    <option key={b} value={b}>{ROUTING_QUEUE_BEHAVIOR_LABELS[b]}</option>
                  ))}
                </select>
              </div>

              <div className="comm-filter-row">
                <div className="comm-form-field">
                  <label htmlFor="rule-set-status">Durum (opsiyonel)</label>
                  <select
                    id="rule-set-status"
                    className="form-control"
                    value={form.set_status}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, set_status: e.target.value as RoutingSetStatus | "" }))
                    }
                  >
                    {SET_STATUSES.map((s) => (
                      <option key={s || "none"} value={s}>
                        {s || "Kuyruk davranışından"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="comm-form-field">
                  <label htmlFor="rule-set-dept">Departman override</label>
                  <select
                    id="rule-set-dept"
                    className="form-control"
                    value={form.set_department}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        set_department: e.target.value as CommunicationDepartment | "",
                      }))
                    }
                  >
                    <option value="">Kural departmanı</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="comm-step-actions" style={{ marginTop: 16 }}>
                <button type="button" className="comm-btn-secondary" onClick={closeDrawer}>
                  İptal
                </button>
                <button type="submit" className="comm-btn-primary" disabled={saving}>
                  {saving ? "Kaydediliyor…" : editing ? "Güncelle" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </CommunicationPageShell>
  );
}
