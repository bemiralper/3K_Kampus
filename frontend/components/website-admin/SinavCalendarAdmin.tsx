'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
import { websiteAdminApi, cleanWebsiteFormPayload, resolveMediaUrl } from '@/lib/website-api';
import { WEBSITE_IMAGE_GUIDELINES } from '@/lib/website-image-guidelines';
import { sinavTurBadge, sinavTurColor, sinavTurLabel } from '@/lib/landing-theme';
import { SINAV_TABS, defaultTurForTab, filterSinavByTab, sinavTabById, type SinavTabId } from '@/lib/sinav-takvim';
import WamModal from './WamModal';
import { WamInput, WamSelect, WamTextarea } from './WamField';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

type SinavCalendarAdminProps = {
  sinavlar: SinavTakvim[];
  onReload: () => void;
  onMessage?: (msg: string, type?: 'success' | 'error') => void;
};

type FormState = {
  tur: string;
  tarih: string;
  saat: string;
  saat_bitis: string;
  kapsam: string;
  baslik: string;
  yayin_adi: string;
  aciklama: string;
};

const EMPTY_FORM: FormState = {
  tur: 'LGS',
  tarih: '',
  saat: '',
  saat_bitis: '',
  kapsam: 'turkiye_geneli',
  baslik: '',
  yayin_adi: '',
  aciklama: '',
};

function formSnapshot(form: FormState, pendingImage: File | null, reuseFromId: number | null = null) {
  return JSON.stringify({
    ...form,
    _pendingImage: pendingImage?.name ?? '',
    _reuse: reuseFromId ?? 0,
  });
}

