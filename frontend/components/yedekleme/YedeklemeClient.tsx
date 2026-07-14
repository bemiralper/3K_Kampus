'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  analyzeBackup,
  createBackup,
  createResource,
  deactivateResource,
  deleteBackup,
  downloadBackup,
  dryRunBackup,
  fetchBackups,
  fetchDashboard,
  fetchJob,
  fetchLogs,
  fetchResources,
  fetchSchedule,
  fetchSettings,
  formatBytes,
  patchResource,
  previewBackup,
  restoreBackup,
  runScheduleNow,
  syncResources,
  updateSchedule,
  updateSettings,
  uploadBackup,
  verifyBackup,
  type BackupArtifact,
  type BackupJob,
  type BackupResource,
  type BackupSettingsData,
  type DashboardData,
  type OperationLog,
  type ScheduleData,
} from '@/lib/yedekleme-api';
import './yedekleme.css';

type TabKey =
  | 'dashboard'
  | 'manual'
  | 'schedule'
  | 'resources'
  | 'history'
  | 'restore'
  | 'logs'
  | 'settings';

type Notice = { type: 'success' | 'error' | 'info'; text: string } | null;
type ResourceTypes = Array<{ value: string; label: string }>;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Genel Durum' },
  { key: 'manual', label: 'Manuel Yedek' },
  { key: 'schedule', label: 'Otomatik Yedekleme' },
  { key: 'resources', label: 'Kaynaklar' },
  { key: 'history', label: 'Yedek Geçmişi' },
  { key: 'restore', label: 'Geri Yükleme' },
  { key: 'logs', label: 'Günlükler' },
  { key: 'settings', label: 'Ayarlar' },
];

const KIND_LABELS: Record<string, string> = {
  full: 'Tam yedek',
  database: 'Veritabanı',
  files: 'Dosyalar',
  settings: 'Ayarlar',
  selected: 'Seçili kaynaklar',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Tamamlandı',
  running: 'Çalışıyor',
  pending: 'Bekliyor',
  failed: 'Başarısız',
  cancelled: 'İptal',
};

const FREQUENCY_LABELS: Record<string, string> = {
  off: 'Kapalı',
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Yedek oluşturma',
  verify: 'Doğrulama',
  restore: 'Geri yükleme',
  download: 'İndirme',
  delete: 'Silme',
  schedule_update: 'Zamanlama',
  settings_update: 'Ayarlar',
  resource_update: 'Kaynak güncelleme',
  resource_sync: 'Kaynak eşitleme',
  purge: 'Temizlik',
};

const emptyManual = {
  kind: 'full',
  encrypt: false,
  compress: true,
  resource_codes: [] as string[],
};

const emptyManualResource = {
  code: '',
  name: '',
  resource_type: 'other',
  description: '',
  handler_key: 'other',
  priority: 100,
  is_active: true,
  is_default: false,
  encrypt: false,
  compress: true,
  is_restorable: true,
};

function cls(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('tr-TR');
}

/** 24 saatlik saat dilimi etiketi (gece / sabah / öğleden sonra / akşam). */
function dayPartLabel(hour: number): string {
  if (hour >= 0 && hour < 6) return 'gece';
  if (hour < 12) return 'sabah';
  if (hour < 18) return 'öğleden sonra';
  return 'akşam';
}

