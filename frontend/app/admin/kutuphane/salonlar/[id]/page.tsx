'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchLibrary, peekLibrary, rememberLibrary, updateLibrary, changeLibraryStatus, deleteLibrary,
  fetchSeats, bulkCreateSeats, changeSeatStatus,
  fetchSeatAssignments, endSeatAssignment,
  fetchAuditLogs,
  fetchAttendanceSessions, openAttendanceSession,
  fetchAttendanceSessionDetail, fetchAttendanceRecords, closeAttendanceSession, reopenAttendanceSession,
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
  getSeatStudentName,
  downloadSeatListExport,
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
import '@/components/kutuphane/yoklama/yoklama-drawer.css';
import './salon-detail-polish.css';

/* ════════════════════════════════════════════════════════════
   TABS  (Oturumlar kaldırıldı — ders programı kullanılıyor)
   ════════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'genel',    label: 'Genel bilgiler' },
  { key: 'masalar',  label: 'Masalar' },
  { key: 'yoklama',  label: 'Yoklama' },
  { key: 'atamalar', label: 'Atamalar' },
  { key: 'loglar',   label: 'İşlem geçmişi' },
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
  MORNING: 'Sabah', AFTERNOON: 'Öğle', EVENING: 'Akşam',
  SABAH: 'Sabah', OGLE: 'Öğle', AKSAM: 'Akşam',
  GECE: 'Gece', TAM_GUN: 'Tam gün', OZEL: 'Özel', CUSTOM: 'Özel',
};

const ALL_PERIYOT_OPTIONS = [
  { key: 'MORNING', label: 'Sabah', shortLabel: 'Sabah' },
  { key: 'AFTERNOON', label: 'Öğle', shortLabel: 'Öğle' },
  { key: 'EVENING', label: 'Akşam', shortLabel: 'Akşam' },
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
  CREATE:        { label: 'Oluşturma',        icon: '', color: '#067647', bg: '#ecfdf3' },
  UPDATE:        { label: 'Güncelleme',       icon: '', color: '#0061a6', bg: '#e8f3fb' },
  DELETE:        { label: 'Silme',             icon: '', color: '#b42318', bg: '#fdf4f3' },
  STATUS_CHANGE: { label: 'Durum değişikliği', icon: '', color: '#b54708', bg: '#fffaeb' },
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
    <span className="sd-badge" style={{ backgroundColor: bg, color, borderColor: border || 'transparent' }}>
      {label}
    </span>
  );
}

function Card({ children, style, hover, onClick, className }: {
  children: React.ReactNode; style?: React.CSSProperties; hover?: boolean; onClick?: () => void; className?: string;
}) {
  return (
    <div
      className={`sd-card${hover ? ' is-hoverable' : ''}${className ? ` ${className}` : ''}`}
      style={{ cursor: onClick ? 'pointer' : undefined, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function EmptyState({ title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div className="sd-empty">
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TABLO STİLLERİ
   ════════════════════════════════════════════════════════════ */
