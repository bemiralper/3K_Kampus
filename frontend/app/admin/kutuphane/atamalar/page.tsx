'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchLibraries, fetchSeats,
  createSeatAssignment, endSeatAssignment,
  fetchLockers,
  createLockerAssignment, endLockerAssignment,
  fetchStudentResources, toggleLockerKey,
  type Library, type Seat, type Locker,
  type StudentResource,
} from '@/lib/kutuphane-api';
import { searchKutuphaneStudents } from '@/lib/kutuphane-student-search';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';
import KutuphaneConfirmModal from '@/components/kutuphane/KutuphaneConfirmModal';
import KutuphaneToast from '@/components/kutuphane/KutuphaneToast';

interface OgrenciItem {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  sinif_ad?: string;
  profil_foto?: string | null;
}

const ATAMA_TIPI_OPTIONS = [
  { value: 'KALICI', label: 'Kalıcı' },
  { value: 'GECICI', label: 'Geçici' },
  { value: 'DONEMLIK', label: 'Dönemlik' },
];

/* ═══════════════════════════════════════════════════════════════════
   Searchable Student Dropdown
   ═══════════════════════════════════════════════════════════════════ */
function StudentSearchDropdown({
  selected,
  onSelect,
  onClear,
  coachMode = false,
}: {
  selected: OgrenciItem | null;
  onSelect: (o: OgrenciItem) => void;
  onClear: () => void;
  coachMode?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OgrenciItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await searchKutuphaneStudents(query, coachMode);
        setResults(list as OgrenciItem[]);
      } catch {} finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, coachMode]);

  if (selected) {
    return (
      <div className="student-selected-card">
        <div className="student-avatar-row">
          {selected.profil_foto ? (
            <img src={selected.profil_foto} alt={selected.tam_ad || `${selected.ad} ${selected.soyad}`}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #22c55e' }} />
          ) : (
            <div className="avatar-circle avatar-green">
              {(selected.tam_ad || `${selected.ad} ${selected.soyad}`).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="student-name-text">{selected.tam_ad || `${selected.ad} ${selected.soyad}`}</div>
            {selected.sinif_ad && <div className="student-class-sub">{selected.sinif_ad}</div>}
          </div>
        </div>
        <button onClick={onClear} className="btn-close-small">✕</button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
          style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text" placeholder="Öğrenci adı veya TC ile arayın..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="search-input-with-icon"
        />
        {loading && <div className="spinner-small" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />}
      </div>

      {open && results.length > 0 && (
        <div className="dropdown-panel">
          {results.map((o) => (
            <button key={o.id}
              onClick={() => { onSelect(o); setQuery(''); setResults([]); setOpen(false); }}
              className="dropdown-item">
              {o.profil_foto ? (
                <img src={o.profil_foto} alt={o.tam_ad || `${o.ad} ${o.soyad}`}
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e5e7eb' }} />
              ) : (
                <div className="avatar-circle avatar-indigo" style={{ width: 32, height: 32, fontSize: 13 }}>
                  {(o.tam_ad || `${o.ad} ${o.soyad}`).charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: '#111827' }}>{o.tam_ad || `${o.ad} ${o.soyad}`}</div>
                {o.sinif_ad && <div style={{ fontSize: '12px', color: '#6b7280' }}>{o.sinif_ad}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="dropdown-panel" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>🔍</div>
          <span style={{ color: '#6b7280', fontSize: 13 }}>&quot;{query}&quot; ile eşleşen öğrenci bulunamadı</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Resource Card  (masa / dolap picker)
   ═══════════════════════════════════════════════════════════════════ */
function ResourceCard({ type, items, selectedId, onSelect, emptyText }: {
  type: 'seat' | 'locker'; items: any[]; selectedId: string; onSelect: (id: string) => void; emptyText: string;
}) {
  const [q, setQ] = useState('');
  const filtered = items.filter(i => {
    if (!q) return true;
    const no = type === 'seat' ? (i.masa_no || '') : (i.dolap_no || '');
    return no.toLowerCase().includes(q.toLowerCase());
  });
  const avail = items.filter((i: any) => i.durum === 'AVAILABLE').length;

  if (items.length === 0) return (
    <div className="empty-resource-box">
      <div style={{ fontSize: 24, marginBottom: 4 }}>{type === 'seat' ? '🪑' : '🔒'}</div>
      <div style={{ fontSize: 13 }}>{emptyText}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input type="text" placeholder={type === 'seat' ? 'Masa no ara...' : 'Dolap no ara...'}
          value={q} onChange={(e) => setQ(e.target.value)} className="resource-search-input" />
        <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{avail} müsait / {items.length} toplam</span>
      </div>
      <div className="resource-grid">
        {filtered.map((item: any) => {
          const occupied = item.durum !== 'AVAILABLE';
          const id = String(item.id);
          const sel = selectedId === id;
          const no = type === 'seat' ? item.masa_no : item.dolap_no;
          const owner = type === 'seat' ? (item.aktif_atama?.ogrenci_adi || '') : (item.atanan_ogrenci || '');
          return (
            <button key={item.id} disabled={occupied}
              onClick={() => onSelect(sel ? '' : id)}
              className={`resource-btn ${sel ? 'selected' : ''} ${occupied ? 'occupied' : ''}`}>
              {sel && <div className="check-badge">✓</div>}
              <div className="resource-no">{no}</div>
              {type === 'seat' && <div className="resource-meta">{item.masa_tipi}{item.priz_var_mi ? ' ⚡' : ''}{item.lamba_var_mi ? ' 💡' : ''}</div>}
              {type === 'locker' && <div className="resource-meta">{item.boyut} • {item.kilit_tipi}</div>}
              {occupied && owner && <div className="resource-owner">👤 {owner}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Summary Card — Clickable filter
   ═══════════════════════════════════════════════════════════════════ */
function SummaryCard({ icon, label, value, gradient, active, onClick, subtitle }: {
  icon: string; label: string; value: number; gradient: string; active: boolean; onClick: () => void; subtitle?: string;
}) {
  return (
    <button onClick={onClick} className={`stat-card ${active ? 'active' : ''}`}>
      <div className="stat-card-deco" style={{ background: gradient.replace('1)', '0.12)') }} />
      <div className="stat-card-icon" style={{ background: gradient }}>{icon}</div>
      <div className="stat-card-body">
        <div className="stat-card-value">{value}</div>
        <div className="stat-card-label">{label}</div>
        {subtitle && <div className="stat-card-sub">{subtitle}</div>}
      </div>
      {active && <div className="stat-card-check" style={{ background: gradient }}>✓</div>}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function AtamalarPage() {
  const { href, isCoachMode, portalHomeHref, portalHomeLabel } = useKutuphanePath();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [students, setStudents] = useState<StudentResource[]>([]);
  const [studentFilter, setStudentFilter] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentSummary, setStudentSummary] = useState<any>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'masa' | 'dolap' | 'both'>('both');
  const [modalLibrary, setModalLibrary] = useState('');
  const [allSeats, setAllSeats] = useState<Seat[]>([]);
  const [allLockers, setAllLockers] = useState<Locker[]>([]);
  const [selectedOgrenci, setSelectedOgrenci] = useState<OgrenciItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    seat_id: '', locker_id: '', atama_tipi: 'KALICI',
    baslangic_tarihi: new Date().toISOString().split('T')[0],
    bitis_tarihi: '', notlar: '', depozit_odendi: false, anahtar_verildi: false,
  });
  const [step, setStep] = useState(1);

  // Key warning
  const [showKeyWarning, setShowKeyWarning] = useState<{ show: boolean; assignmentId: string | null }>({ show: false, assignmentId: null });
  const [keyConfirmed, setKeyConfirmed] = useState(false);
  const [endSeatConfirm, setEndSeatConfirm] = useState<{ salonId: string; atamaId: string } | null>(null);
  const [endingSeat, setEndingSeat] = useState(false);
  const [endLockerConfirmId, setEndLockerConfirmId] = useState<string | null>(null);
  const [endingLocker, setEndingLocker] = useState(false);

  /* ── Load libraries */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchLibraries();
        if (res.success && res.data) setLibraries(Array.isArray(res.data) ? res.data : []);
        else setErrorMsg(res.error || 'Salonlar yüklenemedi');
      } catch { setErrorMsg('Salonlar yüklenirken hata'); }
      finally { setLoading(false); }
    })();
  }, []);

  /* ── Load students */
  const loadStudents = useCallback(async () => {
    setLoading(true); setErrorMsg('');
    try {
      const res = await fetchStudentResources({ filtre: studentFilter, search: studentSearch });
      if (res.success && res.data) {
        setStudents(Array.isArray(res.data.students) ? res.data.students : []);
        setStudentSummary(res.data.summary || null);
      } else { setStudents([]); setErrorMsg(res.error || 'Öğrenciler yüklenemedi'); }
    } catch { setStudents([]); setErrorMsg('Öğrenciler yüklenirken hata'); }
    finally { setLoading(false); }
  }, [studentFilter, studentSearch]);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => { if (successMsg) { const t = setTimeout(() => setSuccessMsg(''), 4000); return () => clearTimeout(t); } }, [successMsg]);

  /* ── Open modal */
  const openModal = async (mode: 'masa' | 'dolap' | 'both', prefill?: { id: number; tam_ad: string; sinif_ad?: string }) => {
    setModalMode(mode); setShowModal(true);
    setStep(prefill ? 2 : 1);
    setSelectedOgrenci(prefill ? { id: prefill.id, ad: '', soyad: '', tam_ad: prefill.tam_ad, sinif_ad: prefill.sinif_ad } : null);
    setFormData({ seat_id: '', locker_id: '', atama_tipi: 'KALICI', baslangic_tarihi: new Date().toISOString().split('T')[0], bitis_tarihi: '', notlar: '', depozit_odendi: false, anahtar_verildi: false });
    setModalLibrary('');
    setAllSeats([]);
    const proms: Promise<void>[] = [];
    if (mode === 'dolap' || mode === 'both') proms.push(fetchLockers().then(r => setAllLockers(r.success && r.data ? (Array.isArray(r.data) ? r.data : []) : [])));
    await Promise.all(proms);
  };

  const handleLibraryChange = async (id: string) => {
    setModalLibrary(id); setFormData(p => ({ ...p, seat_id: '' }));
    if (id) { const r = await fetchSeats(id); setAllSeats(r.success && r.data ? (Array.isArray(r.data) ? r.data : []) : []); }
    else setAllSeats([]);
  };

  /* ── Submit */
  const handleSubmit = async () => {
    if (!selectedOgrenci) return alert('Lütfen bir öğrenci seçin');
    const hasSeat = formData.seat_id && modalLibrary;
    const hasLocker = formData.locker_id;
    if (!hasSeat && !hasLocker) return alert('Lütfen en az bir masa veya dolap seçin');
    setSaving(true);
    const ok: string[] = [], err: string[] = [];
    try {
      if (hasSeat) { const r = await createSeatAssignment(modalLibrary, { masa_id: formData.seat_id, ogrenci_id: selectedOgrenci.id, atama_tipi: formData.atama_tipi, baslangic_tarihi: formData.baslangic_tarihi, bitis_tarihi: formData.bitis_tarihi || undefined, notlar: formData.notlar || undefined }); r.success ? ok.push('Masa ataması ✅') : err.push(`Masa: ${r.error || 'Hata'}`); }
      if (hasLocker) { const r = await createLockerAssignment({ dolap_id: formData.locker_id, ogrenci_id: selectedOgrenci.id, atama_tipi: formData.atama_tipi, baslangic_tarihi: formData.baslangic_tarihi, bitis_tarihi: formData.bitis_tarihi || undefined, depozit_odendi: formData.depozit_odendi, anahtar_verildi: formData.anahtar_verildi, notlar: formData.notlar || undefined }); r.success ? ok.push('Dolap ataması ✅') : err.push(`Dolap: ${r.error || 'Hata'}`); }
      if (ok.length) { setShowModal(false); setSuccessMsg(`✅ ${selectedOgrenci.tam_ad}: ${ok.join(', ')}`); loadStudents(); }
      if (err.length) alert(err.join('\n'));
    } catch { alert('İşlem sırasında hata oluştu'); } finally { setSaving(false); }
  };

  /* ── Actions */
  const handleEndSeat = (salonId: string, atamaId: string) => {
    setEndSeatConfirm({ salonId, atamaId });
  };

  const confirmEndSeat = async () => {
    if (!endSeatConfirm) return;
    setEndingSeat(true);
    try {
      const r = await endSeatAssignment(endSeatConfirm.salonId, endSeatConfirm.atamaId);
      if (r.success) {
        setSuccessMsg('Masa ataması sonlandırıldı');
        loadStudents();
      } else {
        alert(r.error || 'Hata');
      }
    } finally {
      setEndingSeat(false);
      setEndSeatConfirm(null);
    }
  };

  const handleEndLocker = (atamaId: string, anahtarVerildi?: boolean) => {
    if (anahtarVerildi) {
      setShowKeyWarning({ show: true, assignmentId: atamaId });
      setKeyConfirmed(false);
      return;
    }
    setEndLockerConfirmId(atamaId);
  };

  const confirmEndLockerSimple = async () => {
    if (!endLockerConfirmId) return;
    setEndingLocker(true);
    try {
      const r = await endLockerAssignment(endLockerConfirmId);
      if (r.success) {
        setSuccessMsg('Dolap ataması sonlandırıldı');
        loadStudents();
      } else {
        setErrorMsg(r.error || 'Hata');
      }
    } finally {
      setEndingLocker(false);
      setEndLockerConfirmId(null);
    }
  };

  const confirmEndLockerWithKey = async () => {
    if (!showKeyWarning.assignmentId) return;
    setEndingLocker(true);
    try {
      const r = await endLockerAssignment(showKeyWarning.assignmentId);
      if (r.success) {
        setSuccessMsg('Dolap ataması sonlandırıldı');
        loadStudents();
      } else {
        setErrorMsg(r.error || 'Hata');
      }
    } finally {
      setEndingLocker(false);
      setShowKeyWarning({ show: false, assignmentId: null });
      setKeyConfirmed(false);
    }
  };

  const handleToggleKey = async (atamaId: string) => {
    const r = await toggleLockerKey(atamaId);
    r.success ? (setSuccessMsg(r.data?.anahtar_verildi ? '🔑 Anahtar verildi' : '🔑 Anahtar geri alındı'), loadStudents()) : alert(r.error || 'Hata');
  };

  const canGoNext = step === 1 ? !!selectedOgrenci : step === 2 ? (!!formData.seat_id || !!formData.locker_id) : true;
  const sm = studentSummary || { toplam: 0, masa_var: 0, dolap_var: 0, ikisi_var: 0 };
  const hicbiriYok = sm.toplam - sm.masa_var - sm.dolap_var + sm.ikisi_var;

  return (
    <div className="atamalar-page">
      <style>{`
        /* ─── Animations ─── */
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

        .atamalar-page { padding: 0; }

        /* ─── Spinner ─── */
        .spinner-small { width: 18px; height: 18px; border: 2px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.6s linear infinite; }
        .spinner-large { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }

        /* ─── Student Selected Card ─── */
        .student-selected-card { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background-color: #f0fdf4; border-radius: 12px; border: 2px solid #86efac; }
        .student-avatar-row { display: flex; align-items: center; gap: 12px; }
        .avatar-circle { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 14px; flex-shrink: 0; }
        .avatar-green { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .avatar-indigo { background: linear-gradient(135deg, #818cf8, #6366f1); }
        .avatar-blue { background: linear-gradient(135deg, #60a5fa, #3b82f6); }
        .avatar-gray { background: linear-gradient(135deg, #e5e7eb, #d1d5db); }
        .hidden-avatar { display: none !important; }
        .student-name-text { font-weight: 600; font-size: 14px; color: #166534; }
        .student-class-sub { font-size: 12px; color: #16a34a; margin-top: 1px; }
        .btn-close-small { width: 28px; height: 28px; border-radius: 50%; border: none; background-color: #fecaca; color: #dc2626; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; transition: all 0.15s; }
        .btn-close-small:hover { background-color: #fca5a5; }

        /* ─── Search Input ─── */
        .search-input-with-icon { width: 100%; padding: 12px 14px 12px 42px; border-radius: 12px; border: 2px solid #e5e7eb; font-size: 14px; box-sizing: border-box; background-color: #f9fafb; outline: none; transition: all 0.2s; }
        .search-input-with-icon:focus { border-color: #3b82f6; background-color: #fff; }

        /* ─── Dropdown ─── */
        .dropdown-panel { position: absolute; bottom: calc(100% + 6px); left: 0; right: 0; z-index: 9999; background-color: #fff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,0.12); max-height: 220px; overflow-y: auto; }
        .dropdown-item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px 14px; border: none; background: none; cursor: pointer; font-size: 14px; transition: background 0.1s; }
        .dropdown-item:hover { background-color: #f3f4ff; }

        /* ─── Resource Picker ─── */
        .empty-resource-box { padding: 20px; text-align: center; color: #9ca3af; background-color: #f9fafb; border-radius: 12px; border: 2px dashed #e5e7eb; }
        .resource-search-input { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid #e5e7eb; font-size: 13px; background-color: #f9fafb; outline: none; box-sizing: border-box; }
        .resource-grid { max-height: 200px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px; padding: 2px; }
        .resource-btn { padding: 10px 8px; border-radius: 10px; border: 2px solid #e5e7eb; background: #fff; cursor: pointer; text-align: center; transition: all 0.15s; position: relative; }
        .resource-btn:hover:not(:disabled) { border-color: #93c5fd; background-color: #f0f7ff; }
        .resource-btn.selected { border-color: #3b82f6; background-color: #eff6ff; }
        .resource-btn.occupied { border-color: #fecaca; background-color: #fef2f2; cursor: not-allowed; opacity: 0.65; }
        .check-badge { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
        .resource-no { font-size: 15px; font-weight: 700; color: #111827; }
        .resource-btn.occupied .resource-no { color: #ef4444; }
        .resource-meta { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .resource-owner { font-size: 10px; color: #ef4444; margin-top: 3px; font-weight: 500; }

        /* ─── Stat Cards ─── */
        .stat-cards-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 18px; }
        @media (max-width: 1280px) { .stat-cards-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 768px) { .stat-cards-grid { grid-template-columns: repeat(2, 1fr); } }

        .stat-card { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; border: 1.5px solid transparent; background: #fff; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; text-align: left; width: 100%; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
        .stat-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); transform: translateY(-1px); }
        .stat-card.active { border-color: currentColor; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
        .stat-card-deco { position: absolute; top: -16px; right: -16px; width: 56px; height: 56px; border-radius: 50%; pointer-events: none; }
        .stat-card-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .stat-card-body { flex: 1; min-width: 0; position: relative; z-index: 1; }
        .stat-card-value { font-size: 20px; font-weight: 800; line-height: 1.1; color: #111827; }
        .stat-card.active .stat-card-value { color: inherit; }
        .stat-card-label { font-size: 11px; font-weight: 600; color: #6b7280; margin-top: 1px; }
        .stat-card.active .stat-card-label { color: inherit; }
        .stat-card-sub { font-size: 10px; color: #9ca3af; margin-top: 1px; }
        .stat-card-check { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 700; flex-shrink: 0; }

        /* ─── Filter Bar ─── */
        .filter-bar { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; padding: 14px 18px; background: #fff; border-radius: 14px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .filter-search { position: relative; flex: 1; min-width: 220px; max-width: 380px; }
        .filter-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .filter-search input { width: 100%; padding: 10px 14px 10px 38px; border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: 14px; background: #f9fafb; outline: none; box-sizing: border-box; transition: border-color 0.2s; }
        .filter-search input:focus { border-color: #3b82f6; }
        .filter-select { padding: 10px 14px; border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: 14px; background: #f9fafb; min-width: 180px; color: #374151; cursor: pointer; outline: none; }
        .filter-refresh { padding: 10px 18px; border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: 14px; cursor: pointer; background: #fff; color: #374151; font-weight: 500; display: flex; align-items: center; gap: 6px; transition: all 0.15s; }
        .filter-refresh:hover { background: #f3f4f6; }
        .filter-count { margin-left: auto; font-size: 13px; color: #9ca3af; font-weight: 500; }

        /* ─── Table ─── */
        .student-table-wrap { background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .student-table { width: 100%; border-collapse: collapse; }
        .student-table thead th { padding: 14px 18px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }
        .student-table thead th:last-child { text-align: right; }
        .student-table tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.15s; animation: fadeIn 0.25s ease both; }
        .student-table tbody tr:hover { background: #f8fafc; }
        .student-table tbody td { padding: 14px 18px; vertical-align: middle; }
        .student-table tbody td:last-child { text-align: right; }

        /* ─── Badges ─── */
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; }
        .badge-blue { background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #1d4ed8; border: 1px solid #bfdbfe; }
        .badge-green { background: linear-gradient(135deg, #f0fdf4, #dcfce7); color: #15803d; border: 1px solid #86efac; }
        .badge-class { display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; background: #f1f5f9; color: #475569; }

        /* ─── Action Buttons ─── */
        .btn-assign { padding: 6px 14px; border-radius: 10px; border: 1px dashed; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s; }
        .btn-assign-blue { background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #2563eb; border-color: #93c5fd; }
        .btn-assign-blue:hover { border-style: solid; background: linear-gradient(135deg, #dbeafe, #bfdbfe); }
        .btn-assign-green { background: linear-gradient(135deg, #f0fdf4, #dcfce7); color: #16a34a; border-color: #86efac; }
        .btn-assign-green:hover { border-style: solid; background: linear-gradient(135deg, #dcfce7, #bbf7d0); }

        .btn-key { padding: 4px 10px; border-radius: 8px; border: 1.5px solid; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s; }
        .btn-key-yes { background: #fef3c7; border-color: #fde68a; color: #92400e; }
        .btn-key-no { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

        .btn-remove { padding: 5px 12px; border-radius: 8px; border: 1px solid; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s; }
        .btn-remove-warn { background: #fffbeb; border-color: #fde68a; color: #b45309; }
        .btn-remove-warn:hover { background: #fef3c7; }
        .btn-remove-danger { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .btn-remove-danger:hover { background: #fee2e2; }

        /* ─── Modal ─── */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-card { background: #fff; border-radius: 20px; width: 620px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0,0,0,0.2); animation: slideUp 0.3s ease; }
        .modal-header { padding: 24px 28px 20px; border-bottom: 1px solid #f3f4f6; background: linear-gradient(135deg, #f8faff, #f0f4ff); }
        .modal-body { padding: 24px 28px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 16px 28px 20px; border-top: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; background: #fafbfc; }

        .stepper-row { display: flex; align-items: center; gap: 0; }
        .stepper-step { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 12px; border-radius: 8px; transition: all 0.2s; }
        .stepper-step.current { background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .stepper-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; transition: all 0.2s; }
        .stepper-num.done { background: #22c55e; color: #fff; }
        .stepper-num.active { background: #3b82f6; color: #fff; }
        .stepper-num.pending { background: #e5e7eb; color: #9ca3af; }
        .stepper-line { flex: 1; height: 2px; margin: 0 4px; border-radius: 1px; transition: all 0.3s; }

        .btn-primary { padding: 10px 24px; border-radius: 10px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; transition: all 0.15s; box-shadow: 0 2px 8px rgba(59,130,246,0.3); }
        .btn-primary:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; box-shadow: none; }
        .btn-success { padding: 10px 28px; border-radius: 10px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; transition: all 0.15s; box-shadow: 0 2px 8px rgba(34,197,94,0.3); }
        .btn-success:disabled { background: #94a3b8; color: #fff; opacity: 0.7; cursor: not-allowed; }
        .btn-ghost { padding: 10px 20px; border-radius: 10px; border: 1px solid #d1d5db; font-size: 14px; font-weight: 500; cursor: pointer; background: #fff; color: #374151; }
        .btn-ghost:hover { background: #f3f4f6; }
        .btn-close-circle { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f3f4f6; color: #6b7280; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.15s; }
        .btn-close-circle:hover { background: #e5e7eb; }

        /* ─── Key Warning Modal ─── */
        .modal-overlay-top { z-index: 1100; background: rgba(0,0,0,0.5); }

        /* ─── Empty State ─── */
        .empty-state { padding: 64px 24px; text-align: center; }
        .empty-icon { width: 80px; height: 80px; border-radius: 20px; background: linear-gradient(135deg, #eff6ff, #dbeafe); display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 20px; }

        /* ─── Toast ─── */
        .toast { margin-bottom: 20px; padding: 14px 20px; border-radius: 14px; font-size: 14px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; animation: fadeIn 0.3s ease; }
        .toast-success { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #86efac; color: #166534; }
        .toast-error { background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #fca5a5; color: #991b1b; }
        .toast button { background: none; border: none; cursor: pointer; font-size: 18px; padding: 0 4px; color: inherit; }

        /* ─── Atama tipi toggle ─── */
        .atama-tipi-group { display: flex; gap: 8px; }
        .atama-tipi-btn { flex: 1; padding: 10px; border-radius: 10px; border: 2px solid #e5e7eb; background: #fff; color: #374151; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .atama-tipi-btn.active { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; font-weight: 600; }

        /* ─── Form ─── */
        .form-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .form-input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 2px solid #e5e7eb; font-size: 14px; box-sizing: border-box; outline: none; background: #f9fafb; transition: border-color 0.2s; }
        .form-input:focus { border-color: #3b82f6; background: #fff; }
      `}</style>

      {/* ═══ HERO HEADER ═══ */}
      <div className="hero-header" style={{ marginBottom: 28 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          </div>
          <div className="hero-text">
            <h1>Öğrenci Atamaları</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>{portalHomeLabel}</a><span>/</span>
              <a href={href()}>Kütüphane</a><span>/</span><span>Öğrenci Atamaları</span>
            </div>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={() => openModal('both')} disabled={libraries.length === 0}
            style={{
              padding: '12px 24px',
              background: libraries.length > 0 ? 'linear-gradient(135deg, #0061a6, #004d85)' : '#e5e7eb',
              color: libraries.length > 0 ? '#fff' : '#9ca3af',
              borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600,
              cursor: libraries.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: libraries.length > 0 ? '0 4px 14px rgba(0,97,166,0.3)' : 'none',
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Yeni Atama
          </button>
        </div>
      </div>

      {/* ═══ TOAST MESSAGES (fixed — layout shift yok) ═══ */}
      {(successMsg || errorMsg) && (
        <KutuphaneToast
          message={successMsg || errorMsg}
          type={successMsg ? 'success' : 'error'}
          onClose={() => {
            setSuccessMsg('');
            setErrorMsg('');
          }}
        />
      )}

      {/* ═══ STAT CARDS ═══ */}
      <div className="stat-cards-grid">
        <SummaryCard icon="👥" label="Toplam Öğrenci" value={sm.toplam}
          gradient="linear-gradient(135deg, #818cf8, #6366f1)"
          active={studentFilter === 'all'} onClick={() => setStudentFilter('all')} />
        <SummaryCard icon="🪑" label="Masası Var" value={sm.masa_var}
          gradient="linear-gradient(135deg, #60a5fa, #3b82f6)"
          active={studentFilter === 'masa_var'}
          onClick={() => setStudentFilter(studentFilter === 'masa_var' ? 'all' : 'masa_var')}
          subtitle={`${sm.toplam - sm.masa_var} öğrencide yok`} />
        <SummaryCard icon="🔒" label="Dolabı Var" value={sm.dolap_var}
          gradient="linear-gradient(135deg, #34d399, #10b981)"
          active={studentFilter === 'dolap_var'}
          onClick={() => setStudentFilter(studentFilter === 'dolap_var' ? 'all' : 'dolap_var')}
          subtitle={`${sm.toplam - sm.dolap_var} öğrencide yok`} />
        <SummaryCard icon="✅" label="İkisi de Var" value={sm.ikisi_var}
          gradient="linear-gradient(135deg, #fbbf24, #f59e0b)"
          active={studentFilter === 'ikisi_var'}
          onClick={() => setStudentFilter(studentFilter === 'ikisi_var' ? 'all' : 'ikisi_var')} />
        <SummaryCard icon="⚠️" label="Hiçbiri Yok" value={hicbiriYok}
          gradient="linear-gradient(135deg, #f87171, #ef4444)"
          active={studentFilter === 'ikisi_yok'}
          onClick={() => setStudentFilter(studentFilter === 'ikisi_yok' ? 'all' : 'ikisi_yok')} />
      </div>

      {/* ═══ FILTER BAR ═══ */}
      <div className="filter-bar">
        <div className="filter-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="İsim ile öğrenci ara..."
            value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
          <option value="all">👥 Tüm Öğrenciler</option>
          <option value="masa_yok">🪑 Masası Olmayanlar</option>
          <option value="dolap_yok">🔒 Dolabı Olmayanlar</option>
          <option value="ikisi_yok">⚠️ Hiçbiri Olmayanlar</option>
          <option value="masa_var">🪑 Masası Olanlar</option>
          <option value="dolap_var">🔒 Dolabı Olanlar</option>
          <option value="ikisi_var">✅ İkisi de Olanlar</option>
        </select>
        <button className="filter-refresh" onClick={() => loadStudents()} disabled={loading}>🔄 Yenile</button>
        <div className="filter-count">{students.length} öğrenci listeleniyor</div>
      </div>

      {/* ═══ STUDENT TABLE ═══ */}
      <div className="student-table-wrap">
        {loading ? (
          <div style={{ padding: 64, textAlign: 'center', color: '#6b7280' }}>
            <div className="spinner-large" />
            <div style={{ fontSize: 15, fontWeight: 500 }}>Öğrenciler yükleniyor...</div>
          </div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Öğrenci bulunamadı</h3>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
              Filtrelere uygun öğrenci yok veya henüz hiçbir öğrenciye kaynak atanmamış.
            </p>
            <button onClick={() => openModal('both')}
              style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #0061a6, #004d85)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,97,166,0.3)' }}>
              + Yeni Atama Yap
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="student-table">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Sınıf</th>
                  <th>Masa</th>
                  <th>Dolap</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => (
                  <tr key={s.ogrenci_id} style={{ animationDelay: `${idx * 0.02}s` }}>
                    {/* Öğrenci */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {s.profil_foto ? (
                          <img src={s.profil_foto} alt={s.ogrenci_adi}
                            style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: `2px solid ${s.masa && s.dolap ? '#22c55e' : s.masa || s.dolap ? '#3b82f6' : '#e5e7eb'}` }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden-avatar'); }}
                          />
                        ) : null}
                        <div className={`avatar-circle ${s.masa && s.dolap ? 'avatar-green' : s.masa || s.dolap ? 'avatar-blue' : 'avatar-gray'} ${s.profil_foto ? 'hidden-avatar' : ''}`}
                          style={{ width: 38, height: 38, borderRadius: 10 }}>
                          {s.ogrenci_adi.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{s.ogrenci_adi}</div>
                      </div>
                    </td>

                    {/* Sınıf */}
                    <td>
                      {s.sinif_adi ? <span className="badge-class">{s.sinif_adi}</span> : <span style={{ fontSize: 13, color: '#cbd5e1' }}>—</span>}
                    </td>

                    {/* Masa */}
                    <td>
                      {s.masa ? (
                        <div>
                          <span className="badge badge-blue">🪑 {s.masa.masa_no}</span>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, paddingLeft: 2 }}>{s.masa.salon_adi}</div>
                        </div>
                      ) : (
                        <button className="btn-assign btn-assign-blue"
                          onClick={() => openModal('masa', { id: s.ogrenci_id, tam_ad: s.ogrenci_adi, sinif_ad: s.sinif_adi })}>
                          + Masa Ata
                        </button>
                      )}
                    </td>

                    {/* Dolap */}
                    <td>
                      {s.dolap ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge badge-green">🔒 {s.dolap.dolap_no}</span>
                          <button className={`btn-key ${s.dolap.anahtar_verildi ? 'btn-key-yes' : 'btn-key-no'}`}
                            onClick={() => handleToggleKey(s.dolap!.atama_id)}
                            title={s.dolap.anahtar_verildi ? 'Anahtar verildi — tıklayarak geri alın' : 'Anahtar verilmedi — tıklayarak verin'}>
                            🔑 {s.dolap.anahtar_verildi ? 'Verildi' : 'Verilmedi'}
                          </button>
                        </div>
                      ) : (
                        <button className="btn-assign btn-assign-green"
                          onClick={() => openModal('dolap', { id: s.ogrenci_id, tam_ad: s.ogrenci_adi, sinif_ad: s.sinif_adi })}>
                          + Dolap Ata
                        </button>
                      )}
                    </td>

                    {/* İşlem */}
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {s.masa && (
                          <button className="btn-remove btn-remove-warn"
                            onClick={() => handleEndSeat(s.masa!.salon_id, s.masa!.atama_id)} title="Masa atamasını sonlandır">
                            🪑 Kaldır
                          </button>
                        )}
                        {s.dolap && (
                          <button className="btn-remove btn-remove-danger"
                            onClick={() => handleEndLocker(s.dolap!.atama_id, s.dolap!.anahtar_verildi)} title="Dolap atamasını sonlandır">
                            🔒 Kaldır
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ATAMA MODALI — 3-Step Stepper                              */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Yeni Atama Oluştur</h2>
                <button className="btn-close-circle" onClick={() => setShowModal(false)}>✕</button>
              </div>
              <div className="stepper-row">
                {[{ n: 1, l: 'Öğrenci' }, { n: 2, l: 'Kaynak Seç' }, { n: 3, l: 'Detaylar' }].map((s, i) => (
                  <React.Fragment key={s.n}>
                    <div className={`stepper-step ${step === s.n ? 'current' : ''}`}
                      onClick={() => { if (s.n === 1 || (s.n === 2 && selectedOgrenci) || (s.n === 3 && (formData.seat_id || formData.locker_id))) setStep(s.n); }}>
                      <div className={`stepper-num ${step > s.n ? 'done' : step === s.n ? 'active' : 'pending'}`}>
                        {step > s.n ? '✓' : s.n}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: step === s.n ? 600 : 400, color: step === s.n ? '#111827' : '#6b7280' }}>{s.l}</span>
                    </div>
                    {i < 2 && <div className="stepper-line" style={{ backgroundColor: step > i + 1 ? '#22c55e' : '#e5e7eb' }} />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="modal-body">
              {/* Step 1 */}
              {step === 1 && (
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>Öğrenci Seçin</h3>
                  <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 12px' }}>Atama yapılacak öğrenciyi arayın</p>
                  <StudentSearchDropdown selected={selectedOgrenci} onSelect={setSelectedOgrenci} onClear={() => setSelectedOgrenci(null)} coachMode={isCoachMode} />
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div>
                  {(modalMode === 'masa' || modalMode === 'both') && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🪑</div>
                          <div>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>Masa Seç</h3>
                            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{formData.seat_id ? '✅ Seçildi' : 'Opsiyonel'}</p>
                          </div>
                        </div>
                        <select value={modalLibrary} onChange={(e) => handleLibraryChange(e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#f9fafb', maxWidth: 200, outline: 'none' }}>
                          <option value="">Salon Seç</option>
                          {libraries.map(l => <option key={l.id} value={l.id}>{l.ad} ({l.kod})</option>)}
                        </select>
                      </div>
                      {modalLibrary ? (
                        <ResourceCard type="seat" items={allSeats} selectedId={formData.seat_id}
                          onSelect={(id) => setFormData(p => ({ ...p, seat_id: id }))} emptyText="Masa bulunamadı" />
                      ) : (
                        <div style={{ padding: 16, textAlign: 'center', color: '#d97706', background: '#fffbeb', borderRadius: 10, fontSize: 13, border: '1px solid #fef3c7' }}>
                          ⚠️ Masa seçmek için salon seçin
                        </div>
                      )}
                    </div>
                  )}

                  {modalMode === 'both' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                      <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
                      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>VE / VEYA</span>
                      <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
                    </div>
                  )}

                  {(modalMode === 'dolap' || modalMode === 'both') && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔒</div>
                        <div>
                          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>Dolap Seç</h3>
                          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{formData.locker_id ? '✅ Seçildi' : 'Opsiyonel'}</p>
                        </div>
                      </div>
                      <ResourceCard type="locker" items={allLockers} selectedId={formData.locker_id}
                        onSelect={(id) => setFormData(p => ({ ...p, locker_id: id }))} emptyText="Dolap bulunamadı" />
                    </div>
                  )}
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && (
                <div>
                  {/* Seçim Özeti */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ padding: '8px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, fontWeight: 500, color: '#166534' }}>
                      👤 {selectedOgrenci?.tam_ad}
                    </div>
                    {formData.seat_id && (
                      <div style={{ padding: '8px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 13, fontWeight: 500, color: '#1e40af' }}>
                        🪑 {allSeats.find(s => String(s.id) === formData.seat_id)?.masa_no || 'Masa'}
                      </div>
                    )}
                    {formData.locker_id && (
                      <div style={{ padding: '8px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #a7f3d0', fontSize: 13, fontWeight: 500, color: '#15803d' }}>
                        🔒 {allLockers.find(l => String(l.id) === formData.locker_id)?.dolap_no || 'Dolap'}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label className="form-label">Atama Tipi</label>
                    <div className="atama-tipi-group">
                      {ATAMA_TIPI_OPTIONS.map(o => (
                        <button key={o.value} className={`atama-tipi-btn ${formData.atama_tipi === o.value ? 'active' : ''}`}
                          onClick={() => setFormData(p => ({ ...p, atama_tipi: o.value }))}>{o.label}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label className="form-label">Başlangıç <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="date" className="form-input" value={formData.baslangic_tarihi}
                        onChange={(e) => setFormData({ ...formData, baslangic_tarihi: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">Bitiş</label>
                      <input type="date" className="form-input" value={formData.bitis_tarihi}
                        onChange={(e) => setFormData({ ...formData, bitis_tarihi: e.target.value })} />
                    </div>
                  </div>

                  {formData.locker_id && (
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '12px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', color: '#374151' }}>
                        <input type="checkbox" checked={formData.anahtar_verildi}
                          onChange={(e) => setFormData({ ...formData, anahtar_verildi: e.target.checked })}
                          style={{ width: 18, height: 18, accentColor: '#3b82f6' }} />
                        🔑 Anahtar Verildi
                      </label>
                    </div>
                  )}

                  <div>
                    <label className="form-label">Notlar</label>
                    <textarea className="form-input" value={formData.notlar}
                      onChange={(e) => setFormData({ ...formData, notlar: e.target.value })}
                      placeholder="Varsa ek bilgi..." rows={2} style={{ resize: 'vertical' as const }} />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <div>{step > 1 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>← Geri</button>}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" onClick={() => setShowModal(false)}>İptal</button>
                {step < 3 ? (
                  <button className="btn-primary" onClick={() => setStep(step + 1)} disabled={!canGoNext}>İleri →</button>
                ) : (
                  <button className="btn-success" onClick={handleSubmit} disabled={saving}>
                    {saving ? '⏳ Kaydediliyor...' : '✅ Atamayı Oluştur'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ANAHTAR TESLİM UYARI MODALI                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showKeyWarning.show && (
        <div className="modal-overlay modal-overlay-top"
          onClick={() => { setShowKeyWarning({ show: false, assignmentId: null }); setKeyConfirmed(false); }}>
          <div className="modal-card" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '28px 28px 20px', textAlign: 'center', background: 'linear-gradient(135deg, #fef3c7, #fffbeb)', borderBottom: '1px solid #fde68a' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 12px', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>🔑</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#92400e', margin: '0 0 4px' }}>Anahtar Teslim Uyarısı</h3>
              <p style={{ fontSize: 14, color: '#a16207', margin: 0 }}>Bu öğrenciye anahtar verilmiş!</p>
            </div>
            <div style={{ padding: '24px 28px' }}>
              <div style={{ padding: 16, background: '#fff7ed', borderRadius: 12, border: '1px solid #fed7aa', marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
                  <div style={{ fontSize: 14, color: '#9a3412', lineHeight: 1.6 }}>
                    Dolap atamasını sonlandırmadan önce lütfen <strong>anahtarı öğrenciden teslim aldığınızdan</strong> emin olun.
                  </div>
                </div>
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${keyConfirmed ? '#22c55e' : '#e5e7eb'}`,
                background: keyConfirmed ? '#f0fdf4' : '#fff', transition: 'all 0.2s',
              }}>
                <input type="checkbox" checked={keyConfirmed} onChange={(e) => setKeyConfirmed(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: '#22c55e', cursor: 'pointer' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: keyConfirmed ? '#166534' : '#374151' }}>Anahtarı teslim aldım ✅</span>
              </label>
            </div>
            <div style={{ padding: '16px 28px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fafbfc' }}>
              <button className="btn-ghost" onClick={() => { setShowKeyWarning({ show: false, assignmentId: null }); setKeyConfirmed(false); }}>İptal</button>
              <button onClick={confirmEndLockerWithKey} disabled={!keyConfirmed}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600,
                  cursor: keyConfirmed ? 'pointer' : 'not-allowed',
                  background: keyConfirmed ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#e5e7eb',
                  color: keyConfirmed ? '#fff' : '#9ca3af',
                  boxShadow: keyConfirmed ? '0 2px 8px rgba(239,68,68,0.3)' : 'none',
                }}>
                Atamayı Sonlandır
              </button>
            </div>
          </div>
        </div>
      )}

      <KutuphaneConfirmModal
        open={endSeatConfirm !== null}
        title="Masa atamasını sonlandır"
        message="Bu öğrencinin masa atamasını sonlandırmak istediğinize emin misiniz? Masa tekrar müsait hale gelecektir."
        confirmLabel="Evet, sonlandır"
        cancelLabel="Vazgeç"
        tone="danger"
        loading={endingSeat}
        onConfirm={confirmEndSeat}
        onCancel={() => !endingSeat && setEndSeatConfirm(null)}
      />

      <KutuphaneConfirmModal
        open={endLockerConfirmId !== null}
        title="Dolap atamasını sonlandır"
        message="Bu öğrencinin dolap atamasını sonlandırmak istediğinize emin misiniz?"
        confirmLabel="Evet, sonlandır"
        cancelLabel="Vazgeç"
        tone="warning"
        loading={endingLocker}
        onConfirm={confirmEndLockerSimple}
        onCancel={() => !endingLocker && setEndLockerConfirmId(null)}
      />
    </div>
  );
}
