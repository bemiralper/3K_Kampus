'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';

import '../takvim.css';

import {
  fetchEventsCompact, fetchEventDetail, createEvent, updateEvent, deleteEvent,
  moveEvent, resizeEvent, fetchEventTypes,
  EVENT_CATEGORY_LABELS, EVENT_STATUS_LABELS,
  type FCEvent, type CalendarEvent, type EventType, type EventFilters,
} from '@/lib/takvim-api';
import { fetchGorevTakvim } from '@/lib/gorev-api';
import { shortEventLabel } from '@/lib/calendar-event-label';

import MiniCalendar from './components/MiniCalendar';
import CalendarFilterPanel from './components/CalendarFilterPanel';
import CalendarContextBar from './components/CalendarContextBar';
import EventTooltip from './components/EventTooltip';
import EventDetailPopup from './components/EventDetailPopup';
import EventFormDrawer from './components/EventFormDrawer';

/* ════════════════════════════════════════════
   GENEL TAKVİM — MODERN UI
   ════════════════════════════════════════════ */

type ViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

const VIEW_LABELS: { key: ViewType; label: string }[] = [
  { key: 'dayGridMonth', label: 'Ay' },
  { key: 'timeGridWeek', label: 'Hafta' },
  { key: 'timeGridDay', label: 'Gün' },
  { key: 'listWeek', label: 'Liste' },
];

