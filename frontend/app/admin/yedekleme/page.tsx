'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  fetchArtifacts,
  fetchDashboard,
  fetchOperationLogs,
  fetchSchedule,
  formatBytes,
  restoreBackup,
  updateSchedule,
  uploadBackup,
  validateBackup,
  type BackupArtifact,
  type DashboardData,
  type ScheduleData,
} from '@/lib/yedekleme-api';

type Tab = 'dashboard' | 'history' | 'schedule' | 'restore' | 'logs';

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manuel',
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Tamamlandı',
  running: 'Çalışıyor',
  failed: 'Başarısız',
  pending: 'Bekliyor',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Yedek Oluştur',
  download: 'İndir',
  validate: 'Doğrula',
  restore: 'Geri Yükle',
  delete: 'Sil',
  schedule_update: 'Zamanlama Güncelle',
  purge: 'Temizlik',
  import: 'İçe Aktar',
};

const STATUS_COLORS: Record<string, string> = {
  completed: '#059669',
  running: '#d97706',
  failed: '#dc2626',
  pending: '#6b7280',
};

export default function YedeklemePage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [artifacts, setArtifacts] = useState<BackupArtifact[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, artRes, schRes, logRes] = await Promise.all([
        fetchDashboard(),
        fetchArtifacts(),
        fetchSchedule(),
        fetchOperationLogs(),
      ]);
      if (dashRes.success && dashRes.data) setDashboard(dashRes.data);
      else setError(dashRes.error || 'Dashboard yüklenemedi');
      if (artRes.success && artRes.data) setArtifacts(artRes.data.results);
      else if (!artRes.success) setError(artRes.error || 'Yedek listesi yüklenemedi');
      if (schRes.success && schRes.data) setSchedule(schRes.data);
      else if (!schRes.success) setError(schRes.error || 'Zamanlama yüklenemedi');
      if (logRes.success && logRes.data) setLogs(logRes.data.results);
    } catch {
      setError('Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    setMessage(null);
  };

  const handleCreate = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await createBackup(includeLogs);
      if (res.success) {
        setMessage('Yedek başarıyla oluşturuldu.');
        await loadAll();
        switchTab('history');
      } else {
        setError(res.error || 'Yedek oluşturulamadı');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (artifact: BackupArtifact) => {
    setDownloadingId(artifact.id);
    setError(null);
    setMessage(null);
    try {
      await downloadBackup(artifact.id, artifact.filename);
      setMessage(`${artifact.filename} indirildi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İndirme başarısız');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSaveSchedule = async () => {
    if (!schedule) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const payload = {
      frequency: schedule.frequency,
      hour: schedule.hour,
      minute: schedule.minute,
      enabled: schedule.enabled,
      include_logs: schedule.include_logs,
    };
    const res = await updateSchedule(payload);
    setBusy(false);
    if (res.success) {
      setMessage('Zamanlama kaydedildi.');
      await loadAll();
    } else {
      setError(res.error || 'Kaydedilemedi');
    }
  };

  const handleValidate = async (id: number) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await validateBackup(id);
    setBusy(false);
    const valid = res.data && typeof res.data === 'object' && 'valid' in res.data && res.data.valid;
    if (res.success && valid) {
      setMessage('Yedek doğrulaması başarılı — manifest ve checksumlar geçerli.');
    } else {
      const err = res.data && typeof res.data === 'object' && 'error' in res.data
        ? String(res.data.error)
        : res.error;
      setError(err || 'Doğrulama başarısız');
    }
  };

  const handleRestore = async () => {
    if (!restoreId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await restoreBackup(restoreId, confirmText);
    setBusy(false);
    if (res.success) {
      setMessage('Geri yükleme tamamlandı.');
      setConfirmText('');
      setRestoreId(null);
      await loadAll();
    } else {
      setError(res.error || 'Geri yükleme başarısız');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Bu yedeği silmek istediğinize emin misiniz?')) return;
    setBusy(true);
    setError(null);
    const res = await deleteBackup(id);
    setBusy(false);
    if (res.success) {
      setMessage('Yedek silindi.');
      await loadAll();
    } else {
      setError(res.error || 'Silinemedi');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    const maxBytes = dashboard?.config.upload_max_bytes ?? 2 * 1024 ** 3;
    if (uploadFile.size > maxBytes) {
      setError(`Dosya çok büyük. Üst sınır: ${formatBytes(maxBytes)}`);
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await uploadBackup(uploadFile);
      if (res.success && res.data?.artifact) {
        setMessage(`Yedek yüklendi: ${res.data.artifact.filename}`);
        setUploadFile(null);
        await loadAll();
        switchTab('history');
      } else {
        setError(res.error || 'Yedek yüklenemedi');
      }
    } finally {
      setUploading(false);
    }
  };

  const completedArtifacts = artifacts.filter((a) => a.status === 'completed');

  return (
    <div style={{ padding: 0 }}>
      <div className="hero-header" style={{ marginBottom: 24 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Platform Yedekleme</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a><span>/</span><span>Yedekleme</span>
            </div>
          </div>
        </div>
        <button onClick={loadAll} disabled={loading || busy}
          style={{ padding: '10px 18px', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, cursor: 'pointer' }}>
          Yenile
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: 10, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '12px 16px', borderRadius: 10, marginBottom: 16 }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          ['dashboard', 'Özet'],
          ['history', 'Geçmiş'],
          ['schedule', 'Zamanlama'],
          ['restore', 'Geri Yükle'],
          ['logs', 'İşlem Logları'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => switchTab(key)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: tab === key ? '1.5px solid #6366f1' : '1.5px solid #e5e7eb',
              background: tab === key ? '#eef2ff' : '#fff', color: tab === key ? '#4338ca' : '#374151', fontWeight: 600, cursor: 'pointer',
            }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor…</div>
      ) : (
        <>
          {tab === 'dashboard' && (
            <div>
              {dashboard ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                    <KpiCard label="Toplam Yedek" value={String(dashboard.total_backups)} />
                    <KpiCard label="Toplam Boyut" value={formatBytes(dashboard.total_size_bytes)} />
                    <KpiCard label="Son Yedek" value={dashboard.latest_backup?.started_at
                      ? new Date(dashboard.latest_backup.started_at).toLocaleString('tr-TR') : '—'} />
                    <KpiCard label="Zamanlama" value={dashboard.schedule.enabled
                      ? TRIGGER_LABELS[dashboard.schedule.frequency] || dashboard.schedule.frequency : 'Kapalı'} />
                  </div>

                  {dashboard.latest_backup && dashboard.latest_backup.status === 'completed' && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#166534' }}>Son yedek: {dashboard.latest_backup.filename}</div>
                        <div style={{ fontSize: 13, color: '#15803d', marginTop: 4 }}>
                          {formatBytes(dashboard.latest_backup.size_bytes)} · {dashboard.latest_backup.duration_ms ? `${(dashboard.latest_backup.duration_ms / 1000).toFixed(1)} sn` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(dashboard.latest_backup!)}
                        disabled={downloadingId === dashboard.latest_backup!.id}
                        style={primaryBtn}
                      >
                        {downloadingId === dashboard.latest_backup!.id ? 'İndiriliyor…' : 'Son Yedeği İndir'}
                      </button>
                    </div>
                  )}

                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Manuel Yedek Oluştur</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 14 }}>
                      <input type="checkbox" checked={includeLogs} onChange={(e) => setIncludeLogs(e.target.checked)} />
                      Log dosyalarını dahil et
                    </label>
                    <button onClick={handleCreate} disabled={busy} style={primaryBtn}>
                      {busy ? 'Oluşturuluyor…' : 'Şimdi Yedek Al'}
                    </button>
                    <p style={{ marginTop: 12, fontSize: 13, color: '#6b7280' }}>
                      Tüm kurumların veritabanı ve medya dosyaları tek arşivde yedeklenir.
                    </p>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, fontSize: 13, color: '#6b7280' }}>
                    <strong style={{ color: '#374151' }}>Depolama:</strong> {dashboard.config.local_root}
                    {' · '}
                    <strong style={{ color: '#374151' }}>Sağlayıcı:</strong> {dashboard.config.remote_provider}
                  </div>
                </>
              ) : (
                <div style={{ padding: 24, color: '#6b7280' }}>Özet verisi yüklenemedi.</div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                    <th style={thStyle}>Dosya</th>
                    <th style={thStyle}>Durum</th>
                    <th style={thStyle}>Tetikleyici</th>
                    <th style={thStyle}>Boyut</th>
                    <th style={thStyle}>Tarih</th>
                    <th style={thStyle}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((a) => (
                    <tr key={a.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}>
                        <div>{a.filename}</div>
                        {a.components?.imported === true && (
                          <div style={{ fontSize: 11, color: '#4338ca', marginTop: 4 }}>Harici yükleme</div>
                        )}
                        {a.status === 'failed' && a.error_message && (
                          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }} title={a.error_message}>
                            {a.error_message.length > 80 ? `${a.error_message.slice(0, 80)}…` : a.error_message}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: STATUS_COLORS[a.status] || '#374151', fontWeight: 600 }}>
                        {STATUS_LABELS[a.status] || a.status}
                      </td>
                      <td style={tdStyle}>{TRIGGER_LABELS[a.trigger] || a.trigger}</td>
                      <td style={tdStyle}>{a.size_bytes ? formatBytes(a.size_bytes) : '—'}</td>
                      <td style={tdStyle}>{a.started_at ? new Date(a.started_at).toLocaleString('tr-TR') : '—'}</td>
                      <td style={tdStyle}>
                        {a.status === 'completed' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleDownload(a)}
                              disabled={downloadingId === a.id || busy}
                              style={actionBtn}
                            >
                              {downloadingId === a.id ? '…' : 'İndir'}
                            </button>
                            <button onClick={() => handleValidate(a.id)} disabled={busy} style={actionBtn}>Doğrula</button>
                            <button onClick={() => { setRestoreId(a.id); switchTab('restore'); }} disabled={busy} style={actionBtn}>Geri Yükle</button>
                            <button onClick={() => handleDelete(a.id)} disabled={busy} style={{ ...actionBtn, color: '#dc2626' }}>Sil</button>
                          </div>
                        )}
                        {a.status === 'failed' && (
                          <button onClick={() => handleDelete(a.id)} disabled={busy} style={{ ...actionBtn, color: '#dc2626' }}>Sil</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {artifacts.length === 0 && (
                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>Henüz yedek yok</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'schedule' && (
            schedule ? (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, maxWidth: 480 }}>
                <label style={labelStyle}>
                  <span style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={schedule.enabled} onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })} />
                    Otomatik yedekleme aktif
                  </span>
                </label>
                <label style={labelStyle}>
                  Sıklık
                  <select value={schedule.frequency} onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value })} style={inputStyle}>
                    <option value="daily">Günlük</option>
                    <option value="weekly">Haftalık</option>
                    <option value="monthly">Aylık</option>
                  </select>
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ ...labelStyle, flex: 1 }}>
                    Saat
                    <input type="number" min={0} max={23} value={schedule.hour}
                      onChange={(e) => setSchedule({ ...schedule, hour: Number(e.target.value) })}
                      style={inputStyle} />
                  </label>
                  <label style={{ ...labelStyle, flex: 1 }}>
                    Dakika
                    <input type="number" min={0} max={59} value={schedule.minute}
                      onChange={(e) => setSchedule({ ...schedule, minute: Number(e.target.value) })}
                      style={inputStyle} />
                  </label>
                </div>
                <label style={labelStyle}>
                  <span style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={schedule.include_logs} onChange={(e) => setSchedule({ ...schedule, include_logs: e.target.checked })} />
                    Logları dahil et
                  </span>
                </label>
                {schedule.last_run_at && (
                  <p style={{ fontSize: 13, color: '#6b7280' }}>Son çalışma: {new Date(schedule.last_run_at).toLocaleString('tr-TR')}</p>
                )}
                <button onClick={handleSaveSchedule} disabled={busy} style={{ ...primaryBtn, marginTop: 12 }}>
                  Kaydet
                </button>
                <p style={{ marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
                  Cron: <code>python manage.py run_scheduled_backups</code>
                </p>
              </div>
            ) : (
              <div style={{ padding: 24, color: '#6b7280' }}>Zamanlama ayarları yüklenemedi.</div>
            )
          )}

          {tab === 'restore' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                <h3 style={{ marginTop: 0, fontSize: 16 }}>Harici Yedek Yükle</h3>
                <p style={{ fontSize: 14, color: '#374151', marginTop: 0 }}>
                  Masaüstüne indirdiğiniz <code>.tar.gz</code> veya <code>.tar.gz.enc</code> dosyasını sisteme aktarın.
                  Yükleme sonrası listeden geri yükleyebilirsiniz.
                </p>
                <label style={labelStyle}>
                  Yedek dosyası
                  <input
                    type="file"
                    accept=".tar.gz,.gz,.enc,application/gzip,application/x-gzip"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    style={inputStyle}
                  />
                </label>
                {uploadFile && (
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0 }}>
                    {uploadFile.name} · {formatBytes(uploadFile.size)}
                    {dashboard?.config.upload_max_bytes && (
                      <> · Üst sınır: {formatBytes(dashboard.config.upload_max_bytes)}</>
                    )}
                  </p>
                )}
                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadFile}
                  style={{ ...primaryBtn, opacity: !uploadFile ? 0.5 : 1 }}
                >
                  {uploading ? 'Yükleniyor…' : 'Yedeği Sisteme Yükle'}
                </button>
              </div>

              <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: '#b91c1c', marginTop: 0 }}>Geri Yükleme</h3>
              <p style={{ fontSize: 14, color: '#374151' }}>
                Bu işlem mevcut veritabanını ve medya dosyalarını seçilen yedekle değiştirir. Geri alınamaz.
              </p>
              {completedArtifacts.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: 14 }}>Geri yüklenebilecek tamamlanmış yedek yok.</p>
              ) : (
                <>
                  <label style={labelStyle}>
                    Yedek seçin
                    <select value={restoreId ?? ''} onChange={(e) => setRestoreId(e.target.value ? Number(e.target.value) : null)} style={inputStyle}>
                      <option value="">— Seçin —</option>
                      {completedArtifacts.map((a) => (
                        <option key={a.id} value={a.id}>{a.filename} ({new Date(a.started_at || '').toLocaleString('tr-TR')})</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Onay için <strong>RESTORE</strong> yazın
                    <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} style={inputStyle} placeholder="RESTORE" autoComplete="off" />
                  </label>
                  <button onClick={handleRestore} disabled={busy || !restoreId || confirmText !== 'RESTORE'}
                    style={{ padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: (!restoreId || confirmText !== 'RESTORE') ? 0.5 : 1 }}>
                    {busy ? 'Geri yükleniyor…' : 'Geri Yükle'}
                  </button>
                </>
              )}
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                    <th style={thStyle}>Tarih</th>
                    <th style={thStyle}>İşlem</th>
                    <th style={thStyle}>Başarı</th>
                    <th style={thStyle}>Süre</th>
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>Hata</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={String(log.id)} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}>{log.created_at ? new Date(String(log.created_at)).toLocaleString('tr-TR') : '—'}</td>
                      <td style={tdStyle}>{ACTION_LABELS[String(log.action)] || String(log.action)}</td>
                      <td style={{ ...tdStyle, color: log.success ? '#059669' : '#dc2626' }}>{log.success ? 'Evet' : 'Hayır'}</td>
                      <td style={tdStyle}>{log.duration_ms ? `${log.duration_ms} ms` : '—'}</td>
                      <td style={tdStyle}>{String(log.ip_address || '—')}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#dc2626', maxWidth: 200 }}>
                        {log.error_message ? String(log.error_message) : '—'}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>Log kaydı yok</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginTop: 4 }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 14px', fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', color: '#374151' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontSize: 14, fontWeight: 500 };
const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 };
const actionBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { padding: '10px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
