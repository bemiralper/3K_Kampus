'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  createSlot,
  deleteSlot,
  fetchProgramlar,
  fetchSlots,
  resolveDersLabel,
  swapSlots,
  updateProgram,
  updateSlot,
  GUN_LABELS,
  type BirebirProgram,
  type BirebirSlot,
  type PaketDersi,
} from '@/lib/ozel-ders-api';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import {
  Badge,
  Collapsible,
  Drawer,
  EmptyState,
  PageHeader,
  Segmented,
  SkeletonRows,
  avatarGradient,
  initials,
} from './ozelDersUi';
import {
  IconCalendar,
  IconClock,
  IconGrid,
  IconList,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
} from './icons';
import HaftalikProgramGrid from './HaftalikProgramGrid';
import {
  buildPeriods,
  timeToMinutes,
  type PeriodRow,
} from './haftalikGridUtils';
import './ozel-ders.css';

type HaftalikSaatConfig = {
  startTime: string;
  sureDk: number;
  araDk: number;
  dersAdet: number;
};

const DEFAULT_SAAT: HaftalikSaatConfig = {
  startTime: '09:00',
  sureDk: 50,
  araDk: 10,
  dersAdet: 8,
};

function configFromProgram(p: BirebirProgram | null | undefined): HaftalikSaatConfig {
  if (!p) return { ...DEFAULT_SAAT };
  return {
    startTime: /^\d{2}:\d{2}$/.test(p.zaman_baslangic || '') ? (p.zaman_baslangic as string) : '09:00',
    sureDk: Math.max(15, Math.min(180, Number(p.zaman_sure_dk) || 50)),
    araDk: Math.max(0, Math.min(60, Number(p.zaman_ara_dk ?? 10))),
    dersAdet: Math.max(1, Math.min(16, Number(p.zaman_ders_adet) || 8)),
  };
}

type StudentProgramGroup = {
  ogrenci: number;
  ogrenci_ad: string;
  programs: BirebirProgram[];
  primary: BirebirProgram;
  paketAds: string[];
  slotCount: number;
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
};