export default function GenelTakvimClient() {
  const calRef = useRef<FullCalendar>(null);

  // ── Data ──
  const [events, setEvents] = useState<FCEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filtreler ──
  const [filters, setFilters] = useState<EventFilters>({});
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);

  // ── Takvim state ──
  const [currentView, setCurrentView] = useState<ViewType>('dayGridMonth');
  const [calTitle, setCalTitle] = useState('');
  const [miniDate, setMiniDate] = useState(new Date());
  const [selectedMiniDate, setSelectedMiniDate] = useState<Date | null>(null);

  // ── Popup/Drawer ──
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formDefaults, setFormDefaults] = useState<Partial<CalendarEvent>>({});

  // ── Tooltip ──
  const [tooltip, setTooltip] = useState<{
    title: string; ikon: string; color: string; time: string;
    salon?: string; kategori?: string; durum?: string;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // ── Context bar (Dönem) — localStorage'dan oku ──
  const [selectedDonemId, setSelectedDonemId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('3k_active_donem');
    return stored ? parseInt(stored, 10) : null;
  });

  // ── Toast ──
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  // ════════ DATA LOADING ════════

  const loadEvents = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    try {
      const f: EventFilters = { ...filters };
      if (start) f.baslangic = start;
      if (end) f.bitis = end;
      if (selectedDonemId) f.donem_id = selectedDonemId;

      const gorevParams: Record<string, string> = {};
      if (start) gorevParams.baslangic = start;
      if (end) gorevParams.bitis = end;

      const [takvimRes, gorevRes] = await Promise.all([
        fetchEventsCompact(f),
        fetchGorevTakvim(gorevParams),
      ]);

      const takvimData = takvimRes.success && takvimRes.data ? takvimRes.data : [];
      const gorevData = gorevRes.success && gorevRes.data ? gorevRes.data : [];

      const syncedAtamaIds = new Set(
        takvimData
          .filter(e => e.extendedProps?.kaynak_modul === 'gorev')
          .map(e => String(e.extendedProps?.kaynak_id || e.extendedProps?.atama_id || ''))
          .filter(Boolean),
      );

      const merged: FCEvent[] = [...takvimData];
      for (const g of gorevData) {
        if (!syncedAtamaIds.has(String(g.id))) {
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
      }
      setEvents(merged);
    } catch { /* */ }
    setLoading(false);
  }, [filters, selectedDonemId]);

  const loadEventTypes = useCallback(async () => {
    const res = await fetchEventTypes();
    if (res.success && res.data) {
      setEventTypes(res.data);
      setActiveFilters(new Set(res.data.map(t => t.id)));
    }
  }, []);

  // Yeni eklenen türler (ör. GOREV) event listesinde varsa filtreye dahil et
  useEffect(() => {
    if (!events.length) return;
    setActiveFilters(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const e of events) {
        const typeId = e.extendedProps?.event_type_id as string | undefined;
        if (typeId && !next.has(typeId)) {
          next.add(typeId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [events, eventTypes]);

  useEffect(() => { loadEventTypes(); }, [loadEventTypes]);

  // Dönem (veya diğer filtreler) değişince event'leri yeniden yükle
  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api) {
      loadEvents(api.view.activeStart.toISOString(), api.view.activeEnd.toISOString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDonemId, filters]);

  // Hangi günlerde event var (mini takvim noktaları)
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => {
      if (e.start) set.add(e.start.slice(0, 10));
    });
    return set;
  }, [events]);

  // Filtrelenmiş eventler — görevler her zaman görünür
  const filteredEvents = useMemo(() =>
    events.filter(e => {
      const ep = e.extendedProps || {};
      if (ep.kaynak === 'gorev' || ep.kaynak_modul === 'gorev') return true;
      const typeId = ep.event_type_id as string | undefined;
      if (!typeId || activeFilters.size === 0) return true;
      return activeFilters.has(typeId);
    }),
    [events, activeFilters]
  );

  // ════════ FULLCALENDAR CALLBACKS ════════

  const handleDatesSet = useCallback((arg: { startStr: string; endStr: string; view: { title: string } }) => {
    setCalTitle(arg.view.title);
    loadEvents(arg.startStr, arg.endStr);
  }, [loadEvents]);

  const handleEventClick = useCallback(async (arg: EventClickArg) => {
    setTooltip(null);
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
    try {
      const res = await moveEvent(arg.event.id, arg.event.startStr, arg.event.endStr || arg.event.startStr);
      if (!res.success) { arg.revert(); showToast('error', res.error || 'Taşıma başarısız'); }
      else showToast('success', 'Etkinlik taşındı');
    } catch { arg.revert(); }
  }, []);

  const handleEventResize = useCallback(async (arg: EventResizeDoneArg) => {
    try {
      const res = await resizeEvent(arg.event.id, arg.event.endStr);
      if (!res.success) { arg.revert(); showToast('error', res.error || 'Boyutlandırma başarısız'); }
      else showToast('success', 'Süre güncellendi');
    } catch { arg.revert(); }
  }, []);

  // ── Hover tooltip ──
  const handleEventMouseEnter = useCallback((arg: { event: { title: string; startStr: string; endStr: string; backgroundColor: string; extendedProps: Record<string, unknown> }; jsEvent: MouseEvent }) => {
    const ep = arg.event.extendedProps;
    const start = arg.event.startStr ? new Date(arg.event.startStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
    const end = arg.event.endStr ? new Date(arg.event.endStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
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

  // ════════ FORM HANDLERS ════════

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
      if (res.success) { showToast('success', 'Etkinlik silindi'); setShowDetail(false); setSelectedEvent(null); loadEvents(); }
      else showToast('error', res.error || 'Silinemedi');
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

  // ── Filtre toggle ──
  const handleFilterToggle = useCallback((typeId: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId); else next.add(typeId);
      return next;
    });
  }, []);

  // ── FullCalendar API ──
  const calApi = () => calRef.current?.getApi();
  const goToday = () => { calApi()?.today(); setMiniDate(new Date()); };
  const goPrev = () => calApi()?.prev();
  const goNext = () => calApi()?.next();
  const changeView = (v: ViewType) => { calApi()?.changeView(v); setCurrentView(v); };
  const goToDate = (d: Date) => { calApi()?.gotoDate(d); setSelectedMiniDate(d); };

  // ════════ RENDER ════════

  return (
    <div className="tkv-root">
      {/* ═══ MOBİL OVERLAY ═══ */}
      {mobileSidebar && <div className="tkv-mobile-overlay" onClick={() => setMobileSidebar(false)} />}

      {/* ═══ SOL PANEL ═══ */}
      <aside className={`tkv-sidebar ${sidebarOpen ? '' : 'collapsed'} ${mobileSidebar ? 'mobile-open' : ''}`}>
        {/* Mini Takvim */}
        <div className="tkv-sidebar-section">
          <MiniCalendar
            currentDate={miniDate}
            selectedDate={selectedMiniDate}
            onDateClick={goToDate}
            onMonthChange={setMiniDate}
            eventDates={eventDates}
          />
        </div>

        {/* Filtreler */}
        <CalendarFilterPanel
          eventTypes={eventTypes}
          activeFilters={activeFilters}
          onToggle={handleFilterToggle}
          filters={filters}
          onFilterChange={setFilters}
        />
      </aside>

      {/* ═══ ANA ALAN ═══ */}
      <div className="tkv-main">
        {/* ── CONTEXT BAR (Şube / Eğitim Yılı / Dönem) ── */}
        <CalendarContextBar
          selectedDonemId={selectedDonemId}
          onDonemChange={setSelectedDonemId}
        />

        {/* ── ÜST BAR ── */}
        <div className="tkv-topbar">
          <div className="tkv-topbar-left">
            {/* Sidebar toggle */}
            <button className={`tkv-btn-icon`} onClick={() => {
              if (window.innerWidth <= 768) setMobileSidebar(!mobileSidebar);
              else setSidebarOpen(!sidebarOpen);
            }}>
              {sidebarOpen ? '◀' : '▶'}
            </button>

            {/* Bugün + nav */}
            <button className="tkv-btn" onClick={goToday}>Bugün</button>
            <button className="tkv-btn-icon" onClick={goPrev}>‹</button>
            <button className="tkv-btn-icon" onClick={goNext}>›</button>

            {/* Başlık */}
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginLeft: 4 }}>
              {calTitle}
            </span>
          </div>

          <div className="tkv-topbar-right">
            {/* Görünüm seçici */}
            <div className="tkv-view-group">
              {VIEW_LABELS.map(v => (
                <button
                  key={v.key}
                  className={`tkv-view-btn ${currentView === v.key ? 'active' : ''}`}
                  onClick={() => changeView(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Ekle butonu */}
            <button className="tkv-btn tkv-btn-primary" onClick={handleCreateEvent}>
              <span style={{ fontSize: 16 }}>+</span>
              <span className="hide-mobile">Etkinlik Ekle</span>
            </button>
          </div>
        </div>

        {/* ── TAKVİM ── */}
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
              const kod = (ep.kod as string) || '';

              return (
                <div
                  className="tkv-event-card"
                  style={{ color: arg.event.backgroundColor || '#6366f1' }}
                >
                  <span className="ev-icon">{ep.ikon || '📅'}</span>
                  {kod && !isList && <span className="ev-badge">{kod}</span>}
                  <span className="ev-title">{displayTitle}</span>
                  {!isTime && !isList && startTime && <span className="ev-time">{startTime}</span>}
                  {isTime && ep.salon_adi && <span className="ev-meta">📍 {ep.salon_adi as string}</span>}
                </div>
              );
            }}
          />
        </div>
      </div>

      {/* ═══ TOOLTIP ═══ */}
      <EventTooltip data={tooltip} x={tooltipPos.x} y={tooltipPos.y} />

      {/* ═══ DETAY POPUP ═══ */}
      {showDetail && selectedEvent && (
        <EventDetailPopup
          event={selectedEvent}
          onClose={() => { setShowDetail(false); setSelectedEvent(null); }}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {/* ═══ FORM DRAWER ═══ */}
      {showForm && (
        <EventFormDrawer
          mode={formMode}
          defaults={formDefaults}
          eventTypes={eventTypes}
          onSave={handleFormSave}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          padding: '12px 24px', borderRadius: 12,
          background: toast.type === 'success' ? '#059669' : '#DC2626',
          color: '#fff', fontWeight: 600, fontSize: 13,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          animation: 'tkv-scaleIn 0.2s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