function formatScheduleClock(hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatScheduleTime(hour: number, minute: number): string {
  return `${formatScheduleClock(hour, minute)} (${dayPartLabel(hour)})`;
}

function toTimeInputValue(hour: number, minute: number): string {
  return formatScheduleClock(hour, minute);
}

function parseTimeInputValue(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function errorText(fallback: string, error?: string) {
  if (!error?.trim()) return fallback;
  // Zaten açıklayıcıysa tekrar önekleme
  if (error.includes(fallback.replace(/\.$/, ''))) return error;
  return `${fallback} ${error}`;
}

function getRecordValue(data: unknown, key: string): unknown {
  return data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
}

export default function YedeklemeClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const initialTab = TABS.some((t) => t.key === tabFromUrl) ? (tabFromUrl as TabKey) : 'dashboard';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [settings, setSettings] = useState<BackupSettingsData | null>(null);
  const [resources, setResources] = useState<BackupResource[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceTypes>([]);
  const [artifacts, setArtifacts] = useState<BackupArtifact[]>([]);
  const [artifactCount, setArtifactCount] = useState(0);
  const [logs, setLogs] = useState<OperationLog[]>([]);

  const [manualForm, setManualForm] = useState(emptyManual);
  const [manualResource, setManualResource] = useState(emptyManualResource);
  const [activeJob, setActiveJob] = useState<BackupJob | null>(null);

  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [resourceActive, setResourceActive] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyKind, setHistoryKind] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [logsAction, setLogsAction] = useState('');
  const [logsSuccess, setLogsSuccess] = useState('');
  const [logsQuery, setLogsQuery] = useState('');

  const [previewArtifact, setPreviewArtifact] = useState<BackupArtifact | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
  const [restoreArtifactId, setRestoreArtifactId] = useState<number | ''>('');
  const [analyzeData, setAnalyzeData] = useState<Record<string, unknown> | null>(null);
  const [dryRunData, setDryRunData] = useState<Record<string, unknown> | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreProgress, setRestoreProgress] = useState(0);

  const completedArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.status === 'completed'),
    [artifacts],
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logsSuccess === 'success' && !log.success) return false;
      if (logsSuccess === 'error' && log.success) return false;
      if (!logsQuery.trim()) return true;
      const needle = logsQuery.toLowerCase();
      return [log.step, log.error_message, log.action, String(log.artifact_id || '')]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [logs, logsQuery, logsSuccess]);

  const loadDashboard = useCallback(async () => {
    const res = await fetchDashboard();
    if (res.success && res.data) {
      setDashboard(res.data);
      return null;
    }
    return errorText('Genel durum yüklenemedi.', res.error);
  }, []);

  const loadResources = useCallback(async () => {
    const params: Record<string, string | number> = { page_size: 200 };
    if (resourceQuery.trim()) params.q = resourceQuery.trim();
    if (resourceType) params.type = resourceType;
    if (resourceActive) params.active = resourceActive;
    const res = await fetchResources(params);
    if (res.success && res.data) {
      setResources(res.data.results);
      setResourceTypes(res.data.resource_types || []);
      return null;
    }
    return errorText('Kaynaklar yüklenemedi.', res.error);
  }, [resourceActive, resourceQuery, resourceType]);

  const loadArtifacts = useCallback(async () => {
    const params: Record<string, string | number> = { page: historyPage, page_size: 12 };
    if (historyQuery.trim()) params.q = historyQuery.trim();
    if (historyStatus) params.status = historyStatus;
    if (historyKind) params.kind = historyKind;
    const res = await fetchBackups(params);
    if (res.success && res.data) {
      setArtifacts(res.data.results);
      setArtifactCount(res.data.count);
      return null;
    }
    return errorText('Yedek geçmişi yüklenemedi.', res.error);
  }, [historyKind, historyPage, historyQuery, historyStatus]);

  const loadSchedule = useCallback(async () => {
    const res = await fetchSchedule();
    if (res.success && res.data) {
      setSchedule(res.data);
      return null;
    }
    return errorText('Zamanlama yüklenemedi.', res.error);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetchSettings();
    if (res.success && res.data) {
      setSettings(res.data);
      return null;
    }
    return errorText('Ayarlar yüklenemedi.', res.error);
  }, []);

  const loadLogs = useCallback(async () => {
    const params: Record<string, string | number> = { page_size: 100 };
    if (logsAction) params.action = logsAction;
    const res = await fetchLogs(params);
    if (res.success && res.data) {
      setLogs(res.data.results);
      return null;
    }
    return errorText('Günlükler yüklenemedi.', res.error);
  }, [logsAction]);

  const runLoad = useCallback(async (loader: () => Promise<string | null>) => {
    const err = await loader();
    if (err) setNotice({ type: 'error', text: err });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    const errors = (
      await Promise.all([loadDashboard(), loadResources(), loadArtifacts(), loadSchedule(), loadSettings(), loadLogs()])
    ).filter(Boolean) as string[];
    if (errors.length === 1) setNotice({ type: 'error', text: errors[0] });
    else if (errors.length > 1) setNotice({ type: 'error', text: `${errors.length} istek başarısız: ${errors[0]}` });
    setLoading(false);
  }, [loadArtifacts, loadDashboard, loadLogs, loadResources, loadSchedule, loadSettings]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!activeJob || ['completed', 'failed', 'cancelled'].includes(activeJob.status)) return;
    const interval = window.setInterval(async () => {
      const res = await fetchJob(activeJob.id);
      if (res.success && res.data?.job) {
        setActiveJob(res.data.job);
        if (['completed', 'failed', 'cancelled'].includes(res.data.job.status)) {
          void loadDashboard();
          void loadArtifacts();
          void loadLogs();
        }
      }
    }, 1800);
    return () => window.clearInterval(interval);
  }, [activeJob, loadArtifacts, loadDashboard, loadLogs]);

  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.key === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    setNotice(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleCreateBackup = async () => {
    setBusyKey('create');
    setNotice(null);
    setActiveJob({
      id: 0,
      artifact_id: null,
      action: 'create',
      status: 'running',
      phase: 'request',
      progress: 8,
      message: 'Yedekleme başlatılıyor...',
      result: {},
      error_message: '',
      started_at: new Date().toISOString(),
      finished_at: null,
    });

    const payload = {
      kind: manualForm.kind,
      resource_codes: manualForm.kind === 'selected' ? manualForm.resource_codes : undefined,
      encrypt: Boolean(manualForm.encrypt && dashboard?.config.encryption_key_available),
      compress: manualForm.compress,
    };
    if (payload.kind === 'selected' && !(payload.resource_codes && payload.resource_codes.length)) {
      setBusyKey(null);
      setActiveJob(null);
      setNotice({ type: 'error', text: 'Seçili kaynak yedeği için en az bir kaynak seçin.' });
      return;
    }
    const res = await createBackup(payload);
    setBusyKey(null);
    if (res.success && res.data) {
      setActiveJob(res.data.job);
      setNotice({ type: 'success', text: 'Yedekleme işi oluşturuldu.' });
      void loadDashboard();
      void loadArtifacts();
      void loadLogs();
    } else {
      setActiveJob(null);
      setNotice({ type: 'error', text: errorText('Yedek oluşturulamadı.', res.error) });
    }
  };

  const handleRetryBackup = async (artifact: BackupArtifact) => {
    setBusyKey('create');
    setNotice(null);
    const payload = {
      kind: artifact.kind,
      resource_codes: artifact.kind === 'selected' ? (artifact.resource_codes || []) : undefined,
      encrypt: Boolean(artifact.encrypted && dashboard?.config.encryption_key_available),
      compress: true,
    };
    const res = await createBackup(payload);
    setBusyKey(null);
    if (res.success && res.data) {
      setActiveJob(res.data.job);
      setNotice({ type: 'success', text: 'Yedekleme yeniden başlatıldı.' });
      void loadDashboard();
      void loadArtifacts();
      void loadLogs();
    } else {
      setNotice({ type: 'error', text: errorText('Yedek yeniden başlatılamadı.', res.error) });
    }
  };

  const handleSaveSchedule = async () => {
    if (!schedule) return;
    setBusyKey('schedule');
    const normalized = {
      ...schedule,
      enabled: schedule.frequency !== 'off' && schedule.enabled,
    };
    const res = await updateSchedule(normalized);
    setBusyKey(null);
    if (res.success) {
      setNotice({ type: 'success', text: 'Otomatik yedekleme ayarları kaydedildi.' });
      void loadDashboard();
      void loadSchedule();
    } else {
      setNotice({ type: 'error', text: errorText('Zamanlama kaydedilemedi.', res.error) });
    }
  };

  const handleRunScheduleNow = async () => {
    setBusyKey('schedule-run');
    setNotice(null);
    const res = await runScheduleNow();
    setBusyKey(null);
    if (res.success && res.data) {
      setActiveJob(res.data.job);
      if (res.data.schedule) setSchedule(res.data.schedule);
      const ok = res.data.job.status === 'completed';
      setNotice({
        type: ok ? 'success' : 'error',
        text: ok
          ? `Yedek tamamlandı: ${res.data.artifact.filename}`
          : `Yedek başarısız: ${res.data.job.error_message || res.data.job.message || 'bilinmeyen hata'}`,
      });
      void loadDashboard();
      void loadArtifacts();
      void loadSchedule();
      void loadLogs();
    } else {
      void loadSchedule();
      setNotice({ type: 'error', text: errorText('Zamanlanmış yedek çalıştırılamadı.', res.error) });
    }
  };

  const handleStopSchedule = async () => {
    if (!schedule) return;
    if (!window.confirm('Otomatik yedeklemeyi durdurmak istiyor musunuz? Planlanan saatlerde bir daha çalışmaz.')) return;
    setBusyKey('schedule-stop');
    setNotice(null);
    const res = await updateSchedule({
      ...schedule,
      frequency: 'off',
      enabled: false,
    });
    setBusyKey(null);
    if (res.success) {
      if (res.data?.schedule) setSchedule(res.data.schedule);
      else setSchedule({ ...schedule, frequency: 'off', enabled: false });
      setNotice({ type: 'success', text: 'Otomatik yedekleme durduruldu (kapalı).' });
      void loadDashboard();
      void loadSchedule();
    } else {
      setNotice({ type: 'error', text: errorText('Durdurulamadı.', res.error) });
    }
  };

  const handleUploadBackup = async (file: File | null) => {
    if (!file) return;
    setBusyKey('upload');
    setNotice(null);
    const res = await uploadBackup(file);
    setBusyKey(null);
    if (res.success && res.data) {
      setNotice({ type: 'success', text: `Yedek içe aktarıldı: ${res.data.artifact.filename}` });
      void loadArtifacts();
      void loadDashboard();
      void loadLogs();
      setRestoreArtifactId(res.data.artifact.id);
      setActiveTab('restore');
    } else {
      setNotice({ type: 'error', text: errorText('Yedek yüklenemedi.', res.error) });
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setBusyKey('settings');
    const res = await updateSettings(settings);
    setBusyKey(null);
    if (res.success) {
      setNotice({ type: 'success', text: 'Yedekleme ayarları kaydedildi.' });
      void loadSettings();
    } else {
      setNotice({ type: 'error', text: errorText('Ayarlar kaydedilemedi.', res.error) });
    }
  };

  const handleResourcePatch = async (resource: BackupResource, data: Partial<BackupResource>) => {
    setBusyKey(`resource-${resource.id}`);
    const res = await patchResource(resource.id, data);
    setBusyKey(null);
    if (res.success && res.data?.resource) {
      setResources((items) => items.map((item) => (item.id === resource.id ? res.data!.resource : item)));
      setNotice({ type: 'success', text: 'Kaynak güncellendi.' });
    } else {
      setNotice({ type: 'error', text: errorText('Kaynak güncellenemedi.', res.error) });
    }
  };

  const handleDeactivateResource = async (resource: BackupResource) => {
    if (!window.confirm(`${resource.name} kaynağı pasifleştirilsin mi?`)) return;
    setBusyKey(`resource-${resource.id}`);
    const res = await deactivateResource(resource.id);
    setBusyKey(null);
    if (res.success && res.data?.resource) {
      setResources((items) => items.map((item) => (item.id === resource.id ? res.data!.resource : item)));
      setNotice({ type: 'success', text: 'Kaynak pasifleştirildi.' });
    } else {
      setNotice({ type: 'error', text: errorText('Kaynak pasifleştirilemedi.', res.error) });
    }
  };

  const handleSyncResources = async () => {
    setBusyKey('sync-resources');
    const res = await syncResources(false);
    setBusyKey(null);
    if (res.success) {
      setNotice({ type: 'success', text: 'Kaynak kayıtları eşitlendi.' });
      void loadResources();
      void loadDashboard();
    } else {
      setNotice({ type: 'error', text: errorText('Kaynaklar eşitlenemedi.', res.error) });
    }
  };

  const handleCreateResource = async () => {
    if (!manualResource.code.trim() || !manualResource.name.trim()) {
      setNotice({ type: 'error', text: 'Kaynak kodu ve adı zorunludur.' });
      return;
    }
    setBusyKey('create-resource');
    const res = await createResource(manualResource);
    setBusyKey(null);
    if (res.success) {
      setNotice({ type: 'success', text: 'Manuel kaynak eklendi.' });
      setManualResource(emptyManualResource);
      void loadResources();
      void loadDashboard();
    } else {
      setNotice({ type: 'error', text: errorText('Kaynak eklenemedi.', res.error) });
    }
  };

  const handleDownload = async (artifact: BackupArtifact) => {
    setBusyKey(`download-${artifact.id}`);
    try {
      await downloadBackup(artifact.id, artifact.filename);
      setNotice({ type: 'success', text: 'Yedek indirme başlatıldı.' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Yedek indirilemedi.' });
    } finally {
      setBusyKey(null);
    }
  };

  const handlePreview = async (artifact: BackupArtifact) => {
    setBusyKey(`preview-${artifact.id}`);
    const res = await previewBackup(artifact.id);
    setBusyKey(null);
    if (res.success && res.data) {
      setPreviewArtifact(artifact);
      setPreviewData(res.data);
      setNotice({ type: 'info', text: 'Ön izleme paneli güncellendi.' });
    } else {
      setNotice({ type: 'error', text: errorText('Ön izleme alınamadı.', res.error) });
    }
  };

  const handleVerify = async (artifact: BackupArtifact) => {
    setBusyKey(`verify-${artifact.id}`);
    const res = await verifyBackup(artifact.id);
    setBusyKey(null);
    const valid = getRecordValue(res.data, 'valid');
    if (res.success && valid !== false) {
      setNotice({ type: 'success', text: 'Yedek doğrulaması başarılı.' });
      void loadLogs();
    } else {
      setNotice({ type: 'error', text: errorText('Yedek doğrulanamadı.', res.error) });
    }
  };

  const handleDeleteBackup = async (artifact: BackupArtifact) => {
    if (!window.confirm(`${artifact.filename} kalıcı olarak silinsin mi?`)) return;
    setBusyKey(`delete-${artifact.id}`);
    const res = await deleteBackup(artifact.id);
    setBusyKey(null);
    if (res.success) {
      setNotice({ type: 'success', text: 'Yedek silindi.' });
      void loadArtifacts();
      void loadDashboard();
      void loadLogs();
    } else {
      setNotice({ type: 'error', text: errorText('Yedek silinemedi.', res.error) });
    }
  };

  const selectForRestore = (artifact: BackupArtifact) => {
    setRestoreArtifactId(artifact.id);
    setAnalyzeData(null);
    setDryRunData(null);
    setRestoreConfirm('');
    switchTab('restore');
  };

  const handleAnalyze = async () => {
    if (!restoreArtifactId) return;
    setBusyKey('analyze');
    const res = await analyzeBackup(restoreArtifactId);
    setBusyKey(null);
    if (res.success && res.data) {
      setAnalyzeData(res.data);
      setNotice({ type: 'success', text: 'Yedek analizi tamamlandı.' });
    } else {
      setNotice({ type: 'error', text: errorText('Yedek analiz edilemedi.', res.error) });
    }
  };

  const handleDryRun = async () => {
    if (!restoreArtifactId) return;
    setBusyKey('dry-run');
    const res = await dryRunBackup(restoreArtifactId);
    setBusyKey(null);
    if (res.success && res.data) {
      setDryRunData(res.data);
      setNotice({ type: 'success', text: 'Deneme geri yükleme kontrolü tamamlandı.' });
    } else {
      setNotice({ type: 'error', text: errorText('Deneme geri yükleme başarısız.', res.error) });
    }
  };

  const handleRestore = async () => {
    if (!restoreArtifactId || restoreConfirm !== 'RESTORE') return;
    if (!window.confirm('Bu işlem mevcut verileri seçilen yedek ile değiştirecek. Devam edilsin mi?')) return;
    setBusyKey('restore');
    setRestoreProgress(35);
    const res = await restoreBackup(restoreArtifactId, restoreConfirm);
    setRestoreProgress(res.success ? 100 : 0);
    setBusyKey(null);
    if (res.success) {
      const relogin = Boolean(res.data?.relogin_required || res.data?.full_database_restored);
      setNotice({
        type: 'success',
        text: relogin
          ? 'Geri yükleme tamamlandı. Tam veritabanı yenilendi — lütfen yeniden giriş yapın.'
          : 'Geri yükleme tamamlandı.',
      });
      setRestoreConfirm('');
      setAnalyzeData(res.data || null);
      void loadDashboard();
      void loadArtifacts();
      void loadLogs();
      if (relogin) {
        window.setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      }
    } else {
      setNotice({ type: 'error', text: errorText('Geri yükleme başarısız.', res.error) });
    }
  };

  const totalPages = Math.max(1, Math.ceil(artifactCount / 12));
  const selectedRestoreArtifact = artifacts.find((artifact) => artifact.id === restoreArtifactId);

  return (
    <div className="yedekleme-page">
      <div className="hero-header yedekleme-hero">
        <div className="hero-content">
          <div className="hero-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
              <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Platform Yedekleme</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Yedekleme</span>
            </div>
          </div>
        </div>
        <button className="btn-hero yedekleme-refresh" onClick={loadAll} disabled={loading || Boolean(busyKey)}>
          Yenile
        </button>
      </div>

      {notice && (
        <div className={cls('yedekleme-notice', `yedekleme-notice--${notice.type}`)} role="status">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Mesajı kapat">×</button>
        </div>
      )}

      <nav className="yedekleme-tabs" aria-label="Yedekleme sekmeleri">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cls('yedekleme-tab', activeTab === tab.key && 'is-active')}
            onClick={() => switchTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <section className="yedekleme-card yedekleme-empty">Yedekleme verileri yükleniyor...</section>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <section className="yedekleme-section">
              <div className="yedekleme-grid yedekleme-grid--metrics">
                <MetricCard label="Son yedek" value={dashboard?.latest_backup?.filename || '-'} detail={formatDate(dashboard?.latest_backup?.started_at)} />
                <MetricCard label="Toplam yedek" value={String(dashboard?.total_backups ?? 0)} detail="Tamamlanmış arşiv" />
                <MetricCard label="Toplam boyut" value={formatBytes(dashboard?.total_size_bytes ?? 0)} detail={dashboard?.config.local_root || 'Yerel depolama'} />
                <MetricCard
                  label="Otomatik durum"
                  value={dashboard?.schedule.enabled ? 'Aktif' : 'Kapalı'}
                  detail={
                    dashboard?.schedule.enabled
                      ? `${FREQUENCY_LABELS[dashboard.schedule.frequency] || dashboard.schedule.frequency} ${formatScheduleTime(dashboard.schedule.hour, dashboard.schedule.minute)}`
                      : 'Zamanlama yok'
                  }
                  tone={dashboard?.schedule.enabled ? 'success' : 'muted'}
                />
                <MetricCard
                  label="Son otomatik çalışma"
                  value={
                    dashboard?.schedule.last_run_status === 'completed'
                      ? 'Başarılı'
                      : dashboard?.schedule.last_run_status === 'failed'
                        ? 'Başarısız'
                        : dashboard?.schedule.last_run_at
                          ? (STATUS_LABELS[dashboard.schedule.last_run_status || ''] || dashboard.schedule.last_run_status || '—')
                          : 'Henüz yok'
                  }
                  detail={
                    dashboard?.schedule.last_run_at
                      ? `${formatDate(dashboard.schedule.last_run_at)}${dashboard.schedule.last_run_artifact ? ` · ${dashboard.schedule.last_run_artifact.filename}` : ''}`
                      : 'Şimdi Çalıştır veya cron sonrası burada görünür'
                  }
                  tone={
                    dashboard?.schedule.last_run_status === 'completed'
                      ? 'success'
                      : dashboard?.schedule.last_run_status === 'failed'
                        ? 'danger'
                        : 'muted'
                  }
                />
                <MetricCard label="Son başarılı işlem" value={ACTION_LABELS[dashboard?.last_success.action || ''] || dashboard?.last_success.action || '-'} detail={formatDate(dashboard?.last_success.created_at)} tone="success" />
                <MetricCard label="Son hata" value={dashboard?.last_error.error_message || '-'} detail={formatDate(dashboard?.last_error.created_at)} tone={dashboard?.last_error.error_message ? 'danger' : 'muted'} />
              </div>

              <div className="yedekleme-grid yedekleme-grid--two">
                <Panel title="Son Yedek Detayı" description="En güncel tamamlanmış arşiv">
                  {dashboard?.latest_backup ? (
                    <div className="yedekleme-stack">
                      <div className="yedekleme-title-row">
                        <strong>{dashboard.latest_backup.filename}</strong>
                        <StatusBadge status={dashboard.latest_backup.status} />
                      </div>
                      <KeyValue label="Tür" value={KIND_LABELS[dashboard.latest_backup.kind] || dashboard.latest_backup.kind} />
                      <KeyValue label="Boyut" value={formatBytes(dashboard.latest_backup.size_bytes)} />
                      <KeyValue label="Şifreli" value={dashboard.latest_backup.encrypted ? 'Evet' : 'Hayır'} />
                      <KeyValue label="Checksum" value={dashboard.latest_backup.checksum || '-'} mono />
                      <button className="yedekleme-btn yedekleme-btn--primary" onClick={() => handleDownload(dashboard.latest_backup!)} disabled={busyKey === `download-${dashboard.latest_backup.id}`}>
                        Son Yedeği İndir
                      </button>
                    </div>
                  ) : (
                    <EmptyState text="Henüz tamamlanmış yedek yok." />
                  )}
                </Panel>

                <Panel title="Sistem Özeti" description="Kaynak ve ayar durumu">
                  <div className="yedekleme-stack">
                    <KeyValue label="Aktif kaynak" value={`${dashboard?.resources.active ?? 0} / ${dashboard?.resources.total ?? 0}`} />
                    <KeyValue label="Format" value={dashboard?.config.format_version || '2.0'} />
                    <KeyValue label="Şifreleme anahtarı" value={dashboard?.config.encryption_key_available ? 'Hazır' : 'Eksik'} />
                    <KeyValue label="Anahtar izi" value={dashboard?.config.key_fingerprint || '-'} mono />
                    <button className="yedekleme-btn" type="button" onClick={() => switchTab('manual')}>
                      Manuel Yedek Oluştur
                    </button>
                  </div>
                </Panel>
              </div>
            </section>
          )}

          {activeTab === 'manual' && (
            <section className="yedekleme-grid yedekleme-grid--two">
              <Panel title="Manuel Yedek" description="İstediğiniz yedek türünü ve kaynakları seçin">
                <div className="yedekleme-form-grid">
                  <label className="yedekleme-field">
                    <span>Yedek türü</span>
                    <select value={manualForm.kind} onChange={(event) => setManualForm((form) => ({ ...form, kind: event.target.value }))}>
                      {Object.entries(KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="yedekleme-check">
                    <input
                      type="checkbox"
                      checked={manualForm.encrypt}
                      disabled={!dashboard?.config.encryption_key_available}
                      onChange={(event) => setManualForm((form) => ({ ...form, encrypt: event.target.checked }))}
                    />
                    Şifrele (AES-256)
                  </label>
                  {!dashboard?.config.encryption_key_available && (
                    <p className="yedekleme-help">
                      Şifreleme için sunucuda <code>BACKUP_ENCRYPTION_KEY</code> tanımlı olmalı.
                    </p>
                  )}
                  <label className="yedekleme-check">
                    <input type="checkbox" checked={manualForm.compress} onChange={(event) => setManualForm((form) => ({ ...form, compress: event.target.checked }))} />
                    Sıkıştır
                  </label>
                </div>

                <label className="yedekleme-field">
                  <span>Kaynaklar</span>
                  <select
                    multiple
                    value={manualForm.resource_codes}
                    onChange={(event) => {
                      const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                      setManualForm((form) => ({ ...form, resource_codes: selected }));
                    }}
                  >
                    {resources.filter((resource) => resource.is_active).map((resource) => (
                      <option key={resource.code} value={resource.code}>
                        {resource.name} ({resource.code})
                      </option>
                    ))}
                  </select>
                  <small>Seçili kaynaklar türünde zorunludur; diğer türlerde kapsamı daraltmak için kullanılabilir.</small>
                </label>

                <button className="yedekleme-btn yedekleme-btn--primary" type="button" onClick={handleCreateBackup} disabled={busyKey === 'create' || (manualForm.kind === 'selected' && manualForm.resource_codes.length === 0)}>
                  {busyKey === 'create' ? 'Oluşturuluyor...' : 'Yedek Oluştur'}
                </button>
              </Panel>

              <Panel title="İş Durumu" description="Oluşturma ilerlemesi">
                {activeJob ? (
                  <JobProgress job={activeJob} />
                ) : (
                  <EmptyState text="Henüz çalışan yedekleme işi yok." />
                )}
              </Panel>
            </section>
          )}

          {activeTab === 'schedule' && (
            <section className="yedekleme-grid yedekleme-grid--two">
              <Panel title="Otomatik Yedekleme" description="Zamanlama ve saklama ayarları">
                {schedule ? (
                  <div className="yedekleme-form-grid">
                    <label className="yedekleme-field">
                      <span>Sıklık</span>
                      <select
                        value={schedule.frequency}
                        onChange={(event) => setSchedule((current) => current ? { ...current, frequency: event.target.value, enabled: event.target.value !== 'off' } : current)}
                      >
                        <option value="off">Kapalı</option>
                        <option value="daily">Günlük</option>
                        <option value="weekly">Haftalık</option>
                        <option value="monthly">Aylık</option>
                      </select>
                    </label>
                    <label className="yedekleme-field yedekleme-field--full">
                      <span>Çalışma saati (24 saat)</span>
                      <input
                        type="time"
                        step={60}
                        value={toTimeInputValue(schedule.hour, schedule.minute)}
                        onChange={(event) => {
                          const parsed = parseTimeInputValue(event.target.value);
                          if (!parsed) return;
                          setSchedule({ ...schedule, hour: parsed.hour, minute: parsed.minute });
                        }}
                      />
                      <small>
                        Sunucu yerel saati · seçili: {formatScheduleTime(schedule.hour, schedule.minute)}
                        {' '}— örn. 03:00 gece, 15:00 öğleden sonra
                      </small>
                    </label>
                    <label className="yedekleme-field">
                      <span>En fazla arşiv</span>
                      <input type="number" min={1} max={500} value={schedule.max_artifacts} onChange={(event) => setSchedule({ ...schedule, max_artifacts: Number(event.target.value) })} />
                    </label>
                    <label className="yedekleme-field">
                      <span>Yedek türü</span>
                      <select value={schedule.kind} onChange={(event) => setSchedule({ ...schedule, kind: event.target.value })}>
                        {Object.entries(KIND_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="yedekleme-check">
                      <input type="checkbox" checked={schedule.auto_delete_old} onChange={(event) => setSchedule({ ...schedule, auto_delete_old: event.target.checked })} />
                      Eski arşivleri otomatik sil
                    </label>
                    <label className="yedekleme-check">
                      <input type="checkbox" checked={schedule.encrypt} onChange={(event) => setSchedule({ ...schedule, encrypt: event.target.checked })} />
                      Otomatik yedekleri şifrele
                    </label>
                    <button className="yedekleme-btn yedekleme-btn--primary" onClick={handleSaveSchedule} disabled={busyKey === 'schedule'}>
                      {busyKey === 'schedule' ? 'Kaydediliyor...' : 'Zamanlamayı Kaydet'}
                    </button>
                    <button className="yedekleme-btn" onClick={handleRunScheduleNow} disabled={busyKey === 'schedule-run'}>
                      {busyKey === 'schedule-run' ? 'Çalışıyor...' : 'Şimdi Çalıştır'}
                    </button>
                    {schedule.frequency !== 'off' && schedule.enabled && (
                      <button className="yedekleme-btn yedekleme-btn--danger" onClick={handleStopSchedule} disabled={busyKey === 'schedule-stop'}>
                        {busyKey === 'schedule-stop' ? 'Durduruluyor...' : 'Otomatiği Durdur'}
                      </button>
                    )}
                    <p className="yedekleme-help yedekleme-field--full">
                      “Şimdi Çalıştır” bitene kadar bekler; yarıda kesilemez. Gelecekteki otomatik çalıştırmaları durdurmak için
                      {' '}<strong>Otomatiği Durdur</strong> veya sıklığı <strong>Kapalı</strong> yapıp kaydedin.
                    </p>
                  </div>
                ) : (
                  <EmptyState text="Zamanlama bilgisi yüklenemedi." />
                )}
              </Panel>
              <Panel title="Çalışma Bilgisi" description="Son sonuç ve cron">
                <div className="yedekleme-stack">
                  <div className={cls(
                    'yedekleme-callout',
                    schedule?.last_run_status === 'completed' && 'yedekleme-callout--success',
                    schedule?.last_run_status === 'failed' && 'yedekleme-callout--danger',
                    !schedule?.last_run_at && 'yedekleme-callout--muted',
                  )}
                  >
                    <strong>Son çalışma sonucu</strong>
                    {!schedule?.last_run_at ? (
                      <p>Henüz otomatik veya “Şimdi Çalıştır” ile bir çalışma yok.</p>
                    ) : (
                      <>
                        <p>
                          <StatusBadge status={schedule.last_run_status || 'pending'} />
                          {' '}{formatDate(schedule.last_run_at)}
                        </p>
                        <p>{schedule.last_run_message || '-'}</p>
                        {schedule.last_run_artifact && (
                          <p>
                            Dosya: <code>{schedule.last_run_artifact.filename}</code>
                            {' '}({formatBytes(schedule.last_run_artifact.size_bytes || 0)})
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {activeJob && (
                    <div className="yedekleme-callout">
                      <strong>Bu oturumdaki iş</strong>
                      <JobProgress job={activeJob} />
                    </div>
                  )}
                  <KeyValue label="Plan durumu" value={schedule?.enabled && schedule.frequency !== 'off' ? 'Aktif (cron gerekli)' : 'Kapalı'} />
                  <KeyValue
                    label="Plan"
                    value={
                      schedule && schedule.frequency !== 'off'
                        ? `${FREQUENCY_LABELS[schedule.frequency] || schedule.frequency} ${formatScheduleTime(schedule.hour, schedule.minute)}`
                        : '-'
                    }
                  />
                  <p className="yedekleme-help">
                    Saat 24 saat formatındadır (00–23). Varsayılan 03:00 gece yarığıdır.
                    UI ayarı tek başına yetmez; sunucuda dakikalık cron ile
                    {' '}<code>run_scheduled_backups</code> çalışmalıdır. Docker’da host cron veya
                    {' '}<code>docker compose exec backend python manage.py run_scheduled_backups</code>.
                  </p>
                  <code className="yedekleme-code">* * * * * python manage.py run_scheduled_backups</code>
                </div>
              </Panel>
            </section>
          )}

          {activeTab === 'resources' && (
            <section className="yedekleme-section">
              <Panel title="Kaynaklar" description="Yedeklenecek sistem kaynakları">
                <div className="yedekleme-toolbar">
                  <input value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} placeholder="Kaynak ara..." />
                  <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
                    <option value="">Tüm türler</option>
                    {resourceTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  <select value={resourceActive} onChange={(event) => setResourceActive(event.target.value)}>
                    <option value="">Tümü</option>
                    <option value="true">Aktif</option>
                    <option value="false">Pasif</option>
                  </select>
                  <button className="yedekleme-btn" onClick={() => void runLoad(loadResources)}>Filtrele</button>
                  <button className="yedekleme-btn yedekleme-btn--primary" onClick={handleSyncResources} disabled={busyKey === 'sync-resources'}>
                    Kaynakları Eşitle
                  </button>
                </div>
                <div className="yedekleme-table-wrap">
                  <table className="yedekleme-table">
                    <thead>
                      <tr>
                        <th>Ad</th>
                        <th>Tür</th>
                        <th>Açıklama</th>
                        <th>Aktif</th>
                        <th>Varsayılan</th>
                        <th>Şifrele</th>
                        <th>Sıkıştır</th>
                        <th>Öncelik</th>
                        <th>Geri yüklenir</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resources.map((resource) => (
                        <tr key={resource.id}>
                          <td>
                            <strong>{resource.name}</strong>
                            <small>{resource.code}</small>
                          </td>
                          <td><span className="yedekleme-badge yedekleme-badge--neutral">{resource.resource_type}</span></td>
                          <td className="yedekleme-table-description">{resource.description || '-'}</td>
                          {(['is_active', 'is_default', 'encrypt', 'compress'] as const).map((field) => (
                            <td key={field}>
                              <input type="checkbox" checked={resource[field]} disabled={busyKey === `resource-${resource.id}`} onChange={(event) => handleResourcePatch(resource, { [field]: event.target.checked })} />
                            </td>
                          ))}
                          <td>
                            <input className="yedekleme-number-input" type="number" value={resource.priority} disabled={busyKey === `resource-${resource.id}`} onChange={(event) => handleResourcePatch(resource, { priority: Number(event.target.value) })} />
                          </td>
                          <td>
                            <input type="checkbox" checked={resource.is_restorable} disabled={busyKey === `resource-${resource.id}`} onChange={(event) => handleResourcePatch(resource, { is_restorable: event.target.checked })} />
                          </td>
                          <td>
                            <button className="yedekleme-link-btn yedekleme-link-btn--danger" onClick={() => handleDeactivateResource(resource)} disabled={!resource.is_active || busyKey === `resource-${resource.id}`}>
                              Pasifleştir
                            </button>
                          </td>
                        </tr>
                      ))}
                      {resources.length === 0 && <TableEmpty colSpan={10} text="Kaynak bulunamadı." />}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Manuel Kaynak Ekle" description="Silme yoktur; gerekirse kaynak pasifleştirilir">
                <div className="yedekleme-form-grid yedekleme-form-grid--wide">
                  <label className="yedekleme-field"><span>Kod</span><input value={manualResource.code} onChange={(event) => setManualResource((form) => ({ ...form, code: event.target.value }))} placeholder="manual_resource" /></label>
                  <label className="yedekleme-field"><span>Ad</span><input value={manualResource.name} onChange={(event) => setManualResource((form) => ({ ...form, name: event.target.value }))} /></label>
                  <label className="yedekleme-field"><span>Tür</span><select value={manualResource.resource_type} onChange={(event) => setManualResource((form) => ({ ...form, resource_type: event.target.value }))}>{resourceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}<option value="other">Diğer</option></select></label>
                  <label className="yedekleme-field"><span>Öncelik</span><input type="number" value={manualResource.priority} onChange={(event) => setManualResource((form) => ({ ...form, priority: Number(event.target.value) }))} /></label>
                  <label className="yedekleme-field yedekleme-field--full"><span>Açıklama</span><textarea value={manualResource.description} onChange={(event) => setManualResource((form) => ({ ...form, description: event.target.value }))} rows={3} /></label>
                  <label className="yedekleme-check"><input type="checkbox" checked={manualResource.encrypt} onChange={(event) => setManualResource((form) => ({ ...form, encrypt: event.target.checked }))} /> Şifrele</label>
                  <label className="yedekleme-check"><input type="checkbox" checked={manualResource.compress} onChange={(event) => setManualResource((form) => ({ ...form, compress: event.target.checked }))} /> Sıkıştır</label>
                  <label className="yedekleme-check"><input type="checkbox" checked={manualResource.is_restorable} onChange={(event) => setManualResource((form) => ({ ...form, is_restorable: event.target.checked }))} /> Geri yüklenebilir</label>
                </div>
                <button className="yedekleme-btn yedekleme-btn--primary" onClick={handleCreateResource} disabled={busyKey === 'create-resource'}>
                  Kaynak Ekle
                </button>
              </Panel>
            </section>
          )}

          {activeTab === 'history' && (
            <section className="yedekleme-section">
              <Panel title="Yedek Geçmişi" description="Arşivleri arayın, doğrulayın, indirin veya geri yüklemeye hazırlayın">
                <div className="yedekleme-toolbar">
                  <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Dosya veya checksum ara..." />
                  <select value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); setHistoryPage(1); }}>
                    <option value="">Tüm durumlar</option>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select value={historyKind} onChange={(event) => { setHistoryKind(event.target.value); setHistoryPage(1); }}>
                    <option value="">Tüm türler</option>
                    {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button className="yedekleme-btn" onClick={() => void runLoad(loadArtifacts)}>Ara</button>
                </div>
                <div className="yedekleme-table-wrap">
                  <table className="yedekleme-table">
                    <thead>
                      <tr>
                        <th>Dosya</th>
                        <th>Durum</th>
                        <th>Tür</th>
                        <th>Boyut</th>
                        <th>Tarih</th>
                        <th>İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {artifacts.map((artifact) => (
                        <tr key={artifact.id}>
                          <td>
                            <strong>{artifact.filename}</strong>
                            <small>{artifact.checksum || '-'}</small>
                          </td>
                          <td><StatusBadge status={artifact.status} /></td>
                          <td>{KIND_LABELS[artifact.kind] || artifact.kind}</td>
                          <td>{formatBytes(artifact.size_bytes)}</td>
                          <td>{formatDate(artifact.started_at)}</td>
                          <td>
                            <div className="yedekleme-actions">
                              <button className="yedekleme-link-btn" onClick={() => handlePreview(artifact)}>Ön izleme</button>
                              <button className="yedekleme-link-btn" onClick={() => handleDownload(artifact)} disabled={artifact.status !== 'completed'}>İndir</button>
                              <button className="yedekleme-link-btn" onClick={() => handleVerify(artifact)} disabled={artifact.status !== 'completed'}>Doğrula</button>
                              <button className="yedekleme-link-btn" onClick={() => selectForRestore(artifact)} disabled={artifact.status !== 'completed'}>Geri yükle</button>
                              {(artifact.status === 'failed' || artifact.status === 'cancelled') && (
                                <button className="yedekleme-link-btn" onClick={() => handleRetryBackup(artifact)} disabled={busyKey === 'create'}>Yeniden dene</button>
                              )}
                              <button className="yedekleme-link-btn yedekleme-link-btn--danger" onClick={() => handleDeleteBackup(artifact)}>Sil</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {artifacts.length === 0 && <TableEmpty colSpan={6} text="Yedek kaydı bulunamadı." />}
                    </tbody>
                  </table>
                </div>
                <Pagination page={historyPage} totalPages={totalPages} onChange={setHistoryPage} />
              </Panel>

              {previewData && (
                <Panel title={`Ön İzleme: ${previewArtifact?.filename || ''}`} description="Manifest ve içerik özeti">
                  <JsonPreview data={previewData} />
                </Panel>
              )}
            </section>
          )}

          {activeTab === 'restore' && (
            <section className="yedekleme-grid yedekleme-grid--two">
              <Panel title="Geri Yükleme" description="Önce analiz ve deneme çalıştırın, sonra açık onay verin">
                <label className="yedekleme-field">
                  <span>İndirilmiş yedeği yükle (.zip / .zip.enc)</span>
                  <input
                    type="file"
                    accept=".zip,.enc,application/zip"
                    disabled={busyKey === 'upload'}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      void handleUploadBackup(file);
                      event.target.value = '';
                    }}
                  />
                  <small>Bilgisayara indirdiğiniz v2 yedeği buradan sisteme kaydedilir; ardından analiz / dry-run / restore yapılır.</small>
                </label>
                <label className="yedekleme-field">
                  <span>Yedek seçin</span>
                  <select value={restoreArtifactId} onChange={(event) => { setRestoreArtifactId(event.target.value ? Number(event.target.value) : ''); setAnalyzeData(null); setDryRunData(null); }}>
                    <option value="">Yedek seçin</option>
                    {completedArtifacts.map((artifact) => (
                      <option key={artifact.id} value={artifact.id}>
                        {artifact.filename} - {formatDate(artifact.started_at)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedRestoreArtifact && (
                  <div className="yedekleme-inline-summary">
                    <StatusBadge status={selectedRestoreArtifact.status} />
                    <span>{formatBytes(selectedRestoreArtifact.size_bytes)}</span>
                    <span>{KIND_LABELS[selectedRestoreArtifact.kind] || selectedRestoreArtifact.kind}</span>
                  </div>
                )}
                <div className="yedekleme-actions yedekleme-actions--spaced">
                  <button className="yedekleme-btn" onClick={handleAnalyze} disabled={!restoreArtifactId || busyKey === 'analyze'}>Analiz Et</button>
                  <button className="yedekleme-btn" onClick={handleDryRun} disabled={!restoreArtifactId || busyKey === 'dry-run'}>Dry-run</button>
                </div>
                <label className="yedekleme-field">
                  <span>Onay için RESTORE yazın</span>
                  <input value={restoreConfirm} onChange={(event) => setRestoreConfirm(event.target.value)} placeholder="RESTORE" autoComplete="off" />
                </label>
                {busyKey === 'restore' || restoreProgress > 0 ? <ProgressBar value={restoreProgress || 35} /> : null}
                <button className="yedekleme-btn yedekleme-btn--danger" onClick={handleRestore} disabled={!restoreArtifactId || restoreConfirm !== 'RESTORE' || busyKey === 'restore'}>
                  Geri Yüklemeyi Başlat
                </button>
              </Panel>
              <div className="yedekleme-stack">
                <Panel title="Analiz Paneli" description="Yedek içeriği ve risk özeti">
                  {analyzeData ? <JsonPreview data={analyzeData} /> : <EmptyState text="Analiz sonucu henüz yok." />}
                </Panel>
                <Panel title="Dry-run Paneli" description="Geri yükleme ön kontrol sonucu">
                  {dryRunData ? <JsonPreview data={dryRunData} /> : <EmptyState text="Dry-run sonucu henüz yok." />}
                </Panel>
              </div>
            </section>
          )}

          {activeTab === 'logs' && (
            <section className="yedekleme-section">
              <Panel title="Günlükler" description="Yedekleme işlem kayıtları">
                <div className="yedekleme-toolbar">
                  <select value={logsAction} onChange={(event) => setLogsAction(event.target.value)}>
                    <option value="">Tüm işlemler</option>
                    {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select value={logsSuccess} onChange={(event) => setLogsSuccess(event.target.value)}>
                    <option value="">Başarı durumu</option>
                    <option value="success">Başarılı</option>
                    <option value="error">Hatalı</option>
                  </select>
                  <input value={logsQuery} onChange={(event) => setLogsQuery(event.target.value)} placeholder="Log içinde ara..." />
                  <button className="yedekleme-btn" onClick={() => void runLoad(loadLogs)}>Yenile</button>
                </div>
                <div className="yedekleme-table-wrap">
                  <table className="yedekleme-table">
                    <thead>
                      <tr>
                        <th>Tarih</th>
                        <th>İşlem</th>
                        <th>Adım</th>
                        <th>Başarı</th>
                        <th>Süre</th>
                        <th>IP</th>
                        <th>Hata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{formatDate(log.created_at)}</td>
                          <td>{ACTION_LABELS[log.action] || log.action}</td>
                          <td>{log.step || '-'}</td>
                          <td><span className={cls('yedekleme-badge', log.success ? 'yedekleme-badge--success' : 'yedekleme-badge--danger')}>{log.success ? 'Başarılı' : 'Hatalı'}</span></td>
                          <td>{log.duration_ms ? `${log.duration_ms} ms` : '-'}</td>
                          <td>{log.ip_address || '-'}</td>
                          <td className="yedekleme-table-description">{log.error_message || '-'}</td>
                        </tr>
                      ))}
                      {filteredLogs.length === 0 && <TableEmpty colSpan={7} text="Günlük kaydı bulunamadı." />}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="yedekleme-grid yedekleme-grid--two">
              <Panel title="Ayarlar" description="Varsayılan şifreleme ve sıkıştırma davranışı">
                {settings ? (
                  <div className="yedekleme-stack">
                    <label className="yedekleme-check"><input type="checkbox" checked={settings.encryption_enabled} onChange={(event) => setSettings({ ...settings, encryption_enabled: event.target.checked })} /> Şifreleme özelliği aktif</label>
                    <label className="yedekleme-check"><input type="checkbox" checked={settings.default_encrypt} onChange={(event) => setSettings({ ...settings, default_encrypt: event.target.checked })} /> Varsayılan olarak şifrele</label>
                    <label className="yedekleme-check"><input type="checkbox" checked={settings.default_compress} onChange={(event) => setSettings({ ...settings, default_compress: event.target.checked })} /> Varsayılan olarak sıkıştır</label>
                    <label className="yedekleme-check"><input type="checkbox" checked={settings.notify_enabled} onChange={(event) => setSettings({ ...settings, notify_enabled: event.target.checked })} /> E-posta bildirimleri aktif</label>
                    <label className="yedekleme-check"><input type="checkbox" checked={settings.notify_on_success} disabled={!settings.notify_enabled} onChange={(event) => setSettings({ ...settings, notify_on_success: event.target.checked })} /> Başarılı yedek/geri yüklemede bildir</label>
                    <label className="yedekleme-check"><input type="checkbox" checked={settings.notify_on_failure} disabled={!settings.notify_enabled} onChange={(event) => setSettings({ ...settings, notify_on_failure: event.target.checked })} /> Hatada bildir</label>
                    <label className="yedekleme-field"><span>Bildirim e-postaları (virgülle ayır)</span><input type="text" value={settings.notify_emails} disabled={!settings.notify_enabled} onChange={(event) => setSettings({ ...settings, notify_emails: event.target.value })} placeholder="admin@ornek.com, bt@ornek.com" /></label>
                    <label className="yedekleme-field"><span>Notlar</span><textarea value={settings.notes} onChange={(event) => setSettings({ ...settings, notes: event.target.value })} rows={5} /></label>
                    <button className="yedekleme-btn yedekleme-btn--primary" onClick={handleSaveSettings} disabled={busyKey === 'settings'}>Ayarları Kaydet</button>
                  </div>
                ) : (
                  <EmptyState text="Ayarlar yüklenemedi." />
                )}
              </Panel>
              <Panel title="Format ve Anahtar" description="Sistem bilgileri">
                <div className="yedekleme-stack">
                  <KeyValue label="Yerel depo" value={settings?.local_root || '-'} />
                  <KeyValue label="Format sürümü" value={settings?.format_version || '2.0'} />
                  <KeyValue label="Anahtar durumu" value={settings?.encryption_key_available ? 'Hazır' : 'Eksik'} />
                  <KeyValue label="Key fingerprint" value={settings?.key_fingerprint || '-'} mono />
                  <div className="yedekleme-callout">
                    Legacy yedek formatı desteklenmez. Bu panel yalnızca format v2.0 arşivlerini yönetir.
                  </div>
                </div>
              </Panel>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, tone = 'default' }: { label: string; value: string; detail?: string; tone?: 'default' | 'success' | 'danger' | 'muted' }) {
  return (
    <article className={cls('yedekleme-metric', `yedekleme-metric--${tone}`)}>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
      {detail && <small title={detail}>{detail}</small>}
    </article>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="yedekleme-card">
      <header className="yedekleme-card-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </header>
      <div className="yedekleme-card-body">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'warning' : 'neutral';
  return <span className={cls('yedekleme-badge', `yedekleme-badge--${tone}`)}>{STATUS_LABELS[status] || status}</span>;
}

function KeyValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="yedekleme-key-value">
      <span>{label}</span>
      <strong className={mono ? 'yedekleme-mono' : undefined}>{value}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="yedekleme-empty">{text}</div>;
}

function TableEmpty({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="yedekleme-table-empty">{text}</td>
    </tr>
  );
}

function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="yedekleme-progress" aria-label={`İlerleme yüzde ${safeValue}`}>
      <div style={{ width: `${safeValue}%` }} />
      <span>{safeValue}%</span>
    </div>
  );
}

function JobProgress({ job }: { job: BackupJob }) {
  return (
    <div className="yedekleme-stack">
      <div className="yedekleme-title-row">
        <strong>{job.message || 'Yedekleme işi'}</strong>
        <StatusBadge status={job.status} />
      </div>
      <ProgressBar value={job.progress || (job.status === 'completed' ? 100 : 15)} />
      <KeyValue label="Faz" value={job.phase || '-'} />
      <KeyValue label="Başlangıç" value={formatDate(job.started_at)} />
      {job.error_message && <div className="yedekleme-callout yedekleme-callout--danger">{job.error_message}</div>}
      {Object.keys(job.result || {}).length > 0 && <JsonPreview data={job.result} />}
    </div>
  );
}

function JsonPreview({ data }: { data: Record<string, unknown> }) {
  return <pre className="yedekleme-json">{JSON.stringify(data, null, 2)}</pre>;
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  return (
    <div className="yedekleme-pagination">
      <button className="yedekleme-btn" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>Önceki</button>
      <span>{page} / {totalPages}</span>
      <button className="yedekleme-btn" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Sonraki</button>
    </div>
  );
}
