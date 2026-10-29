'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DaireDizisiEditor from '../../../../components/olcme/daire-dizisi/DaireDizisiEditor';
import OptikTanimlaYardim from '../../../../components/olcme/daire-dizisi/OptikTanimlaYardim';
import { daireSablonApi, yaziciProfiliApi } from '../../../../components/olcme/daire-dizisi/api';
import type { DaireSablonDetay, DaireSablonOzet, YaziciProfili } from '../../../../components/olcme/daire-dizisi/types';
import s from '../../../../components/olcme/daire-dizisi/daireDizisi.module.css';
import TanimlarTabs from '@/components/olcme/TanimlarTabs';

export default function DaireDizisiPage() {
  const [forms, setForms] = useState<DaireSablonOzet[]>([]);
  const [current, setCurrent] = useState<DaireSablonDetay | null>(null);
  const [ad, setAd] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [profiles, setProfiles] = useState<YaziciProfili[]>([]);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [dirty, setDirty] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const loadList = useCallback(async () => {
    const rows = await daireSablonApi.list();
    setForms(rows);
    return rows;
  }, []);

  const openForm = useCallback(async (id: number) => {
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Başka şablona geçilsin mi?')) return;
    setError('');
    setCurrent(await daireSablonApi.detail(id));
  }, [dirty]);

  useEffect(() => {
    loadList()
      .catch(err => setError(err instanceof Error ? err.message : 'Şablonlar yüklenemedi.'))
      .finally(() => setLoading(false));
    yaziciProfiliApi.list().then(setProfiles).catch(() => setProfiles([]));
  }, [loadList]);

  const createForm = async () => {
    if (!ad.trim() || !file) {
      setError('Şablon adı ve form dosyası gerekli.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await daireSablonApi.create(ad.trim(), file);
      setAd('');
      setFile(null);
      await loadList();
      setCurrent(created);
      showToast(created.uyari || 'Şablon oluşturuldu. Eski formların üzerine yazılmadı.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şablon kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!current) return;
    const next = window.prompt('Şablon adı', current.ad);
    if (!next || next.trim() === current.ad) return;
    setBusy(true);
    try {
      const saved = await daireSablonApi.update(current.id, { ad: next.trim() });
      setCurrent(saved);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ad kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const copyForm = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const copy = await daireSablonApi.kopyala(current.id);
      await loadList();
      setCurrent(copy);
      showToast('Kopya oluşturuldu. Kaynak şablon duruyor.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kopyalanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const removeForm = async () => {
    if (!current) return;
    if (!window.confirm(`“${current.ad}” silinsin mi? Koordinat editöründeki formlar etkilenmez.`)) return;
    setBusy(true);
    try {
      await daireSablonApi.remove(current.id);
      const rows = await loadList();
      setCurrent(null);
      if (rows[0]) await openForm(rows[0].id);
      showToast('Şablon silindi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şablon silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  const patchCurrent = async (data: { aktif?: boolean; yazici_profili_id?: number | null }) => {
    if (!current) return;
    setBusy(true);
    try {
      const saved = await daireSablonApi.update(current.id, data);
      setCurrent(saved);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şablon güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const replaceSource = async () => {
    if (!current || !replaceFile) return;
    if (!window.confirm('Kaynak form yenilensin mi? Tanımlı alan geometrileri korunacaktır.')) return;
    setBusy(true);
    try {
      const saved = await daireSablonApi.replaceSource(current.id, replaceFile, current.sayfa_no);
      setCurrent(saved);
      setReplaceFile(null);
      showToast('Kaynak form yenilendi; alan geometrileri korundu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaynak form yenilenemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.page}>
      <TanimlarTabs />
      <header className={s.header}>
        <div className={s.headerTop}>
          <div>
            <h1>Optik Form Editörü</h1>
            <p>
              Boş optik formu PDF, PNG veya JPG olarak yükleyin. FMT dosyası yükleyerek tüm alanları
              ve ızgarayı tek seferde oluşturabilir veya ince ayar yapabilirsiniz. Konumlar sayfanın
              milimetresine yazılır; yazıcı kalibrasyonu ayrı yönetilir.
            </p>
          </div>
          <button type="button" className={s.helpBtn} onClick={() => setHelpOpen(true)}>Yardım</button>
        </div>
      </header>
      {helpOpen && <OptikTanimlaYardim onClose={() => setHelpOpen(false)} />}
      {error && <div className={s.error} role="alert">{error}</div>}
      {toast && <div className={s.toast}>{toast}</div>}
      <div className={s.layout}>
        <aside className={s.card}>
          <h2>Şablonlar</h2>
          {loading ? <p className={s.empty}>Yükleniyor…</p> : null}
          {!loading && forms.length === 0 ? <p className={s.empty}>Henüz daire şablonu yok.</p> : null}
          <div className={s.formList}>
            {forms.map(form => (
              <button
                key={form.id}
                type="button"
                className={`${s.formBtn} ${current?.id === form.id ? s.formOn : ''}`}
                onClick={() => openForm(form.id).catch(err => setError(err instanceof Error ? err.message : 'Şablon açılamadı.'))}
              >
                <strong>{form.ad}</strong>
                <span>{form.alan_sayisi} alan · {form.kaynak_tur.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <div className={s.stack}>
            <label>
              Yeni şablon adı
              <input value={ad} onChange={event => setAd(event.target.value)} placeholder="TYT optik" />
            </label>
            <label>
              Form dosyası
              <input
                type="file"
                accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
                onChange={event => setFile(event.target.files?.[0] || null)}
              />
            </label>
            <button type="button" className={s.primary} onClick={createForm} disabled={busy}>Yükle</button>
            {current && (
              <>
                <label className={s.check}>
                  <input type="checkbox" checked={current.aktif} onChange={event => patchCurrent({ aktif: event.target.checked })} />
                  Şablon aktif
                </label>
                <label>
                  Yazıcı profili
                  <select value={current.yazici_profili_id || ''} onChange={event => patchCurrent({ yazici_profili_id: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">Şablon kalibrasyonu</option>
                    {profiles.filter(profile => profile.aktif).map(profile => <option key={profile.id} value={profile.id}>{profile.ad}{profile.varsayilan ? ' (varsayılan)' : ''}</option>)}
                  </select>
                </label>
                <label>
                  Kaynak formu yenile
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => setReplaceFile(event.target.files?.[0] || null)} />
                </label>
                <button type="button" className={s.ghost} onClick={replaceSource} disabled={busy || !replaceFile}>Geometriyi koruyarak yenile</button>
                <div className={s.rowActions}>
                  <button type="button" className={s.ghost} onClick={rename} disabled={busy}>Ad</button>
                  <button type="button" className={s.ghost} onClick={copyForm} disabled={busy}>Kopyala</button>
                  <button type="button" className={s.danger} onClick={removeForm} disabled={busy}>Sil</button>
                </div>
              </>
            )}
          </div>
        </aside>
        {current ? (
          <DaireDizisiEditor
            sablon={current}
            onChange={next => {
              setCurrent(next);
              setForms(rows => rows.map(row => (row.id === next.id ? { ...row, ...next } : row)));
            }}
            onToast={showToast}
            onError={setError}
            onDirty={setDirty}
          />
        ) : (
          <div className={s.card}>
            <p className={s.note}>Bir şablon seçin veya yeni form yükleyin. Daire dizisi, form görüntüsünün üzerinde aynı milimetre düzeninde durur.</p>
          </div>
        )}
      </div>
    </div>
  );
}