const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 650,
  color: '#5c6778', backgroundColor: '#f7f8fa', borderBottom: '1px solid #e6e9ee',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 14px', fontSize: '13px', color: '#344054',
  borderBottom: '1px solid #f0f2f5',
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

  const [library, setLibrary] = useState<Library | null>(() => peekLibrary(libraryId) || null);
  const [activeTab, setActiveTab] = useState('genel');
  const [loading, setLoading] = useState(() => !peekLibrary(libraryId));
  const [error, setError] = useState<string | null>(null);

  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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
      if (res.success && res.data) {
        const data = res.data as Library;
        setLibrary(data);
        rememberLibrary(data);
        setError(null);
      } else if (!peekLibrary(libraryId)) {
        setError('Salon bulunamadı');
      }
    } catch {
      if (!peekLibrary(libraryId)) setError('Yükleme hatası');
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    const cached = peekLibrary(libraryId);
    if (cached) {
      setLibrary(cached);
      setLoading(false);
      setError(null);
    } else {
      setLibrary(null);
      setLoading(true);
    }
    setActiveTab('genel');
    loadLibrary();
  }, [libraryId, loadLibrary]);

  /* ─── Tab Verisi Yükle (içeriği silmeden — kaybolup-gelme yok) ─── */
  const loadTabData = useCallback(async (tab: string) => {
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

  /* ─── Yükleniyor / Hata — skeleton/fade yok; önbellek varsa anında göster ─── */
  if (!library) {
    if (loading) {
      return (
        <div className="kutuphane-salon-detail">
          <p className="sd-loading">Salon yükleniyor…</p>
        </div>
      );
    }
    return (
      <div className="kutuphane-salon-detail">
        <div className="sd-card sd-empty-page">
          <h2>{error || 'Salon bulunamadı'}</h2>
          <Link href={href('salonlar')}>Salonlara dön</Link>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_COLORS[library.durum] || STATUS_COLORS.INACTIVE;
  const doluluk = library.doluluk_orani ?? library.doluluk_yuzde ?? 0;

  const metaBits = [library.sube_adi, library.kod].filter(Boolean);

  return (
    <div className="kutuphane-salon-detail">
      {toast && (
        <div className={`sd-toast is-${toast.type}`} role="status">
          {toast.msg}
        </div>
      )}

      <header className="sd-head">
        <div>
          <nav className="sd-crumb" aria-label="Konum">
            <a href={href()}>Kütüphane</a>
            <span aria-hidden>/</span>
            <a href={href('salonlar')}>Salonlar</a>
            <span aria-hidden>/</span>
            <span>{library.ad}</span>
          </nav>
          <div className="sd-title-row">
            <h1>{library.ad}</h1>
            <Badge
              label={STATUS_LABELS[library.durum] || library.durum}
              color={statusInfo.color}
              bg={statusInfo.bg}
              border={statusInfo.border}
            />
          </div>
          {metaBits.length > 0 && <p className="sd-meta">{metaBits.join(' · ')}</p>}
        </div>
        <div className="sd-actions">
          {library.durum !== 'ACTIVE' && (
            <button type="button" className="sd-btn" onClick={() => handleStatusChange('ACTIVE')}>Aktifleştir</button>
          )}
          {library.durum === 'ACTIVE' && (
            <button type="button" className="sd-btn" onClick={() => handleStatusChange('MAINTENANCE')}>Bakıma al</button>
          )}
          {library.durum !== 'INACTIVE' && (
            <button type="button" className="sd-btn" onClick={() => handleStatusChange('INACTIVE')}>Pasifleştir</button>
          )}
          <button type="button" className="sd-btn sd-btn-danger" onClick={handleDelete}>Sil</button>
        </div>
      </header>

      <section className="sd-metrics" aria-label="Salon özeti">
        {[
          { label: 'Toplam masa', value: library.toplam_masa ?? 0 },
          { label: 'Aktif masa', value: library.aktif_masa ?? 0 },
          { label: 'Dolu', value: library.dolu_masa ?? 0 },
          { label: 'Boş', value: library.bos_masa ?? 0 },
          { label: 'Doluluk', value: `%${doluluk}`, accent: true },
        ].map((kpi) => (
          <div key={kpi.label} className={`sd-metric${kpi.accent ? ' is-accent' : ''}`}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
          </div>
        ))}
      </section>

      <div className="sd-tabs" role="tablist" aria-label="Salon yönetim bölümleri">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
            className="sd-tab"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════ TAB CONTENT ════ */}
      {activeTab === 'genel' && <GenelTab library={library} onSave={loadLibrary} showToast={showToast} />}
      {activeTab === 'masalar' && (
        <MasalarTab
          libraryId={libraryId}
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
    <Card style={{ padding: '18px 20px' }}>
      <div className="sd-panel-head">
        <div>
          <h2>Salon bilgileri</h2>
          <p>Ad, kapasite ve salon kuralları</p>
        </div>
        {!editMode && !readOnly && (
          <button type="button" className="sd-btn" onClick={() => setEditMode(true)}>Düzenle</button>
        )}
      </div>

      {editMode ? (
        <form onSubmit={handleSave} className="sd-form">
          <FormField label="Salon adı" name="ad" defaultValue={library.ad} required />
          <FormField label="Kapasite" name="kapasite" defaultValue={String(library.kapasite)} type="number" required />
          <FormField label="Açıklama" name="aciklama" defaultValue={library.aciklama} textarea />
          <FormField label="Kurallar" name="kurallar" defaultValue={library.kurallar} textarea />
          <div className="sd-form-actions sd-field-wide">
            <button type="button" className="sd-btn" onClick={() => setEditMode(false)}>İptal</button>
            <button type="submit" className="sd-btn sd-btn-primary" disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      ) : (
        <div className="sd-facts">
          <InfoRow label="Salon adı" value={library.ad} />
          <InfoRow label="Kod" value={library.kod} mono />
          <InfoRow label="Kapasite" value={String(library.kapasite)} />
          <InfoRow label="Dolap" value={library.dolap_var_mi ? `Var (${library.dolap_sayisi} adet)` : 'Yok'} />
          <InfoRow label="Açıklama" value={library.aciklama || '—'} wide />
          <InfoRow label="Kurallar" value={library.kurallar || '—'} wide />
        </div>
      )}
    </Card>
  );
}

function InfoRow({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`sd-fact${wide ? ' is-wide' : ''}`}>
      <dt>{label}</dt>
      <dd className={mono ? 'is-mono' : undefined}>{value}</dd>
    </div>
  );
}

function FormField({ label, name, defaultValue, type, required, textarea }: {
  label: string; name: string; defaultValue?: string; type?: string; required?: boolean; textarea?: boolean;
}) {
  return (
    <div className={`sd-field${textarea ? ' sd-field-wide' : ''}`}>
      <label>
        {label} {required && <span className="sd-req">*</span>}
      </label>
      {textarea ? (
        <textarea className="sd-input is-area" name={name} defaultValue={defaultValue} rows={3} />
      ) : (
        <input className="sd-input" name={name} type={type || 'text'} defaultValue={defaultValue} required={required} />
      )}
    </div>
  );
}

const saveBtnStyle: React.CSSProperties = {
  height: 36, padding: '0 16px', backgroundColor: '#0061A6', color: '#fff',
  borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

/* ════════════════════════════════════════════════════════════
   TAB: MASALAR
   ════════════════════════════════════════════════════════════ */
const MASA_TIPI_LABELS: Record<string, string> = {
  STANDARD: 'Standart',
  COMPUTER: 'Bilgisayar',
  GROUP: 'Grup',
};

function buildSeatExportRows(seats: Seat[]) {
  return seats.map((seat) => {
    const ogrenci = getSeatStudentName(seat);
    const ozellikler = [seat.priz_var_mi && 'Priz', seat.lamba_var_mi && 'Lamba'].filter(Boolean).join(', ');
    return {
      masaNo: seat.masa_no || seat.id,
      tip: MASA_TIPI_LABELS[seat.masa_tipi] || seat.masa_tipi,
      durum: SEAT_STATUS_LABELS[seat.durum] || seat.durum,
      ogrenci,
      ozellikler,
      baslangic: seat.aktif_atama?.baslangic_tarihi
        ? new Date(seat.aktif_atama.baslangic_tarihi).toLocaleDateString('tr-TR')
        : '',
    };
  });
}

async function downloadSeatListExportFile(
  libraryId: string,
  salonAdi: string,
  filtered: Seat[],
  format: 'csv' | 'xlsx',
) {
  const exportRows = buildSeatExportRows(filtered);
  const columns = [
    { key: 'sira', label: '#' },
    { key: 'masa_no', label: 'Masa No' },
    { key: 'tip', label: 'Tip' },
    { key: 'durum', label: 'Durum' },
    { key: 'ogrenci', label: 'Öğrenci' },
    { key: 'baslangic', label: 'Başlangıç' },
    { key: 'ozellikler', label: 'Özellikler' },
  ];
  const rows = exportRows.map((row, idx) => ({
    sira: String(idx + 1),
    masa_no: row.masaNo,
    tip: row.tip,
    durum: row.durum,
    ogrenci: row.ogrenci,
    baslangic: row.baslangic,
    ozellikler: row.ozellikler,
  }));
  const blob = await downloadSeatListExport(libraryId, { columns, rows, format });
  const safeName = salonAdi.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_') || 'salon';
  downloadBlob(blob, `${safeName}_oturma_plani.${format}`);
}

function MasalarTab({ libraryId, seats, salonAdi, subeAdi, kurumBranding, showBulkForm, onToggleBulkForm, onBulkCreate, onStatusChange, readOnly = false }: {
  libraryId: string;
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
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);

  useEffect(() => {
    if (!pdfMenuOpen) return;
    const close = () => setPdfMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [pdfMenuOpen]);

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

  const exportMeta = useMemo(
    () => ({
      title: 'Oturma Planı',
      subtitle: salonAdi,
      subeAdi,
      kurumBranding,
    }),
    [salonAdi, subeAdi, kurumBranding],
  );

  const handleDownloadExport = async (format: 'csv' | 'xlsx') => {
    if (filtered.length === 0) {
      alert('Dışa aktarılacak masa bulunamadı.');
      return;
    }
    setExporting(format);
    try {
      await downloadSeatListExportFile(libraryId, salonAdi, filtered, format);
    } catch (err) {
      const detail = err instanceof Error && err.message ? `: ${err.message}` : '';
      alert(`${format === 'xlsx' ? 'Excel' : 'CSV'} dosyası oluşturulurken hata oluştu${detail}`);
    } finally {
      setExporting(null);
    }
  };

  const handlePrintList = (scope: 'occupied' | 'empty') => {
    const status = scope === 'occupied' ? 'OCCUPIED' : 'AVAILABLE';
    const source = seats.filter((seat) => seat.durum === status);
    const rows = buildSeatExportRows(source).map((row) => ({
      no: String(row.masaNo),
      ogrenci: row.ogrenci || '—',
      tip: row.tip,
      baslangic: row.baslangic,
      durum: row.durum,
    }));

    if (rows.length === 0) {
      alert(scope === 'occupied' ? 'Dolu masa bulunamadı.' : 'Boş masa bulunamadı.');
      return;
    }

    setExporting('pdf');
    try {
      const html = buildSeatStudentListPrintHtml({
        meta: {
          ...exportMeta,
          title: scope === 'occupied' ? 'Dolu Masalar' : 'Boş Masalar',
        },
        rows,
        salonAdi,
        scope,
      });
      const opened = openKutuphanePrintWindow(html);
      if (!opened) {
        alert('Yazdırma penceresi açıldı. Pop-up engellendi ise yeni sekmeden yazdırın veya PDF olarak kaydedin.');
      }
    } catch {
      alert('PDF listesi oluşturulurken hata oluştu.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      <Card style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div className="sd-toolbar">
          <div className="sd-toolbar-group">
            <span className="sd-count">
              <b>{stats.total}</b> masa
              <span className="sd-dot" style={{ color: '#067647' }}> · {stats.available} müsait</span>
              <span className="sd-dot" style={{ color: '#b42318' }}> · {stats.occupied} dolu</span>
              <span className="sd-dot" style={{ color: '#b54708' }}> · {stats.reserved} rezerve</span>
            </span>
            <select className="sd-input" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Masa durumu">
              <option value="ALL">Tümü</option>
              {Object.entries(SEAT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="sd-toolbar-group is-actions">
            <button type="button" className="sd-btn sd-btn-sm" onClick={() => handleDownloadExport('xlsx')} disabled={exporting !== null}>
              {exporting === 'xlsx' ? 'Hazırlanıyor…' : 'Excel'}
            </button>
            <button type="button" className="sd-btn sd-btn-sm" onClick={() => handleDownloadExport('csv')} disabled={exporting !== null}>
              {exporting === 'csv' ? 'Hazırlanıyor…' : 'CSV'}
            </button>
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button type="button" className="sd-btn sd-btn-sm" onClick={() => setPdfMenuOpen(open => !open)} disabled={exporting !== null} aria-expanded={pdfMenuOpen}>
                {exporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF / Yazdır'}
              </button>
              {pdfMenuOpen && (
                <div className="sd-menu" role="menu">
                  <button type="button" onClick={() => { setPdfMenuOpen(false); handlePrintList('occupied'); }}>Dolu masalar</button>
                  <button type="button" onClick={() => { setPdfMenuOpen(false); handlePrintList('empty'); }}>Boş masalar</button>
                </div>
              )}
            </div>
            <div className="sd-segment" role="group" aria-label="Görünüm">
              {(['grid', 'table'] as const).map(m => (
                <button key={m} type="button" aria-pressed={viewMode === m} onClick={() => setViewMode(m)}>
                  {m === 'grid' ? 'Izgara' : 'Tablo'}
                </button>
              ))}
            </div>
            {!readOnly && (
              <button type="button" className="sd-btn sd-btn-primary sd-btn-sm" onClick={onToggleBulkForm}>Toplu ekle</button>
            )}
          </div>
        </div>
      </Card>

      {showBulkForm && !readOnly && (
        <Card style={{ padding: '16px', marginBottom: 12 }}>
          <h3 className="sd-section-title" style={{ marginBottom: 12 }}>Toplu masa oluştur</h3>
          <form onSubmit={onBulkCreate}>
            <div className="sd-bulk">
              <div className="sd-field">
                <label>Adet <span className="sd-req">*</span></label>
                <input className="sd-input" name="adet" type="number" min={1} max={100} required placeholder="10" />
              </div>
              <div className="sd-field">
                <label>Masa tipi</label>
                <select className="sd-input" name="masa_tipi">
                  <option value="STANDARD">Standart</option>
                  <option value="COMPUTER">Bilgisayar</option>
                  <option value="GROUP">Grup</option>
                </select>
              </div>
              <div className="sd-field">
                <label>Başlangıç no</label>
                <input className="sd-input" name="baslangic_no" type="number" min={1} defaultValue={1} />
              </div>
              <button type="submit" className="sd-btn sd-btn-primary">Oluştur</button>
              <button type="button" className="sd-btn" onClick={onToggleBulkForm}>İptal</button>
            </div>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="Masa bulunamadı" description="Toplu masa ekleme ile masaları oluşturabilirsiniz" />
      ) : viewMode === 'grid' ? (
        <div className="sd-seat-grid">
          {filtered.map(seat => {
            const sc = SEAT_STATUS_COLORS[seat.durum] || SEAT_STATUS_COLORS.AVAILABLE;
            const ogrenciAdi = getSeatStudentName(seat);
            return (
              <Card key={seat.id} className="sd-seat" style={{ padding: 14 }}>
                <div className="sd-seat-no">{seat.masa_no}</div>
                <Badge label={SEAT_STATUS_LABELS[seat.durum] || seat.durum} color={sc.color} bg={sc.bg} border={sc.border} />
                {ogrenciAdi && <div className="sd-seat-student">{ogrenciAdi}</div>}
                {(seat.priz_var_mi || seat.lamba_var_mi) && (
                  <div className="sd-seat-flags">
                    {seat.priz_var_mi && <span>Priz</span>}
                    {seat.lamba_var_mi && <span>Lamba</span>}
                  </div>
                )}
                <select
                  className="sd-input"
                  aria-label={`${seat.masa_no} durumu`}
                  value={seat.durum}
                  onChange={e => onStatusChange(seat.id, e.target.value as SeatStatus)}
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
        <Card className="sd-table-card">
          <table>
            <thead>
              <tr>
                <th style={thStyle}>Masa no</th>
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
                const ogrenciAdi = getSeatStudentName(seat);
                const ozellik = [seat.priz_var_mi && 'Priz', seat.lamba_var_mi && 'Lamba'].filter(Boolean).join(', ');
                return (
                  <tr key={seat.id}>
                    <td style={tdStyle}><span style={{ fontWeight: 650 }}>{seat.masa_no}</span></td>
                    <td style={tdStyle}>{MASA_TIPI_LABELS[seat.masa_tipi] || seat.masa_tipi}</td>
                    <td style={tdStyle}><Badge label={SEAT_STATUS_LABELS[seat.durum] || seat.durum} color={sc.color} bg={sc.bg} border={sc.border} /></td>
                    <td style={tdStyle}>{ogrenciAdi || '—'}</td>
                    <td style={tdStyle}>{ozellik || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <select
                        className="sd-input"
                        style={{ width: 'auto', minWidth: 120 }}
                        aria-label={`${seat.masa_no} durumu`}
                        value={seat.durum}
                        onChange={e => onStatusChange(seat.id, e.target.value as SeatStatus)}
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
  const templatesBasePath = isCoachMode
    ? '/coach/iletisim/bildirim-sablonlari'
    : '/admin/iletisim/bildirim-sablonlari';

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

  useEffect(() => {
    if (!showOpenModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowOpenModal(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showOpenModal]);

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

  const refreshLiveLessons = useCallback(async (sessionId: string) => {
    try {
      const res = await fetchAttendanceRecords(libraryId, sessionId);
      if (!res.success || !res.data) return;
      const fresh = res.data;
      setDetailRecords((prev) => prev.map((row) => {
        const next = fresh.find((item) => item.id === row.id);
        return next ? { ...row, canli_ders: next.canli_ders } : row;
      }));
    } catch { /* ignore */ }
  }, [libraryId]);

  useEffect(() => {
    if (!detailSession || detailSession.durum !== 'OPEN') return;
    const timer = window.setInterval(() => {
      refreshLiveLessons(detailSession.id);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [detailSession, refreshLiveLessons]);

  const openNotifyPreview = (event: AttendanceNotifyEventType, ogrenciIds?: number[]) => {
    setPreviewEvent(event);
    setPreviewOgrenciIds(ogrenciIds);
  };

  const handleNotifySent = async (sent: number, errors?: string[]) => {
    if (sent > 0) {
      showToastMsg('success', `${sent} veliye WhatsApp mesajı iletildi`);
      if (errors?.length) {
        showToastMsg('error', errors[0]);
      }
    } else {
      showToastMsg(
        'error',
        errors?.[0] || 'Mesaj gönderilemedi. WhatsApp hattı veya şablon ayarını kontrol edin.',
      );
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
      if (yk.durum === 'EXCUSED') return 'İzinli';
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
        <div className={`sd-toast is-${toast.type}`} role="status">{toast.msg}</div>
      )}

      <Card style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div className="yk-toolbar">
          <div className="yk-toolbar-meta">
            <input
              className="sd-input"
              style={{ width: 'auto' }}
              type="date"
              value={selectedDate}
              aria-label="Yoklama tarihi"
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <span className="sd-count">
              <b>{sessions.length}</b> yoklama
              {sessions.filter(s => s.durum === 'OPEN').length > 0 && (
                <> · <Badge label={`${sessions.filter(s => s.durum === 'OPEN').length} açık`} color="#067647" bg="#ecfdf3" border="#abefc6" /></>
              )}
            </span>
          </div>
          <div className="yk-toolbar-actions">
            <button type="button" className="sd-btn sd-btn-sm" onClick={() => loadWeekly()}>Haftalık özet</button>
            <button type="button" className="sd-btn sd-btn-sm" onClick={() => { setSheetOrientation('portrait'); loadSheet('daily'); }}>Günlük liste</button>
            <button type="button" className="sd-btn sd-btn-sm" onClick={() => { setSheetOrientation('landscape'); loadSheet('weekly'); }}>Haftalık liste</button>
            <button type="button" className="sd-btn sd-btn-sm" onClick={() => setShowNotifySettings(true)}>Bildirim şablonları</button>
            <button type="button" className="sd-btn sd-btn-primary sd-btn-sm" onClick={openYoklamaModal}>Yoklama aç</button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="sd-spinner" role="status" aria-label="Yoklamalar yükleniyor" />
      ) : sessions.length === 0 ? (
        <EmptyState title="Bu tarihte yoklama oturumu yok" description="Yeni yoklama açmak için Yoklama aç düğmesini kullanın" />
      ) : (
        <div className="sd-list">
          {sessions.map(s => (
            <div key={s.id} className="sd-list-row">
              <div className="sd-session-main">
                <strong>
                  {s.oturum_adi || 'Yoklama'}
                  {s.ders_no && <span className="sd-lesson">{s.ders_no}. ders</span>}
                </strong>
                <span>
                  {PERIOD_LABELS[s.periyot_kodu || ''] || s.periyot_kodu}
                  {' · '}{s.yoklama_tipi === 'LESSON' ? 'Ders bazlı' : 'Periyot bazlı'}
                  {s.toplam_kayit != null && ` · ${s.toplam_kayit} kayıt`}
                  {s.katilim_orani != null && ` · %${s.katilim_orani} katılım`}
                </span>
              </div>
              <div className="yk-session-actions sd-session-actions">
                <Badge
                  label={s.durum === 'OPEN' ? 'Açık' : 'Kapalı'}
                  color={s.durum === 'OPEN' ? '#067647' : '#5c6778'}
                  bg={s.durum === 'OPEN' ? '#ecfdf3' : '#f6f7f9'}
                  border={s.durum === 'OPEN' ? '#abefc6' : '#e6e9ee'}
                />
                <button type="button" className="sd-btn sd-btn-primary sd-btn-sm" onClick={() => loadDetail(s)}>Yoklama al</button>
                {s.durum === 'OPEN' ? (
                  <button type="button" className="sd-btn sd-btn-sm" onClick={() => handleCloseSession(s.id)}>Kapat</button>
                ) : (
                  <button type="button" className="sd-btn sd-btn-sm" onClick={() => handleReopenSession(s.id)}>Tekrar aç</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ YOKLAMA AÇ MODALı ═══ */}
      {showOpenModal && (
        <PortalModal>
          <div className="sd-veil" onClick={(e) => { if (e.target === e.currentTarget) setShowOpenModal(false); }}>
            <div
              className="sd-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sd-open-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sd-dialog-head">
                <p className="sd-dialog-kicker">{libraryName}</p>
                <h2 id="sd-open-title">Yoklamayı aç</h2>
              </div>
              <div className="sd-dialog-body">
                <div>
                  <span className="sd-label">Tip</span>
                  <div className="sd-choices" role="radiogroup" aria-label="Yoklama tipi">
                    {[
                      { key: 'PERIOD' as const, label: 'Periyot', desc: 'Tüm periyot, tek liste' },
                      { key: 'LESSON' as const, label: 'Ders', desc: 'Her ders ayrı' },
                    ].map(t => (
                      <button
                        key={t.key}
                        type="button"
                        role="radio"
                        aria-checked={openType === t.key}
                        className={`sd-choice${openType === t.key ? ' is-active' : ''}`}
                        onClick={() => setOpenType(t.key)}
                      >
                        <strong>{t.label}</strong>
                        <span>{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sd-field">
                  <label htmlFor="sd-open-periyot">Periyot</label>
                  <select
                    id="sd-open-periyot"
                    value={selectedPeriyot}
                    onChange={(e) => setSelectedPeriyot(e.target.value)}
                    className="sd-input"
                  >
                    {PERIYOT_OPTIONS.map(p => (
                      <option key={p.key} value={p.key} disabled={p.disabled}>
                        {p.disabled ? `${p.shortLabel} (kapalı)` : p.shortLabel}
                      </option>
                    ))}
                  </select>
                  {PERIYOT_OPTIONS.every(p => p.disabled) && (
                    <p className="sd-hint is-warn">Bu gün için aktif periyot yok.</p>
                  )}
                </div>

                {openType === 'LESSON' && (
                  <div className="sd-field">
                    <label htmlFor="sd-open-sube">Şube</label>
                    <select
                      id="sd-open-sube"
                      value={selectedSube || ''}
                      onChange={(e) => setSelectedSube(e.target.value ? Number(e.target.value) : null)}
                      className="sd-input"
                    >
                      <option value="">Şube seçin</option>
                      {subeler.filter(s => s.program_var).map(s => (
                        <option key={s.id} value={s.id}>{s.ad}</option>
                      ))}
                    </select>
                    <p className="sd-hint">
                      {librarySubeAdi
                        ? `Salon şubesi: ${librarySubeAdi}`
                        : 'Ders programı olan şube gerekli'}
                    </p>
                  </div>
                )}

                <div className="sd-field">
                  <label htmlFor="sd-open-tarih">Tarih</label>
                  <input
                    id="sd-open-tarih"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="sd-input"
                  />
                </div>
              </div>
              <div className="sd-dialog-foot">
                <button type="button" className="sd-btn" onClick={() => setShowOpenModal(false)}>Vazgeç</button>
                <div className="sd-dialog-foot-actions">
                  {openType === 'PERIOD' && PERIYOT_OPTIONS.some(p => !p.disabled) && (
                    <button type="button" className="sd-btn" onClick={handleOpenAllPeriods}>Hepsini aç</button>
                  )}
                  <button type="button" className="sd-btn sd-btn-primary" onClick={handleOpenSession}>Başla</button>
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
          <div className="sd-overlay" style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { setShowSheet(false); setSheetData(null); } }}>
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
                  <button type="button" className="sd-btn sd-btn-sm" onClick={() => handleDownloadAttendanceExport('xlsx')} disabled={sheetExportFormat !== null}>
                    {sheetExportFormat === 'xlsx' ? 'Hazırlanıyor…' : 'Excel'}
                  </button>
                  <button type="button" className="sd-btn sd-btn-sm" onClick={() => handleDownloadAttendanceExport('csv')} disabled={sheetExportFormat !== null}>
                    {sheetExportFormat === 'csv' ? 'Hazırlanıyor…' : 'CSV'}
                  </button>
                  <button type="button" className="sd-btn sd-btn-sm" onClick={handleDownloadPDF}>PDF / Yazdır</button>
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
                                          {yk?.durum === 'EXCUSED' ? (
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
                                  {yk?.durum === 'EXCUSED' ? (
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
          <div className="sd-overlay" style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { setShowWeekly(false); setWeeklyData(null); } }}>
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
                                padding: '10px 12px', backgroundColor: '#fff',
                                borderRadius: 8, border: '1px solid #e6e9ee',
                                borderLeft: s.durum === 'OPEN' ? '3px solid #067647' : '3px solid #d5dbe3',
                              }}>
                                <div style={{ fontSize: 13, fontWeight: 650 }}>
                                  {s.oturum_adi}
                                  {s.ders_no && <span style={{ color: '#0061a6', marginLeft: 4, fontSize: 12 }}>{s.ders_no}. ders</span>}
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
      <Card style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div className="sd-toolbar">
          <span className="sd-count">
            <b>{seatAssignments.length}</b> atama
            <span style={{ color: '#067647' }}> · {activeAssignments.length} aktif</span>
            <span> · {pastAssignments.length} geçmiş</span>
          </span>
          <button type="button" className="sd-btn sd-btn-sm" onClick={handlePrintList}>PDF listesi</button>
        </div>
      </Card>

      {seatAssignments.length === 0 ? (
        <EmptyState title="Henüz masa ataması yok" description="Öğrenciler masalara atandığında burada görünecektir" />
      ) : (
        <Card className="sd-table-card">
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
                        <button type="button" className="sd-btn sd-btn-sm sd-btn-danger" onClick={() => onEnd(a.id)}>Sonlandır</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="sd-note-bar">
        Dolap atamaları kurum genelinde yönetilir.{' '}
        <Link href={href('atamalar')}>Atamalar sayfasına git</Link>
      </p>
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
      <Card style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div className="sd-toolbar">
          <div className="sd-inline">
            <span className="sd-count"><b>{logs.length}</b> kayıt</span>
            {Object.entries(stats).map(([action, count]) => {
              const info = LOG_ACTION_LABELS[action] || { label: action, icon: '', color: '#5c6778', bg: '#f6f7f9' };
              return <Badge key={action} label={`${info.label} ${count}`} color={info.color} bg={info.bg} />;
            })}
          </div>
          <div className="sd-inline">
            <input
              className="sd-input"
              type="search"
              placeholder="Ara"
              aria-label="İşlem geçmişinde ara"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: 180 }}
            />
            <select className="sd-input" style={{ width: 'auto' }} value={filterAction} onChange={e => setFilterAction(e.target.value)} aria-label="İşlem türü">
              <option value="ALL">Tüm işlemler</option>
              {Object.entries(LOG_ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {filteredLogs.length === 0 ? (
        <EmptyState title="İşlem geçmişi bulunamadı" description={logs.length > 0 ? 'Filtreleri değiştirerek tekrar deneyin' : 'Henüz kayıt yok'} />
      ) : (
        <div className="sd-list">
          {filteredLogs.map(log => {
            const info = LOG_ACTION_LABELS[log.action] || { label: log.action, icon: '', color: '#5c6778', bg: '#f6f7f9' };
            const dateStr = log.performed_at || log.created_at;
            const when = !dateStr ? '—' : (() => {
              const d = new Date(dateStr);
              return isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR');
            })();
            return (
              <div key={log.id} className="sd-list-row sd-log-row">
                <div className="sd-log-main">
                  <div className="sd-inline">
                    <Badge label={info.label} color={info.color} bg={info.bg} />
                    <strong style={{ fontSize: 13 }}>{log.entity_type}</strong>
                  </div>
                  {log.description && <span className="sd-log-desc">{log.description}</span>}
                  {log.performed_by && <span className="sd-log-desc">{log.performed_by}</span>}
                </div>
                <time className="sd-log-time">{when}</time>
              </div>
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
  position: 'fixed', inset: 0, backgroundColor: 'rgba(22, 28, 36, 0.36)',
  zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
};

function modalBoxStyle(maxWidth: number): React.CSSProperties {
  return {
    backgroundColor: '#fff', borderRadius: 12, width: '100%',
    maxWidth, boxShadow: '0 16px 40px rgba(16, 24, 40, 0.14)',
  };
}

const modalHeaderStyle: React.CSSProperties = {
  padding: '16px 18px', borderBottom: '1px solid #e6e9ee',
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
};

const modalFooterStyle: React.CSSProperties = {
  padding: '12px 18px', borderTop: '1px solid #e6e9ee',
  backgroundColor: '#fff', display: 'flex', justifyContent: 'flex-end', gap: 8,
  borderRadius: '0 0 12px 12px',
};

const closeBtnStyle: React.CSSProperties = {
  fontSize: '18px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer',
  width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

