'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchLockers, createLocker, deleteLocker, updateLocker,
  fetchLockerAssignments, createLockerAssignment, endLockerAssignment,
  type Locker, type LockerAssignment,
} from '@/lib/kutuphane-api';
import { searchKutuphaneStudents } from '@/lib/kutuphane-student-search';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';
import { useKurum } from '@/lib/contexts/KurumContext';
import { buildLockerStudentListPrintHtml, openKutuphanePrintWindow } from '@/lib/kutuphane-list-print';
import KutuphaneConfirmModal from '@/components/kutuphane/KutuphaneConfirmModal';
import KutuphaneToast from '@/components/kutuphane/KutuphaneToast';

interface OgrenciItem {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  sinif_ad?: string;
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Müsait', ASSIGNED: 'Atanmış', OUT_OF_SERVICE: 'Hizmet Dışı',
  ACTIVE: 'Aktif', ENDED: 'Sona Erdi', CANCELLED: 'İptal',
};
const BOYUT_OPTIONS = [
  { value: 'KUCUK', label: 'Küçük', icon: '📦' },
  { value: 'STANDARD', label: 'Standart', icon: '��️' },
  { value: 'BUYUK', label: 'Büyük', icon: '📦' },
];
const KILIT_OPTIONS = [
  { value: 'ANAHTAR', label: 'Anahtarlı', icon: '🔑' },
  { value: 'SIFRE', label: 'Şifreli', icon: '🔢' },
  { value: 'KART', label: 'Kartlı', icon: '💳' },
];
const ATAMA_TIPI_OPTIONS = [
  { value: 'KALICI', label: 'Kalıcı' },
  { value: 'GECICI', label: 'Geçici' },
  { value: 'DONEMLIK', label: 'Dönemlik' },
];
const ATAMA_TIPI_LABELS: Record<string, string> = {
  KALICI: 'Kalıcı', GECICI: 'Geçici', DONEMLIK: 'Dönemlik', PERMANENT: 'Kalıcı', TEMPORARY: 'Geçici', SEMESTER: 'Dönemlik',
};

/* ═══════════════════════════════════════════════════════════════════
   SummaryCard — Tıklanabilir stat kartı
   ═══════════════════════════════════════════════════════════════════ */
function SummaryCard({ icon, label, value, gradient, active, onClick, subtitle }: {
  icon: string; label: string; value: number; gradient: string;
  active: boolean; onClick: () => void; subtitle?: string;
}) {
  return (
    <div className={`stat-card ${active ? 'stat-card-active' : ''}`} onClick={onClick}>
      <div className="stat-card-icon" style={{ background: gradient }}>{icon}</div>
      <div className="stat-card-body">
        <div className="stat-card-value">{value}</div>
        <div className="stat-card-label">{label}</div>
        {subtitle && <div className="stat-card-sub">{subtitle}</div>}
      </div>
      {active && <div className="stat-card-check">✓</div>}
    </div>
  );
}

