'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  BookMarked,
  DownloadCloud,
  KeyRound,
  KeySquare,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Smartphone,
  Star,
  Sun,
  Timer,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { studentPortalApi, type CampusLifeResponse } from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export default function StudentProfileAndSettingsPage() {
  const { logout } = useAuth();
  const {
    identity,
    themePref,
    setThemePref,
    setDefaultFocusMinutes,
    setFocusPresets,
    applyUpdatedIdentity,
  } = useStudentPortal();

  const [campus, setCampus] = useState<CampusLifeResponse | null>(null);
  const [customMinutesInput, setCustomMinutesInput] = useState('');
  const [presetError, setPresetError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    studentPortalApi
      .campus()
      .then(setCampus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!identity) return null;

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    setPwSaving(true);
    try {
      const updated = await studentPortalApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });
      applyUpdatedIdentity(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMessage({ ok: true, text: 'Şifren başarıyla güncellendi.' });
    } catch (err) {
      setPwMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Şifre güncellenemedi.',
      });
    } finally {
      setPwSaving(false);
    }
  };

  const presets = identity.preferences.focus_presets?.length
    ? identity.preferences.focus_presets
    : [25, 40, 50];

  const handleAddPreset = async (e: FormEvent) => {
    e.preventDefault();
    setPresetError(null);
    const val = Number(customMinutesInput.trim());
    if (!Number.isInteger(val) || val < 5 || val > 180) {
      setPresetError('Lütfen 5 ile 180 dakika arasında bir tam sayı girin.');
      return;
    }
    if (presets.includes(val)) {
      await setDefaultFocusMinutes(val);
      setCustomMinutesInput('');
      return;
    }
    if (presets.length >= 8) {
      setPresetError('En fazla 8 hazır odak süresi kaydedebilirsin. Önce birini silebilirsin.');
      return;
    }
    await setFocusPresets([...presets, val], val);
    setCustomMinutesInput('');
  };

  const handleRemovePreset = async (mins: number) => {
    setPresetError(null);
    if (presets.length <= 1) {
      setPresetError('En az bir odak süresi kalmalıdır.');
      return;
    }
    const next = presets.filter((m) => m !== mins);
    const nextDefault =
      identity.preferences.focus_minutes === mins ? next[0] : identity.preferences.focus_minutes;
    await setFocusPresets(next, nextDefault);
  };

  return (
    <div className="sp-bento-grid">
      {/* Dijital Öğrenci Kampüs Kartı */}
      <section className="sp-card sp-col-6">
        <div className="sp-card-header">
          <div>
            <span className="sp-eyebrow">Dijital Kimlik</span>
            <h2>Öğrenci Kampüs Kartım</h2>
          </div>
          <button
            type="button"
            className="sp-btn sp-btn-secondary sp-btn-sm"
            onClick={() => logout()}
          >
            <LogOut size={14} /> Çıkış Yap
          </button>
        </div>

        <div className="sp-stack">
          <div className="sp-row-card">
            <div className="sp-row-copy">
              <strong>{identity.student.full_name}</strong>
              <span>
                Kullanıcı adı: {identity.username} · Öğrenci No:{' '}
                {identity.student.okul_no || identity.student.id}
              </span>
            </div>
          </div>

          <div className="sp-kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="sp-kpi-box">
              <span>Kurum & Şube</span>
              <strong style={{ fontSize: 15 }}>{identity.institution.sube_name}</strong>
              <small>{identity.institution.kurum_name}</small>
            </div>
            <div className="sp-kpi-box">
              <span>Sınıf & Alan</span>
              <strong style={{ fontSize: 15 }}>
                {identity.student.sinif?.name ||
                  identity.student.sinif_seviyesi?.name ||
                  '—'}
              </strong>
              <small>{identity.student.alan?.name || identity.institution.egitim_yili_name}</small>
            </div>
            <div className="sp-kpi-box">
              <span>
                <BookMarked size={12} style={{ verticalAlign: -1 }} /> Etüt Masam
              </span>
              <strong style={{ fontSize: 15 }}>
                {campus?.seat ? campus.seat.label : 'Atanmadı'}
              </strong>
              <small>Kütüphane / Etüt Salonu</small>
            </div>
            <div className="sp-kpi-box">
              <span>
                <KeySquare size={12} style={{ verticalAlign: -1 }} /> Öğrenci Dolabım
              </span>
              <strong style={{ fontSize: 15 }}>
                {campus?.locker ? campus.locker.label : 'Atanmadı'}
              </strong>
              <small>Kampüs Dolap Ataması</small>
            </div>
          </div>

          {identity.coach ? (
            <div className="sp-row-card">
              <div className="sp-row-copy">
                <strong>Birincil Akademik Koçun</strong>
                <span>{identity.coach.full_name}</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Görünüm, Odak Sayacı & PWA Ana Ekrana Ekle */}
      <section className="sp-card sp-col-6">
        <div className="sp-card-header">
          <div>
            <span className="sp-eyebrow">Kişiselleştirme</span>
            <h2>Görünüm, Pomodoro & Mobil Uygulama</h2>
          </div>
        </div>

        <div className="sp-stack" style={{ gap: 16 }}>
          <div className="sp-field">
            <span>Tema Görünümü</span>
            <div className="sp-pill-bar">
              <button
                type="button"
                className="sp-pill"
                data-active={themePref === 'light' ? '1' : '0'}
                onClick={() => setThemePref('light')}
              >
                <Sun size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Açık
              </button>
              <button
                type="button"
                className="sp-pill"
                data-active={themePref === 'dark' ? '1' : '0'}
                onClick={() => setThemePref('dark')}
              >
                <Moon size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Koyu
              </button>
              <button
                type="button"
                className="sp-pill"
                data-active={themePref === 'system' ? '1' : '0'}
                onClick={() => setThemePref('system')}
              >
                <Monitor size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Sistem
              </button>
            </div>
          </div>

          <div className="sp-field">
            <span>
              <Timer size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Odak Sürelerim & Varsayılan Pomodoro (5–180 dk)
            </span>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--sp-muted)' }}>
              Koçunun özel bir süre girmediği görevlerde ve hızlı odak başlatmada{' '}
              <strong>★ işaretli varsayılan süren ({identity.preferences.focus_minutes} dk)</strong>{' '}
              kullanılır. Kendi çalışma ritmine göre yeni süreler ekleyebilirsin.
            </p>
            <div className="sp-pill-bar">
              {presets.map((mins) => {
                const isDefault = identity.preferences.focus_minutes === mins;
                return (
                  <div
                    key={mins}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: 999,
                      border: isDefault
                        ? '1px solid var(--sp-accent)'
                        : '1px solid var(--sp-border-strong)',
                      background: isDefault ? 'var(--sp-accent)' : 'var(--sp-surface)',
                      color: isDefault ? '#fff' : 'var(--sp-ink-2)',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setDefaultFocusMinutes(mins)}
                      title="Varsayılan odak süresi yap"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '7px 11px 7px 13px',
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isDefault ? <Star size={12} fill="currentColor" /> : null}
                      <span>{mins} dk</span>
                    </button>
                    {presets.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => handleRemovePreset(mins)}
                        title={`${mins} dk süresini sil`}
                        style={{
                          display: 'inline-grid',
                          placeItems: 'center',
                          padding: '7px 10px 7px 4px',
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          opacity: 0.78,
                          cursor: 'pointer',
                        }}
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={handleAddPreset}
              style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}
            >
              <input
                type="number"
                min={5}
                max={180}
                value={customMinutesInput}
                onChange={(e) => setCustomMinutesInput(e.target.value)}
                placeholder="Örn: 40 veya 75 dk"
                style={{ maxWidth: 180 }}
              />
              <button type="submit" className="sp-btn sp-btn-secondary sp-btn-sm">
                <Plus size={14} />
                <span>Süre Oluştur & Varsayılan Yap</span>
              </button>
            </form>
            {presetError ? (
              <span style={{ fontSize: 12, color: 'var(--sp-danger)' }}>{presetError}</span>
            ) : null}
          </div>

          <div className="sp-row-card" style={{ display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Smartphone size={17} color="var(--sp-accent)" />
              <strong>Telefon / Tablete Uygulama Olarak Ekle (PWA)</strong>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--sp-muted)' }}>
              iPhone/iPad Safari&apos;de <strong>Paylaş → Ana Ekrana Ekle</strong>, Android
              Chrome&apos;da <strong>Menü → Uygulamayı Yükle</strong> adımını seçerek tarayıcı
              çubuğu olmadan tam ekran kullanabilirsin.
            </p>
            {installPrompt ? (
              <button
                type="button"
                className="sp-btn sp-btn-primary sp-btn-sm"
                onClick={() => installPrompt.prompt()}
              >
                <DownloadCloud size={14} /> Ana Ekrana Yükle
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Şifre Değiştirme */}
      <section className="sp-card sp-col-12">
        <div className="sp-card-header">
          <div>
            <span className="sp-eyebrow">Hesap Güvenliği</span>
            <h2>Şifre Değiştir</h2>
          </div>
        </div>

        <form
          onSubmit={handlePasswordChange}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label className="sp-field">
            <span>Mevcut Şifre</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="sp-field">
            <span>Yeni Şifre (En az 8 karakter)</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label className="sp-field">
            <span>Yeni Şifre (Tekrar)</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="sp-btn sp-btn-primary"
            disabled={pwSaving}
          >
            <KeyRound size={16} />
            <span>{pwSaving ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}</span>
          </button>
        </form>

        {pwMessage ? (
          <div
            style={{ marginTop: 12 }}
            className={pwMessage.ok ? 'sp-chip sp-chip-emerald' : 'sp-inline-error'}
          >
            {pwMessage.text}
          </div>
        ) : null}
      </section>
    </div>
  );
}
