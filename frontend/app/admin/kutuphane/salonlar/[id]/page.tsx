'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchLibrary, updateLibrary, changeLibraryStatus, deleteLibrary,
  fetchSeats, bulkCreateSeats, changeSeatStatus,
  fetchSeatAssignments, endSeatAssignment,
  fetchAuditLogs,
  fetchAttendanceSessions, openAttendanceSession,
  fetchAttendanceSessionDetail, closeAttendanceSession, reopenAttendanceSession,
  saveAttendanceRecords, openLessonAttendanceSessions,
  fetchAttendanceSheetData, fetchWeeklyAttendanceSummary, downloadAttendanceSheetExport,
  fetchAttendanceNotifyStatus, fetchAttendanceNotifyConfig,
  fetchSubeler,
  type Library, type Seat,
  type SeatAssignment, type AuditLog,
  type LibraryStatus, type SeatStatus,
  type AttendanceSession, type AttendanceRecord,
  type AttendanceStatus, type AttendanceSheetData,
  type WeeklySummary, type SubeInfo,
  type AttendanceNotifyStatusResponse, type AttendanceNotifyConfig,
  type AttendanceNotifyEventType, type AttendancePendingNotification,
} from '@/lib/kutuphane-api';
import YoklamaSessionDrawer from '@/components/kutuphane/yoklama/YoklamaSessionDrawer';
import AttendanceNotifyPreviewModal from '@/components/kutuphane/yoklama/AttendanceNotifyPreviewModal';
import AttendanceNotifySettingsDrawer from '@/components/kutuphane/yoklama/AttendanceNotifySettingsDrawer';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';
import KutuphaneConfirmModal from '@/components/kutuphane/KutuphaneConfirmModal';
import YoklamaSheetHeader from '@/components/kutuphane/yoklama/YoklamaSheetHeader';
import { useKurum } from '@/lib/contexts/KurumContext';
import { brandingFromKurum } from '@/lib/kurum-branding';
import {
  buildYoklamaPrintHtml,
  openYoklamaPrintWindow,
  getWeekRange,
  formatWeekRangeLabel,
  abbreviateDayName,
  weeklyTableMinWidth,
  type WeekDayBlock,
} from '@/lib/yoklama-sheet-print';
import { buildSeatStudentListPrintHtml, openKutuphanePrintWindow } from '@/lib/kutuphane-list-print';
import { downloadBlob } from '@/lib/download-file';
import '@/components/kutuphane/yoklama/yoklama-sheet.css';

/* ════════════════════════════════════════════════════════════
   TABS  (Oturumlar kaldırıldı — ders programı kullanılıyor)
   ════════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'genel',    label: 'Genel Bilgiler',  icon: '📋' },
  { key: 'masalar',  label: 'Masalar',          icon: '🪑' },
  { key: 'yoklama',  label: 'Yoklama',          icon: '✅' },
  { key: 'atamalar', label: 'Atamalar',         icon: '🔗' },
  { key: 'loglar',   label: 'İşlem Geçmişi',    icon: '📝' },
];

/* ════════════════════════════════════════════════════════════
   SABITLER
   ════════════════════════════════════════════════════════════ */
const ATTENDANCE_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  PRESENT:     { label: 'Var',           color: '#059669', bg: '#d1fae5' },
  ABSENT:      { label: 'Yok',           color: '#dc2626', bg: '#fee2e2' },
  LATE:        { label: 'Geç',           color: '#d97706', bg: '#fef3c7' },
  EXCUSED:     { label: 'İzinli',        color: '#6366f1', bg: '#e0e7ff' },
  NOT_AT_DESK: { label: 'Masada Değil',  color: '#9333ea', bg: '#f3e8ff' },
};

const PERIOD_LABELS: Record<string, string> = {
  MORNING: '🌅 Sabah', AFTERNOON: '☀️ Öğle', EVENING: '🌙 Akşam',
  SABAH: '🌅 Sabah', OGLE: '☀️ Öğle', AKSAM: '🌙 Akşam',
  GECE: '🌙 Gece', TAM_GUN: '📅 Tam Gün', OZEL: '⭐ Özel', CUSTOM: '⭐ Özel',
};

const ALL_PERIYOT_OPTIONS = [
  { key: 'MORNING', label: '🌅 Sabah', shortLabel: 'Sabah' },
  { key: 'AFTERNOON', label: '☀️ Öğle', shortLabel: 'Öğle' },
  { key: 'EVENING', label: '🌙 Akşam', shortLabel: 'Akşam' },
];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif', INACTIVE: 'Pasif', MAINTENANCE: 'Bakımda',
};
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  ACTIVE:      { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  INACTIVE:    { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
  MAINTENANCE: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
};

const SEAT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Müsait', OCCUPIED: 'Dolu', RESERVED: 'Rezerve', OUT_OF_SERVICE: 'Hizmet Dışı',
};
const SEAT_STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  AVAILABLE:      { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  OCCUPIED:       { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  RESERVED:       { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  OUT_OF_SERVICE: { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
};

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif', ENDED: 'Sona Erdi', CANCELLED: 'İptal',
};

const LOG_ACTION_LABELS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  CREATE:        { label: 'Oluşturma',         icon: '➕', color: '#059669', bg: '#ecfdf5' },
  UPDATE:        { label: 'Güncelleme',         icon: '✏️', color: '#3b82f6', bg: '#eff6ff' },
  DELETE:        { label: 'Silme',              icon: '🗑️', color: '#ef4444', bg: '#fef2f2' },
  STATUS_CHANGE: { label: 'Durum Değişikliği',  icon: '🔄', color: '#d97706', bg: '#fffbeb' },
};



/* ════════════════════════════════════════════════════════════
   PORTAL MODAL
   ════════════════════════════════════════════════════════════ */
function PortalModal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return ReactDOM.createPortal(children, document.body);
}

/* ════════════════════════════════════════════════════════════
   YARDIMCI BİLEŞENLER
   ════════════════════════════════════════════════════════════ */
