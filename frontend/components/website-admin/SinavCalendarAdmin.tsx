'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SinavGorselArsiv, SinavTakvim } from '@/lib/website-api';
import { websiteAdminApi, resolveMediaUrl, type SinavTakvimWrite } from '@/lib/website-api';
import { WEBSITE_IMAGE_GUIDELINES } from '@/lib/website-image-guidelines';
import { sinavTurBadge, sinavTurColor, sinavTurLabel } from '@/lib/landing-theme';
import { SINAV_TABS, defaultTurForTab, filterSinavByTab, sinavTabById, type SinavTabId } from '@/lib/sinav-takvim';
import Icon from '@/components/olcme/ui/Icon';
import SinavDetailModal from '@/components/landing/SinavDetailModal';
import s from '@/components/olcme/deneme/denemeTakvim.module.css';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function fmtDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

function clock(value?: string | null) {
  return value ? value.slice(0, 5) : '';
}

type SinavCalendarAdminProps = {
  sinavlar: SinavTakvim[];
  onReload: () => void | Promise<void>;
  onMessage?: (msg: string, type?: 'success' | 'error') => void;
};

type GunForm = {
  key: string;
  id?: number;
  tarih: string;
  saat: string;
  saat_bitis: string;
};

type FormState = {
  tur: string;
  kapsam: string;
  baslik: string;
  yayin_adi: string;
  aciklama: string;
  gunler: GunForm[];
};

let gunSeq = 0;
function nextGunKey() {
  gunSeq += 1;
  return `gun-${gunSeq}`;
}

function blankGun(partial?: Partial<Pick<GunForm, 'tarih' | 'saat' | 'saat_bitis' | 'id'>>): GunForm {
  return {
    key: nextGunKey(),
    id: partial?.id,
    tarih: partial?.tarih || '',
    saat: partial?.saat || '',
    saat_bitis: partial?.saat_bitis || '',
  };
}

const EMPTY_FORM: FormState = {
  tur: 'LGS',
  kapsam: 'turkiye_geneli',
  baslik: '',
  yayin_adi: '',
  aciklama: '',
  gunler: [],
};

function formSnapshot(form: FormState, arsivId: number | null, imageTouched: boolean) {
  return JSON.stringify({
    ...form,
    _arsiv: arsivId ?? 0,
    _arsivTouch: imageTouched,
  });
}

function sameExam(exam: SinavTakvim, other: SinavTakvim) {
  return Boolean(exam.grup_id) && exam.grup_id === other.grup_id;
}

function examDays(exam: SinavTakvim, all: SinavTakvim[]) {
  const rows = exam.grup_id ? all.filter(item => sameExam(exam, item)) : [exam];
  const list = rows.length ? rows : [exam];
  return [...list].sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || ''));
}

function examToForm(exam: SinavTakvim, all: SinavTakvim[]): FormState {
  return {
    tur: exam.tur,
    kapsam: exam.kapsam,
    baslik: exam.baslik,
    yayin_adi: exam.yayin_adi || '',
    aciklama: exam.aciklama || '',
    gunler: examDays(exam, all).map(day => blankGun({
      id: day.id,
      tarih: day.tarih,
      saat: day.saat || '',
      saat_bitis: day.saat_bitis || '',
    })),
  };
}

