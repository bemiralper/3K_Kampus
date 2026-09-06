'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchDersProgramlari, createDersProgrami, updateDersProgrami,
  fetchDersProgramiSablonlari, createDersProgramiSablonu, deleteDersProgramiSablonu,
  updateDersProgramiSablonu, downloadDersProgramiExport,
  type SubeDersProgrami, type DersProgramiSablonu,
} from '@/lib/kutuphane-api';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';
import { useKurum } from '@/lib/contexts/KurumContext';
import { buildDersProgramiPrintHtml, openKutuphanePrintWindow } from '@/lib/kutuphane-list-print';
import { downloadBlob } from '@/lib/download-file';
import {
  DAY_DEFS, PERIOD_DEFS, PROGRAM_TEMPLATES,
  DEFAULT_AUTO_CONFIG,
  appendSlotToDays, applyProgramTemplate, buildAutoSchedule, buildDersProgramiExportTable,
  buildScheduleMatrix, copyDaySchedule, countWeeklyStats, deriveGunAktiflik, emptyDaySchedule,
  formatDuration, getActiveDayDefs, normalizeGunlukDersSaatleri, parseTimeInput, previewAutoBreaks,
  removeSlotCell, removeSlotFromDays, setSlotTime,
  type AutoScheduleConfig, type DaySessionCode, type GunlukDersSaatleri, type ProgramTemplateId,
} from '@/lib/ders-programi-utils';
import s from './ders-programi.module.css';

type FontSize = 's' | 'm' | 'l' | 'xl';

const FONT_STEPS: { value: FontSize; label: string; cls: string; title: string }[] = [
  { value: 's', label: 'A', cls: s.fontStepS, title: 'Küçük' },
  { value: 'm', label: 'A', cls: s.fontStepM, title: 'Orta' },
  { value: 'l', label: 'A', cls: s.fontStepL, title: 'Büyük' },
  { value: 'xl', label: 'A', cls: s.fontStepXl, title: 'Çok büyük' },
];

type PageOrientation = 'landscape' | 'portrait';

const ORIENTATIONS: { value: PageOrientation; label: string; title: string }[] = [
  { value: 'landscape', label: '▭ Yatay', title: 'yatay (A4 landscape)' },
  { value: 'portrait', label: '▯ Dikey', title: 'dikey (A4 portrait)' },
];

const FONT_STORAGE_KEY = 'kutuphane.ders-programi.font';
const ORIENT_STORAGE_KEY = 'kutuphane.ders-programi.pdf-yon';

// ────────────────────────────────────────────────────────────
// Haftalık tablo — satır: etüt/ara, sütun: gün
// ────────────────────────────────────────────────────────────

type CellRef = { code: DaySessionCode; slotIndex: number; dayKey: string };

