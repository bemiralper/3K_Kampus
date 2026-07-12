'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  websiteCmsV2Api,
  type CmsForm,
  type CmsFormSubmission,
} from '@/lib/website-api';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsFormsPanel({ onMessage }: Props) {
  const [forms, setForms] = useState<CmsForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subs, setSubs] = useState<CmsFormSubmission[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.listForms();
    setLoading(false);
    if (res.success && res.data) setForms(res.data);
    else onMessage(res.error || 'Formlar yüklenemedi', 'error');
  }, [onMessage]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim()) {
      onMessage('Form adı gerekli', 'error');
      return;
    }
    const res = await websiteCmsV2Api.createForm({
      name: name.trim(),
      fields: [
        { name: 'ad_soyad', label: 'Ad Soyad', type: 'text', required: true },
        { name: 'telefon', label: 'Telefon', type: 'tel', required: true },
        { name: 'mesaj', label: 'Mesaj', type: 'textarea', required: false },
      ],
      settings: { thank_you: 'Başvurunuz alındı.' },
    });
    if (res.success) {
      onMessage('Form oluşturuldu');
      setName('');
      await load();
    } else onMessage(res.error || 'Oluşturma başarısız', 'error');
  };

  const viewSubs = async (id: number) => {
    setSelectedId(id);
    setSubs([]);
    const res = await websiteCmsV2Api.listSubmissions(id);
    if (res.success && res.data) setSubs(res.data);
    else onMessage(res.error || 'Başvurular yüklenemedi', 'error');
  };

  const selectedForm = forms.find((f) => f.id === selectedId);

  const formatPayload = (payload: unknown): string => {
    if (!payload || typeof payload !== 'object') return '—';
    return Object.entries(payload as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${v ?? ''}`)
      .join(' · ');
  };

  return (
    <div>
      <div className="wam-panel" style={{ marginBottom: '1rem' }}>
        <div className="wam-panel-header">
          <div>
            <h3>Formlar</h3>
            <p>İletişim / başvuru formları</p>
          </div>
        </div>
        <div className="wam-panel-body">
          <div className="cms-inline-form">
            <div className="wam-field">
              <label>Form adı</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="İletişim formu" />
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={create}>+ Form</button>
          </div>
          {loading ? (
            <div className="wam-empty">Yükleniyor…</div>
          ) : forms.length === 0 ? (
            <div className="wam-empty">Henüz form yok. Yukarıdan yeni form oluşturun.</div>
          ) : (
            <table className="cms-table">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Slug</th>
                  <th>Başvuru</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {forms.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td><code>{f.slug}</code></td>
                    <td>{f.submission_count ?? 0}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => viewSubs(f.id)}>
                        Başvurular
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedId != null && (
        <div className="wam-panel">
          <div className="wam-panel-header">
            <div>
              <h3>Başvurular</h3>
              <p>{selectedForm ? selectedForm.name : 'Seçili form'}</p>
            </div>
          </div>
          <div className="wam-panel-body" style={{ padding: 0 }}>
            {subs.length === 0 ? (
              <div className="wam-empty">Başvuru yok</div>
            ) : (
              <table className="cms-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tarih</th>
                    <th>Gönderilen Bilgiler</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {s.created_at ? new Date(s.created_at).toLocaleString('tr-TR') : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>{formatPayload(s.payload)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
