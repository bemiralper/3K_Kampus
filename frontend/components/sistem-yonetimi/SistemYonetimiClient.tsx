'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  controlService,
  fetchAudit,
  fetchDashboard,
  fetchErrorDetail,
  fetchErrors,
  fetchHealth,
  fetchJobRun,
  fetchJobs,
  fetchLogSources,
  fetchLogs,
  fetchPerformance,
  fetchServices,
  fetchSettings,
  fetchStorage,
  fetchTimeline,
  formatBytes,
  formatUptime,
  patchError,
  runJob,
  updateSettings,
  type AlertItem,
  type AuditItem,
  type DashboardData,
  type ErrorItem,
  type HealthItem,
  type JobItem,
  type JobRun,
  type LogLine,
  type LogSource,
  type ServiceItem,
  type SettingsData,
  type TimelineItem,
} from '@/lib/sistem-yonetimi-api';
import './sistem-yonetimi.css';

type TabKey =
  | 'overview'
  | 'health'
  | 'services'
  | 'logs'
  | 'errors'
  | 'jobs'
  | 'audit'
  | 'performance'
  | 'storage'
  | 'timeline'
  | 'settings';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Genel Durum' },
  { key: 'health', label: 'Sistem Sağlığı' },
  { key: 'services', label: 'Servisler' },
  { key: 'logs', label: 'Log Merkezi' },
  { key: 'errors', label: 'Hata Merkezi' },
  { key: 'jobs', label: 'Arka Plan Görevleri' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'performance', label: 'Performans' },
  { key: 'storage', label: 'Depolama' },
  { key: 'timeline', label: 'Günlükler' },
  { key: 'settings', label: 'Ayarlar' },
];

const STATUS_LABELS: Record<string, string> = {
  up: 'Çalışıyor',
  warn: 'Uyarı',
  down: 'Hata',
  stopped: 'Durduruldu',
  unknown: 'Bilinmiyor',
  completed: 'Tamamlandı',
  running: 'Çalışıyor',
  failed: 'Başarısız',
  pending: 'Bekliyor',
  open: 'Açık',
  resolved: 'Çözüldü',
  ignored: 'Yok sayıldı',
};

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('tr-TR');
}

function statusTone(status?: string) {
  if (status === 'up' || status === 'completed' || status === 'success') return 'success';
  if (status === 'down' || status === 'failed' || status === 'critical') return 'danger';
  if (status === 'warn' || status === 'warning' || status === 'running') return 'warning';
  return 'neutral';
}

