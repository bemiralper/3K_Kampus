'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import NotlarTab from '@/app/ogrenciler/[id]/components/tabs/NotlarTab';
import {
  createSlot,
  createTelafi,
  deleteSlot,
  fetchOgrenciDonemOzeti,
  fetchOturumlar,
  fetchProgramlar,
  fetchSlots,
  materializeProgram,
  resolveDersLabel,
  setOturumDurum,
  swapSlots,
  updateProgram,
  updateSlot,
  GUN_LABELS,
  type BirebirOturum,
  type BirebirProgram,
  type BirebirSlot,
  type OgrenciDonemOzeti,
  type PaketDersi,
  type SetOturumDurumPayload,
} from '@/lib/ozel-ders-api';
import { formatOzelDersSaati, formatOzelDersTarihi } from '@/lib/ozel-ders-whatsapp-templates';
import { akademikTabHref } from '@/lib/akademik-routes';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import {
  Badge,
  Collapsible,
  Drawer,
  EmptyState,
  SkeletonRows,
  avatarGradient,
  initials,
  telafiDurumTone,
  type BadgeTone,
} from './ozelDersUi';
import {
  IconAlertTriangle,
  IconBookOpen,
  IconCalendar,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconRefresh,
  IconRotateCcw,
  IconSearch,
  IconStickyNote,
  IconTrash,
  IconUser,
  IconUsers,
  IconWand,
  IconXCircle,
} from './icons';
import HaftalikProgramGrid from './HaftalikProgramGrid';
import YoklamaDurumDrawer from './YoklamaDurumDrawer';
import {
  TELAFI_DURUM_LABEL,
  yoklamaNeedsDrawer,
} from './oturumDurum';
import {
  buildPeriods,
  formatDateTr,
  formatDurationDk,
  timeToMinutes,
  type PeriodRow,
} from './haftalikGridUtils';
import './ozel-ders.css';
import './ozel-ders-ops.css';

type OpsTab = 'program' | 'dersler' | 'ayarlar';
type DersFilter =
  | 'all'
  | 'planlandi'
  | 'islenen'
  | 'iptal'
  | 'telafi'
  | 'ek'
  | 'devamsiz';

const DERS_FILTER_VALUES: DersFilter[] = [
  'all',
  'planlandi',
  'islenen',
  'iptal',
  'telafi',
  'ek',
  'devamsiz',
];

