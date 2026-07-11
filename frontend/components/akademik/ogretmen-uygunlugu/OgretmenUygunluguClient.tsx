'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  DatePicker,
  Dropdown,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  CalendarOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  cellKey,
  deleteTemporaryAvailability,
  fetchCalendarGridStructure,
  fetchTeacherAvailability,
  fetchTeachersForAvailability,
  saveTeacherAvailability,
  type AvailabilitySetPayload,
  type CalendarGridStructure,
  type ContractSummary,
  type ContractWarning,
  type ProgramTipi,
  type SlotAvailabilityStatus,
  type TeacherAvailabilityDetail,
  type TeacherListItem,
  type WorkCalendarOption,
} from '@/lib/academic-api';
import {
  PROGRAM_TIPI_ORDER,
  groupByProgramTipi,
  programTipiMeta,
} from '@/components/akademik/program-tipi';
import { computeDetailedLocalSummary, summaryForCalendar } from './summary';
import SlotAvailabilityGrid from './SlotAvailabilityGrid';
import { SOZLESME_TURU_OPTIONS, STATUS_META } from './constants';
import './ogretmen-uygunlugu.css';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

type ModeKind = 'DEFAULT' | 'TEMPORARY';
type CalendarProgramFilter = 'all' | ProgramTipi;

function contractDaysLabel(contract: ContractSummary | null) {
  if (!contract?.working_days_academic?.length) return '—';
  const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  return contract.working_days_academic.map((d) => labels[d] || String(d)).join(', ');
}

function mesaiLabel(contract: ContractSummary | null) {
  if (!contract?.mesai_saatleri?.length) return '—';
  const active = contract.mesai_saatleri.filter((m) => m.aktif && m.baslangic && m.bitis);
  if (!active.length) return '—';
  const sameHours = active.every(
    (m) => m.baslangic === active[0].baslangic && m.bitis === active[0].bitis,
  );
  if (sameHours) {
    return `${active[0].baslangic} – ${active[0].bitis}`;
  }
  return `${active.length} gün (gün bazlı farklı)`;
}

function izinGunleriLabel(contract: ContractSummary | null) {
  if (!contract?.haftalik_izin_gunleri_labels?.length) return '—';
  return contract.haftalik_izin_gunleri_labels.join(', ');
}

