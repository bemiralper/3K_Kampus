'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import { gorusmeService } from '@/app/admin/coaching/meetings/services/gorusme-api';
import KutuphaneConfirmModal from '@/components/kutuphane/KutuphaneConfirmModal';
import CoachActionSheet from '@/components/coach/CoachActionSheet';
import {
  type GorusmeCreatePayload,
  type KullaniciBilgi,
  GORUSME_TURLERI,
  GORUSME_DURUMLARI,
  GORUSME_YONTEMLERI,
  ONCELIK_SEVIYELERI,
  AKSIYON_SORUMLULARI,
} from '@/app/admin/coaching/meetings/types';

const ETIKET_ONERILERI = [
  'dikkat-eksikliği',
  'uyku-düzeni',
  'sınav-kaygısı',
  'motivasyon',
  'aile-sorunu',
  'çalışma-planı',
  'hedef-belirleme',
  'zaman-yönetimi',
  'sosyal-ilişkiler',
  'teknoloji-bağımlılığı',
];

const EMPTY_FORM: GorusmeCreatePayload = {
  kurum_id: 0,
  ogrenci_id: 0,
  koc_id: 0,
  gorusme_turu: 'ogrenci',
  diger_tur_aciklama: '',
  durum: 'planlandi',
  yontem: 'yuz_yuze',
  oncelik: 'normal',
  gorusme_tarihi: new Date().toISOString().slice(0, 10),
  gorusme_saati: null,
  sure_dakika: null,
  konu: '',
  notlar: '',
  motivasyon_skoru: null,
  akademik_ozguven_skoru: null,
  stres_seviyesi: null,
  etiketler: [],
  veli_ile_paylasilsin: false,
  veli_ozet: '',
  sonraki_gorusme_tarihi: null,
  send_whatsapp_reminder: true,
  aksiyonlar: [],
  hatirlatmalar: [],
};

const ADMIN_INP =
  'w-full px-3.5 py-3 bg-white border-2 border-gray-200/80 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 hover:border-gray-300';
const ADMIN_SEL =
  'w-full px-3.5 py-3 bg-white border-2 border-gray-200/80 rounded-xl text-[14px] text-gray-900 outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 hover:border-gray-300 appearance-none cursor-pointer';

const SCORE_COLORS = [
  { border: 'border-red-300', text: 'text-red-700', activeBg: 'bg-red-100', ring: 'shadow-red-200' },
  { border: 'border-orange-300', text: 'text-orange-700', activeBg: 'bg-orange-100', ring: 'shadow-orange-200' },
  { border: 'border-yellow-300', text: 'text-yellow-700', activeBg: 'bg-yellow-100', ring: 'shadow-yellow-200' },
  { border: 'border-emerald-300', text: 'text-emerald-700', activeBg: 'bg-emerald-100', ring: 'shadow-emerald-200' },
  { border: 'border-green-300', text: 'text-green-700', activeBg: 'bg-green-100', ring: 'shadow-green-200' },
];