export default function SistemYonetimiClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const initialTab = TABS.some((t) => t.key === tabFromUrl) ? (tabFromUrl as TabKey) : 'overview';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [opsEnabled, setOpsEnabled] = useState(false);
  const [logSources, setLogSources] = useState<LogSource[]>([]);
  const [logSource, setLogSource] = useState('django');
  const [logQuery, setLogQuery] = useState('');
  const [logLevels, setLogLevels] = useState('');
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [liveLogs, setLiveLogs] = useState(false);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [errorTotal, setErrorTotal] = useState(0);
  const [selectedError, setSelectedError] = useState<ErrorItem | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [activeRun, setActiveRun] = useState<JobRun | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [perfRange, setPerfRange] = useState('1h');
  const [perf, setPerf] = useState<{ points: Array<Record<string, number | string>>; live: Record<string, unknown> } | null>(null);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof fetchStorage>>['data'] | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    setNotice(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const loadOverview = useCallback(async () => {
    const res = await fetchDashboard();
    if (res.success && res.data) {
      setDashboard(res.data);
      setAlerts(res.data.alerts || []);
      return null;
    }
    return res.error || 'Genel durum yüklenemedi.';
  }, []);

  const loadTabData = useCallback(async (tab: TabKey) => {
    if (tab === 'overview') return loadOverview();
    if (tab === 'health') {
      const res = await fetchHealth();
      if (res.success && res.data) {
        setHealth(res.data.items);
        setAlerts(res.data.alerts || []);
        return null;
      }
      return res.error || 'Sağlık verisi yüklenemedi.';
    }
    if (tab === 'services') {
      const res = await fetchServices();
      if (res.success && res.data) {
        setServices(res.data.items);
        setOpsEnabled(Boolean(res.data.ops_enabled));
        return null;
      }
      return res.error || 'Servisler yüklenemedi.';
    }
    if (tab === 'logs') {
      const src = await fetchLogSources();
      if (src.success && src.data) setLogSources(src.data.items);
      const res = await fetchLogs({ source: logSource, q: logQuery, levels: logLevels, max_lines: 250 });
      if (res.success && res.data) {
        setLogLines(res.data.lines || []);
        return res.data.error || null;
      }
      return res.error || 'Loglar yüklenemedi.';
    }
    if (tab === 'errors') {
      const res = await fetchErrors({ status: 'open', page: 1, page_size: 50 });
      if (res.success && res.data) {
        setErrors(res.data.items);
        setErrorTotal(res.data.total);
        return null;
      }
      return res.error || 'Hatalar yüklenemedi.';
    }
    if (tab === 'jobs') {
      const res = await fetchJobs();
      if (res.success && res.data) {
        setJobs(res.data.items);
        return null;
      }
      return res.error || 'Görevler yüklenemedi.';
    }
    if (tab === 'audit') {
      const res = await fetchAudit({ page: 1, page_size: 50 });
      if (res.success && res.data) {
        setAudit(res.data.items);
        return null;
      }
      return res.error || 'Audit log yüklenemedi.';
    }
    if (tab === 'timeline') {
      const res = await fetchTimeline({ page: 1, page_size: 60 });
      if (res.success && res.data) {
        setTimeline(res.data.items);
        return null;
      }
      return res.error || 'Günlükler yüklenemedi.';
    }
    if (tab === 'performance') {
      const res = await fetchPerformance(perfRange);
      if (res.success && res.data) {
        setPerf({ points: res.data.points, live: res.data.live });
        return null;
      }
      return res.error || 'Performans verisi yüklenemedi.';
    }
    if (tab === 'storage') {
      const res = await fetchStorage();
      if (res.success && res.data) {
        setStorage(res.data);
        return null;
      }
      return res.error || 'Depolama verisi yüklenemedi.';
    }
    if (tab === 'settings') {
      const res = await fetchSettings();
      if (res.success && res.data) {
        setSettings(res.data);
        return null;
      }
      return res.error || 'Ayarlar yüklenemedi.';
    }
    return null;
  }, [loadOverview, logLevels, logQuery, logSource, perfRange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const err = await loadTabData(activeTab);
      if (!cancelled) {
        if (err) setNotice({ type: 'error', text: err });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, loadTabData]);

  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.key === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  const pollMs = (dashboard?.poll_interval_sec || 20) * 1000;
  useEffect(() => {
    if (activeTab !== 'overview' && activeTab !== 'health' && activeTab !== 'services') return;
    const id = window.setInterval(() => {
      void loadTabData(activeTab);
    }, pollMs);
    return () => window.clearInterval(id);
  }, [activeTab, loadTabData, pollMs]);

  useEffect(() => {
    if (!liveLogs || activeTab !== 'logs') return;
    const id = window.setInterval(async () => {
      const res = await fetchLogs({ source: logSource, q: logQuery, levels: logLevels, max_lines: 250 });
      if (res.success && res.data) setLogLines(res.data.lines || []);
    }, 2500);
    return () => window.clearInterval(id);
  }, [activeTab, liveLogs, logLevels, logQuery, logSource]);

  useEffect(() => {
    if (!activeRun || ['completed', 'failed'].includes(activeRun.status)) return;
    const id = window.setInterval(async () => {
      const res = await fetchJobRun(activeRun.id);
      if (res.success && res.data?.run) {
        setActiveRun(res.data.run);
        if (['completed', 'failed'].includes(res.data.run.status)) void loadTabData('jobs');
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [activeRun, loadTabData]);

  const handleServiceAction = async (code: string, action: 'start' | 'stop' | 'restart') => {
    const confirmMap = { start: 'BASLAT', stop: 'DURDUR', restart: 'YENIDEN_BASLAT' } as const;
    const expected = confirmMap[action];
    const typed = window.prompt(`Onay için yazın: ${expected}`);
    if (typed !== expected) {
      setNotice({ type: 'error', text: 'Onay iptal edildi veya hatalı.' });
      return;
    }
    setBusy(`svc-${code}-${action}`);
    const res = await controlService(code, action, expected);
    setBusy(null);
    if (res.success) {
      setNotice({ type: 'success', text: `${code} → ${action} tamamlandı` });
      void loadTabData('services');
    } else {
      setNotice({ type: 'error', text: res.error || 'İşlem başarısız' });
    }
  };

  const handleRunJob = async (code: string) => {
    if (!window.confirm(`Görevi şimdi çalıştır: ${code}?`)) return;
    setBusy(`job-${code}`);
    const res = await runJob(code);
    setBusy(null);
    if (res.success && res.data?.run) {
      setActiveRun(res.data.run);
      setNotice({ type: 'success', text: 'Görev başlatıldı' });
      void loadTabData('jobs');
    } else {
      setNotice({ type: 'error', text: res.error || 'Görev başlatılamadı' });
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setBusy('settings');
    const res = await updateSettings(settings);
    setBusy(null);
    if (res.success && res.data?.settings) {
      setSettings(res.data.settings);
      setNotice({ type: 'success', text: 'Ayarlar kaydedildi' });
    } else {
      setNotice({ type: 'error', text: res.error || 'Ayarlar kaydedilemedi' });
    }
  };

  const spark = useMemo(() => {
    const pts = perf?.points || [];
    const take = pts.slice(-40);
    const series = (key: string) => take.map((p) => Number(p[key] || 0));
    return {
      cpu: series('cpu'),
      ram: series('ram'),
      disk: series('disk'),
      pg: series('pg'),
    };
  }, [perf]);

  return (
    <div className="sistem-page">
      <div className="hero-header sistem-hero">
        <div className="hero-content">
          <div className="hero-icon">SY</div>
          <div>
            <div className="hero-breadcrumb">Yönetim / Sistem Yönetimi</div>
            <h1>Sistem Yönetimi</h1>
            <p>İzleme, tanılama ve yönetim merkezi</p>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="sistem-notice sistem-notice--error">
          <div>
            <strong>{alerts.length} aktif uyarı</strong>
            <div>{alerts.slice(0, 3).map((a) => a.title).join(' · ')}</div>
          </div>
          <button className="sistem-btn" type="button" onClick={() => switchTab('health')}>Sağlığa git</button>
        </div>
      )}

      {notice && (
        <div className={cls('sistem-notice', `sistem-notice--${notice.type === 'error' ? 'error' : notice.type === 'success' ? 'success' : 'info'}`)}>
          <span>{notice.text}</span>
          <button className="sistem-btn" type="button" onClick={() => setNotice(null)}>Kapat</button>
        </div>
      )}

      <nav className="sistem-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cls('sistem-tab', activeTab === tab.key && 'is-active')}
            onClick={() => switchTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="sistem-card sistem-empty">Yükleniyor...</div>
      ) : (
        <>
          {activeTab === 'overview' && dashboard && (
            <section className="sistem-stack">
              <div className="sistem-grid sistem-grid--metrics">
                <Metric label="Sunucu" value={STATUS_LABELS[dashboard.server.status] || dashboard.server.status} tone={statusTone(dashboard.server.status)} />
                <Metric label="Uygulama" value={STATUS_LABELS[dashboard.application.status] || dashboard.application.status} detail={dashboard.application.message} tone={statusTone(dashboard.application.status)} />
                <Metric label="Son yedek" value={dashboard.last_backup?.filename || '-'} detail={formatDate(dashboard.last_backup?.started_at)} />
                <Metric label="Son hata" value={dashboard.last_error?.error_type || '-'} detail={dashboard.last_error?.message || 'Yok'} tone={dashboard.last_error ? 'danger' : 'muted'} />
                <Metric label="CPU" value={`${Number(dashboard.cpu_percent || 0).toFixed(1)}%`} />
                <Metric label="RAM" value={`${Number(dashboard.ram_percent || 0).toFixed(1)}%`} />
                <Metric label="Disk" value={`${Number(dashboard.disk_percent || 0).toFixed(1)}%`} tone={Number(dashboard.disk_percent || 0) >= 90 ? 'danger' : Number(dashboard.disk_percent || 0) >= 85 ? 'warning' : 'default'} />
                <Metric label="PostgreSQL" value={STATUS_LABELS[String(dashboard.postgres.status)] || String(dashboard.postgres.status)} detail={`${dashboard.postgres.connections || 0} bağlantı`} tone={statusTone(String(dashboard.postgres.status))} />
                <Metric label="Nginx" value={STATUS_LABELS[String(dashboard.nginx?.status || 'unknown')] || '-'} tone={statusTone(String(dashboard.nginx?.status))} />
                <Metric label="Gunicorn" value={STATUS_LABELS[String(dashboard.gunicorn?.status || 'unknown')] || '-'} tone={statusTone(String(dashboard.gunicorn?.status))} />
                <Metric label="Aktif oturum" value={String(dashboard.active_users)} />
                <Metric label="Çalışan görev" value={String(dashboard.running_jobs)} />
              </div>
              <Panel title="Sağlık özeti" description={`Son yenileme: ${formatDate(dashboard.collected_at)}`}>
                <div className="sistem-table-wrap">
                  <table className="sistem-table">
                    <thead><tr><th>Servis</th><th>Durum</th><th>Mesaj</th></tr></thead>
                    <tbody>
                      {(dashboard.health_preview || []).map((h) => (
                        <tr key={h.code}>
                          <td>{h.label}</td>
                          <td><Badge status={h.status} /></td>
                          <td>{h.message || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </section>
          )}

          {activeTab === 'health' && (
            <Panel title="Sistem sağlığı" description="Son kontrol zamanı satırda">
              <div className="sistem-table-wrap">
                <table className="sistem-table">
                  <thead><tr><th>Bileşen</th><th>Durum</th><th>Mesaj</th><th>Kontrol</th></tr></thead>
                  <tbody>
                    {health.map((h) => (
                      <tr key={h.code}>
                        <td><strong>{h.label}</strong><div><small>{h.category}</small></div></td>
                        <td><Badge status={h.status} /></td>
                        <td>{h.message || '-'}</td>
                        <td>{formatDate(h.checked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {activeTab === 'services' && (
            <Panel title="Servisler" description={opsEnabled ? 'Kritik işlemler onay ister' : 'Ops bu ortamda kapalı (Docker/dev)'}>
              <div className="sistem-table-wrap">
                <table className="sistem-table">
                  <thead>
                    <tr>
                      <th>Ad</th><th>Durum</th><th>Uptime</th><th>Bellek</th><th>PID</th><th>Son restart</th><th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.code}>
                        <td><strong>{s.label}</strong><div><small>{s.unit}</small></div></td>
                        <td><Badge status={s.status} /></td>
                        <td>{formatUptime(s.uptime_sec)}</td>
                        <td>{s.memory_bytes ? formatBytes(s.memory_bytes) : '-'}</td>
                        <td>{s.pid || '-'}</td>
                        <td>{s.active_enter_timestamp || '-'}</td>
                        <td>
                          <div className="sistem-toolbar">
                            <button className="sistem-btn" disabled={!opsEnabled || busy !== null} onClick={() => handleServiceAction(s.code, 'restart')}>Yeniden Başlat</button>
                            <button className="sistem-btn" disabled={!opsEnabled || busy !== null} onClick={() => handleServiceAction(s.code, 'stop')}>Durdur</button>
                            <button className="sistem-btn sistem-btn--primary" disabled={!opsEnabled || busy !== null} onClick={() => handleServiceAction(s.code, 'start')}>Başlat</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {activeTab === 'logs' && (
            <Panel title="Log Merkezi" description="Dosyalar belleğe tam yüklenmez; kuyruk okuma">
              <div className="sistem-toolbar">
                <select value={logSource} onChange={(e) => setLogSource(e.target.value)}>
                  {logSources.map((s) => (
                    <option key={s.code} value={s.code}>{s.label}{s.exists ? '' : ' (yok)'}</option>
                  ))}
                </select>
                <input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="Ara..." />
                <select value={logLevels} onChange={(e) => setLogLevels(e.target.value)}>
                  <option value="">Tüm seviyeler</option>
                  <option value="DEBUG">DEBUG</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARNING</option>
                  <option value="ERROR">ERROR</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <button className="sistem-btn" type="button" onClick={() => void loadTabData('logs')}>Yenile</button>
                <button className={cls('sistem-btn', liveLogs && 'sistem-btn--primary')} type="button" onClick={() => setLiveLogs((v) => !v)}>
                  {liveLogs ? 'Canlı: Açık' : 'Canlı izle'}
                </button>
                <button
                  className="sistem-btn"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(logLines.map((l) => l.text).join('\n'));
                    setNotice({ type: 'info', text: 'Log panoya kopyalandı' });
                  }}
                >
                  Kopyala
                </button>
                <a className="sistem-btn" href={`/api/sistem-yonetimi/api/logs/download/?source=${encodeURIComponent(logSource)}`}>İndir</a>
              </div>
              <div className="sistem-log">
                {logLines.length === 0 ? <div>Kayıt yok</div> : logLines.map((line, idx) => (
                  <div key={`${line.offset}-${idx}`} className="sistem-log-entry">
                    <div
                      className={cls(
                        'sistem-log-line',
                        (line.level === 'ERROR' || line.level === 'CRITICAL') && 'is-error',
                        line.level === 'WARNING' && 'is-warn',
                        line.level === 'DEBUG' && 'is-debug',
                      )}
                    >
                      {line.text}
                    </div>
                    {line.explanation && (
                      <div className="sistem-log-explain">
                        <strong>{line.explanation.title}</strong>
                        <span>{line.explanation.text}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {activeTab === 'errors' && (
            <div className="sistem-grid sistem-grid--two">
              <Panel title="Hatalar" description={`${errorTotal} grup`}>
                <div className="sistem-table-wrap">
                  <table className="sistem-table">
                    <thead>
                      <tr><th>Tarih</th><th>Modül</th><th>Tür</th><th>Mesaj</th><th>Tekrar</th><th>Durum</th></tr>
                    </thead>
                    <tbody>
                      {errors.map((e) => (
                        <tr key={e.id} style={{ cursor: 'pointer' }} onClick={async () => {
                          const res = await fetchErrorDetail(e.id);
                          if (res.success && res.data) setSelectedError(res.data);
                        }}
                        >
                          <td>{formatDate(e.last_seen_at)}</td>
                          <td>{e.module || '-'}</td>
                          <td>{e.error_type}</td>
                          <td>{e.message.slice(0, 120)}</td>
                          <td>{e.occurrence_count}</td>
                          <td><Badge status={e.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Detay" description="Stack trace ve istek bilgisi">
                {!selectedError ? <div className="sistem-empty">Bir hata seçin</div> : (
                  <div className="sistem-stack">
                    <Badge status={selectedError.status} />
                    <div className="sistem-kv"><span>Tür</span><strong>{selectedError.error_type}</strong></div>
                    <div className="sistem-kv"><span>URL</span><strong>{selectedError.request_url || '-'}</strong></div>
                    <div className="sistem-kv"><span>Method</span><strong>{selectedError.http_method || '-'}</strong></div>
                    <div className="sistem-kv"><span>IP</span><strong>{selectedError.ip_address || '-'}</strong></div>
                    <div className="sistem-kv"><span>Kullanıcı</span><strong>{selectedError.user_id || '-'}</strong></div>
                    <pre className="sistem-log" style={{ maxHeight: 280 }}>{selectedError.stack_trace || selectedError.message}</pre>
                    <div className="sistem-toolbar">
                      <button className="sistem-btn" type="button" onClick={async () => {
                        await patchError(selectedError.id, { status: 'resolved' });
                        setSelectedError({ ...selectedError, status: 'resolved' });
                        void loadTabData('errors');
                      }}
                      >Çözüldü
                      </button>
                      <button className="sistem-btn" type="button" onClick={async () => {
                        await patchError(selectedError.id, { status: 'ignored' });
                        setSelectedError({ ...selectedError, status: 'ignored' });
                        void loadTabData('errors');
                      }}
                      >Yok say
                      </button>
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="sistem-grid sistem-grid--two">
              <Panel title="Arka plan görevleri" description="Cron + manuel çalıştırma">
                <div className="sistem-table-wrap">
                  <table className="sistem-table">
                    <thead><tr><th>Görev</th><th>Cron</th><th>Son çalışma</th><th>Sonuç</th><th></th></tr></thead>
                    <tbody>
                      {jobs.map((j) => (
                        <tr key={j.code}>
                          <td><strong>{j.label}</strong><div><small>{j.command}</small></div></td>
                          <td><code>{j.cron_hint || '-'}</code></td>
                          <td>{formatDate(j.last_run?.finished_at || j.last_run?.started_at)}</td>
                          <td>{j.last_run ? <Badge status={j.last_run.status} /> : '-'}</td>
                          <td>
                            <button className="sistem-btn sistem-btn--primary" disabled={busy !== null} onClick={() => handleRunJob(j.code)}>
                              Çalıştır
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Aktif / son iş" description="Çıktı">
                {!activeRun ? <div className="sistem-empty">Henüz manuel çalıştırma yok</div> : (
                  <div className="sistem-stack">
                    <Badge status={activeRun.status} />
                    <div className="sistem-kv"><span>Süre</span><strong>{activeRun.duration_ms != null ? `${activeRun.duration_ms} ms` : '-'}</strong></div>
                    <div>{activeRun.result_message}</div>
                    <pre className="sistem-log">{activeRun.output || '—'}</pre>
                  </div>
                )}
              </Panel>
            </div>
          )}

          {activeTab === 'audit' && (
            <Panel title="Audit Log" description="Kullanıcı ve sistem işlemleri">
              <div className="sistem-table-wrap">
                <table className="sistem-table">
                  <thead><tr><th>Tarih</th><th>Kullanıcı</th><th>Modül</th><th>İşlem</th><th>Açıklama</th><th>IP</th></tr></thead>
                  <tbody>
                    {audit.map((a) => (
                      <tr key={a.id}>
                        <td>{formatDate(a.created_at)}</td>
                        <td>{a.user_id || '-'}</td>
                        <td>{a.module}</td>
                        <td>{a.action}</td>
                        <td>{a.description}</td>
                        <td>{a.ip_address || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {activeTab === 'performance' && (
            <Panel title="Performans" description="Canlı + geçmiş örnekler">
              <div className="sistem-toolbar">
                {['1h', '24h', '7d', '30d'].map((r) => (
                  <button key={r} className={cls('sistem-btn', perfRange === r && 'sistem-btn--primary')} type="button" onClick={() => setPerfRange(r)}>{r}</button>
                ))}
                <button className="sistem-btn" type="button" onClick={() => void loadTabData('performance')}>Yenile</button>
              </div>
              <div className="sistem-chart">
                <Spark title="CPU %" values={spark.cpu} />
                <Spark title="RAM %" values={spark.ram} />
                <Spark title="Disk %" values={spark.disk} />
                <Spark title="PG bağlantı" values={spark.pg} />
              </div>
              {perf?.live && (
                <div className="sistem-grid sistem-grid--metrics" style={{ marginTop: 16 }}>
                  <Metric label="Canlı CPU" value={`${Number(perf.live.cpu_percent || 0).toFixed(1)}%`} />
                  <Metric label="Canlı RAM" value={`${Number(perf.live.ram_percent || 0).toFixed(1)}%`} />
                  <Metric label="Canlı Disk" value={`${Number(perf.live.disk_percent || 0).toFixed(1)}%`} />
                </div>
              )}
            </Panel>
          )}

          {activeTab === 'storage' && storage && (
            <div className="sistem-grid sistem-grid--two">
              <Panel title="Disk" description="Kök dosya sistemi">
                <div className="sistem-stack">
                  <div className="sistem-kv"><span>Toplam</span><strong>{formatBytes(Number(storage.disk.total_bytes || 0))}</strong></div>
                  <div className="sistem-kv"><span>Kullanılan</span><strong>{formatBytes(Number(storage.disk.used_bytes || 0))}</strong></div>
                  <div className="sistem-kv"><span>Boş</span><strong>{formatBytes(Number(storage.disk.free_bytes || 0))}</strong></div>
                  <div className="sistem-progress"><span style={{ width: `${Math.min(100, Number(storage.disk.percent || 0))}%` }} /></div>
                </div>
              </Panel>
              <Panel title="Klasörler" description="Uygulama dizinleri">
                <div className="sistem-table-wrap">
                  <table className="sistem-table">
                    <thead><tr><th>Anahtar</th><th>Yol</th><th>Boyut</th><th>Dosya</th></tr></thead>
                    <tbody>
                      {storage.folders.map((f) => (
                        <tr key={f.key}>
                          <td>{f.key}</td>
                          <td><small>{f.path}</small></td>
                          <td>{formatBytes(f.size_bytes)}</td>
                          <td>{f.file_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="En büyük klasörler" description="Örnekleme limitli">
                <div className="sistem-table-wrap">
                  <table className="sistem-table">
                    <thead><tr><th>Ad</th><th>Boyut</th></tr></thead>
                    <tbody>
                      {(storage.largest || []).map((f) => (
                        <tr key={f.path}><td>{f.name}<div><small>{f.path}</small></div></td><td>{formatBytes(f.size_bytes)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'timeline' && (
            <Panel title="Günlükler" description="Kronolojik sistem olayları">
              <div className="sistem-timeline">
                {timeline.length === 0 ? <div className="sistem-empty">Henüz olay yok</div> : timeline.map((t) => (
                  <div key={t.id} className="sistem-timeline-item">
                    <time>{formatDate(t.created_at)}</time>
                    <div>
                      <Badge status={t.level === 'error' ? 'down' : t.level === 'success' ? 'up' : t.level === 'warning' ? 'warn' : 'unknown'} />
                      {' '}<strong>{t.title}</strong>
                      {t.detail && <div><small>{t.detail}</small></div>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {activeTab === 'settings' && settings && (
            <Panel title="Ayarlar" description="Eşikler ve ops">
              <div className="sistem-toolbar">
                <label>Poll (sn)<input type="number" value={settings.poll_interval_sec} onChange={(e) => setSettings({ ...settings, poll_interval_sec: Number(e.target.value) })} /></label>
                <label>Disk uyarı %<input type="number" value={settings.disk_warn_percent} onChange={(e) => setSettings({ ...settings, disk_warn_percent: Number(e.target.value) })} /></label>
                <label>Disk kritik %<input type="number" value={settings.disk_critical_percent} onChange={(e) => setSettings({ ...settings, disk_critical_percent: Number(e.target.value) })} /></label>
                <label>Hata/dk<input type="number" value={settings.error_rate_warn_per_min} onChange={(e) => setSettings({ ...settings, error_rate_warn_per_min: Number(e.target.value) })} /></label>
                <label>
                  <input type="checkbox" checked={settings.ops_enabled} onChange={(e) => setSettings({ ...settings, ops_enabled: e.target.checked })} />
                  Ops açık
                </label>
                <button className="sistem-btn sistem-btn--primary" type="button" disabled={busy === 'settings'} onClick={handleSaveSettings}>Kaydet</button>
              </div>
              <div className="sistem-stack">
                <div className="sistem-kv"><span>Docker modu</span><strong>{settings.docker_mode ? 'Evet' : 'Hayır'}</strong></div>
                <div className="sistem-kv"><span>Helper</span><strong>{settings.helper_path}</strong></div>
                {Object.entries(settings.paths || {}).map(([k, v]) => (
                  <div className="sistem-kv" key={k}><span>{k}</span><strong>{v}</strong></div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail, tone = 'default' }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <article className={cls('sistem-metric', tone !== 'default' && `sistem-metric--${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="sistem-card">
      <div className="sistem-card-header">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="sistem-card-body">{children}</div>
    </section>
  );
}

function Badge({ status }: { status: string }) {
  return <span className={cls('sistem-badge', `sistem-badge--${statusTone(status)}`)}>{STATUS_LABELS[status] || status}</span>;
}

function Spark({ title, values }: { title: string; values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="sistem-chart-box">
      <strong>{title}</strong>
      <div className="sistem-spark">
        {values.length === 0 ? <small>Veri yok — cron ile collect_system_metrics çalıştırın</small> : values.map((v, i) => (
          <i key={i} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} title={String(v)} />
        ))}
      </div>
    </div>
  );
}
