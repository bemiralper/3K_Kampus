'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';

import '@/app/admin/takvim/takvim.css';

import {
  fetchEventsCompact, fetchEventDetail, createEvent, updateEvent, deleteEvent,
  moveEvent, resizeEvent, fetchEventTypes, ensureResmiTatiller,
  EVENT_CATEGORY_LABELS, EVENT_STATUS_LABELS,
  type FCEvent, type CalendarEvent, type EventType, type EventFilters,
} from '@/lib/takvim-api';
import { fetchGorevTakvim } from '@/lib/gorev-api';
import { fetchCoachStudents } from '@/lib/coach-api';
import { fetchAssignments } from '@/lib/resources-api';
import { shortEventLabel } from '@/lib/calendar-event-label';

import MiniCalendar from '@/app/admin/takvim/genel/components/MiniCalendar';
import CalendarFilterPanel from '@/app/admin/takvim/genel/components/CalendarFilterPanel';
import CalendarContextBar from '@/app/admin/takvim/genel/components/CalendarContextBar';
import EventTooltip from '@/app/admin/takvim/genel/components/EventTooltip';
import EventDetailPopup from '@/app/admin/takvim/genel/components/EventDetailPopup';
import EventFormDrawer from '@/app/admin/takvim/genel/components/EventFormDrawer';

type ViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

const VIEW_LABELS: { key: ViewType; label: string }[] = [
  { key: 'dayGridMonth', label: 'Ay' },
  { key: 'timeGridWeek', label: 'Hafta' },
  { key: 'timeGridDay', label: 'Gün' },
  { key: 'listWeek', label: 'Liste' },
];

/** Koç için anlamlı türler */
const COACH_CATEGORIES = new Set([
  'ODEV', 'GORUSME', 'CALISMA', 'DENEME', 'GOREV', 'TATIL', 'ETUT', 'DERS',
]);

const COACH_TAKVIM_PREFS_KEY = '3k_coach_takvim_prefs';

type CoachTakvimPrefs = {
  /** null = henüz kaydedilmemiş → ilk açılışta tüm türler */
  typeIds: string[] | null;
  durum?: string;
  ogrenci_id?: number;
  search?: string;
};

function readCoachTakvimPrefs(): CoachTakvimPrefs {
  if (typeof window === 'undefined') return { typeIds: null };
  try {
    const raw = localStorage.getItem(COACH_TAKVIM_PREFS_KEY);
    if (!raw) return { typeIds: null };
    const parsed = JSON.parse(raw) as CoachTakvimPrefs;
    return {
      typeIds: Array.isArray(parsed.typeIds) ? parsed.typeIds.map(String) : null,
      durum: parsed.durum || undefined,
      ogrenci_id: parsed.ogrenci_id ? Number(parsed.ogrenci_id) : undefined,
      search: parsed.search || undefined,
    };
  } catch {
    return { typeIds: null };
  }
}

function writeCoachTakvimPrefs(prefs: CoachTakvimPrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COACH_TAKVIM_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* */ }
}

function gorevMatchesDurum(rawDurum: string | undefined, durum?: string): boolean {
  if (!durum) return true;
  const g = String(rawDurum || '').toUpperCase();
  if (durum === 'SCHEDULED') {
    return ['BEKLIYOR', 'BASLADI', 'SCHEDULED'].includes(g);
  }
  if (durum === 'IN_PROGRESS') {
    return ['DEVAM_EDIYOR', 'IN_PROGRESS', 'BASLADI'].includes(g);
  }
  if (durum === 'COMPLETED') {
    return ['TAMAMLANDI', 'COMPLETED'].includes(g);
  }
  if (durum === 'CANCELLED') {
    return ['IPTAL', 'CANCELLED', 'TAMAMLANMADI'].includes(g);
  }
  return true;
}

/** Ödev assignment status → takvim durum filtresi */
function odevMatchesDurum(assignmentStatus: string | undefined, durum?: string): boolean {
  if (!durum) return true;
  const s = String(assignmentStatus || '').toUpperCase();
  if (durum === 'SCHEDULED') return ['ASSIGNED', 'OVERDUE'].includes(s);
  if (durum === 'IN_PROGRESS') return s === 'IN_PROGRESS';
  if (durum === 'COMPLETED') return s === 'COMPLETED';
  if (durum === 'CANCELLED') return s === 'CANCELLED';
  return true;
}

