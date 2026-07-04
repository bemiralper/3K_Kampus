'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createLibrary, type WorkingHour } from '@/lib/kutuphane-api';

const DAYS = [
  { key: 'pazartesi', label: 'Pazartesi' },
  { key: 'sali', label: 'Salı' },
  { key: 'carsamba', label: 'Çarşamba' },
  { key: 'persembe', label: 'Perşembe' },
  { key: 'cuma', label: 'Cuma' },
  { key: 'cumartesi', label: 'Cumartesi' },
  { key: 'pazar', label: 'Pazar' },
];

const DEFAULT_HOURS: Record<string, WorkingHour> = {
  pazartesi: { open: '08:00', close: '22:00', is_open: true },
  sali: { open: '08:00', close: '22:00', is_open: true },
  carsamba: { open: '08:00', close: '22:00', is_open: true },
  persembe: { open: '08:00', close: '22:00', is_open: true },
  cuma: { open: '08:00', close: '22:00', is_open: true },
  cumartesi: { open: '09:00', close: '18:00', is_open: true },
  pazar: { open: '09:00', close: '18:00', is_open: false },
};

export default function YeniSalonPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    ad: '',
    kod: '',
    aciklama: '',
    kapasite: 50,
    kurallar: '',
    dolap_var_mi: false,
    dolap_sayisi: 0,
    calisma_saatleri: { ...DEFAULT_HOURS },
  });

  const updateField = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateHour = (day: string, field: keyof WorkingHour, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      calisma_saatleri: {
        ...prev.calisma_saatleri,
        [day]: { ...prev.calisma_saatleri[day], [field]: value },
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Frontend validasyonları
    if (!form.ad || form.ad.length < 3) {
      setError('Salon adı en az 3 karakter olmalıdır.');
      return;
    }
    if (!form.kod || form.kod.length < 2) {
      setError('Salon kodu en az 2 karakter olmalıdır.');
      return;
    }
    if (form.kapasite < 1) {
      setError('Kapasite en az 1 olmalıdır.');
      return;
    }

    const hasOpenDay = Object.values(form.calisma_saatleri).some((h) => h.is_open);
    if (!hasOpenDay) {
      setError('En az bir gün açık olmalıdır.');
      return;
    }

    // Çalışma saati kontrolü
    for (const [day, hours] of Object.entries(form.calisma_saatleri)) {
      if (hours.is_open && hours.close <= hours.open) {
        const dayLabel = DAYS.find((d) => d.key === day)?.label || day;
        setError(`${dayLabel} günü kapanış saati açılış saatinden sonra olmalıdır.`);
        return;
      }
    }

    if (form.dolap_var_mi && form.dolap_sayisi < 1) {
      setError('Dolap sayısı en az 1 olmalıdır.');
      return;
    }

    setSaving(true);
    try {
      const res = await createLibrary(form);
      if (res.success && res.data) {
        router.push(`/admin/kutuphane/salonlar/${res.data.id}`);
      } else {
        setError(res.error || 'Kayıt başarısız');
      }
    } catch {
      setError('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 0 }}>
      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Yeni Salon Oluştur</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <a href="/admin/kutuphane">Kütüphane</a>
              <span>/</span>
              <a href="/admin/kutuphane/salonlar">Salonlar</a>
              <span>/</span>
              <span>Yeni</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px',
          padding: '16px', marginBottom: '20px', color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Genel Bilgiler */}
        <div className="ktp-section-card" style={{ marginBottom: '24px' }}>
          <div className="ktp-section-header">
            <h3>Genel Bilgiler</h3>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <div className="ktp-form-grid">
              <div className="ktp-form-group">
                <label className="ktp-form-label">Salon Adı *</label>
                <input
                  type="text"
                  className="ktp-form-input"
                  placeholder="Ör: Ana Etüt Salonu"
                  value={form.ad}
                  onChange={(e) => updateField('ad', e.target.value)}
                  required
                  minLength={3}
                  maxLength={150}
                />
              </div>
              <div className="ktp-form-group">
                <label className="ktp-form-label">Salon Kodu *</label>
                <input
                  type="text"
                  className="ktp-form-input"
                  placeholder="Ör: KTP-01"
                  value={form.kod}
                  onChange={(e) => updateField('kod', e.target.value.toUpperCase())}
                  required
                  minLength={2}
                  maxLength={20}
                />
              </div>
              <div className="ktp-form-group">
                <label className="ktp-form-label">Kapasite *</label>
                <input
                  type="number"
                  className="ktp-form-input"
                  value={form.kapasite}
                  onChange={(e) => updateField('kapasite', parseInt(e.target.value) || 0)}
                  min={1}
                  max={9999}
                  required
                />
              </div>
            </div>

            <div className="ktp-form-group" style={{ marginTop: '16px' }}>
              <label className="ktp-form-label">Açıklama</label>
              <textarea
                className="ktp-form-input"
                rows={3}
                placeholder="Salon hakkında açıklama..."
                value={form.aciklama}
                onChange={(e) => updateField('aciklama', e.target.value)}
              />
            </div>

            <div className="ktp-form-group" style={{ marginTop: '16px' }}>
              <label className="ktp-form-label">Kurallar</label>
              <textarea
                className="ktp-form-input"
                rows={3}
                placeholder="Salon kuralları..."
                value={form.kurallar}
                onChange={(e) => updateField('kurallar', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Dolap Ayarları */}
        <div className="ktp-section-card" style={{ marginBottom: '24px' }}>
          <div className="ktp-section-header">
            <h3>Dolap Ayarları</h3>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.dolap_var_mi}
                  onChange={(e) => updateField('dolap_var_mi', e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#0061a6' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Bu salonda dolap hizmeti var
                </span>
              </label>
            </div>
            {form.dolap_var_mi && (
              <div className="ktp-form-group" style={{ maxWidth: '200px' }}>
                <label className="ktp-form-label">Dolap Sayısı</label>
                <input
                  type="number"
                  className="ktp-form-input"
                  value={form.dolap_sayisi}
                  onChange={(e) => updateField('dolap_sayisi', parseInt(e.target.value) || 0)}
                  min={1}
                />
              </div>
            )}
          </div>
        </div>

        {/* Çalışma Saatleri */}
        <div className="ktp-section-card" style={{ marginBottom: '24px' }}>
          <div className="ktp-section-header">
            <h3>Çalışma Saatleri</h3>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <div className="ktp-hours-grid">
              {DAYS.map((day) => {
                const hours = form.calisma_saatleri[day.key];
                return (
                  <div key={day.key} className="ktp-hours-row">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                      <input
                        type="checkbox"
                        checked={hours.is_open}
                        onChange={(e) => updateHour(day.key, 'is_open', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#0061a6' }}
                      />
                      <span style={{
                        fontSize: '14px', fontWeight: 500,
                        color: hours.is_open ? '#374151' : '#9ca3af',
                      }}>
                        {day.label}
                      </span>
                    </label>
                    {hours.is_open && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="time"
                          className="ktp-form-input"
                          value={hours.open}
                          onChange={(e) => updateHour(day.key, 'open', e.target.value)}
                          style={{ width: '130px' }}
                        />
                        <span style={{ color: '#9ca3af' }}>—</span>
                        <input
                          type="time"
                          className="ktp-form-input"
                          value={hours.close}
                          onChange={(e) => updateHour(day.key, 'close', e.target.value)}
                          style={{ width: '130px' }}
                        />
                      </div>
                    )}
                    {!hours.is_open && (
                      <span style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>Kapalı</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Link href="/admin/kutuphane/salonlar" style={{
            padding: '10px 20px', backgroundColor: '#f3f4f6', color: '#374151',
            borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 500,
          }}>
            İptal
          </Link>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px 24px', backgroundColor: saving ? '#9ca3af' : '#0061a6',
              color: '#fff', borderRadius: '8px', border: 'none', fontSize: '14px',
              fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Salonu Oluştur'}
          </button>
        </div>
      </form>
    </div>
  );
}
