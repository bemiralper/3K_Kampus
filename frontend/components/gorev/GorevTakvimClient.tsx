'use client';

import React, { useState, useCallback, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, DatesSetArg, EventContentArg, EventHoveringArg, DateSelectArg } from '@fullcalendar/core';
import {
  fetchGorevTakvim,
  fetchAtamaDetail,
  ONCELIK_LABELS,
  DURUM_LABELS,
  type FCEvent,
  type GorevAtama,
  type GorevOncelik,
  type GorevDurum,
} from '@/lib/gorev-api';
import { fetchEventsCompact } from '@/lib/takvim-api';
import { FC_TR_COMMON } from '@/lib/fullcalendar-tr';
import { shortEventLabel } from '@/lib/calendar-event-label';
import GorevCalTooltip, { type GorevTooltipData } from './GorevCalTooltip';
import GorevDetailDrawer from './GorevDetailDrawer';
import GorevQuickFormDrawer from './GorevQuickFormDrawer';

import './gorev.css';

type Props = {
  backHref?: string;
  adminView?: boolean;
  allowPersonalCreate?: boolean;
  /** Verilen çek/senet vade ödemelerini merkezi takvimden birleştir */
  includeCekSenetEvents?: boolean;
};

function withDateBuffer(start: Date, end: Date) {
  const bufStart = new Date(start);
  bufStart.setDate(bufStart.getDate() - 7);
  const bufEnd = new Date(end);
  bufEnd.setDate(bufEnd.getDate() + 7);
  return { bufStart, bufEnd };
}

function normalizeEvents(raw: FCEvent[]): FCEvent[] {
  return raw.map(e => ({
    ...e,
    backgroundColor: e.color || '#6366F1',
    borderColor: e.color || '#6366F1',
  }));
}