function odevCalendarDurum(assignmentStatus: string | undefined): string {
  const s = String(assignmentStatus || '').toUpperCase();
  if (s === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'CANCELLED') return 'CANCELLED';
  return 'SCHEDULED'; // ASSIGNED / OVERDUE
}

function toDayKey(iso?: string | null): string {
  if (!iso) return '';
  // Yerel gün — UTC slice kaymasını önle
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CoachTakvimClient() {
  const calRef = useRef<FullCalendar>(null);
  const typesHydratedRef = useRef(false);

  const [events, setEvents] = useState<FCEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [students, setStudents] = useState<{ id: number; ad: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<EventFilters>(() => {
    const prefs = readCoachTakvimPrefs();
    return {
      coach_scope: true,
      durum: prefs.durum,
      ogrenci_id: prefs.ogrenci_id,
      search: prefs.search,
    };
  });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const [selectedDonemId, setSelectedDonemId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('3k_active_donem');
    return stored ? parseInt(stored, 10) : null;
  });

  const [currentView, setCurrentView] = useState<ViewType>('dayGridMonth');
  const [calTitle, setCalTitle] = useState('');
  const [miniDate, setMiniDate] = useState(new Date());
  const [selectedMiniDate, setSelectedMiniDate] = useState<Date | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formDefaults, setFormDefaults] = useState<Partial<CalendarEvent>>({});

  const [tooltip, setTooltip] = useState<{
    title: string; ikon: string; color: string; time: string;
    salon?: string; kategori?: string; durum?: string;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const loadEvents = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    try {
      const f: EventFilters = {
        ...filters,
        coach_scope: true,
      };
      if (start) f.baslangic = start;
      if (end) f.bitis = end;
      if (selectedDonemId) f.donem_id = selectedDonemId;

      const gorevParams: Record<string, string> = {};
      if (start) gorevParams.baslangic = start;
      if (end) gorevParams.bitis = end;

      const dueFrom = start ? toDayKey(start) : undefined;
      const dueTo = end ? toDayKey(end) : undefined;

      const [takvimRes, gorevRes, odevRes] = await Promise.all([
        fetchEventsCompact(f),
        fetchGorevTakvim(gorevParams),
        fetchAssignments({
          due_from: dueFrom,
          due_to: dueTo,
          student_id: filters.ogrenci_id,
        }),
      ]);

      const takvimData = takvimRes.success && takvimRes.data ? takvimRes.data : [];
      const gorevData = gorevRes.success && gorevRes.data ? gorevRes.data : [];
      const odevList = odevRes.success && Array.isArray(odevRes.data) ? odevRes.data : [];

      const syncedAtamaIds = new Set(
        takvimData
          .filter(e => e.extendedProps?.kaynak_modul === 'gorev')
          .map(e => String(e.extendedProps?.kaynak_id || e.extendedProps?.atama_id || ''))
          .filter(Boolean),
      );
      const searchQ = (filters.search || '').trim().toLowerCase();
      const studentId = filters.ogrenci_id;
      const odevTypeId = eventTypes.find(t => t.kategori === 'ODEV')?.id;

      // Ödev senkronlarını düş — başlık/kontrol günü için assignment listesi kaynak olsun
      const merged: FCEvent[] = takvimData.filter(
        e => e.extendedProps?.kaynak_modul !== 'odev' && e.extendedProps?.kategori !== 'ODEV',
      );
      for (const g of gorevData) {
        if (syncedAtamaIds.has(String(g.id))) continue;
        if (studentId) continue; // görevlerde öğrenci yok — öğrenci filtresinde gizle
        if (searchQ && !(g.title || '').toLowerCase().includes(searchQ)) continue;
        if (!gorevMatchesDurum(g.extendedProps?.durum as string | undefined, filters.durum)) continue;

        merged.push({
          ...g,
          extendedProps: {
            ...g.extendedProps,
            kaynak: 'gorev',
            kaynak_modul: 'gorev',
            atama_id: g.id,
            ikon: (g.extendedProps?.ikon as string) || '✅',
            kategori: 'GOREV',
          },
        });
      }

      // Ödev kontrol günleri — başlık: "{Öğrenci} · Ödev kontrol"
      for (const a of odevList) {
        if (!a?.id || !a.due_date) continue;
        if (['DRAFT', 'CANCELLED', 'COMPLETED'].includes(String(a.status || '').toUpperCase())) {
          continue;
        }
        if (studentId && a.student !== studentId) continue;
        if (!odevMatchesDurum(a.status, filters.durum)) continue;
        const studentName = (a.student_name || '').trim() || 'Öğrenci';
        const title = `${studentName} · Ödev kontrol`;
        if (
          searchQ
          && !title.toLowerCase().includes(searchQ)
          && !studentName.toLowerCase().includes(searchQ)
        ) {
          continue;
        }
        const day = toDayKey(a.due_date);
        if (!day) continue;

        merged.push({
          id: `odev-virt-${a.id}`,
          title, // ikon ayrı (extendedProps.ikon) — başlığa emoji koyma
          start: day,
          end: day,
          allDay: true,
          color: '#F97316',
          extendedProps: {
            kaynak: 'odev',
            kaynak_modul: 'odev',
            kaynak_id: String(a.id),
            assignment_id: a.id,
            ogrenci_ids: a.student ? [a.student] : [],
            event_type_id: odevTypeId,
            kategori: 'ODEV',
            ikon: '📋',
            durum: odevCalendarDurum(a.status),
          },
        });
      }
      setEvents(merged);
    } catch { /* */ }
    setLoading(false);
  }, [filters, selectedDonemId, eventTypes]);

  const loadEventTypes = useCallback(async () => {
    const res = await fetchEventTypes();
    if (res.success && res.data) {
      const coachTypes = res.data.filter(t => COACH_CATEGORIES.has(t.kategori));
      setEventTypes(coachTypes);
      if (typesHydratedRef.current) return;
      typesHydratedRef.current = true;

      const prefs = readCoachTakvimPrefs();
      const availableIds = coachTypes.map(t => t.id);
      if (prefs.typeIds === null) {
        // İlk ziyaret: tüm türler açık + kaydet
        const all = new Set(availableIds);
        setActiveFilters(all);
        writeCoachTakvimPrefs({
          ...prefs,
          typeIds: availableIds,
        });
      } else {
        // Kayıtlı seçim — kullanıcı tikini kaldırmışsa aynen kalsın
        const restored = new Set(
          prefs.typeIds.filter(id => availableIds.includes(id)),
        );
        setActiveFilters(restored);
      }
    }
  }, []);

  const loadStudents = useCallback(async () => {
    const res = await fetchCoachStudents();
    if (res.success && res.data) {
      setStudents(
        res.data.map(s => ({
          id: s.student_id ?? s.id,
          ad: s.tam_ad || `${s.ad} ${s.soyad}`.trim(),
        })),
      );
    }
  }, []);

  // Tür / durum / öğrenci / arama seçimini kalıcı varsayılan yap
  useEffect(() => {
    if (!typesHydratedRef.current) return;
    writeCoachTakvimPrefs({
      typeIds: Array.from(activeFilters),
      durum: filters.durum,
      ogrenci_id: filters.ogrenci_id,
      search: filters.search,
    });
  }, [activeFilters, filters.durum, filters.ogrenci_id, filters.search]);

  useEffect(() => {
    loadEventTypes();
    loadStudents();
  }, [loadEventTypes, loadStudents]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await ensureResmiTatiller();
        if (cancelled || !res.success || !res.data || res.data.skipped) return;
        const api = calRef.current?.getApi();
        if (api) {
          await loadEvents(
            api.view.activeStart.toISOString(),
            api.view.activeEnd.toISOString(),
          );
        }
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api) {
      loadEvents(api.view.activeStart.toISOString(), api.view.activeEnd.toISOString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, selectedDonemId]);

  /** Tür sayaçları: mevcut bağlam + durum/öğrenci/arama sonuçlarına göre canlı */
  const eventTypesWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const gorevTypeId = eventTypes.find(t => t.kategori === 'GOREV')?.id;
    const odevTypeId = eventTypes.find(t => t.kategori === 'ODEV')?.id;
    for (const e of events) {
      const ep = e.extendedProps || {};
      const typeId = ep.event_type_id as string | undefined;
      const kat = ep.kategori as string | undefined;
      if (typeId) {
        counts.set(typeId, (counts.get(typeId) || 0) + 1);
      } else if ((ep.kaynak === 'gorev' || ep.kaynak_modul === 'gorev' || kat === 'GOREV') && gorevTypeId) {
        counts.set(gorevTypeId, (counts.get(gorevTypeId) || 0) + 1);
      } else if ((ep.kaynak === 'odev' || ep.kaynak_modul === 'odev' || kat === 'ODEV') && odevTypeId) {
        counts.set(odevTypeId, (counts.get(odevTypeId) || 0) + 1);
      }
    }
    return eventTypes.map(t => ({
      ...t,
      etkinlik_sayisi: counts.get(t.id) || 0,
    }));
  }, [events, eventTypes]);

  const filteredEvents = useMemo(() =>
    events.filter(e => {
      const ep = e.extendedProps || {};
      const kat = ep.kategori as string | undefined;
      const typeId = ep.event_type_id as string | undefined;

      if (ep.kaynak === 'gorev' || ep.kaynak_modul === 'gorev' || kat === 'GOREV') {
        const gorevType = eventTypes.find(t => t.kategori === 'GOREV');
        if (!gorevType) return true;
        return activeFilters.has(gorevType.id);
      }

      if (ep.kaynak === 'odev' || ep.kaynak_modul === 'odev' || kat === 'ODEV') {
        const odevType = eventTypes.find(t => t.kategori === 'ODEV');
        if (!odevType) return true;
        return activeFilters.has(odevType.id);
      }

      if (!typeId || activeFilters.size === 0) return true;
      return activeFilters.has(typeId);
    }),
    [events, activeFilters, eventTypes],
  );

  const eventDates = useMemo(() => {
    const set = new Set<string>();
    filteredEvents.forEach(e => {
      if (e.start) set.add(e.start.slice(0, 10));
    });
    return set;
  }, [filteredEvents]);

  const handleDatesSet = useCallback((arg: { startStr: string; endStr: string; view: { title: string } }) => {
    setCalTitle(arg.view.title);
    loadEvents(arg.startStr, arg.endStr);
  }, [loadEvents]);

  const handleEventClick = useCallback(async (arg: EventClickArg) => {
    setTooltip(null);
    const ep = arg.event.extendedProps || {};
    if (ep.kaynak === 'gorev' || ep.kaynak_modul === 'gorev') {
      window.location.href = '/coach/gorevler';
      return;
    }
    if (ep.kaynak === 'odev' || ep.kaynak_modul === 'odev') {
      const aid = ep.assignment_id || ep.kaynak_id;
      if (aid) {
        window.location.href = `/coach/odev/kontrol/${aid}`;
        return;
      }
      window.location.href = '/coach/odev/kontrol';
      return;
    }
    try {
      const res = await fetchEventDetail(arg.event.id);
      if (res.success && res.data) { setSelectedEvent(res.data); setShowDetail(true); }
    } catch { /* */ }
  }, []);

  const handleDateSelect = useCallback((arg: DateSelectArg) => {
    setFormMode('create');
    setFormDefaults({ baslangic: arg.startStr, bitis: arg.endStr, tum_gun: arg.allDay });
    setShowForm(true);
  }, []);

  const handleEventDrop = useCallback(async (arg: EventDropArg) => {
    const ep = arg.event.extendedProps || {};
    if (
      ep.kaynak === 'gorev' || ep.kaynak_modul === 'gorev'
      || ep.kaynak === 'odev' || ep.kaynak_modul === 'odev'
      || String(arg.event.id || '').startsWith('odev-virt-')
    ) {
      arg.revert();
      return;
    }
    try {
      const res = await moveEvent(arg.event.id, arg.event.startStr, arg.event.endStr || arg.event.startStr);
      if (!res.success) { arg.revert(); showToast('error', res.error || 'Taşıma başarısız'); }
      else showToast('success', 'Etkinlik taşındı');
    } catch { arg.revert(); }
  }, []);

  const handleEventResize = useCallback(async (arg: EventResizeDoneArg) => {
    const ep = arg.event.extendedProps || {};
    if (
      ep.kaynak === 'gorev' || ep.kaynak_modul === 'gorev'
      || ep.kaynak === 'odev' || ep.kaynak_modul === 'odev'
      || String(arg.event.id || '').startsWith('odev-virt-')
    ) {
      arg.revert();
      return;
    }
    try {
      const res = await resizeEvent(arg.event.id, arg.event.endStr);
      if (!res.success) { arg.revert(); showToast('error', res.error || 'Boyutlandırma başarısız'); }
      else showToast('success', 'Süre güncellendi');
    } catch { arg.revert(); }
  }, []);

  const handleEventMouseEnter = useCallback((arg: {
    event: {
      title: string; startStr: string; endStr: string;
      backgroundColor: string; extendedProps: Record<string, unknown>;
    };
    jsEvent: MouseEvent;
  }) => {
    const ep = arg.event.extendedProps;
    const start = arg.event.startStr
      ? new Date(arg.event.startStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : '';
    const end = arg.event.endStr
      ? new Date(arg.event.endStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : '';
    const katKey = (ep.kategori as string) || '';
    setTooltip({
      title: arg.event.title,
      ikon: (ep.ikon as string) || '📅',
      color: arg.event.backgroundColor || '#6366f1',
      time: end ? `${start} – ${end}` : start,
      salon: (ep.salon_adi as string) || undefined,
      kategori: (EVENT_CATEGORY_LABELS as Record<string, string>)[katKey] || katKey || undefined,
      durum: (EVENT_STATUS_LABELS as Record<string, { label: string }>)[ep.durum as string]?.label || undefined,
    });
    setTooltipPos({ x: arg.jsEvent.clientX, y: arg.jsEvent.clientY });
  }, []);

  const handleEventMouseLeave = useCallback(() => { setTooltip(null); }, []);

  const handleCreateEvent = useCallback(() => {
    setFormMode('create'); setFormDefaults({}); setShowForm(true);
  }, []);

  const handleEditEvent = useCallback((evt?: CalendarEvent) => {
    const ev = evt || selectedEvent;
    if (ev) { setFormMode('edit'); setFormDefaults(ev); setShowDetail(false); setShowForm(true); }
  }, [selectedEvent]);

  const handleDeleteEvent = useCallback(async (eventId?: string) => {
    const id = eventId || selectedEvent?.id;
    if (!id) return;
    if (!confirm('Bu etkinliği silmek istediğinize emin misiniz?')) return;
    try {
      const res = await deleteEvent(id);
      if (res.success) {
        showToast('success', 'Etkinlik silindi');
        setShowDetail(false);
        setSelectedEvent(null);
        loadEvents();
      } else showToast('error', res.error || 'Silinemedi');
    } catch { showToast('error', 'Hata'); }
  }, [selectedEvent, loadEvents]);

  const handleFormSave = useCallback(async (data: Partial<CalendarEvent>) => {
    try {
      if (formMode === 'edit' && selectedEvent) {
        const res = await updateEvent(selectedEvent.id, data);
        if (res.success) { showToast('success', 'Güncellendi'); setShowForm(false); loadEvents(); return; }
        showToast('error', res.error || 'Güncellenemedi');
      } else {
        const res = await createEvent(data);
        if (res.success) { showToast('success', 'Oluşturuldu'); setShowForm(false); loadEvents(); return; }
        showToast('error', res.error || 'Oluşturulamadı');
      }
    } catch { showToast('error', 'Hata'); }
  }, [formMode, selectedEvent, loadEvents]);

  const handleFilterToggle = useCallback((typeId: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId); else next.add(typeId);
      return next;
    });
  }, []);

  const handleFilterChange = useCallback((next: EventFilters) => {
    setFilters({ ...next, coach_scope: true });
  }, []);

  const calApi = () => calRef.current?.getApi();
  const goToday = () => { calApi()?.today(); setMiniDate(new Date()); };
  const goPrev = () => calApi()?.prev();
  const goNext = () => calApi()?.next();
  const changeView = (v: ViewType) => { calApi()?.changeView(v); setCurrentView(v); };
  const goToDate = (d: Date) => { calApi()?.gotoDate(d); setSelectedMiniDate(d); };

  return (
    <div className="tkv-root coach-takvim-root">
      {mobileSidebar && <div className="tkv-mobile-overlay" onClick={() => setMobileSidebar(false)} />}

      <aside className={`tkv-sidebar ${sidebarOpen ? '' : 'collapsed'} ${mobileSidebar ? 'mobile-open' : ''}`}>
        <div className="tkv-sidebar-section">
          <MiniCalendar
            currentDate={miniDate}
            selectedDate={selectedMiniDate}
            onDateClick={goToDate}
            onMonthChange={setMiniDate}
            eventDates={eventDates}
          />
        </div>

        <CalendarFilterPanel
          variant="coach"
          eventTypes={eventTypesWithCounts}
          activeFilters={activeFilters}
          onToggle={handleFilterToggle}
          filters={filters}
          onFilterChange={handleFilterChange}
          students={students}
        />
      </aside>

      <div className="tkv-main">
        <CalendarContextBar
          selectedDonemId={selectedDonemId}
          onDonemChange={setSelectedDonemId}
        />

        <div className="tkv-topbar">
          <div className="tkv-topbar-left">
            <button
              type="button"
              className="tkv-btn-icon"
              onClick={() => {
                if (window.innerWidth <= 768) setMobileSidebar(!mobileSidebar);
                else setSidebarOpen(!sidebarOpen);
              }}
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
            <button type="button" className="tkv-btn" onClick={goToday}>Bugün</button>
            <button type="button" className="tkv-btn-icon" onClick={goPrev}>‹</button>
            <button type="button" className="tkv-btn-icon" onClick={goNext}>›</button>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginLeft: 4 }}>
              {calTitle}
              {loading ? <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>…</span> : null}
            </span>
          </div>

          <div className="tkv-topbar-right">
            <div className="tkv-view-group">
              {VIEW_LABELS.map(v => (
                <button
                  key={v.key}
                  type="button"
                  className={`tkv-view-btn ${currentView === v.key ? 'active' : ''}`}
                  onClick={() => changeView(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <button type="button" className="tkv-btn tkv-btn-primary" onClick={handleCreateEvent}>
              <span style={{ fontSize: 16 }}>+</span>
              <span className="hide-mobile">Etkinlik Ekle</span>
            </button>
          </div>
        </div>

        <div className="tkv-calendar-wrap">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="dayGridMonth"
            locale="tr"
            headerToolbar={false}
            events={filteredEvents}
            editable
            selectable
            selectMirror
            dayMaxEvents={3}
            moreLinkClick="popover"
            moreLinkText={(n) => `+${n} daha`}
            weekends
            firstDay={1}
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            allDayText="Tüm gün"
            noEventsText="Etkinlik yok"
            height="100%"
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            select={handleDateSelect}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            eventMouseEnter={handleEventMouseEnter}
            eventMouseLeave={handleEventMouseLeave}
            eventContent={(arg) => {
              const ep = arg.event.extendedProps;
              const isTime = arg.view.type.includes('timeGrid');
              const isList = arg.view.type.startsWith('list');
              const startTime = arg.event.start
                ? arg.event.start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : '';
              const displayTitle = isList
                ? arg.event.title
                : shortEventLabel(arg.event.title, isTime ? 36 : 22);

              return (
                <div
                  className="tkv-event-card"
                  style={{ color: arg.event.backgroundColor || '#6366f1' }}
                >
                  <span className="ev-icon">{ep.ikon || '📅'}</span>
                  <span className="ev-title">{displayTitle}</span>
                  {!isTime && !isList && startTime && <span className="ev-time">{startTime}</span>}
                  {isTime && ep.salon_adi && <span className="ev-meta">📍 {ep.salon_adi as string}</span>}
                </div>
              );
            }}
          />
        </div>
      </div>

      <EventTooltip data={tooltip} x={tooltipPos.x} y={tooltipPos.y} />

      {showDetail && selectedEvent && (
        <EventDetailPopup
          event={selectedEvent}
          onClose={() => { setShowDetail(false); setSelectedEvent(null); }}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {showForm && (
        <EventFormDrawer
          mode={formMode}
          defaults={formDefaults}
          eventTypes={eventTypes}
          onSave={handleFormSave}
          onClose={() => setShowForm(false)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          padding: '12px 24px', borderRadius: 12,
          background: toast.type === 'success' ? '#059669' : '#DC2626',
          color: '#fff', fontWeight: 600, fontSize: 13,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
