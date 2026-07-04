'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  fetchGorevDetail, deleteGorev,
  YAPILMA_LABELS, ONCELIK_LABELS, formatGorevTarih,
  type GorevAtama, type Gorev,
} from '@/lib/gorev-api';

type Props = {
  atama: GorevAtama;
  onClose: () => void;
  onUpdated?: () => void;
};

export default function GorevAdminDetailDrawer({ atama, onClose, onUpdated }: Props) {
  const router = useRouter();
  const [gorev, setGorev] = useState<Gorev | null>(atama.gorev || null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!atama.gorev_id) return;
    fetchGorevDetail(atama.gorev_id).then(res => {
      if (res.success && res.data) setGorev(res.data);
    });
  }, [atama.gorev_id]);

  const g = gorev || atama.gorev;
  if (!g) return null;

  const tip = g.gorev_tipi;
  const atamalar = g.atamalar || [atama];

  const handleDelete = async () => {
    if (!confirm(`"${g.baslik}" görevini silmek istediğinize emin misiniz?`)) return;
    setDeleting(true);
    const res = await deleteGorev(g.id);
    setDeleting(false);
    if (res.success) {
      onUpdated?.();
      onClose();
      router.refresh();
    }
  };

  const durumClass = (durum: string) => {
    if (durum === 'TAMAMLANDI') return 'gorev-admin-durum--done';
    if (durum === 'TAMAMLANMADI') return 'gorev-admin-durum--failed';
    if (durum === 'IPTAL') return 'gorev-admin-durum--cancel';
    return 'gorev-admin-durum--pending';
  };

  return (
    <div className="gorev-drawer-backdrop" onClick={onClose}>
      <div className="gorev-drawer gorev-drawer--admin" onClick={e => e.stopPropagation()}>
        <div className="gorev-drawer-header">
          {tip && <span className="gorev-drawer-tip">{tip.ikon} {tip.ad}</span>}
          <span className="gorev-badge gorev-badge-durum">Yönetici görünümü</span>
        </div>

        <h3>{g.baslik}</h3>
        {g.aciklama && <p className="gorev-drawer-desc">{g.aciklama}</p>}

        <p className="gorev-drawer-meta">
          Son tarih: {formatGorevTarih(g.son_tarih, g.tum_gun)}
          {' · '}
          {ONCELIK_LABELS[g.oncelik]}
        </p>

        <div className="gorev-admin-atamalar">
          <h4>Atanan kişiler ve durum</h4>
          <ul className="gorev-admin-atama-list">
            {atamalar.map(a => (
              <li key={a.id} className="gorev-admin-atama-row">
                <span className="gorev-admin-atama-name">
                  {(a as GorevAtama & { atanan_ad?: string }).atanan_ad || `Kullanıcı #${a.atanan_user_id}`}
                </span>
                <span className={`gorev-admin-durum ${durumClass(a.durum)}`}>
                  {YAPILMA_LABELS[a.durum]}
                </span>
                {a.gecikti_mi && a.durum !== 'TAMAMLANDI' && (
                  <span className="gorev-admin-gecikme">Gecikmiş</span>
                )}
              </li>
            ))}
          </ul>
          {atamalar.some(a => a.notlar) && (
            <div className="gorev-admin-notlar">
              {atamalar.filter(a => a.notlar).map(a => (
                <p key={a.id}>
                  <strong>{(a as GorevAtama & { atanan_ad?: string }).atanan_ad || 'Not'}:</strong> {a.notlar}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="gorev-drawer-actions">
          <Link
            href={`/admin/gorevler/${g.id}/duzenle`}
            className="gorev-btn gorev-btn-primary"
          >
            Düzenle
          </Link>
          <button
            type="button"
            className="gorev-btn gorev-btn-danger"
            disabled={deleting}
            onClick={handleDelete}
          >
            {deleting ? 'Siliniyor…' : 'Sil'}
          </button>
          <button type="button" className="gorev-btn gorev-btn-ghost" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