function mergePaketDersleri(programs: BirebirProgram[]): PaketDersi[] {
  const map = new Map<number, PaketDersi>();
  for (const p of programs) {
    for (const d of p.paket_dersleri || []) {
      const prev = map.get(d.id);
      if (!prev) map.set(d.id, { ...d });
      else if ((d.haftalik_adet || 0) > (prev.haftalik_adet || 0)) {
        map.set(d.id, { ...prev, haftalik_adet: d.haftalik_adet });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

function resolveProgramIdForDers(programs: BirebirProgram[], dersId: number): number | null {
  const matches = programs.filter((p) => (p.paket_dersleri || []).some((d) => d.id === dersId));
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    return [...matches].sort((a, b) => (a.slot_count || 0) - (b.slot_count || 0))[0].id;
  }
  return programs[0]?.id ?? null;
}

function oturumDisplayLabel(o: BirebirOturum): { label: string; tone: BadgeTone; extra?: string } {
  if (o.oturum_turu === 'TELAFI') return { label: 'Telafi', tone: 'info' };
  if (o.oturum_turu === 'EK') return { label: 'Ek Ders', tone: 'purple' };
  if (o.telafi_durumu === 'BEKLENIYOR') {
    return {
      label: o.durum_display || 'Devamsız',
      tone: 'warning',
      extra: o.telafi_durumu_display || TELAFI_DURUM_LABEL.BEKLENIYOR,
    };
  }
  switch (o.durum) {
    case 'ISLENDI':
    case 'ONLINE':
      return { label: o.durum_display || 'İşlendi', tone: 'success' };
    case 'IPTAL':
      return { label: 'İptal', tone: 'danger' };
    case 'OGRENCI_GELMEDI':
    case 'OGRETMEN_GELMEDI':
      return { label: o.durum_display || 'Devamsız', tone: 'warning' };
    default:
      return { label: o.durum_display || 'Planlandı', tone: 'secondary' };
  }
}

function matchesDersFilter(o: BirebirOturum, f: DersFilter): boolean {
  if (f === 'all') return true;
  if (f === 'telafi') return o.oturum_turu === 'TELAFI';
  if (f === 'ek') return o.oturum_turu === 'EK';
  if (f === 'iptal') return o.durum === 'IPTAL';
  if (f === 'islenen') return o.durum === 'ISLENDI' || o.durum === 'ONLINE';
  if (f === 'planlandi') return o.durum === 'PLANLANDI';
  if (f === 'devamsiz') {
    return o.durum === 'OGRENCI_GELMEDI' || o.durum === 'OGRETMEN_GELMEDI';
  }
  return true;
}

/** Bir oturuma hangi hızlı aksiyonların gösterileceğini belirler (backend geçiş kurallarıyla uyumlu). */
function rowActionsFor(o: BirebirOturum): { canComplete: boolean; canCancel: boolean; canTelafi: boolean; canReopen: boolean } {
  return {
    canComplete: ['PLANLANDI', 'ONLINE'].includes(o.durum),
    canCancel: ['PLANLANDI', 'ONLINE'].includes(o.durum),
    canTelafi: o.telafi_durumu === 'BEKLENIYOR' && o.oturum_turu !== 'TELAFI',
    canReopen: ['ISLENDI', 'IPTAL'].includes(o.durum),
  };
}

const STAT_ICON: Record<string, React.ReactNode> = {
  planlanan: <IconCalendar size={16} />,
  islenen: <IconCheckCircle size={16} />,
  kalan: <IconClock size={16} />,
  telafi: <IconRotateCcw size={16} />,
  ek: <IconPlus size={16} />,
  iptal: <IconXCircle size={16} />,
};

export default function OgrenciOzelDersClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ogrenciId = Number(searchParams.get('ogrenci_id') || 0) || null;
  const urlTab = searchParams.get('tab') as OpsTab | null;
  const urlFilter = searchParams.get('filter') as DersFilter | null;

  const { meta, ready, egitimYiliId, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const [tab, setTab] = useState<OpsTab>(
    urlTab && ['program', 'dersler', 'ayarlar'].includes(urlTab) ? urlTab : 'program',
  );
  const [dersFilter, setDersFilter] = useState<DersFilter>(
    urlFilter && DERS_FILTER_VALUES.includes(urlFilter) ? urlFilter : 'all',
  );
  const [programs, setPrograms] = useState<BirebirProgram[]>([]);
  const [lessons, setLessons] = useState<BirebirSlot[]>([]);
  const [oturumlar, setOturumlar] = useState<BirebirOturum[]>([]);
  const [summary, setSummary] = useState<OgrenciDonemOzeti | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [donem, setDonem] = useState({ baslangic: '', bitis: '' });
  const [savingDonem, setSavingDonem] = useState(false);
  const [config, setConfig] = useState({
    startTime: '09:00',
    sureDk: 50,
    araDk: 10,
    dersAdet: 8,
  });
  const zamanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moving, setMoving] = useState(false);

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

  const [dersQ, setDersQ] = useState('');
  const [filterDersId, setFilterDersId] = useState('');
  const [filterOgretmenId, setFilterOgretmenId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [materializing, setMaterializing] = useState(false);
  const [busyOturumId, setBusyOturumId] = useState<number | null>(null);

  const [telafiFor, setTelafiFor] = useState<BirebirOturum | null>(null);
  const [telafiForm, setTelafiForm] = useState({
    session_date: '',
    start_time: '',
    end_time: '',
    ogretmen_id: '',
  });
  const [savingTelafi, setSavingTelafi] = useState(false);

  const [yoklamaTarget, setYoklamaTarget] = useState<{
    oturum: BirebirOturum;
    durum: string;
  } | null>(null);

  const listHref = akademikTabHref('ozel-ders-yonetimi', 'ogrenci-programlari');
  const oturumHref = akademikTabHref('ozel-ders-yonetimi', 'birebir-ders-oturumlari');

  const periods = useMemo(
    () => buildPeriods(config.startTime, config.sureDk, config.araDk, config.dersAdet),
    [config],
  );
  const paketDersleri = useMemo(() => mergePaketDersleri(programs), [programs]);
  const primary = programs[0] || null;

  const loadAll = useCallback(async () => {
    if (!ready || !ogrenciId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const progs = await fetchProgramlar({
        egitim_yili_id: egitimYiliId || undefined,
        ogrenci_id: ogrenciId,
        durum: 'AKTIF',
      });
      const sorted = [...progs].sort((a, b) => {
        if (a.durum !== b.durum) return a.durum === 'AKTIF' ? -1 : 1;
        return (b.slot_count || 0) - (a.slot_count || 0);
      });
      setPrograms(sorted);

      const bas =
        sorted.map((p) => p.baslangic_tarihi).sort()[0] || dayjs().format('YYYY-MM-DD');
      const bit = sorted.every((p) => p.bitis_tarihi)
        ? sorted.map((p) => p.bitis_tarihi!).sort().slice(-1)[0]
        : dayjs(bas).add(4, 'month').format('YYYY-MM-DD');
      setDonem({ baslangic: bas, bitis: bit || '' });

      const p0 = sorted[0];
      if (p0) {
        setConfig({
          startTime: p0.zaman_baslangic || '09:00',
          sureDk: p0.zaman_sure_dk || 50,
          araDk: p0.zaman_ara_dk ?? 10,
          dersAdet: p0.zaman_ders_adet || 8,
        });
      }

      const slotPromise = sorted.length
        ? Promise.all(sorted.map((p) => fetchSlots(p.id)))
        : Promise.resolve([] as BirebirSlot[][]);
      const sumPromise = fetchOgrenciDonemOzeti(ogrenciId, bas, bit || undefined).catch((e) => {
        console.error(e);
        return null;
      });
      const oturumPromise = fetchOturumlar({
        ogrenci_id: ogrenciId,
        start_date: bas,
        end_date: bit || dayjs(bas).add(1, 'year').format('YYYY-MM-DD'),
      }).catch((e) => {
        console.error(e);
        return [] as BirebirOturum[];
      });

      const [slotLists, sum, oturumList] = await Promise.all([
        slotPromise,
        sumPromise,
        oturumPromise,
      ]);
      setLessons(slotLists.flat());
      if (sum) setSummary(sum);
      setOturumlar(
        [...oturumList].sort((a, b) =>
          `${a.session_date}${a.start_time}` < `${b.session_date}${b.start_time}` ? 1 : -1,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [ready, ogrenciId, egitimYiliId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refreshSummary = useCallback(
    async (bas: string, bit: string) => {
      if (!ogrenciId || !bas) return;
      try {
        const sum = await fetchOgrenciDonemOzeti(ogrenciId, bas, bit || undefined);
        setSummary(sum);
        const oturumList = await fetchOturumlar({
          ogrenci_id: ogrenciId,
          start_date: bas,
          end_date: bit || dayjs(bas).add(1, 'year').format('YYYY-MM-DD'),
        });
        setOturumlar(
          oturumList.sort((a, b) =>
            `${a.session_date}${a.start_time}` < `${b.session_date}${b.start_time}` ? 1 : -1,
          ),
        );
      } catch (e) {
        show(e instanceof Error ? e.message : 'Özet güncellenemedi', 'error');
      }
    },
    [ogrenciId, show],
  );

  async function saveDonem() {
    if (!programs.length || !donem.baslangic) return;
    if (donem.bitis && donem.bitis < donem.baslangic) {
      show('Bitiş tarihi başlangıçtan önce olamaz.', 'error');
      return;
    }
    setSavingDonem(true);
    try {
      await Promise.all(
        programs.map((p) =>
          updateProgram(p.id, {
            baslangic_tarihi: donem.baslangic,
            bitis_tarihi: donem.bitis || null,
          }),
        ),
      );
      setPrograms((prev) =>
        prev.map((p) => ({
          ...p,
          baslangic_tarihi: donem.baslangic,
          bitis_tarihi: donem.bitis || null,
        })),
      );
      show('Program dönemi güncellendi.');
      await refreshSummary(donem.baslangic, donem.bitis);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Dönem kaydedilemedi', 'error');
    } finally {
      setSavingDonem(false);
    }
  }

  function persistZaman(next: typeof config) {
    if (!programs.length) return;
    if (zamanTimer.current) clearTimeout(zamanTimer.current);
    zamanTimer.current = setTimeout(async () => {
      const payload = {
        zaman_baslangic: next.startTime,
        zaman_sure_dk: next.sureDk,
        zaman_ara_dk: next.araDk,
        zaman_ders_adet: next.dersAdet,
      };
      try {
        await Promise.all(programs.map((p) => updateProgram(p.id, payload)));
        setPrograms((prev) => prev.map((p) => ({ ...p, ...payload })));
      } catch (e) {
        show(e instanceof Error ? e.message : 'Zaman ayarları kaydedilemedi', 'error');
      }
    }, 400);
  }

  async function reloadLessons() {
    if (!programs.length) {
      setLessons([]);
      return;
    }
    const results = await Promise.all(programs.map((p) => fetchSlots(p.id)));
    setLessons(results.flat());
    await refreshSummary(donem.baslangic, donem.bitis);
  }

  async function moveLesson(lesson: BirebirSlot, gun: number, period: PeriodRow) {
    if (moving) return;
    const snapshot = lessons;
    setLessons((prev) =>
      prev.map((s) =>
        s.id === lesson.id
          ? { ...s, gun, baslangic: period.baslangic, bitis: period.bitis, sure_dk: config.sureDk }
          : s,
      ),
    );
    setMoving(true);
    try {
      await updateSlot(lesson.id, {
        gun,
        baslangic: period.baslangic,
        bitis: period.bitis,
        sure_dk: config.sureDk,
      });
      show('Ders taşındı.');
      void reloadLessons();
    } catch (err) {
      setLessons(snapshot);
      show(err instanceof Error ? err.message : 'Taşıma başarısız — çakışma olabilir.', 'error');
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
    try {
      await swapSlots(a.id, b.id);
      show('Dersler yer değiştirdi.');
      void reloadLessons();
    } catch (err) {
      setLessons(snapshot);
      show(err instanceof Error ? err.message : 'Yer değiştirme başarısız.', 'error');
    } finally {
      setMoving(false);
    }
  }

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
    const targetProgramId = resolveProgramIdForDers(programs, dersId);
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
      show(err instanceof Error ? err.message : 'Güncelleme başarısız.', 'error');
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
      show('Ders pasifleştirildi. Geçmiş ve işlenmiş oturumlar değişmedi.');
      setDetailLesson(null);
      await reloadLessons();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Silinemedi', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function goTab(next: OpsTab, filter?: DersFilter) {
    setTab(next);
    if (filter) setDersFilter(filter);
    // router.replace bir soft-nav tetikleyip tüm sekmeyi remount ediyordu — sadece history güncelle.
    if (typeof window !== 'undefined' && ogrenciId) {
      const qs = new URLSearchParams();
      qs.set('ogrenci_id', String(ogrenciId));
      qs.set('tab', next);
      const f = filter ?? dersFilter;
      if (f && f !== 'all' && next === 'dersler') qs.set('filter', f);
      window.history.replaceState(null, '', `${window.location.pathname}?${qs.toString()}`);
    }
  }

  async function generateSessions() {
    if (!programs.length || !donem.baslangic || materializing) return;
    setMaterializing(true);
    try {
      const end = donem.bitis || dayjs(donem.baslangic).add(2, 'month').format('YYYY-MM-DD');
      const results = await Promise.all(
        programs.map((p) => materializeProgram(p.id, donem.baslangic, end)),
      );
      const created = results.reduce((a, r) => a + r.created, 0);
      const skippedHoliday = results.reduce((a, r) => a + r.skipped_holiday, 0);
      const skippedExisting = results.reduce((a, r) => a + r.skipped_existing, 0);
      const parts = [`${created} oturum oluşturuldu`];
      if (skippedHoliday) parts.push(`${skippedHoliday} tatil nedeniyle atlandı`);
      if (skippedExisting) parts.push(`${skippedExisting} zaten vardı`);
      show(parts.join(' · '));
      await refreshSummary(donem.baslangic, donem.bitis);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Oturumlar üretilemedi.', 'error');
    } finally {
      setMaterializing(false);
    }
  }

  async function handleDurumChange(o: BirebirOturum, durum: string) {
    if (busyOturumId) return;
    if (durum === 'IPTAL' && !window.confirm('Bu ders oturumunu iptal etmek istediğinize emin misiniz?')) {
      return;
    }
    if (yoklamaNeedsDrawer(durum)) {
      setYoklamaTarget({ oturum: o, durum });
      return;
    }
    await applyDurumChange(o.id, { durum });
  }

  async function applyDurumChange(oturumId: number, payload: SetOturumDurumPayload) {
    if (busyOturumId) return;
    setBusyOturumId(oturumId);
    const snapshot = oturumlar;
    setOturumlar((prev) =>
      prev.map((x) => (x.id === oturumId ? { ...x, durum: payload.durum } : x)),
    );
    try {
      const updated = await setOturumDurum(oturumId, payload);
      setOturumlar((prev) => prev.map((x) => (x.id === oturumId ? updated : x)));
      show('Durum güncellendi.');
      setYoklamaTarget(null);
      await refreshSummary(donem.baslangic, donem.bitis);
    } catch (err) {
      setOturumlar(snapshot);
      show(err instanceof Error ? err.message : 'Durum güncellenemedi.', 'error');
    } finally {
      setBusyOturumId(null);
    }
  }

  function openTelafi(o: BirebirOturum) {
    setTelafiFor(o);
    setTelafiForm({
      session_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
      start_time: o.start_time.slice(0, 5),
      end_time: o.end_time.slice(0, 5),
      ogretmen_id: String(o.ogretmen),
    });
  }

  async function onCreateTelafi(e: React.FormEvent) {
    e.preventDefault();
    if (!telafiFor) return;
    setSavingTelafi(true);
    try {
      await createTelafi(telafiFor.id, {
        session_date: telafiForm.session_date,
        start_time: telafiForm.start_time,
        end_time: telafiForm.end_time,
      });
      show('Telafi dersi oluşturuldu.');
      setTelafiFor(null);
      await refreshSummary(donem.baslangic, donem.bitis);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Telafi oluşturulamadı.', 'error');
    } finally {
      setSavingTelafi(false);
    }
  }

  const filteredOturumlar = useMemo(() => {
    const q = dersQ.trim().toLocaleLowerCase('tr');
    return oturumlar.filter((o) => {
      if (!matchesDersFilter(o, dersFilter)) return false;
      if (filterDersId && String(o.ders) !== filterDersId) return false;
      if (filterOgretmenId && String(o.ogretmen) !== filterOgretmenId) return false;
      if (filterFrom && o.session_date < filterFrom) return false;
      if (filterTo && o.session_date > filterTo) return false;
      if (!q) return true;
      const hay = `${o.ders_ad} ${o.ogretmen_ad} ${o.durum_display} ${o.oturum_turu_display}`.toLocaleLowerCase('tr');
      return hay.includes(q);
    });
  }, [oturumlar, dersFilter, filterDersId, filterOgretmenId, filterFrom, filterTo, dersQ]);

  const dersOptions = useMemo(() => {
    if (paketDersleri.length) {
      return paketDersleri.map((d) => ({ id: d.id, ad: d.ad, kisa_ad: d.kisa_ad }));
    }
    return (meta?.dersler || []).map((d) => ({ id: d.id, ad: d.ad, kisa_ad: d.kisa_ad }));
  }, [paketDersleri, meta]);

  const ozet = summary?.ozet;
  const ogrenciAd = summary?.ogrenci_ad || primary?.ogrenci_ad || `Öğrenci #${ogrenciId}`;

  if (!ogrenciId) {
    return (
      <div className="od-scope od-ops">
        {toastNode}
        <EmptyState
          icon={<IconUsers size={28} />}
          title="Öğrenci seçin"
          description="Öğrenci Programları listesinden bir öğrenci kartına tıklayarak bu ekranı açın."
        />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link className="od-btn od-btn-primary" href={listHref}>
            Öğrenci Programlarına Dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="od-scope od-ops">
      {toastNode}

      <div className="od-ops-top">
        <div className="od-ops-header">
          <Link href={listHref} className="od-ops-back">
            ← Programlar
          </Link>
          <div className="od-ops-identity">
            <div
              className="od-avatar lg"
              style={{ background: avatarGradient(ogrenciId) }}
              aria-hidden
            >
              {initials(ogrenciAd)}
            </div>
            <div>
              <h1 className="od-ops-title">{ogrenciAd}</h1>
              <div className="od-ops-meta">
                {summary?.sinif_ad && <Badge tone="secondary">{summary.sinif_ad}</Badge>}
                {(summary?.paketler || []).map((p) => (
                  <Badge key={p.id} tone="purple">
                    {p.ad}
                  </Badge>
                ))}
                <span className="od-cell-muted">
                  Dönem: {formatDateTr(donem.baslangic)} —{' '}
                  {donem.bitis ? formatDateTr(donem.bitis) : 'Süresiz'}
                </span>
              </div>
            </div>
          </div>
          <div className="od-ops-header-actions">
            <button
              type="button"
              className={`od-btn od-btn-secondary od-btn-sm${useKisaAd ? ' is-active-pref' : ''}`}
              onClick={() => setUseKisaAd(!useKisaAd)}
            >
              {useKisaAd ? 'Kısa ad' : 'Uzun ad'}
            </button>
            <button
              type="button"
              className="od-btn od-btn-secondary od-btn-sm"
              onClick={() => void loadAll()}
              disabled={loading}
            >
              <IconRefresh size={14} /> Yenile
            </button>
          </div>
        </div>

        <div className="od-ops-donem-bar">
          <div className="od-ops-donem-fields">
            <label>
              Başlangıç
              <input
                type="date"
                className="od-input"
                value={donem.baslangic}
                onChange={(e) => setDonem((d) => ({ ...d, baslangic: e.target.value }))}
              />
            </label>
            <label>
              Bitiş
              <input
                type="date"
                className="od-input"
                value={donem.bitis}
                min={donem.baslangic || undefined}
                onChange={(e) => setDonem((d) => ({ ...d, bitis: e.target.value }))}
              />
            </label>
            <button
              type="button"
              className="od-btn od-btn-primary od-btn-sm"
              disabled={savingDonem || !donem.baslangic}
              onClick={() => void saveDonem()}
            >
              {savingDonem ? 'Kaydediliyor…' : 'Dönemi Uygula'}
            </button>
          </div>
          {ozet && ozet.tatil_gun_sayisi > 0 && (
            <span className="od-ops-tatil-hint">
              <IconAlertTriangle size={13} />
              {ozet.tatil_gun_sayisi} tatil günü · −{ozet.tatilden_dusulen_ders} ders
            </span>
          )}
        </div>

        <div className="od-ops-summary">
          {(
            [
              {
                key: 'planlanan',
                label: 'Planlanan',
                value: ozet ? ozet.planlanan_ders : null,
                tone: 'slate',
                onClick: () => goTab('program'),
              },
              {
                key: 'islenen',
                label: 'İşlenen',
                value: ozet ? ozet.islenen_ders : null,
                tone: 'green',
                onClick: () => goTab('dersler', 'islenen'),
              },
              {
                key: 'kalan',
                label: 'Kalan',
                value: ozet ? ozet.kalan_ders : null,
                tone: 'blue',
                onClick: () => goTab('dersler', 'planlandi'),
              },
              {
                key: 'telafi',
                label: 'Telafi',
                value: ozet ? ozet.telafi_ders : null,
                tone: 'orange',
                onClick: () => goTab('dersler', 'telafi'),
              },
              {
                key: 'ek',
                label: 'Ek Ders',
                value: ozet ? ozet.ek_ders : null,
                tone: 'purple',
                onClick: () => goTab('dersler', 'ek'),
              },
              {
                key: 'iptal',
                label: 'İptal',
                value: ozet ? ozet.iptal_ders : null,
                tone: 'red',
                onClick: () => goTab('dersler', 'iptal'),
              },
            ] as const
          ).map((c) => (
            <button
              key={c.key}
              type="button"
              className={`od-ops-stat od-ops-stat--${c.tone}`}
              onClick={c.onClick}
            >
              <span className="od-ops-stat-icon">{STAT_ICON[c.key]}</span>
              <span className="od-ops-stat-body">
                <span className="od-ops-stat-label">{c.label}</span>
                <span className="od-ops-stat-value">
                  {loading && c.value === null ? '…' : c.value === null ? '—' : `${c.value} ders`}
                </span>
              </span>
            </button>
          ))}
        </div>

        {ozet && summary && summary.dersler.length > 0 && (
          <Collapsible
            icon={<IconBookOpen size={15} />}
            title="Derslere Göre Özet"
            summary={`${summary.dersler.length} ders`}
            defaultOpen
          >
            <div className="od-ops-ders-table-wrap">
              <table className="od-ops-table od-ops-ders-table">
                <thead>
                  <tr>
                    <th>Ders</th>
                    <th>Planlanan</th>
                    <th>İşlenen</th>
                    <th>Kalan</th>
                    <th>Telafi</th>
                    <th>Ek Ders</th>
                    <th>İptal</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.dersler.map((d) => (
                    <tr key={d.ders_id}>
                      <td>
                        <strong>
                          {resolveDersLabel({ ders_ad: d.ders_ad, ders_kisa_ad: d.ders_kisa_ad }, useKisaAd)}
                        </strong>
                      </td>
                      <td>{d.planlanan_ders} ders</td>
                      <td>{d.islenen_ders} ders</td>
                      <td>{d.kalan_ders} ders</td>
                      <td>{d.telafi_ders} ders</td>
                      <td>{d.ek_ders} ders</td>
                      <td>{d.iptal_ders} ders</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>
        )}

        <div className="od-ops-tabs" role="tablist" aria-label="Öğrenci özel ders sekmeleri">
          {(
            [
              { value: 'program', label: 'Program' },
              { value: 'dersler', label: 'Dersler' },
              { value: 'ayarlar', label: 'Ayarlar' },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              className={`od-ops-tab${tab === t.value ? ' is-active' : ''}`}
              onClick={() => goTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {(error || metaError) && (
        <div className="od-banner-error">{error || metaError}</div>
      )}

      {loading && programs.length === 0 ? (
        <div className="od-card">
          <div className="od-card-body">
            <SkeletonRows rows={6} />
          </div>
        </div>
      ) : null}

      {!loading && programs.length === 0 ? (
        <EmptyState
          icon={<IconBookOpen size={28} />}
          title="Bu öğrenci için henüz özel ders programı oluşturulmamış."
          description="Öğrenci Programları sayfasından senkronize edin veya yeni program oluşturun."
          action={
            <Link className="od-btn od-btn-primary od-btn-sm" href={listHref}>
              Öğrenci Programlarına Dön
            </Link>
          }
        />
      ) : null}

      {/* Tab panelleri — display ile gizle/göster ki state kaybolmasın */}
      {programs.length > 0 && (
        <>
          <div
            className="od-ops-panel"
            role="tabpanel"
            hidden={tab !== 'program'}
            style={{ display: tab === 'program' ? undefined : 'none' }}
          >
          <Collapsible
            icon={<IconClock size={15} />}
            title="Zaman Ayarları"
            summary={`${config.startTime} · ${config.sureDk} dk · ${config.araDk} dk ara · ${config.dersAdet} ders`}
          >
            <div className="od-toolbar" style={{ padding: 0 }}>
              <div className="od-filter-field">
                <label>Başlangıç</label>
                <input
                  type="time"
                  className="od-input"
                  value={config.startTime}
                  onChange={(e) => {
                    const next = { ...config, startTime: e.target.value || '09:00' };
                    setConfig(next);
                    persistZaman(next);
                  }}
                />
              </div>
              <div className="od-filter-field">
                <label>Ders (dk)</label>
                <input
                  type="number"
                  className="od-input"
                  min={15}
                  max={180}
                  value={config.sureDk}
                  onChange={(e) => {
                    const next = {
                      ...config,
                      sureDk: Math.max(15, Math.min(180, Number(e.target.value) || 50)),
                    };
                    setConfig(next);
                    persistZaman(next);
                  }}
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
                  value={config.araDk}
                  onChange={(e) => {
                    const next = {
                      ...config,
                      araDk: Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                    };
                    setConfig(next);
                    persistZaman(next);
                  }}
                  style={{ width: 72 }}
                />
              </div>
              <div className="od-filter-field">
                <label>Adet</label>
                <input
                  type="number"
                  className="od-input"
                  min={1}
                  max={16}
                  value={config.dersAdet}
                  onChange={(e) => {
                    const next = {
                      ...config,
                      dersAdet: Math.max(1, Math.min(16, Number(e.target.value) || 8)),
                    };
                    setConfig(next);
                    persistZaman(next);
                  }}
                  style={{ width: 72 }}
                />
              </div>
            </div>
          </Collapsible>

          <div className="od-ops-program-toolbar">
            <p className="od-cell-muted" style={{ margin: 0 }}>
              Haftalık şablon — sürükleyerek taşıyın. Gelecek planlı oturumlar güncellenir; geçmiş ve işlenmiş kayıtlar (hakediş) değişmez.
            </p>
            <button
              type="button"
              className="od-btn od-btn-primary od-btn-sm"
              onClick={() => periods[0] && openCreateAt(1, periods[0])}
            >
              <IconPlus size={14} /> Ders Ekle
            </button>
          </div>

          <div className="od-card">
            <div className="od-card-body no-pad">
              {lessons.filter((l) => l.aktif).length === 0 && (
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
                onCreateAt={openCreateAt}
                onOpenLesson={openDetail}
                onMove={moveLesson}
                onSwap={swapLesson}
              />
            </div>
          </div>
          </div>

          <div
            className="od-ops-panel"
            role="tabpanel"
            hidden={tab !== 'dersler'}
            style={{ display: tab === 'dersler' ? undefined : 'none' }}
          >
          <div className="od-ops-program-toolbar">
            <p className="od-cell-muted" style={{ margin: 0 }}>
              Şablondan üretilen gerçek ders kayıtları. Şablon değişiklikleri geçmiş kayıtları etkilemez.
            </p>
            <button
              type="button"
              className="od-btn od-btn-secondary od-btn-sm"
              disabled={materializing}
              onClick={() => void generateSessions()}
              title="Seçili dönem için şablondan oturum üret"
            >
              <IconWand size={14} /> {materializing ? 'Üretiliyor…' : 'Dönem İçin Oturum Üret'}
            </button>
          </div>

          <div className="od-ops-filters">
            <div className="od-search" style={{ flex: 1, minWidth: 160 }}>
              <IconSearch size={14} />
              <input
                placeholder="Ders veya öğretmen ara…"
                value={dersQ}
                onChange={(e) => setDersQ(e.target.value)}
              />
            </div>
            <input
              type="date"
              className="od-input"
              value={filterFrom}
              max={filterTo || undefined}
              onChange={(e) => setFilterFrom(e.target.value)}
              title="Başlangıç tarihi"
            />
            <input
              type="date"
              className="od-input"
              value={filterTo}
              min={filterFrom || undefined}
              onChange={(e) => setFilterTo(e.target.value)}
              title="Bitiş tarihi"
            />
            <select
              className="od-input"
              value={filterDersId}
              onChange={(e) => setFilterDersId(e.target.value)}
            >
              <option value="">Tüm dersler</option>
              {Array.from(new Map(oturumlar.map((o) => [o.ders, o.ders_ad])).entries()).map(
                ([id, ad]) => (
                  <option key={id} value={id}>
                    {ad}
                  </option>
                ),
              )}
            </select>
            <select
              className="od-input"
              value={filterOgretmenId}
              onChange={(e) => setFilterOgretmenId(e.target.value)}
            >
              <option value="">Tüm öğretmenler</option>
              {Array.from(
                new Map(oturumlar.map((o) => [o.ogretmen, o.ogretmen_ad])).entries(),
              ).map(([id, ad]) => (
                <option key={id} value={id}>
                  {ad}
                </option>
              ))}
            </select>
            <select
              className="od-input"
              value={dersFilter}
              onChange={(e) => setDersFilter(e.target.value as DersFilter)}
            >
              <option value="all">Tüm durumlar</option>
              <option value="planlandi">Planlandı</option>
              <option value="islenen">İşlendi</option>
              <option value="iptal">İptal</option>
              <option value="telafi">Telafi</option>
              <option value="ek">Ek Ders</option>
              <option value="devamsiz">Devamsız</option>
            </select>
            {(filterFrom || filterTo || filterDersId || filterOgretmenId || dersQ || dersFilter !== 'all') && (
              <button
                type="button"
                className="od-btn od-btn-secondary od-btn-sm"
                onClick={() => {
                  setFilterFrom('');
                  setFilterTo('');
                  setFilterDersId('');
                  setFilterOgretmenId('');
                  setDersQ('');
                  setDersFilter('all');
                }}
              >
                Filtreleri Temizle
              </button>
            )}
          </div>

          <div className="od-ops-quick-links">
            <a className="od-btn od-btn-secondary od-btn-sm" href={oturumHref}>
              Tüm ders oturumları <IconChevronRight size={13} />
            </a>
          </div>

          {filteredOturumlar.length === 0 ? (
            oturumlar.length === 0 ? (
              <EmptyState
                icon={<IconCalendar size={24} />}
                title="Henüz gerçekleşen veya planlanan ders bulunmuyor."
                description="Program şablonu hazırsa 'Dönem İçin Oturum Üret' ile bu dönemin derslerini oluşturun."
                action={
                  <button
                    type="button"
                    className="od-btn od-btn-primary od-btn-sm"
                    disabled={materializing}
                    onClick={() => void generateSessions()}
                  >
                    <IconWand size={14} /> {materializing ? 'Üretiliyor…' : 'Dönem İçin Oturum Üret'}
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={<IconSearch size={24} />}
                title="Filtreye uyan ders bulunamadı."
                description="Filtreleri temizleyip tekrar deneyin."
              />
            )
          ) : (
            <div className="od-ops-table-wrap">
              <table className="od-ops-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Ders</th>
                    <th>Öğretmen</th>
                    <th>Süre</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOturumlar.map((o) => {
                    const badge = oturumDisplayLabel(o);
                    const dk =
                      o.sure_dk ||
                      timeToMinutes(o.end_time) - timeToMinutes(o.start_time);
                    const actions = rowActionsFor(o);
                    const busy = busyOturumId === o.id;
                    return (
                      <tr key={o.id}>
                        <td>
                          <strong>{formatDateTr(o.session_date)}</strong>
                          <div className="od-cell-muted">
                            {o.start_time?.slice(0, 5)}–{o.end_time?.slice(0, 5)}
                          </div>
                        </td>
                        <td>{resolveDersLabel(o, useKisaAd)}</td>
                        <td>{o.ogretmen_ad}</td>
                        <td>{formatDurationDk(dk)}</td>
                        <td>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                          {badge.extra && (
                            <div>
                              <Badge tone={telafiDurumTone('BEKLENIYOR')}>{badge.extra}</Badge>
                            </div>
                          )}
                          {o.telafi_durumu && o.telafi_durumu !== 'GEREKMIYOR' && !badge.extra && (
                            <div>
                              <Badge tone={telafiDurumTone(o.telafi_durumu)}>
                                {o.telafi_durumu_display || TELAFI_DURUM_LABEL[o.telafi_durumu]}
                              </Badge>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="od-row-actions">
                            {actions.canComplete && (
                              <button
                                type="button"
                                className="od-row-action-btn is-success"
                                title="İşlendi olarak işaretle"
                                disabled={busy}
                                onClick={() => void handleDurumChange(o, 'ISLENDI')}
                              >
                                <IconCheckCircle size={15} />
                              </button>
                            )}
                            {actions.canCancel && (
                              <button
                                type="button"
                                className="od-row-action-btn is-danger"
                                title="İptal et"
                                disabled={busy}
                                onClick={() => void handleDurumChange(o, 'IPTAL')}
                              >
                                <IconXCircle size={15} />
                              </button>
                            )}
                            {actions.canTelafi && (
                              <button
                                type="button"
                                className="od-row-action-btn"
                                title="Telafi dersi oluştur"
                                disabled={busy}
                                onClick={() => openTelafi(o)}
                              >
                                <IconRotateCcw size={15} />
                              </button>
                            )}
                            {actions.canReopen && (
                              <button
                                type="button"
                                className="od-row-action-btn"
                                title="Planlandı durumuna al"
                                disabled={busy}
                                onClick={() => void handleDurumChange(o, 'PLANLANDI')}
                              >
                                <IconRefresh size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>

          <div
            className="od-ops-panel"
            role="tabpanel"
            hidden={tab !== 'ayarlar'}
            style={{ display: tab === 'ayarlar' ? undefined : 'none' }}
          >
            <div className="od-ops-ayarlar">
          <section className="od-ops-ayar-card">
            <h3>
              <IconCalendar size={15} /> Program Dönemi
            </h3>
            <div className="od-form-row">
              <div className="od-form-group">
                <label>Başlangıç</label>
                <input
                  type="date"
                  value={donem.baslangic}
                  onChange={(e) => setDonem((d) => ({ ...d, baslangic: e.target.value }))}
                />
              </div>
              <div className="od-form-group">
                <label>Bitiş</label>
                <input
                  type="date"
                  value={donem.bitis}
                  min={donem.baslangic || undefined}
                  onChange={(e) => setDonem((d) => ({ ...d, bitis: e.target.value }))}
                />
                <span className="od-form-hint">Boş = süresiz</span>
              </div>
            </div>
            <button
              type="button"
              className="od-btn od-btn-primary od-btn-sm"
              disabled={savingDonem}
              onClick={() => void saveDonem()}
            >
              {savingDonem ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </section>

          <section className="od-ops-ayar-card">
            <h3>
              <IconClock size={15} /> Ders Ayarları
            </h3>
            <p className="od-cell-muted">
              Grid varsayılanları bu öğrenciye özeldir (Program sekmesindeki Zaman Ayarları ile
              aynı).
            </p>
            <dl className="od-panel-kv">
              <dt>Başlangıç saati</dt>
              <dd>{config.startTime}</dd>
              <dt>Ders süresi</dt>
              <dd>{config.sureDk} dk (1 ders)</dd>
              <dt>Ara</dt>
              <dd>{config.araDk} dk</dd>
              <dt>Ders adedi</dt>
              <dd>{config.dersAdet}</dd>
            </dl>
          </section>

          <section className="od-ops-ayar-card">
            <h3>
              <IconUser size={15} /> Paket / Program
            </h3>
            {programs.map((p) => (
              <div key={p.id} className="od-ops-paket-row">
                <strong>{p.premium_paket_ad || p.ozel_ders_paket_ad || `Program #${p.id}`}</strong>
                <span className="od-cell-muted">{p.slot_count} şablon dersi</span>
              </div>
            ))}
          </section>

          <section className="od-ops-ayar-card">
            <h3>
              <IconAlertTriangle size={15} /> Tatil / İstisnalar
            </h3>
            <p className="od-cell-muted">
              Resmi tatiller ve kurum özel günleri merkezi takvimden yönetilir. Tatil günleri
              planlanan ders adedinden otomatik düşülür.
            </p>
            <a
              className="od-btn od-btn-secondary od-btn-sm"
              href={pathname.startsWith('/muhasebe') ? '/muhasebe/takvim' : '/admin/takvim/resmi-tatiller'}
            >
              Resmi Tatiller <IconChevronRight size={13} />
            </a>
          </section>
            </div>

            <section className="od-ops-ayar-card od-ops-notes-card">
              <h3>
                <IconStickyNote size={15} /> Notlar
              </h3>
              <NotlarTab ogrenciId={ogrenciId} />
            </section>
          </div>
        </>
      )}

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Haftalık Ders Ekle"
        description={ogrenciAd}
        footer={
          <>
            <button type="button" className="od-btn od-btn-secondary" onClick={() => setCreateOpen(false)}>
              Vazgeç
            </button>
            <button type="submit" form="od-ops-create" className="od-btn od-btn-primary" disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Ders Ekle'}
            </button>
          </>
        }
      >
        <form id="od-ops-create" className="od-form" onSubmit={onCreate}>
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
              <input type="time" value={form.baslangic} readOnly />
            </div>
            <div className="od-form-group">
              <label>Bitiş</label>
              <input type="time" value={form.bitis} readOnly />
            </div>
          </div>
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
        description="Şablon dersi — geçmiş oturumlar değişmez."
        footer={
          <>
            <button type="button" className="od-btn od-btn-danger" onClick={onDelete} disabled={deleting}>
              <IconTrash size={14} /> {deleting ? '…' : 'Pasifleştir'}
            </button>
            <div style={{ flex: 1 }} />
            <button type="submit" form="od-ops-edit" className="od-btn od-btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </>
        }
      >
        {detailLesson && (
          <form id="od-ops-edit" className="od-form" onSubmit={onSaveEdit}>
            <div className="od-form-group">
              <label>Gün</label>
              <select
                value={editForm.gun}
                onChange={(e) => setEditForm((f) => ({ ...f, gun: e.target.value }))}
              >
                {GUN_LABELS.slice(1).map((g, i) => (
                  <option key={g} value={i + 1}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="od-form-group">
              <label>Saat dilimi</label>
              <select
                value={
                  periods.some((p) => p.baslangic === editForm.baslangic)
                    ? editForm.baslangic
                    : periods[0]?.baslangic || editForm.baslangic
                }
                onChange={(e) => {
                  const period = periods.find((p) => p.baslangic === e.target.value);
                  if (!period) return;
                  setEditForm((f) => ({
                    ...f,
                    baslangic: period.baslangic,
                    bitis: period.bitis,
                    sure_dk: String(config.sureDk),
                  }));
                }}
              >
                {periods.map((p) => (
                  <option key={p.key} value={p.baslangic}>
                    {p.label}: {p.baslangic}–{p.bitis}
                  </option>
                ))}
              </select>
            </div>
            <div className="od-form-group">
              <label>Ders</label>
              <select
                value={editForm.ders_id}
                onChange={(e) => setEditForm((f) => ({ ...f, ders_id: e.target.value }))}
              >
                {dersOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {resolveDersLabel({ ders_ad: d.ad, ders_kisa_ad: d.kisa_ad }, useKisaAd)}
                  </option>
                ))}
              </select>
            </div>
            <div className="od-form-group">
              <label>Öğretmen</label>
              <select
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
          </form>
        )}
      </Drawer>

      <Drawer
        open={Boolean(telafiFor)}
        onClose={() => setTelafiFor(null)}
        title="Telafi Dersi Oluştur"
        description={telafiFor ? `${formatDateTr(telafiFor.session_date)} · ${resolveDersLabel(telafiFor, useKisaAd)}` : ''}
        footer={
          <>
            <button type="button" className="od-btn od-btn-secondary" onClick={() => setTelafiFor(null)}>
              Vazgeç
            </button>
            <button type="submit" form="od-ops-telafi" className="od-btn od-btn-primary" disabled={savingTelafi}>
              {savingTelafi ? 'Kaydediliyor…' : 'Telafi Oluştur'}
            </button>
          </>
        }
      >
        {telafiFor && (
          <form id="od-ops-telafi" className="od-form" onSubmit={onCreateTelafi}>
            <div className="od-form-group">
              <label>Tarih</label>
              <input
                type="date"
                required
                value={telafiForm.session_date}
                onChange={(e) => setTelafiForm((f) => ({ ...f, session_date: e.target.value }))}
              />
            </div>
            <div className="od-form-row">
              <div className="od-form-group">
                <label>Başlangıç</label>
                <input
                  type="time"
                  required
                  value={telafiForm.start_time}
                  onChange={(e) => setTelafiForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="od-form-group">
                <label>Bitiş</label>
                <input
                  type="time"
                  required
                  value={telafiForm.end_time}
                  onChange={(e) => setTelafiForm((f) => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="od-form-group">
              <label>Öğretmen</label>
              <input readOnly value={telafiFor.ogretmen_ad} className="od-input" />
              <span className="od-form-hint">Kaynak oturumdan otomatik devralınır.</span>
            </div>
          </form>
        )}
      </Drawer>

      <YoklamaDurumDrawer
        open={Boolean(yoklamaTarget)}
        onClose={() => setYoklamaTarget(null)}
        durum={yoklamaTarget?.durum || ''}
        description={
          yoklamaTarget
            ? `${formatDateTr(yoklamaTarget.oturum.session_date)} · ${resolveDersLabel(yoklamaTarget.oturum, useKisaAd)}`
            : ''
        }
        notes={yoklamaTarget?.oturum.notes}
        preview={
          yoklamaTarget
            ? {
                ogrenci_ad: yoklamaTarget.oturum.ogrenci_ad,
                ders_tarihi: formatOzelDersTarihi(yoklamaTarget.oturum.session_date),
                ders_saati: formatOzelDersSaati(yoklamaTarget.oturum.start_time),
                ders_adi: resolveDersLabel(yoklamaTarget.oturum, useKisaAd),
                ogretmen_ad: yoklamaTarget.oturum.ogretmen_ad,
              }
            : undefined
        }
        busy={busyOturumId != null}
        onConfirm={(payload) =>
          yoklamaTarget ? applyDurumChange(yoklamaTarget.oturum.id, payload) : Promise.resolve()
        }
      />
    </div>
  );
}