export default function SinavCalendarAdmin({ sinavlar, onReload, onMessage }: SinavCalendarAdminProps) {
  const today = new Date();
  const [tab, setTab] = useState<SinavTabId>('yks');
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [pendingTab, setPendingTab] = useState<SinavTabId | null>(null);
  const [showAllExams, setShowAllExams] = useState(false);
  const [archive, setArchive] = useState<SinavGorselArsiv[]>([]);
  const [archiveQuery, setArchiveQuery] = useState('');
  const [selectedArsivId, setSelectedArsivId] = useState<number | null>(null);
  const [imageTouched, setImageTouched] = useState(false);
  const [showArchiveForm, setShowArchiveForm] = useState(false);
  const [archiveAd, setArchiveAd] = useState('');
  const [archiveEtiket, setArchiveEtiket] = useState('');
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [editingArsivId, setEditingArsivId] = useState<number | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [removingLibraryId, setRemovingLibraryId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const baselineRef = useRef('');

  const modalOpen = editId !== null;

  useEffect(() => {
    setShowAllExams(false);
  }, [tab]);

  const filtered = useMemo(() => filterSinavByTab(sinavlar, tab), [sinavlar, tab]);
  const activeTab = sinavTabById(tab);
  const counts = useMemo(() => {
    const map: Record<SinavTabId, number> = { yks: 0, sinif11: 0, lgs: 0, sinif7: 0 };
    SINAV_TABS.forEach(item => {
      map[item.id] = filterSinavByTab(sinavlar, item.id).length;
    });
    return map;
  }, [sinavlar]);

  const reloadArchive = useCallback(async () => {
    const res = await websiteAdminApi.listSinavGorseller();
    if (res.success && res.data) setArchive(res.data);
  }, []);

  useEffect(() => { void reloadArchive(); }, [reloadArchive]);

  const visibleArchive = useMemo(() => {
    const query = archiveQuery.trim().toLocaleLowerCase('tr');
    const current = form.yayin_adi.trim().toLocaleLowerCase('tr');
    const rows = query
      ? archive.filter(item => (
        item.ad.toLocaleLowerCase('tr').includes(query)
        || item.etiketler.toLocaleLowerCase('tr').includes(query)
      ))
      : archive;
    return [...rows].sort((a, b) => (
      Number(b.ad.toLocaleLowerCase('tr') === current) - Number(a.ad.toLocaleLowerCase('tr') === current)
      || a.ad.localeCompare(b.ad, 'tr')
    ));
  }, [archive, archiveQuery, form.yayin_adi]);

  const byDate = useMemo(() => {
    const map: Record<string, SinavTakvim[]> = {};
    filtered.forEach(exam => {
      if (!map[exam.tarih]) map[exam.tarih] = [];
      map[exam.tarih].push(exam);
    });
    return map;
  }, [filtered]);

  const isDirty = () => formSnapshot(form, selectedArsivId, imageTouched) !== baselineRef.current;

  const padDate = (d: number) => {
    const m = String(month + 1).padStart(2, '0');
    const day = String(d).padStart(2, '0');
    return `${year}-${m}-${day}`;
  };

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const openCreate = (dateKey: string) => {
    const nextForm: FormState = {
      ...EMPTY_FORM,
      tur: defaultTurForTab(tab),
      gunler: [blankGun({ tarih: dateKey })],
    };
    setEditId(0);
    setSelectedDate(dateKey);
    setSelectedArsivId(null);
    setImageTouched(false);
    setShowArchiveForm(false);
    setShowPreview(false);
    setShowPicker(false);
    setForm(nextForm);
    baselineRef.current = formSnapshot(nextForm, null, false);
  };

  const openEdit = (exam: SinavTakvim) => {
    const nextForm = examToForm(exam, sinavlar);
    const arsivId = exam.gorsel_arsiv_id ?? null;
    setEditId(exam.id);
    setSelectedDate(exam.tarih);
    setSelectedArsivId(arsivId);
    setImageTouched(false);
    setShowArchiveForm(false);
    setShowPreview(false);
    setShowPicker(false);
    setForm(nextForm);
    baselineRef.current = formSnapshot(nextForm, arsivId, false);
  };

  const closeForm = () => {
    setEditId(null);
    setSelectedDate(null);
    setForm({ ...EMPTY_FORM, gunler: [] });
    setSelectedArsivId(null);
    setImageTouched(false);
    setShowArchiveForm(false);
    setShowPreview(false);
    setShowPicker(false);
    baselineRef.current = '';
    setShowUnsaved(false);
    setPendingTab(null);
  };

  const updateGun = (key: string, patch: Partial<Pick<GunForm, 'tarih' | 'saat' | 'saat_bitis'>>) => {
    setForm(current => ({
      ...current,
      gunler: current.gunler.map(gun => (gun.key === key ? { ...gun, ...patch } : gun)),
    }));
  };

  const addGun = () => {
    setForm(current => {
      const last = current.gunler[current.gunler.length - 1];
      return {
        ...current,
        gunler: [...current.gunler, blankGun({ saat: last?.saat || '', saat_bitis: last?.saat_bitis || '' })],
      };
    });
  };

  const removeGun = (key: string) => {
    setForm(current => ({
      ...current,
      gunler: current.gunler.filter(gun => gun.key !== key),
    }));
  };

  const requestClose = () => {
    if (saving || archiveSaving || removingImage || removingLibraryId !== null) return;
    if (isDirty()) {
      setShowUnsaved(true);
      return;
    }
    closeForm();
  };

  const requestTabChange = (next: SinavTabId) => {
    if (next === tab) return;
    if (modalOpen && isDirty()) {
      setPendingTab(next);
      setShowUnsaved(true);
      return;
    }
    closeForm();
    setTab(next);
  };

  const discardAndProceed = () => {
    const next = pendingTab;
    closeForm();
    if (next) setTab(next);
  };

  const save = async () => {
    if (saving) return;
    if (form.gunler.length === 0 || form.gunler.some(gun => !gun.tarih)) {
      onMessage?.('Her günün tarihi seçilmelidir', 'error');
      return;
    }
    const seen = new Set<string>();
    for (const gun of form.gunler) {
      if (gun.saat_bitis && !gun.saat) {
        onMessage?.('Bitiş saati için başlangıç saatini de seçin', 'error');
        return;
      }
      if (gun.saat && gun.saat_bitis && clock(gun.saat_bitis) <= clock(gun.saat)) {
        onMessage?.('Bitiş saati başlangıçtan sonra olmalıdır', 'error');
        return;
      }
      const key = `${gun.tarih}|${clock(gun.saat)}|${clock(gun.saat_bitis)}`;
      if (seen.has(key)) {
        onMessage?.('Aynı tarih ve saat iki kez yazılamaz', 'error');
        return;
      }
      seen.add(key);
    }
    const baslik = form.baslik.trim() || `${form.yayin_adi || form.tur} Deneme Sınavı`;
    const payload: SinavTakvimWrite = {
      tur: form.tur,
      kapsam: form.kapsam,
      baslik,
      yayin_adi: form.yayin_adi,
      aciklama: form.aciklama,
      ...(imageTouched ? { gorsel_arsiv_id: selectedArsivId } : {}),
      gunler: form.gunler.map(gun => ({
        ...(gun.id ? { id: gun.id } : {}),
        tarih: gun.tarih,
        saat: gun.saat || null,
        saat_bitis: gun.saat_bitis || null,
      })),
    };

    setSaving(true);
    try {
      let recordId = editId;
      const res = editId === 0
        ? await websiteAdminApi.saveSinavGroup(payload)
        : editId
          ? await websiteAdminApi.updateSinavGroup(editId, payload)
          : null;
      if (!res || !res.success || !res.data?.id) {
        onMessage?.(res?.error || 'Sınav kaydedilemedi', 'error');
        return;
      }
      recordId = res.data.id;
      // Kayıt başarılı, görsel başarısız olsa da sonraki deneme bu kaydı günceller.
      const savedForm = { ...form, gunler: res.data.gunler.map(day => blankGun({
        id: day.id, tarih: day.tarih, saat: day.saat || '', saat_bitis: day.saat_bitis || '',
      })) };
      setEditId(recordId);
      setForm(savedForm);
      baselineRef.current = formSnapshot(savedForm, selectedArsivId, false);

      onMessage?.(editId === 0 ? 'Sınav eklendi' : 'Sınav güncellendi', 'success');
      await onReload();
      const next = pendingTab;
      closeForm();
      if (next) setTab(next);
    } catch {
      onMessage?.('İşlem tamamlanamadı. Kaydı kontrol edip tekrar deneyin.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (saving) return;
    const dayCount = editingExam ? examDays(editingExam, sinavlar).length : form.gunler.length;
    const question = dayCount > 1
      ? `Bu sınavın ${dayCount} günü birden silinsin mi?`
      : 'Bu sınav kaydını silmek istediğinize emin misiniz?';
    if (!confirm(question)) return;
    const res = await websiteAdminApi.removeSinavGroup(id);
    if (!res.success) {
      onMessage?.(res.error || 'Silinemedi', 'error');
      return;
    }
    closeForm();
    onMessage?.('Sınav silindi', 'success');
    await onReload();
  };

  const dayExams = selectedDate ? byDate[selectedDate] || [] : [];
  const editingExam = editId && editId > 0 ? sinavlar.find(exam => exam.id === editId) : null;
  const selectedArchive = selectedArsivId ? archive.find(item => item.id === selectedArsivId) : null;
  const displayImage = imageTouched && !selectedArsivId
    ? null
    : resolveMediaUrl(selectedArchive?.gorsel_url) || (!imageTouched ? resolveMediaUrl(editingExam?.gorsel_url) : null);
  const hasDraftImage = imageTouched;
  const hasSavedImage = Boolean(!imageTouched && editingExam?.gorsel_url);
  const g = WEBSITE_IMAGE_GUIDELINES.sinav;

  const turOptions = activeTab.types;
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthExams = filtered.filter(exam => exam.tarih.startsWith(monthKey));
  const listedExams = showAllExams ? filtered : monthExams;

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const clearDraftImage = () => {
    setSelectedArsivId(null);
    setImageTouched(true);
  };

  const resetArchiveForm = () => {
    setShowArchiveForm(false);
    setEditingArsivId(null);
    setArchiveAd('');
    setArchiveEtiket('');
    setArchiveFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const openArchiveForm = (item?: SinavGorselArsiv) => {
    setEditingArsivId(item?.id ?? null);
    setArchiveAd(item?.ad ?? form.yayin_adi.trim());
    setArchiveEtiket(item?.etiketler ?? form.tur);
    setArchiveFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setShowArchiveForm(true);
  };

  const saveArchiveItem = async () => {
    if (archiveSaving) return;
    const ad = archiveAd.trim();
    if (!ad) {
      onMessage?.('Görsel adı yazın', 'error');
      return;
    }
    if (!editingArsivId && !archiveFile) {
      onMessage?.('Bir görsel dosyası seçin', 'error');
      return;
    }
    if (archiveFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(archiveFile.type) || archiveFile.size > g.maxMb * 1024 * 1024)) {
      onMessage?.(`JPEG, PNG veya WebP görsel seçin; en fazla ${g.maxMb} MB olabilir.`, 'error');
      return;
    }
    setArchiveSaving(true);
    try {
      const res = editingArsivId
        ? await websiteAdminApi.updateSinavGorsel(editingArsivId, { ad, etiketler: archiveEtiket })
        : await websiteAdminApi.createSinavGorsel(archiveFile as File, ad, archiveEtiket);
      if (!res.success || !res.data) {
        onMessage?.(res.error || 'Arşive kaydedilemedi', 'error');
        return;
      }
      await reloadArchive();
      if (!editingArsivId) {
        setSelectedArsivId(res.data.id);
        setImageTouched(true);
        setShowPicker(false);
      }
      resetArchiveForm();
      onMessage?.(editingArsivId ? 'Arşiv görseli güncellendi' : 'Görsel arşive eklendi', 'success');
    } finally {
      setArchiveSaving(false);
    }
  };

  const removeSavedImage = async () => {
    if (!editId || editId <= 0) return;
    const dayCount = editingExam ? examDays(editingExam, sinavlar).length : 1;
    const question = dayCount > 1
      ? `Görsel bu sınavın ${dayCount} gününden de kaldırılsın mı? Arşivdeki dosya durur.`
      : 'Görsel bu sınavdan kaldırılsın mı? Arşivdeki dosya durur.';
    if (!confirm(question)) return;
    setRemovingImage(true);
    try {
      const res = await websiteAdminApi.removeSinavImage(editId);
      if (!res.success) {
        onMessage?.(res.error || 'Görsel kaldırılamadı', 'error');
        return;
      }
      setSelectedArsivId(null);
      setImageTouched(false);
      baselineRef.current = formSnapshot(form, null, false);
      onReload();
      onMessage?.('Görsel sınavdan kaldırıldı', 'success');
    } finally {
      setRemovingImage(false);
    }
  };

  const removeArchiveItem = async (item: SinavGorselArsiv) => {
    if (removingLibraryId) return;
    const question = item.kullanim > 0
      ? `«${item.ad}» ${item.kullanim} sınavda kullanılıyor. Arşivden silinirse o sınavlardan da kalkar. Silinsin mi?`
      : `«${item.ad}» arşivden silinsin mi?`;
    if (!confirm(question)) return;
    setRemovingLibraryId(item.id);
    try {
      const res = await websiteAdminApi.removeSinavGorsel(item.id);
      if (!res.success) {
        onMessage?.(res.error || 'Arşivden silinemedi', 'error');
        return;
      }
      if (selectedArsivId === item.id) {
        setSelectedArsivId(null);
        setImageTouched(true);
      }
      if (editingArsivId === item.id) resetArchiveForm();
      await reloadArchive();
      await onReload();
      onMessage?.('Görsel arşivden silindi', 'success');
    } finally {
      setRemovingLibraryId(null);
    }
  };

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const examCount = new Set(filtered.map(item => item.grup_id || `id-${item.id}`)).size;
  const firstGun = form.gunler[0];
  const whenLabel = form.gunler.length > 1
    ? `${form.gunler.length} gün`
    : firstGun?.tarih
      ? `${fmtDay(firstGun.tarih)}${clock(firstGun.saat) ? ` · ${clock(firstGun.saat)}${firstGun.saat_bitis ? `–${clock(firstGun.saat_bitis)}` : ''}` : ''}`
      : 'Tarih seçin';
  const previewDay = [...form.gunler]
    .filter(gun => gun.tarih)
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || ''))[0];
  const previewSinav: SinavTakvim = {
    id: editId && editId > 0 ? editId : 0,
    tur: form.tur,
    tarih: previewDay?.tarih || '',
    saat: clock(previewDay?.saat) || null,
    saat_bitis: clock(previewDay?.saat_bitis) || null,
    kapsam: form.kapsam,
    baslik: form.baslik.trim() || `${form.yayin_adi || form.tur} Deneme Sınavı`,
    yayin_adi: form.yayin_adi,
    aciklama: form.aciklama,
    gorsel_url: displayImage,
  };

  return (
    <div className={s.page}>
      <header className={s.hero}>
        <div className={s.heroTop}>
          <div className={s.heroIcon} aria-hidden="true">
            <Icon name="calendar" size={22} />
          </div>
          <div>
            <h1>Deneme Takvimi</h1>
            <p>
              Anasayfada görünen YKS, 11. sınıf, LGS ve 7. sınıf günleri.
              Aynı sınavın günleri tek kayıttır; başlık, yayın ve görsel hepsinde ortaktır.
            </p>
          </div>
        </div>
        <div className={s.metrics}>
          <div className={s.metric}>
            <b>{monthExams.length}</b>
            <span>Bu ay</span>
          </div>
          <div className={s.metric}>
            <b>{filtered.length}</b>
            <span>{activeTab.label} günü</span>
          </div>
          <div className={s.metric}>
            <b>{examCount}</b>
            <span>Farklı sınav</span>
          </div>
        </div>
      </header>

      <div className={s.tabs} role="tablist">
        {SINAV_TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? `${s.tab} ${s.tabOn}` : s.tab}
            onClick={() => requestTabChange(item.id)}
          >
            {item.label}
            <span className={s.count}>{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <div className={s.board}>
        <section className={s.card}>
          <div className={s.calHead}>
            <div>
              <h2>{MONTH_NAMES[month]} {year}</h2>
              <p>Güne tıklayınca sınav açılır. Boş gün yeni kayıt açar.</p>
            </div>
            <div className={s.nav}>
              <button type="button" className={s.iconBtn} onClick={prevMonth} aria-label="Önceki ay">
                <Icon name="back" size={16} />
              </button>
              <button type="button" className={s.iconBtn} onClick={nextMonth} aria-label="Sonraki ay">
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
          <div className={s.weekdays}>
            {WEEKDAYS.map(name => <span key={name}>{name}</span>)}
          </div>
          <div className={s.grid}>
            {cells.map((d, i) => {
              if (d === null) return <div key={`pad-${i}`} className={s.pad} />;
              const dateKey = padDate(d);
              const exams = byDate[dateKey] || [];
              const shown = exams.slice(0, 2);
              const extra = exams.length - shown.length;
              const classes = [
                s.day,
                exams.length ? s.dayHas : '',
                dateKey === todayKey ? s.dayToday : '',
                dateKey === selectedDate ? s.daySel : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={dateKey}
                  type="button"
                  className={classes}
                  aria-label={`${d} ${MONTH_NAMES[month]}${exams.length ? `, ${exams.length} sınav` : ', boş'}`}
                  onClick={() => {
                    if (exams.length === 1) openEdit(exams[0]);
                    else if (exams.length > 1) {
                      setEditId(null);
                      setSelectedDate(dateKey);
                    } else openCreate(dateKey);
                  }}
                >
                  <span className={s.num}>{d}</span>
                  {shown.map(exam => (
                    <span key={exam.id} className={s.chip} style={{ background: sinavTurColor(exam.tur) }}>
                      {exam.gorsel_url && <img className={s.dayPoster} src={resolveMediaUrl(exam.gorsel_url) || ''} alt="" loading="lazy" />}
                      {exam.baslik}
                    </span>
                  ))}
                  {extra > 0 && <span className={s.more}>+{extra}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className={s.card}>
          <div className={s.listHead}>
            <div>
              <h2>{showAllExams ? 'Tüm sınavlar' : 'Bu ay'}</h2>
              <p>{listedExams.length} gün</p>
            </div>
            <button type="button" className={s.linkish} onClick={() => setShowAllExams(value => !value)}>
              {showAllExams ? 'Bu ay' : `Tümü (${filtered.length})`}
            </button>
          </div>
          {listedExams.length === 0 ? (
            <p className={s.empty}>Bu görünümde sınav yok. Takvimden bir güne tıklayarak ekleyebilirsiniz.</p>
          ) : (
            <div className={s.list}>
              {listedExams.map(exam => {
                const days = examDays(exam, sinavlar);
                const range = [clock(exam.saat), clock(exam.saat_bitis)].filter(Boolean).join('–');
                const meta = [
                  fmtDay(exam.tarih),
                  range,
                  exam.yayin_adi,
                  exam.kapsam === 'turkiye_geneli' ? 'Türkiye geneli' : 'Yerel',
                  days.length > 1 ? `${days.length} gün` : '',
                ].filter(Boolean).join(' · ');
                const image = resolveMediaUrl(exam.gorsel_url);
                return (
                  <button key={exam.id} type="button" className={s.exam} onClick={() => openEdit(exam)}>
                    {image ? (
                      <img className={s.thumb} src={image} alt="" />
                    ) : (
                      <span className={s.mark} style={{ background: sinavTurColor(exam.tur) }}>{sinavTurBadge(exam.tur)}</span>
                    )}
                    <span>
                      <strong>{exam.baslik}</strong>
                      <small>{sinavTurLabel(exam.tur)} · {meta}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedDate && editId === null && dayExams.length > 1 && (
        <div className={s.backdrop} onClick={() => setSelectedDate(null)}>
          <div className={s.confirm} onClick={event => event.stopPropagation()} role="dialog" aria-modal="true">
            <h3>{fmtDay(selectedDate)}</h3>
            <p>Bu günde {dayExams.length} sınav var. Düzenlemek istediğinizi seçin.</p>
            <div className={s.list} style={{ padding: '14px 0 0', maxHeight: 280 }}>
              {dayExams.map(exam => (
                <button key={exam.id} type="button" className={s.exam} onClick={() => openEdit(exam)}>
                  <span className={s.mark} style={{ background: sinavTurColor(exam.tur) }}>{sinavTurBadge(exam.tur)}</span>
                  <span>
                    <strong>{exam.baslik}</strong>
                    <small>{[clock(exam.saat), clock(exam.saat_bitis)].filter(Boolean).join('–') || 'Saat yok'}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className={s.actions}>
              <button type="button" className={s.primary} onClick={() => openCreate(selectedDate)}>Yeni sınav</button>
              <button type="button" className={s.ghost} onClick={() => setSelectedDate(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className={s.backdrop} onClick={requestClose}>
          <div className={s.dialog} onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="deneme-form-title">
            <div className={s.dialogHead}>
              <div>
                <h3 id="deneme-form-title">{editId === 0 ? 'Yeni sınav' : 'Sınavı düzenle'}</h3>
                <p>{whenLabel}</p>
              </div>
              <button type="button" className={s.iconBtn} onClick={requestClose} aria-label="Kapat">
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className={s.dialogBody}>
              <div className={s.stack}>
                <div className={s.fields}>
                  <label className={s.field}>
                    <span>Tür</span>
                    <select value={form.tur} onChange={event => setForm({ ...form, tur: event.target.value })}>
                      {turOptions.map(tur => <option key={tur.value} value={tur.value}>{tur.label}</option>)}
                    </select>
                  </label>
                  <label className={s.field}>
                    <span>Kapsam</span>
                    <select value={form.kapsam} onChange={event => setForm({ ...form, kapsam: event.target.value })}>
                      <option value="turkiye_geneli">Türkiye geneli</option>
                      <option value="yerel">Yerel</option>
                    </select>
                  </label>
                  <label className={s.field}>
                    <span>Başlık</span>
                    <input value={form.baslik} onChange={event => setForm({ ...form, baslik: event.target.value })} placeholder="TYT Deneme 3" />
                  </label>
                  <label className={s.field}>
                    <span>Yayın</span>
                    <input value={form.yayin_adi} onChange={event => setForm({ ...form, yayin_adi: event.target.value })} placeholder="Bilgi Sarmalı" />
                  </label>
                </div>
                <label className={s.field}>
                  <span>Açıklama</span>
                  <textarea value={form.aciklama} onChange={event => setForm({ ...form, aciklama: event.target.value })} placeholder="İsteğe bağlı kısa not" />
                </label>

                <div className={s.gunHead}>
                  <strong>Uygulama günleri</strong>
                  <button type="button" className={s.linkish} onClick={addGun}>
                    <Icon name="plus" size={14} /> Gün ekle
                  </button>
                </div>
                {form.gunler.map((gun, index) => (
                  <div key={gun.key} className={s.gunRow}>
                    <label className={s.field}>
                      <span>Gün {index + 1}</span>
                      <input type="date" value={gun.tarih} onChange={event => updateGun(gun.key, { tarih: event.target.value })} />
                    </label>
                    <label className={s.field}>
                      <span>Başlangıç</span>
                      <input type="time" value={clock(gun.saat)} onChange={event => updateGun(gun.key, { saat: event.target.value })} />
                    </label>
                    <label className={s.field}>
                      <span>Bitiş</span>
                      <input type="time" value={clock(gun.saat_bitis)} onChange={event => updateGun(gun.key, { saat_bitis: event.target.value })} />
                    </label>
                    {form.gunler.length > 1 ? (
                      <button type="button" className={s.iconBtn} onClick={() => removeGun(gun.key)} aria-label="Günü kaldır">
                        <Icon name="trash" size={15} />
                      </button>
                    ) : <span />}
                  </div>
                ))}
                <p className={s.hint}>Eklenen her gün anasayfa takviminde ayrı görünür. Bir günü kaldırmak diğerlerini silmez.</p>
              </div>

              <div className={s.stack}>
                <button type="button" className={s.poster} onClick={() => setShowPicker(true)} aria-label="Görsel seç">
                  {displayImage ? <img src={displayImage} alt="" /> : <span>Görsel seç</span>}
                </button>
                <p className={s.hint}>Arşivden seçin. Yeni logo önce arşive, isim ve etiketle eklenir. {g.size}. En fazla {g.maxMb} MB.</p>
                <div className={s.actions} style={{ marginTop: 0 }}>
                  {displayImage && (
                    <button type="button" className={s.ghost} onClick={() => setShowPreview(true)}>
                      Önizleme
                    </button>
                  )}
                  {hasDraftImage && (
                    <button type="button" className={s.linkish} onClick={clearDraftImage}>
                      Seçimi kaldır
                    </button>
                  )}
                  {hasSavedImage && (
                    <button type="button" className={s.quietDanger} onClick={removeSavedImage} disabled={removingImage}>
                      {removingImage ? 'Siliniyor…' : 'Görseli sil'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={s.dialogFoot}>
              <div className={s.footLeft}>
                {editId !== null && editId > 0 && (
                  <button type="button" className={s.danger} onClick={() => remove(editId)} disabled={saving}>Sınavı sil</button>
                )}
              </div>
              <div className={s.footRight}>
                <button type="button" className={s.ghost} onClick={requestClose}>İptal</button>
                <button type="button" className={s.primary} onClick={save} disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPicker && (
        <div className={s.backdrop} style={{ zIndex: 1150 }} onClick={() => setShowPicker(false)}>
          <div
            className={s.picker}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gorsel-sec-title"
            onClick={event => event.stopPropagation()}
          >
            <div className={s.dialogHead}>
              <div>
                <h3 id="gorsel-sec-title">Görsel arşivi</h3>
                <p>Arşivden seçin. Yeni görsel bir kez eklenir; sonraki sınavlar aynı kaydı kullanır.</p>
              </div>
              <button type="button" className={s.iconBtn} onClick={() => setShowPicker(false)} aria-label="Kapat">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className={s.pickerBody}>
              <div className={s.archiveTools}>
                <input
                  className={s.archiveSearch}
                  value={archiveQuery}
                  onChange={event => setArchiveQuery(event.target.value)}
                  placeholder="İsim veya etiket ara"
                  aria-label="Arşivde ara"
                />
                <button type="button" className={s.ghost} onClick={() => (showArchiveForm && !editingArsivId ? resetArchiveForm() : openArchiveForm())}>
                  <Icon name="plus" size={14} /> Arşive ekle
                </button>
              </div>
              {showArchiveForm && (
                <div className={s.archiveForm}>
                  <label className={s.field}>
                    <span>Ad</span>
                    <input value={archiveAd} onChange={event => setArchiveAd(event.target.value)} placeholder="ÜçDörtBeş" />
                  </label>
                  <label className={s.field}>
                    <span>Etiketler</span>
                    <input value={archiveEtiket} onChange={event => setArchiveEtiket(event.target.value)} placeholder="TYT, AYT, deneme" />
                  </label>
                  {!editingArsivId && (
                    <label className={s.field}>
                      <span>Dosya</span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={event => setArchiveFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                  <div className={s.actions} style={{ marginTop: 0 }}>
                    <button type="button" className={s.primary} onClick={saveArchiveItem} disabled={archiveSaving}>
                      {archiveSaving ? 'Kaydediliyor…' : editingArsivId ? 'Adı güncelle' : 'Arşive kaydet'}
                    </button>
                    <button type="button" className={s.ghost} onClick={resetArchiveForm}>Vazgeç</button>
                  </div>
                </div>
              )}
              {visibleArchive.length > 0 ? (
                <div className={s.library}>
                  {visibleArchive.map(item => (
                    <div key={item.id} className={selectedArsivId === item.id ? `${s.libItem} ${s.libOn}` : s.libItem}>
                      <button
                        type="button"
                        className={s.libPick}
                        onClick={() => {
                          setSelectedArsivId(item.id);
                          setImageTouched(true);
                          setShowPicker(false);
                        }}
                      >
                        <img src={resolveMediaUrl(item.gorsel_url) || ''} alt="" />
                        <span>{item.ad}</span>
                        {item.etiketler && <small className={s.libTags}>{item.etiketler}</small>}
                      </button>
                      <button
                        type="button"
                        className={s.libEdit}
                        aria-label={`${item.ad} adını düzenle`}
                        onClick={() => openArchiveForm(item)}
                      >
                        <Icon name="edit" size={10} />
                      </button>
                      <button
                        type="button"
                        className={s.libRemove}
                        aria-label={`${item.ad} görselini arşivden sil`}
                        disabled={removingLibraryId === item.id}
                        onClick={() => removeArchiveItem(item)}
                      >
                        <Icon name="close" size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={s.hint}>{archive.length ? 'Bu aramaya uygun görsel yok.' : 'Arşiv boş. Önce bir görsel ekleyin.'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <SinavDetailModal sinav={previewSinav} front onClose={() => setShowPreview(false)} />
      )}

      {showUnsaved && (
        <div className={s.backdrop} style={{ zIndex: 1100 }}>
          <div className={s.confirm} role="dialog" aria-modal="true">
            <h3>Kaydedilmemiş değişiklik</h3>
            <p>Bu sınavdaki değişiklikler henüz kaydedilmedi. Çıkarsanız silinir.</p>
            <div className={s.actions}>
              <button type="button" className={s.ghost} onClick={() => { setShowUnsaved(false); setPendingTab(null); }}>Vazgeç</button>
              <button type="button" className={s.danger} onClick={discardAndProceed}>Kaydetmeden çık</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
