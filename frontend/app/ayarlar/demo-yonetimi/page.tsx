'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchDemoStatus,
  purgeDemoData,
  resetOperationalData,
  seedDemoData,
  type DemoEnvironment,
  type DemoPreset,
  type DemoStatus,
} from '@/lib/demo-api';

type ActionCard = {
  id: DemoPreset | 'purge' | 'reset';
  title: string;
  description: string;
  preset?: DemoPreset;
  tone: 'blue' | 'green' | 'amber' | 'purple' | 'red';
};

const ACTIONS: ActionCard[] = [
  {
    id: 'full',
    title: 'Tam Demo Paketi',
    description: '250 öğrenci, personel, sınıf, sözleşme ve finans — kapsamlı test ortamı.',
    preset: 'full',
    tone: 'blue',
  },
  {
    id: 'dashboard',
    title: 'Dashboard Demo Verisi',
    description: '80 öğrenci + hafif finans — grafik ve dashboard ekranlarını doldurur.',
    preset: 'dashboard',
    tone: 'green',
  },
  {
    id: 'students',
    title: 'Rastgele Öğrenciler',
    description: '120 öğrenci, sınıf ve öğretmen — finans/sözleşme olmadan.',
    preset: 'students',
    tone: 'purple',
  },
  {
    id: 'finance',
    title: 'Rastgele Finans Verisi',
    description: 'Mevcut demo öğrencilere sözleşme, tahsilat, gelir/gider ekler.',
    preset: 'finance',
    tone: 'amber',
  },
];

const TONE: Record<ActionCard['tone'], { bg: string; border: string; btn: string }> = {
  blue: { bg: '#eff6ff', border: '#bfdbfe', btn: '#1d4ed8' },
  green: { bg: '#ecfdf5', border: '#a7f3d0', btn: '#059669' },
  amber: { bg: '#fffbeb', border: '#fde68a', btn: '#d97706' },
  purple: { bg: '#f5f3ff', border: '#ddd6fe', btn: '#7c3aed' },
  red: { bg: '#fef2f2', border: '#fecaca', btn: '#dc2626' },
};

function envBadgeStyle(env: DemoEnvironment | undefined) {
  if (!env) return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  if (env.is_production) return { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
  if (env.is_demo_environment) return { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' };
  return { bg: '#fffbeb', color: '#92400e', border: '#fde68a' };
}

function Modal({
  open,
  title,
  onClose,
  children,
  width = 520,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width, maxWidth: '94vw',
        maxHeight: '88vh', overflow: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" style={{
            border: 'none', background: '#f1f5f9', borderRadius: 8, width: 32, height: 32,
            cursor: 'pointer', fontSize: 18, color: '#64748b',
          }}>×</button>
        </div>
        <div style={{ padding: '18px 20px 20px' }}>{children}</div>
      </div>
    </div>
  );
}