function formatEventTime(start: Date | null, end: Date | null, allDay: boolean): string {
  if (!start) return '';
  if (allDay) return 'Tüm gün';
  const s = start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (!end) return s;
  const e = end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${s} – ${e}`;
}

function buildEventContent(arg: EventContentArg) {
  const ep = arg.event.extendedProps;
  const fullTitle = arg.event.title;
  const isList = arg.view.type.startsWith('list');
  const isWeek = arg.view.type.includes('timeGrid');
  const label = isList ? fullTitle : shortEventLabel(fullTitle, isWeek ? 36 : 28);
  const bg = arg.event.backgroundColor || arg.event.borderColor || '#6366F1';

  if (isList) {
    const durum = ep.durum as string;
    return (
      <div className="gorev-cal-event gorev-cal-event--list">
        <span className="gorev-cal-event-title">{fullTitle}</span>
        {durum && <span className="gorev-cal-event-list-meta">{DURUM_LABELS[durum as GorevDurum] || durum}</span>}
      </div>
    );
  }

  return (
    <div className="gorev-cal-event" style={{ backgroundColor: bg, borderColor: bg }}>
      <span className="gorev-cal-event-title">{label}</span>
    </div>
  );
}

export default function GorevTakvimClient({
  backHref,
  adminView = false,
  allowPersonalCreate = false,
  includeCekSenetEvents = false,
}: Props) {
  const calRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<FCEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAtama, setSelectedAtama] = useState<GorevAtama | null>(null);
  const [tooltip, setTooltip] = useState<GorevTooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [quickFormDate, setQuickFormDate] = useState<string>('');

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    setError(null);
    try {
      const { bufStart, bufEnd } = withDateBuffer(start, end);
      const params: Record<string, string> = {
        baslangic: bufStart.toISOString(),
        bitis: bufEnd.toISOString(),
      };
      if (adminView) params.tum = 'true';

      const res = await fetchGorevTakvim(params);
      let merged: FCEvent[] = [];
      if (res.success && res.data) {
        merged = normalizeEvents(res.data);
      } else if (!includeCekSenetEvents) {
        setError(res.error || 'Görevler yüklenemedi. Kurum seçili olduğundan emin olun.');
        setEvents([]);
        return;
      }

      if (includeCekSenetEvents) {
        const takvimRes = await fetchEventsCompact({
          baslangic: bufStart.toISOString(),
          bitis: bufEnd.toISOString(),
        });
        const cekEvents = (takvimRes.success && takvimRes.data ? takvimRes.data : [])
          .filter((e) => e.extendedProps?.kaynak_modul === 'cek_senet')
          .map((e) => ({
            ...e,
            backgroundColor: (e.backgroundColor as string) || '#DC2626',
            borderColor: (e.borderColor as string) || '#DC2626',
          }));
        merged = [...merged, ...cekEvents];
      }

      if (!merged.length && !res.success && !includeCekSenetEvents) {
        setError(res.error || 'Görevler yüklenemedi. Kurum seçili olduğundan emin olun.');
      } else {
        setError(null);
      }
      setEvents(merged);
    } catch {
      setError('Görevler yüklenirken bir hata oluştu.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [adminView, includeCekSenetEvents]);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    loadEvents(info.start, info.end);
  }, [loadEvents]);

  const openAtama = async (atamaId: string) => {
    setTooltip(null);
    const res = await fetchAtamaDetail(atamaId);
    if (res.success && res.data) {
      setSelectedAtama(res.data);
    }
  };

  const handleEventClick = (info: EventClickArg) => {
    if (info.event.extendedProps?.kaynak_modul === 'cek_senet') return;
    openAtama(info.event.id);
  };

  const handleDateSelect = (info: DateSelectArg) => {
    if (!allowPersonalCreate) return;
    setQuickFormDate(info.startStr);
    setShowQuickForm(true);
  };

  const handleEventMouseEnter = (info: EventHoveringArg) => {
    const ep = info.event.extendedProps;
    const oncelik = ep.oncelik as GorevOncelik | undefined;
    const durum = ep.durum as GorevDurum | undefined;
    setTooltip({
      title: info.event.title,
      ikon: (ep.ikon as string) || '✅',
      color: info.event.backgroundColor || info.event.borderColor || '#6366F1',
      time: formatEventTime(info.event.start, info.event.end, info.event.allDay),
      kod: (ep.kod as string) || undefined,
      oncelik: oncelik ? ONCELIK_LABELS[oncelik] : undefined,
      durum: durum ? DURUM_LABELS[durum] : undefined,
      atananlar: adminView ? (ep.atananlar as string[] | undefined) : undefined,
    });
    setTooltipPos({ x: info.jsEvent.clientX, y: info.jsEvent.clientY });
  };

  const handleEventMouseLeave = () => setTooltip(null);

  return (
    <div className="gorev-takvim">
      <div className="gorev-takvim-toolbar">
        {backHref && (
          <a href={backHref} className="gorev-btn gorev-btn-ghost">
            ← Görevlere Dön
          </a>
        )}
        {allowPersonalCreate && (
          <button
            type="button"
            className="gorev-btn gorev-btn-primary"
            onClick={() => { setQuickFormDate(''); setShowQuickForm(true); }}
          >
            + Hatırlatma / Görev
          </button>
        )}
      </div>

      {allowPersonalCreate && (
        <p className="gorev-takvim-hint">
          Takvimde bir güne tıklayarak kişisel hatırlatma ekleyebilirsiniz. Tam detay için göreve tıklayın.
        </p>
      )}

      {loading && <p className="gorev-loading">Yükleniyor…</p>}
      {error && !loading && <p className="gorev-error">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="gorev-empty">Bu tarih aralığında görev yok.</p>
      )}

      <div className={`gorev-takvim-cal ${loading ? 'gorev-takvim-cal--loading' : ''}`}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          {...FC_TR_COMMON}
          timeZone="local"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek',
          }}
          views={{
            dayGridMonth: { dayMaxEvents: 3 },
            listWeek: { buttonText: 'Liste' },
          }}
          selectable={allowPersonalCreate}
          moreLinkClick="popover"
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          select={handleDateSelect}
          eventContent={buildEventContent}
          eventMouseEnter={handleEventMouseEnter}
          eventMouseLeave={handleEventMouseLeave}
          height={680}
          nowIndicator
          eventDisplay="block"
          displayEventTime={false}
        />
      </div>

      <GorevCalTooltip data={tooltip} x={tooltipPos.x} y={tooltipPos.y} />

      {selectedAtama && selectedAtama.gorev && (
        <GorevDetailDrawer
          atama={selectedAtama}
          onClose={() => setSelectedAtama(null)}
          onUpdated={() => {
            const api = calRef.current?.getApi();
            if (api) loadEvents(api.view.activeStart, api.view.activeEnd);
          }}
        />
      )}

      {allowPersonalCreate && (
        <GorevQuickFormDrawer
          open={showQuickForm}
          defaultDate={quickFormDate}
          onClose={() => setShowQuickForm(false)}
          onCreated={() => {
            const api = calRef.current?.getApi();
            if (api) loadEvents(api.view.activeStart, api.view.activeEnd);
          }}
        />
      )}
    </div>
  );
}