function groupProgramsByStudent(programs: BirebirProgram[]): StudentProgramGroup[] {
  const byStudent = new Map<number, BirebirProgram[]>();
  for (const p of programs) {
    const list = byStudent.get(p.ogrenci) || [];
    list.push(p);
    byStudent.set(p.ogrenci, list);
  }
  const groups: StudentProgramGroup[] = [];
  for (const [, list] of byStudent) {
    const sorted = [...list].sort((a, b) => {
      if (a.durum !== b.durum) return a.durum === 'AKTIF' ? -1 : 1;
      return (b.slot_count || 0) - (a.slot_count || 0);
    });
    const primary = sorted[0];
    const paketAds = Array.from(
      new Set(
        sorted
          .map((p) => p.premium_paket_ad || p.ozel_ders_paket_ad)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    groups.push({
      ogrenci: primary.ogrenci,
      ogrenci_ad: primary.ogrenci_ad,
      programs: sorted,
      primary,
      paketAds,
      slotCount: sorted.reduce((s, p) => s + (p.slot_count || 0), 0),
      baslangic_tarihi: sorted.map((p) => p.baslangic_tarihi).sort()[0],
      bitis_tarihi: sorted.every((p) => p.bitis_tarihi)
        ? sorted.map((p) => p.bitis_tarihi!).sort().slice(-1)[0]
        : null,
    });
  }
  return groups.sort((a, b) =>
    (a.ogrenci_ad || '').localeCompare(b.ogrenci_ad || '', 'tr', { sensitivity: 'base' }),
  );
}

function paketLabel(p: BirebirProgram): string {
  return p.premium_paket_ad || p.ozel_ders_paket_ad || `Program #${p.id}`;
}

function mergePaketDersleri(programs: BirebirProgram[]): PaketDersi[] {
  const map = new Map<number, PaketDersi>();
  for (const p of programs) {
    for (const d of p.paket_dersleri || []) {
      const prev = map.get(d.id);
      if (!prev) {
        map.set(d.id, { ...d });
      } else if ((d.haftalik_adet || 0) > (prev.haftalik_adet || 0)) {
        map.set(d.id, { ...prev, haftalik_adet: d.haftalik_adet });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/** Ders hangi programa aitse ona yaz; yoksa birincil program. */
function resolveProgramIdForDers(programs: BirebirProgram[], dersId: number): number | null {
  const matches = programs.filter((p) => (p.paket_dersleri || []).some((d) => d.id === dersId));
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    return [...matches].sort((a, b) => (a.slot_count || 0) - (b.slot_count || 0))[0].id;
  }
  return programs[0]?.id ?? null;
}

export default function HaftalikSablonlariClient() {
  const searchParams = useSearchParams();
  const { meta, ready, egitimYiliId, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const urlProgramId = Number(searchParams.get('program_id') || 0) || null;
  const urlOgrenciId = Number(searchParams.get('ogrenci_id') || 0) || null;

  const [programs, setPrograms] = useState<BirebirProgram[]>([]);
  const [programId, setProgramId] = useState<number | null>(urlProgramId);
  const [studentQuery, setStudentQuery] = useState('');
  const [lessons, setLessons] = useState<BirebirSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [config, setConfig] = useState<HaftalikSaatConfig>({ ...DEFAULT_SAAT });
  const [savingZaman, setSavingZaman] = useState(false);
  const zamanSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    gun: '1',
    baslangic: '09:00',
    bitis: '09:50',
    sure_dk: '50',
    ders_id: '',
    ogretmen_id: '',
  });

  const [detailLesson, setDetailLesson] = useState<BirebirSlot | null>(null);
  const [editForm, setEditForm] = useState({
    gun: '1',
    baslangic: '',
    bitis: '',
    sure_dk: '50',
    ders_id: '',
    ogretmen_id: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const scrollYRef = useRef(0);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollTopRef = useRef(0);
  const [moving, setMoving] = useState(false);

  const periods = useMemo(
    () => buildPeriods(config.startTime, config.sureDk, config.araDk, config.dersAdet),
    [config.startTime, config.sureDk, config.araDk, config.dersAdet],
  );
  const lessonPeriods = useMemo(() => periods.filter((p) => !p.isBreak), [periods]);

  const loadPrograms = useCallback(async () => {
    if (!ready) return;
    try {
      const data = await fetchProgramlar({
        egitim_yili_id: egitimYiliId || undefined,
        durum: 'AKTIF',
      });
      setPrograms(data);
      setProgramId((prev) => {
        if (urlProgramId && data.some((p) => p.id === urlProgramId)) return urlProgramId;
        if (urlOgrenciId) {
          const forStudent = data.find((p) => p.ogrenci === urlOgrenciId);
          if (forStudent) return forStudent.id;
        }
        if (prev && data.some((p) => p.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e) {
      show(e instanceof Error ? e.message : 'Programlar yüklenemedi', 'error');
    }
  }, [ready, egitimYiliId, show, urlProgramId, urlOgrenciId]);

  const captureScroll = useCallback(() => {
    scrollYRef.current = typeof window !== 'undefined' ? window.scrollY : 0;
    tableScrollTopRef.current = tableScrollRef.current?.scrollTop ?? 0;
  }, []);

  const restoreScroll = useCallback(() => {
    const y = scrollYRef.current;
    const tableTop = tableScrollTopRef.current;
    const apply = () => {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: y, left: 0, behavior: 'auto' });
      }
      if (tableScrollRef.current) {
        tableScrollRef.current.scrollTop = tableTop;
      }
    };
    // React re-render sonrası da aynı konumu koru
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }, []);

  const studentGroups = useMemo(() => groupProgramsByStudent(programs), [programs]);
  const activeProgram = programs.find((p) => p.id === programId) || null;
  const activeStudentGroup = useMemo(() => {
    if (!activeProgram) return null;
    return studentGroups.find((g) => g.ogrenci === activeProgram.ogrenci) || null;
  }, [studentGroups, activeProgram]);

  const siblingPrograms = activeStudentGroup?.programs || [];
  const siblingProgramKey = siblingPrograms.map((p) => p.id).join(',');
  const paketDersleri = useMemo(() => mergePaketDersleri(siblingPrograms), [siblingProgramKey]);

  // Seçili öğrencinin programındaki zaman ayarlarını yükle
  useEffect(() => {
    setConfig(configFromProgram(activeStudentGroup?.primary || activeProgram));
  }, [activeStudentGroup?.ogrenci, activeProgram?.id]);

  useEffect(() => {
    return () => {
      if (zamanSaveTimer.current) clearTimeout(zamanSaveTimer.current);
    };
  }, []);

  const persistZaman = useCallback(
    (next: HaftalikSaatConfig) => {
      if (!activeStudentGroup?.programs.length) return;
      if (zamanSaveTimer.current) clearTimeout(zamanSaveTimer.current);
      zamanSaveTimer.current = setTimeout(async () => {
        setSavingZaman(true);
        const payload = {
          zaman_baslangic: next.startTime,
          zaman_sure_dk: next.sureDk,
          zaman_ara_dk: next.araDk,
          zaman_ders_adet: next.dersAdet,
        };
        try {
          await Promise.all(
            activeStudentGroup.programs.map((p) => updateProgram(p.id, payload)),
          );
          setPrograms((prev) =>
            prev.map((p) =>
              p.ogrenci === activeStudentGroup.ogrenci ? { ...p, ...payload } : p,
            ),
          );
        } catch (e) {
          show(e instanceof Error ? e.message : 'Zaman ayarları kaydedilemedi', 'error');
        } finally {
          setSavingZaman(false);
        }
      }, 400);
    },
    [activeStudentGroup, show],
  );

  function setStartTime(v: string) {
    setConfig((prev) => {
      const next = { ...prev, startTime: v || '09:00' };
      persistZaman(next);
      return next;
    });
  }
  function setSureDk(v: number) {
    setConfig((prev) => {
      const next = { ...prev, sureDk: Math.max(15, Math.min(180, Math.round(v) || 50)) };
      persistZaman(next);
      return next;
    });
  }
  function setAraDk(v: number) {
    setConfig((prev) => {
      const next = { ...prev, araDk: Math.max(0, Math.min(60, Math.round(v) || 0)) };
      persistZaman(next);
      return next;
    });
  }
  function setDersAdet(v: number) {
    setConfig((prev) => {
      const next = { ...prev, dersAdet: Math.max(1, Math.min(16, Math.round(v) || 8)) };
      persistZaman(next);
      return next;
    });
  }

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLocaleLowerCase('tr');
    if (!q) return studentGroups;
    return studentGroups.filter((g) => {
      const name = (g.ogrenci_ad || '').toLocaleLowerCase('tr');
      const paket = g.paketAds.join(' ').toLocaleLowerCase('tr');
      return name.includes(q) || paket.includes(q) || String(g.ogrenci).includes(q);
    });
  }, [studentGroups, studentQuery]);

  function selectStudent(group: StudentProgramGroup) {
    if (programId && group.programs.some((p) => p.id === programId)) return;
    setProgramId(group.primary.id);
  }

  const reloadLessons = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!siblingPrograms.length) {
        setLessons([]);
        return;
      }
      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      try {
        const results = await Promise.all(siblingPrograms.map((p) => fetchSlots(p.id)));
        setLessons(results.flat());
      } catch (e) {
        if (!silent) setLessons([]);
        show(e instanceof Error ? e.message : 'Dersler yüklenemedi', 'error');
      } finally {
        if (!silent) setLoading(false);
        if (silent) restoreScroll();
      }
    },
    [siblingProgramKey, show, restoreScroll],
  );

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  useEffect(() => {
    if (!siblingPrograms.length) {
      setLessons([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(siblingPrograms.map((p) => fetchSlots(p.id)))
      .then((results) => {
        if (!cancelled) setLessons(results.flat());
      })
      .catch((e) => {
        if (!cancelled) {
          setLessons([]);
          show(e instanceof Error ? e.message : 'Dersler yüklenemedi', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siblingProgramKey, show]);

  const activeLessons = useMemo(() => lessons.filter((s) => s.aktif), [lessons]);

  function openCreateAt(gun: number, period: PeriodRow) {
    setForm({
      gun: String(gun),
      baslangic: period.baslangic,
      bitis: period.bitis,
      sure_dk: String(config.sureDk),
      ders_id: paketDersleri[0] ? String(paketDersleri[0].id) : '',
      ogretmen_id: '',
    });
    setCreateOpen(true);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const dersId = Number(form.ders_id);
    const targetProgramId = resolveProgramIdForDers(siblingPrograms, dersId);
    if (!targetProgramId) return;
    setSaving(true);
    try {
      await createSlot(targetProgramId, {
        gun: Number(form.gun),
        baslangic: form.baslangic,
        bitis: form.bitis,
        sure_dk: Number(form.sure_dk || config.sureDk),
        ders_id: dersId,
        ogretmen_id: Number(form.ogretmen_id),
      });
      setCreateOpen(false);
      show('Haftalık ders eklendi.');
      await reloadLessons();
      void loadPrograms();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Kayıt başarısız — çakışma olabilir.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openDetail(lesson: BirebirSlot) {
    setDetailLesson(lesson);
    const sure = lesson.sure_dk || timeToMinutes(lesson.bitis) - timeToMinutes(lesson.baslangic);
    setEditForm({
      gun: String(lesson.gun),
      baslangic: lesson.baslangic.slice(0, 5),
      bitis: lesson.bitis.slice(0, 5),
      sure_dk: String(sure),
      ders_id: String(lesson.ders),
      ogretmen_id: String(lesson.ogretmen),
    });
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!detailLesson) return;
    setSavingEdit(true);
    try {
      await updateSlot(detailLesson.id, {
        gun: Number(editForm.gun),
        baslangic: editForm.baslangic,
        bitis: editForm.bitis,
        sure_dk: Number(editForm.sure_dk || config.sureDk),
        ders_id: Number(editForm.ders_id),
        ogretmen_id: Number(editForm.ogretmen_id),
      });
      show('Ders güncellendi.');
      setDetailLesson(null);
      await reloadLessons();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Güncelleme başarısız — çakışma olabilir.', 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDelete() {
    if (!detailLesson) return;
    if (!window.confirm('Bu haftalık şablon dersini pasifleştirmek istediğinize emin misiniz?')) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSlot(detailLesson.id);
      show('Ders pasifleştirildi.');
      setDetailLesson(null);
      await reloadLessons();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Silinemedi', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function moveLesson(lesson: BirebirSlot, gun: number, period: PeriodRow) {
    if (moving) return;
    const snapshot = lessons;
    const nextLesson: BirebirSlot = {
      ...lesson,
      gun,
      baslangic: period.baslangic,
      bitis: period.bitis,
      sure_dk: config.sureDk,
    };
    // Optimistic: tabloyu unmount etmeden yerinde güncelle (scroll korunur)
    setLessons((prev) => prev.map((s) => (s.id === lesson.id ? nextLesson : s)));
    setMoving(true);
    restoreScroll();
    try {
      await updateSlot(lesson.id, {
        gun,
        baslangic: period.baslangic,
        bitis: period.bitis,
        sure_dk: config.sureDk,
      });
      show('Ders taşındı.');
      restoreScroll();
      void reloadLessons({ silent: true });
    } catch (err) {
      setLessons(snapshot);
      show(err instanceof Error ? err.message : 'Taşıma başarısız — çakışma olabilir.', 'error');
      restoreScroll();
    } finally {
      setMoving(false);
    }
  }

  async function swapLesson(a: BirebirSlot, b: BirebirSlot) {
    if (moving || a.id === b.id) return;
    const snapshot = lessons;
    setLessons((prev) =>
      prev.map((s) => {
        if (s.id === a.id) {
          return { ...s, gun: b.gun, baslangic: b.baslangic, bitis: b.bitis, sure_dk: b.sure_dk };
        }
        if (s.id === b.id) {
          return { ...s, gun: a.gun, baslangic: a.baslangic, bitis: a.bitis, sure_dk: a.sure_dk };
        }
        return s;
      }),
    );
    setMoving(true);
    restoreScroll();
    try {
      await swapSlots(a.id, b.id);
      show('Dersler yer değiştirdi.');
      restoreScroll();
      void reloadLessons({ silent: true });
    } catch (err) {
      setLessons(snapshot);
      show(err instanceof Error ? err.message : 'Yer değiştirme başarısız.', 'error');
      restoreScroll();
    } finally {
      setMoving(false);
    }
  }

  const dersOptions = useMemo(() => {
    const fromMeta = meta?.dersler || [];
    if (!paketDersleri.length) return fromMeta;
    const ids = new Set(paketDersleri.map((d) => d.id));
    const preferred = fromMeta.filter((d) => ids.has(d.id));
    return preferred.length ? preferred : fromMeta;
  }, [meta?.dersler, paketDersleri]);

  return (
    <div className="od-scope">
      {toastNode}

      <PageHeader
        icon={<IconCalendar size={19} />}
        title="Haftalık Program Şablonları"
        description="Saat aralıklarını belirleyin; dersleri hücrelere yerleştirin veya sürükleyerek taşıyın. Öğretmen ataması bu ekranda yapılır."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: 'Haftalık', icon: <IconGrid size={14} /> },
                { value: 'list', label: 'Liste', icon: <IconList size={14} /> },
              ]}
            />
            <button
              type="button"
              className={`od-btn od-btn-secondary od-btn-sm${useKisaAd ? ' is-active-pref' : ''}`}
              onClick={() => setUseKisaAd(!useKisaAd)}
              aria-pressed={useKisaAd}
              title="Kısa ad göster (Fizik-1 → Fizik)"
            >
              {useKisaAd ? 'Kısa ad' : 'Uzun ad'}
            </button>
            <button
              type="button"
              className="od-btn od-btn-primary"
              disabled={!activeStudentGroup || !lessonPeriods[0]}
              onClick={() => lessonPeriods[0] && openCreateAt(1, lessonPeriods[0])}
            >
              <IconPlus size={15} /> Ders Ekle
            </button>
          </>
        }
      />

      {metaError && <div className="od-banner-error">{metaError}</div>}

      <Collapsible
        icon={<IconClock size={15} />}
        title="Zaman Ayarları"
        summary={`${config.startTime} başlangıç · ${config.sureDk} dk ders · ${config.araDk} dk ara · ${config.dersAdet} ders${
          activeStudentGroup ? ` · ${activeStudentGroup.ogrenci_ad}` : ''
        }${savingZaman ? ' · kaydediliyor…' : ''}`}
      >
        <div className="od-toolbar" style={{ padding: 0 }}>
          <div className="od-filter-field">
            <label>Başlangıç</label>
            <input
              type="time"
              className="od-input"
              value={config.startTime}
              disabled={!activeStudentGroup}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="od-filter-field">
            <label>Ders (dk)</label>
            <input
              type="number"
              className="od-input"
              min={15}
              max={180}
              step={5}
              value={config.sureDk}
              disabled={!activeStudentGroup}
              onChange={(e) => setSureDk(Number(e.target.value) || 50)}
              style={{ width: 72 }}
            />
          </div>
          <div className="od-filter-field">
            <label>Ara (dk)</label>
            <input
              type="number"
              className="od-input"
              min={0}
              max={60}
              step={5}
              value={config.araDk}
              disabled={!activeStudentGroup}
              onChange={(e) => setAraDk(Number(e.target.value))}
              style={{ width: 72 }}
            />
          </div>
          <div className="od-filter-field">
            <label>Ders adedi</label>
            <input
              type="number"
              className="od-input"
              min={1}
              max={16}
              value={config.dersAdet}
              disabled={!activeStudentGroup}
              onChange={(e) => setDersAdet(Number(e.target.value) || 8)}
              style={{ width: 72 }}
            />
          </div>
        </div>
        <p className="od-form-hint" style={{ margin: '8px 0 0' }}>
          Bu ayarlar seçili öğrenciye özeldir ve otomatik kaydedilir.
        </p>
      </Collapsible>

      <div className="od-sablon-layout">
        <aside className="od-sablon-rail" aria-label="Öğrenci seçimi">
          <div className="od-sablon-rail-head">
            <div className="od-sablon-rail-title">
              <IconUsers size={15} />
              Öğrenciler
              <span className="od-sablon-rail-count">{studentGroups.length}</span>
            </div>
            <div className="od-search od-sablon-search">
              <IconSearch size={14} />
              <input
                type="search"
                placeholder="Ara…"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                aria-label="Öğrenci ara"
              />
            </div>
          </div>
          <div className="od-sablon-rail-list">
            {filteredStudents.length === 0 ? (
              <div className="od-sablon-rail-empty">
                {programs.length === 0 ? 'Aktif program yok' : 'Sonuç bulunamadı'}
              </div>
            ) : (
              filteredStudents.map((g) => {
                const selected = activeStudentGroup?.ogrenci === g.ogrenci;
                const name = g.ogrenci_ad || `Öğrenci #${g.ogrenci}`;
                return (
                  <button
                    key={g.ogrenci}
                    type="button"
                    className={`od-student-pick${selected ? ' is-active' : ''}`}
                    onClick={() => selectStudent(g)}
                  >
                    <span
                      className="od-student-pick-avatar"
                      style={{ background: avatarGradient(g.ogrenci) }}
                      aria-hidden
                    >
                      {initials(name)}
                    </span>
                    <span className="od-student-pick-body">
                      <span className="od-student-pick-name">{name}</span>
                      <span className="od-student-pick-meta">
                        {g.slotCount} ders
                        {g.paketAds.length > 1 ? ` · ${g.paketAds.length} paket` : ''}
                      </span>
                    </span>
                    {g.slotCount === 0 && <Badge tone="warning">boş</Badge>}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="od-sablon-main">
          {activeStudentGroup && (
            <div className="od-sablon-student-bar">
              <div className="od-sablon-student-bar-info">
                <strong>{activeStudentGroup.ogrenci_ad || `Öğrenci #${activeStudentGroup.ogrenci}`}</strong>
                <span className="od-cell-muted">
                  Tüm paketler tek tabloda · {activeLessons.length} şablon dersi
                  {' · '}
                  {activeStudentGroup.baslangic_tarihi}
                  {' – '}
                  {activeStudentGroup.bitis_tarihi || 'süresiz'}
                </span>
              </div>
              <div className="od-paket-switch" aria-label="Paket özeti">
                {activeStudentGroup.programs.map((p) => {
                  const count = activeLessons.filter((l) => l.program === p.id).length;
                  return (
                    <span key={p.id} className="od-paket-chip is-static">
                      <span className="od-paket-chip-label">{paketLabel(p)}</span>
                      <span className="od-paket-chip-count">{count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {paketDersleri.length > 0 && (
            <div className="od-entity-card-meta" style={{ padding: '0 2px' }}>
              <span className="od-cell-muted" style={{ marginRight: 6 }}>
                Paket dersleri:
              </span>
              {paketDersleri.map((d) => (
                <Badge key={d.id} tone="info">
                  {resolveDersLabel(d, useKisaAd)}
                  {d.haftalik_adet ? ` ×${d.haftalik_adet}` : ''}
                </Badge>
              ))}
            </div>
          )}

      {!activeStudentGroup ? (
        <div className="od-card">
          <EmptyState
            icon={<IconUsers size={24} />}
            title="Öğrenci seçin"
            description="Soldaki listeden bir öğrenci seçerek haftalık şablonu düzenleyin."
          />
        </div>
      ) : loading && lessons.length === 0 ? (
        <div className="od-card">
          <div className="od-card-body">
            <SkeletonRows rows={4} />
          </div>
        </div>
      ) : view === 'grid' ? (
        <div className="od-card">
          <div className="od-card-body no-pad">
            {activeLessons.length === 0 && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--od-border)' }}>
                <span className="od-cell-muted">
                  Boş bir hücreye tıklayarak {config.sureDk} dakikalık ders ekleyin.
                </span>
              </div>
            )}
            <HaftalikProgramGrid
              lessons={lessons}
              periods={periods}
              useKisaAd={useKisaAd}
              moving={moving}
              scrollRef={tableScrollRef}
              onBeforeDrag={captureScroll}
              onCreateAt={openCreateAt}
              onOpenLesson={openDetail}
              onMove={(lesson, gun, period) => void moveLesson(lesson, gun, period)}
              onSwap={(a, b) => void swapLesson(a, b)}
            />
          </div>
        </div>
      ) : activeLessons.length === 0 ? (
        <div className="od-card">
          <EmptyState
            icon={<IconCalendar size={24} />}
            title="Bu programda henüz ders yok"
            description={`Boş bir hücreye tıklayarak ${config.sureDk} dakikalık ilk dersi planlayın.`}
            action={
              <button
                type="button"
                className="od-btn od-btn-primary"
                onClick={() => lessonPeriods[0] && openCreateAt(1, lessonPeriods[0])}
              >
                <IconPlus size={15} /> Ders Ekle
              </button>
            }
          />
        </div>
      ) : (
        <div className="od-card">
          <div className="od-card-body no-pad">
            <div className="od-table-scroll">
              <table className="od-table">
                <thead>
                  <tr>
                    <th>Gün</th>
                    <th>Saat</th>
                    <th>Süre</th>
                    <th>Ders</th>
                    <th>Öğretmen</th>
                    <th>Derslik</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeLessons.map((s) => (
                    <tr key={s.id} onClick={() => openDetail(s)} style={{ cursor: 'pointer' }}>
                      <td className="od-cell-primary">{GUN_LABELS[s.gun]}</td>
                      <td className="od-cell-time">
                        {s.baslangic.slice(0, 5)}–{s.bitis.slice(0, 5)}
                      </td>
                      <td className="od-cell-muted">{s.sure_dk || '—'} dk</td>
                      <td>{resolveDersLabel(s, useKisaAd)}</td>
                      <td>{s.ogretmen_ad}</td>
                      <td className="od-cell-muted">{s.oda_ad || '—'}</td>
                      <td>
                        <div className="od-row-actions always-visible">
                          <button
                            type="button"
                            className="od-btn od-btn-ghost od-btn-icon od-btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(s);
                            }}
                          >
                            <IconClock size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Haftalık Ders Ekle"
        description={activeStudentGroup?.ogrenci_ad || ''}
        footer={
          <>
            <button type="button" className="od-btn od-btn-secondary" onClick={() => setCreateOpen(false)}>
              Vazgeç
            </button>
            <button type="submit" form="od-ders-create-form" className="od-btn od-btn-primary" disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Ders Ekle'}
            </button>
          </>
        }
      >
        <form id="od-ders-create-form" className="od-form" onSubmit={onCreate}>
          <div className="od-drawer-section">
            <div className="od-form-section-title">Zaman</div>
            <div className="od-form-group">
              <label>Gün</label>
              <select value={form.gun} onChange={(e) => setForm((f) => ({ ...f, gun: e.target.value }))}>
                {GUN_LABELS.slice(1).map((g, i) => (
                  <option key={g} value={i + 1}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="od-form-row">
              <div className="od-form-group">
                <label>Başlangıç</label>
                <input type="time" required value={form.baslangic} readOnly />
              </div>
              <div className="od-form-group">
                <label>Bitiş</label>
                <input type="time" required value={form.bitis} readOnly />
              </div>
              <div className="od-form-group">
                <label>Süre</label>
                <input value={`${form.sure_dk} dk`} readOnly />
              </div>
            </div>
            <p className="od-cell-muted" style={{ margin: 0 }}>
              Saat, üstteki Zaman Ayarları panelinden gelir (bu öğrenciye özel).
              {activeProgram && (
                <>
                  {' '}
                  Oturumlar {activeProgram.baslangic_tarihi} –{' '}
                  {activeProgram.bitis_tarihi || 'süresiz'} aralığında üretilir.
                </>
              )}
            </p>
          </div>

          <div className="od-drawer-section">
            <div className="od-form-section-title">Ders &amp; Öğretmen</div>
            <div className="od-form-group">
              <label>
                Ders <span className="req">*</span>
              </label>
              <select
                required
                value={form.ders_id}
                onChange={(e) => setForm((f) => ({ ...f, ders_id: e.target.value }))}
              >
                <option value="">Seçin</option>
                {dersOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {resolveDersLabel({ ders_ad: d.ad, ders_kisa_ad: d.kisa_ad }, useKisaAd)}
                  </option>
                ))}
              </select>
            </div>
            <div className="od-form-group">
              <label>
                Öğretmen <span className="req">*</span>
              </label>
              <select
                required
                value={form.ogretmen_id}
                onChange={(e) => setForm((f) => ({ ...f, ogretmen_id: e.target.value }))}
              >
                <option value="">Seçin</option>
                {(meta?.teachers || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={Boolean(detailLesson)}
        onClose={() => setDetailLesson(null)}
        title={
          detailLesson
            ? `${GUN_LABELS[detailLesson.gun]} · ${resolveDersLabel(detailLesson, useKisaAd)}`
            : ''
        }
        description="Öğretmen veya ders bilgisini güncelleyin. Taşımak için hücreler arasında sürükleyin."
        footer={
          <>
            <button type="button" className="od-btn od-btn-danger" onClick={onDelete} disabled={deleting}>
              <IconTrash size={14} /> {deleting ? 'Pasifleştiriliyor…' : 'Pasifleştir'}
            </button>
            <div style={{ flex: 1 }} />
            <button type="submit" form="od-ders-edit-form" className="od-btn od-btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </>
        }
      >
        {detailLesson && (
          <form id="od-ders-edit-form" className="od-form" onSubmit={onSaveEdit}>
            <div className="od-drawer-section">
              <div className="od-form-section-title">Zaman</div>
              <div className="od-form-group">
                <label>Gün</label>
                <select value={editForm.gun} onChange={(e) => setEditForm((f) => ({ ...f, gun: e.target.value }))}>
                  {GUN_LABELS.slice(1).map((g, i) => (
                    <option key={g} value={i + 1}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="od-form-row">
                <div className="od-form-group">
                  <label>Başlangıç</label>
                  <select
                    value={
                      lessonPeriods.some((p) => p.baslangic === editForm.baslangic)
                        ? editForm.baslangic
                        : lessonPeriods[0]?.baslangic || editForm.baslangic
                    }
                    onChange={(e) => {
                      const period = lessonPeriods.find((p) => p.baslangic === e.target.value);
                      if (!period) return;
                      setEditForm((f) => ({
                        ...f,
                        baslangic: period.baslangic,
                        bitis: period.bitis,
                        sure_dk: String(config.sureDk),
                      }));
                    }}
                  >
                    {!lessonPeriods.some((p) => p.baslangic === editForm.baslangic) && (
                      <option value={editForm.baslangic}>
                        Mevcut · {editForm.baslangic}–{editForm.bitis}
                      </option>
                    )}
                    {lessonPeriods.map((p) => (
                      <option key={p.key} value={p.baslangic}>
                        {p.label} · {p.baslangic}–{p.bitis}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="od-form-group">
                  <label>Bitiş</label>
                  <input type="time" required value={editForm.bitis} readOnly />
                </div>
              </div>
            </div>

            <div className="od-drawer-section">
              <div className="od-form-section-title">Ders &amp; Öğretmen</div>
              <div className="od-form-group">
                <label>Ders</label>
                <select
                  required
                  value={editForm.ders_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, ders_id: e.target.value }))}
                >
                  {(meta?.dersler || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {resolveDersLabel({ ders_ad: d.ad, ders_kisa_ad: d.kisa_ad }, useKisaAd)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="od-form-group">
                <label>Öğretmen</label>
                <select
                  required
                  value={editForm.ogretmen_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, ogretmen_id: e.target.value }))}
                >
                  {(meta?.teachers || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="od-drawer-section">
              <div className="od-form-section-title">Derslik</div>
              <div className="od-form-group">
                <input value={detailLesson.oda_ad || '—'} disabled />
                <span className="od-form-hint">Derslik ataması salt okunurdur; bu ekrandan değiştirilemez.</span>
              </div>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
