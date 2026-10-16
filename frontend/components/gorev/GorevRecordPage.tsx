'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  deleteGorev,
  downloadGorevPdf,
  fetchGorevDetail,
  updateAtama,
  DURUM_LABELS,
  ONCELIK_LABELS,
  isBilgilendirme,
  formatGorevTarih,
  type Gorev,
  type GorevAtama,
  type GorevDurum,
} from '@/lib/gorev-api';
import { useAuth } from '@/lib/contexts/AuthContext';
import GorevAciklamaView from '@/components/gorev/GorevAciklamaView';
import { getGorevActions, type GorevActionId } from '@/lib/gorev-actions';
import GorevSelfReminder from '@/components/gorev/GorevSelfReminder';

type Props = {
  gorevId: string;
  listHref: string;
  mode: 'admin' | 'assignee';
};

function durumClass(durum: string): string {
  if (durum === 'TAMAMLANDI') return 'gorev-admin-durum--done';
  if (durum === 'TAMAMLANMADI') return 'gorev-admin-durum--failed';
  if (durum === 'IPTAL') return 'gorev-admin-durum--cancel';
  return 'gorev-admin-durum--pending';
}

function seenLabel(value: string | null | undefined): string {
  if (!value) return 'Görülmedi';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Görüldü';
  return `Görüldü ${date.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}

export default function GorevRecordPage({ gorevId, listHref, mode }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const [gorev, setGorev] = useState<Gorev | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [notlar, setNotlar] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sent' | 'error'>('idle');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGorevDetail(gorevId).then(res => {
      if (cancelled) return;
      if (res.success && res.data) {
        setGorev(res.data);
        const mine = (res.data.atamalar || []).find(a => userId && a.atanan_user_id === userId);
        setNotlar(mine?.notlar || '');
        if (mode === 'assignee' && mine && !mine.ilk_acilma_at) {
          void updateAtama(mine.id, {});
        }
      } else {
        setError(res.error || 'Görev bulunamadı.');
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [gorevId, mode, userId]);

  if (loading) {
    return <div className={`gorev-record-page gorev-record--${mode}`}><p className="gorev-record-status">Yükleniyor…</p></div>;
  }
  if (!gorev) {
    return (
      <div className={`gorev-record-page gorev-record--${mode}`}>
        <Link href={listHref} className="gorev-record-back">← Görevlere dön</Link>
        <p className="gorev-record-status">{error || 'Görev bulunamadı.'}</p>
      </div>
    );
  }

  const g = gorev;
  const tip = g.gorev_tipi;
  const bilgi = isBilgilendirme(tip);
  const atamalar = g.atamalar || [];
  const mine = atamalar.find(a => userId && a.atanan_user_id === userId) || null;
  const isDone = mine ? ['TAMAMLANDI', 'TAMAMLANMADI', 'IPTAL'].includes(mine.durum) : true;
  const actions = mine && !isDone && !bilgi
    ? getGorevActions(tip?.kod, Boolean(g.aksiyon_url))
    : [];

  const handleDelete = async () => {
    if (!confirm(`"${g.baslik}" görevini silmek istediğinize emin misiniz?`)) return;
    setDeleting(true);
    const res = await deleteGorev(g.id);
    setDeleting(false);
    if (res.success) router.push(listHref);
  };

  const handleAction = async (actionId: GorevActionId) => {
    if (!mine || actionId === 'open_related') return;
    setSaving(true);
    try {
      if (actionId === 'complete') {
        await updateAtama(mine.id, { durum: 'TAMAMLANDI' as GorevDurum, notlar });
      } else if (actionId === 'not_complete') {
        await updateAtama(mine.id, { durum: 'TAMAMLANMADI' as GorevDurum, notlar });
      } else if (actionId === 'meeting_planned') {
        await updateAtama(mine.id, { gorusuldu: true, notlar });
      }
      router.push(listHref);
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = mine
    ? (bilgi ? (mine.ilk_acilma_at ? 'Görüldü' : 'Görülmedi') : DURUM_LABELS[mine.durum])
    : '';

  const sendFeedback = async () => {
    if (!mine) return;
    const text = notlar.trim();
    if (!text) return;
    setFeedbackBusy(true);
    setFeedbackState('idle');
    const res = await updateAtama(mine.id, { notlar: text });
    setFeedbackBusy(false);
    if (!res.success) {
      setFeedbackState('error');
      return;
    }
    setFeedbackState('sent');
    setGorev(prev => prev ? {
      ...prev,
      atamalar: (prev.atamalar || []).map(item => (item.id === mine.id ? { ...item, notlar: text } : item)),
    } : prev);
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError('');
    try {
      await downloadGorevPdf(g.id, g.baslik || 'gorev');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF indirilemedi.');
    } finally {
      setPdfBusy(false);
    }
  };

  const actionButtons = (
    <>
      {mode === 'admin' && (
        <>
          <Link href={`/admin/gorevler/${g.id}/duzenle`} className="gorev-btn gorev-btn-primary">
            Düzenle
          </Link>
          <button type="button" className="gorev-btn gorev-btn-danger" disabled={deleting} onClick={() => void handleDelete()}>
            {deleting ? 'Siliniyor…' : 'Sil'}
          </button>
        </>
      )}
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
            onClick={() => void handleAction(action.id)}
          >
            {action.label}
          </button>
        );
      })}
    </>
  );

  return (
    <div className={`gorev-record-page gorev-record--${mode}`}>
      <div className="gorev-record-toolbar">
        <Link href={listHref} className="gorev-record-back">← Görevler</Link>
        <div className="gorev-record-toolbar-actions">
          <button type="button" className="gorev-btn gorev-btn-ghost" disabled={pdfBusy} onClick={() => void downloadPdf()}>
            {pdfBusy ? 'Hazırlanıyor…' : 'PDF indir'}
          </button>
          <div className="gorev-record-actions">{actionButtons}</div>
        </div>
      </div>
      {pdfError ? <p className="gorev-record-pdf-error">{pdfError}</p> : null}
      <article className="gorev-record-card">
        <header className="gorev-record-head">
          <div className="gorev-record-kicker">
            <span className={`gorev-kind ${bilgi ? 'gorev-kind--info' : 'gorev-kind--task'}`}>
              {bilgi ? 'Bilgilendirme' : 'Görev'}
            </span>
            {tip && !bilgi ? <span className="gorev-drawer-tip">{tip.ikon} {tip.ad}</span> : null}
            {statusLabel ? <span className="gorev-badge gorev-badge-durum">{statusLabel}</span> : null}
            {mine?.gecikti_mi && mode === 'assignee' ? <span className="gorev-record-late">Gecikmiş</span> : null}
          </div>
          <h1>{g.baslik}</h1>
          <ul className="gorev-record-facts">
            <li>
              <span>Son tarih</span>
              <strong>{formatGorevTarih(g.son_tarih, g.tum_gun)}</strong>
            </li>
            <li>
              <span>Öncelik</span>
              <strong>{ONCELIK_LABELS[g.oncelik]}</strong>
            </li>
          </ul>
        </header>
        {bilgi ? (
          <p className="gorev-record-kind-note">
            Bu bir bilgilendirmedir. Okunması yeterlidir, tamamlanması beklenmez.
          </p>
        ) : null}
        <div className="gorev-record-body">
          <GorevAciklamaView value={g.aciklama} />
        </div>

        {mode === 'admin' ? (
          <div className="gorev-admin-atamalar">
            <div className="gorev-atama-head">
              <h2>Atanan kişiler ve durum</h2>
              <p className="gorev-atama-summary">
                <span>{atamalar.length} kişi</span>
                <span>{atamalar.filter(a => a.ilk_acilma_at).length} görüldü</span>
                {bilgi ? null : <span>{atamalar.filter(a => a.durum === 'TAMAMLANDI').length} tamamlandı</span>}
              </p>
            </div>
            <ul className="gorev-admin-atama-list">
              {atamalar.map(a => (
                <li key={a.id} className="gorev-admin-atama-row">
                  <span className="gorev-admin-atama-name">
                    {(a as GorevAtama).atanan_ad || `Kullanıcı #${a.atanan_user_id}`}
                  </span>
                  <span className={`gorev-seen${a.ilk_acilma_at ? ' gorev-seen--yes' : ''}`}>
                    {seenLabel(a.ilk_acilma_at)}
                  </span>
                  {bilgi ? null : (
                    <span className={`gorev-admin-durum ${durumClass(a.durum)}`}>
                      {DURUM_LABELS[a.durum]}
                    </span>
                  )}
                  {!bilgi && a.gecikti_mi && a.durum !== 'TAMAMLANDI' && (
                    <span className="gorev-admin-gecikme">Gecikmiş</span>
                  )}
                </li>
              ))}
            </ul>
            {atamalar.some(a => a.notlar) && (
              <div className="gorev-admin-notlar">
                <h2>Geri bildirim</h2>
                {atamalar.filter(a => a.notlar).map(a => (
                  <p key={a.id}>
                    <strong>{a.atanan_ad || 'Not'}:</strong> {a.notlar}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {mine ? <GorevSelfReminder atama={mine} /> : null}
        {mine ? (
          <div className="gorev-record-note">
            <span>Gönderene mesaj</span>
            <textarea
              className="gorev-textarea"
              placeholder="Geri bildirim yazın…"
              value={notlar}
              onChange={e => {
                setNotlar(e.target.value);
                setFeedbackState('idle');
              }}
              rows={3}
            />
            <span className="gorev-record-note-actions">
              <small>
                {feedbackState === 'sent' ? 'Gönderene iletildi.' : feedbackState === 'error' ? 'Mesaj gönderilemedi.' : 'Gönderen bu mesajı görür.'}
              </small>
              <button type="button" className="gorev-btn gorev-btn-primary" disabled={feedbackBusy || !notlar.trim()} onClick={() => void sendFeedback()}>
                {feedbackBusy ? 'Gönderiliyor…' : 'Mesajı gönder'}
              </button>
            </span>
          </div>
        ) : !mine && mode !== 'admin' ? (
          <p className="gorev-record-status">Bu kayıt size atanmamış.</p>
        ) : null}

      </article>
    </div>
  );
}
