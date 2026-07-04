'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  updateAtama,
  DURUM_LABELS,
  ONCELIK_LABELS,
  formatGorevTarih,
  type GorevAtama,
  type GorevDurum,
} from '@/lib/gorev-api';
import { getGorevActions, type GorevActionId } from '@/lib/gorev-actions';

type Props = {
  atama: GorevAtama;
  onClose: () => void;
  onUpdated?: () => void;
};

export default function GorevDetailDrawer({ atama, onClose, onUpdated }: Props) {
  const g = atama.gorev!;
  const tip = g.gorev_tipi;
  const [notlar, setNotlar] = useState(atama.notlar || '');
  const [saving, setSaving] = useState(false);
  const isDone = ['TAMAMLANDI', 'TAMAMLANMADI', 'IPTAL'].includes(atama.durum);

  const actions = isDone ? [] : getGorevActions(tip?.kod, Boolean(g.aksiyon_url));

  const handleAction = async (actionId: GorevActionId) => {
    if (actionId === 'open_related') return;

    setSaving(true);
    try {
      if (actionId === 'complete') {
        await updateAtama(atama.id, { durum: 'TAMAMLANDI' as GorevDurum, notlar });
      } else if (actionId === 'not_complete') {
        await updateAtama(atama.id, { durum: 'TAMAMLANMADI' as GorevDurum, notlar });
      } else if (actionId === 'meeting_planned') {
        await updateAtama(atama.id, { gorusuldu: true, notlar });
      }
      onUpdated?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gorev-drawer-backdrop" onClick={onClose}>
      <div className="gorev-drawer" onClick={e => e.stopPropagation()}>
        <div className="gorev-drawer-header">
          {tip && <span className="gorev-drawer-tip">{tip.ikon} {tip.ad}</span>}
          <span className="gorev-badge gorev-badge-durum">{DURUM_LABELS[atama.durum]}</span>
        </div>

        <h3>{g.baslik}</h3>
        {g.aciklama && <p className="gorev-drawer-desc">{g.aciklama}</p>}

        <p className="gorev-drawer-meta">
          Son tarih: {formatGorevTarih(g.son_tarih, g.tum_gun)}
          {' · '}
          {ONCELIK_LABELS[g.oncelik]}
        </p>

        {atama.gecikti_mi && <p className="gorev-drawer-late">Gecikmiş görev</p>}

        {!isDone && (
          <textarea
            className="gorev-textarea"
            placeholder="Not ekle…"
            value={notlar}
            onChange={e => setNotlar(e.target.value)}
            rows={3}
          />
        )}

        {atama.notlar && isDone && (
          <p className="gorev-drawer-note"><strong>Not:</strong> {atama.notlar}</p>
        )}

        <div className="gorev-drawer-actions">
          {actions.map(action => {
            if (action.id === 'open_related' && g.aksiyon_url) {
              return (
                <Link
                  key={action.id}
                  href={g.aksiyon_url}
                  className={`gorev-btn ${action.primary ? 'gorev-btn-primary' : 'gorev-btn-ghost'}`}
                >
                  {action.label}
                </Link>
              );
            }
            return (
              <button
                key={action.id}
                type="button"
                className={`gorev-btn ${action.primary ? 'gorev-btn-primary' : 'gorev-btn-ghost'}`}
                disabled={saving}
                onClick={() => handleAction(action.id)}
              >
                {action.label}
              </button>
            );
          })}
          <button type="button" className="gorev-btn gorev-btn-ghost" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