export default function DemoYonetimiPage() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [purgeFirst, setPurgeFirst] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const env = status?.environment;
  const demoAllowed = env?.demo_allowed ?? false;
  const resetAllowed = env?.operational_reset_allowed ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchDemoStatus();
    if (res.success && res.data) setStatus(res.data);
    else setError(res.error || 'Durum yüklenemedi');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSeed = async (preset: DemoPreset) => {
    if (!demoAllowed) {
      setInfoOpen(true);
      setError('Demo oluşturma yalnızca DJANGO_ENV=demo ortamında çalışır.');
      return;
    }
    setBusy(preset);
    setError(null);
    setMessage(null);
    const res = await seedDemoData({ preset, purge_first: purgeFirst });
    setBusy(null);
    if (res.success && res.data) {
      setMessage(
        `${preset} demo oluşturuldu — ${res.data.students_active ?? 0} öğrenci, ${res.data.contracts ?? 0} sözleşme`,
      );
      await load();
    } else {
      setError(res.error || 'Demo oluşturulamadı');
    }
  };

  const runPurge = async () => {
    if (purgeConfirm !== 'PURGE-DEMO') {
      setError('Temizlemek için PURGE-DEMO yazın');
      return;
    }
    setBusy('purge');
    setError(null);
    const res = await purgeDemoData('PURGE-DEMO');
    setBusy(null);
    if (res.success) {
      setMessage('Demo veriler temizlendi');
      setPurgeConfirm('');
      setPurgeOpen(false);
      await load();
    } else {
      setError(res.error || 'Temizlenemedi');
    }
  };

  const runReset = async () => {
    if (resetConfirm !== 'SIFIRLA') {
      setError('Sıfırlamak için SIFIRLA yazın');
      return;
    }
    setBusy('reset');
    setError(null);
    const res = await resetOperationalData({ confirm: 'SIFIRLA' });
    setBusy(null);
    if (res.success) {
      const hint = res.data?.login_hint;
      setMessage(
        hint
          ? `${res.data?.message ?? 'Sıfırlandı'} — Kullanıcı: ${hint.username} / ${hint.password}`
          : (res.data?.message ?? 'Operasyonel veri sıfırlandı'),
      );
      setResetConfirm('');
      setResetOpen(false);
      await load();
    } else {
      setError(res.error || 'Sıfırlanamadı');
    }
  };

  const badge = envBadgeStyle(env);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 48px' }}>
      {/* Üst başlık + ortam rozeti */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Ayarlar</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#0f172a' }}>Demo Yönetimi</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {env && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
              background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
            }}>
              {env.label} · {env.db_name}
            </span>
          )}
          <button type="button" onClick={() => setInfoOpen(true)} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
            background: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer',
          }}>
            Ortam & Bilgi
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px 16px', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background: '#ecfdf5', color: '#047857', padding: '12px 16px', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Yükleniyor...</div>
      ) : status && (
        <>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
            {status.kurum.ad} · {status.sube.ad}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
            {[
              ['Öğrenci', status.students],
              ['Personel', status.personnel],
              ['Sınıf', status.classes],
              ['Sözleşme', status.contracts],
              ['Tahsilat', status.tahsilat],
              ['Gelir', status.gelir],
              ['Gider', status.gider],
            ].map(([label, val]) => (
              <div key={String(label)} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                padding: '12px 14px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{val}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', marginBottom: 16 }}>
        <input type="checkbox" checked={purgeFirst} onChange={(e) => setPurgeFirst(e.target.checked)} disabled={!demoAllowed} />
        Oluşturmadan önce mevcut demo verisini temizle
      </label>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#334155' }}>Demo Verilerini Oluştur</h2>
      {!demoAllowed && (
        <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 12px' }}>
          Demo oluşturma kapalı — <button type="button" onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', color: '#b45309', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 12 }}>ortam bilgisi</button>
        </p>
      )}
      <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
        {ACTIONS.map((action) => {
          const t = TONE[action.tone];
          return (
            <div key={action.id} style={{
              background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12,
              padding: '16px 18px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: 16, flexWrap: 'wrap',
              opacity: demoAllowed ? 1 : 0.55,
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{action.title}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{action.description}</div>
              </div>
              <button
                type="button"
                disabled={!!busy || !demoAllowed}
                onClick={() => action.preset && runSeed(action.preset)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', color: '#fff',
                  background: t.btn, fontSize: 13, fontWeight: 600, cursor: busy || !demoAllowed ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy === action.preset ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#334155' }}>Temizlik & Sıfırlama</h2>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div style={{ ...TONE.red, background: TONE.red.bg, border: `1px solid ${TONE.red.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#991b1b' }}>Demo Verilerini Temizle</div>
          <p style={{ fontSize: 12, color: '#7f1d1d', margin: '6px 0 12px' }}>
            Yalnızca DEMO etiketli kayıtları siler.
          </p>
          <button type="button" disabled={!!busy || !demoAllowed} onClick={() => { setPurgeConfirm(''); setPurgeOpen(true); }} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626',
            color: '#fff', fontWeight: 600, fontSize: 13, cursor: demoAllowed ? 'pointer' : 'not-allowed',
            opacity: demoAllowed ? 1 : 0.5,
          }}>
            Demo Temizle…
          </button>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Operasyonel Veriyi Sıfırla</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 12px' }}>
            Kurum + finans tanımları korunur; operasyonel veri silinir.
          </p>
          <button type="button" disabled={!!busy || !resetAllowed} onClick={() => { setResetConfirm(''); setResetOpen(true); }} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
            color: '#334155', fontWeight: 600, fontSize: 13, cursor: resetAllowed ? 'pointer' : 'not-allowed',
            opacity: resetAllowed ? 1 : 0.5,
          }}>
            Operasyonel Sıfırla…
          </button>
        </div>
      </div>

      {/* Ortam & bilgi modal */}
      <Modal open={infoOpen} title="Ortam & Bilgi" onClose={() => setInfoOpen(false)} width={560}>
        {env ? (
          <div style={{ fontSize: 13, lineHeight: 1.65, color: '#334155' }}>
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 16,
              background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color,
            }}>
              <strong>Şu anki ortam:</strong> {env.label} ({env.environment})<br />
              <strong>Veritabanı:</strong> <code>{env.db_name}</code> @ {env.db_host}
            </div>

            {env.warnings.map((w) => (
              <div key={w} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 10, color: '#92400e' }}>
                ⚠ {w}
              </div>
            ))}

            <h3 style={{ fontSize: 14, margin: '16px 0 8px', color: '#0f172a' }}>Ayrı veritabanı modeli</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Demo DB</strong> — <code>lms_demo_db</code> (<code>DJANGO_ENV=demo</code>)</li>
              <li><strong>Geliştirme DB</strong> — <code>lms_db</code> (şu an büyük ihtimalle bu)</li>
              <li><strong>Canlı</strong> — ayrı sunucu + <code>production</code>; demo verisi taşınmaz</li>
            </ul>

            <h3 style={{ fontSize: 14, margin: '16px 0 8px', color: '#0f172a' }}>İşlemler</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Demo oluştur/temizle</strong> — yalnızca <code>DJANGO_ENV=demo</code></li>
              <li><strong>Operasyonel sıfırla</strong> — geliştirme ve demo ortamında (canlıda kapalı); süper yönetici gerekir</li>
            </ul>

            <h3 style={{ fontSize: 14, margin: '16px 0 8px', color: '#0f172a' }}>Demo ortamına geçiş</h3>
            <pre style={{
              background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', borderRadius: 8,
              fontSize: 11, overflow: 'auto', margin: 0,
            }}>{`cd backend
DJANGO_ENV=demo python3 manage.py setup_demo_database --seed --create-admin
DJANGO_ENV=demo python3 manage.py runserver 0.0.0.0:8000`}</pre>

            <h3 style={{ fontSize: 14, margin: '16px 0 8px', color: '#0f172a' }}>Önerilen akış</h3>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Demo DB&apos;de geliştir ve test et</li>
              <li>Git ile kodu canlıya al</li>
              <li>Canlıda yalnızca <code>migrate</code> — veri taşıma yok</li>
            </ol>
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: 13 }}>Ortam bilgisi yüklenemedi.</p>
        )}
      </Modal>

      {/* Demo temizle modal */}
      <Modal open={purgeOpen} title="Demo Verilerini Temizle" onClose={() => setPurgeOpen(false)}>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.55, marginTop: 0 }}>
          Yalnızca DEMO etiketli öğrenci, sözleşme ve finans kayıtları silinir.
          Gerçek kayıtlara dokunulmaz.
        </p>
        <p style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', padding: '10px 12px', borderRadius: 8 }}>
          Onaylamak için <strong>PURGE-DEMO</strong> yazın.
        </p>
        <input
          value={purgeConfirm}
          onChange={(e) => setPurgeConfirm(e.target.value)}
          placeholder="PURGE-DEMO"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #fecaca', fontSize: 13, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={() => setPurgeOpen(false)} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
          }}>İptal</button>
          <button type="button" disabled={!!busy || purgeConfirm !== 'PURGE-DEMO'} onClick={runPurge} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626',
            color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: purgeConfirm === 'PURGE-DEMO' ? 1 : 0.5,
          }}>
            {busy === 'purge' ? 'Temizleniyor...' : 'Temizle'}
          </button>
        </div>
      </Modal>

      {/* Operasyonel sıfırla modal */}
      <Modal open={resetOpen} title="Operasyonel Veriyi Sıfırla" onClose={() => setResetOpen(false)}>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.55, marginTop: 0 }}>
          Kurum, şube ve finans tanımları korunur. Öğrenci, personel, sözleşme ve tüm operasyonel veri silinir.
        </p>
        {env && (
          <p style={{ fontSize: 12, color: '#475569', background: '#f8fafc', padding: '10px 12px', borderRadius: 8 }}>
            Hedef veritabanı: <code>{env.db_name}</code> ({env.label})
          </p>
        )}
        <p style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', padding: '10px 12px', borderRadius: 8 }}>
          Tüm kullanıcı hesapları silinir. Sıfırlama sonrası otomatik <strong>admin / admin123</strong> oluşturulur.
          Onay: <strong>SIFIRLA</strong>
        </p>
        <input
          value={resetConfirm}
          onChange={(e) => setResetConfirm(e.target.value)}
          placeholder="SIFIRLA"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={() => setResetOpen(false)} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
          }}>İptal</button>
          <button type="button" disabled={!!busy || resetConfirm !== 'SIFIRLA'} onClick={runReset} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', background: '#334155',
            color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: resetConfirm === 'SIFIRLA' ? 1 : 0.5,
          }}>
            {busy === 'reset' ? 'Sıfırlanıyor...' : 'Sıfırla'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