function Badge({ label, color, bg, border }: { label: string; color: string; bg: string; border?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: '6px', fontSize: '12px', fontWeight: 600,
      backgroundColor: bg, color, border: border ? `1px solid ${border}` : 'none',
      lineHeight: '1.5', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function Card({ children, style, hover, onClick }: {
  children: React.ReactNode; style?: React.CSSProperties; hover?: boolean; onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        backgroundColor: '#fff', borderRadius: '14px',
        border: '1px solid #e5e7eb',
        boxShadow: hovered && hover ? '0 4px 12px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.8 }}>{icon}</div>
      <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>{title}</div>
      {description && <div style={{ fontSize: '13px', color: '#9ca3af' }}>{description}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TABLO STİLLERİ
   ════════════════════════════════════════════════════════════ */
const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em',
  backgroundColor: '#f8fafc', borderBottom: '2px solid #e5e7eb',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 16px', fontSize: '13px', color: '#374151',
  borderBottom: '1px solid #f3f4f6',
};

/* ════════════════════════════════════════════════════════════
   ANA BİLEŞEN
   ════════════════════════════════════════════════════════════ */
export default function SalonDetayPage() {
  const { href, isCoachMode } = useKutuphanePath();
  const { activeKurum } = useKurum();
  const params = useParams();
  const router = useRouter();
  const libraryId = params.id as string;

  const [library, setLibrary] = useState<Library | null>(null);
  const [activeTab, setActiveTab] = useState('genel');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [showBulkSeatForm, setShowBulkSeatForm] = useState(false);
  const [endSeatConfirmId, setEndSeatConfirmId] = useState<string | null>(null);
  const [endingSeat, setEndingSeat] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  /* ─── Kütüphane Yükle ─── */
  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetchLibrary(libraryId);
      if (res.success && res.data) setLibrary(res.data as Library);
      else setError('Salon bulunamadı');
    } catch { setError('Yükleme hatası'); }
    setLoading(false);
  }, [libraryId]);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  /* ─── Tab Verisi Yükle ─── */
  const loadTabData = useCallback(async (tab: string) => {
    setTabLoading(true);
    try {
      switch (tab) {
        case 'masalar': {
          const r = await fetchSeats(libraryId);
          if (r.success && r.data) setSeats(r.data as Seat[]);
          break;
        }
        case 'yoklama': {
          // Yoklama tabı kendi verilerini yükler
          break;
        }
        case 'atamalar': {
          const r = await fetchSeatAssignments(libraryId);
          if (r.success && r.data) setSeatAssignments(r.data as SeatAssignment[]);
          break;
        }
        case 'loglar': {
          const r = await fetchAuditLogs(libraryId);
          if (r.success && r.data) setAuditLogs(r.data as AuditLog[]);
          break;
        }
      }
    } catch { /* ignore */ }
    setTabLoading(false);
  }, [libraryId]);

  useEffect(() => { if (activeTab !== 'genel') loadTabData(activeTab); }, [activeTab, loadTabData]);

  /* ─── Durum Değiştir ─── */
  const handleStatusChange = async (newStatus: LibraryStatus) => {
    try {
      const res = await changeLibraryStatus(libraryId, newStatus);
      if (res.success) { loadLibrary(); showToast('success', 'Durum güncellendi'); }
    } catch { showToast('error', 'Hata oluştu'); }
  };

  /* ─── Sil ─── */
  const handleDelete = async () => {
    if (!confirm('Bu salonu silmek istediğinize emin misiniz?')) return;
    try {
      const res = await deleteLibrary(libraryId);
      if (res.success) router.push(href('salonlar'));
    } catch { showToast('error', 'Silme hatası'); }
  };

  /* ─── Toplu Masa Oluştur ─── */
  const handleBulkCreateSeats = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const baslangic = Number(fd.get('baslangic_no')) || 1;
    const adet = Number(fd.get('adet'));
    try {
      const res = await bulkCreateSeats(libraryId, {
        baslangic,
        bitis: baslangic + adet - 1,
        masa_tipi: (fd.get('masa_tipi') as string) || 'STANDARD',
      });
      if (res.success) {
        showToast('success', 'Masalar oluşturuldu');
        setShowBulkSeatForm(false);
        loadTabData('masalar');
      }
    } catch { showToast('error', 'Hata oluştu'); }
  };

  /* ─── Masa Durum Değiştir ─── */
  const handleSeatStatusChange = async (seatId: string, newStatus: SeatStatus) => {
    try {
      const res = await changeSeatStatus(libraryId, seatId, newStatus);
      if (res.success) loadTabData('masalar');
    } catch { showToast('error', 'Hata oluştu'); }
  };

  /* ─── Atama Sonlandır ─── */
  const handleEndSeatAssignment = (assignmentId: string) => {
    setEndSeatConfirmId(assignmentId);
  };

  const confirmEndSeatAssignment = async () => {
    if (!endSeatConfirmId) return;
    setEndingSeat(true);
    try {
      const res = await endSeatAssignment(libraryId, endSeatConfirmId);
      if (res.success) {
        loadTabData('atamalar');
        showToast('success', 'Masa ataması sonlandırıldı');
      } else {
        showToast('error', res.error || 'Hata oluştu');
      }
    } catch {
      showToast('error', 'Hata oluştu');
    } finally {
      setEndingSeat(false);
      setEndSeatConfirmId(null);
    }
  };

  /* ─── Yükleniyor / Hata ─── */
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Yükleniyor...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error || !library) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Card style={{ padding: '32px', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>{error || 'Salon bulunamadı'}</h3>
          <Link href={href('salonlar')} style={{ color: '#3b82f6', fontSize: '14px', textDecoration: 'none' }}>
            ← Salonlara dön
          </Link>
        </Card>
      </div>
    );
  }

  const statusInfo = STATUS_COLORS[library.durum] || STATUS_COLORS.INACTIVE;
  const doluluk = library.doluluk_orani ?? library.doluluk_yuzde ?? 0;

  return (
    <div style={{ padding: 0 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 10000,
          padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
          color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          backgroundColor: toast.type === 'success' ? '#059669' : '#dc2626',
        }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* ════ HEADER ════ */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          </div>
          <div className="hero-text">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {library.ad}
              <Badge
                label={STATUS_LABELS[library.durum] || library.durum}
                color={statusInfo.color} bg={`${statusInfo.color}30`} border={`${statusInfo.color}50`}
              />
            </h1>
            <div className="hero-breadcrumb">
              <a href={href()}>Kütüphane</a><span>/</span>
              <a href={href('salonlar')}>Salonlar</a><span>/</span><span>{library.ad}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {library.durum !== 'ACTIVE' && (
            <button onClick={() => handleStatusChange('ACTIVE')} style={{
              padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff',
              borderRadius: '10px', border: '1px solid rgba(255,255,255,0.25)', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(10px)',
            }}>Aktifleştir</button>
          )}
          {library.durum === 'ACTIVE' && (
            <button onClick={() => handleStatusChange('MAINTENANCE')} style={{
              padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff',
              borderRadius: '10px', border: '1px solid rgba(255,255,255,0.25)', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(10px)',
            }}>Bakıma Al</button>
          )}
          {library.durum !== 'INACTIVE' && (
            <button onClick={() => handleStatusChange('INACTIVE')} style={{
              padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff',
              borderRadius: '10px', border: '1px solid rgba(255,255,255,0.25)', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(10px)',
            }}>Pasifleştir</button>
          )}
          <button onClick={handleDelete} style={{
            padding: '8px 16px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5',
            borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)', fontSize: '12px',
            fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(10px)',
          }}>Sil</button>
        </div>
      </div>

      {/* KPI Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px',
      }}>
        {[
          { label: 'Toplam Masa', value: library.toplam_masa ?? 0, icon: '🪑', bg: '#f0f9ff', border: '#bae6fd' },
          { label: 'Aktif Masa',  value: library.aktif_masa ?? 0,  icon: '✅', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Dolu',        value: library.dolu_masa ?? 0,   icon: '🔴', bg: '#fef2f2', border: '#fecaca' },
          { label: 'Boş',         value: library.bos_masa ?? 0,    icon: '🟢', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Doluluk',     value: `%${doluluk}`,            icon: '📊', bg: '#f5f3ff', border: '#c4b5fd' },
        ].map((kpi, i) => (
          <div key={i} style={{
            padding: '18px 20px', textAlign: 'center', borderRadius: '16px',
            backgroundColor: kpi.bg, border: `1.5px solid ${kpi.border}`,
            transition: 'all 0.2s',
          }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>{kpi.icon} {kpi.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ════ TABS BAR ════ */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px', overflowX: 'auto',
        borderBottom: '2px solid #f3f4f6', paddingBottom: '0',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: 600,
              color: activeTab === tab.key ? '#1d4ed8' : '#6b7280',
              backgroundColor: 'transparent', border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #1d4ed8' : '2px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              marginBottom: '-2px',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ════ TAB CONTENT ════ */}
      {tabLoading ? (
        <div style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Veriler yükleniyor...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <>
          {activeTab === 'genel' && <GenelTab library={library} onSave={loadLibrary} showToast={showToast} />}
          {activeTab === 'masalar' && (
            <MasalarTab
              seats={seats}
              salonAdi={library.ad}
              subeAdi={library.sube_adi}
              kurumBranding={activeKurum}
              showBulkForm={showBulkSeatForm}
              onToggleBulkForm={() => setShowBulkSeatForm(p => !p)}
              onBulkCreate={handleBulkCreateSeats}
              onStatusChange={handleSeatStatusChange}
            />
          )}
          {activeTab === 'yoklama' && (
            <YoklamaTab
              libraryId={libraryId}
              libraryName={library.ad}
              librarySubeId={library.sube_id}
              librarySubeAdi={library.sube_adi}
            />
          )}
          {activeTab === 'atamalar' && (
            <AtamalarTab
              seatAssignments={seatAssignments}
              salonAdi={library.ad}
              subeAdi={library.sube_adi}
              kurumBranding={activeKurum}
              onEnd={handleEndSeatAssignment}
            />
          )}
          {activeTab === 'loglar' && <LoglarTab logs={auditLogs} />}
        </>
      )}

      <KutuphaneConfirmModal
        open={endSeatConfirmId !== null}
        title="Masa atamasını sonlandır"
        message="Bu öğrencinin masa atamasını sonlandırmak istediğinize emin misiniz? Masa tekrar müsait hale gelecektir."
        confirmLabel="Evet, sonlandır"
        cancelLabel="Vazgeç"
        tone="danger"
        loading={endingSeat}
        onConfirm={confirmEndSeatAssignment}
        onCancel={() => !endingSeat && setEndSeatConfirmId(null)}
      />
    </div>
  );
}



/* ════════════════════════════════════════════════════════════
   TAB: GENEL BİLGİLER
   ════════════════════════════════════════════════════════════ */