function ScoreSelector({
  label,
  value,
  onChange,
  labels = ['Çok Düşük', 'Düşük', 'Orta', 'İyi', 'Çok İyi'],
  reverse = false,
  coachMode = false,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  labels?: string[];
  reverse?: boolean;
  coachMode?: boolean;
}) {
  const palette = reverse ? [...SCORE_COLORS].reverse() : SCORE_COLORS;
  if (coachMode) {
    return (
      <div className="coach-score-row">
        <div className="coach-score-label">{label}</div>
        <div className="coach-score-pills">
          {labels.map((lbl, i) => {
            const score = i + 1;
            const active = value === score;
            return (
              <button
                key={score}
                type="button"
                onClick={() => onChange(active ? null : score)}
                className={`coach-score-pill${active ? ' active' : ''}`}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((lbl, i) => {
          const score = i + 1;
          const active = value === score;
          const c = palette[i];
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange(active ? null : score)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all duration-150 border ${
                active
                  ? `${c.activeBg} ${c.border} ${c.text} shadow-sm ${c.ring}`
                  : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500'
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface GorusmeFormDrawerProps {
  mode: 'admin' | 'coach';
  initialStudentId?: number;
  initialCoachId?: number;
  studentName?: string;
  editId?: number | null;
  open?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function GorusmeFormDrawer({
  mode,
  initialStudentId,
  initialCoachId,
  studentName,
  editId: editIdProp = null,
  open = true,
  onClose,
  onSuccess,
}: GorusmeFormDrawerProps) {
  const { activeKurum } = useKurum();
  const kurumId = activeKurum?.id;
  const coachMode = mode === 'coach';

  const [editId, setEditId] = useState<number | null>(editIdProp);
  const [form, setForm] = useState<GorusmeCreatePayload>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const [ogrenciler, setOgrenciler] = useState<{ id: number; ad: string; soyad: string }[]>([]);
  const [koclar, setKoclar] = useState<{ id: number; teacher_full_name: string }[]>([]);
  const [kullaniciBilgi, setKullaniciBilgi] = useState<KullaniciBilgi | null>(null);

  const [newAksiyon, setNewAksiyon] = useState({ aciklama: '', sorumlu: 'ogrenci', deadline: '' });
  const [newHatirlatma, setNewHatirlatma] = useState({ mesaj: '', hatirlatma_tarihi: '', tip: 'genel' });

  const formInitialRef = useRef<string>('');

  const isCoachOnly = coachMode || (kullaniciBilgi ? kullaniciBilgi.is_coach && !kullaniciBilgi.is_admin : false);
  const lockedCoachId = coachMode
    ? initialCoachId ?? kullaniciBilgi?.coach_profile_id ?? null
    : null;
  const lockedStudentId = coachMode ? initialStudentId ?? null : null;

  const hasFormChanged = useCallback(
    () => JSON.stringify(form) !== formInitialRef.current,
    [form]
  );

  const tryClose = useCallback(() => {
    if (hasFormChanged()) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [hasFormChanged, onClose]);

  useEffect(() => {
    setEditId(editIdProp);
  }, [editIdProp]);

  useEffect(() => {
    gorusmeService.kullaniciBilgi().then(setKullaniciBilgi).catch(() => null);
  }, []);

  useEffect(() => {
    if (!kurumId || coachMode) return;
    const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

    if (isCoachOnly && kullaniciBilgi) {
      setOgrenciler(
        (kullaniciBilgi.assigned_students || []).map((s) => ({
          id: s.id,
          ad: s.ad,
          soyad: s.soyad,
        }))
      );
    } else {
      fetch(`${BACKEND}/ogrenciler/api/list/`, {
        credentials: 'include',
        headers: { 'X-Kurum-ID': String(kurumId) },
      })
        .then((r) => r.json())
        .then((d) => {
          const list = d.ogrenciler || d.results || d.data?.results || d || [];
          setOgrenciler(Array.isArray(list) ? list : []);
        })
        .catch(() => {});
    }

    fetch(`${BACKEND}/api/coaching/coaches/?is_active=true`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const list = d.data || d.results || d || [];
        setKoclar(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, [kurumId, kullaniciBilgi, isCoachOnly, coachMode]);

  useEffect(() => {
    if (!open) return;

    if (editId) {
      gorusmeService
        .get(editId)
        .then((detail) => {
          const editData: GorusmeCreatePayload = {
            kurum_id: kurumId || 0,
            ogrenci_id: detail.ogrenci,
            koc_id: detail.koc,
            gorusme_turu: detail.gorusme_turu,
            diger_tur_aciklama: detail.diger_tur_aciklama,
            durum: detail.durum,
            yontem: detail.yontem,
            oncelik: detail.oncelik,
            gorusme_tarihi: detail.gorusme_tarihi,
            gorusme_saati: detail.gorusme_saati,
            sure_dakika: detail.sure_dakika,
            konu: detail.konu,
            notlar: detail.notlar,
            motivasyon_skoru: detail.motivasyon_skoru,
            akademik_ozguven_skoru: detail.akademik_ozguven_skoru,
            stres_seviyesi: detail.stres_seviyesi,
            etiketler: detail.etiketler || [],
            veli_ile_paylasilsin: detail.veli_ile_paylasilsin,
            veli_ozet: detail.veli_ozet,
            sonraki_gorusme_tarihi: detail.sonraki_gorusme_tarihi,
            aksiyonlar: [],
            hatirlatmalar: [],
          };
          setForm(editData);
          formInitialRef.current = JSON.stringify(editData);
          setFormErrors({});
        })
        .catch(() => setError('Görüşme bilgisi alınamadı.'));
      return;
    }

    const initial: GorusmeCreatePayload = {
      ...EMPTY_FORM,
      kurum_id: kurumId || 0,
      ogrenci_id: lockedStudentId || 0,
      koc_id:
        lockedCoachId ||
        (isCoachOnly && kullaniciBilgi?.coach_profile_id ? kullaniciBilgi.coach_profile_id : 0),
    };
    setForm(initial);
    formInitialRef.current = JSON.stringify(initial);
    setFormErrors({});
    setError('');
  }, [open, editId, kurumId, lockedStudentId, lockedCoachId, isCoachOnly, kullaniciBilgi]);

  const addEtiket = (tag: string) => {
    const t = tag.toLowerCase().trim();
    if (!t || (form.etiketler || []).includes(t)) return;
    setForm({ ...form, etiketler: [...(form.etiketler || []), t] });
  };

  const removeEtiket = (tag: string) => {
    setForm({ ...form, etiketler: (form.etiketler || []).filter((e) => e !== tag) });
  };

  const addAksiyonToForm = () => {
    if (!newAksiyon.aciklama.trim()) return;
    setForm({
      ...form,
      aksiyonlar: [
        ...(form.aksiyonlar || []),
        {
          aciklama: newAksiyon.aciklama.trim(),
          sorumlu: newAksiyon.sorumlu,
          deadline: newAksiyon.deadline || null,
        },
      ],
    });
    setNewAksiyon({ aciklama: '', sorumlu: 'ogrenci', deadline: '' });
  };

  const removeAksiyonFromForm = (idx: number) => {
    setForm({
      ...form,
      aksiyonlar: (form.aksiyonlar || []).filter((_, i) => i !== idx),
    });
  };

  const addHatirlatmaToForm = () => {
    if (!newHatirlatma.mesaj.trim() || !newHatirlatma.hatirlatma_tarihi) return;
    setForm({
      ...form,
      hatirlatmalar: [
        ...(form.hatirlatmalar || []),
        {
          mesaj: newHatirlatma.mesaj.trim(),
          hatirlatma_tarihi: newHatirlatma.hatirlatma_tarihi,
          tip: newHatirlatma.tip,
        },
      ],
    });
    setNewHatirlatma({ mesaj: '', hatirlatma_tarihi: '', tip: 'genel' });
  };

  const removeHatirlatmaFromForm = (idx: number) => {
    setForm({
      ...form,
      hatirlatmalar: (form.hatirlatmalar || []).filter((_, i) => i !== idx),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setFormErrors({});
    setError('');

    const errs: Record<string, string> = {};
    if (!form.ogrenci_id) errs.ogrenci_id = 'Öğrenci seçiniz.';
    if (!form.koc_id && !isCoachOnly) errs.koc_id = 'Koç seçiniz.';
    if (!form.konu?.trim()) errs.konu = 'Konu giriniz.';
    if (!form.gorusme_tarihi) errs.gorusme_tarihi = 'Tarih seçiniz.';
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      setSaving(false);
      return;
    }

    try {
      const payload = {
        ...form,
        kurum_id: kurumId || 0,
        gorusme_saati: form.gorusme_saati || null,
        sure_dakika: form.sure_dakika || null,
        sonraki_gorusme_tarihi: form.sonraki_gorusme_tarihi || null,
        motivasyon_skoru: form.motivasyon_skoru || null,
        akademik_ozguven_skoru: form.akademik_ozguven_skoru || null,
        stres_seviyesi: form.stres_seviyesi || null,
        ...(lockedCoachId ? { koc_id: lockedCoachId } : {}),
        ...(isCoachOnly && kullaniciBilgi?.coach_profile_id
          ? { koc_id: kullaniciBilgi.coach_profile_id }
          : {}),
      };

      if (editId) {
        await gorusmeService.update(editId, payload);
      } else {
        await gorusmeService.create(payload);
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const e = err as { fieldErrors?: Record<string, string | string[]>; message?: string };
      if (e.fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [key, val] of Object.entries(e.fieldErrors)) {
          flat[key] = Array.isArray(val) ? val.join(', ') : String(val);
        }
        setFormErrors(flat);
      } else {
        setError(e.message || 'Kayıt başarısız.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const title = editId ? 'Görüşmeyi Düzenle' : 'Yeni Görüşme Kaydı';
  const subtitle = coachMode ? undefined : 'Koçluk görüşme bilgilerini girin.';

  const footer = (
    <>
      <button type="button" className="coach-btn coach-btn-secondary" onClick={tryClose}>
        İptal
      </button>
      <button
        type="button"
        className="coach-btn coach-btn-primary"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Kaydediliyor…' : editId ? 'Güncelle' : 'Kaydet'}
      </button>
    </>
  );

  const adminFooter = (
    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
      <button
        type="button"
        onClick={tryClose}
        className="px-5 py-2.5 bg-transparent border-2 border-gray-200 rounded-xl text-[14px] font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
      >
        İptal
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[14px] font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/25"
      >
        {saving ? 'Kaydediliyor...' : editId ? 'Güncelle' : 'Kaydet'}
      </button>
    </div>
  );

  const formFields = coachMode ? (
    <div className="coach-gorusme-form">
      <div className="coach-form-field">
        <label htmlFor="gf-konu">Görüşme Konusu *</label>
        <input
          id="gf-konu"
          value={form.konu}
          onChange={(e) => setForm({ ...form, konu: e.target.value })}
          placeholder="Görüşme konusu"
        />
        {formErrors.konu && <p className="coach-field-error">{formErrors.konu}</p>}
      </div>

      <div className="coach-form-row">
        <div className="coach-form-field">
          <label htmlFor="gf-tarih">Tarih *</label>
          <input
            id="gf-tarih"
            type="date"
            value={form.gorusme_tarihi}
            onChange={(e) => setForm({ ...form, gorusme_tarihi: e.target.value })}
          />
        </div>
        <div className="coach-form-field">
          <label htmlFor="gf-saat">Saat</label>
          <input
            id="gf-saat"
            type="time"
            value={form.gorusme_saati || ''}
            onChange={(e) => setForm({ ...form, gorusme_saati: e.target.value || null })}
          />
        </div>
      </div>

      <label className="coach-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={form.send_whatsapp_reminder !== false}
          onChange={(e) => setForm({ ...form, send_whatsapp_reminder: e.target.checked })}
        />
        <span>Veliye WhatsApp hatırlatması gönder</span>
      </label>

      <div className="coach-form-row">
        <div className="coach-form-field">
          <label htmlFor="gf-tur">Tür</label>
          <select
            id="gf-tur"
            value={form.gorusme_turu}
            onChange={(e) => setForm({ ...form, gorusme_turu: e.target.value })}
          >
            {GORUSME_TURLERI.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="coach-form-field">
          <label htmlFor="gf-yontem">Yöntem</label>
          <select
            id="gf-yontem"
            value={form.yontem}
            onChange={(e) => setForm({ ...form, yontem: e.target.value })}
          >
            {GORUSME_YONTEMLERI.map((y) => (
              <option key={y.value} value={y.value}>
                {y.icon} {y.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="coach-form-field">
        <label htmlFor="gf-not">Notlar</label>
        <textarea
          id="gf-not"
          rows={3}
          value={form.notlar || ''}
          onChange={(e) => setForm({ ...form, notlar: e.target.value })}
          placeholder="Görüşme notları"
        />
      </div>

      <div className="coach-form-section">
        <h3 className="coach-form-section-title">Öğrenci Durum Değerlendirmesi</h3>
        <ScoreSelector
          label="Motivasyon"
          value={form.motivasyon_skoru}
          onChange={(v) => setForm({ ...form, motivasyon_skoru: v })}
          coachMode
        />
        <ScoreSelector
          label="Akademik Özgüven"
          value={form.akademik_ozguven_skoru}
          onChange={(v) => setForm({ ...form, akademik_ozguven_skoru: v })}
          coachMode
        />
        <ScoreSelector
          label="Stres Seviyesi"
          value={form.stres_seviyesi}
          onChange={(v) => setForm({ ...form, stres_seviyesi: v })}
          labels={['Çok Düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok Yüksek']}
          reverse
          coachMode
        />
      </div>

      <div className="coach-form-field">
        <label>Etiketler</label>
        <div className="coach-tag-list">
          {(form.etiketler || []).map((e) => (
            <span key={e} className="coach-tag">
              #{e}
              <button type="button" onClick={() => removeEtiket(e)} aria-label={`${e} kaldır`}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="coach-tag-suggestions">
          {ETIKET_ONERILERI.filter((e) => !(form.etiketler || []).includes(e)).map((e) => (
            <button key={e} type="button" className="coach-tag-suggest" onClick={() => addEtiket(e)}>
              + {e}
            </button>
          ))}
        </div>
      </div>

      <div className="coach-form-section coach-form-section-amber">
        <label className="coach-checkbox-row">
          <input
            type="checkbox"
            checked={form.veli_ile_paylasilsin}
            onChange={(e) => setForm({ ...form, veli_ile_paylasilsin: e.target.checked })}
          />
          <span>Veli ile paylaşılsın</span>
        </label>
        {form.veli_ile_paylasilsin && (
          <div className="coach-form-field" style={{ marginTop: 10 }}>
            <label htmlFor="gf-veli">Veli İçin Özet</label>
            <textarea
              id="gf-veli"
              rows={2}
              value={form.veli_ozet || ''}
              onChange={(e) => setForm({ ...form, veli_ozet: e.target.value })}
              placeholder="Veliye gösterilecek özet"
            />
          </div>
        )}
      </div>

      {!editId && (
        <>
          <div className="coach-form-section">
            <h3 className="coach-form-section-title">Aksiyon Planı</h3>
            {(form.aksiyonlar || []).map((a, idx) => (
              <div key={idx} className="coach-inline-item">
                <span>{a.aciklama}</span>
                <button type="button" onClick={() => removeAksiyonFromForm(idx)} aria-label="Kaldır">
                  ×
                </button>
              </div>
            ))}
            <div className="coach-form-field">
              <input
                value={newAksiyon.aciklama}
                onChange={(e) => setNewAksiyon({ ...newAksiyon, aciklama: e.target.value })}
                placeholder="Yeni aksiyon maddesi"
              />
            </div>
            <div className="coach-form-row">
              <select
                value={newAksiyon.sorumlu}
                onChange={(e) => setNewAksiyon({ ...newAksiyon, sorumlu: e.target.value })}
                className="coach-form-field select-inline"
              >
                {AKSIYON_SORUMLULARI.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newAksiyon.deadline}
                onChange={(e) => setNewAksiyon({ ...newAksiyon, deadline: e.target.value })}
              />
              <button type="button" className="coach-btn coach-btn-secondary coach-btn-sm" onClick={addAksiyonToForm}>
                Ekle
              </button>
            </div>
          </div>

          <div className="coach-form-section">
            <h3 className="coach-form-section-title">Hatırlatmalar</h3>
            {(form.hatirlatmalar || []).map((h, idx) => (
              <div key={idx} className="coach-inline-item">
                <span>
                  {h.hatirlatma_tarihi}: {h.mesaj}
                </span>
                <button type="button" onClick={() => removeHatirlatmaFromForm(idx)} aria-label="Kaldır">
                  ×
                </button>
              </div>
            ))}
            <div className="coach-form-field">
              <input
                type="date"
                value={newHatirlatma.hatirlatma_tarihi}
                onChange={(e) =>
                  setNewHatirlatma({ ...newHatirlatma, hatirlatma_tarihi: e.target.value })
                }
              />
            </div>
            <div className="coach-form-row">
              <input
                value={newHatirlatma.mesaj}
                onChange={(e) => setNewHatirlatma({ ...newHatirlatma, mesaj: e.target.value })}
                placeholder="Hatırlatma mesajı"
              />
              <button type="button" className="coach-btn coach-btn-secondary coach-btn-sm" onClick={addHatirlatmaToForm}>
                Ekle
              </button>
            </div>
          </div>
        </>
      )}

      {(formErrors.genel || formErrors.non_field_errors || error) && (
        <p className="coach-drawer-error">{formErrors.genel || formErrors.non_field_errors || error}</p>
      )}
    </div>
  ) : (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
      {!isCoachOnly && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Öğrenci *
            </label>
            <select
              value={form.ogrenci_id || ''}
              onChange={(e) => setForm({ ...form, ogrenci_id: Number(e.target.value) })}
              className={ADMIN_SEL}
            >
              <option value="">Öğrenci seçin...</option>
              {ogrenciler.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.ad} {o.soyad}
                </option>
              ))}
            </select>
            {formErrors.ogrenci_id && (
              <p className="text-[11px] text-rose-500 mt-1">{formErrors.ogrenci_id}</p>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Koç *
            </label>
            <select
              value={form.koc_id || ''}
              onChange={(e) => setForm({ ...form, koc_id: Number(e.target.value) })}
              className={ADMIN_SEL}
            >
              <option value="">Koç seçin...</option>
              {koclar.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.teacher_full_name}
                </option>
              ))}
            </select>
            {formErrors.koc_id && (
              <p className="text-[11px] text-rose-500 mt-1">{formErrors.koc_id}</p>
            )}
          </div>
        </div>
      )}

      {isCoachOnly && (
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Öğrenci *
            </label>
            <select
              value={form.ogrenci_id || ''}
              onChange={(e) => setForm({ ...form, ogrenci_id: Number(e.target.value) })}
              className={ADMIN_SEL}
            >
              <option value="">Öğrenci seçin...</option>
              {ogrenciler.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.ad} {o.soyad}
                </option>
              ))}
            </select>
            {formErrors.ogrenci_id && (
              <p className="text-[11px] text-rose-500 mt-1">{formErrors.ogrenci_id}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Görüşme Türü *
          </label>
          <select
            value={form.gorusme_turu}
            onChange={(e) => setForm({ ...form, gorusme_turu: e.target.value })}
            className={ADMIN_SEL}
          >
            {GORUSME_TURLERI.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Yöntem
          </label>
          <select
            value={form.yontem}
            onChange={(e) => setForm({ ...form, yontem: e.target.value })}
            className={ADMIN_SEL}
          >
            {GORUSME_YONTEMLERI.map((y) => (
              <option key={y.value} value={y.value}>
                {y.icon} {y.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Öncelik
          </label>
          <select
            value={form.oncelik}
            onChange={(e) => setForm({ ...form, oncelik: e.target.value })}
            className={ADMIN_SEL}
          >
            {ONCELIK_SEVIYELERI.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {form.gorusme_turu === 'diger' && (
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Diğer Tür Açıklaması
          </label>
          <input
            type="text"
            value={form.diger_tur_aciklama || ''}
            onChange={(e) => setForm({ ...form, diger_tur_aciklama: e.target.value })}
            className={ADMIN_INP}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Tarih *
          </label>
          <input
            type="date"
            value={form.gorusme_tarihi}
            onChange={(e) => setForm({ ...form, gorusme_tarihi: e.target.value })}
            className={ADMIN_INP}
          />
          {formErrors.gorusme_tarihi && (
            <p className="text-[11px] text-rose-500 mt-1">{formErrors.gorusme_tarihi}</p>
          )}
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Saat
          </label>
          <input
            type="time"
            value={form.gorusme_saati || ''}
            onChange={(e) => setForm({ ...form, gorusme_saati: e.target.value || null })}
            className={ADMIN_INP}
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Süre (dk)
          </label>
          <input
            type="number"
            min="1"
            value={form.sure_dakika || ''}
            onChange={(e) =>
              setForm({ ...form, sure_dakika: e.target.value ? Number(e.target.value) : null })
            }
            className={ADMIN_INP}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 mt-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.send_whatsapp_reminder !== false}
          onChange={(e) => setForm({ ...form, send_whatsapp_reminder: e.target.checked })}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-[13px] text-gray-700">Veliye WhatsApp hatırlatması gönder</span>
      </label>

      {editId && (
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Durum
          </label>
          <div className="flex gap-2 flex-wrap">
            {GORUSME_DURUMLARI.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setForm({ ...form, durum: d.value })}
                className={`px-3 py-2 rounded-xl text-[12px] font-bold border-2 transition-all ${
                  form.durum === d.value
                    ? `${d.color} border-current`
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Görüşme Konusu *
        </label>
        <input
          type="text"
          value={form.konu}
          onChange={(e) => setForm({ ...form, konu: e.target.value })}
          className={ADMIN_INP}
        />
        {formErrors.konu && <p className="text-[11px] text-rose-500 mt-1">{formErrors.konu}</p>}
      </div>

      <div>
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Görüşme Notları
        </label>
        <textarea
          value={form.notlar || ''}
          onChange={(e) => setForm({ ...form, notlar: e.target.value })}
          rows={4}
          className={ADMIN_INP + ' resize-none'}
        />
      </div>

      <div className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-2xl p-4 border border-indigo-100/50 space-y-3">
        <h3 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">
          Öğrenci Durum Değerlendirmesi
        </h3>
        <ScoreSelector
          label="Motivasyon"
          value={form.motivasyon_skoru}
          onChange={(v) => setForm({ ...form, motivasyon_skoru: v })}
        />
        <ScoreSelector
          label="Akademik Özgüven"
          value={form.akademik_ozguven_skoru}
          onChange={(v) => setForm({ ...form, akademik_ozguven_skoru: v })}
        />
        <ScoreSelector
          label="Stres Seviyesi"
          value={form.stres_seviyesi}
          onChange={(v) => setForm({ ...form, stres_seviyesi: v })}
          labels={['Çok Düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok Yüksek']}
          reverse
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Etiketler
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(form.etiketler || []).map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-[12px] font-semibold"
            >
              #{e}
              <button type="button" onClick={() => removeEtiket(e)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {ETIKET_ONERILERI.filter((e) => !(form.etiketler || []).includes(e)).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => addEtiket(e)}
              className="px-2 py-1 rounded-md bg-gray-100 text-gray-500 text-[11px] hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              + {e}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-100/60 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.veli_ile_paylasilsin}
            onChange={(e) => setForm({ ...form, veli_ile_paylasilsin: e.target.checked })}
            className="w-4.5 h-4.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-[13px] font-semibold text-gray-700">Veli ile paylaşılsın</span>
        </label>
        {form.veli_ile_paylasilsin && (
          <div>
            <label className="block text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2">
              Veli İçin Özet Not
            </label>
            <textarea
              value={form.veli_ozet || ''}
              onChange={(e) => setForm({ ...form, veli_ozet: e.target.value })}
              rows={2}
              className={ADMIN_INP + ' resize-none'}
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Sonraki Görüşme Tarihi
        </label>
        <input
          type="date"
          value={form.sonraki_gorusme_tarihi || ''}
          onChange={(e) =>
            setForm({ ...form, sonraki_gorusme_tarihi: e.target.value || null })
          }
          className={ADMIN_INP}
        />
      </div>

      {!editId && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
              Aksiyon Planı (oluştururken)
            </h3>
            {(form.aksiyonlar || []).map((a, idx) => (
              <div key={idx} className="flex items-center justify-between text-[13px] bg-gray-50 rounded-lg px-3 py-2">
                <span>{a.aciklama}</span>
                <button type="button" onClick={() => removeAksiyonFromForm(idx)} className="text-rose-500">
                  ×
                </button>
              </div>
            ))}
            <div className="flex gap-2 flex-wrap">
              <input
                value={newAksiyon.aciklama}
                onChange={(e) => setNewAksiyon({ ...newAksiyon, aciklama: e.target.value })}
                placeholder="Aksiyon maddesi"
                className={ADMIN_INP + ' flex-1 min-w-[160px]'}
              />
              <select
                value={newAksiyon.sorumlu}
                onChange={(e) => setNewAksiyon({ ...newAksiyon, sorumlu: e.target.value })}
                className={ADMIN_SEL + ' w-auto'}
              >
                {AKSIYON_SORUMLULARI.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newAksiyon.deadline}
                onChange={(e) => setNewAksiyon({ ...newAksiyon, deadline: e.target.value })}
                className={ADMIN_INP + ' w-auto'}
              />
              <button
                type="button"
                onClick={addAksiyonToForm}
                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-[13px] font-semibold"
              >
                Ekle
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
              Hatırlatmalar (oluştururken)
            </h3>
            {(form.hatirlatmalar || []).map((h, idx) => (
              <div key={idx} className="flex items-center justify-between text-[13px] bg-gray-50 rounded-lg px-3 py-2">
                <span>
                  {h.hatirlatma_tarihi}: {h.mesaj}
                </span>
                <button type="button" onClick={() => removeHatirlatmaFromForm(idx)} className="text-rose-500">
                  ×
                </button>
              </div>
            ))}
            <div className="flex gap-2 flex-wrap">
              <input
                type="date"
                value={newHatirlatma.hatirlatma_tarihi}
                onChange={(e) =>
                  setNewHatirlatma({ ...newHatirlatma, hatirlatma_tarihi: e.target.value })
                }
                className={ADMIN_INP + ' w-auto'}
              />
              <input
                value={newHatirlatma.mesaj}
                onChange={(e) => setNewHatirlatma({ ...newHatirlatma, mesaj: e.target.value })}
                placeholder="Hatırlatma mesajı"
                className={ADMIN_INP + ' flex-1 min-w-[160px]'}
              />
              <button
                type="button"
                onClick={addHatirlatmaToForm}
                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-[13px] font-semibold"
              >
                Ekle
              </button>
            </div>
          </div>
        </>
      )}

      {(formErrors.genel || formErrors.non_field_errors || error) && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-[13px]">
          {formErrors.genel || formErrors.non_field_errors || error}
        </div>
      )}
    </div>
  );

  const confirmModal = (
    <KutuphaneConfirmModal
      open={showDiscardConfirm}
      title="Kaydedilmemiş değişiklikler"
      message="Kaydedilmemiş değişiklikler var. Çıkmak istediğinize emin misiniz?"
      confirmLabel="Çık"
      cancelLabel="Devam et"
      tone="warning"
      onConfirm={() => {
        setShowDiscardConfirm(false);
        onClose();
      }}
      onCancel={() => setShowDiscardConfirm(false)}
    />
  );

  if (coachMode) {
    return (
      <>
        <CoachActionSheet
          title={editId ? 'Görüşmeyi Düzenle' : 'Görüşme Ekle'}
          subtitle={subtitle}
          studentName={studentName}
          onClose={tryClose}
          footer={footer}
        >
          {formFields}
        </CoachActionSheet>
        {confirmModal}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-gray-950/40 backdrop-blur-sm z-[150]" onClick={tryClose} />
      <div className="fixed inset-y-0 right-0 z-[200] w-full max-w-[640px] flex flex-col bg-white shadow-2xl shadow-gray-900/20">
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-gray-200"
          style={{ background: 'linear-gradient(135deg, #eef2ff, #fff)' }}
        >
          <div>
            <h2 className="text-[17px] font-bold text-gray-900">{title}</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={tryClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-all"
          >
            ×
          </button>
        </div>
        {formFields}
        {adminFooter}
      </div>
      {confirmModal}
    </>
  );
}
