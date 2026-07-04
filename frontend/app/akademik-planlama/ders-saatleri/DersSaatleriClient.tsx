"use client";

import { useState, useEffect, useCallback } from "react";
import { getContextHeaders } from "@/lib/api";

// Types
interface ScheduleTemplate {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  kurum: number;
  kurum_name: string;
  sube: number | null;
  sube_name: string | null;
  timeslot_count: number;
  created_at: string;
  updated_at: string;
}

interface TimeSlot {
  id: number;
  schedule_template: number;
  template_name: string;
  name: string;
  start_time: string;
  end_time: string;
  order: number;
  is_break: boolean;
  is_active: boolean;
  duration: number;
  duration_display: string;
  start_time_display: string;
  end_time_display: string;
  created_at: string;
  updated_at: string;
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface GeneratorConfig {
  start_time: string;
  lesson_duration: number;
  short_break_duration: number;
  lesson_count: number;
  lunch_break_enabled: boolean;
  lunch_break_after_lesson: number;
  lunch_break_duration: number;
  evening_break_enabled: boolean;
  evening_break_after_lesson: number;
  evening_break_duration: number;
  overwrite_existing: boolean;
}

interface GeneratedSlot {
  order: number;
  name: string;
  start_time: string;
  end_time: string;
  slot_type: string;
  slot_type_display: string;
  duration: number;
  is_break: boolean;
}

interface GeneratorPreview {
  preview: GeneratedSlot[];
  summary: {
    total_slots: number;
    lesson_count: number;
    break_count: number;
    total_lesson_time: number;
    total_break_time: number;
    total_time: number;
    start_time: string;
    end_time: string;
  };
  existing: {
    has_existing: boolean;
    existing_count: number;
    template_name: string;
  };
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function apiFetch(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${BACKEND_URL}${path}`;
  return fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...getContextHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

// API Functions
async function fetchTemplates(): Promise<ScheduleTemplate[]> {
  const res = await apiFetch("/api/academic/schedule-templates/");
  const data = await res.json();
  if (data.success) return data.data;
  throw new Error(data.error || "Şablonlar yüklenemedi");
}

async function fetchTimeSlots(templateId: number): Promise<TimeSlot[]> {
  const res = await apiFetch(`/api/academic/schedule-templates/${templateId}/timeslots/`);
  const data = await res.json();
  if (data.success) return data.data;
  throw new Error(data.error || "Ders saatleri yüklenemedi");
}

async function createTemplate(data: Partial<ScheduleTemplate>): Promise<ScheduleTemplate> {
  const res = await apiFetch(`/api/academic/schedule-templates/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (result.success) return result.data;
  throw new Error(result.errors?.name?.[0] || result.error || "Şablon oluşturulamadı");
}

async function updateTemplate(id: number, data: Partial<ScheduleTemplate>): Promise<ScheduleTemplate> {
  const res = await apiFetch(`/api/academic/schedule-templates/${id}/update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (result.success) return result.data;
  throw new Error(result.errors?.name?.[0] || result.error || "Şablon güncellenemedi");
}

async function deleteTemplate(id: number): Promise<void> {
  const res = await apiFetch(`/api/academic/schedule-templates/${id}/delete/`, {
    method: "DELETE",
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || "Şablon silinemedi");
}

async function createTimeSlot(data: Partial<TimeSlot>): Promise<TimeSlot> {
  const res = await apiFetch(`/api/academic/timeslots/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (result.success) return result.data;
  
  // Zaman çakışması hatası için özel mesaj
  const errorMsg = result.errors?.start_time?.[0] || result.errors?.order?.[0] || result.errors?.name?.[0] || result.error;
  if (errorMsg && errorMsg.includes('çakışıyor')) {
    throw { type: 'conflict', message: errorMsg };
  }
  if (errorMsg && errorMsg.includes('sırada')) {
    throw { type: 'order', message: errorMsg };
  }
  throw new Error(errorMsg || "Ders saati oluşturulamadı");
}

async function updateTimeSlot(id: number, data: Partial<TimeSlot>): Promise<TimeSlot> {
  const res = await apiFetch(`/api/academic/timeslots/${id}/update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (result.success) return result.data;
  
  // Zaman çakışması hatası için özel mesaj
  const errorMsg = result.errors?.start_time?.[0] || result.errors?.order?.[0] || result.error;
  if (errorMsg && errorMsg.includes('çakışıyor')) {
    throw { type: 'conflict', message: errorMsg };
  }
  if (errorMsg && errorMsg.includes('sırada')) {
    throw { type: 'order', message: errorMsg };
  }
  throw new Error(errorMsg || "Ders saati güncellenemedi");
}

async function deleteTimeSlot(id: number): Promise<void> {
  const res = await apiFetch(`/api/academic/timeslots/${id}/delete/`, {
    method: "DELETE",
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || "Ders saati silinemedi");
}

async function bulkDeleteTimeSlots(templateId: number): Promise<number> {
  const res = await apiFetch(`/api/academic/schedule-templates/${templateId}/timeslots/bulk-delete/`, {
    method: "DELETE",
  });
  const result = await res.json();
  if (result.success) return result.deleted_count;
  throw new Error(result.error || "Ders saatleri silinemedi");
}

async function generatePreview(templateId: number, config: GeneratorConfig): Promise<GeneratorPreview> {
  const res = await apiFetch(`/api/academic/timeslots/generate-preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schedule_template_id: templateId,
      ...config
    }),
  });
  const result = await res.json();
  if (result.success) return result.data;
  throw new Error(result.errors?.start_time?.[0] || result.error || "Önizleme oluşturulamadı");
}