function GenelTab({ library, onSave, showToast, readOnly = false }: {
  library: Library; onSave: () => void; showToast: (t: 'success' | 'error', m: string) => void; readOnly?: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await updateLibrary(library.id, {
        ad: fd.get('ad') as string,
        aciklama: fd.get('aciklama') as string,
        kapasite: Number(fd.get('kapasite')),
        kurallar: fd.get('kurallar') as string,
      });
      if (res.success) {
        showToast('success', 'Bilgiler güncellendi');
        setEditMode(false);
        onSave();
      }
    } catch { showToast('error', 'Kaydetme hatası'); }
    setSaving(false);
  };

  return (
    <div>
      {/* Salon Bilgileri */}
      <Card style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#111827' }}>📋 Salon Bilgileri</h3>
          {!editMode && !readOnly && (
            <button onClick={() => setEditMode(true)} style={{
              padding: '6px 14px', backgroundColor: '#eff6ff', color: '#1d4ed8',
              borderRadius: '7px', border: '1px solid #bfdbfe', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              ✏️ Düzenle
            </button>
          )}
        </div>

        {editMode ? (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <FormField label="Salon Adı" name="ad" defaultValue={library.ad} required />
            <FormField label="Açıklama" name="aciklama" defaultValue={library.aciklama} textarea />
            <FormField label="Kapasite" name="kapasite" defaultValue={String(library.kapasite)} type="number" required />
            <FormField label="Kurallar" name="kurallar" defaultValue={library.kurallar} textarea />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" onClick={() => setEditMode(false)} style={cancelBtnStyle}>İptal</button>
              <button type="submit" disabled={saving} style={saveBtnStyle}>
                {saving ? '💾 Kaydediliyor...' : '💾 Kaydet'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <InfoRow label="Salon Adı" value={library.ad} />
            <InfoRow label="Kod" value={library.kod} mono />
            <InfoRow label="Açıklama" value={library.aciklama || '—'} />
            <InfoRow label="Kapasite" value={String(library.kapasite)} />
            <InfoRow label="Dolap" value={library.dolap_var_mi ? `Var (${library.dolap_sayisi} adet)` : 'Yok'} />
            <InfoRow label="Kurallar" value={library.kurallar || '—'} />
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      <span style={{ fontSize: '13px', color: '#6b7280', minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: '#111827', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

function FormField({ label, name, defaultValue, type, required, textarea }: {
  label: string; name: string; defaultValue?: string; type?: string; required?: boolean; textarea?: boolean;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '13px', outline: 'none', resize: textarea ? 'vertical' as const : undefined,
  };
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {textarea ? (
        <textarea name={name} defaultValue={defaultValue} rows={3} style={inputStyle} />
      ) : (
        <input name={name} type={type || 'text'} defaultValue={defaultValue} required={required} style={inputStyle} />
      )}
    </div>
  );
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px', backgroundColor: '#f3f4f6', color: '#374151',
  borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
};
const saveBtnStyle: React.CSSProperties = {
  padding: '8px 20px', backgroundColor: '#1d4ed8', color: '#fff',
  borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
};

/* ════════════════════════════════════════════════════════════
   TAB: MASALAR
   ════════════════════════════════════════════════════════════ */
function MasalarTab({ seats, salonAdi, subeAdi, kurumBranding, showBulkForm, onToggleBulkForm, onBulkCreate, onStatusChange, readOnly = false }: {
  seats: Seat[];
  salonAdi: string;
  subeAdi?: string;
  kurumBranding?: import('@/lib/contexts/KurumContext').Kurum | null;
  showBulkForm: boolean;
  onToggleBulkForm: () => void;
  onBulkCreate: (e: React.FormEvent<HTMLFormElement>) => void;
  onStatusChange: (id: string, s: SeatStatus) => void;
  readOnly?: boolean;
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filtered = filterStatus === 'ALL' ? seats : seats.filter(s => s.durum === filterStatus);

  const stats = useMemo(() => {
    const s = { total: seats.length, available: 0, occupied: 0, reserved: 0, oos: 0 };
    seats.forEach(seat => {
      if (seat.durum === 'AVAILABLE') s.available++;
      else if (seat.durum === 'OCCUPIED') s.occupied++;
      else if (seat.durum === 'RESERVED') s.reserved++;
      else s.oos++;
    });
    return s;
  }, [seats]);

  const handlePrintList = () => {
    const rows = seats
      .filter((seat) => seat.atanan_ogrenci)
      .map((seat) => ({
        no: seat.masa_no || seat.id,
        ogrenci: seat.atanan_ogrenci || '',
        tip: seat.masa_tipi,
        durum: SEAT_STATUS_LABELS[seat.durum] || seat.durum,
      }));
    const html = buildSeatStudentListPrintHtml({
      meta: {
        title: 'Oturma Planı',
        subtitle: salonAdi,
        subeAdi,
        kurumBranding,
      },
      rows,
      salonAdi,
    });
    openKutuphanePrintWindow(html);
  };

  return (
    <div>
      {/* Toolbar */}
      <Card style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
              <span style={{ color: '#374151', fontWeight: 600 }}>{stats.total} masa</span>
              <span style={{ color: '#059669' }}>● {stats.available} müsait</span>
              <span style={{ color: '#dc2626' }}>● {stats.occupied} dolu</span>
              <span style={{ color: '#d97706' }}>● {stats.reserved} rezerve</span>
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px' }}
            >
              <option value="ALL">Tümü</option>
              {Object.entries(SEAT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handlePrintList} style={{
              padding: '6px 14px', backgroundColor: '#f0fdf4', color: '#059669',
              borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              📄 PDF Listesi
            </button>
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden' }}>
              {(['grid', 'table'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding: '5px 12px', fontSize: '12px', border: 'none', cursor: 'pointer',
                  backgroundColor: viewMode === m ? '#1d4ed8' : '#fff',
                  color: viewMode === m ? '#fff' : '#374151',
                }}>
                  {m === 'grid' ? '⊞ Grid' : '☰ Tablo'}
                </button>
              ))}
            </div>
            {!readOnly && (
            <button onClick={onToggleBulkForm} style={{
              padding: '6px 14px', backgroundColor: '#1d4ed8', color: '#fff',
              borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              + Toplu Ekle
            </button>
            )}
          </div>
        </div>
      </Card>

      {/* Toplu Oluşturma Formu */}
      {showBulkForm && !readOnly && (
        <Card style={{ padding: '20px', marginBottom: '16px', borderColor: '#bfdbfe' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 14px', color: '#1d4ed8' }}>🪑 Toplu Masa Oluştur</h4>
          <form onSubmit={onBulkCreate}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={formLabelStyle}>Adet *</label>
                <input name="adet" type="number" min={1} max={100} required style={formInputStyle} placeholder="10" />
              </div>
              <div>
                <label style={formLabelStyle}>Masa Tipi</label>
                <select name="masa_tipi" style={formInputStyle}>
                  <option value="STANDARD">Standart</option>
                  <option value="COMPUTER">Bilgisayar</option>
                  <option value="GROUP">Grup</option>
                </select>
              </div>
              <div>
                <label style={formLabelStyle}>Başlangıç No</label>
                <input name="baslangic_no" type="number" min={1} defaultValue={1} style={formInputStyle} />
              </div>
              <button type="submit" style={saveBtnStyle}>Oluştur</button>
              <button type="button" onClick={onToggleBulkForm} style={cancelBtnStyle}>İptal</button>
            </div>
          </form>
        </Card>
      )}

      {/* Masalar */}
      {filtered.length === 0 ? (
        <EmptyState icon="🪑" title="Masa bulunamadı" description="Toplu masa ekleme ile masaları oluşturabilirsiniz" />
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {filtered.map(seat => {
            const sc = SEAT_STATUS_COLORS[seat.durum] || SEAT_STATUS_COLORS.AVAILABLE;
            return (
              <Card key={seat.id} hover style={{ padding: '14px', textAlign: 'center', borderColor: sc.border }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827', marginBottom: '4px' }}>{seat.masa_no}</div>
                <Badge label={SEAT_STATUS_LABELS[seat.durum] || seat.durum} color={sc.color} bg={sc.bg} border={sc.border} />
                {seat.atanan_ogrenci && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>👤 {seat.atanan_ogrenci}</div>
                )}
                <div style={{ display: 'flex', gap: '4px', marginTop: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {seat.priz_var_mi && <span title="Priz" style={{ fontSize: '14px' }}>🔌</span>}
                  {seat.lamba_var_mi && <span title="Lamba" style={{ fontSize: '14px' }}>💡</span>}
                </div>
                <select
                  value={seat.durum}
                  onChange={e => onStatusChange(seat.id, e.target.value as SeatStatus)}
                  style={{
                    marginTop: '8px', width: '100%', padding: '4px', fontSize: '11px',
                    border: '1px solid #e5e7eb', borderRadius: '6px', color: '#6b7280',
                  }}
                >
                  {Object.entries(SEAT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Masa No</th>
                <th style={thStyle}>Tip</th>
                <th style={thStyle}>Durum</th>
                <th style={thStyle}>Öğrenci</th>
                <th style={thStyle}>Özellikler</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(seat => {
                const sc = SEAT_STATUS_COLORS[seat.durum] || SEAT_STATUS_COLORS.AVAILABLE;
                return (
                  <tr key={seat.id}>
                    <td style={tdStyle}><span style={{ fontWeight: 700 }}>{seat.masa_no}</span></td>
                    <td style={tdStyle}>{seat.masa_tipi}</td>
                    <td style={tdStyle}><Badge label={SEAT_STATUS_LABELS[seat.durum] || seat.durum} color={sc.color} bg={sc.bg} border={sc.border} /></td>
                    <td style={tdStyle}>{seat.atanan_ogrenci || '—'}</td>
                    <td style={tdStyle}>
                      {seat.priz_var_mi && '🔌 '}
                      {seat.lamba_var_mi && '💡 '}
                      {!seat.priz_var_mi && !seat.lamba_var_mi && '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <select
                        value={seat.durum}
                        onChange={e => onStatusChange(seat.id, e.target.value as SeatStatus)}
                        style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                      >
                        {Object.entries(SEAT_STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const formLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px',
};
const formInputStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px',
};

/* ════════════════════════════════════════════════════════════
   TAB: YOKLAMA
   ════════════════════════════════════════════════════════════ */
function YoklamaTab({
  libraryId,
  libraryName,
  librarySubeId,
  librarySubeAdi,
}: {
  libraryId: string;
  libraryName: string;
  librarySubeId?: number;
  librarySubeAdi?: string;
}) {
  const { activeKurum } = useKurum();
  const { isCoachMode } = useKutuphanePath();
  const templatesBasePath = isCoachMode ? '/coach/iletisim/sablonlar' : '/admin/iletisim/sablonlar';

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Yoklama detay modal
  const [detailSession, setDetailSession] = useState<AttendanceSession | null>(null);
  const [detailRecords, setDetailRecords] = useState<AttendanceRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingRecords, setSavingRecords] = useState(false);
  const [detailSortBy, setDetailSortBy] = useState<'student' | 'desk'>('desk');

  // Veli bildirimi
  const [notifyStatus, setNotifyStatus] = useState<AttendanceNotifyStatusResponse | null>(null);
  const [notifyConfig, setNotifyConfig] = useState<AttendanceNotifyConfig | null>(null);
  const [previewEvent, setPreviewEvent] = useState<AttendanceNotifyEventType | null>(null);
  const [previewOgrenciIds, setPreviewOgrenciIds] = useState<number[] | undefined>(undefined);
  const [pendingBanner, setPendingBanner] = useState<AttendancePendingNotification | null>(null);
  const [showNotifySettings, setShowNotifySettings] = useState(false);

  // Yoklama aç modal
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openType, setOpenType] = useState<'PERIOD' | 'LESSON'>('PERIOD');
  const [selectedPeriyot, setSelectedPeriyot] = useState('MORNING');
  const [subeler, setSubeler] = useState<SubeInfo[]>([]);
  const [selectedSube, setSelectedSube] = useState<number | null>(null);

  // Yoklama kağıdı
  const [showSheet, setShowSheet] = useState(false);
  const [sheetData, setSheetData] = useState<AttendanceSheetData | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetMode, setSheetMode] = useState<'daily' | 'weekly'>('daily');
  const [sheetOrientation, setSheetOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Haftalık özet
  const [showWeekly, setShowWeekly] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeeklySummary | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const showToastMsg = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // Ders programı (şube bazlı)
  const [dersProgrami, setDersProgrami] = useState<any>(null);

  // Ders programına göre aktif periyotları hesapla
  const getActivePeriyotlar = useCallback((tarih: string): string[] => {
    if (!dersProgrami || !dersProgrami.gun_bazli_aktiflik) return ['MORNING', 'AFTERNOON', 'EVENING'];
    const d = new Date(tarih);
    // Python weekday: 0=Mon, JS: 0=Sun → dönüştür
    const jsDay = d.getDay();
    const pyDay = jsDay === 0 ? 6 : jsDay - 1;
    const gunConf = dersProgrami.gun_bazli_aktiflik[String(pyDay)];
    if (!gunConf || !gunConf.aktif) return [];
    return gunConf.periyotlar || [];
  }, [dersProgrami]);

  // Aktif periyot seçenekleri (bugün için)
  const PERIYOT_OPTIONS = useMemo(() => {
    const aktifler = getActivePeriyotlar(selectedDate);
    return ALL_PERIYOT_OPTIONS.map(p => ({
      ...p,
      disabled: !aktifler.includes(p.key),
    }));
  }, [selectedDate, getActivePeriyotlar]);

  // Yoklama oturumlarını yükle
  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAttendanceSessions(libraryId, { tarih: selectedDate });
      if (res.success && res.data) setSessions(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [libraryId, selectedDate]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Şube ders programını salonun şubesinden yükle
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchSubeler();
        if (res.data) {
          const subs = res.data as SubeInfo[];
          setSubeler(subs);
          const targetSubeId = librarySubeId || subs.find((s) => s.program_var)?.id;
          if (targetSubeId) {
            setSelectedSube(targetSubeId);
            try {
              const { fetchDersProgramlari } = await import('@/lib/kutuphane-api');
              const pRes = await fetchDersProgramlari({ sube_id: targetSubeId });
              if (pRes.success && pRes.data) {
                const prog = Array.isArray(pRes.data) ? pRes.data[0] : pRes.data;
                if (prog) setDersProgrami(prog);
              }
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    })();
  }, [librarySubeId]);

  // Yoklama aç
  const handleOpenSession = async () => {
    if (!selectedPeriyot) { showToastMsg('error', 'Lütfen bir periyot seçin'); return; }
    try {
      if (openType === 'LESSON') {
        if (!selectedSube) { showToastMsg('error', 'Ders bazlı yoklama için şube seçin'); return; }
        const res = await openLessonAttendanceSessions(libraryId, {
          periyot_kodu: selectedPeriyot,
          tarih: selectedDate,
          sube_id: selectedSube,
        });
        if (res.success) {
          const count = Array.isArray(res.data) ? res.data.length : 0;
          showToastMsg('success', `${count} ders yoklaması açıldı`);
          setShowOpenModal(false);
          loadSessions();
        } else {
          showToastMsg('error', (res as any).error || 'Yoklama açılamadı');
        }
      } else {
        const res = await openAttendanceSession(libraryId, {
          periyot_kodu: selectedPeriyot,
          tarih: selectedDate,
        });
        if (res.success) {
          showToastMsg('success', 'Yoklama oturumu açıldı');
          setShowOpenModal(false);
          loadSessions();
        } else {
          showToastMsg('error', (res as any).error || 'Yoklama açılamadı');
        }
      }
    } catch (err: any) {
      showToastMsg('error', err.message || 'Hata');
    }
  };

  const handleOpenAllPeriods = async () => {
    const aktifler = getActivePeriyotlar(selectedDate);
    if (aktifler.length === 0) {
      showToastMsg('error', 'Bu gün için aktif periyot yok');
      return;
    }
    let opened = 0;
    let skipped = 0;
    for (const pk of aktifler) {
      const existing = sessions.some(s => s.periyot_kodu === pk && s.yoklama_tipi !== 'LESSON');
      if (existing) { skipped++; continue; }
      try {
        const res = await openAttendanceSession(libraryId, { periyot_kodu: pk, tarih: selectedDate });
        if (res.success) opened++;
      } catch { /* ignore */ }
    }
    if (opened > 0) {
      showToastMsg('success', `${opened} periyot yoklaması açıldı${skipped ? ` (${skipped} zaten vardı)` : ''}`);
      setShowOpenModal(false);
      loadSessions();
    } else if (skipped > 0) {
      showToastMsg('error', 'Tüm aktif periyotlar için yoklama zaten açık');
    } else {
      showToastMsg('error', 'Yoklama açılamadı');
    }
  };

  const openYoklamaModal = () => {
    const firstActive = PERIYOT_OPTIONS.find(p => !p.disabled)?.key || 'MORNING';
    setSelectedPeriyot(firstActive);
    if (librarySubeId) setSelectedSube(librarySubeId);
    setShowOpenModal(true);
  };

  // Yoklama kapat
  const handleCloseSession = async (sessionId: string) => {
    if (!confirm('Bu yoklama oturumunu kapatmak istediğinize emin misiniz?')) return;
    try {
      const res = await closeAttendanceSession(libraryId, sessionId);
      if (res.success) {
        showToastMsg('success', 'Yoklama kapatıldı');
        loadSessions();
        if (detailSession?.id === sessionId) setDetailSession(null);
      }
    } catch { showToastMsg('error', 'Hata'); }
  };

  const handleReopenSession = async (sessionId: string) => {
    if (!confirm('Bu yoklama oturumunu tekrar açmak istediğinize emin misiniz?')) return;
    try {
      const res = await reopenAttendanceSession(libraryId, sessionId);
      if (res.success) {
        showToastMsg('success', 'Yoklama tekrar açıldı');
        loadSessions();
        // Detay modalde açıksa güncelle
        if (detailSession?.id === sessionId) {
          setDetailSession({ ...detailSession, durum: 'OPEN' });
        }
      } else {
        showToastMsg('error', res.error || 'Açılamadı');
      }
    } catch { showToastMsg('error', 'Hata'); }
  };

  // Yoklama detayını yükle
  const loadNotifyData = useCallback(async (sessionId: string) => {
    try {
      const [statusRes, configRes] = await Promise.all([
        fetchAttendanceNotifyStatus(libraryId, sessionId),
        fetchAttendanceNotifyConfig(),
      ]);
      if (statusRes.success && statusRes.data) setNotifyStatus(statusRes.data);
      if (configRes.success && configRes.data) setNotifyConfig(configRes.data);
    } catch { /* ignore */ }
  }, [libraryId]);

  const loadDetail = async (session: AttendanceSession) => {
    setDetailSession(session);
    setDetailLoading(true);
    setPendingBanner(null);
    try {
      const res = await fetchAttendanceSessionDetail(libraryId, session.id);
      if (res.success && res.data) {
        setDetailRecords((res.data as any).records || []);
      }
      await loadNotifyData(session.id);
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const openNotifyPreview = (event: AttendanceNotifyEventType, ogrenciIds?: number[]) => {
    setPreviewEvent(event);
    setPreviewOgrenciIds(ogrenciIds);
  };

  const handleNotifySent = async (sent: number) => {
    if (sent > 0) {
      showToastMsg('success', `${sent} veliye WhatsApp mesajı iletildi`);
    } else {
      showToastMsg('error', 'Mesaj gönderilemedi — önizlemede atlanan alıcıları kontrol edin');
    }
    if (detailSession) await loadNotifyData(detailSession.id);
    setPendingBanner(null);
  };

  // Yoklama kaydet
  const handleSaveRecords = async () => {
    if (!detailSession) return;
    setSavingRecords(true);
    try {
      const records = detailRecords.map(r => ({
        ogrenci_id: r.ogrenci_id,
        durum: r.durum,
        notlar: r.notlar || '',
        giris_saati: r.giris_saati || '',
        cikis_saati: r.cikis_saati || '',
      }));
      const res = await saveAttendanceRecords(libraryId, detailSession.id, records);
      if (res.success) {
        const saved = (res.data as any)?.saved || records.length;
        showToastMsg('success', `${saved} öğrenci güncellendi`);
        if ((res.data as any)?.records) {
          setDetailRecords((res.data as any).records);
        }
        const pending = (res.data as any)?.pending_notifications as AttendancePendingNotification[] | undefined;
        if (pending?.length) {
          setPendingBanner(pending[0]);
        }
        await loadNotifyData(detailSession.id);
        loadSessions();
      } else {
        showToastMsg('error', (res as any).error || 'Kaydetme başarısız');
      }
    } catch (err: any) {
      showToastMsg('error', err.message || 'Hata');
    }
    setSavingRecords(false);
  };

  // 5 dakikaya yuvarla (aşağı)
  const roundTo5Min = (d: Date): string => {
    const h = d.getHours().toString().padStart(2, '0');
    const m = (Math.floor(d.getMinutes() / 5) * 5).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const updateRecord = (recordId: string, field: string, value: string) => {
    setDetailRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      const updated = { ...r, [field]: value };
      if (field === 'durum') {
        if (value === 'LATE' && !r.giris_saati) {
          updated.giris_saati = roundTo5Min(new Date());
        } else if (value !== 'LATE') {
          updated.giris_saati = null;
        }
        if (value === 'ABSENT' || value === 'EXCUSED') {
          updated.cikis_saati = null;
        }
      }
      if (field === 'cikis_saati' && value && !r.cikis_saati) {
        // çıkış saati ilk kez girildi
      }
      return updated;
    }));
  };

  const setAllStatus = (status: AttendanceStatus) => {
    const now = roundTo5Min(new Date());
    setDetailRecords(prev => prev.map(r => {
      if (r.izinli_mi) return r;
      const updated = { ...r, durum: status };
      if (status === 'LATE') {
        if (!r.giris_saati) updated.giris_saati = now;
      } else {
        // GEÇ dışı seçilince saati temizle
        updated.giris_saati = null;
      }
      return updated;
    }));
  };

  // Sıralama seçeneği
  const [sheetSortBy, setSheetSortBy] = useState<'desk' | 'student'>('desk');

  // Periyot sıralama sabiti: SABAH → ÖĞLE → AKŞAM
  const PERIYOT_SIRA: Record<string, number> = { 'MORNING': 0, 'AFTERNOON': 1, 'EVENING': 2, 'CUSTOM': 3 };

  // Yoklama kağıdı yükle - TÜM periyotlar (aktif olanlar)
  const loadSheet = async (mode: 'daily' | 'weekly' = 'daily') => {
    setSheetMode(mode);
    setShowSheet(true);
    setSheetLoading(true);
    try {
      if (mode === 'weekly') {
        const { monday, sunday, days } = getWeekRange(selectedDate);
        const allStudents: Map<number, any> = new Map();
        const weekDays: WeekDayBlock[] = [];
        for (const d of days) {
          const tarih = d.toISOString().split('T')[0];
          const gunAdi = d.toLocaleDateString('tr-TR', { weekday: 'long' });
          const dayColumns: any[] = [];
          const aktifPeriyotlar = getActivePeriyotlar(tarih);
          const gunKapali = aktifPeriyotlar.length === 0;
          try {
            const res = await fetchAttendanceSheetData(libraryId, { tarih });
            if (res.success && res.data) {
              const sd = res.data as AttendanceSheetData;
              sd.columns.forEach(col => {
                if (!gunKapali && !aktifPeriyotlar.includes(col.periyot)) return;
                dayColumns.push({ ...col, id: `${tarih}_${col.id}`, original_id: col.id, gun_tarih: tarih });
              });
              sd.students.forEach(stu => {
                if (!allStudents.has(stu.ogrenci_id)) {
                  allStudents.set(stu.ogrenci_id, { ...stu, yoklamalar: {} });
                }
                const existing = allStudents.get(stu.ogrenci_id)!;
                sd.columns.forEach(col => {
                  if (stu.yoklamalar[col.id]) {
                    existing.yoklamalar[`${tarih}_${col.id}`] = stu.yoklamalar[col.id];
                  }
                });
              });
            }
          } catch { /* ignore */ }

          if (!gunKapali && dayColumns.length === 0 && aktifPeriyotlar.length > 0) {
            aktifPeriyotlar.forEach(pk => {
              const lbl = ALL_PERIYOT_OPTIONS.find(p => p.key === pk)?.shortLabel || pk;
              dayColumns.push({ id: `${tarih}_empty_${pk}`, label: lbl, periyot: pk, ders_no: null, original_id: `empty_${pk}`, gun_tarih: tarih, empty: true });
            });
          }

          dayColumns.sort((a, b) => {
            const sa = PERIYOT_SIRA[a.periyot] ?? 99;
            const sb = PERIYOT_SIRA[b.periyot] ?? 99;
            if (sa !== sb) return sa - sb;
            return (a.ders_no || 0) - (b.ders_no || 0);
          });

          weekDays.push({ tarih, gunAdi, columns: dayColumns, kapali: gunKapali });
        }
        const allColumns: any[] = [];
        weekDays.forEach(day => {
          day.columns.forEach(col => {
            allColumns.push({ ...col, label: col.label, gun_adi: day.gunAdi, gun_tarih: day.tarih });
          });
        });
        setSheetData({
          salon_adi: libraryName,
          tarih: formatWeekRangeLabel(monday, sunday),
          columns: allColumns,
          students: Array.from(allStudents.values()),
          weekDays,
        } as any);
      } else {
        // Günlük: tüm periyotları al, kapalı olanları filtrele
        const res = await fetchAttendanceSheetData(libraryId, { tarih: selectedDate });
        if (res.success && res.data) {
          const sd = res.data as AttendanceSheetData;
          sd.salon_adi = libraryName;
          const aktifPeriyotlar = getActivePeriyotlar(selectedDate);
          // Kapalı periyotların kolonlarını filtrele
          if (aktifPeriyotlar.length > 0) {
            sd.columns = sd.columns.filter(col => aktifPeriyotlar.includes(col.periyot));
          }
          // SABAH → ÖĞLE → AKŞAM sırasına göre sırala
          sd.columns.sort((a, b) => {
            const sa = PERIYOT_SIRA[a.periyot] ?? 99;
            const sb = PERIYOT_SIRA[b.periyot] ?? 99;
            if (sa !== sb) return sa - sb;
            return (a.ders_no || 0) - (b.ders_no || 0);
          });
          setSheetData(sd);
        }
      }
    } catch { /* ignore */ }
    setSheetLoading(false);
  };

  // Öğrencileri sırala
  const sortStudents = (students: any[]) => {
    return [...students].sort((a, b) => {
      if (sheetSortBy === 'desk') {
        const nA = parseInt(a.masa_no || '') || 9999;
        const nB = parseInt(b.masa_no || '') || 9999;
        if (nA !== nB) return nA - nB;
        return (a.masa_no || '').localeCompare(b.masa_no || '', 'tr');
      }
      return (a.ogrenci_adi || '').localeCompare(b.ogrenci_adi || '', 'tr');
    });
  };

  // Yazdırma / PDF — kurum logolu şablon
  const handlePrintSheet = () => {
    if (!sheetData) return;
    const weeklySD = sheetData as AttendanceSheetData & { weekDays?: WeekDayBlock[] };
    const branding = activeKurum ? brandingFromKurum(activeKurum) : null;
    const html = buildYoklamaPrintHtml({
      meta: {
        mode: sheetMode,
        salonAdi: libraryName,
        subeAdi: librarySubeAdi,
        tarihLabel: sheetData.tarih,
        kurumBranding: branding,
        orientation: sheetOrientation,
      },
      students: sheetData.students,
      columns: sheetData.columns,
      weekDays: weeklySD.weekDays,
      sortStudents,
    });
    openYoklamaPrintWindow(html);
  };

  // Kurumsal CSV/Excel indirme (backend-driven — shared.export)
  const [sheetExportFormat, setSheetExportFormat] = useState<'csv' | 'xlsx' | null>(null);

  const handleDownloadAttendanceExport = async (format: 'csv' | 'xlsx') => {
    if (!sheetData || sheetData.students.length === 0) return;
    const isWeekly = sheetMode === 'weekly';
    const weeklySD = sheetData as any;
    const sorted = sortStudents(sheetData.students);

    const columns: { key: string; label: string }[] = [
      { key: 'sira', label: '#' },
      { key: 'ogrenci', label: 'Öğrenci' },
      { key: 'masa', label: 'Masa' },
    ];

    const statusLabel = (yk: { izinli_mi?: boolean; durum?: string | null } | undefined, durumKapali: boolean) => {
      if (!yk) return '';
      if (yk.izinli_mi) return 'İzinli';
      if (durumKapali && yk.durum) return ATTENDANCE_STATUS_LABELS[yk.durum]?.label || yk.durum;
      return '';
    };

    const rows: Record<string, string>[] = [];

    if (isWeekly && weeklySD.weekDays) {
      const P: Record<string, string> = { MORNING: 'Sabah', AFTERNOON: 'Öğle', EVENING: 'Akşam' };
      (weeklySD.weekDays as any[]).forEach((day: any) => {
        const gunLabel = day.gunAdi.charAt(0).toUpperCase() + day.gunAdi.slice(1);
        if (day.columns.length > 0) {
          day.columns.forEach((col: any) => {
            columns.push({
              key: `${day.tarih}_${col.id}`,
              label: `${gunLabel} - ${P[col.periyot] || col.label || ''}`,
            });
          });
        } else {
          columns.push({ key: `${day.tarih}_empty`, label: gunLabel });
        }
      });
      sorted.forEach((stu, idx) => {
        const row: Record<string, string> = { sira: String(idx + 1), ogrenci: stu.ogrenci_adi, masa: stu.masa_no || '' };
        (weeklySD.weekDays as any[]).forEach((day: any) => {
          if (day.columns.length > 0) {
            day.columns.forEach((col: any) => {
              row[`${day.tarih}_${col.id}`] = statusLabel(stu.yoklamalar[col.id], col.durum === 'CLOSED');
            });
          } else {
            row[`${day.tarih}_empty`] = '';
          }
        });
        rows.push(row);
      });
    } else {
      sheetData.columns.forEach((col) => columns.push({ key: col.id, label: col.label }));
      sorted.forEach((stu, idx) => {
        const row: Record<string, string> = { sira: String(idx + 1), ogrenci: stu.ogrenci_adi, masa: stu.masa_no || '' };
        sheetData.columns.forEach((col) => {
          row[col.id] = statusLabel(stu.yoklamalar[col.id], col.durum === 'CLOSED');
        });
        rows.push(row);
      });
    }

    setSheetExportFormat(format);
    try {
      const blob = await downloadAttendanceSheetExport(libraryId, {
        columns,
        rows,
        meta: { tarih: sheetData.tarih || '', mode: isWeekly ? 'weekly' : 'daily' },
        format,
      });
      downloadBlob(blob, `yoklama_${isWeekly ? 'haftalik' : 'gunluk'}_${sheetData.tarih?.replace(/\s/g, '_') || 'liste'}.${format}`);
      showToastMsg('success', `${format === 'xlsx' ? 'Excel' : 'CSV'} dosyası indirildi`);
    } catch (e) {
      showToastMsg('error', e instanceof Error ? e.message : 'Dışa aktarma başarısız');
    } finally {
      setSheetExportFormat(null);
    }
  };

  // PDF indirme (yazdır dialogu ile)
  const handleDownloadPDF = () => {
    handlePrintSheet();
  };

  // Haftalık özet yükle
  const loadWeekly = async () => {
    setShowWeekly(true);
    setWeeklyLoading(true);
    try {
      const res = await fetchWeeklyAttendanceSummary(libraryId);
      if (res.success && res.data) setWeeklyData(res.data as WeeklySummary);
    } catch { /* ignore */ }
    setWeeklyLoading(false);
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 10000,
          padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
          color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          backgroundColor: toast.type === 'success' ? '#059669' : '#dc2626',
        }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <Card style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}
            />
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {sessions.length} yoklama
              {sessions.filter(s => s.durum === 'OPEN').length > 0 && (
                <> <Badge label={`${sessions.filter(s => s.durum === 'OPEN').length} açık`} color="#059669" bg="#ecfdf5" border="#a7f3d0" /></>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => loadWeekly()} style={toolbarBtn('#0c4a6e', '#f0f9ff', '#bae6fd')}>📊 Haftalık Özet</button>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button onClick={() => { setSheetOrientation('portrait'); loadSheet('daily'); }} style={toolbarBtn('#854d0e', '#fefce8', '#fde68a')}>📋 Günlük Liste</button>
            </div>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button onClick={() => { setSheetOrientation('landscape'); loadSheet('weekly'); }} style={toolbarBtn('#7f1d1d', '#fef2f2', '#fca5a5')}>📋 Haftalık Liste</button>
            </div>
            <button onClick={() => setShowNotifySettings(true)} style={toolbarBtn('#334155', '#f8fafc', '#cbd5e1')}>
              ⚙️ Bildirim şablonları
            </button>
            <button onClick={openYoklamaModal} style={{
              padding: '7px 16px', backgroundColor: '#1d4ed8', color: '#fff',
              borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              + Yoklama Aç
            </button>
          </div>
        </div>
      </Card>

      {/* Sessions List */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon="📋" title="Bu tarihte yoklama oturumu yok" description="Yeni yoklama açmak için yukarıdaki butonu kullanın" />
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {sessions.map(s => (
            <Card key={s.id} hover style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: s.durum === 'OPEN'
                      ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                      : 'linear-gradient(135deg, #94a3b8, #64748b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, flexShrink: 0,
                  }}>
                    {s.yoklama_tipi === 'LESSON' ? '📝' : '📋'}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                      {s.oturum_adi || 'Yoklama'}
                      {s.ders_no && <span style={{ marginLeft: 8, fontSize: '11px', color: '#6366f1', fontWeight: 600 }}>{s.ders_no}. Ders</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>
                      {PERIOD_LABELS[s.periyot_kodu || ''] || s.periyot_kodu}
                      {' · '}{s.yoklama_tipi === 'LESSON' ? 'Ders Bazlı' : 'Periyot Bazlı'}
                      {s.toplam_kayit != null && ` · ${s.toplam_kayit} kayıt`}
                      {s.katilim_orani != null && ` · %${s.katilim_orani} katılım`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Badge
                    label={s.durum === 'OPEN' ? '● Açık' : '● Kapalı'}
                    color={s.durum === 'OPEN' ? '#059669' : '#6b7280'}
                    bg={s.durum === 'OPEN' ? '#ecfdf5' : '#f9fafb'}
                    border={s.durum === 'OPEN' ? '#a7f3d0' : '#e5e7eb'}
                  />
                  <button onClick={() => loadDetail(s)} style={actionBtn('#1d4ed8', '#eff6ff')}>Yoklama Al</button>
                  {s.durum === 'OPEN' ? (
                    <button onClick={() => handleCloseSession(s.id)} style={actionBtn('#d97706', '#fffbeb')}>Kapat</button>
                  ) : (
                    <button onClick={() => handleReopenSession(s.id)} style={actionBtn('#059669', '#ecfdf5')}>Tekrar Aç</button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ═══ YOKLAMA AÇ MODALı ═══ */}
      {showOpenModal && (
        <PortalModal>
          <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setShowOpenModal(false); }}>
            <div style={modalBoxStyle(480)} onClick={(e) => e.stopPropagation()}>
              <div style={modalHeaderStyle}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>📋 Yoklama Aç</h3>
                <button onClick={() => setShowOpenModal(false)} style={closeBtnStyle}>✕</button>
              </div>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Tip seçimi */}
                <div>
                  <label style={modalLabel}>Yoklama Tipi</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { key: 'PERIOD' as const, label: '📋 Periyot Bazlı', desc: 'Tüm periyot için tek yoklama' },
                      { key: 'LESSON' as const, label: '📝 Ders Bazlı', desc: 'Her ders için ayrı yoklama' },
                    ].map(t => (
                      <button key={t.key} onClick={() => setOpenType(t.key)} style={{
                        flex: 1, padding: '12px', borderRadius: '10px', textAlign: 'left' as const,
                        border: openType === t.key ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                        backgroundColor: openType === t.key ? '#eff6ff' : '#fff',
                        cursor: 'pointer',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{t.label}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Periyot seçimi */}
                <div>
                  <label style={modalLabel}>Periyot</label>
                  <select
                    value={selectedPeriyot}
                    onChange={(e) => setSelectedPeriyot(e.target.value)}
                    style={modalSelectStyle}
                  >
                    {PERIYOT_OPTIONS.map(p => (
                      <option key={p.key} value={p.key} disabled={(p as any).disabled}>
                        {(p as any).disabled ? `🚫 ${p.label} (Kapalı)` : p.label}
                      </option>
                    ))}
                  </select>
                  {PERIYOT_OPTIONS.every((p: any) => p.disabled) && (
                    <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', background: '#fef2f2', padding: '6px 10px', borderRadius: 6 }}>
                      ⚠️ Bu gün için ders programında hiçbir periyot aktif değil
                    </div>
                  )}
                </div>

                {/* Şube seçimi (ders bazlı) */}
                {openType === 'LESSON' && (
                  <div>
                    <label style={modalLabel}>Şube (Ders Programı)</label>
                    <select
                      value={selectedSube || ''}
                      onChange={(e) => setSelectedSube(e.target.value ? Number(e.target.value) : null)}
                      style={modalSelectStyle}
                    >
                      <option value="">Şube seçin...</option>
                      {subeler.filter(s => s.program_var).map(s => (
                        <option key={s.id} value={s.id}>{s.ad}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      {librarySubeAdi
                        ? `Salon şubesi: ${librarySubeAdi} — ders programı bu şubeden yüklenir`
                        : 'Ders bazlı yoklama için şubenin ders programı tanımlı olmalıdır'}
                    </div>
                  </div>
                )}

                {/* Tarih */}
                <div>
                  <label style={modalLabel}>Tarih</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    style={modalSelectStyle}
                  />
                </div>
              </div>
              <div style={modalFooterStyle}>
                <button onClick={() => setShowOpenModal(false)} style={cancelBtnStyle}>İptal</button>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {openType === 'PERIOD' && PERIYOT_OPTIONS.some(p => !p.disabled) && (
                    <button
                      onClick={handleOpenAllPeriods}
                      style={{ ...cancelBtnStyle, borderColor: '#93c5fd', color: '#1d4ed8', backgroundColor: '#eff6ff' }}
                    >
                      Tüm aktif periyotları aç
                    </button>
                  )}
                  <button onClick={handleOpenSession} style={saveBtnStyle}>
                    Yoklama Aç
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ═══ YOKLAMA DETAY MODALı ═══ */}
      {detailSession && (
        <PortalModal>
          <YoklamaSessionDrawer
            session={detailSession}
            records={detailRecords}
            loading={detailLoading}
            saving={savingRecords}
            sortBy={detailSortBy}
            onSortByChange={setDetailSortBy}
            onClose={() => setDetailSession(null)}
            onSave={handleSaveRecords}
            onCloseSession={() => handleCloseSession(detailSession.id)}
            onReopenSession={() => handleReopenSession(detailSession.id)}
            onUpdateRecord={updateRecord}
            onSetAllStatus={setAllStatus}
            notifyStatus={notifyStatus}
            notifyConfig={notifyConfig}
            onNotify={(event, ids) => openNotifyPreview(event, ids)}
            onOpenSettings={() => setShowNotifySettings(true)}
            pendingBanner={pendingBanner}
            onDismissPending={() => setPendingBanner(null)}
            onPreviewPending={() => {
              if (pendingBanner) openNotifyPreview(pendingBanner.event_type, pendingBanner.ogrenci_ids);
            }}
            templatesBasePath={templatesBasePath}
            overlayStyle={overlayStyle}
            modalBoxStyle={modalBoxStyle}
            modalHeaderStyle={modalHeaderStyle}
            modalFooterStyle={modalFooterStyle}
            closeBtnStyle={closeBtnStyle}
            saveBtnStyle={saveBtnStyle}
            thStyle={thStyle}
            tdStyle={tdStyle}
            attendanceStatusLabels={ATTENDANCE_STATUS_LABELS}
            Badge={Badge}
            EmptyState={EmptyState}
          />
        </PortalModal>
      )}

      {previewEvent && detailSession && (
        <AttendanceNotifyPreviewModal
          libraryId={libraryId}
          sessionId={detailSession.id}
          eventType={previewEvent}
          ogrenciIds={previewOgrenciIds}
          sessionTitle={`${detailSession.oturum_adi || 'Yoklama'} — ${new Date(detailSession.tarih).toLocaleDateString('tr-TR')}`}
          onClose={() => { setPreviewEvent(null); setPreviewOgrenciIds(undefined); }}
          onSent={handleNotifySent}
        />
      )}

      <AttendanceNotifySettingsDrawer
        open={showNotifySettings}
        onClose={() => setShowNotifySettings(false)}
        onSaved={async () => {
          showToastMsg('success', 'Bildirim ayarları kaydedildi');
          if (detailSession) await loadNotifyData(detailSession.id);
          else {
            const cfg = await fetchAttendanceNotifyConfig();
            if (cfg.success && cfg.data) setNotifyConfig(cfg.data);
          }
        }}
      />

      {/* ═══ YOKLAMA KAĞIDI MODALı ═══ */}
      {showSheet && (
        <PortalModal>
          <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { setShowSheet(false); setSheetData(null); } }}>
            <div style={{ ...modalBoxStyle(1200), maxHeight: '94vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div style={modalHeaderStyle}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>
                    📋 Yoklama Listesi — {sheetMode === 'weekly' ? 'Haftalık' : 'Günlük'}
                  </h3>
                  {sheetData && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 4 }}>
                      {sheetData.salon_adi} — {sheetData.tarih} · Tüm Periyotlar
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Sıralama */}
                  <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', borderRadius: '8px', padding: '3px' }}>
                    {(['desk', 'student'] as const).map(s => (
                      <button key={s} onClick={() => setSheetSortBy(s)} style={{
                        padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        border: 'none',
                        backgroundColor: sheetSortBy === s ? '#fff' : 'transparent',
                        color: sheetSortBy === s ? '#1d4ed8' : '#6b7280',
                        boxShadow: sheetSortBy === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}>
                        {s === 'desk' ? '🪑 Masa Sırası' : '👤 Öğrenci Sırası'}
                      </button>
                    ))}
                  </div>
                  {/* Sayfa yönü */}
                  <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', borderRadius: '8px', padding: '3px' }}>
                    {(['portrait', 'landscape'] as const).map(o => (
                      <button key={o} onClick={() => setSheetOrientation(o)} style={{
                        padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        border: 'none',
                        backgroundColor: sheetOrientation === o ? '#fff' : 'transparent',
                        color: sheetOrientation === o ? '#1d4ed8' : '#6b7280',
                        boxShadow: sheetOrientation === o ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}>
                        {o === 'portrait' ? '📄 Dikey' : '📃 Yatay'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => handleDownloadAttendanceExport('xlsx')} disabled={sheetExportFormat !== null} style={actionBtn('#15803d', '#f0fdf4')}>
                    {sheetExportFormat === 'xlsx' ? '⏳ Hazırlanıyor…' : '📥 Excel'}
                  </button>
                  <button onClick={() => handleDownloadAttendanceExport('csv')} disabled={sheetExportFormat !== null} style={actionBtn('#15803d', '#f0fdf4')}>
                    {sheetExportFormat === 'csv' ? '⏳ Hazırlanıyor…' : '📥 CSV'}
                  </button>
                  <button onClick={handleDownloadPDF} style={actionBtn('#0369a1', '#f0f9ff')}>📄 PDF / Yazdır</button>
                  <button onClick={() => { setShowSheet(false); setSheetData(null); }} style={closeBtnStyle}>✕</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '16px 24px' }} id="yoklama-kagidi-print">
                {sheetLoading ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
                ) : !sheetData || sheetData.students.length === 0 ? (
                  <EmptyState icon="📋" title="Veri bulunamadı" description="Seçili tarih için yoklama verisi yok" />
                ) : sheetMode === 'weekly' ? (
                  /* ═══ HAFTALIK YOKLAMA LİSTESİ ═══ */
                  (() => {
                    const weeklySheetData = sheetData as any;
                    const weekDays: { tarih: string; gunAdi: string; columns: any[]; kapali?: boolean }[] = weeklySheetData.weekDays || [];
                    const sortedStudents = sortStudents(sheetData.students);
                    const PERIYOT_SHORT: Record<string, string> = { MORNING: 'S', AFTERNOON: 'Ö', EVENING: 'A', CUSTOM: 'Öz' };
                    const minW = weeklyTableMinWidth(weekDays);

                    return (
                      <>
                        <YoklamaSheetHeader
                          title="Haftalık Yoklama Listesi"
                          salonAdi={libraryName}
                          subeAdi={librarySubeAdi}
                          tarihLabel={sheetData.tarih}
                          ogrenciSayisi={sortedStudents.length}
                        />
                        <div className="yok-sheet-scroll">
                          <table className="yok-sheet-table" style={{ minWidth: minW }}>
                            <colgroup>
                              <col className="yok-col-num" />
                              <col className="yok-col-name" />
                              <col className="yok-col-desk" />
                              {weekDays.flatMap(day =>
                                (day.columns.length > 0 ? day.columns : [{ id: `${day.tarih}_empty` }]).map(col => (
                                  <col key={col.id} className="yok-col-period" />
                                ))
                              )}
                            </colgroup>
                            <thead>
                              <tr>
                                <th rowSpan={2} className="yok-col-num yok-sticky-num">#</th>
                                <th rowSpan={2} className="yok-col-name yok-sticky-name">Öğrenci</th>
                                <th rowSpan={2} className="yok-col-desk">Masa</th>
                                {weekDays.map(day => (
                                  <th
                                    key={day.tarih}
                                    colSpan={Math.max(day.columns.length, 1)}
                                    className={`yok-day-head${day.kapali ? ' closed' : ''}`}
                                  >
                                    {abbreviateDayName(day.gunAdi)}
                                    <span className="yok-day-date">
                                      {new Date(day.tarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                    </span>
                                  </th>
                                ))}
                              </tr>
                              <tr>
                                {weekDays.map(day => (
                                  day.columns.length > 0 ? day.columns.map((col: any) => (
                                    <th key={col.id} className="yok-period-head">
                                      {PERIYOT_SHORT[col.periyot] || (col.label || '').slice(0, 1)}
                                      {col.ders_no ? <span className="yok-period-ders">{col.ders_no}</span> : null}
                                    </th>
                                  )) : (
                                    <th key={`${day.tarih}_empty`} className="yok-period-head">—</th>
                                  )
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sortedStudents.map((stu, idx) => (
                                <tr key={stu.ogrenci_id}>
                                  <td className="yok-col-num yok-sticky-num">{idx + 1}</td>
                                  <td className="yok-col-name yok-sticky-name" title={stu.ogrenci_adi}>{stu.ogrenci_adi}</td>
                                  <td className="yok-col-desk">{stu.masa_no || '—'}</td>
                                  {weekDays.map(day => (
                                    day.columns.length > 0 ? day.columns.map((col: any) => {
                                      const yk = stu.yoklamalar[col.id];
                                      const isClosed = col.durum === 'CLOSED';
                                      return (
                                        <td key={col.id} className="yok-col-period">
                                          {yk?.izinli_mi ? (
                                            <span className="yok-sheet-mark" style={{ backgroundColor: '#e0e7ff', border: '1.2px solid #6366f1', color: '#6366f1' }}>İ</span>
                                          ) : isClosed && yk && yk.durum && yk.durum !== 'PRESENT' ? (
                                            <span className="yok-sheet-mark" style={{
                                              backgroundColor: ATTENDANCE_STATUS_LABELS[yk.durum]?.bg || '#f3f4f6',
                                              border: `1.2px solid ${ATTENDANCE_STATUS_LABELS[yk.durum]?.color || '#ccc'}`,
                                              color: ATTENDANCE_STATUS_LABELS[yk.durum]?.color || '#999',
                                            }}>
                                              {(ATTENDANCE_STATUS_LABELS[yk.durum]?.label || '').charAt(0)}
                                            </span>
                                          ) : (
                                            <span className="yok-sheet-check" />
                                          )}
                                        </td>
                                      );
                                    }) : (
                                      <td key={`${day.tarih}_empty`} className="yok-col-period">
                                        <span className="yok-sheet-check" style={{ borderColor: '#e5e7eb' }} />
                                      </td>
                                    )
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Lejant */}
                        <div style={{ marginTop: '12px', display: 'flex', gap: '14px', fontSize: '10px', color: '#6b7280', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, marginRight: '4px' }}>Lejant:</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, border: '1.5px solid #d1d5db' }} />
                            Var (Varsayılan)
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, backgroundColor: '#e0e7ff', border: '1.5px solid #6366f1', textAlign: 'center', lineHeight: '14px', fontSize: '8px', fontWeight: 700, color: '#6366f1' }}>İ</span>
                            İzinli
                          </span>
                          {Object.entries(ATTENDANCE_STATUS_LABELS).filter(([k]) => k !== 'PRESENT' && k !== 'EXCUSED').map(([, v]) => (
                            <span key={v.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, backgroundColor: v.bg, border: `1.5px solid ${v.color}`, textAlign: 'center', lineHeight: '14px', fontSize: '8px', fontWeight: 700, color: v.color }}>{v.label.charAt(0)}</span>
                              {v.label}
                            </span>
                          ))}
                        </div>
                      </>
                    );
                  })()
                ) : (
                  /* ═══ GÜNLÜK YOKLAMA LİSTESİ ═══ */
                  <>
                    <YoklamaSheetHeader
                      title="Günlük Yoklama Listesi"
                      salonAdi={libraryName}
                      subeAdi={librarySubeAdi}
                      tarihLabel={new Date(sheetData.tarih).toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      ogrenciSayisi={sheetData.students.length}
                    />
                    <div className="yok-sheet-scroll">
                    <table className="yok-sheet-table" style={{ minWidth: 168 + sheetData.columns.length * 40 }}>
                      <colgroup>
                        <col className="yok-col-num" />
                        <col className="yok-col-name" />
                        <col className="yok-col-desk" />
                        {sheetData.columns.map(col => (
                          <col key={col.id} style={{ width: 40, minWidth: 40 }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="yok-col-num">#</th>
                          <th className="yok-col-name">Öğrenci</th>
                          <th className="yok-col-desk">Masa</th>
                          {sheetData.columns.map(col => (
                            <th key={col.id} style={{ fontSize: '9px', padding: '4px 2px' }}>
                              <div>{(col.label || '').split(' ')[0]}</div>
                              <div style={{ fontSize: '7px', fontWeight: 500, color: '#94a3b8' }}>
                                {({ MORNING: 'S', AFTERNOON: 'Ö', EVENING: 'A' } as Record<string, string>)[col.periyot] || col.periyot?.slice(0, 2)}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortStudents(sheetData.students).map((stu, idx) => (
                          <tr key={stu.ogrenci_id}>
                            <td className="yok-col-num">{idx + 1}</td>
                            <td className="yok-col-name" title={stu.ogrenci_adi}>{stu.ogrenci_adi}</td>
                            <td className="yok-col-desk">{stu.masa_no || '—'}</td>
                            {sheetData.columns.map(col => {
                              const yk = stu.yoklamalar[col.id];
                              const isClosed = col.durum === 'CLOSED';
                              return (
                                <td key={col.id}>
                                  {yk?.izinli_mi ? (
                                    <span className="yok-sheet-mark" style={{ backgroundColor: '#e0e7ff', border: '1.2px solid #6366f1', color: '#6366f1' }}>İ</span>
                                  ) : isClosed && yk && yk.durum && yk.durum !== 'PRESENT' ? (
                                    <span className="yok-sheet-mark" style={{
                                      backgroundColor: ATTENDANCE_STATUS_LABELS[yk.durum]?.bg || '#f3f4f6',
                                      border: `1.2px solid ${ATTENDANCE_STATUS_LABELS[yk.durum]?.color || '#ccc'}`,
                                      color: ATTENDANCE_STATUS_LABELS[yk.durum]?.color || '#999',
                                    }}>
                                      {(ATTENDANCE_STATUS_LABELS[yk.durum]?.label || '').charAt(0)}
                                    </span>
                                  ) : (
                                    <span className="yok-sheet-check" />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    {/* Lejant */}
                    <div style={{ marginTop: '14px', display: 'flex', gap: '14px', fontSize: '11px', color: '#6b7280', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, marginRight: '4px' }}>Lejant:</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, border: '1.5px solid #d1d5db' }} />
                        Var (Varsayılan)
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, backgroundColor: '#e0e7ff', border: '1.5px solid #6366f1', textAlign: 'center', lineHeight: '14px', fontSize: '9px', fontWeight: 700, color: '#6366f1' }}>İ</span>
                        İzinli
                      </span>
                      {Object.entries(ATTENDANCE_STATUS_LABELS).filter(([k]) => k !== 'PRESENT' && k !== 'EXCUSED').map(([, v]) => (
                        <span key={v.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, backgroundColor: v.bg, border: `1.5px solid ${v.color}`, textAlign: 'center', lineHeight: '14px', fontSize: '9px', fontWeight: 700, color: v.color }}>{v.label.charAt(0)}</span>
                          {v.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ═══ HAFTALIK ÖZET MODALı ═══ */}
      {showWeekly && (
        <PortalModal>
          <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { setShowWeekly(false); setWeeklyData(null); } }}>
            <div style={{ ...modalBoxStyle(800), maxHeight: '82vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div style={modalHeaderStyle}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>📊 Haftalık Yoklama Özeti</h3>
                  {weeklyData && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 4 }}>
                      {new Date(weeklyData.baslangic).toLocaleDateString('tr-TR')} — {new Date(weeklyData.bitis).toLocaleDateString('tr-TR')}
                    </div>
                  )}
                </div>
                <button onClick={() => { setShowWeekly(false); setWeeklyData(null); }} style={closeBtnStyle}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                {weeklyLoading ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
                ) : !weeklyData || weeklyData.gunler.length === 0 ? (
                  <EmptyState icon="📊" title="Bu hafta yoklama verisi yok" />
                ) : (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {weeklyData.gunler.map(gun => (
                      <Card key={gun.tarih} style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', backgroundColor: '#f8fafc', fontWeight: 600, fontSize: '14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb' }}>
                          <span>{gun.gun_adi}</span>
                          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400 }}>{new Date(gun.tarih).toLocaleDateString('tr-TR')}</span>
                        </div>
                        {gun.oturumlar.length === 0 ? (
                          <div style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>Yoklama yok</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', padding: '12px' }}>
                            {gun.oturumlar.map(s => (
                              <div key={s.id} style={{
                                padding: '10px 14px', backgroundColor: s.durum === 'OPEN' ? '#f0fdf4' : '#f9fafb',
                                borderRadius: '8px', border: '1px solid #e5e7eb',
                              }}>
                                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                                  {s.oturum_adi}
                                  {s.ders_no && <span style={{ color: '#6366f1', marginLeft: 4, fontSize: '11px' }}>D{s.ders_no}</span>}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: 2 }}>
                                  {s.toplam_kayit != null && `${s.toplam_kayit} öğrenci`}
                                  {s.katilim_orani != null && ` · %${s.katilim_orani}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </PortalModal>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TAB: ATAMALAR
   ════════════════════════════════════════════════════════════ */
function AtamalarTab({ seatAssignments, salonAdi, subeAdi, kurumBranding, onEnd }: {
  seatAssignments: SeatAssignment[];
  salonAdi: string;
  subeAdi?: string;
  kurumBranding?: import('@/lib/contexts/KurumContext').Kurum | null;
  onEnd: (id: string) => void;
}) {
  const { href } = useKutuphanePath();
  const activeAssignments = seatAssignments.filter(a => a.durum === 'ACTIVE');
  const pastAssignments = seatAssignments.filter(a => a.durum !== 'ACTIVE');

  const handlePrintList = () => {
    const rows = seatAssignments.map((a) => ({
      no: a.masa_no || a.masa_id,
      ogrenci: a.ogrenci_adi || `#${a.ogrenci_id}`,
      tip: a.atama_tipi,
      baslangic: new Date(a.baslangic_tarihi).toLocaleDateString('tr-TR'),
      durum: ASSIGNMENT_STATUS_LABELS[a.durum] || a.durum,
    }));
    const html = buildSeatStudentListPrintHtml({
      meta: {
        title: 'Oturma Planı',
        subtitle: salonAdi,
        subeAdi,
        kurumBranding,
      },
      rows,
      salonAdi,
    });
    openKutuphanePrintWindow(html);
  };

  return (
    <div>
      <Card style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>{seatAssignments.length} toplam atama</span>
            <span style={{ color: '#059669' }}>● {activeAssignments.length} aktif</span>
            <span style={{ color: '#6b7280' }}>● {pastAssignments.length} geçmiş</span>
          </div>
          <button onClick={handlePrintList} style={{
            padding: '6px 14px', backgroundColor: '#f0fdf4', color: '#059669',
            borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          }}>
            📄 PDF Listesi
          </button>
        </div>
      </Card>

      {seatAssignments.length === 0 ? (
        <EmptyState icon="🔗" title="Henüz masa ataması yok" description="Öğrenciler masalara atandığında burada görünecektir" />
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Masa</th>
                <th style={thStyle}>Öğrenci</th>
                <th style={thStyle}>Tip</th>
                <th style={thStyle}>Başlangıç</th>
                <th style={thStyle}>Durum</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {seatAssignments.map(a => {
                const isActive = a.durum === 'ACTIVE';
                return (
                  <tr key={a.id} style={{ backgroundColor: isActive ? '#fafffe' : undefined }}>
                    <td style={tdStyle}><span style={{ fontWeight: 700, fontSize: '13px' }}>{a.masa_no || a.masa_id}</span></td>
                    <td style={tdStyle}>{a.ogrenci_adi || `#${a.ogrenci_id}`}</td>
                    <td style={tdStyle}><span style={{ fontSize: '12px' }}>{a.atama_tipi}</span></td>
                    <td style={tdStyle}>{new Date(a.baslangic_tarihi).toLocaleDateString('tr-TR')}</td>
                    <td style={tdStyle}>
                      <Badge
                        label={ASSIGNMENT_STATUS_LABELS[a.durum] || a.durum}
                        color={isActive ? '#059669' : '#6b7280'}
                        bg={isActive ? '#ecfdf5' : '#f9fafb'}
                        border={isActive ? '#a7f3d0' : '#e5e7eb'}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {isActive && (
                        <button onClick={() => onEnd(a.id)} style={actionBtn('#d97706', '#fffbeb')}>Sonlandır</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div style={{ marginTop: '16px' }}>
        <Card style={{ padding: '14px 20px', borderColor: '#bae6fd', backgroundColor: '#f0f9ff' }}>
          <div style={{ fontSize: '13px', color: '#0c4a6e' }}>
            💡 Dolap atamaları kurum genelinde yönetilmektedir.{' '}
            <Link href={href('atamalar')} style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>
              Atamalar sayfasına git →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TAB: LOGLAR (Dinamik — filtreleme + arama)
   ════════════════════════════════════════════════════════════ */
function LoglarTab({ logs }: { logs: AuditLog[] }) {
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filterAction !== 'ALL') {
      result = result.filter(l => l.action === filterAction);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(l =>
        (l.entity_type || '').toLowerCase().includes(term) ||
        (l.description || '').toLowerCase().includes(term) ||
        (l.performed_by || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [logs, filterAction, searchTerm]);

  const stats = useMemo(() => {
    const s: Record<string, number> = {};
    logs.forEach(l => { s[l.action] = (s[l.action] || 0) + 1; });
    return s;
  }, [logs]);

  return (
    <div>
      {/* Toolbar */}
      <Card style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{logs.length} kayıt</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {Object.entries(stats).map(([action, count]) => {
                const info = LOG_ACTION_LABELS[action] || { label: action, icon: '•', color: '#6b7280', bg: '#f3f4f6' };
                return <Badge key={action} label={`${info.icon} ${count}`} color={info.color} bg={info.bg} />;
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="🔍 Ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', width: 160 }}
            />
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px' }}
            >
              <option value="ALL">Tüm İşlemler</option>
              {Object.entries(LOG_ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {filteredLogs.length === 0 ? (
        <EmptyState icon="📝" title="İşlem geçmişi bulunamadı" description={logs.length > 0 ? 'Filtreleri değiştirerek tekrar deneyin' : 'Henüz log kaydı yok'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredLogs.map(log => {
            const info = LOG_ACTION_LABELS[log.action] || { label: log.action, icon: '•', color: '#6b7280', bg: '#f3f4f6' };
            return (
              <Card key={log.id} hover style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      backgroundColor: info.bg, color: info.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', flexShrink: 0,
                    }}>
                      {info.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Badge label={info.label} color={info.color} bg={info.bg} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{log.entity_type}</span>
                      </div>
                      {log.description && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          {log.description}
                        </div>
                      )}
                      {log.performed_by && (
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                          👤 {log.performed_by}
                        </div>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {(() => {
                      const dateStr = log.performed_at || log.created_at;
                      if (!dateStr) return '—';
                      const d = new Date(dateStr);
                      return isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR');
                    })()}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PAYLAŞILAN MODAL STİLLERİ
   ════════════════════════════════════════════════════════════ */
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
  zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
};

function modalBoxStyle(maxWidth: number): React.CSSProperties {
  return {
    backgroundColor: '#fff', borderRadius: '16px', width: '100%',
    maxWidth, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  };
}

const modalHeaderStyle: React.CSSProperties = {
  padding: '18px 24px', borderBottom: '1px solid #e5e7eb',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};

const modalFooterStyle: React.CSSProperties = {
  padding: '14px 24px', borderTop: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: '8px',
  borderRadius: '0 0 16px 16px',
};

const modalLabel: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'block',
};

const modalSelectStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px',
};

const closeBtnStyle: React.CSSProperties = {
  fontSize: '18px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer',
  width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function toolbarBtn(color: string, bg: string, border: string): React.CSSProperties {
  return {
    padding: '7px 14px', backgroundColor: bg, color,
    borderRadius: '8px', border: `1px solid ${border}`, fontSize: '12px', fontWeight: 500, cursor: 'pointer',
  };
}

function actionBtn(color: string, bg: string): React.CSSProperties {
  return {
    padding: '5px 12px', backgroundColor: bg, color,
    borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
  };
}
