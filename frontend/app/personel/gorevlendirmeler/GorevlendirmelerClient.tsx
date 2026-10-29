"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePersonelPath } from "@/components/personel/PersonelPathProvider";
import { useKurum } from "@/lib/contexts/KurumContext";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/resolve-media-url";
import AppDatePicker from "@/components/ui/AppDatePicker";

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : (parts[0][1] ?? "");
  return (first + last).toLocaleUpperCase("tr-TR");
}

function avatarTone(name: string) {
  const tones = ["a", "b", "c", "d", "e", "f"] as const;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % tones.length;
  return tones[hash];
}

function roleTone(role: string | null) {
  const value = (role || "").toLocaleLowerCase("tr-TR");
  if (value.includes("öğretmen")) return "teacher";
  if (value.includes("koç")) return "coach";
  if (value.includes("yönetici") || value.includes("müdür")) return "lead";
  return "other";
}

// Types
interface Gorevlendirme {
  id: number;
  personel_id: number;
  personel_ad: string;
  personel_fotograf: string | null;
  egitim_yili_id: number;
  egitim_yili_ad: string;
  gorev_sube_id: number;
  gorev_sube_ad: string | null;
  rol_id: number | null;
  rol_ad: string | null;
  brans_id: number | null;
  brans_ad: string | null;
  gorev_baslangic: string | null;
  gorev_bitis: string | null;
  aktif_mi: boolean;
  notlar: string;
}

interface Personel {
  id: number;
  ad: string;
}

interface Sube {
  id: number;
  ad: string;
  kod: string;
}

interface Rol {
  id: number;
  ad: string;
  kod: string;
  level: number;
  is_system_role: boolean;
}

interface Brans {
  id: number;
  ad: string;
  kod: string;
}

interface HelperData {
  personeller: Personel[];
  subeler: Sube[];
  roller: Rol[];
  branslar: Brans[];
}

