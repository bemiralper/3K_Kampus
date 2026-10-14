'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { daireSablonApi } from '../daire-dizisi/api';
import { useOlcmePath } from '../useOlcmePath';
import type { DaireSablonOzet } from '../daire-dizisi/types';
import s from './optikYazdir.module.css';

interface Props {
  examId: number;
  participantIds: number[];
  selectionLabel: string;
  onClose: () => void;
}

export default function OptikYazdirModal({ examId, participantIds, selectionLabel, onClose }: Props) {
  const { isCoach, href } = useOlcmePath();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [daireForms, setDaireForms] = useState<DaireSablonOzet[]>([]);
  const [daireId, setDaireId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bookletMode, setBookletMode] = useState<'none' | 'fixed' | 'alternating_ab'>('none');
  const [booklet, setBooklet] = useState<'A' | 'B' | 'C' | 'D'>('A');

  useEffect(() => { setRoot(document.body); }, []);

  useEffect(() => {
    daireSablonApi.list()
      .then(rows => {
        const active = rows.filter(row => row.aktif);
        setDaireForms(active);
        if (active[0]) setDaireId(active[0].id);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Şablonlar yüklenemedi.'))
      .finally(() => setLoading(false));
  }, []);

  const print = async () => {
    if (!daireId) {
      setError('Optik form şablonu seçin.');
      return;
    }
    if (participantIds.length === 0) {
      setError('Basılacak öğrenci yok.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const notes = await daireSablonApi.yazdir(examId, Number(daireId), participantIds, bookletMode, booklet);
      if (notes.length) {
        setError(`PDF indirildi. Kontrol edin: ${notes.join(' ')}`);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optik form basılamadı.');
    } finally {
      setBusy(false);
    }
  };

  if (!root) return null;

  return createPortal(
    <div className={s.backdrop} onClick={onClose} role="presentation">
      <div className={s.dialog} role="dialog" aria-labelledby="optik-yazdir-title" onClick={e => e.stopPropagation()}>
        <h2 id="optik-yazdir-title">Optik Form Yazdır</h2>
        <p className={s.lead}>
          {selectionLabel}. Hazır optik formları yazıcıya koyun.
          PDF yalnız katılımcının adını, T.C. kimlik numarasını, numarasını, sınıfını, şubesini ve salon/sıra bilgisini basar.
          Formun kendisi çıkmaz. Yazdırma penceresinde kâğıt A4 ve ölçek yüzde 100 olsun.
          “Kâğıt boyutuna sığdır” kutusunu kapalı tutun.
        </p>
        {loading ? <p>Formlar yükleniyor…</p> : null}
        {!loading && daireForms.length === 0 ? (
          <p>
            Kayıtlı optik form şablonu yok.
            {!isCoach && (
              <>
                {' '}
                <Link href={href('daire-dizisi')}>Optik Form Editörü</Link>
              </>
            )}
          </p>
        ) : null}
        {daireForms.length > 0 && (
          <>
            <label className={s.field}>
              Optik Form Şablonu
              <select value={daireId} onChange={e => setDaireId(Number(e.target.value))}>
                {daireForms.map(form => (
                  <option key={form.id} value={form.id}>{form.ad}</option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              Kitapçık Dağıtımı
              <select value={bookletMode} onChange={e => setBookletMode(e.target.value as 'none' | 'fixed' | 'alternating_ab')}>
                <option value="none">Kitapçık kodlaması yok</option>
                <option value="fixed">Tüm öğrencilere aynı kitapçık</option>
                <option value="alternating_ab">A-B dönüşümlü</option>
              </select>
            </label>
            {bookletMode === 'fixed' && (
              <label className={s.field}>
                Kitapçık Türü
                <select value={booklet} onChange={e => setBooklet(e.target.value as 'A' | 'B' | 'C' | 'D')}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </label>
            )}
          </>
        )}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <button type="button" className={s.ghost} onClick={onClose}>Vazgeç</button>
          <button type="button" className={s.primary} onClick={print} disabled={busy || daireForms.length === 0}>
            {busy ? 'Hazırlanıyor…' : 'PDF İndir'}
          </button>
        </div>
      </div>
    </div>,
    root,
  );
}