export default function DolaplarPage() {
  const { href, isCoachMode, portalHomeHref, portalHomeLabel } = useKutuphanePath();
  const { activeKurum, activeSube } = useKurum();
  const [activeTab, setActiveTab] = useState<'dolaplar' | 'atamalar'>('dolaplar');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [assignments, setAssignments] = useState<LockerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Add Locker Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ dolap_no: '', boyut: 'STANDARD', kilit_tipi: 'ANAHTAR', notlar: '' });
  const [addBulk, setAddBulk] = useState(false);
  const [bulkCount, setBulkCount] = useState('');
  const [bulkPrefix, setBulkPrefix] = useState('D');
  const [bulkStart, setBulkStart] = useState('1');
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; errors: string[] } | null>(null);

  // Edit Locker Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLocker, setEditLocker] = useState<Locker | null>(null);
  const [editForm, setEditForm] = useState({ dolap_no: '', boyut: '', kilit_tipi: '', notlar: '', durum: '' });

  // Assign Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [allLockers, setAllLockers] = useState<Locker[]>([]);
  const [ogrenciSearch, setOgrenciSearch] = useState('');
  const [ogrenciResults, setOgrenciResults] = useState<OgrenciItem[]>([]);
  const [selectedOgrenci, setSelectedOgrenci] = useState<OgrenciItem | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignForm, setAssignForm] = useState({
    locker_id: '', atama_tipi: 'KALICI',
    baslangic_tarihi: new Date().toISOString().split('T')[0],
    bitis_tarihi: '', notlar: '', anahtar_verildi: false,
  });
  const [endLockerConfirmId, setEndLockerConfirmId] = useState<string | null>(null);
  const [endingLocker, setEndingLocker] = useState(false);
  const [showKeyWarning, setShowKeyWarning] = useState<{ show: boolean; assignmentId: string | null }>({
    show: false,
    assignmentId: null,
  });
  const [keyConfirmed, setKeyConfirmed] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);

  /* ─── DATA ─── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (activeTab === 'dolaplar') {
        const res = await fetchLockers();
        if (res.success && res.data) setLockers(Array.isArray(res.data) ? res.data : []);
        else { setLockers([]); setErrorMsg(res.error || 'Dolaplar yüklenemedi'); }
      } else {
        const params = filterStatus !== 'all' ? { durum: filterStatus } : {};
        const res = await fetchLockerAssignments(params);
        if (res.success && res.data) setAssignments(Array.isArray(res.data) ? res.data : []);
        else { setAssignments([]); setErrorMsg(res.error || 'Atamalar yüklenemedi'); }
      }
    } catch {
      setErrorMsg('Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  // Öğrenci arama
  useEffect(() => {
    if (ogrenciSearch.length < 2) { setOgrenciResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const list = await searchKutuphaneStudents(ogrenciSearch, isCoachMode);
        setOgrenciResults(list as OgrenciItem[]);
      } catch {} finally { setSearchLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [ogrenciSearch]);

  /* ─── HANDLERS ─── */
  const handleAddLocker = async () => {
    if (addBulk) {
      const count = parseInt(bulkCount);
      const start = parseInt(bulkStart);
      if (isNaN(count) || count < 1 || count > 200) { alert('Adet 1-200 arasında olmalı'); return; }
      if (isNaN(start) || start < 0) { alert('Başlangıç numarası geçersiz'); return; }
      if (!bulkPrefix.trim()) { alert('Ön ek boş olamaz'); return; }

      setSaving(true);
      const errors: string[] = [];
      let created = 0;
      for (let i = 0; i < count; i++) {
        const no = `${bulkPrefix.trim()}${String(start + i).padStart(3, '0')}`;
        setBulkProgress({ current: i + 1, total: count, errors });
        try {
          const res = await createLocker({ dolap_no: no, boyut: addForm.boyut, kilit_tipi: addForm.kilit_tipi, notlar: addForm.notlar || undefined } as any);
          if (res.success) created++;
          else errors.push(`${no}: ${res.error || 'Hata'}`);
        } catch { errors.push(`${no}: İstek başarısız`); }
      }
      setBulkProgress(null);
      setSaving(false);
      setShowAddModal(false);
      if (errors.length === 0) setSuccessMsg(`✅ ${created} dolap başarıyla oluşturuldu`);
      else if (created > 0) setSuccessMsg(`⚠️ ${created}/${count} dolap oluşturuldu, ${errors.length} hata`);
      else setErrorMsg(`❌ Hiçbir dolap oluşturulamadı. İlk hata: ${errors[0]}`);
      loadData();
    } else {
      if (!addForm.dolap_no.trim()) { alert('Dolap numarası girin'); return; }
      setSaving(true);
      try {
        const res = await createLocker({ dolap_no: addForm.dolap_no.trim(), boyut: addForm.boyut, kilit_tipi: addForm.kilit_tipi, notlar: addForm.notlar || undefined } as any);
        if (res.success) { setShowAddModal(false); setSuccessMsg(`✅ ${addForm.dolap_no} numaralı dolap oluşturuldu`); loadData(); }
        else alert(res.error || 'Dolap oluşturulamadı');
      } catch { alert('Hata oluştu'); }
      finally { setSaving(false); }
    }
  };

  const handleDeleteLocker = async (locker: Locker) => {
    if (!confirm(`"${locker.dolap_no}" numaralı dolabı silmek istediğinize emin misiniz?`)) return;
    const res = await deleteLocker(locker.id);
    if (res.success) { setSuccessMsg(`${locker.dolap_no} silindi`); loadData(); }
    else alert(res.error || 'Silinemedi');
  };

  const openEditModal = (l: Locker) => {
    setEditLocker(l);
    setEditForm({ dolap_no: l.dolap_no, boyut: l.boyut, kilit_tipi: l.kilit_tipi, notlar: (l as any).notlar || '', durum: l.durum });
    setShowEditModal(true);
  };

  const handleUpdateLocker = async () => {
    if (!editLocker) return;
    setSaving(true);
    try {
      const res = await updateLocker(editLocker.id, {
        dolap_no: editForm.dolap_no,
        boyut: editForm.boyut,
        kilit_tipi: editForm.kilit_tipi,
        durum: editForm.durum as any,
        notlar: editForm.notlar || undefined,
      } as any);
      if (res.success) { setShowEditModal(false); setSuccessMsg(`✅ ${editForm.dolap_no} güncellendi`); loadData(); }
      else alert(res.error || 'Güncellenemedi');
    } catch { alert('Hata oluştu'); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (l: Locker) => {
    const newStatus = l.durum === 'OUT_OF_SERVICE' ? 'AVAILABLE' : 'OUT_OF_SERVICE';
    const msg = newStatus === 'OUT_OF_SERVICE'
      ? `"${l.dolap_no}" dolabını hizmet dışı yapmak istiyor musunuz?`
      : `"${l.dolap_no}" dolabını tekrar hizmete almak istiyor musunuz?`;
    if (!confirm(msg)) return;
    try {
      const res = await updateLocker(l.id, { durum: newStatus } as any);
      if (res.success) { setSuccessMsg(`${l.dolap_no} ${newStatus === 'OUT_OF_SERVICE' ? 'hizmet dışı yapıldı' : 'hizmete alındı'}`); loadData(); }
      else alert(res.error || 'Hata');
    } catch { alert('Hata oluştu'); }
  };

  const openAssignModal = async () => {
    setShowAssignModal(true);
    setSelectedOgrenci(null);
    setOgrenciSearch('');
    setOgrenciResults([]);
    setAssignForm({ locker_id: '', atama_tipi: 'KALICI', baslangic_tarihi: new Date().toISOString().split('T')[0], bitis_tarihi: '', notlar: '', anahtar_verildi: false });
    const res = await fetchLockers();
    if (res.success && res.data) setAllLockers(Array.isArray(res.data) ? res.data : []);
    else setAllLockers([]);
  };

  const handleCreateAssignment = async () => {
    if (!selectedOgrenci || !assignForm.locker_id) return alert('Lütfen öğrenci ve dolap seçin');
    setSaving(true);
    try {
      const res = await createLockerAssignment({
        dolap_id: assignForm.locker_id, ogrenci_id: selectedOgrenci.id, atama_tipi: assignForm.atama_tipi,
        baslangic_tarihi: assignForm.baslangic_tarihi,
        bitis_tarihi: assignForm.bitis_tarihi || undefined,
        anahtar_verildi: assignForm.anahtar_verildi,
        notlar: assignForm.notlar || undefined,
      });
      if (res.success) { setShowAssignModal(false); setSuccessMsg(`✅ ${selectedOgrenci.tam_ad} için dolap ataması oluşturuldu`); loadData(); }
      else alert(res.error || 'Atama oluşturulamadı');
    } catch { alert('Hata oluştu'); } finally { setSaving(false); }
  };

  const handleEndAssignment = (a: LockerAssignment) => {
    if (a.anahtar_verildi) {
      setShowKeyWarning({ show: true, assignmentId: a.id });
      setKeyConfirmed(false);
      return;
    }
    setEndLockerConfirmId(a.id);
  };

  const confirmEndLockerSimple = async () => {
    if (!endLockerConfirmId) return;
    setEndingLocker(true);
    try {
      const res = await endLockerAssignment(endLockerConfirmId);
      if (res.success) {
        setSuccessMsg('Dolap ataması sonlandırıldı');
        loadData();
      } else {
        setErrorMsg(res.error || 'Hata');
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
      const res = await endLockerAssignment(showKeyWarning.assignmentId);
      if (res.success) {
        setSuccessMsg('Dolap ataması sonlandırıldı');
        loadData();
      } else {
        setErrorMsg(res.error || 'Hata');
      }
    } finally {
      setEndingLocker(false);
      setShowKeyWarning({ show: false, assignmentId: null });
      setKeyConfirmed(false);
    }
  };

  /* ─── COMPUTED ─── */
  const totalLockers = lockers.length;
  const availCount = lockers.filter(l => l.durum === 'AVAILABLE').length;
  const assignedCount = lockers.filter(l => l.durum === 'ASSIGNED').length;
  const oosCount = lockers.filter(l => l.durum === 'OUT_OF_SERVICE').length;

  const filteredLockers = lockers.filter(l => {
    if (filterStatus !== 'all' && l.durum !== filterStatus) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!l.dolap_no.toLowerCase().includes(q) && !(l.atanan_ogrenci || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleCardFilter = (status: string) => {
    if (activeTab !== 'dolaplar') setActiveTab('dolaplar');
    setFilterStatus(filterStatus === status ? 'all' : status);
  };

  const handlePrintPdf = async () => {
    setPrintingPdf(true);
    try {
      let rows: {
        no: string;
        ogrenci: string;
        atamaTipi?: string;
        anahtar?: string;
        baslangic?: string;
        durum?: string;
      }[] = [];

      if (activeTab === 'atamalar') {
        rows = assignments.map((a) => ({
          no: a.dolap_no || '-',
          ogrenci: a.ogrenci_adi || `#${a.ogrenci_id}`,
          atamaTipi: ATAMA_TIPI_LABELS[a.atama_tipi] || a.atama_tipi,
          anahtar: a.anahtar_verildi ? 'Verildi' : 'Verilmedi',
          baslangic: new Date(a.baslangic_tarihi).toLocaleDateString('tr-TR'),
          durum: STATUS_LABELS[a.durum] || a.durum,
        }));
      } else {
        const assignedLockers = lockers.filter(
          (l) => l.durum === 'ASSIGNED' || (l.atanan_ogrenci && l.atanan_ogrenci.trim()),
        );
        if (assignedLockers.length > 0) {
          rows = assignedLockers.map((l) => ({
            no: l.dolap_no,
            ogrenci: l.atanan_ogrenci || '',
            durum: STATUS_LABELS[l.durum] || l.durum,
          }));
        } else {
          const res = await fetchLockerAssignments({ durum: 'ACTIVE' });
          const list = res.success && res.data && Array.isArray(res.data) ? res.data : [];
          rows = list.map((a) => ({
            no: a.dolap_no || '-',
            ogrenci: a.ogrenci_adi || `#${a.ogrenci_id}`,
            atamaTipi: ATAMA_TIPI_LABELS[a.atama_tipi] || a.atama_tipi,
            anahtar: a.anahtar_verildi ? 'Verildi' : 'Verilmedi',
            baslangic: new Date(a.baslangic_tarihi).toLocaleDateString('tr-TR'),
            durum: STATUS_LABELS[a.durum] || a.durum,
          }));
        }
      }

      if (rows.length === 0) {
        alert('PDF listesi için atanmış öğrenci bulunamadı.');
        return;
      }

      const html = buildLockerStudentListPrintHtml({
        meta: {
          title: activeTab === 'dolaplar' ? 'Dolap Öğrenci Listesi' : 'Dolap Atama Listesi',
          subeAdi: activeSube?.ad,
          kurumBranding: activeKurum,
        },
        rows,
      });
      const opened = openKutuphanePrintWindow(html);
      if (!opened) {
        alert('Yazdırma penceresi açıldı. Pop-up engellendi ise yeni sekmeden yazdırın veya PDF olarak kaydedin.');
      }
    } catch {
      alert('PDF listesi oluşturulurken hata oluştu.');
    } finally {
      setPrintingPdf(false);
    }
  };

  return (
    <div style={{ padding: 0 }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }

        .stat-cards-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: #fff; border-radius: 16px; border: 2px solid #e5e7eb; padding: 20px; display: flex; align-items: center; gap: 16px; cursor: pointer; position: relative; transition: all 0.2s ease; animation: fadeIn 0.35s ease both; }
        .stat-card:hover { border-color: #c7d2fe; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
        .stat-card-active { border-color: #6366f1 !important; background: linear-gradient(135deg, #fafafe, #f0f0ff); box-shadow: 0 4px 16px rgba(99,102,241,0.12); }
        .stat-card-icon { width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #fff; flex-shrink: 0; }
        .stat-card-body { flex: 1; min-width: 0; }
        .stat-card-value { font-size: 26px; font-weight: 800; color: #111827; line-height: 1; }
        .stat-card-label { font-size: 13px; color: #6b7280; font-weight: 500; margin-top: 3px; }
        .stat-card-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .stat-card-check { position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 50%; background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }

        .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .filter-search { position: relative; min-width: 240px; }
        .filter-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .filter-search input { width: 100%; padding: 10px 14px 10px 38px; border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: 14px; background: #f9fafb; outline: none; box-sizing: border-box; transition: border-color 0.2s; }
        .filter-search input:focus { border-color: #3b82f6; }
        .filter-select { padding: 10px 14px; border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: 14px; background: #f9fafb; min-width: 160px; color: #374151; cursor: pointer; outline: none; }
        .filter-refresh { padding: 10px 18px; border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: 14px; cursor: pointer; background: #fff; color: #374151; font-weight: 500; display: flex; align-items: center; gap: 6px; transition: all 0.15s; }
        .filter-refresh:hover { background: #f3f4f6; }

        .view-toggle { display: flex; gap: 2px; background: #f3f4f6; border-radius: 10px; padding: 3px; }
        .view-toggle-btn { padding: 8px 12px; border-radius: 8px; border: none; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.15s; background: transparent; color: #6b7280; }
        .view-toggle-btn.active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-weight: 600; }

        .tab-group { display: flex; gap: 4px; background: #f3f4f6; border-radius: 10px; padding: 3px; }
        .tab-btn { padding: 10px 18px; border-radius: 8px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; background: transparent; color: #6b7280; }
        .tab-btn.active { background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; box-shadow: 0 2px 8px rgba(0,97,166,0.3); }

        .locker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
        .locker-card { background: #fff; border-radius: 16px; border: 1.5px solid #e5e7eb; padding: 0; overflow: hidden; transition: all 0.2s; animation: fadeIn 0.3s ease both; position: relative; }
        .locker-card:hover { border-color: #c7d2fe; box-shadow: 0 6px 20px rgba(0,0,0,0.06); transform: translateY(-2px); }
        .locker-card-header { padding: 16px 18px 12px; display: flex; align-items: center; justify-content: space-between; }
        .locker-card-no { font-size: 18px; font-weight: 800; color: #111827; }
        .locker-card-body { padding: 0 18px 16px; }
        .locker-card-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .locker-card-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; background: #f3f4f6; color: #4b5563; }
        .locker-card-student { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #f8fafc; border-radius: 10px; margin-top: 10px; }
        .locker-card-student-avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .locker-card-footer { padding: 12px 18px; border-top: 1px solid #f3f4f6; display: flex; gap: 6px; justify-content: flex-end; }

        .badge-status { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
        .badge-available { background: linear-gradient(135deg, #d1fae5, #a7f3d0); color: #059669; }
        .badge-assigned { background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #2563eb; }
        .badge-oos { background: linear-gradient(135deg, #fee2e2, #fecaca); color: #dc2626; }

        .data-table-wrap { background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table thead th { padding: 14px 18px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }
        .data-table thead th:last-child { text-align: right; }
        .data-table tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.15s; animation: fadeIn 0.25s ease both; }
        .data-table tbody tr:hover { background: #f8fafc; }
        .data-table tbody td { padding: 14px 18px; vertical-align: middle; font-size: 14px; color: #374151; }
        .data-table tbody td:last-child { text-align: right; }

        .btn-sm { padding: 5px 12px; border-radius: 8px; border: 1px solid; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s; }
        .btn-edit { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
        .btn-edit:hover { background: #dbeafe; }
        .btn-oos { background: #fef3c7; border-color: #fde68a; color: #b45309; }
        .btn-oos:hover { background: #fde68a; }
        .btn-activate { background: #d1fae5; border-color: #6ee7b7; color: #059669; }
        .btn-activate:hover { background: #a7f3d0; }
        .btn-danger { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .btn-danger:hover { background: #fee2e2; }
        .btn-end { background: #fffbeb; border-color: #fde68a; color: #b45309; }
        .btn-end:hover { background: #fef3c7; }

        .toast { margin-bottom: 20px; padding: 14px 20px; border-radius: 14px; font-size: 14px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; animation: fadeIn 0.3s ease; }
        .toast-success { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #86efac; color: #166534; }
        .toast-error { background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #fca5a5; color: #991b1b; }
        .toast button { background: none; border: none; cursor: pointer; font-size: 18px; padding: 0 4px; color: inherit; }

        .empty-state { padding: 64px 24px; text-align: center; }
        .empty-icon { width: 80px; height: 80px; border-radius: 20px; background: linear-gradient(135deg, #eff6ff, #dbeafe); display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 20px; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-card { background: #fff; border-radius: 20px; width: 540px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0,0,0,0.2); animation: slideUp 0.3s ease; }
        .modal-header { padding: 24px 28px 20px; border-bottom: 1px solid #f3f4f6; background: linear-gradient(135deg, #f8faff, #f0f4ff); display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 24px 28px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 16px 28px 20px; border-top: 1px solid #f3f4f6; display: flex; justify-content: flex-end; gap: 10px; background: #fafbfc; }

        .form-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .form-input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 2px solid #e5e7eb; font-size: 14px; box-sizing: border-box; outline: none; background: #f9fafb; transition: border-color 0.2s; }
        .form-input:focus { border-color: #3b82f6; background: #fff; }

        .btn-primary { padding: 10px 24px; border-radius: 10px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; transition: all 0.15s; box-shadow: 0 2px 8px rgba(59,130,246,0.3); }
        .btn-primary:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; box-shadow: none; }
        .btn-success-lg { padding: 10px 28px; border-radius: 10px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; transition: all 0.15s; box-shadow: 0 2px 8px rgba(34,197,94,0.3); }
        .btn-success-lg:disabled { background: #94a3b8; color: #fff; opacity: 0.7; cursor: not-allowed; }
        .btn-ghost { padding: 10px 20px; border-radius: 10px; border: 1px solid #d1d5db; font-size: 14px; font-weight: 500; cursor: pointer; background: #fff; color: #374151; }
        .btn-ghost:hover { background: #f3f4f6; }
        .btn-close-circle { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f3f4f6; color: #6b7280; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.15s; }
        .btn-close-circle:hover { background: #e5e7eb; }

        .filter-count { margin-left: auto; font-size: 13px; color: #9ca3af; font-weight: 500; }

        @media (max-width: 768px) {
          .stat-cards-grid { grid-template-columns: repeat(2, 1fr); }
          .locker-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ═══ HERO HEADER ═══ */}
      <div className="hero-header" style={{ marginBottom: 28 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <div className="hero-text">
            <h1>Dolaplar</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>{portalHomeLabel}</a><span>/</span>
              <a href={href()}>Kütüphane</a><span>/</span><span>Dolaplar</span>
            </div>
          </div>
        </div>
        <div className="hero-actions" style={{ display: 'flex', gap: 8 }}>
          <button onClick={openAssignModal}
            style={{ padding: '12px 22px', background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
            Dolap Ata
          </button>
          {!isCoachMode && (
          <button onClick={() => { setShowAddModal(true); setAddBulk(false); setAddForm({ dolap_no: '', boyut: 'STANDARD', kilit_tipi: 'ANAHTAR', notlar: '' }); }}
            style={{ padding: '12px 22px', background: 'linear-gradient(135deg, #0061a6, #004d85)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(0,97,166,0.3)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Dolap Ekle
          </button>
          )}
        </div>
      </div>

      {/* ═══ TOASTS (fixed — layout shift yok) ═══ */}
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
        <SummaryCard icon="🗄️" label="Toplam Dolap" value={totalLockers}
          gradient="linear-gradient(135deg, #818cf8, #6366f1)"
          active={filterStatus === 'all' && activeTab === 'dolaplar'}
          onClick={() => { setActiveTab('dolaplar'); setFilterStatus('all'); }} />
        <SummaryCard icon="✅" label="Müsait" value={availCount}
          gradient="linear-gradient(135deg, #34d399, #10b981)"
          active={filterStatus === 'AVAILABLE'}
          onClick={() => handleCardFilter('AVAILABLE')}
          subtitle={totalLockers > 0 ? `%${Math.round(availCount / totalLockers * 100)} boş` : undefined} />
        <SummaryCard icon="👤" label="Atanmış" value={assignedCount}
          gradient="linear-gradient(135deg, #60a5fa, #3b82f6)"
          active={filterStatus === 'ASSIGNED'}
          onClick={() => handleCardFilter('ASSIGNED')}
          subtitle={totalLockers > 0 ? `%${Math.round(assignedCount / totalLockers * 100)} dolu` : undefined} />
        <SummaryCard icon="🚫" label="Hizmet Dışı" value={oosCount}
          gradient="linear-gradient(135deg, #f87171, #ef4444)"
          active={filterStatus === 'OUT_OF_SERVICE'}
          onClick={() => handleCardFilter('OUT_OF_SERVICE')} />
      </div>

      {/* ═══ FILTER BAR ═══ */}
      <div className="filter-bar">
        <div className="tab-group">
          {([{ key: 'dolaplar', label: '🗄️ Dolaplar' }, { key: 'atamalar', label: '👤 Atamalar' }] as const).map(({ key, label }) => (
            <button key={key} className={`tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => { setActiveTab(key as any); setFilterStatus('all'); }}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'dolaplar' && (
          <div className="view-toggle">
            <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Grid
            </button>
            <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Liste
            </button>
          </div>
        )}

        {activeTab === 'dolaplar' && (
          <div className="filter-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Dolap no veya öğrenci ara..."
              value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
        )}

        {activeTab === 'atamalar' && (
          <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Tüm Durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="ENDED">Sona Ermiş</option>
            <option value="CANCELLED">İptal</option>
          </select>
        )}

        <button className="filter-refresh" onClick={() => loadData()} disabled={loading}>🔄 Yenile</button>
        <button
          onClick={() => void handlePrintPdf()}
          disabled={loading || printingPdf}
          style={{
            padding: '8px 14px', borderRadius: 10, border: '1px solid #bbf7d0', background: '#f0fdf4',
            color: '#059669', fontSize: 13, fontWeight: 600, cursor: printingPdf ? 'wait' : 'pointer',
            opacity: loading || printingPdf ? 0.6 : 1,
          }}
        >
          {printingPdf ? '⏳ Hazırlanıyor...' : '📄 PDF Listesi'}
        </button>
        <div className="filter-count">
          {activeTab === 'dolaplar' ? `${filteredLockers.length} dolap` : `${assignments.length} atama`}
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      {loading ? (
        <div style={{ padding: 64, textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Yükleniyor...</div>
        </div>
      ) : activeTab === 'dolaplar' ? (
        filteredLockers.length === 0 ? (
          <div className="data-table-wrap">
            <div className="empty-state">
              <div className="empty-icon">🗄️</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Dolap bulunamadı</h3>
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
                {filterStatus !== 'all' || searchText ? 'Filtrelere uygun dolap bulunamadı.' : 'Henüz dolap eklenmemiş.'}
              </p>
              {!searchText && filterStatus === 'all' && (
                <button onClick={() => { setShowAddModal(true); setAddBulk(false); }}
                  style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #0061a6, #004d85)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,97,166,0.3)' }}>
                  + Dolap Ekle
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          /* ═══ GRID VIEW ═══ */
          <div className="locker-grid">
            {filteredLockers.map((l, idx) => {
              const statusClass = l.durum === 'AVAILABLE' ? 'badge-available' : l.durum === 'ASSIGNED' ? 'badge-assigned' : 'badge-oos';
              const boyutLabel = BOYUT_OPTIONS.find(b => b.value === l.boyut)?.label || l.boyut;
              const kilitLabel = KILIT_OPTIONS.find(k => k.value === l.kilit_tipi)?.label || l.kilit_tipi;
              const kilitIcon = KILIT_OPTIONS.find(k => k.value === l.kilit_tipi)?.icon || '🔐';
              return (
                <div key={l.id} className="locker-card" style={{ animationDelay: `${idx * 0.03}s` }}>
                  <div className="locker-card-header">
                    <div className="locker-card-no">{l.dolap_no}</div>
                    <span className={`badge-status ${statusClass}`}>{STATUS_LABELS[l.durum] || l.durum}</span>
                  </div>
                  <div className="locker-card-body">
                    <div className="locker-card-meta">
                      <span className="locker-card-tag">📦 {boyutLabel}</span>
                      <span className="locker-card-tag">{kilitIcon} {kilitLabel}</span>
                    </div>
                    {l.atanan_ogrenci ? (
                      <div className="locker-card-student">
                        <div className="locker-card-student-avatar" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                          {l.atanan_ogrenci.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{l.atanan_ogrenci}</div>
                          <div style={{ fontSize: 11, color: '#93c5fd' }}>Atanmış</div>
                        </div>
                      </div>
                    ) : l.durum === 'AVAILABLE' ? (
                      <div className="locker-card-student" style={{ background: '#f0fdf4', justifyContent: 'center' }}>
                        <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>✅ Müsait — atama yapılabilir</span>
                      </div>
                    ) : l.durum === 'OUT_OF_SERVICE' ? (
                      <div className="locker-card-student" style={{ background: '#fef2f2', justifyContent: 'center' }}>
                        <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>🚫 Hizmet dışı</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="locker-card-footer">
                    <button className="btn-sm btn-edit" onClick={() => openEditModal(l)} title="Düzenle">✏️ Düzenle</button>
                    {l.durum === 'AVAILABLE' ? (
                      <button className="btn-sm btn-oos" onClick={() => handleToggleStatus(l)} title="Hizmet dışı yap">🚫 H.Dışı</button>
                    ) : l.durum === 'OUT_OF_SERVICE' ? (
                      <button className="btn-sm btn-activate" onClick={() => handleToggleStatus(l)} title="Hizmete al">✅ Aktifle</button>
                    ) : null}
                    {l.durum === 'AVAILABLE' && (
                      <button className="btn-sm btn-danger" onClick={() => handleDeleteLocker(l)} title="Sil">🗑️</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ═══ LIST VIEW ═══ */
          <div className="data-table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dolap No</th>
                    <th>Boyut</th>
                    <th>Kilit</th>
                    <th>Kullanan</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLockers.map((l, idx) => {
                    const statusClass = l.durum === 'AVAILABLE' ? 'badge-available' : l.durum === 'ASSIGNED' ? 'badge-assigned' : 'badge-oos';
                    return (
                      <tr key={l.id} style={{ animationDelay: `${idx * 0.02}s` }}>
                        <td><strong>{l.dolap_no}</strong></td>
                        <td>{BOYUT_OPTIONS.find(b => b.value === l.boyut)?.label || l.boyut}</td>
                        <td>{KILIT_OPTIONS.find(k => k.value === l.kilit_tipi)?.label || l.kilit_tipi}</td>
                        <td>
                          {l.atanan_ogrenci ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                                {l.atanan_ogrenci.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{l.atanan_ogrenci}</span>
                            </div>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td><span className={`badge-status ${statusClass}`}>{STATUS_LABELS[l.durum] || l.durum}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn-sm btn-edit" onClick={() => openEditModal(l)}>✏️ Düzenle</button>
                            {l.durum === 'AVAILABLE' && (
                              <>
                                <button className="btn-sm btn-oos" onClick={() => handleToggleStatus(l)}>🚫 H.Dışı</button>
                                <button className="btn-sm btn-danger" onClick={() => handleDeleteLocker(l)}>🗑️</button>
                              </>
                            )}
                            {l.durum === 'OUT_OF_SERVICE' && (
                              <button className="btn-sm btn-activate" onClick={() => handleToggleStatus(l)}>✅ Aktifle</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* ─── ATAMALAR TAB ─── */
        assignments.length === 0 ? (
          <div className="data-table-wrap">
            <div className="empty-state">
              <div className="empty-icon">👤</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Dolap ataması bulunamadı</h3>
              <p style={{ fontSize: 14, color: '#6b7280', maxWidth: 360, margin: '0 auto 24px' }}>Henüz dolap ataması yapılmamış.</p>
              <button onClick={openAssignModal}
                style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
                + Dolap Ata
              </button>
            </div>
          </div>
        ) : (
          <div className="data-table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dolap</th>
                    <th>Öğrenci</th>
                    <th>Atama Tipi</th>
                    <th>Anahtar</th>
                    <th>Başlangıç</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a: any, idx: number) => {
                    const statusClass = a.durum === 'ACTIVE' ? 'badge-available' : a.durum === 'ENDED' ? '' : 'badge-oos';
                    return (
                      <tr key={a.id} style={{ animationDelay: `${idx * 0.02}s` }}>
                        <td><strong>{a.dolap_no || '-'}</strong></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #34d399, #10b981)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                              {(a.ogrenci_adi || '?').charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600 }}>{a.ogrenci_adi || `#${a.ogrenci_id}`}</span>
                          </div>
                        </td>
                        <td>{ATAMA_TIPI_LABELS[a.atama_tipi] || a.atama_tipi}</td>
                        <td>
                          <span style={{ color: a.anahtar_verildi ? '#059669' : '#ef4444', fontWeight: 600, fontSize: 13 }}>
                            {a.anahtar_verildi ? '🔑 Verildi' : '❌ Verilmedi'}
                          </span>
                        </td>
                        <td>{a.baslangic_tarihi ? new Date(a.baslangic_tarihi).toLocaleDateString('tr-TR') : '-'}</td>
                        <td>
                          <span className={`badge-status ${statusClass}`} style={!statusClass ? { background: '#f3f4f6', color: '#6b7280' } : {}}>
                            {STATUS_LABELS[a.durum] || a.durum}
                          </span>
                        </td>
                        <td>
                          {a.durum === 'ACTIVE' && (
                            <button className="btn-sm btn-end" onClick={() => handleEndAssignment(a)}>Sonlandır</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ═══ ADD LOCKER MODAL ═══ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>🗄️ Dolap Ekle</h2>
              <button className="btn-close-circle" onClick={() => !saving && setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3 }}>
                <button onClick={() => setAddBulk(false)}
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', fontSize: 14, fontWeight: !addBulk ? 600 : 400, cursor: 'pointer', backgroundColor: !addBulk ? '#fff' : 'transparent', color: !addBulk ? '#111827' : '#6b7280', boxShadow: !addBulk ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  Tek Dolap
                </button>
                <button onClick={() => setAddBulk(true)}
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', fontSize: 14, fontWeight: addBulk ? 600 : 400, cursor: 'pointer', backgroundColor: addBulk ? '#fff' : 'transparent', color: addBulk ? '#111827' : '#6b7280', boxShadow: addBulk ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  Toplu Ekleme
                </button>
              </div>

              {addBulk ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div><label className="form-label">Ön Ek</label><input type="text" value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} className="form-input" placeholder="D" /></div>
                    <div><label className="form-label">Başlangıç No</label><input type="number" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} className="form-input" placeholder="1" /></div>
                    <div><label className="form-label">Adet</label><input type="number" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} className="form-input" placeholder="50" /></div>
                  </div>
                  {bulkPrefix && bulkStart && bulkCount && (
                    <div style={{ padding: '10px 14px', background: '#f0f9ff', borderRadius: 10, fontSize: 13, color: '#0369a1', marginBottom: 16, border: '1px solid #bae6fd' }}>
                      Önizleme: {bulkPrefix}{String(parseInt(bulkStart)).padStart(3, '0')} → {bulkPrefix}{String(parseInt(bulkStart) + parseInt(bulkCount) - 1).padStart(3, '0')} ({bulkCount} adet)
                    </div>
                  )}
                </>
              ) : (
                <div style={{ marginBottom: 16 }}><label className="form-label">Dolap No <span style={{ color: '#ef4444' }}>*</span></label><input type="text" value={addForm.dolap_no} onChange={(e) => setAddForm({ ...addForm, dolap_no: e.target.value })} className="form-input" placeholder="D001" /></div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label className="form-label">Boyut</label><select value={addForm.boyut} onChange={(e) => setAddForm({ ...addForm, boyut: e.target.value })} className="form-input">{BOYUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className="form-label">Kilit Tipi</label><select value={addForm.kilit_tipi} onChange={(e) => setAddForm({ ...addForm, kilit_tipi: e.target.value })} className="form-input">{KILIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              </div>

              <div style={{ marginBottom: 16 }}><label className="form-label">Notlar</label><textarea value={addForm.notlar} onChange={(e) => setAddForm({ ...addForm, notlar: e.target.value })} placeholder="Opsiyonel..." rows={2} className="form-input" style={{ resize: 'vertical' }} /></div>

              {bulkProgress && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#374151' }}>
                    <span>Ekleniyor... {bulkProgress.current} / {bulkProgress.total}</span>
                    <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
                  </div>
                  <div style={{ width: '100%', height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%`, height: '100%', backgroundColor: bulkProgress.errors.length > 0 ? '#f59e0b' : '#0061a6', borderRadius: 4, transition: 'width 0.2s ease' }} />
                  </div>
                  {bulkProgress.errors.length > 0 && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>⚠️ {bulkProgress.errors.length} hata</div>}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowAddModal(false)} disabled={saving}>İptal</button>
              <button className="btn-primary" onClick={handleAddLocker} disabled={saving}>
                {saving ? (bulkProgress ? `${bulkProgress.current}/${bulkProgress.total}` : 'Ekleniyor...') : addBulk ? 'Toplu Ekle' : 'Dolap Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT LOCKER MODAL ═══ */}
      {showEditModal && editLocker && (
        <div className="modal-overlay" onClick={() => !saving && setShowEditModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>✏️ Dolap Düzenle — {editLocker.dolap_no}</h2>
              <button className="btn-close-circle" onClick={() => !saving && setShowEditModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}><label className="form-label">Dolap No <span style={{ color: '#ef4444' }}>*</span></label><input type="text" value={editForm.dolap_no} onChange={(e) => setEditForm({ ...editForm, dolap_no: e.target.value })} className="form-input" /></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label className="form-label">Boyut</label><select value={editForm.boyut} onChange={(e) => setEditForm({ ...editForm, boyut: e.target.value })} className="form-input">{BOYUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className="form-label">Kilit Tipi</label><select value={editForm.kilit_tipi} onChange={(e) => setEditForm({ ...editForm, kilit_tipi: e.target.value })} className="form-input">{KILIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Durum</label>
                <select value={editForm.durum} onChange={(e) => setEditForm({ ...editForm, durum: e.target.value })} className="form-input">
                  <option value="AVAILABLE">✅ Müsait</option>
                  <option value="OUT_OF_SERVICE">🚫 Hizmet Dışı</option>
                  {editLocker.durum === 'ASSIGNED' && <option value="ASSIGNED">👤 Atanmış</option>}
                </select>
                {editLocker.durum === 'ASSIGNED' && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#d97706', background: '#fffbeb', padding: '8px 12px', borderRadius: 8, border: '1px solid #fde68a' }}>
                    ⚠️ Atanmış dolabın durumunu değiştirmek için önce atamayı sonlandırmalısınız.
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}><label className="form-label">Notlar</label><textarea value={editForm.notlar} onChange={(e) => setEditForm({ ...editForm, notlar: e.target.value })} placeholder="Opsiyonel..." rows={2} className="form-input" style={{ resize: 'vertical' }} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowEditModal(false)} disabled={saving}>İptal</button>
              <button className="btn-primary" onClick={handleUpdateLocker} disabled={saving}>{saving ? '⏳ Kaydediliyor...' : '💾 Güncelle'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ASSIGN MODAL ═══ */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowAssignModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>🔒 Dolap Ataması</h2>
              <button className="btn-close-circle" onClick={() => !saving && setShowAssignModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Öğrenci <span style={{ color: '#ef4444' }}>*</span></label>
                {selectedOgrenci ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #34d399, #10b981)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                        {(selectedOgrenci.tam_ad || selectedOgrenci.ad).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#166534' }}>{selectedOgrenci.tam_ad}</div>
                        {selectedOgrenci.sinif_ad && <div style={{ fontSize: 12, color: '#16a34a' }}>{selectedOgrenci.sinif_ad}</div>}
                      </div>
                    </div>
                    <button onClick={() => { setSelectedOgrenci(null); setOgrenciSearch(''); }} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#dc2626' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input type="text" placeholder="İsim veya TC ile arayın..." value={ogrenciSearch} onChange={(e) => setOgrenciSearch(e.target.value)} className="form-input" />
                    {searchLoading && <div style={{ position: 'absolute', right: 14, top: 12, fontSize: 12, color: '#9ca3af' }}>Aranıyor...</div>}
                    {ogrenciResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxHeight: 200, overflow: 'auto', marginTop: 4 }}>
                        {ogrenciResults.map(o => (
                          <button key={o.id} onClick={() => { setSelectedOgrenci(o); setOgrenciSearch(''); setOgrenciResults([]); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f3f4f6' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #a7f3d0, #6ee7b7)', color: '#065f46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                              {(o.tam_ad || o.ad).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500 }}>{o.tam_ad || `${o.ad} ${o.soyad}`}</div>
                              {o.sinif_ad && <div style={{ fontSize: 12, color: '#6b7280' }}>{o.sinif_ad}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Dolap <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={assignForm.locker_id} onChange={(e) => setAssignForm({ ...assignForm, locker_id: e.target.value })} className="form-input">
                  <option value="">Dolap seçin ({allLockers.filter(l => l.durum === 'AVAILABLE').length} müsait)</option>
                  {allLockers.map(l => {
                    const isOccupied = l.durum !== 'AVAILABLE';
                    return (
                      <option key={l.id} value={l.id} disabled={isOccupied}>
                        {isOccupied ? '🔴' : '🟢'} {l.dolap_no} — {BOYUT_OPTIONS.find(b => b.value === l.boyut)?.label || l.boyut} / {KILIT_OPTIONS.find(k => k.value === l.kilit_tipi)?.label || l.kilit_tipi}{isOccupied && l.atanan_ogrenci ? ` ← ${l.atanan_ogrenci}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}><label className="form-label">Atama Tipi</label><select value={assignForm.atama_tipi} onChange={(e) => setAssignForm({ ...assignForm, atama_tipi: e.target.value })} className="form-input">{ATAMA_TIPI_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label className="form-label">Başlangıç <span style={{ color: '#ef4444' }}>*</span></label><input type="date" value={assignForm.baslangic_tarihi} onChange={(e) => setAssignForm({ ...assignForm, baslangic_tarihi: e.target.value })} className="form-input" /></div>
                <div><label className="form-label">Bitiş</label><input type="date" value={assignForm.bitis_tarihi} onChange={(e) => setAssignForm({ ...assignForm, bitis_tarihi: e.target.value })} className="form-input" /></div>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '12px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', color: '#374151' }}>
                  <input type="checkbox" checked={assignForm.anahtar_verildi} onChange={(e) => setAssignForm({ ...assignForm, anahtar_verildi: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#3b82f6' }} />
                  🔑 Anahtar Verildi
                </label>
              </div>

              <div><label className="form-label">Notlar</label><textarea value={assignForm.notlar} onChange={(e) => setAssignForm({ ...assignForm, notlar: e.target.value })} placeholder="Opsiyonel..." rows={2} className="form-input" style={{ resize: 'vertical' }} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowAssignModal(false)} disabled={saving}>İptal</button>
              <button className="btn-success-lg" onClick={handleCreateAssignment} disabled={saving}>{saving ? '⏳ Kaydediliyor...' : '✅ Dolabı Ata'}</button>
            </div>
          </div>
        </div>
      )}

      {showKeyWarning.show && (
        <div
          className="modal-overlay modal-overlay-top"
          onClick={() => {
            if (endingLocker) return;
            setShowKeyWarning({ show: false, assignmentId: null });
            setKeyConfirmed(false);
          }}
        >
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
              <button type="button" className="btn-ghost" onClick={() => { setShowKeyWarning({ show: false, assignmentId: null }); setKeyConfirmed(false); }} disabled={endingLocker}>İptal</button>
              <button type="button" onClick={confirmEndLockerWithKey} disabled={!keyConfirmed || endingLocker}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600,
                  cursor: keyConfirmed && !endingLocker ? 'pointer' : 'not-allowed',
                  background: keyConfirmed ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#e5e7eb',
                  color: keyConfirmed ? '#fff' : '#9ca3af',
                  boxShadow: keyConfirmed ? '0 2px 8px rgba(239,68,68,0.3)' : 'none',
                }}>
                {endingLocker ? 'İşleniyor…' : 'Atamayı Sonlandır'}
              </button>
            </div>
          </div>
        </div>
      )}

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