async function generateCreate(templateId: number, config: GeneratorConfig): Promise<TimeSlot[]> {
  const res = await apiFetch(`/api/academic/timeslots/generate-create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schedule_template_id: templateId,
      ...config
    }),
  });
  const result = await res.json();
  if (result.success) return result.data.slots;
  
  // Conflict (mevcut slotlar var)
  if (res.status === 409) {
    throw { type: 'conflict', message: result.error, existing: result.existing };
  }
  throw new Error(result.error || "Ders saatleri oluşturulamadı");
}

export default function DersSaatleriClient() {
  // State
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ScheduleTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Drawer states
  const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);
  const [showSlotDrawer, setShowSlotDrawer] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScheduleTemplate | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  
  // Form states
  const [templateForm, setTemplateForm] = useState({ name: "", description: "" });
  const [slotForm, setSlotForm] = useState({ name: "", start_time: "", end_time: "", order: 1, is_break: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Slot drawer tab state
  const [slotDrawerTab, setSlotDrawerTab] = useState<'manual' | 'bulk'>('manual');
  
  // Generator states
  const [generatorConfig, setGeneratorConfig] = useState<GeneratorConfig>({
    start_time: "08:30",
    lesson_duration: 40,
    short_break_duration: 10,
    lesson_count: 8,
    lunch_break_enabled: true,
    lunch_break_after_lesson: 4,
    lunch_break_duration: 60,
    evening_break_enabled: false,
    evening_break_after_lesson: 8,
    evening_break_duration: 30,
    overwrite_existing: false
  });
  const [generatorPreview, setGeneratorPreview] = useState<GeneratorPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const showToast = (type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };
  
  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchTemplates();
      setTemplates(data);
      if (data.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedTemplate]);

  // Load time slots for selected template
  const loadTimeSlots = useCallback(async () => {
    if (!selectedTemplate) {
      setTimeSlots([]);
      return;
    }
    try {
      setSlotsLoading(true);
      const data = await fetchTimeSlots(selectedTemplate.id);
      setTimeSlots(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTimeSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  // Template handlers
  const handleCreateTemplate = async () => {
    if (!templateForm.name.trim()) {
      setFormError("Şablon adı zorunludur");
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      const newTemplate = await createTemplate({
        name: templateForm.name.trim(),
        description: templateForm.description.trim(),
        kurum: 1, // TODO: Get from context
      });
      setTemplates([...templates, newTemplate]);
      setSelectedTemplate(newTemplate);
      setShowTemplateDrawer(false);
      setTemplateForm({ name: "", description: "" });
      showToast('success', 'Başarılı', `"${newTemplate.name}" şablonu oluşturuldu`);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !templateForm.name.trim()) {
      setFormError("Şablon adı zorunludur");
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      const updated = await updateTemplate(editingTemplate.id, {
        name: templateForm.name.trim(),
        description: templateForm.description.trim(),
      });
      setTemplates(templates.map(t => t.id === updated.id ? updated : t));
      if (selectedTemplate?.id === updated.id) {
        setSelectedTemplate(updated);
      }
      setShowTemplateDrawer(false);
      setEditingTemplate(null);
      setTemplateForm({ name: "", description: "" });
      showToast('success', 'Başarılı', `"${updated.name}" şablonu güncellendi`);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: ScheduleTemplate) => {
    if (!confirm(`"${template.name}" şablonunu silmek istediğinize emin misiniz? Tüm ders saatleri de silinecektir.`)) return;
    try {
      await deleteTemplate(template.id);
      const remaining = templates.filter(t => t.id !== template.id);
      setTemplates(remaining);
      if (selectedTemplate?.id === template.id) {
        setSelectedTemplate(remaining[0] || null);
      }
      showToast('success', 'Silindi', `"${template.name}" şablonu silindi`);
    } catch (err: any) {
      showToast('error', 'Hata', err.message);
    }
  };

  // TimeSlot handlers
  const handleCreateSlot = async () => {
    if (!selectedTemplate) return;
    if (!slotForm.name.trim() || !slotForm.start_time || !slotForm.end_time) {
      setFormError("Tüm alanları doldurun");
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      const newSlot = await createTimeSlot({
        schedule_template: selectedTemplate.id,
        name: slotForm.name.trim(),
        start_time: slotForm.start_time,
        end_time: slotForm.end_time,
        order: slotForm.order,
        is_break: slotForm.is_break,
      });
      setTimeSlots([...timeSlots, newSlot].sort((a, b) => a.order - b.order));
      setShowSlotDrawer(false);
      setSlotForm({ name: "", start_time: "", end_time: "", order: timeSlots.length + 2, is_break: false });
      showToast('success', 'Başarılı', `"${newSlot.name}" ders saati eklendi`);
    } catch (err: any) {
      if (err.type === 'conflict') {
        showToast('warning', 'Zaman Çakışması', err.message);
        setFormError(null);
      } else if (err.type === 'order') {
        showToast('warning', 'Sıra Çakışması', err.message);
        setFormError(null);
      } else {
        setFormError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSlot = async () => {
    if (!editingSlot || !slotForm.name.trim() || !slotForm.start_time || !slotForm.end_time) {
      setFormError("Tüm alanları doldurun");
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      const updated = await updateTimeSlot(editingSlot.id, {
        name: slotForm.name.trim(),
        start_time: slotForm.start_time,
        end_time: slotForm.end_time,
        order: slotForm.order,
        is_break: slotForm.is_break,
      });
      setTimeSlots(timeSlots.map(s => s.id === updated.id ? updated : s).sort((a, b) => a.order - b.order));
      setShowSlotDrawer(false);
      setEditingSlot(null);
      setSlotForm({ name: "", start_time: "", end_time: "", order: timeSlots.length + 1, is_break: false });
      showToast('success', 'Başarılı', `"${updated.name}" güncellendi`);
    } catch (err: any) {
      if (err.type === 'conflict') {
        showToast('warning', 'Zaman Çakışması', err.message);
        setFormError(null);
      } else if (err.type === 'order') {
        showToast('warning', 'Sıra Çakışması', err.message);
        setFormError(null);
      } else {
        setFormError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = async (slot: TimeSlot) => {
    if (!confirm(`"${slot.name}" ders saatini silmek istediğinize emin misiniz?`)) return;
    try {
      await deleteTimeSlot(slot.id);
      setTimeSlots(timeSlots.filter(s => s.id !== slot.id));
      showToast('success', 'Silindi', `"${slot.name}" ders saati silindi`);
    } catch (err: any) {
      showToast('error', 'Hata', err.message);
    }
  };

  const handleBulkDeleteSlots = async () => {
    if (!selectedTemplate) return;
    if (timeSlots.length === 0) {
      showToast('info', 'Bilgi', 'Silinecek ders saati yok');
      return;
    }
    
    if (!confirm(`"${selectedTemplate.name}" şablonundaki ${timeSlots.length} adet ders saatini silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`)) return;
    
    try {
      const deletedCount = await bulkDeleteTimeSlots(selectedTemplate.id);
      setTimeSlots([]);
      // Template'in slot sayısını güncelle
      setSelectedTemplate({
        ...selectedTemplate,
        timeslot_count: 0
      });
      setTemplates(templates.map(t => 
        t.id === selectedTemplate.id ? { ...t, timeslot_count: 0 } : t
      ));
      showToast('success', 'Toplu Silme', `${deletedCount} adet ders saati silindi`);
    } catch (err: any) {
      showToast('error', 'Hata', err.message);
    }
  };

  // Generator handlers
  const handleGeneratePreview = async () => {
    if (!selectedTemplate) return;
    try {
      setPreviewLoading(true);
      setFormError(null);
      const preview = await generatePreview(selectedTemplate.id, generatorConfig);
      setGeneratorPreview(preview);
    } catch (err: any) {
      setFormError(err.message);
      setGeneratorPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerateCreate = async () => {
    if (!selectedTemplate || !generatorPreview) return;
    
    // Mevcut slotlar varsa ve overwrite seçili değilse uyar
    if (generatorPreview.existing.has_existing && !generatorConfig.overwrite_existing) {
      const confirm = window.confirm(
        `Bu şablonda ${generatorPreview.existing.existing_count} adet mevcut ders saati var.\n\nDevam ederseniz mevcut ders saatleri silinip yenileri oluşturulacak.\n\nDevam etmek istiyor musunuz?`
      );
      if (!confirm) return;
      // Kullanıcı onayladıysa overwrite_existing'i true yap
      setGeneratorConfig({ ...generatorConfig, overwrite_existing: true });
    }
    
    try {
      setSaving(true);
      setFormError(null);
      const configToUse = generatorPreview.existing.has_existing 
        ? { ...generatorConfig, overwrite_existing: true }
        : generatorConfig;
      const newSlots = await generateCreate(selectedTemplate.id, configToUse);
      setTimeSlots(newSlots);
      setShowSlotDrawer(false);
      setGeneratorPreview(null);
      showToast('success', 'Başarılı', `${newSlots.length} adet ders saati oluşturuldu`);
      // Template'in slot sayısını güncelle
      setSelectedTemplate({
        ...selectedTemplate,
        timeslot_count: newSlots.length
      });
      setTemplates(templates.map(t => 
        t.id === selectedTemplate.id ? { ...t, timeslot_count: newSlots.length } : t
      ));
    } catch (err: any) {
      if (err.type === 'conflict') {
        showToast('warning', 'Mevcut Slotlar', err.message);
      } else {
        setFormError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // Open drawers
  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: "", description: "" });
    setFormError(null);
    setShowTemplateDrawer(true);
  };

  const openEditTemplate = (template: ScheduleTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({ name: template.name, description: template.description || "" });
    setFormError(null);
    setShowTemplateDrawer(true);
  };

  const openNewSlot = () => {
    setEditingSlot(null);
    setSlotForm({ 
      name: "", 
      start_time: "", 
      end_time: "", 
      order: timeSlots.length + 1, 
      is_break: false 
    });
    setFormError(null);
    setSlotDrawerTab('manual');
    setGeneratorPreview(null);
    setShowSlotDrawer(true);
  };

  const openEditSlot = (slot: TimeSlot) => {
    setEditingSlot(slot);
    setSlotForm({
      name: slot.name,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      order: slot.order,
      is_break: slot.is_break,
    });
    setFormError(null);
    setSlotDrawerTab('manual');
    setGeneratorPreview(null);
    setShowSlotDrawer(true);
  };

  // Styles
  const styles = {
    container: { padding: "0" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
    title: { fontSize: "24px", fontWeight: 600, color: "#111827", margin: 0, display: "flex", alignItems: "center", gap: "12px" },
    badge: { backgroundColor: "#dbeafe", color: "#1d4ed8", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 500 },
    btnGroup: { display: "flex", gap: "12px" },
    btn: { padding: "10px 20px", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" },
    primaryBtn: { backgroundColor: "#3b82f6", color: "#fff" },
    secondaryBtn: { backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" },
    dangerBtn: { backgroundColor: "#fef2f2", color: "#dc2626" },
    grid: { display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px" },
    card: { backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden" },
    cardHeader: { padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" },
    cardTitle: { fontSize: "16px", fontWeight: 600, color: "#111827", margin: 0 },
    cardBody: { padding: "0" },
    templateList: { listStyle: "none", padding: 0, margin: 0 },
    templateItem: { padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" },
    templateItemActive: { backgroundColor: "#eff6ff", borderLeft: "3px solid #3b82f6" },
    templateName: { fontWeight: 500, color: "#111827", fontSize: "14px" },
    templateMeta: { fontSize: "12px", color: "#6b7280", marginTop: "2px" },
    table: { width: "100%", borderCollapse: "collapse" as const, fontSize: "14px" },
    th: { padding: "12px 16px", textAlign: "left" as const, fontWeight: 600, color: "#374151", backgroundColor: "#f9fafb", borderBottom: "2px solid #e5e7eb" },
    td: { padding: "12px 16px", borderBottom: "1px solid #e5e7eb", color: "#4b5563" },
    breakRow: { backgroundColor: "#fef3c7" },
    slotName: { fontWeight: 500, color: "#111827" },
    slotTime: { fontFamily: "monospace", fontSize: "13px" },
    emptyState: { textAlign: "center" as const, padding: "48px 16px", color: "#6b7280" },
    icon: { width: "48px", height: "48px", margin: "0 auto 16px", backgroundColor: "#f3f4f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" },
    actions: { display: "flex", gap: "8px" },
    iconBtn: { padding: "6px", background: "none", border: "none", cursor: "pointer", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" },
    // Drawer styles
    drawerOverlay: { position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000 },
    drawer: { position: "fixed" as const, top: 0, right: 0, bottom: 0, width: "420px", backgroundColor: "#fff", boxShadow: "-4px 0 12px rgba(0,0,0,0.1)", zIndex: 1001, display: "flex", flexDirection: "column" as const },
    drawerWide: { position: "fixed" as const, top: 0, right: 0, bottom: 0, width: "600px", backgroundColor: "#fff", boxShadow: "-4px 0 12px rgba(0,0,0,0.1)", zIndex: 1001, display: "flex", flexDirection: "column" as const },
    drawerHeader: { padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" },
    drawerTitle: { fontSize: "18px", fontWeight: 600, color: "#111827", margin: 0 },
    drawerBody: { padding: "24px", flex: 1, overflowY: "auto" as const },
    drawerFooter: { padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "12px", justifyContent: "flex-end" },
    // Tab styles
    tabContainer: { display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: "20px" },
    tab: { flex: 1, padding: "12px 16px", border: "none", background: "none", cursor: "pointer", fontSize: "14px", fontWeight: 500, color: "#6b7280", borderBottom: "2px solid transparent", transition: "all 0.2s" },
    tabActive: { color: "#3b82f6", borderBottomColor: "#3b82f6", backgroundColor: "#eff6ff" },
    formGroup: { marginBottom: "20px" },
    label: { display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: 500, color: "#374151" },
    input: { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" as const },
    textarea: { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", minHeight: "80px", resize: "vertical" as const, boxSizing: "border-box" as const },
    checkbox: { display: "flex", alignItems: "center", gap: "8px" },
    checkboxInput: { width: "18px", height: "18px" },
    error: { backgroundColor: "#fef2f2", color: "#dc2626", padding: "12px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px" },
    loading: { textAlign: "center" as const, padding: "48px", color: "#6b7280" },
    // Toast styles
    toastContainer: { position: "fixed" as const, top: "20px", right: "20px", zIndex: 2000, display: "flex", flexDirection: "column" as const, gap: "12px" },
    toast: { minWidth: "320px", maxWidth: "420px", padding: "16px 20px", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", display: "flex", gap: "12px", alignItems: "flex-start", animation: "slideIn 0.3s ease" },
    toastSuccess: { backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0" },
    toastError: { backgroundColor: "#fef2f2", border: "1px solid #fecaca" },
    toastWarning: { backgroundColor: "#fffbeb", border: "1px solid #fde68a" },
    toastInfo: { backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" },
    toastIcon: { width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 },
    toastContent: { flex: 1 },
    toastTitle: { fontWeight: 600, fontSize: "14px", marginBottom: "4px" },
    toastMessage: { fontSize: "13px", lineHeight: "1.4" },
    toastClose: { background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "4px", opacity: 0.6 },
  };
  
  const getToastStyles = (type: Toast['type']) => {
    switch (type) {
      case 'success': return { bg: styles.toastSuccess, iconBg: "#10b981", iconColor: "#fff", titleColor: "#065f46", msgColor: "#047857" };
      case 'error': return { bg: styles.toastError, iconBg: "#ef4444", iconColor: "#fff", titleColor: "#991b1b", msgColor: "#dc2626" };
      case 'warning': return { bg: styles.toastWarning, iconBg: "#f59e0b", iconColor: "#fff", titleColor: "#92400e", msgColor: "#b45309" };
      case 'info': return { bg: styles.toastInfo, iconBg: "#3b82f6", iconColor: "#fff", titleColor: "#1e40af", msgColor: "#2563eb" };
    }
  };
  
  const getToastIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
    }
  };

  if (loading) {
    return <div style={styles.loading}>Yükleniyor...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div style={styles.toastContainer}>
          {toasts.map(toast => {
            const toastStyle = getToastStyles(toast.type);
            return (
              <div key={toast.id} style={{...styles.toast, ...toastStyle.bg}}>
                <div style={{...styles.toastIcon, backgroundColor: toastStyle.iconBg, color: toastStyle.iconColor}}>
                  {getToastIcon(toast.type)}
                </div>
                <div style={styles.toastContent}>
                  <div style={{...styles.toastTitle, color: toastStyle.titleColor}}>{toast.title}</div>
                  <div style={{...styles.toastMessage, color: toastStyle.msgColor}}>{toast.message}</div>
                </div>
                <button style={styles.toastClose} onClick={() => removeToast(toast.id)}>✕</button>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Ders Saatleri</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Akademik Planlama</span>
              <span>/</span>
              <span>Ders Saatleri</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-hero" onClick={openNewTemplate}>
            <span className="btn-hero-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </span>
            <span>Yeni Şablon</span>
          </button>
          {selectedTemplate && (
            <button className="btn-hero" onClick={openNewSlot}>
              <span className="btn-hero-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>Yeni Ders Saati</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={styles.error}>{error}</div>
      )}

      {/* Main Grid */}
      <div style={styles.grid}>
        {/* Template List */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>Zaman Şablonları</h3>
          </div>
          <div style={styles.cardBody}>
            {templates.length === 0 ? (
              <div style={{...styles.emptyState, padding: "24px"}}>
                <p>Henüz şablon yok</p>
                <button style={{...styles.btn, ...styles.primaryBtn, marginTop: "12px"}} onClick={openNewTemplate}>
                  <span>+</span> Şablon Oluştur
                </button>
              </div>
            ) : (
              <ul style={styles.templateList}>
                {templates.map(template => (
                  <li
                    key={template.id}
                    style={{
                      ...styles.templateItem,
                      ...(selectedTemplate?.id === template.id ? styles.templateItemActive : {})
                    }}
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <div>
                      <div style={styles.templateName}>{template.name}</div>
                      <div style={styles.templateMeta}>{template.timeslot_count} ders saati</div>
                    </div>
                    <div style={styles.actions}>
                      <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); openEditTemplate(template); }} title="Düzenle">
                        ✏️
                      </button>
                      <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template); }} title="Sil">
                        🗑️
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* TimeSlot Table */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              {selectedTemplate ? `${selectedTemplate.name} - Ders Saatleri` : "Ders Saatleri"}
            </h3>
            {selectedTemplate && timeSlots.length > 0 && (
              <button 
                style={{...styles.btn, ...styles.dangerBtn, padding: "6px 12px", fontSize: "12px"}} 
                onClick={handleBulkDeleteSlots}
                title="Tüm ders saatlerini sil"
              >
                🗑️ Tümünü Sil ({timeSlots.length})
              </button>
            )}
          </div>
          <div style={styles.cardBody}>
            {!selectedTemplate ? (
              <div style={styles.emptyState}>
                <div style={styles.icon}>📋</div>
                <h3>Şablon Seçin</h3>
                <p>Ders saatlerini görüntülemek için sol taraftan bir şablon seçin</p>
              </div>
            ) : slotsLoading ? (
              <div style={styles.loading}>Yükleniyor...</div>
            ) : timeSlots.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.icon}>🕐</div>
                <h3>Ders Saati Yok</h3>
                <p>Bu şablona henüz ders saati eklenmemiş</p>
                <button style={{...styles.btn, ...styles.primaryBtn, marginTop: "16px"}} onClick={openNewSlot}>
                  <span>+</span> İlk Ders Saatini Ekle
                </button>
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Sıra</th>
                    <th style={styles.th}>Ad</th>
                    <th style={styles.th}>Başlangıç</th>
                    <th style={styles.th}>Bitiş</th>
                    <th style={styles.th}>Süre</th>
                    <th style={styles.th}>Tip</th>
                    <th style={styles.th}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map(slot => (
                    <tr key={slot.id} style={slot.is_break ? styles.breakRow : {}}>
                      <td style={styles.td}>{slot.order}</td>
                      <td style={{...styles.td, ...styles.slotName}}>{slot.name}</td>
                      <td style={{...styles.td, ...styles.slotTime}}>{slot.start_time_display}</td>
                      <td style={{...styles.td, ...styles.slotTime}}>{slot.end_time_display}</td>
                      <td style={styles.td}>{slot.duration_display}</td>
                      <td style={styles.td}>
                        <span style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 500,
                          backgroundColor: slot.is_break ? "#fef3c7" : "#dcfce7",
                          color: slot.is_break ? "#92400e" : "#166534"
                        }}>
                          {slot.is_break ? "Mola" : "Ders"}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actions}>
                          <button style={styles.iconBtn} onClick={() => openEditSlot(slot)} title="Düzenle">
                            ✏️
                          </button>
                          <button style={styles.iconBtn} onClick={() => handleDeleteSlot(slot)} title="Sil">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Template Drawer */}
      {showTemplateDrawer && (
        <>
          <div style={styles.drawerOverlay} onClick={() => setShowTemplateDrawer(false)} />
          <div style={styles.drawer}>
            <div style={styles.drawerHeader}>
              <h2 style={styles.drawerTitle}>
                {editingTemplate ? "Şablon Düzenle" : "Yeni Şablon"}
              </h2>
              <button style={styles.iconBtn} onClick={() => setShowTemplateDrawer(false)}>✕</button>
            </div>
            <div style={styles.drawerBody}>
              {formError && <div style={styles.error}>{formError}</div>}
              <div style={styles.formGroup}>
                <label style={styles.label}>Şablon Adı *</label>
                <input
                  type="text"
                  style={styles.input}
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({...templateForm, name: e.target.value})}
                  placeholder="Örn: Lise Programı"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Açıklama</label>
                <textarea
                  style={styles.textarea}
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({...templateForm, description: e.target.value})}
                  placeholder="Şablon hakkında kısa açıklama..."
                />
              </div>
            </div>
            <div style={styles.drawerFooter}>
              <button style={{...styles.btn, ...styles.secondaryBtn}} onClick={() => setShowTemplateDrawer(false)}>
                İptal
              </button>
              <button
                style={{...styles.btn, ...styles.primaryBtn}}
                onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                disabled={saving}
              >
                {saving ? "Kaydediliyor..." : (editingTemplate ? "Güncelle" : "Oluştur")}
              </button>
            </div>
          </div>
        </>
      )}

      {/* TimeSlot Drawer with Tabs */}
      {showSlotDrawer && (
        <>
          <div style={styles.drawerOverlay} onClick={() => setShowSlotDrawer(false)} />
          <div style={editingSlot ? styles.drawer : styles.drawerWide}>
            <div style={styles.drawerHeader}>
              <h2 style={styles.drawerTitle}>
                {editingSlot ? "Ders Saati Düzenle" : "Ders Saati Ekle"}
              </h2>
              <button style={styles.iconBtn} onClick={() => setShowSlotDrawer(false)}>✕</button>
            </div>
            
            {/* Tabs - sadece yeni eklerken göster */}
            {!editingSlot && (
              <div style={styles.tabContainer}>
                <button
                  style={{...styles.tab, ...(slotDrawerTab === 'manual' ? styles.tabActive : {})}}
                  onClick={() => { setSlotDrawerTab('manual'); setFormError(null); }}
                >
                  ✏️ Manuel Ekle
                </button>
                <button
                  style={{...styles.tab, ...(slotDrawerTab === 'bulk' ? styles.tabActive : {})}}
                  onClick={() => { setSlotDrawerTab('bulk'); setFormError(null); setGeneratorPreview(null); }}
                >
                  ⚡ Toplu Oluştur
                </button>
              </div>
            )}
            
            <div style={styles.drawerBody}>
              {formError && <div style={styles.error}>{formError}</div>}
              
              {/* Manuel Tab veya Edit Mode */}
              {(slotDrawerTab === 'manual' || editingSlot) && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Slot Adı *</label>
                    <input
                      type="text"
                      style={styles.input}
                      value={slotForm.name}
                      onChange={(e) => setSlotForm({...slotForm, name: e.target.value})}
                      placeholder="Örn: 1. Ders, Teneffüs"
                    />
                  </div>
                  <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px"}}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Başlangıç *</label>
                      <input
                        type="time"
                        style={styles.input}
                        value={slotForm.start_time}
                        onChange={(e) => setSlotForm({...slotForm, start_time: e.target.value})}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Bitiş *</label>
                      <input
                        type="time"
                        style={styles.input}
                        value={slotForm.end_time}
                        onChange={(e) => setSlotForm({...slotForm, end_time: e.target.value})}
                      />
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Sıra No *</label>
                    <input
                      type="number"
                      style={styles.input}
                      value={slotForm.order}
                      onChange={(e) => setSlotForm({...slotForm, order: parseInt(e.target.value) || 1})}
                      min={1}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.checkbox}>
                      <input
                        type="checkbox"
                        style={styles.checkboxInput}
                        checked={slotForm.is_break}
                        onChange={(e) => setSlotForm({...slotForm, is_break: e.target.checked})}
                      />
                      <span>Bu bir mola/teneffüs</span>
                    </label>
                  </div>
                </>
              )}
              
              {/* Bulk Tab */}
              {slotDrawerTab === 'bulk' && !editingSlot && (
                <>
                  {/* Generator Config Form */}
                  <div style={{backgroundColor: "#f9fafb", padding: "16px", borderRadius: "8px", marginBottom: "20px"}}>
                    <h4 style={{margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#374151"}}>
                      ⚙️ Oluşturucu Ayarları
                    </h4>
                    
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px"}}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>İlk Ders Başlangıç</label>
                        <input
                          type="time"
                          style={styles.input}
                          value={generatorConfig.start_time}
                          onChange={(e) => setGeneratorConfig({...generatorConfig, start_time: e.target.value})}
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Toplam Ders Sayısı</label>
                        <input
                          type="number"
                          style={styles.input}
                          value={generatorConfig.lesson_count}
                          onChange={(e) => setGeneratorConfig({...generatorConfig, lesson_count: parseInt(e.target.value) || 8})}
                          min={1}
                          max={16}
                        />
                      </div>
                    </div>
                    
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px"}}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Ders Süresi (dk)</label>
                        <input
                          type="number"
                          style={styles.input}
                          value={generatorConfig.lesson_duration}
                          onChange={(e) => setGeneratorConfig({...generatorConfig, lesson_duration: parseInt(e.target.value) || 40})}
                          min={10}
                          max={120}
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Teneffüs Süresi (dk)</label>
                        <input
                          type="number"
                          style={styles.input}
                          value={generatorConfig.short_break_duration}
                          onChange={(e) => setGeneratorConfig({...generatorConfig, short_break_duration: parseInt(e.target.value) || 10})}
                          min={5}
                          max={30}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Öğle Arası */}
                  <div style={{backgroundColor: "#fefce8", padding: "16px", borderRadius: "8px", marginBottom: "16px"}}>
                    <label style={{...styles.checkbox, marginBottom: "12px"}}>
                      <input
                        type="checkbox"
                        style={styles.checkboxInput}
                        checked={generatorConfig.lunch_break_enabled}
                        onChange={(e) => setGeneratorConfig({...generatorConfig, lunch_break_enabled: e.target.checked})}
                      />
                      <span style={{fontWeight: 600}}>🍽️ Öğle Arası Ekle</span>
                    </label>
                    
                    {generatorConfig.lunch_break_enabled && (
                      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px"}}>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Kaçıncı Dersten Sonra</label>
                          <input
                            type="number"
                            style={styles.input}
                            value={generatorConfig.lunch_break_after_lesson}
                            onChange={(e) => setGeneratorConfig({...generatorConfig, lunch_break_after_lesson: parseInt(e.target.value) || 4})}
                            min={1}
                            max={generatorConfig.lesson_count}
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Süre (dk)</label>
                          <input
                            type="number"
                            style={styles.input}
                            value={generatorConfig.lunch_break_duration}
                            onChange={(e) => setGeneratorConfig({...generatorConfig, lunch_break_duration: parseInt(e.target.value) || 60})}
                            min={15}
                            max={120}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Akşam Arası */}
                  <div style={{backgroundColor: "#fdf4ff", padding: "16px", borderRadius: "8px", marginBottom: "20px"}}>
                    <label style={{...styles.checkbox, marginBottom: "12px"}}>
                      <input
                        type="checkbox"
                        style={styles.checkboxInput}
                        checked={generatorConfig.evening_break_enabled}
                        onChange={(e) => setGeneratorConfig({...generatorConfig, evening_break_enabled: e.target.checked})}
                      />
                      <span style={{fontWeight: 600}}>🌙 Akşam Arası Ekle (İkili Öğretim)</span>
                    </label>
                    
                    {generatorConfig.evening_break_enabled && (
                      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px"}}>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Kaçıncı Dersten Sonra</label>
                          <input
                            type="number"
                            style={styles.input}
                            value={generatorConfig.evening_break_after_lesson}
                            onChange={(e) => setGeneratorConfig({...generatorConfig, evening_break_after_lesson: parseInt(e.target.value) || 8})}
                            min={generatorConfig.lunch_break_enabled ? generatorConfig.lunch_break_after_lesson + 1 : 1}
                            max={generatorConfig.lesson_count}
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Süre (dk)</label>
                          <input
                            type="number"
                            style={styles.input}
                            value={generatorConfig.evening_break_duration}
                            onChange={(e) => setGeneratorConfig({...generatorConfig, evening_break_duration: parseInt(e.target.value) || 30})}
                            min={15}
                            max={120}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Önizleme Butonu */}
                  <button
                    style={{...styles.btn, ...styles.secondaryBtn, width: "100%", justifyContent: "center"}}
                    onClick={handleGeneratePreview}
                    disabled={previewLoading}
                  >
                    {previewLoading ? "⏳ Hesaplanıyor..." : "👁️ Önizleme Göster"}
                  </button>
                  
                  {/* Önizleme Sonucu */}
                  {generatorPreview && (
                    <div style={{marginTop: "20px"}}>
                      {/* Özet */}
                      <div style={{backgroundColor: "#ecfdf5", padding: "16px", borderRadius: "8px", marginBottom: "16px"}}>
                        <h4 style={{margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#065f46"}}>
                          📊 Özet
                        </h4>
                        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "13px"}}>
                          <div><strong>Toplam Slot:</strong> {generatorPreview.summary.total_slots}</div>
                          <div><strong>Ders:</strong> {generatorPreview.summary.lesson_count}</div>
                          <div><strong>Mola:</strong> {generatorPreview.summary.break_count}</div>
                          <div><strong>Başlangıç:</strong> {generatorPreview.summary.start_time}</div>
                          <div><strong>Bitiş:</strong> {generatorPreview.summary.end_time}</div>
                          <div><strong>Toplam:</strong> {Math.floor(generatorPreview.summary.total_time / 60)}s {generatorPreview.summary.total_time % 60}dk</div>
                        </div>
                      </div>
                      
                      {/* Mevcut Slot Uyarısı */}
                      {generatorPreview.existing.has_existing && (
                        <div style={{backgroundColor: "#fef3c7", padding: "12px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", color: "#92400e"}}>
                          ⚠️ Bu şablonda <strong>{generatorPreview.existing.existing_count}</strong> adet mevcut ders saati var. Oluşturma işlemi bunları silecektir.
                        </div>
                      )}
                      
                      {/* Slot Listesi */}
                      <div style={{maxHeight: "300px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px"}}>
                        <table style={{...styles.table, fontSize: "12px"}}>
                          <thead>
                            <tr>
                              <th style={{...styles.th, padding: "8px"}}>Sıra</th>
                              <th style={{...styles.th, padding: "8px"}}>Ad</th>
                              <th style={{...styles.th, padding: "8px"}}>Saat</th>
                              <th style={{...styles.th, padding: "8px"}}>Tip</th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatorPreview.preview.map((slot, idx) => (
                              <tr key={idx} style={slot.is_break ? styles.breakRow : {}}>
                                <td style={{...styles.td, padding: "8px"}}>{slot.order}</td>
                                <td style={{...styles.td, padding: "8px", fontWeight: 500}}>{slot.name}</td>
                                <td style={{...styles.td, padding: "8px", fontFamily: "monospace"}}>{slot.start_time} - {slot.end_time}</td>
                                <td style={{...styles.td, padding: "8px"}}>
                                  <span style={{
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    backgroundColor: slot.is_break ? "#fef3c7" : "#dcfce7",
                                    color: slot.is_break ? "#92400e" : "#166534"
                                  }}>
                                    {slot.slot_type_display}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div style={styles.drawerFooter}>
              <button style={{...styles.btn, ...styles.secondaryBtn}} onClick={() => setShowSlotDrawer(false)}>
                İptal
              </button>
              
              {/* Manuel Tab veya Edit Mode */}
              {(slotDrawerTab === 'manual' || editingSlot) && (
                <button
                  style={{...styles.btn, ...styles.primaryBtn}}
                  onClick={editingSlot ? handleUpdateSlot : handleCreateSlot}
                  disabled={saving}
                >
                  {saving ? "Kaydediliyor..." : (editingSlot ? "Güncelle" : "Ekle")}
                </button>
              )}
              
              {/* Bulk Tab */}
              {slotDrawerTab === 'bulk' && !editingSlot && generatorPreview && (
                <button
                  style={{...styles.btn, ...styles.primaryBtn}}
                  onClick={handleGenerateCreate}
                  disabled={saving}
                >
                  {saving ? "Oluşturuluyor..." : `✨ ${generatorPreview.summary.total_slots} Slot Oluştur`}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
