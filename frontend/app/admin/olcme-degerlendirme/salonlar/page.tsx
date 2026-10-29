'use client';

import { useEffect, useMemo, useState } from 'react';
import { examApi } from '@/components/olcme/api';
import type { DenemeSalon } from '@/components/olcme/types';
import Icon from '@/components/olcme/ui/Icon';
import { formatInactiveSeats, parseInactiveSeats, seatNumbers } from '@/components/olcme/roster/seating';
import { trFold } from '@/lib/text-format';
import s from './salonlar.module.css';
import TanimlarTabs from '@/components/olcme/TanimlarTabs';

function places(capacity: number, inactive: number[] | undefined) {
  return seatNumbers({ capacity, inactive_seats: inactive }).length;
}

export default function SinavSalonlariPage() {
  const [salonlar, setSalonlar] = useState<DenemeSalon[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    examApi.denemeSalonlari()
      .then(setSalonlar)
      .catch(err => setError(err instanceof Error ? err.message : 'Salonlar yüklenemedi.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => {
    const seats = salonlar.reduce((sum, row) => sum + places(row.capacity, row.inactive_seats), 0);
    const passive = salonlar.filter(row => (row.inactive_seats || []).length > 0).length;
    return { count: salonlar.length, seats, passive };
  }, [salonlar]);

  const visible = useMemo(() => {
    const query = trFold(q.trim());
    if (!query) return salonlar;
    return salonlar.filter(row => trFold(row.name).includes(query));
  }, [salonlar, q]);

  const sortIn = (row: DenemeSalon) => {
    setSalonlar(prev => [...prev.filter(item => item.id !== row.id), row].sort(
      (a, b) => a.name.localeCompare(b.name, 'tr'),
    ));
    setError('');
  };

  return (
    <div className={s.page}>
      <TanimlarTabs />
      {toast && <div className={s.toast} role="status">{toast}</div>}

      <header className={s.header}>
        <div className={s.headerTop}>
          <div className={s.titleBlock}>
            <span className={s.titleIcon}><Icon name="building" size={22} /></span>
            <div>
              <h1 className={s.title}>Sınav salonları</h1>
              <p className={s.subtitle}>
                Salonları sınav açmadan önce tanımlayın. Aynı salon, günü veya saati çakışmayan denemelerde yeniden kullanılır.
              </p>
            </div>
          </div>
        </div>
        <div className={s.metrics}>
          <div className={s.metric}>
            <span className={s.metricValue}>{loading ? '—' : stats.count}</span>
            <span className={s.metricLabel}>Kayıtlı salon</span>
          </div>
          <div className={s.metric}>
            <span className={s.metricValue}>{loading ? '—' : stats.seats}</span>
            <span className={s.metricLabel}>Kullanılabilir yer</span>
          </div>
          <div className={s.metric}>
            <span className={s.metricValue}>{loading ? '—' : stats.passive}</span>
            <span className={s.metricLabel}>Pasif sırası olan</span>
          </div>
        </div>
      </header>

      {error && <div className={s.error} role="alert">{error}</div>}

      <NewSalonCard
        onCreated={row => {
          sortIn(row);
          setToast(`${row.name} kaydedildi.`);
        }}
        onError={setError}
      />

      <section className={s.card}>
        <div className={s.cardHead}>
          <div>
            <h2>Kayıtlı salonlar</h2>
            <p>Ad, kapasite ve pasif sıralar değişince Güncelle. Sil, eski sınavlardaki salonu durdurmaz.</p>
          </div>
          <span className={s.count}>
            {q.trim() && visible.length !== salonlar.length
              ? `${visible.length} / ${salonlar.length}`
              : `${salonlar.length} salon`}
          </span>
        </div>

        <div className={s.toolbar}>
          <div className={s.searchBox}>
            <Icon name="search" size={14} className={s.searchIcon} />
            <input
              className={s.searchInput}
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Salon ara"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape' && q) setQ(''); }}
              aria-label="Salon ara"
            />
            {q && (
              <button type="button" className={s.searchClear} onClick={() => setQ('')} aria-label="Aramayı temizle">
                <Icon name="close" size={13} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className={s.loading}>Yükleniyor…</div>
        ) : salonlar.length === 0 ? (
          <div className={s.empty}>
            <b>Henüz salon yok</b>
            Yukarıdan ad ve kapasite yazıp oluşturun.
          </div>
        ) : visible.length === 0 ? (
          <div className={s.empty}>
            Aramaya uyan salon yok.
            <button type="button" className={s.emptyClear} onClick={() => setQ('')}>Aramayı temizle</button>
          </div>
        ) : (
          <div className={s.grid}>
            {visible.map(salon => (
              <SalonCard
                key={salon.id}
                salon={salon}
                onSaved={row => {
                  sortIn(row);
                  setToast(`${row.name} güncellendi.`);
                }}
                onDeleted={id => {
                  setSalonlar(prev => prev.filter(item => item.id !== id));
                  setError('');
                  setToast('Salon listeden silindi.');
                }}
                onError={setError}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NewSalonCard({
  onCreated,
  onError,
}: {
  onCreated: (row: DenemeSalon) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('130');
  const [passive, setPassive] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const nextName = name.trim();
    if (!nextName) {
      onError('Salon adı yazın.');
      return;
    }
    setBusy(true);
    onError('');
    try {
      const saved = await examApi.saveDenemeSalon(
        nextName,
        Math.max(1, Number(capacity) || 1),
        parseInactiveSeats(passive),
      );
      setName('');
      setCapacity('130');
      setPassive('');
      onCreated(saved);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Salon kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <div>
          <h2>Yeni salon</h2>
          <p>Pasif sıralara öğrenci oturmaz. Örnek: 5, 12, 18-20.</p>
        </div>
      </div>
      <form
        className={s.create}
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <label className={s.field}>
          <span>Salon adı</span>
          <input
            aria-label="Yeni salon adı"
            placeholder="Örn. 3K Vizyon"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </label>
        <label className={s.field}>
          <span>Kapasite</span>
          <input
            aria-label="Yeni salon kapasitesi"
            type="number"
            min={1}
            inputMode="numeric"
            value={capacity}
            onChange={e => setCapacity(e.target.value)}
          />
        </label>
        <label className={s.field}>
          <span>Pasif sıralar</span>
          <input
            aria-label="Yeni salon pasif sıralar"
            placeholder="5, 12, 18-20"
            value={passive}
            onChange={e => setPassive(e.target.value)}
          />
        </label>
        <button type="submit" className={s.primary} disabled={busy}>
          <Icon name="plus" size={14} />
          {busy ? 'Kaydediliyor…' : 'Oluştur'}
        </button>
      </form>
    </section>
  );
}

function SalonCard({
  salon,
  onSaved,
  onDeleted,
  onError,
}: {
  salon: DenemeSalon;
  onSaved: (row: DenemeSalon) => void;
  onDeleted: (id: number) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(salon.name);
  const [capacity, setCapacity] = useState(String(salon.capacity));
  const [passive, setPassive] = useState(formatInactiveSeats(salon.inactive_seats));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    setName(salon.name);
    setCapacity(String(salon.capacity));
    setPassive(formatInactiveSeats(salon.inactive_seats));
  }, [salon]);

  const dirty = name.trim() !== salon.name
    || Number(capacity) !== salon.capacity
    || passive.trim() !== formatInactiveSeats(salon.inactive_seats);
  const usable = places(Math.max(0, Number(capacity) || 0), parseInactiveSeats(passive));

  const save = async () => {
    const nextName = name.trim();
    if (!nextName) {
      onError('Salon adı yazın.');
      return;
    }
    setBusy('save');
    onError('');
    try {
      const saved = await examApi.updateDenemeSalon(
        salon.id,
        nextName,
        Math.max(1, Number(capacity) || 1),
        parseInactiveSeats(passive),
      );
      setPassive(formatInactiveSeats(saved.inactive_seats));
      onSaved(saved);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Salon güncellenemedi.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`${salon.name} kayıtlı listeden silinsin mi? Eski sınavlardaki salon durur.`)) return;
    setBusy('delete');
    onError('');
    try {
      await examApi.deleteDenemeSalon(salon.id);
      onDeleted(salon.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Salon silinemedi.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={s.salon}>
      <div className={s.salonTop}>
        <strong>{name.trim() || 'Adsız salon'}</strong>
        <span>{usable} yer</span>
      </div>
      <label className={s.field}>
        <span>Salon adı</span>
        <input aria-label={`${salon.name} adı`} value={name} onChange={e => setName(e.target.value)} />
      </label>
      <div className={s.salonNums}>
        <label className={s.field}>
          <span>Kapasite</span>
          <input
            aria-label={`${salon.name} kapasitesi`}
            type="number"
            min={1}
            inputMode="numeric"
            value={capacity}
            onChange={e => setCapacity(e.target.value)}
          />
        </label>
        <label className={s.field}>
          <span>Pasif sıralar</span>
          <input
            aria-label={`${salon.name} pasif sıralar`}
            placeholder="5, 12, 18-20"
            value={passive}
            onChange={e => setPassive(e.target.value)}
          />
        </label>
      </div>
      <div className={s.salonActions}>
        <button type="button" className={dirty ? s.primary : s.secondary} disabled={busy != null} onClick={save}>
          {busy === 'save' ? 'Kaydediliyor…' : 'Güncelle'}
        </button>
        <button type="button" className={s.danger} disabled={busy != null} onClick={remove}>
          <Icon name="trash" size={14} />
          {busy === 'delete' ? '…' : 'Sil'}
        </button>
      </div>
    </article>
  );
}