export default function OgretmenUygunluguClient() {
  const { activeKurum, activeSube, initialized } = useKurum();

  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [filterBrans, setFilterBrans] = useState('');
  const [filterSozlesme, setFilterSozlesme] = useState('');
  const [filterAktif, setFilterAktif] = useState<'all' | 'active' | 'passive'>('active');
  const [filterCalendar, setFilterCalendar] = useState<number | null>(null);
  const [calendarProgramFilter, setCalendarProgramFilter] = useState<CalendarProgramFilter>('all');

  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TeacherAvailabilityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [mode, setMode] = useState<ModeKind>('DEFAULT');
  const [tempSetId, setTempSetId] = useState<number | null>(null);
  const [tempTitle, setTempTitle] = useState('Geçici Uygunluk');
  const [tempRange, setTempRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const [calendarIds, setCalendarIds] = useState<number[]>([]);
  const [cells, setCells] = useState<Record<string, SlotAvailabilityStatus>>({});
  const [activeCalendarTab, setActiveCalendarTab] = useState<number | null>(null);
  const [gridCache, setGridCache] = useState<Record<number, CalendarGridStructure>>({});
  const [gridLoading, setGridLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadTeachers = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    setTeachersLoading(true);
    try {
      const data = await fetchTeachersForAvailability({
        search: teacherSearch,
        brans: filterBrans,
        sozlesme_turu: filterSozlesme,
        aktif_only: filterAktif === 'active' ? true : false,
      });
      setTeachers(filterAktif === 'passive' ? data.filter((t) => !t.aktif_mi) : data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Öğretmen listesi yüklenemedi');
    } finally {
      setTeachersLoading(false);
    }
  }, [activeKurum, activeSube, filterAktif, filterBrans, filterSozlesme, initialized, teacherSearch]);

  useEffect(() => {
    const t = setTimeout(loadTeachers, 300);
    return () => clearTimeout(t);
  }, [loadTeachers]);

  const applySetToForm = useCallback((set: AvailabilitySetPayload | null) => {
    if (!set) {
      setCalendarIds([]);
      setCells({});
      setActiveCalendarTab(null);
      return;
    }
    setCalendarIds(set.calendar_ids);
    setCells(set.cells);
    setActiveCalendarTab(set.calendar_ids[0] ?? null);
    if (set.kind === 'TEMPORARY') {
      setTempSetId(set.id);
      setTempTitle(set.title);
      if (set.valid_from && set.valid_until) {
        setTempRange([dayjs(set.valid_from), dayjs(set.valid_until)]);
      }
    }
  }, []);

  const loadDetail = useCallback(
    async (personelId: number) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await fetchTeacherAvailability(personelId);
        setDetail(data);
        if (mode === 'DEFAULT') {
          applySetToForm(data.default_set);
        } else if (data.temporary_sets.length) {
          applySetToForm(data.temporary_sets[0]);
        } else {
          applySetToForm(null);
        }
        setDirty(false);
      } catch (e) {
        setDetail(null);
        applySetToForm(null);
        const msg = e instanceof Error ? e.message : 'Detay yüklenemedi';
        setDetailError(msg);
        message.error(msg);
      } finally {
        setDetailLoading(false);
      }
    },
    [applySetToForm, mode],
  );

  useEffect(() => {
    if (selectedTeacherId) loadDetail(selectedTeacherId);
    else {
      setDetail(null);
      setDetailError(null);
      setCalendarIds([]);
      setCells({});
    }
  }, [selectedTeacherId, loadDetail]);

  const loadGrid = useCallback(
    async (calendarId: number) => {
      if (!selectedTeacherId || gridCache[calendarId]) return;
      setGridLoading(true);
      try {
        const structure = await fetchCalendarGridStructure(selectedTeacherId, calendarId);
        setGridCache((prev) => ({ ...prev, [calendarId]: structure }));
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Grid yüklenemedi');
      } finally {
        setGridLoading(false);
      }
    },
    [gridCache, selectedTeacherId],
  );

  useEffect(() => {
    if (activeCalendarTab) loadGrid(activeCalendarTab);
  }, [activeCalendarTab, loadGrid]);

  const bransOptions = useMemo(() => {
    const set = new Set(teachers.map((t) => t.brans).filter(Boolean));
    return [{ value: '', label: 'Tüm Branşlar' }, ...Array.from(set).map((b) => ({ value: b, label: b }))];
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    if (!filterCalendar) return teachers;
    return teachers;
  }, [filterCalendar, teachers]);

  const selectedCalendars = useMemo(
    () => (detail?.work_calendars || []).filter((c) => calendarIds.includes(c.id)),
    [calendarIds, detail?.work_calendars],
  );

  const liveSummary = useMemo(
    () =>
      computeDetailedLocalSummary(
        cells,
        calendarIds,
        detail?.work_calendars || [],
      ),
    [cells, calendarIds, detail?.work_calendars],
  );

  const visibleCalendars = useMemo(() => {
    const all = detail?.work_calendars || [];
    if (calendarProgramFilter === 'all') return all;
    return all.filter((c) => (c.program_tipi || 'GENEL') === calendarProgramFilter);
  }, [calendarProgramFilter, detail?.work_calendars]);

  const groupedVisibleCalendars = useMemo(
    () => groupByProgramTipi(visibleCalendars),
    [visibleCalendars],
  );

  const activeTabCalendar = useMemo(
    () => (detail?.work_calendars || []).find((c) => c.id === activeCalendarTab),
    [activeCalendarTab, detail?.work_calendars],
  );

  const activeTabSummary = useMemo(() => {
    if (!activeCalendarTab) return null;
    return summaryForCalendar(cells, activeCalendarTab);
  }, [activeCalendarTab, cells]);

  const toggleCalendar = (id: number) => {
    setCalendarIds((prev) => {
      const wasSelected = prev.includes(id);
      const next = wasSelected ? prev.filter((x) => x !== id) : [...prev, id];
      if (!wasSelected) {
        setActiveCalendarTab(id);
      } else if (!next.includes(activeCalendarTab || -1)) {
        setActiveCalendarTab(next[0] ?? null);
      }
      return next;
    });
    setDirty(true);
  };

  const patchAllCellsForCalendar = (
    calendarId: number,
    status: SlotAvailabilityStatus,
    filterFn?: (day: number, slotIdx: number, total: number) => boolean,
  ) => {
    const structure = gridCache[calendarId];
    if (!structure) return;
    const updates: Record<string, SlotAvailabilityStatus> = { ...cells };
    structure.days.forEach((day) => {
      day.slots.forEach((slot, idx) => {
        if (filterFn && !filterFn(day.day_of_week, idx, day.slots.length)) return;
        const k = cellKey(calendarId, day.day_of_week, slot.timeslot_id);
        if (status === 'UNAVAILABLE') delete updates[k];
        else updates[k] = status;
      });
    });
    setCells(updates);
    setDirty(true);
  };

  const fillFromContract = () => {
    const working = new Set(detail?.contract?.working_days_academic || []);
    if (!activeCalendarTab) return;
    const structure = gridCache[activeCalendarTab];
    if (!structure) return;
    const updates: Record<string, SlotAvailabilityStatus> = { ...cells };
    structure.days.forEach((day) => {
      day.slots.forEach((slot) => {
        const k = cellKey(activeCalendarTab, day.day_of_week, slot.timeslot_id);
        if (working.has(day.day_of_week)) updates[k] = 'AVAILABLE';
        else delete updates[k];
      });
    });
    setCells(updates);
    setDirty(true);
    message.info('Sözleşme çalışma günlerine göre uygun slotlar işaretlendi.');
  };

  const copyWeekdayToAll = (sourceDow: number) => {
    if (!activeCalendarTab) return;
    const structure = gridCache[activeCalendarTab];
    if (!structure) return;
    const sourceDay = structure.days.find((d) => d.day_of_week === sourceDow);
    if (!sourceDay) return;
    const updates: Record<string, SlotAvailabilityStatus> = { ...cells };
    structure.days.forEach((d) => {
      sourceDay.slots.forEach((ms, idx) => {
        const target = d.slots[idx];
        if (!target) return;
        const src = cells[cellKey(activeCalendarTab, sourceDow, ms.timeslot_id)] || 'UNAVAILABLE';
        const k = cellKey(activeCalendarTab, d.day_of_week, target.timeslot_id);
        if (src === 'UNAVAILABLE') delete updates[k];
        else updates[k] = src;
      });
    });
    setCells(updates);
    setDirty(true);
  };

  const quickMenuItems: MenuProps['items'] = [
    { key: 'wd', label: 'Hafta İçi Kopyala (Pzt→Cuma)', onClick: () => copyWeekdayToAll(0) },
    { key: 'sat', label: 'Cumartesiye Kopyala (Cuma→Cmt)', onClick: () => {
      if (!activeCalendarTab) return;
      const structure = gridCache[activeCalendarTab];
      const fri = structure?.days.find((d) => d.day_of_week === 4);
      const sat = structure?.days.find((d) => d.day_of_week === 5);
      if (!fri || !sat) return;
      const updates: Record<string, SlotAvailabilityStatus> = { ...cells };
      fri.slots.forEach((s, idx) => {
        const t = sat.slots[idx];
        if (!t) return;
        const src = cells[cellKey(activeCalendarTab, 4, s.timeslot_id)] || 'UNAVAILABLE';
        const k = cellKey(activeCalendarTab, 5, t.timeslot_id);
        if (src === 'UNAVAILABLE') delete updates[k];
        else updates[k] = src;
      });
      setCells(updates);
      setDirty(true);
    }},
    { key: 'mon-all', label: 'Pazartesiyi Tüm Haftaya Uygula', onClick: () => copyWeekdayToAll(0) },
    { type: 'divider' },
    { key: 'morning', label: 'Sabahları Seç', onClick: () => {
      if (!activeCalendarTab) return;
      patchAllCellsForCalendar(activeCalendarTab, 'AVAILABLE', (_d, idx, total) => idx < Math.ceil(total / 3));
    }},
    { key: 'afternoon', label: 'Öğleden Sonraları Seç', onClick: () => {
      if (!activeCalendarTab) return;
      patchAllCellsForCalendar(activeCalendarTab, 'AVAILABLE', (_d, idx, total) => {
        const t = Math.ceil(total / 3);
        return idx >= t && idx < t * 2;
      });
    }},
    { key: 'evening', label: 'Akşamları Seç', onClick: () => {
      if (!activeCalendarTab) return;
      patchAllCellsForCalendar(activeCalendarTab, 'AVAILABLE', (_d, idx, total) => idx >= Math.floor((total * 2) / 3));
    }},
    { type: 'divider' },
    { key: 'open', label: 'Tüm Slotları Aç', onClick: () => activeCalendarTab && patchAllCellsForCalendar(activeCalendarTab, 'AVAILABLE') },
    { key: 'close', label: 'Tüm Slotları Kapat', onClick: () => activeCalendarTab && patchAllCellsForCalendar(activeCalendarTab, 'UNAVAILABLE') },
  ];

  const handleSave = async (force = false) => {
    if (!selectedTeacherId) return;
    if (mode === 'TEMPORARY' && !tempRange) {
      message.warning('Geçici uygunluk için tarih aralığı seçin.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveTeacherAvailability(selectedTeacherId, {
        kind: mode,
        set_id: mode === 'TEMPORARY' ? tempSetId ?? undefined : undefined,
        title: mode === 'TEMPORARY' ? tempTitle : undefined,
        valid_from: mode === 'TEMPORARY' ? tempRange![0].format('YYYY-MM-DD') : null,
        valid_until: mode === 'TEMPORARY' ? tempRange![1].format('YYYY-MM-DD') : null,
        calendar_ids: calendarIds,
        cells,
        force_save: force,
      });
      message.success('Uygunluk kaydedildi.');
      if (result.warnings.length) {
        Modal.warning({
          title: 'Kaydedildi — sözleşme uyarıları',
          content: (
            <ul style={{ paddingLeft: 18 }}>
              {result.warnings.map((w) => (
                <li key={w.day_of_week}>{w.message}</li>
              ))}
            </ul>
          ),
        });
      }
      setDirty(false);
      await loadDetail(selectedTeacherId);
    } catch (e) {
      const err = e as Error & { warnings?: ContractWarning[]; isConflict?: boolean };
      if (err.isConflict && err.warnings?.length) {
        Modal.confirm({
          title: 'Sözleşme ile uyumsuzluk',
          content: (
            <div>
              <Paragraph type="secondary">
                Aşağıdaki günler personel sözleşmesinde çalışma günü değil. Yine de kaydedebilirsiniz.
              </Paragraph>
              <ul style={{ paddingLeft: 18 }}>
                {err.warnings.map((w) => (
                  <li key={w.day_of_week}>{w.message}</li>
                ))}
              </ul>
            </div>
          ),
          okText: 'Yine de Kaydet',
          cancelText: 'İptal',
          onOk: () => handleSave(true),
        });
      } else {
        message.error(err.message || 'Kaydedilemedi');
      }
    } finally {
      setSaving(false);
    }
  };

  const reloadFromServer = () => {
    if (!detail) return;
    if (mode === 'DEFAULT') applySetToForm(detail.default_set);
    else {
      const found = detail.temporary_sets.find((s) => s.id === tempSetId);
      applySetToForm(found || null);
    }
    setDirty(false);
    message.info('Sunucudaki kayıt yüklendi.');
  };

  const switchMode = (next: ModeKind) => {
    setMode(next);
    if (!detail) return;
    if (next === 'DEFAULT') {
      applySetToForm(detail.default_set);
      setTempSetId(null);
    } else if (detail.temporary_sets.length) {
      applySetToForm(detail.temporary_sets[0]);
    } else {
      setTempSetId(null);
      setCalendarIds([]);
      setCells({});
      setTempRange(null);
    }
    setDirty(false);
  };

  const renderCalendarCard = (cal: WorkCalendarOption) => {
    const selected = calendarIds.includes(cal.id);
    const tipMeta = programTipiMeta(cal.program_tipi);
    const calSummary = selected ? summaryForCalendar(cells, cal.id) : null;
    return (
      <div
        key={cal.id}
        className={`ou-calendar-card${selected ? ' selected' : ''}`}
        onClick={() => toggleCalendar(cal.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && toggleCalendar(cal.id)}
        style={selected ? { borderColor: cal.color || '#2563eb' } : undefined}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space align="start">
              <span style={{ fontSize: 18 }}>{cal.icon || '📅'}</span>
              <div>
                <Text strong>{cal.name}</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag
                    style={{
                      color: tipMeta.color,
                      background: tipMeta.bg,
                      borderColor: tipMeta.border,
                      marginInlineEnd: 0,
                    }}
                  >
                    {cal.program_tipi_display || tipMeta.label}
                  </Tag>
                </div>
              </div>
            </Space>
            {selected && <CheckOutlined style={{ color: cal.color || '#2563eb' }} />}
          </Space>
          {cal.description ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {cal.description}
            </Text>
          ) : null}
          {cal.used_templates.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {cal.used_templates.map((t) => t.name).join(' · ')}
            </Text>
          )}
          <Space wrap size={[4, 4]}>
            <Tag>{cal.active_day_count} aktif gün</Tag>
            {calSummary ? (
              <Tag color="blue">
                {calSummary.estimated_max_weekly_lesson_slots} uygun slot
              </Tag>
            ) : null}
          </Space>
        </Space>
      </div>
    );
  };

  const renderCalendarGroups = () => {
    if (!visibleCalendars.length) {
      return (
        <div className="ou-empty-state" style={{ padding: 24 }}>
          Bu filtreye uygun çalışma takvimi yok. Tanımlar → Çalışma Takvimi&apos;nden
          grup veya birebir takvim oluşturun.
        </div>
      );
    }
    return PROGRAM_TIPI_ORDER.map((tip) => {
      const group = groupedVisibleCalendars[tip];
      if (!group.length) return null;
      const meta = programTipiMeta(tip);
      return (
        <div key={tip} className="ou-calendar-group">
          <div className="ou-calendar-group-head">
            <Tag style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
              {meta.label}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {group.length} takvim · {group.filter((c) => calendarIds.includes(c.id)).length} seçili
            </Text>
          </div>
          <div className="ou-calendar-grid">{group.map(renderCalendarCard)}</div>
        </div>
      );
    });
  };

  const summaryPanel = (
    <div className="ou-card ou-summary-panel">
      <div className="ou-card-head">
        <Text strong>Canlı Özet</Text>
        {dirty && <Tag color="orange">Kaydedilmedi</Tag>}
      </div>
      <div className="ou-card-body">
        <div className="ou-summary-stat">
          <span>Toplam Uygun Slot</span>
          <strong>{liveSummary.estimated_max_weekly_lesson_slots}</strong>
        </div>
        <div className="ou-summary-stat">
          <span>Açık / Tercihli</span>
          <strong>
            {liveSummary.total_available_slots}
            <Text type="secondary" style={{ fontWeight: 400, margin: '0 4px' }}>/</Text>
            <span style={{ color: '#b45309' }}>{liveSummary.total_preferred_slots}</span>
          </strong>
        </div>
        <div className="ou-summary-stat">
          <span>Seçili Takvim</span>
          <strong>{liveSummary.assigned_calendar_count}</strong>
        </div>
        {detail?.contract?.haftalik_sozlesme_saati ? (
          <div className="ou-summary-stat">
            <span>Sözleşme Saati</span>
            <strong>{detail.contract.haftalik_sozlesme_saati} sa/hafta</strong>
          </div>
        ) : null}

        {(liveSummary.by_program_tipi?.length ?? 0) > 0 && (
          <div className="ou-summary-breakdown">
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Program tipine göre
            </Text>
            {liveSummary.by_program_tipi!.map((row) => {
              const meta = programTipiMeta(row.program_tipi);
              return (
                <div key={row.program_tipi} className="ou-summary-breakdown-row">
                  <Tag
                    style={{
                      color: meta.color,
                      background: meta.bg,
                      borderColor: meta.border,
                      margin: 0,
                    }}
                  >
                    {row.program_tipi_display}
                  </Tag>
                  <span>
                    <strong>{row.estimated_max_weekly_lesson_slots}</strong> slot
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                      ({row.calendar_count} takvim)
                    </Text>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {(liveSummary.by_calendar?.length ?? 0) > 0 && (
          <div className="ou-summary-breakdown">
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Takvim bazında
            </Text>
            {liveSummary.by_calendar!.map((row) => (
              <div key={row.calendar_id} className="ou-summary-breakdown-row">
                <span className="ou-summary-cal-name" title={row.name}>
                  <span
                    className="ou-summary-cal-dot"
                    style={{ background: row.color || '#64748b' }}
                  />
                  {row.name}
                </span>
                <strong>{row.estimated_max_weekly_lesson_slots}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="ou-page">
      <div>
        <Title level={4} style={{ margin: 0 }}>
          Öğretmen Uygunluğu
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
          Grup ve birebir dersler farklı çalışma takvimlerinde tanımlanır. Öğretmen için bir veya
          birden fazla takvim seçip her birinde slot uygunluğu işaretleyin.
        </Paragraph>
      </div>

      <div className="ou-card">
        <div className="ou-card-body">
          <Space wrap style={{ width: '100%', marginBottom: 12 }}>
            <Input.Search
              placeholder="Öğretmen ara…"
              allowClear
              style={{ width: 220 }}
              onSearch={setTeacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
            />
            <Select
              style={{ width: 160 }}
              value={filterBrans}
              options={bransOptions}
              onChange={setFilterBrans}
              placeholder="Branş"
            />
            <Select
              style={{ width: 160 }}
              value={filterSozlesme}
              options={SOZLESME_TURU_OPTIONS}
              onChange={setFilterSozlesme}
              placeholder="Personel Tipi"
            />
            <Select
              style={{ width: 130 }}
              value={filterAktif}
              options={[
                { value: 'active', label: 'Aktif' },
                { value: 'passive', label: 'Pasif' },
                { value: 'all', label: 'Tümü' },
              ]}
              onChange={setFilterAktif}
            />
            <Select
              allowClear
              placeholder="Çalışma Takvimi"
              style={{ width: 180 }}
              value={filterCalendar ?? undefined}
              onChange={(v) => setFilterCalendar(v ?? null)}
              options={(detail?.work_calendars || []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Space>

          <Select
            className="ou-teacher-select"
            style={{ width: '100%' }}
            showSearch
            placeholder="Öğretmen seçin — ad, soyad veya personel no ile arayın"
            loading={teachersLoading}
            value={selectedTeacherId ?? undefined}
            optionFilterProp="label"
            onChange={(v) => setSelectedTeacherId(v)}
            options={filteredTeachers.map((t) => ({
              value: t.id,
              label: `${t.tam_ad} (${t.personel_no})`,
            }))}
            optionRender={(opt) => {
              const t = filteredTeachers.find((x) => x.id === opt.value);
              if (!t) return opt.label;
              return (
                <div className="ou-teacher-option">
                  <Avatar src={t.fotograf_url || undefined} icon={<UserOutlined />} />
                  <div>
                    <div>
                      <Text strong>{t.tam_ad}</Text>{' '}
                      <Tag color={t.aktif_mi ? 'green' : 'default'}>{t.aktif_mi ? 'Aktif' : 'Pasif'}</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t.brans} · {t.rol_ad} · {t.sube_ad}{' '}
                      {t.sozlesme_turu ? `· ${t.sozlesme_turu}` : ''}
                    </Text>
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>

      {!selectedTeacherId && (
        <Alert
          type="info"
          showIcon
          message="Devam etmek için bir öğretmen seçin"
          description="Sözleşme özeti, çalışma takvimi atamaları ve slot uygunluk grid'i seçim sonrası açılır."
        />
      )}

      {selectedTeacherId && (
        <Spin spinning={detailLoading}>
          {detailError ? (
            <Alert
              type="error"
              showIcon
              message="Öğretmen detayı yüklenemedi"
              description={detailError}
              action={
                <Button size="small" onClick={() => loadDetail(selectedTeacherId)}>
                  Tekrar Dene
                </Button>
              }
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <div className="ou-layout">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="ou-card">
                <div className="ou-card-head">
                  <Text strong>Sözleşme Özeti</Text>
                  <Space wrap>
                    <Tag color="purple">Personel › Görevlendirmeler</Tag>
                    <Tag icon={<CalendarOutlined />} color="blue">
                      Personel › Sözleşmeler
                    </Tag>
                  </Space>
                </div>
                <div className="ou-card-body">
                  {detailError ? (
                    <Text type="secondary">Detay yüklenene kadar sözleşme özeti gösterilemez.</Text>
                  ) : !detail?.gorevlendirme && !detail?.contract ? (
                    <Alert
                      type="warning"
                      message="Görevlendirme veya aktif sözleşme bulunamadı."
                      description="Öğretmenin aktif şube ve eğitim yılı için Personel modülünde görevlendirme ve sözleşme tanımlayın."
                    />
                  ) : (
                    <>
                      {detail.gorevlendirme && (
                        <div className="ou-contract-grid" style={{ marginBottom: 16 }}>
                          <div className="ou-contract-item">
                            <label>Rol (Görevlendirme)</label>
                            <span>{detail.gorevlendirme.rol_ad || '—'}</span>
                          </div>
                          <div className="ou-contract-item">
                            <label>Branş (Görevlendirme)</label>
                            <span>{detail.gorevlendirme.brans_ad || '—'}</span>
                          </div>
                          <div className="ou-contract-item">
                            <label>Görev Şubesi</label>
                            <span>{detail.gorevlendirme.gorev_sube_ad || '—'}</span>
                          </div>
                          <div className="ou-contract-item">
                            <label>Eğitim Yılı</label>
                            <span>{detail.gorevlendirme.egitim_yili_ad || '—'}</span>
                          </div>
                        </div>
                      )}

                      {!detail?.contract ? (
                        <Alert type="info" message="Aktif personel sözleşmesi bulunamadı." />
                      ) : (
                        <>
                          <div className="ou-contract-grid">
                            <div className="ou-contract-item">
                              <label>Personel Tipi</label>
                              <span>{detail.contract.sozlesme_turu_display}</span>
                            </div>
                            <div className="ou-contract-item">
                              <label>Sözleşme No</label>
                              <span>{detail.contract.sozlesme_no || '—'}</span>
                            </div>
                            <div className="ou-contract-item">
                              <label>Branş / Görev (Sözleşme)</label>
                              <span>
                                {detail.contract.brans_snapshot || '—'} /{' '}
                                {detail.contract.gorev_snapshot || detail.contract.rol_ad || '—'}
                              </span>
                            </div>
                            <div className="ou-contract-item">
                              <label>Çalışma Günleri</label>
                              <span>{contractDaysLabel(detail.contract)}</span>
                            </div>
                            <div className="ou-contract-item">
                              <label>İzin Günleri</label>
                              <span>{izinGunleriLabel(detail.contract)}</span>
                            </div>
                            <div className="ou-contract-item">
                              <label>Mesai Saatleri (Özet)</label>
                              <span>{mesaiLabel(detail.contract)}</span>
                            </div>
                            <div className="ou-contract-item">
                              <label>Haftalık Sözleşme Süresi</label>
                              <span>{detail.contract.haftalik_sozlesme_saati} saat</span>
                            </div>
                            <div className="ou-contract-item">
                              <label>Haftalık Çalışma Günü</label>
                              <span>{detail.contract.haftalik_calisma_gun_sayisi} gün</span>
                            </div>
                          </div>

                          {detail.contract.mesai_saatleri.some((m) => m.aktif) && (
                            <div style={{ marginTop: 16, overflowX: 'auto' }}>
                              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                                Gün bazlı mesai (sözleşme)
                              </Text>
                              <table className="ou-grid-table" style={{ minWidth: 480 }}>
                                <thead>
                                  <tr>
                                    <th className="ou-grid-day-head">Gün</th>
                                    <th className="ou-grid-slot-head">Başlangıç</th>
                                    <th className="ou-grid-slot-head">Bitiş</th>
                                    <th className="ou-grid-slot-head">Mola</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.contract.mesai_saatleri.map((m) => (
                                    <tr key={m.gun}>
                                      <td className="ou-grid-day-head">{m.gun_label}</td>
                                      <td style={{ textAlign: 'center', padding: 8 }}>
                                        {m.aktif ? m.baslangic || '—' : '—'}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: 8 }}>
                                        {m.aktif ? m.bitis || '—' : '—'}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: 8 }}>
                                        {m.aktif && m.mola_dakika ? `${m.mola_dakika} dk` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {detail.contract.ders_ucretleri.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                                Ders ücreti tanımları (sözleşme)
                              </Text>
                              <Space wrap>
                                {detail.contract.ders_ucretleri.map((du) => (
                                  <Tag key={du.id}>
                                    {du.brans_ad}: {du.haftalik_saat} saat/hafta ({du.ucret_tipi_display})
                                  </Tag>
                                ))}
                              </Space>
                            </div>
                          )}

                          {detail.contract.ek_ders_bilgisi && (
                            <div className="ou-contract-item" style={{ marginTop: 16 }}>
                              <label>Ek Ders / Notlar</label>
                              <span style={{ whiteSpace: 'pre-wrap' }}>{detail.contract.ek_ders_bilgisi}</span>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-head">
                  <Space direction="vertical" size={0}>
                    <Text strong>Çalışma Takvimleri</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Grup ve birebir programları ayrı takvimlerde tanımlayın; öğretmenin verebileceği
                      takvimleri seçin (birden fazla seçilebilir).
                    </Text>
                  </Space>
                </div>
                <div className="ou-card-body">
                  <Space wrap style={{ marginBottom: 14 }}>
                    <Segmented
                      size="small"
                      value={calendarProgramFilter}
                      onChange={(v) => setCalendarProgramFilter(v as CalendarProgramFilter)}
                      options={[
                        { label: 'Tümü', value: 'all' },
                        { label: 'Grup', value: 'GRUP' },
                        { label: 'Birebir', value: 'BIREBIR' },
                        { label: 'Genel', value: 'GENEL' },
                      ]}
                    />
                    {calendarIds.length > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {calendarIds.length} takvim seçili
                      </Text>
                    )}
                  </Space>
                  {renderCalendarGroups()}
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-head">
                  <Space direction="vertical" size={0}>
                    <Text strong>Slot Uygunlukları</Text>
                    <Segmented
                      size="small"
                      value={mode}
                      onChange={(v) => switchMode(v as ModeKind)}
                      options={[
                        { label: 'Varsayılan Uygunluk', value: 'DEFAULT' },
                        { label: 'Geçici Uygunluk', value: 'TEMPORARY' },
                      ]}
                    />
                  </Space>
                </div>
                <div className="ou-card-body">
                  {mode === 'TEMPORARY' && (
                    <Space wrap style={{ marginBottom: 16 }}>
                      <Input
                        placeholder="Başlık"
                        value={tempTitle}
                        onChange={(e) => { setTempTitle(e.target.value); setDirty(true); }}
                        style={{ width: 200 }}
                      />
                      <RangePicker
                        value={tempRange}
                        onChange={(v) => {
                          setTempRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null);
                          setDirty(true);
                        }}
                        format="DD.MM.YYYY"
                      />
                      {detail?.temporary_sets && detail.temporary_sets.length > 0 && (
                        <Select
                          placeholder="Geçici kayıt"
                          style={{ width: 220 }}
                          value={tempSetId ?? undefined}
                          options={detail.temporary_sets.map((s) => ({
                            value: s.id,
                            label: `${s.title} (${s.valid_from} – ${s.valid_until})`,
                          }))}
                          onChange={(id) => {
                            const found = detail.temporary_sets.find((s) => s.id === id);
                            applySetToForm(found || null);
                            setDirty(false);
                          }}
                        />
                      )}
                      {tempSetId && (
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            Modal.confirm({
                              title: 'Geçici uygunluğu sil',
                              content: 'Bu geçici kayıt pasifleştirilecek.',
                              okText: 'Sil',
                              cancelText: 'İptal',
                              onOk: async () => {
                                if (!selectedTeacherId || !tempSetId) return;
                                await deleteTemporaryAvailability(selectedTeacherId, tempSetId);
                                message.success('Geçici uygunluk silindi.');
                                await loadDetail(selectedTeacherId);
                              },
                            });
                          }}
                        >
                          Sil
                        </Button>
                      )}
                    </Space>
                  )}

                  {!calendarIds.length ? (
                    <div className="ou-empty-state">
                      Önce en az bir çalışma takvimi seçin.
                    </div>
                  ) : (
                    <>
                      <Tabs
                        type="card"
                        activeKey={String(activeCalendarTab)}
                        onChange={(k) => setActiveCalendarTab(Number(k))}
                        items={selectedCalendars.map((c) => {
                          const tipMeta = programTipiMeta(c.program_tipi);
                          const tabStats = summaryForCalendar(cells, c.id);
                          return {
                            key: String(c.id),
                            label: (
                              <Space size={6}>
                                <span>{c.name}</span>
                                <Tag
                                  style={{
                                    color: tipMeta.color,
                                    background: tipMeta.bg,
                                    borderColor: tipMeta.border,
                                    margin: 0,
                                    fontSize: 10,
                                    lineHeight: '18px',
                                    padding: '0 6px',
                                  }}
                                >
                                  {tipMeta.label}
                                </Tag>
                                {tabStats.estimated_max_weekly_lesson_slots > 0 && (
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {tabStats.estimated_max_weekly_lesson_slots}
                                  </Text>
                                )}
                              </Space>
                            ),
                          };
                        })}
                        style={{ marginBottom: 12 }}
                      />

                      {activeTabCalendar && activeTabSummary ? (
                        <Alert
                          type="info"
                          showIcon
                          style={{ marginBottom: 12 }}
                          message={
                            <Space wrap>
                              <Text strong>{activeTabCalendar.name}</Text>
                              <Tag
                                style={{
                                  color: programTipiMeta(activeTabCalendar.program_tipi).color,
                                  background: programTipiMeta(activeTabCalendar.program_tipi).bg,
                                  borderColor: programTipiMeta(activeTabCalendar.program_tipi).border,
                                }}
                              >
                                {activeTabCalendar.program_tipi_display}
                              </Tag>
                              <Text type="secondary">
                                Bu sekmede {activeTabSummary.estimated_max_weekly_lesson_slots} uygun
                                slot · {activeTabCalendar.active_day_count} aktif gün
                              </Text>
                            </Space>
                          }
                          description={
                            activeTabCalendar.used_templates.length
                              ? `Ders saati şablonları: ${activeTabCalendar.used_templates.map((t) => t.name).join(', ')}`
                              : undefined
                          }
                        />
                      ) : null}

                      <div className="ou-toolbar" style={{ marginBottom: 12 }}>
                        <div className="ou-toolbar-group">
                          <Button icon={<ReloadOutlined />} onClick={reloadFromServer}>
                            Varsayılanı Yükle
                          </Button>
                          <Button
                            onClick={() => activeCalendarTab && patchAllCellsForCalendar(activeCalendarTab, 'AVAILABLE')}
                          >
                            Tümünü Uygun Yap
                          </Button>
                          <Button
                            onClick={() => activeCalendarTab && patchAllCellsForCalendar(activeCalendarTab, 'UNAVAILABLE')}
                          >
                            Tümünü Temizle
                          </Button>
                          <Button onClick={fillFromContract}>Şablondan Doldur</Button>
                          <Dropdown menu={{ items: quickMenuItems }}>
                            <Button icon={<CopyOutlined />}>Hızlı İşlemler</Button>
                          </Dropdown>
                        </div>
                        <Button
                          type="primary"
                          icon={<SaveOutlined />}
                          loading={saving}
                          onClick={() => handleSave(false)}
                        >
                          Kaydet
                        </Button>
                      </div>

                      <div className="ou-legend" style={{ marginBottom: 10 }}>
                        {(Object.keys(STATUS_META) as SlotAvailabilityStatus[]).map((s) => (
                          <span key={s} className="ou-legend-item">
                            <span
                              className="ou-legend-swatch"
                              style={{
                                background: STATUS_META[s].bg,
                                color: STATUS_META[s].color,
                                borderColor: STATUS_META[s].border,
                              }}
                            >
                              {STATUS_META[s].short}
                            </span>
                            {STATUS_META[s].label}
                          </span>
                        ))}
                        <Text type="secondary">· Sürükle · Ctrl+ tık · Sağ tık menü</Text>
                      </div>

                      <SlotAvailabilityGrid
                        calendarId={activeCalendarTab || 0}
                        structure={activeCalendarTab ? gridCache[activeCalendarTab] : null}
                        cells={cells}
                        loading={gridLoading && !gridCache[activeCalendarTab || 0]}
                        onChange={(next) => {
                          setCells(next);
                          setDirty(true);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {summaryPanel}
          </div>
        </Spin>
      )}
    </div>
  );
}