/** Açık hücrenin satır içi saat düzenleyicisi — dar metin girişleri, "930" → "09:30". */
function CellEditor({
  value,
  onCommit,
  onClose,
  onRemove,
  label,
}: {
  value: { baslangic: string; bitis: string };
  onCommit: (field: 'baslangic' | 'bitis', next: string) => void;
  onClose: () => void;
  onRemove: () => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value);

  const commit = (field: 'baslangic' | 'bitis') => {
    const parsed = parseTimeInput(draft[field]);
    if (parsed && parsed !== value[field]) onCommit(field, parsed);
    else setDraft((prev) => ({ ...prev, [field]: value[field] }));
  };

  const keys = (e: React.KeyboardEvent<HTMLInputElement>, field: 'baslangic' | 'bitis') => {
    if (e.key === 'Enter') { e.preventDefault(); commit(field); onClose(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <span className={s.cellEdit}>
      <input
        className={s.timeInput}
        value={draft.baslangic}
        autoFocus
        inputMode="numeric"
        maxLength={5}
        aria-label={`${label} başlangıç`}
        onChange={(e) => setDraft({ ...draft, baslangic: e.target.value })}
        onBlur={() => commit('baslangic')}
        onKeyDown={(e) => keys(e, 'baslangic')}
      />
      <span className={s.cellDash}>–</span>
      <input
        className={s.timeInput}
        value={draft.bitis}
        inputMode="numeric"
        maxLength={5}
        aria-label={`${label} bitiş`}
        onChange={(e) => setDraft({ ...draft, bitis: e.target.value })}
        onBlur={() => commit('bitis')}
        onKeyDown={(e) => keys(e, 'bitis')}
      />
      <button
        type="button"
        className={`${s.iconBtn} ${s.iconBtnDanger}`}
        title={`${label} — kaldır`}
        aria-label={`${label} kaldır`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onRemove}
      >
        ✕
      </button>
    </span>
  );
}

function ScheduleTable({
  gunluk,
  gunAktiflik,
  editMode,
  autoConfig,
  onChange,
}: {
  gunluk: GunlukDersSaatleri;
  gunAktiflik: ReturnType<typeof deriveGunAktiflik>;
  editMode: boolean;
  autoConfig: AutoScheduleConfig;
  onChange: (next: GunlukDersSaatleri) => void;
}) {
  const [editing, setEditing] = useState<CellRef | null>(null);
  // Düzenlerken kapalı günler de görünür kalır ki yeni bir gün açılabilsin.
  const days = useMemo(
    () => (editMode ? [...DAY_DEFS] : getActiveDayDefs(gunAktiflik)),
    [editMode, gunAktiflik],
  );
  const sections = useMemo(() => buildScheduleMatrix(gunluk, days), [gunluk, days]);

  if (days.length === 0) {
    return <div className={s.tableEmpty}>Henüz hiçbir gün için çalışma saati yok. Düzenle&apos;ye basıp otomatik oluşturabilirsiniz.</div>;
  }

  /** Grup başlığındaki "+ Etüt": zaten etüdü olan günlere ekler, yoksa açık günlere. */
  const appendTargets = (code: DaySessionCode): string[] => {
    const withSlots = DAY_DEFS.filter((d) => (gunluk[d.key]?.[code]?.dersler?.length || 0) > 0);
    if (withSlots.length) return withSlots.map((d) => d.key);
    const open = DAY_DEFS.filter((d) => gunAktiflik[d.key]?.aktif);
    if (open.length) return open.map((d) => d.key);
    return ['0', '1', '2', '3', '4'];
  };

  /** Boş hücreye basınca o gün için eksik etütler tamamlanır. */
  const fillCell = (dayKey: string, code: DaySessionCode, slotIndex: number) => {
    let next = gunluk;
    while ((next[dayKey]?.[code]?.dersler?.length || 0) <= slotIndex) {
      next = appendSlotToDays(next, [dayKey], code, autoConfig.dersSuresiDk, autoConfig.teneffusDk);
    }
    onChange(next);
  };

  return (
    <div className={s.tableWrap}>
      <table className={`${s.table}${editMode ? ` ${s.tableEdit}` : ''}`}>
        <thead>
          <tr className={s.headRow}>
            <th className={s.corner} scope="col">Oturum</th>
            {days.map((day) => {
              const open = gunAktiflik[day.key]?.aktif;
              const etutCount = PERIOD_DEFS.reduce(
                (sum, p) => sum + (gunluk[day.key]?.[p.code]?.dersler?.length || 0),
                0,
              );
              return (
                <th
                  key={day.key}
                  scope="col"
                  className={`${s.dayHead}${open ? '' : ` ${s.dayHeadClosed}`}`}
                >
                  <span className={s.dayName}>{day.label}</span>
                  <span className={s.dayCount}>{open ? `${etutCount} etüt` : 'Kapalı'}</span>
                </th>
              );
            })}
          </tr>
        </thead>

        {sections.map((section) => {
          const slotCount = section.rows.length;
          if (!editMode && slotCount === 0) return null;
          return (
            <tbody key={section.code}>
              <tr
                className={s.groupRow}
                style={{ background: section.light, '--dp-accent': section.accent } as React.CSSProperties}
              >
                <th colSpan={days.length + 1} scope="colgroup">
                  <div className={s.groupInner}>
                    <span className={s.groupIcon} style={{ background: section.gradient }}>{section.icon}</span>
                    <span className={s.groupName}>{section.label}</span>
                    <span className={s.groupCount}>
                      {slotCount > 0 ? `${slotCount} etüt` : 'etüt yok'}
                    </span>
                    {editMode && (
                      <button
                        type="button"
                        className={s.groupAdd}
                        onClick={() => onChange(appendSlotToDays(
                          gunluk, appendTargets(section.code), section.code,
                          autoConfig.dersSuresiDk, autoConfig.teneffusDk,
                        ))}
                      >
                        + Etüt ekle
                      </button>
                    )}
                  </div>
                </th>
              </tr>

              {section.rows.map((row) => (
                <tr
                  key={`${section.code}-${row.slotIndex}`}
                  className={row.slotIndex % 2 === 1 ? s.rowAlt : undefined}
                >
                  <th className={s.rowLabel} scope="row">
                    <span className={s.rowLabelInner}>
                      {row.label}
                      {editMode && (
                        <button
                          type="button"
                          className={`${s.iconBtn} ${s.iconBtnDanger}`}
                          title="Bu etüdü tüm günlerden kaldır"
                          aria-label={`${section.label} ${row.label} — tüm günlerden kaldır`}
                          onClick={() => {
                            setEditing(null);
                            onChange(removeSlotFromDays(
                              gunluk, days.map((d) => d.key), section.code, row.slotIndex,
                            ));
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </th>
                  {days.map((day) => {
                    const cell = row.cells[day.key];
                    const closed = !gunAktiflik[day.key]?.aktif;
                    const label = `${day.label} ${section.label} ${row.label}`;
                    const isEditing = editMode && cell && editing
                      && editing.code === section.code
                      && editing.slotIndex === row.slotIndex
                      && editing.dayKey === day.key;
                    return (
                      <td key={day.key} className={`${s.cell}${closed ? ` ${s.cellClosed}` : ''}`}>
                        {!cell ? (
                          editMode ? (
                            <button
                              type="button"
                              className={s.cellAdd}
                              onClick={() => fillCell(day.key, section.code, row.slotIndex)}
                            >
                              + saat
                            </button>
                          ) : (
                            <span className={s.cellEmpty}>—</span>
                          )
                        ) : isEditing ? (
                          <CellEditor
                            value={cell}
                            label={label}
                            onCommit={(field, next) => onChange(setSlotTime(
                              gunluk, day.key, section.code, row.slotIndex, field, next,
                            ))}
                            onClose={() => setEditing(null)}
                            onRemove={() => {
                              setEditing(null);
                              onChange(removeSlotCell(gunluk, day.key, section.code, row.slotIndex));
                            }}
                          />
                        ) : editMode ? (
                          <button
                            type="button"
                            className={s.cellChip}
                            title={`${label} — saatleri düzenle`}
                            onClick={() => setEditing({ code: section.code, slotIndex: row.slotIndex, dayKey: day.key })}
                          >
                            {cell.baslangic} – {cell.bitis}
                          </button>
                        ) : (
                          <span className={s.cellTime}>{cell.baslangic} – {cell.bitis}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {section.breakRow ? (() => {
                const breakRow = section.breakRow;
                return (
                  <tr className={s.breakRow}>
                    <th className={s.rowLabel} scope="row">{breakRow.label}</th>
                    {days.map((day) => {
                      const cell = breakRow.cells[day.key];
                      const closed = !gunAktiflik[day.key]?.aktif;
                      return (
                        <td key={day.key} className={`${s.cell}${closed ? ` ${s.cellClosed}` : ''}`}>
                          {cell ? (
                            <span className={s.cellTime}>{cell.baslangic} – {cell.bitis}</span>
                          ) : (
                            <span className={s.cellEmpty}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })() : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Otomatik oluşturma — oturum pencerelerinden etüt ve ara üretir
// ────────────────────────────────────────────────────────────

function AutoBuilder({
  config,
  onChange,
  onApply,
}: {
  config: AutoScheduleConfig;
  onChange: (next: AutoScheduleConfig) => void;
  onApply: () => void;
}) {
  const breaks = useMemo(() => previewAutoBreaks(config), [config]);
  const setWindow = (code: DaySessionCode, patch: Partial<AutoScheduleConfig['windows'][DaySessionCode]>) => {
    onChange({ ...config, windows: { ...config.windows, [code]: { ...config.windows[code], ...patch } } });
  };

  return (
    <>
      <div className={s.autoGrid}>
        {PERIOD_DEFS.map((period) => {
          const win = config.windows[period.code];
          return (
            <div key={period.code} className={`${s.window}${win.enabled ? ` ${s.windowOn}` : ''}`}>
              <label className={s.windowHead}>
                <input
                  type="checkbox"
                  checked={win.enabled}
                  onChange={(e) => setWindow(period.code, { enabled: e.target.checked })}
                />
                <span className={s.groupIcon} style={{ background: period.gradient }}>{period.icon}</span>
                {period.label}
              </label>
              <div className={s.windowTimes}>
                <input
                  type="time"
                  className={s.timeInput}
                  value={win.start}
                  disabled={!win.enabled}
                  aria-label={`${period.label} başlangıç`}
                  onChange={(e) => setWindow(period.code, { start: e.target.value })}
                />
                <span className={s.cellDash}>–</span>
                <input
                  type="time"
                  className={s.timeInput}
                  value={win.end}
                  disabled={!win.enabled}
                  aria-label={`${period.label} bitiş`}
                  onChange={(e) => setWindow(period.code, { end: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.autoOpts}>
        <label className={s.field}>
          <span>Etüt süresi (dk)</span>
          <input
            type="number"
            min={5}
            max={240}
            className={s.numInput}
            value={config.dersSuresiDk}
            onChange={(e) => onChange({ ...config, dersSuresiDk: Number(e.target.value) || 0 })}
          />
        </label>
        <label className={s.field}>
          <span>Teneffüs (dk)</span>
          <input
            type="number"
            min={0}
            max={120}
            className={s.numInput}
            value={config.teneffusDk}
            onChange={(e) => onChange({ ...config, teneffusDk: Number(e.target.value) || 0 })}
          />
        </label>
        <div className={s.field} style={{ flex: 1 }}>
          <span>Uygulanacak günler</span>
          <div className={s.dayChips}>
            {DAY_DEFS.map((day) => {
              const on = config.days.includes(day.key);
              return (
                <button
                  key={day.key}
                  type="button"
                  className={`${s.dayChip}${on ? ` ${s.dayChipOn}` : ''}`}
                  aria-pressed={on}
                  onClick={() => onChange({
                    ...config,
                    days: on ? config.days.filter((k) => k !== day.key) : [...config.days, day.key],
                  })}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={s.autoPreview}>
        {breaks.length > 0 ? (
          <>
            <strong>Otomatik aralar:</strong>
            {breaks.map((brk) => (
              <span key={brk.label} className={s.autoPreviewChip}>
                {brk.icon} {brk.label} · {brk.baslangic}–{brk.bitis} ({formatDuration(brk.dakika)})
              </span>
            ))}
          </>
        ) : (
          <span>Öğle/akşam arası, iki oturum arasında boşluk kaldığında otomatik hesaplanır.</span>
        )}
      </div>

      <div className={s.btnRow} style={{ marginTop: 14 }}>
        <button
          type="button"
          className={s.btnPrimary}
          disabled={config.days.length === 0}
          onClick={onApply}
        >
          Programı oluştur
        </button>
        <span className={s.cardHint} style={{ margin: 0 }}>
          Seçili günlerin üzerine yazılır; diğer günler olduğu gibi kalır.
        </span>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────

export default function DersProgramiPage() {
  const { href, portalHomeHref, portalHomeLabel } = useKutuphanePath();
  const { activeSube, activeKurum } = useKurum();
  const selectedSube = activeSube?.id ?? null;

  const [program, setProgram] = useState<SubeDersProgrami | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [programAd, setProgramAd] = useState('Varsayılan Program');
  const [gunluk, setGunluk] = useState<GunlukDersSaatleri>(() =>
    Object.fromEntries(DAY_DEFS.map((d) => [d.key, emptyDaySchedule()])) as GunlukDersSaatleri,
  );
  const [copySource, setCopySource] = useState('0');
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | 'pdf' | null>(null);

  const [fontSize, setFontSize] = useState<FontSize>('m');
  const [orientation, setOrientation] = useState<PageOrientation>('landscape');
  const [autoConfig, setAutoConfig] = useState<AutoScheduleConfig>(DEFAULT_AUTO_CONFIG);

  const [sablonlar, setSablonlar] = useState<DersProgramiSablonu[]>([]);
  const [sablonAd, setSablonAd] = useState('');
  const [sablonBusy, setSablonBusy] = useState(false);

  const gunAktiflik = useMemo(() => deriveGunAktiflik(gunluk), [gunluk]);
  const stats = useMemo(() => countWeeklyStats(gunluk), [gunluk]);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(FONT_STORAGE_KEY) as FontSize | null;
    if (stored && FONT_STEPS.some((step) => step.value === stored)) setFontSize(stored);
    const orient = window.localStorage.getItem(ORIENT_STORAGE_KEY) as PageOrientation | null;
    if (orient && ORIENTATIONS.some((o) => o.value === orient)) setOrientation(orient);
  }, []);

  const changeFontSize = (value: FontSize) => {
    setFontSize(value);
    window.localStorage.setItem(FONT_STORAGE_KEY, value);
  };

  const changeOrientation = (value: PageOrientation) => {
    setOrientation(value);
    window.localStorage.setItem(ORIENT_STORAGE_KEY, value);
  };

  const loadProgram = useCallback(async (subeId: number) => {
    setLoading(true);
    try {
      const res = await fetchDersProgramlari({ sube_id: subeId });
      const d = res.data as SubeDersProgrami | null;
      setProgram(d);
      if (d) {
        setProgramAd(d.ad);
        setGunluk(normalizeGunlukDersSaatleri(d.ders_saatleri as Record<string, unknown>, d.gun_bazli_aktiflik));
        setEditMode(false);
      } else {
        setProgramAd('Varsayılan Program');
        setGunluk(buildAutoSchedule(DEFAULT_AUTO_CONFIG));
        setEditMode(true);
      }
    } catch {
      showToast('error', 'Program yüklenemedi');
    }
    setLoading(false);
  }, [showToast]);

  const loadSablonlar = useCallback(async () => {
    try {
      const res = await fetchDersProgramiSablonlari();
      setSablonlar((res.data as DersProgramiSablonu[]) || []);
    } catch {
      // Şablon listesi kritik değil; sessiz geç.
    }
  }, []);

  useEffect(() => {
    if (selectedSube) loadProgram(selectedSube);
    else setLoading(false);
  }, [selectedSube, loadProgram]);

  useEffect(() => { loadSablonlar(); }, [loadSablonlar]);

  const handleSave = async () => {
    if (!selectedSube) return;
    setSaving(true);
    try {
      const payload = {
        sube_id: selectedSube,
        ad: programAd,
        ders_saatleri: gunluk,
        gun_bazli_aktiflik: gunAktiflik,
        aktif_mi: true,
      };
      if (program) {
        const r = await updateDersProgrami(program.id, payload);
        if (r.data) { setProgram(r.data as SubeDersProgrami); showToast('success', 'Program güncellendi'); }
      } else {
        const r = await createDersProgrami(payload);
        if (r.data) { setProgram(r.data as SubeDersProgrami); showToast('success', 'Program oluşturuldu'); }
      }
      setEditMode(false);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Kaydetme başarısız');
    }
    setSaving(false);
  };

  const handlePrintPdf = () => {
    if (!selectedSube) return;
    setExporting('pdf');
    try {
      openKutuphanePrintWindow(buildDersProgramiPrintHtml({
        meta: {
          title: 'Haftalık Çalışma Saatleri',
          subtitle: programAd,
          subeAdi: activeSube?.ad,
          kurumBranding: activeKurum,
          orientation,
        },
        programAd,
        dersSaatleri: gunluk,
        gunAktiflik,
      }));
    } finally {
      setExporting(null);
    }
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    if (!selectedSube) return;
    setExporting(format);
    try {
      const { columns, rows } = buildDersProgramiExportTable(gunluk, gunAktiflik);
      if (rows.length === 0) {
        showToast('error', 'Dışa aktarılacak veri yok.');
        return;
      }
      const blob = await downloadDersProgramiExport({
        columns,
        rows,
        meta: {
          program_ad: programAd,
          sube_id: selectedSube,
          sube_adi: activeSube?.ad,
          aktif_gun: stats.activeDays,
          toplam_periyot: stats.totalPeriods,
          toplam_ders: stats.totalDers,
        },
        format,
      });
      const safeName = (programAd || 'ders_programi').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_');
      downloadBlob(blob, `${safeName}.${format}`);
    } catch (err) {
      const detail = err instanceof Error && err.message ? `: ${err.message}` : '';
      showToast('error', `${format === 'xlsx' ? 'Excel' : 'CSV'} dosyası oluşturulurken hata oluştu${detail}`);
    } finally {
      setExporting(null);
    }
  };

  const handleCopyDay = () => {
    if (copyTargets.length === 0) return;
    setGunluk(copyDaySchedule(gunluk, copySource, copyTargets));
    setCopyTargets([]);
    showToast('success', `${DAY_DEFS.find((d) => d.key === copySource)?.label} programı kopyalandı`);
  };

  const handleSaveSablon = async () => {
    const ad = sablonAd.trim();
    if (!ad) return;
    setSablonBusy(true);
    try {
      const mevcut = sablonlar.find((t) => t.ad.toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR'));
      const payload = { ad, ders_saatleri: gunluk, gun_bazli_aktiflik: gunAktiflik };
      if (mevcut) {
        await updateDersProgramiSablonu(mevcut.id, payload);
        showToast('success', `"${ad}" şablonu güncellendi`);
      } else {
        await createDersProgramiSablonu(payload);
        showToast('success', `"${ad}" şablonu kaydedildi`);
      }
      setSablonAd('');
      await loadSablonlar();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Şablon kaydedilemedi');
    }
    setSablonBusy(false);
  };

  const handleLoadSablon = (sablon: DersProgramiSablonu) => {
    setGunluk(normalizeGunlukDersSaatleri(
      sablon.ders_saatleri as Record<string, unknown>,
      sablon.gun_bazli_aktiflik,
    ));
    setEditMode(true);
    showToast('success', `"${sablon.ad}" yüklendi — kaydetmeyi unutmayın`);
  };

  const handleDeleteSablon = async (sablon: DersProgramiSablonu) => {
    if (!window.confirm(`"${sablon.ad}" şablonu silinsin mi?`)) return;
    setSablonBusy(true);
    try {
      await deleteDersProgramiSablonu(sablon.id);
      await loadSablonlar();
      showToast('success', 'Şablon silindi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Şablon silinemedi');
    }
    setSablonBusy(false);
  };

  const handleApplyBuiltIn = (id: ProgramTemplateId) => {
    setGunluk(applyProgramTemplate(id));
    showToast('success', 'Hazır şablon uygulandı');
  };

  return (
    <div className={s.page} data-font={fontSize}>
      {toast && (
        <div className={`${s.toast} ${toast.type === 'success' ? s.toastOk : s.toastErr}`} role="status">
          {toast.msg}
        </div>
      )}

      <div className="hero-header" style={{ marginBottom: 20 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Ders Programı Yönetimi</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>{portalHomeLabel}</a><span>/</span>
              <a href={href()}>Kütüphane</a><span>/</span><span>Ders Programı</span>
            </div>
          </div>
        </div>
        {editMode && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { setEditMode(false); if (selectedSube) loadProgram(selectedSube); }}
              style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 24px', background: '#fff', color: '#0061a6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        )}
      </div>

      <div className={s.kpis}>
        {[
          { icon: '🏫', label: 'Şube', value: activeSube?.ad || '—', text: true, g: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
          { icon: '📅', label: 'Aktif Gün', value: stats.activeDays, g: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
          { icon: '⏰', label: 'Haftalık Oturum', value: stats.totalPeriods, g: 'linear-gradient(135deg, #f59e0b, #d97706)' },
          { icon: '📝', label: 'Toplam Etüt', value: stats.totalDers, g: 'linear-gradient(135deg, #22c55e, #16a34a)' },
        ].map((k) => (
          <div key={k.label} className={s.kpi}>
            <div className={s.kpiIcon} style={{ background: k.g }}>{k.icon}</div>
            <div>
              <div className={`${s.kpiValue}${k.text ? ` ${s.kpiValueText}` : ''}`}>{k.value}</div>
              <div className={s.kpiLabel}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {!selectedSube && !loading && (
        <div className={s.card}><div className={s.tableEmpty}>Aktif şube seçilmedi.</div></div>
      )}

      {loading && <div className={s.tableEmpty}>Yükleniyor…</div>}

      {selectedSube && !loading && (
        <>
          <div className={s.card}>
            <div className={s.cardHead}>
              <div className={s.btnRow}>
                {editMode ? (
                  <input
                    className={s.nameInput}
                    value={programAd}
                    onChange={(e) => setProgramAd(e.target.value)}
                    placeholder="Program adı"
                    aria-label="Program adı"
                  />
                ) : (
                  <span className={s.nameText}>{programAd}</span>
                )}
                <span className={`${s.badge} ${program ? s.badgeOn : s.badgeNew}`}>
                  {program ? 'Aktif' : 'Yeni'}
                </span>
              </div>
              <div className={s.btnRow}>
                <div className={s.fontPicker}>
                  <span className={s.fontPickerLabel}>Yazı</span>
                  <div className={s.fontSteps}>
                    {FONT_STEPS.map((step) => (
                      <button
                        key={step.value}
                        type="button"
                        className={`${s.fontStep} ${step.cls}`}
                        aria-pressed={fontSize === step.value}
                        title={step.title}
                        onClick={() => changeFontSize(step.value)}
                      >
                        {step.label}
                      </button>
                    ))}
                  </div>
                </div>
                {!editMode && program && (
                  <div className={s.exportBar}>
                    <button type="button" className={s.btn} disabled={exporting !== null} onClick={() => handleExport('xlsx')}>
                      {exporting === 'xlsx' ? 'Hazırlanıyor…' : '📥 Excel'}
                    </button>
                    <button type="button" className={s.btn} disabled={exporting !== null} onClick={() => handleExport('csv')}>
                      {exporting === 'csv' ? 'Hazırlanıyor…' : '📥 CSV'}
                    </button>
                    <div className={s.orientPicker} role="group" aria-label="PDF sayfa yönü">
                      {ORIENTATIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={s.orientStep}
                          aria-pressed={orientation === o.value}
                          title={`PDF ${o.title}`}
                          onClick={() => changeOrientation(o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" className={s.btn} disabled={exporting !== null} onClick={handlePrintPdf}>
                      {exporting === 'pdf' ? 'Hazırlanıyor…' : '📄 PDF'}
                    </button>
                  </div>
                )}
                {!editMode && (
                  <button type="button" className={s.btnPrimary} onClick={() => setEditMode(true)}>Düzenle</button>
                )}
              </div>
            </div>
          </div>

          {editMode && (
            <div className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <h2 className={s.cardTitle}>Otomatik oluştur</h2>
                  <p className={s.cardHint}>
                    Sabah, öğle ve akşam çalışma saatlerini girin; etütler bu aralıklara bölünür.
                    Öğle arası ve akşam arası ayrıca girilmez — oturumlar arasında kalan boşluktan hesaplanır.
                  </p>
                </div>
              </div>
              <div className={s.cardBody}>
                <AutoBuilder
                  config={autoConfig}
                  onChange={setAutoConfig}
                  onApply={() => {
                    setGunluk(buildAutoSchedule(autoConfig, gunluk));
                    showToast('success', 'Program otomatik oluşturuldu');
                  }}
                />
              </div>
            </div>
          )}

          <div className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>Haftalık çalışma saatleri</h2>
                {editMode && (
                  <p className={s.cardHint}>
                    Hücrelere tıklayıp saatleri değiştirebilir, satır sonundaki ✕ ile bir etüdü tüm günlerden kaldırabilirsiniz.
                  </p>
                )}
              </div>
            </div>
            <ScheduleTable
              gunluk={gunluk}
              gunAktiflik={gunAktiflik}
              editMode={editMode}
              autoConfig={autoConfig}
              onChange={setGunluk}
            />
            {editMode && (
              <div className={s.cardBody}>
                <div className={s.copyPanel}>
                  <div className={s.copyTitle}>Bir günü diğerlerine kopyala</div>
                  <div className={s.btnRow} style={{ marginBottom: 10 }}>
                    <label className={s.field}>
                      <span>Kaynak gün</span>
                      <select
                        className={s.numInput}
                        style={{ width: 150 }}
                        value={copySource}
                        onChange={(e) => setCopySource(e.target.value)}
                      >
                        {DAY_DEFS.map((day) => <option key={day.key} value={day.key}>{day.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className={s.copyGrid}>
                    {DAY_DEFS.filter((d) => d.key !== copySource).map((day) => (
                      <label key={day.key} className={s.copyCheck}>
                        <input
                          type="checkbox"
                          checked={copyTargets.includes(day.key)}
                          onChange={(e) => setCopyTargets(
                            e.target.checked
                              ? [...copyTargets, day.key]
                              : copyTargets.filter((k) => k !== day.key),
                          )}
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>
                  <button type="button" className={s.btnPrimary} disabled={copyTargets.length === 0} onClick={handleCopyDay}>
                    Seçilen günlere kopyala
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>Şablonlar</h2>
                <p className={s.cardHint}>
                  Ekrandaki programı bir adla kaydedin; sonra istediğiniz şubede tek tıkla yükleyin.
                  Şablonlar kurum geneline kaydedilir.
                </p>
              </div>
            </div>
            <div className={s.cardBody}>
              {sablonlar.length === 0 ? (
                <div className={s.empty}>Henüz kayıtlı şablon yok.</div>
              ) : (
                <div className={s.templateList}>
                  {sablonlar.map((sablon) => {
                    const aktifGun = Object.values(sablon.gun_bazli_aktiflik || {}).filter((g) => g?.aktif).length;
                    return (
                      <div key={sablon.id} className={s.template}>
                        <div>
                          <div className={s.templateName}>{sablon.ad}</div>
                          <div className={s.templateMeta}>
                            {aktifGun} aktif gün
                            {sablon.aciklama ? ` · ${sablon.aciklama}` : ''}
                          </div>
                        </div>
                        <div className={s.templateActions}>
                          <button type="button" className={s.btn} onClick={() => handleLoadSablon(sablon)}>Yükle</button>
                          <button
                            type="button"
                            className={s.btnDanger}
                            disabled={sablonBusy}
                            onClick={() => handleDeleteSablon(sablon)}
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={s.templateSave}>
                <input
                  className={s.nameInput}
                  value={sablonAd}
                  placeholder="Şablon adı — örn. Yaz Dönemi"
                  aria-label="Şablon adı"
                  onChange={(e) => setSablonAd(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveSablon(); } }}
                />
                <button
                  type="button"
                  className={s.btnPrimary}
                  disabled={!sablonAd.trim() || sablonBusy}
                  onClick={handleSaveSablon}
                >
                  Bu programı şablon olarak kaydet
                </button>
              </div>

              {editMode && (
                <div className={s.btnRow} style={{ marginTop: 14 }}>
                  <span className={s.fontPickerLabel}>Hazır başlangıç</span>
                  {PROGRAM_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={s.btn}
                      title={t.description}
                      onClick={() => handleApplyBuiltIn(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
