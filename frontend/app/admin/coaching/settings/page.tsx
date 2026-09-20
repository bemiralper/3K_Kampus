'use client';

import { useEffect, useState } from 'react';
import {
  fetchAttendanceThresholds,
  saveAttendanceThresholds,
  type AttendanceThresholds,
} from '@/lib/coaching-api';

const EMPTY: AttendanceThresholds = {
  absence_attention: 3,
  absence_alarm: 5,
  late_attention: 3,
  late_alarm: 5,
  consecutive_absent_alarm: 2,
  recommended_action_attention: 'Öğrenciyle görüş',
  recommended_action_alarm: 'Öğrenciyle görüş',
};

export default function SettingsPage() {
  const [form, setForm] = useState<AttendanceThresholds>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    fetchAttendanceThresholds().then((res) => {
      if (res.success && res.data) setForm({ ...EMPTY, ...res.data });
      else setError(res.error || 'Eşikler yüklenemedi.');
      setLoading(false);
    }).catch(() => {
      setError('Eşikler yüklenemedi.');
      setLoading(false);
    });
  }, []);

  const setNum = (key: keyof AttendanceThresholds, value: string) => {
    setForm((prev) => ({ ...prev, [key]: Number(value) }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await saveAttendanceThresholds(form);
      if (res.success && res.data) {
        setForm({ ...EMPTY, ...res.data });
        setSaved('Eşikler kaydedildi. Günlük yoklama yine yalnızca bildirim üretir; eşik aşılınca Risk Merkezi’ne düşer.');
      } else {
        setError(res.error || 'Kaydedilemedi.');
      }
    } catch {
      setError('Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-2xl">⚙️</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Koçluk Ayarları</h1>
              <p className="text-gray-500">Yoklama eşikleri ve otomatik risk kuralları</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 mb-6">
            Günlük yoklama koça bildirim gider. Risk Merkezi’ne kayıt yalnızca dikkat / alarm eşiği
            aşıldığında veya ardışık gelmeme kuralı tetiklenince açılır. Sabah, öğle ve akşam aynı gün sayılır.
          </div>

          {loading ? (
            <p className="text-slate-500">Yükleniyor…</p>
          ) : (
            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Devamsızlık</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm text-slate-600 mb-1">🟠 Dikkat eşiği (gün)</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={form.absence_attention}
                      onChange={(e) => setNum('absence_attention', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm text-slate-600 mb-1">🔴 Alarm eşiği (gün)</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={form.absence_alarm}
                      onChange={(e) => setNum('absence_alarm', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Geç kalma</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm text-slate-600 mb-1">🟠 Dikkat eşiği (gün)</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={form.late_attention}
                      onChange={(e) => setNum('late_attention', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm text-slate-600 mb-1">🔴 Alarm eşiği (gün)</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={form.late_alarm}
                      onChange={(e) => setNum('late_alarm', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Ardışık devamsızlık</h2>
                <label className="block max-w-sm">
                  <span className="block text-sm text-slate-600 mb-1">🔴 Ardışık gün gelmeme alarmı</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={form.consecutive_absent_alarm}
                    onChange={(e) => setNum('consecutive_absent_alarm', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </label>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Önerilen aksiyon</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm text-slate-600 mb-1">Dikkat</span>
                    <input
                      type="text"
                      value={form.recommended_action_attention}
                      onChange={(e) => setForm((p) => ({ ...p, recommended_action_attention: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm text-slate-600 mb-1">Alarm</span>
                    <input
                      type="text"
                      value={form.recommended_action_alarm}
                      onChange={(e) => setForm((p) => ({ ...p, recommended_action_alarm: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </label>
                </div>
              </section>

              {error ? <p className="text-red-600 text-sm">{error}</p> : null}
              {saved ? <p className="text-emerald-700 text-sm">{saved}</p> : null}

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-60"
              >
                {saving ? 'Kaydediliyor…' : 'Eşikleri kaydet'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
