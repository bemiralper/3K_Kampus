'use client';

import { useEffect, useState } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import { gorusmeService } from '@/app/admin/coaching/meetings/services/gorusme-api';
import type { GorusmeCreatePayload, KullaniciBilgi } from '@/app/admin/coaching/meetings/types';

interface BulkStudent {
  id: number;
  tam_ad: string;
}

interface BulkGorusmeDrawerProps {
  students: BulkStudent[];
  onClose: () => void;
  onSuccess?: (created: number) => void;
}

export default function BulkGorusmeDrawer({
  students,
  onClose,
  onSuccess,
}: BulkGorusmeDrawerProps) {
  const { activeKurum } = useKurum();
  const [kullanici, setKullanici] = useState<KullaniciBilgi | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    konu: '',
    gorusme_tarihi: new Date().toISOString().split('T')[0],
    gorusme_turu: 'ogrenci',
    yontem: 'yuz_yuze',
    notlar: '',
  });

  useEffect(() => {
    gorusmeService.kullaniciBilgi().then(setKullanici).catch(() => null);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.konu.trim()) {
      setError('Konu zorunludur.');
      return;
    }
    if (!activeKurum?.id) {
      setError('Kurum seçili değil.');
      return;
    }
    const coachId = kullanici?.coach_profile_id;
    if (!coachId) {
      setError('Koç profili bulunamadı.');
      return;
    }

    setSaving(true);
    setError('');
    let created = 0;

    try {
      for (const student of students) {
        const payload: GorusmeCreatePayload = {
          kurum_id: activeKurum.id,
          ogrenci_id: student.id,
          koc_id: coachId,
          gorusme_turu: form.gorusme_turu,
          durum: 'planlandi',
          yontem: form.yontem,
          oncelik: 'normal',
          gorusme_tarihi: form.gorusme_tarihi,
          konu: form.konu.trim(),
          notlar: form.notlar.trim() || undefined,
        };
        await gorusmeService.create(payload);
        created += 1;
      }
      onSuccess?.(created);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}${created > 0 ? ` (${created} kayıt oluşturuldu)` : ''}`
          : 'Toplu planlama başarısız'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="coach-drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="coach-drawer coach-drawer-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="bulk-gorusme-title"
      >
        <div className="coach-drawer-header">
          <h2 id="bulk-gorusme-title" className="coach-drawer-title">
            Toplu Görüşme Planla
          </h2>
          <button type="button" className="coach-drawer-close" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        <p className="coach-drawer-subtitle">
          {students.length} öğrenci için aynı görüşme taslağı oluşturulur.
        </p>

        <ul className="coach-bulk-student-list">
          {students.map((s) => (
            <li key={s.id}>{s.tam_ad}</li>
          ))}
        </ul>

        <form onSubmit={handleSubmit}>
          <div className="coach-form-field">
            <label htmlFor="bulk-konu">Konu *</label>
            <input
              id="bulk-konu"
              value={form.konu}
              onChange={(e) => setForm({ ...form, konu: e.target.value })}
              placeholder="Örn. Haftalık değerlendirme"
            />
          </div>

          <div className="coach-form-field">
            <label htmlFor="bulk-tarih">Tarih</label>
            <input
              id="bulk-tarih"
              type="date"
              value={form.gorusme_tarihi}
              onChange={(e) => setForm({ ...form, gorusme_tarihi: e.target.value })}
            />
          </div>

          <div className="coach-form-field">
            <label htmlFor="bulk-tur">Tür</label>
            <select
              id="bulk-tur"
              value={form.gorusme_turu}
              onChange={(e) => setForm({ ...form, gorusme_turu: e.target.value })}
            >
              <option value="ogrenci">Öğrenci Görüşmesi</option>
              <option value="veli">Veli Görüşmesi</option>
              <option value="motivasyon">Motivasyon</option>
              <option value="akademik_analiz">Akademik Analiz</option>
            </select>
          </div>

          <div className="coach-form-field">
            <label htmlFor="bulk-yontem">Yöntem</label>
            <select
              id="bulk-yontem"
              value={form.yontem}
              onChange={(e) => setForm({ ...form, yontem: e.target.value })}
            >
              <option value="yuz_yuze">Yüz yüze</option>
              <option value="telefon">Telefon</option>
              <option value="online">Online</option>
            </select>
          </div>

          <div className="coach-form-field">
            <label htmlFor="bulk-not">Notlar</label>
            <textarea
              id="bulk-not"
              rows={2}
              value={form.notlar}
              onChange={(e) => setForm({ ...form, notlar: e.target.value })}
            />
          </div>

          {error && <p className="coach-drawer-error">{error}</p>}

          <div className="coach-drawer-actions">
            <button type="button" className="coach-btn coach-btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button type="submit" className="coach-btn coach-btn-primary" disabled={saving}>
              {saving ? 'Planlanıyor…' : `${students.length} görüşme oluştur`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
