'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
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
  onReload: () => void;
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

function formSnapshot(form: FormState, pendingImage: File | null, reuseFromId: number | null = null) {
  return JSON.stringify({
    ...form,
    _pendingImage: pendingImage?.name ?? '',
    _reuse: reuseFromId ?? 0,
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
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [pendingTab, setPendingTab] = useState<SinavTabId | null>(null);
  const [showAllExams, setShowAllExams] = useState(false);
  const [reuseFromId, setReuseFromId] = useState<number | null>(null);
  const [imageCleared, setImageCleared] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [removingLibraryId, setRemovingLibraryId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const baselineRef = useRef('');

  const modalOpen = editId !== null;

  useEffect(() => {
    const now = new Date();
    setMonth(now.getMonth());
    setYear(now.getFullYear());
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

  useEffect(() => {
    if (!pendingImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  const imageLibrary = useMemo(() => {
    const seen = new Set<string>();
    const items: { id: number; url: string; label: string; yayin: string; version: number }[] = [];
    sinavlar.forEach(exam => {
      const url = exam.gorsel_url || '';
      if (!url) return;
      const path = url.split('?')[0];
      const key = exam.grup_id ? `grup:${exam.grup_id}` : path;
      if (seen.has(key)) return;
      seen.add(key);
      const yayin = (exam.yayin_adi || '').trim();
      const version = Number(url.match(/[?&]v=(\d+)/)?.[1] || 0);
      items.push({
        id: exam.id,
        url,
        label: exam.baslik || yayin,
        yayin: yayin.toLocaleLowerCase('tr'),
        version,
      });
    });
    const current = form.yayin_adi.trim().toLocaleLowerCase('tr');
    return [...items].sort((a, b) => (
      Number(b.yayin === current) - Number(a.yayin === current)
      || b.version - a.version
      || a.label.localeCompare(b.label, 'tr')
    ));
  }, [sinavlar, form.yayin_adi]);

  const byDate = useMemo(() => {
    const map: Record<string, SinavTakvim[]> = {};
    filtered.forEach(exam => {
      if (!map[exam.tarih]) map[exam.tarih] = [];
      map[exam.tarih].push(exam);
    });
    return map;
  }, [filtered]);

  const isDirty = () => formSnapshot(form, pendingImage, reuseFromId) !== baselineRef.current;

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
    setPendingImage(null);
    setReuseFromId(null);
    setImageCleared(false);
    setShowPreview(false);
    setShowPicker(false);
    setForm(nextForm);
    baselineRef.current = formSnapshot(nextForm, null);
  };

  const openEdit = (exam: SinavTakvim) => {
    const nextForm = examToForm(exam, sinavlar);
    setEditId(exam.id);
    setSelectedDate(exam.tarih);
    setPendingImage(null);
    setReuseFromId(null);
    setImageCleared(false);
    setShowPreview(false);
    setShowPicker(false);
    setForm(nextForm);
    baselineRef.current = formSnapshot(nextForm, null);
  };

  const closeForm = () => {
    setEditId(null);
    setSelectedDate(null);
    setForm({ ...EMPTY_FORM, gunler: [] });
    setPendingImage(null);
    setReuseFromId(null);
    setImageCleared(false);
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
    if (form.gunler.length === 0 || form.gunler.some(gun => !gun.tarih)) {
      onMessage?.('Her günün tarihi seçilmelidir', 'error');
      return;
    }
    const baslik = form.baslik.trim() || `${form.yayin_adi || form.tur} Deneme Sınavı`;
    const payload: SinavTakvimWrite = {
      tur: form.tur,
      kapsam: form.kapsam,
      baslik,
      yayin_adi: form.yayin_adi,
      aciklama: form.aciklama,
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

      if (pendingImage && recordId && recordId > 0) {
        const up = await websiteAdminApi.upload('sinav-takvim', recordId, pendingImage, 'gorsel');
        if (!up.success) {
          onMessage?.(up.error || 'Görsel yüklenemedi', 'error');
          return;
        }
      } else if (reuseFromId && recordId && recordId > 0 && reuseFromId !== recordId) {
        const reused = await websiteAdminApi.reuseSinavImage(recordId, reuseFromId);
        if (!reused.success) {
          onMessage?.(reused.error || 'Kayıtlı görsel kopyalanamadı', 'error');
          return;
        }
      }

      onMessage?.(editId === 0 ? 'Sınav eklendi' : 'Sınav güncellendi', 'success');
      onReload();
      const next = pendingTab;
      closeForm();
      if (next) setTab(next);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
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
    onReload();
  };

  const dayExams = selectedDate ? byDate[selectedDate] || [] : [];
  const editingExam = editId && editId > 0 ? sinavlar.find(exam => exam.id === editId) : null;
  const reuseExam = reuseFromId ? sinavlar.find(exam => exam.id === reuseFromId) : null;
  const savedImage = imageCleared ? null : resolveMediaUrl(editingExam?.gorsel_url);
  const displayImage = previewUrl
    || (reuseExam ? resolveMediaUrl(reuseExam.gorsel_url) : null)
    || savedImage
    || null;
  const hasDraftImage = Boolean(pendingImage || reuseFromId);
  const hasSavedImage = Boolean(savedImage);
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
    setPendingImage(null);
    setReuseFromId(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeSavedImage = async () => {
    if (!editId || editId <= 0) return;
    const dayCount = editingExam ? examDays(editingExam, sinavlar).length : 1;
    const question = dayCount > 1
      ? `Görsel bu sınavın ${dayCount} gününden de kaldırılsın mı?`
      : 'Bu görsel kaldırılsın mı?';
    if (!confirm(question)) return;
    setRemovingImage(true);
    try {
      const res = await websiteAdminApi.removeSinavImage(editId);
      if (!res.success) {
        onMessage?.(res.error || 'Görsel silinemedi', 'error');
        return;
      }
      setImageCleared(true);
      clearDraftImage();
      onReload();
      onMessage?.('Görsel silindi', 'success');
    } finally {
      setRemovingImage(false);
    }
  };

  const removeLibraryImage = async (item: { id: number; label: string }) => {
    const owner = sinavlar.find(exam => exam.id === item.id);
    if (!owner || removingLibraryId) return;
    const dayCount = examDays(owner, sinavlar).length;
    const question = dayCount > 1
      ? `«${item.label}» görseli bu sınavın ${dayCount} gününden de kaldırılsın mı? Anasayfada da görünmez.`
      : `«${item.label}» görseli kaldırılsın mı? Bağlı olduğu sınavın anasayfa görseli de silinir.`;
    if (!confirm(question)) return;
    setRemovingLibraryId(item.id);
    try {
      const res = await websiteAdminApi.removeSinavImage(item.id);
      if (!res.success) {
        onMessage?.(res.error || 'Görsel silinemedi', 'error');
        return;
      }
      if (reuseFromId === item.id) clearDraftImage();
      if (editingExam && (editingExam.id === item.id || sameExam(editingExam, owner))) {
        setImageCleared(true);
        clearDraftImage();
      }
      onReload();
      onMessage?.('Görsel silindi', 'success');
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
                <p className={s.hint}>Seçmek için alana tıklayın. {g.size}. En fazla {g.maxMb} MB.</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setPendingImage(file);
                    setReuseFromId(null);
                    setShowPicker(false);
                  }}
                />
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
                  <button type="button" className={s.danger} onClick={() => remove(editId)}>Sınavı sil</button>
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
                <h3 id="gorsel-sec-title">Görsel seç</h3>
                <p>Bilgisayardan yükleyin veya daha önce kullanılan bir görseli seçin. Çarpı, görseli bağlı olduğu sınavdan da kaldırır.</p>
              </div>
              <button type="button" className={s.iconBtn} onClick={() => setShowPicker(false)} aria-label="Kapat">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className={s.pickerBody}>
              <button type="button" className={s.ghost} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={14} /> Görsel yükle
              </button>
              {imageLibrary.length > 0 ? (
                <div className={s.library}>
                  {imageLibrary.map(item => (
                    <div key={item.id} className={reuseFromId === item.id ? `${s.libItem} ${s.libOn}` : s.libItem}>
                      <button
                        type="button"
                        className={s.libPick}
                        onClick={() => {
                          setReuseFromId(item.id);
                          setPendingImage(null);
                          if (fileRef.current) fileRef.current.value = '';
                          setShowPicker(false);
                        }}
                      >
                        <img src={resolveMediaUrl(item.url) || item.url} alt="" />
                        <span>{item.label}</span>
                      </button>
                      <button
                        type="button"
                        className={s.libRemove}
                        aria-label={`${item.label} görselini sil`}
                        disabled={removingLibraryId === item.id}
                        onClick={() => removeLibraryImage(item)}
                      >
                        <Icon name="close" size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={s.hint}>Henüz kullanılmış görsel yok.</p>
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
