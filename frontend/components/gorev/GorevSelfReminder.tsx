'use client';

import React, { useEffect, useState } from 'react';
import { updateAtama, type GorevAtama } from '@/lib/gorev-api';
import { useAuth } from '@/lib/contexts/AuthContext';

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Props = {
  atama: GorevAtama;
};

export default function GorevSelfReminder({ atama }: Props) {
  const { user } = useAuth();
  const [value, setValue] = useState(() => toLocalInput(atama.kisisel_hatirlatma_at));
  const [savedAt, setSavedAt] = useState(atama.kisisel_hatirlatma_at || '');
  const [sent, setSent] = useState(Boolean(atama.kisisel_hatirlatma_gonderildi));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setValue(toLocalInput(atama.kisisel_hatirlatma_at));
    setSavedAt(atama.kisisel_hatirlatma_at || '');
    setSent(Boolean(atama.kisisel_hatirlatma_gonderildi));
  }, [atama.id, atama.kisisel_hatirlatma_at, atama.kisisel_hatirlatma_gonderildi]);

  if (!user || user.id !== atama.atanan_user_id || atama.durum === 'IPTAL') return null;

  const save = async (next: string | null) => {
    setBusy(true);
    setError('');
    setNotice('');
    const res = await updateAtama(atama.id, { kisisel_hatirlatma_at: next });
    setBusy(false);
    if (!res.success || !res.data) {
      setError(res.error || 'Hatırlatma kaydedilemedi.');
      return;
    }
    setSavedAt(res.data.kisisel_hatirlatma_at || '');
    setSent(Boolean(res.data.kisisel_hatirlatma_gonderildi));
    setValue(toLocalInput(res.data.kisisel_hatirlatma_at));
    setNotice(next ? 'Kaydedildi. Bu saatte görevler ikonuna düşer.' : 'Hatırlatma kaldırıldı.');
  };

  return (
    <div className="gorev-record-remind">
      <span>Kendime hatırlat</span>
      <input
        type="datetime-local"
        value={value}
        min={toLocalInput(new Date().toISOString())}
        onChange={e => {
          setValue(e.target.value);
          setNotice('');
          setError('');
        }}
      />
      <span className="gorev-record-note-actions">
        <small>
          {error || notice || (savedAt
            ? (sent ? 'Hatırlatma gönderildi.' : `${formatLocal(savedAt)} için ayarlandı.`)
            : 'Seçtiğiniz tarih ve saatte size hatırlatma gelir.')}
        </small>
        <span className="gorev-record-remind-buttons">
          {savedAt && !sent ? (
            <button type="button" className="gorev-btn gorev-btn-ghost" disabled={busy} onClick={() => void save(null)}>
              Kaldır
            </button>
          ) : null}
          <button
            type="button"
            className="gorev-btn gorev-btn-primary"
            disabled={busy || !value}
            onClick={() => void save(new Date(value).toISOString())}
          >
            {busy ? 'Kaydediliyor…' : 'Hatırlatmayı kaydet'}
          </button>
        </span>
      </span>
    </div>
  );
}