function examToForm(exam: SinavTakvim): FormState {
  return {
    tur: exam.tur,
    tarih: exam.tarih,
    saat: exam.saat || '',
    saat_bitis: exam.saat_bitis || '',
    kapsam: exam.kapsam,
    baslik: exam.baslik,
    yayin_adi: exam.yayin_adi || '',
    aciklama: exam.aciklama || '',
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
  const [copyTarget, setCopyTarget] = useState<SinavTakvim | null>(null);
  const [copyDate, setCopyDate] = useState('');
  const [copySaat, setCopySaat] = useState('');
  const [copySaatBitis, setCopySaatBitis] = useState('');
  const [copying, setCopying] = useState(false);
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
    const items: { id: number; url: string; label: string; yayin: string }[] = [];
    sinavlar.forEach(exam => {
      const url = exam.gorsel_url || '';
      if (!url) return;
      const yayin = (exam.yayin_adi || '').trim();
      const key = yayin ? yayin.toLocaleLowerCase('tr') : url;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id: exam.id,
        url,
        label: yayin || exam.baslik,
        yayin: yayin.toLocaleLowerCase('tr'),
      });
    });
    const current = form.yayin_adi.trim().toLocaleLowerCase('tr');
    if (!current) return items;
    return [...items].sort((a, b) => Number(b.yayin === current) - Number(a.yayin === current) || a.label.localeCompare(b.label, 'tr'));
  }, [sinavlar, form.yayin_adi]);

  const byDate = useMemo(() => {
    const map: Record<string, SinavTakvim[]> = {};
    filtered.forEach(s => {
      if (!map[s.tarih]) map[s.tarih] = [];
      map[s.tarih].push(s);
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
    const nextForm: FormState = { ...EMPTY_FORM, tur: defaultTurForTab(tab), tarih: dateKey };
    setEditId(0);
    setSelectedDate(dateKey);
    setPendingImage(null);
    setReuseFromId(null);
    setForm(nextForm);
    baselineRef.current = formSnapshot(nextForm, null);
  };

  const openEdit = (exam: SinavTakvim) => {
    const nextForm = examToForm(exam);
    setEditId(exam.id);
    setSelectedDate(exam.tarih);
    setPendingImage(null);
    setReuseFromId(null);
    setForm(nextForm);
    baselineRef.current = formSnapshot(nextForm, null);
  };

  const closeForm = () => {
    setEditId(null);
    setSelectedDate(null);
    setForm(EMPTY_FORM);
    setPendingImage(null);
    setReuseFromId(null);
    baselineRef.current = '';
    setShowUnsaved(false);
    setPendingTab(null);
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
    if (!form.tarih) {
      onMessage?.('Tarih seçilmelidir', 'error');
      return;
    }
    const baslik = form.baslik.trim() || `${form.yayin_adi || form.tur} Deneme Sınavı`;
    const payload = cleanWebsiteFormPayload({ ...form, baslik });

    setSaving(true);
    try {
      let recordId = editId;

      if (editId === 0) {
        const res = await websiteAdminApi.create<SinavTakvim>('sinav-takvim', payload);
        if (!res.success || !res.data?.id) {
          onMessage?.(res.error || 'Sınav kaydedilemedi', 'error');
          return;
        }
        recordId = res.data.id;
      } else if (editId) {
        const res = await websiteAdminApi.update('sinav-takvim', editId, payload);
        if (!res.success) {
          onMessage?.(res.error || 'Güncelleme başarısız', 'error');
          return;
        }
      }

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
    if (!confirm('Bu sınav kaydını silmek istediğinize emin misiniz?')) return;
    const res = await websiteAdminApi.remove('sinav-takvim', id);
    if (!res.success) {
      onMessage?.(res.error || 'Silinemedi', 'error');
      return;
    }
    closeForm();
    onMessage?.('Sınav silindi', 'success');
    onReload();
  };

  const openCopy = (exam: SinavTakvim) => {
    setCopyTarget(exam);
    setCopyDate(exam.tarih);
    setCopySaat(exam.saat || '');
    setCopySaatBitis(exam.saat_bitis || '');
  };

  const submitCopy = async () => {
    if (!copyTarget) return;
    if (!copyDate) {
      onMessage?.('Kopyanın tarihi seçilmelidir', 'error');
      return;
    }
    setCopying(true);
    try {
      const res = await websiteAdminApi.copySinav(copyTarget.id, {
        tarih: copyDate,
        saat: copySaat || null,
        saat_bitis: copySaatBitis || null,
      });
      if (!res.success) {
        onMessage?.(res.error || 'Sınav kopyalanamadı', 'error');
        return;
      }
      const [y, m] = copyDate.split('-').map(Number);
      if (y && m) {
        setYear(y);
        setMonth(m - 1);
      }
      setShowAllExams(false);
      setCopyTarget(null);
      onMessage?.('Sınav seçilen güne kopyalandı', 'success');
      onReload();
    } finally {
      setCopying(false);
    }
  };

  const dayExams = selectedDate ? byDate[selectedDate] || [] : [];
  const editingExam = editId && editId > 0 ? sinavlar.find(s => s.id === editId) : null;
  const reuseExam = reuseFromId ? sinavlar.find(s => s.id === reuseFromId) : null;
  const displayImage = previewUrl
    || (reuseExam ? resolveMediaUrl(reuseExam.gorsel_url) : null)
    || resolveMediaUrl(editingExam?.gorsel_url)
    || null;
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

  return (
    <div>
      <div className="wam-info-banner">
        <svg className="wam-info-banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <div>
          <strong>YKS, 11. sınıf, LGS ve 7. sınıf takvimlerini ayrı yönetin</strong>
          Sekme seçin, boş bir güne tıklayın ve sınav bilgilerini kaydedin.
          Aynı sınavı başka bir güne kopyalayabilir, görseli yeniden yüklemek yerine daha önce kullanılanlardan seçebilirsiniz.
          Görsel yalnızca ana sayfadaki sınav detay penceresinde görünür (1200×675 px, 16:9).
        </div>
      </div>

      {/* Tab menü */}
      <div className="wam-sinav-tabs">
        {SINAV_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`wam-sinav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => requestTabChange(t.id)}
          >
            <span className="wam-sinav-tab-label">{t.label}</span>
            <span className="wam-sinav-tab-hint">{t.hint}</span>
            {counts[t.id] > 0 && <span className="wam-sinav-tab-count">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      <div className="wam-cal-wrap">
        <div className="wam-cal-nav">
          <button type="button" className="wam-btn wam-btn-ghost wam-btn-sm" onClick={prevMonth}>←</button>
          <div style={{ textAlign: 'center' }}>
            <h4 style={{ margin: 0 }}>{MONTH_NAMES[month]} {year}</h4>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
              {activeTab.calendarLabel}
            </p>
          </div>
          <button type="button" className="wam-btn wam-btn-ghost wam-btn-sm" onClick={nextMonth}>→</button>
        </div>

        <div className="wam-cal-grid" style={{ marginBottom: '6px' }}>
          {WEEKDAYS.map(w => <div key={w} className="wam-cal-weekday">{w}</div>)}
        </div>

        <div className="wam-cal-grid">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} />;
            const dateKey = padDate(day);
            const exams = byDate[dateKey] || [];
            const primary = exams[0];

            return (
              <button
                key={dateKey}
                type="button"
                className={`wam-cal-day ${exams.length ? 'has-exam' : ''}`}
                onClick={() => {
                  if (exams.length === 1) openEdit(exams[0]);
                  else if (exams.length > 1) {
                    setSelectedDate(dateKey);
                    setEditId(null);
                  } else openCreate(dateKey);
                }}
                title={exams.length ? exams.map(e => `${e.baslik} (${sinavTurLabel(e.tur)})`).join(', ') : activeTab.addTitle}
              >
                <span className="wam-cal-day-num">{day}</span>
                {primary ? (
                  <>
                    <span className="wam-cal-day-badge" style={{ background: sinavTurColor(primary.tur) }}>
                      {sinavTurBadge(primary.tur)}
                    </span>
                    <span className="wam-cal-day-title">{primary.baslik}</span>
                  </>
                ) : null}
                {exams.length > 1 && (
                  <span className="wam-cal-day-more">+{exams.length - 1}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="wam-exam-list" style={{ marginTop: '1.25rem' }}>
          <div className="wam-exam-list-head">
            <h5 className="wam-exam-list-title">
              {showAllExams
                ? `${activeTab.listTitle} (${filtered.length})`
                : `${MONTH_NAMES[month]} ${year} · ${monthExams.length} sınav`}
            </h5>
            <button
              type="button"
              className="wam-btn wam-btn-ghost wam-btn-sm"
              onClick={() => setShowAllExams(value => !value)}
            >
              {showAllExams ? 'Bu ayı göster' : `Tüm ${activeTab.label} (${filtered.length})`}
            </button>
          </div>
          {listedExams.length === 0 ? (
            <p className="wam-field-hint">Bu ayda sınav yok. Takvimden bir gün seçerek ekleyin veya tüm listeyi açın.</p>
          ) : (
            <div className="wam-exam-cards">
              {listedExams.map(exam => (
                <div key={exam.id} className="wam-exam-list-item">
                  <button type="button" className="wam-exam-list-open" onClick={() => openEdit(exam)}>
                    {exam.gorsel_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveMediaUrl(exam.gorsel_url) || ''} alt="" className="wam-item-thumb" />
                    ) : (
                      <span className="wam-exam-list-badge" style={{ background: sinavTurColor(exam.tur) }}>{sinavTurBadge(exam.tur)}</span>
                    )}
                    <span className="wam-exam-list-text">
                      <strong>{exam.baslik}</strong>
                      <small>{exam.tarih} · {sinavTurLabel(exam.tur)}{exam.kapsam === 'turkiye_geneli' ? ' · TR Geneli' : ''}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="wam-exam-list-copy"
                    title="Başka güne kopyala"
                    onClick={() => openCopy(exam)}
                  >
                    Kopyala
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="wam-field-hint" style={{ marginTop: '1rem', textAlign: 'center' }}>
          {activeTab.emptyAdmin}
        </p>
      )}

      {selectedDate && editId === null && dayExams.length > 1 && (
        <div className="wam-settings-card" style={{ marginTop: '1rem' }}>
          <div className="wam-settings-card-head">
            <div>
              <h5>{selectedDate} — {dayExams.length} sınav</h5>
            </div>
            <button type="button" className="wam-btn wam-btn-primary wam-btn-sm" onClick={() => openCreate(selectedDate)}>+ Yeni</button>
          </div>
          {dayExams.map(exam => (
            <button key={exam.id} type="button" className="wam-exam-list-item" onClick={() => openEdit(exam)}>
              {exam.gorsel_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={exam.gorsel_url} alt="" className="wam-item-thumb" />}
              <span>{exam.baslik} · {sinavTurLabel(exam.tur)}</span>
            </button>
          ))}
        </div>
      )}

      <WamModal
        open={modalOpen}
        title={editId === 0 ? `Yeni ${activeTab.createTitle} Sınavı` : 'Sınavı Düzenle'}
        subtitle={
          form.tarih
            ? `${form.tarih}${form.saat ? ` · ${form.saat}${form.saat_bitis ? `–${form.saat_bitis}` : ''}` : ''}`
            : undefined
        }
        onClose={requestClose}
        wide
        footer={(
          <>
            <button type="button" className="wam-btn wam-btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            {editId !== null && editId > 0 && editingExam && (
              <button type="button" className="wam-btn wam-btn-secondary" onClick={() => openCopy(editingExam)}>
                Başka güne kopyala
              </button>
            )}
            {editId !== null && editId > 0 && (
              <button type="button" className="wam-btn wam-btn-danger" onClick={() => remove(editId)}>Sil</button>
            )}
            <button type="button" className="wam-btn wam-btn-ghost" onClick={requestClose}>İptal</button>
          </>
        )}
      >
        <div className="wam-form-grid">
          <WamSelect
            label="Sınav Türü"
            value={form.tur}
            onChange={e => setForm(f => ({ ...f, tur: e.target.value }))}
            options={turOptions}
          />
          <WamInput label="Tarih" type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
          <WamInput label="Başlangıç Saati" type="time" value={form.saat} onChange={e => setForm(f => ({ ...f, saat: e.target.value }))} />
          <WamInput label="Bitiş Saati" type="time" value={form.saat_bitis} onChange={e => setForm(f => ({ ...f, saat_bitis: e.target.value }))} />
          <WamSelect
            label="Kapsam"
            value={form.kapsam}
            onChange={e => setForm(f => ({ ...f, kapsam: e.target.value }))}
            options={[
              { value: 'turkiye_geneli', label: 'Türkiye Geneli' },
              { value: 'yerel', label: 'Yerel' },
            ]}
          />
        </div>

        <WamInput
          label="Yayın / Kurum Adı"
          hint="Örn: Özdebir, Palme, 3K Kampüs Denemesi"
          full
          value={form.yayin_adi}
          onChange={e => setForm(f => ({ ...f, yayin_adi: e.target.value }))}
          placeholder="Hangi yayının sınavı?"
        />
        <WamInput
          label="Sınav Başlığı"
          hint="Boş bırakılırsa yayın adından otomatik oluşturulur"
          full
          value={form.baslik}
          onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))}
        />
        <WamTextarea label="Açıklama" full rows={3} value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} />

        <div className="wam-image-upload" style={{ marginTop: '1rem' }}>
          <div className="wam-image-upload-head">
            <strong>{g.label}</strong>
            <span className="wam-image-size-badge">{g.size} · max {g.maxMb}MB</span>
          </div>
          <p className="wam-image-hint">{g.hint}</p>
          <div className="wam-image-upload-body">
            <div className={`wam-image-preview wam-image-preview-sinav ${displayImage ? 'has-image' : ''}`}>
              {displayImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayImage} alt="Önizleme" />
              ) : (
                <span className="wam-image-placeholder">Görsel seçilmedi</span>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setPendingImage(f);
                    setReuseFromId(null);
                  }
                  e.target.value = '';
                }}
              />
              <button type="button" className="wam-btn wam-btn-secondary wam-btn-sm" onClick={() => fileRef.current?.click()}>
                {displayImage ? 'Yeni dosya seç' : 'Görsel Seç'}
              </button>
              {pendingImage && <p className="wam-field-hint" style={{ marginTop: 6 }}>Kaydedince yüklenecek: {pendingImage.name}</p>}
              {reuseExam && !pendingImage && (
                <p className="wam-field-hint" style={{ marginTop: 6 }}>Kayıtlı görsel kullanılacak: {reuseExam.yayin_adi || reuseExam.baslik}</p>
              )}
            </div>
          </div>
          {imageLibrary.length > 0 && (
            <div className="wam-gorsel-library">
              <strong>Daha önce kullanılan görseller</strong>
              <p>Aynı yayınevin görselini yeniden yüklemeden seçin. Yayın adı eşleşenler öne gelir.</p>
              <div className="wam-gorsel-library-row">
                {imageLibrary.map(item => (
                  <button
                    key={item.url}
                    type="button"
                    className={`wam-gorsel-thumb ${reuseFromId === item.id ? 'is-selected' : ''}`}
                    title={item.label}
                    onClick={() => {
                      setReuseFromId(current => (current === item.id ? null : item.id));
                      setPendingImage(null);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveMediaUrl(item.url) || ''} alt="" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </WamModal>

      {copyTarget && (
        <div
          className="wam-modal-backdrop"
          style={{ zIndex: 1200 }}
          onClick={() => { if (!copying) setCopyTarget(null); }}
          role="presentation"
        >
          <div className="wam-unsaved-dialog" style={{ textAlign: 'left' }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h4>Başka güne kopyala</h4>
            <p>
              <strong>{copyTarget.baslik}</strong> seçilen tarihe kopyalanır. Başlık, yayın ve görsel aynen gelir;
              tarihi ve saati değiştirebilirsiniz.
              {modalOpen && isDirty() ? ' Kaydedilmemiş düzenlemeler kopyaya dahil edilmez; önce Kaydet’e basın.' : ''}
            </p>
            <WamInput label="Yeni tarih" type="date" value={copyDate} onChange={e => setCopyDate(e.target.value)} />
            <div className="wam-form-grid">
              <WamInput label="Başlangıç" type="time" value={copySaat} onChange={e => setCopySaat(e.target.value)} />
              <WamInput label="Bitiş" type="time" value={copySaatBitis} onChange={e => setCopySaatBitis(e.target.value)} />
            </div>
            <div className="wam-unsaved-actions">
              <button type="button" className="wam-btn wam-btn-primary" disabled={copying} onClick={submitCopy}>
                {copying ? 'Kopyalanıyor…' : 'Kopyala'}
              </button>
              <button type="button" className="wam-btn wam-btn-ghost" disabled={copying} onClick={() => setCopyTarget(null)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kaydedilmemiş değişiklik uyarısı */}
      {showUnsaved && (
        <div
          className="wam-modal-backdrop"
          style={{ zIndex: 1100 }}
          onClick={() => { setShowUnsaved(false); setPendingTab(null); }}
          role="presentation"
        >
          <div className="wam-unsaved-dialog" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <div className="wam-unsaved-icon">⚠️</div>
            <h4>Kaydedilmemiş değişiklikler</h4>
            <p>Yaptığınız düzenlemeler henüz kaydedilmedi. Ne yapmak istersiniz?</p>
            <div className="wam-unsaved-actions">
              <button type="button" className="wam-btn wam-btn-primary" disabled={saving} onClick={save}>
                Kaydet
              </button>
              <button type="button" className="wam-btn wam-btn-danger" onClick={discardAndProceed}>
                Kaydetmeden Çık
              </button>
              <button type="button" className="wam-btn wam-btn-ghost" onClick={() => { setShowUnsaved(false); setPendingTab(null); }}>
                Düzenlemeye Dön
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