export default function GorevlendirmelerClient() {
  const { basePath: personelHomeHref } = usePersonelPath();
  const { activeEgitimYili } = useKurum();
  const searchParams = useSearchParams();
  const prefilledPersonelRef = useRef(false);
  // Data states
  const [gorevlendirmeler, setGorevlendirmeler] = useState<Gorevlendirme[]>([]);
  const [helperData, setHelperData] = useState<HelperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");

  // Drawer states
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState<Gorevlendirme | null>(null);

  // Form data — egitim_yili_id üst menüden gelir
  const [formData, setFormData] = useState({
    personel_id: "" as number | "",
    egitim_yili_id: "" as number | "",
    gorev_sube_id: "" as number | "",
    rol_id: "" as number | "",
    brans_id: "" as number | "",
    gorev_baslangic: "",
    gorev_bitis: "",
    aktif_mi: true,
    notlar: "",
  });

  const selectedYilId = activeEgitimYili?.id ?? null;

  // Fetch helper data (personeller, şubeler, roller)
  const fetchHelperData = useCallback(async () => {
    try {
      const result = await apiGet<HelperData>("/personel/api/gorevlendirme/helper-data/");
      if (result.success && result.data) {
        setHelperData(result.data);
      }
    } catch (err) {
      console.error("Helper data yüklenemedi:", err);
    }
  }, []);

  // Fetch gorevlendirmeler — seçili eğitim yılına göre
  const fetchGorevlendirmeler = useCallback(async () => {
    if (!selectedYilId) {
      setGorevlendirmeler([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<{ gorevlendirmeler?: Gorevlendirme[] }>(
        `/personel/api/gorevlendirmeler/?egitim_yili_id=${selectedYilId}`,
      );
      if (result.success) {
        setGorevlendirmeler(
          (result.gorevlendirmeler ?? result.data?.gorevlendirmeler ?? []) as Gorevlendirme[],
        );
      } else {
        setError(result.error || "Veri yüklenemedi");
      }
    } catch (err) {
      setError("Veri yüklenirken hata oluştu");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedYilId]);

  // Initial load
  useEffect(() => {
    fetchHelperData();
  }, [fetchHelperData]);

  // Fetch when context year changes
  useEffect(() => {
    fetchGorevlendirmeler();
  }, [fetchGorevlendirmeler]);

  // Keep form year in sync with topbar selection
  useEffect(() => {
    if (selectedYilId) {
      setFormData((prev) =>
        prev.egitim_yili_id === selectedYilId ? prev : { ...prev, egitim_yili_id: selectedYilId },
      );
    }
  }, [selectedYilId]);

  // Personel detayından ?personel_id= ile gelindiyse formu aç
  useEffect(() => {
    if (prefilledPersonelRef.current || !helperData?.personeller?.length) return;
    const raw = searchParams.get("personel_id");
    if (!raw) return;
    const personelId = Number(raw);
    if (!personelId || !helperData.personeller.some((p) => p.id === personelId)) return;
    prefilledPersonelRef.current = true;
    setFormData({
      personel_id: personelId,
      egitim_yili_id: selectedYilId || "",
      gorev_sube_id: "",
      rol_id: "",
      brans_id: "",
      gorev_baslangic: new Date().toISOString().split("T")[0],
      gorev_bitis: "",
      aktif_mi: true,
      notlar: "",
    });
    setDrawerMode("create");
    setShowDrawer(true);
  }, [searchParams, helperData, selectedYilId]);

  // Reset form
  const resetForm = () => {
    setFormData({
      personel_id: "",
      egitim_yili_id: selectedYilId || "",
      gorev_sube_id: "",
      rol_id: "",
      brans_id: "",
      gorev_baslangic: new Date().toISOString().split("T")[0],
      gorev_bitis: "",
      aktif_mi: true,
      notlar: "",
    });
    setEditingId(null);
  };

  // Open drawer for create
  const handleOpenCreate = () => {
    resetForm();
    setDrawerMode("create");
    setShowDrawer(true);
  };

  // Open drawer for edit
  const handleOpenEdit = (item: Gorevlendirme) => {
    setDrawerMode("edit");
    setEditingId(item.id);
    setFormData({
      personel_id: item.personel_id,
      egitim_yili_id: item.egitim_yili_id,
      gorev_sube_id: item.gorev_sube_id || "",
      rol_id: item.rol_id || "",
      brans_id: item.brans_id || "",
      gorev_baslangic: item.gorev_baslangic || "",
      gorev_bitis: item.gorev_bitis || "",
      aktif_mi: item.aktif_mi,
      notlar: item.notlar || "",
    });
    setShowDrawer(true);
  };

  // Save handler
  const handleSave = async () => {
    // Validation
    if (!formData.personel_id) {
      setError("Personel seçimi zorunludur");
      return;
    }
    if (!formData.egitim_yili_id) {
      setError("Üst menüden eğitim yılı seçin");
      return;
    }
    if (!formData.gorev_sube_id) {
      setError("Görev şubesi seçimi zorunludur");
      return;
    }
    if (!formData.rol_id) {
      setError("Rol seçimi zorunludur");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        personel_id: formData.personel_id || null,
        egitim_yili_id: formData.egitim_yili_id || null,
        gorev_sube_id: formData.gorev_sube_id || null,
        rol_id: formData.rol_id || null,
        brans_id: formData.brans_id || null,
        gorev_baslangic: formData.gorev_baslangic || null,
        gorev_bitis: formData.gorev_bitis || null,
        aktif_mi: formData.aktif_mi,
        notlar: formData.notlar,
      };

      const result =
        drawerMode === "create"
          ? await apiPost("/personel/api/gorevlendirme/create/", payload)
          : await apiPut(`/personel/api/gorevlendirme/${editingId}/`, payload);

      if (result.success) {
        setShowDrawer(false);
        resetForm();
        setSuccessMessage(drawerMode === "create" ? "Görevlendirme oluşturuldu" : "Görevlendirme güncellendi");
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchGorevlendirmeler();
      } else {
        setError(result.error || "Kayıt başarısız");
      }
    } catch (err) {
      setError("Kayıt sırasında hata oluştu");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Delete click handler
  const handleDeleteClick = (item: Gorevlendirme) => {
    setDeletingItem(item);
    setShowDeleteConfirm(true);
  };

  // Delete confirm handler
  const handleDelete = async () => {
    if (!deletingItem) return;

    setSaving(true);
    setError(null);

    try {
      const result = await apiDelete(`/personel/api/gorevlendirme/${deletingItem.id}/`);

      if (result.success) {
        setShowDeleteConfirm(false);
        setDeletingItem(null);
        setSuccessMessage("Görevlendirme silindi");
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchGorevlendirmeler();
      } else {
        setError(result.error || "Silme başarısız");
      }
    } catch (err) {
      setError("Silme sırasında hata oluştu");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Filter data by search term
  const filteredGorevlendirmeler = gorevlendirmeler.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.personel_ad?.toLowerCase().includes(term) ||
      item.brans_ad?.toLowerCase().includes(term) ||
      item.rol_ad?.toLowerCase().includes(term) ||
      item.gorev_sube_ad?.toLowerCase().includes(term)
    );
  });

  const personGroups = Array.from(
    filteredGorevlendirmeler.reduce((groups, item) => {
      const current = groups.get(item.personel_id) ?? [];
      current.push(item);
      groups.set(item.personel_id, current);
      return groups;
    }, new Map<number, Gorevlendirme[]>()),
  ).sort(([, left], [, right]) => (left[0]?.personel_ad || "").localeCompare(right[0]?.personel_ad || "", "tr"));

  const repeatedDuty = (item: Gorevlendirme, siblings: Gorevlendirme[]) =>
    siblings.some((other) => {
      if (other.id === item.id) return false;
      if (item.brans_id && other.brans_id === item.brans_id) return true;
      return !item.brans_id && !other.brans_id && other.rol_id === item.rol_id && other.gorev_sube_id === item.gorev_sube_id;
    });

  // Stats
  const totalCount = gorevlendirmeler.length;
  const aktifCount = gorevlendirmeler.filter(g => g.aktif_mi).length;
  const personelCount = new Set(gorevlendirmeler.map((item) => item.personel_id)).size;

  // Get drawer title
  const getDrawerTitle = () => {
    return drawerMode === "create" ? "Yeni Görevlendirme" : "Görevlendirme Düzenle";
  };

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR");
  };

  // Render table
  const renderTable = () => {
    if (loading) {
      return (
        <div className="gv-loading-state">
          <div className="gv-spinner"></div>
          <span>Yükleniyor...</span>
        </div>
      );
    }

    if (!selectedYilId) {
      return (
        <div className="gv-empty-state">
          <div className="gv-empty-state-icon">📅</div>
          <h4>Eğitim Yılı Seçilmedi</h4>
          <p>Görevlendirmeleri görüntülemek için üst menüden bir eğitim yılı seçin</p>
        </div>
      );
    }

    if (filteredGorevlendirmeler.length === 0) {
      return (
        <div className="gv-empty-state">
          <div className="gv-empty-state-icon">📋</div>
          <h4>Henüz görevlendirme yok</h4>
          <p>İlk görevlendirmeyi ekleyerek başlayın</p>
          <button className="gv-btn gv-btn-primary" onClick={handleOpenCreate}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Ekle
          </button>
        </div>
      );
    }

    return (
      <div className="gv-people">
        {personGroups.map(([personelId, items]) => {
          const first = items[0];
          const branches = Array.from(new Set(items.map((item) => item.gorev_sube_ad).filter(Boolean)));
          const hasRepeat = items.some((item) => repeatedDuty(item, items));
          const photo = resolveMediaUrl(first.personel_fotograf);
          return (
            <article key={personelId} className="gv-person">
              <Link href={`${personelHomeHref}/${personelId}`} className="gv-person-id">
                <span className={`gv-avatar tone-${avatarTone(first.personel_ad)}`}>
                  {photo ? <img src={photo} alt="" /> : personInitials(first.personel_ad)}
                </span>
                <span className="gv-person-copy">
                  <span className="gv-person-name">{first.personel_ad}</span>
                  <span className="gv-person-meta">
                    {branches.join(" · ") || "Şube yok"}
                    {" · "}
                    {items.length} görev
                  </span>
                </span>
              </Link>
              <div className="gv-duties">
                {items.map((item) => {
                  const start = item.gorev_baslangic ? formatDate(item.gorev_baslangic) : "";
                  const end = item.gorev_bitis ? formatDate(item.gorev_bitis) : "";
                  const dates = start && end ? `${start} – ${end}` : start || end || "Tarih yok";
                  return (
                    <div
                      key={item.id}
                      className={`gv-duty tone-${roleTone(item.rol_ad)}${repeatedDuty(item, items) ? " is-duplicate" : ""}${item.aktif_mi ? "" : " is-passive"}`}
                    >
                      <span className="gv-duty-mark" />
                      <div className="gv-duty-copy">
                        <strong>
                          {item.rol_ad || "Görev"}
                          {item.brans_ad ? <em>{item.brans_ad}</em> : null}
                        </strong>
                        <span>
                          {dates}
                          {item.aktif_mi ? null : <i className="gv-passive">Pasif</i>}
                        </span>
                      </div>
                      <div className="gv-duty-actions">
                        <button className="gv-row-action-btn" type="button" title="Düzenle" onClick={() => handleOpenEdit(item)}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button className="gv-row-action-btn gv-danger" type="button" title="Sil" onClick={() => handleDeleteClick(item)}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {hasRepeat ? (
                  <p className="gv-duty-note">Aynı branş veya aynı rol birden fazla kez kayıtlı. Fazla olanı silebilirsiniz.</p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <div className="gv-section">
      <div className="gv-toolbar">
        <div className="gv-stats">
          <div className="gv-stat">
            <strong>{personelCount}</strong>
            <span>personel</span>
          </div>
          <div className="gv-stat">
            <strong>{totalCount}</strong>
            <span>görev</span>
          </div>
          <div className="gv-stat">
            <strong>{aktifCount}</strong>
            <span>aktif</span>
          </div>
        </div>
        <div className="gv-toolbar-actions">
          <div className="gv-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="İsim, rol veya branş"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="gv-btn gv-btn-primary" onClick={handleOpenCreate} disabled={!selectedYilId}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Yeni görevlendirme
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="gv-alert gv-alert-danger">
          {error}
          <button className="gv-alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {successMessage && (
        <div className="gv-alert gv-alert-success">
          {successMessage}
          <button className="gv-alert-close" onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}

      <div className="gv-card">
        <div className="gv-card-body">{renderTable()}</div>
      </div>

      {/* Drawer */}
      {showDrawer && (
        <>
          <div className="gv-drawer-overlay" onClick={() => setShowDrawer(false)} />
          <div className="gv-drawer">
            <div className="gv-drawer-header">
              <h3>{getDrawerTitle()}</h3>
              <button className="gv-drawer-close" onClick={() => setShowDrawer(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="gv-drawer-body">
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Personel <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={formData.personel_id}
                  onChange={(e) => setFormData({ ...formData, personel_id: e.target.value ? Number(e.target.value) : "" })}
                >
                  <option value="">Personel Seçin</option>
                  {helperData?.personeller?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ad}
                    </option>
                  ))}
                </select>
              </div>

              <div className="gv-form-group">
                <label className="gv-form-label">
                  Görev Şubesi <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={formData.gorev_sube_id}
                  onChange={(e) => setFormData({ ...formData, gorev_sube_id: e.target.value ? Number(e.target.value) : "" })}
                >
                  <option value="">Şube Seçin</option>
                  {helperData?.subeler?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ad} {s.kod ? `(${s.kod})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="gv-form-group">
                <label className="gv-form-label">
                  Rol <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={formData.rol_id}
                  onChange={(e) => setFormData({ ...formData, rol_id: e.target.value ? Number(e.target.value) : "" })}
                >
                  <option value="">Rol Seçin</option>
                  {helperData?.roller?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ad} {r.is_system_role ? '🔒' : ''} {r.kod ? `(${r.kod})` : ""}
                    </option>
                  ))}
                </select>
                <small className="gv-form-help">🔒 Sistem rolleri değiştirilemez</small>
              </div>

              <div className="gv-form-group">
                <label className="gv-form-label">Branş</label>
                <select
                  className="gv-form-select"
                  value={formData.brans_id}
                  onChange={(e) => setFormData({ ...formData, brans_id: e.target.value ? Number(e.target.value) : "" })}
                >
                  <option value="">Branş Seçin (Opsiyonel)</option>
                  {helperData?.branslar?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.ad} {b.kod ? `(${b.kod})` : ""}
                    </option>
                  ))}
                </select>
                <small className="gv-form-help">Öğretmenler için branş seçimi yapın</small>
              </div>

              <div className="gv-form-row">
                <div className="gv-form-group">
                  <label className="gv-form-label">Başlangıç Tarihi</label>
                  <AppDatePicker
                    className="gv-form-input"
                    style={{ height: 40 }}
                    value={formData.gorev_baslangic}
                    onChange={(iso) => setFormData({ ...formData, gorev_baslangic: iso })}
                  />
                </div>
                <div className="gv-form-group">
                  <label className="gv-form-label">Bitiş Tarihi</label>
                  <AppDatePicker
                    className="gv-form-input"
                    style={{ height: 40 }}
                    value={formData.gorev_bitis}
                    onChange={(iso) => setFormData({ ...formData, gorev_bitis: iso })}
                  />
                </div>
              </div>

              <div className="gv-form-group">
                <label className="gv-form-label">Notlar</label>
                <textarea
                  className="gv-form-textarea"
                  placeholder="Görevlendirme hakkında notlar..."
                  value={formData.notlar}
                  onChange={(e) => setFormData({ ...formData, notlar: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="gv-form-group">
                <label className="gv-form-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.aktif_mi}
                    onChange={(e) => setFormData({ ...formData, aktif_mi: e.target.checked })}
                  />
                  <span className="gv-checkbox-text">Aktif</span>
                </label>
              </div>
            </div>
            <div className="gv-drawer-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => setShowDrawer(false)}>
                İptal
              </button>
              <button className="gv-btn gv-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingItem && (
        <>
          <div className="gv-modal-overlay" onClick={() => setShowDeleteConfirm(false)} />
          <div className="gv-modal">
            <div className="gv-modal-header">
              <h3>Görevlendirme Silme</h3>
              <button className="gv-modal-close" onClick={() => setShowDeleteConfirm(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="gv-modal-body">
              <p>
                <strong>&quot;{deletingItem.personel_ad}&quot;</strong> personelinin görevlendirmesini silmek istediğinize emin misiniz?
              </p>
            </div>
            <div className="gv-modal-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                İptal
              </button>
              <button className="gv-btn gv-btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
