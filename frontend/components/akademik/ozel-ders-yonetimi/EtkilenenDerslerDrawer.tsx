'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  fetchEtkilenenDersler,
  type EtkilenenDers,
} from '@/lib/takvim-api';
import { akademikTabHref } from '@/lib/akademik-routes';
import { Badge, Drawer, EmptyState, SkeletonRows } from './ozelDersUi';
import { IconBookOpen } from './icons';

type Props = {
  open: boolean;
  date: string | null;
  title?: string;
  ozelDersAktif?: boolean;
  onClose: () => void;
};

export default function EtkilenenDerslerDrawer({
  open,
  date,
  title,
  ozelDersAktif,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EtkilenenDers[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchEtkilenenDersler(date)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data) {
          throw new Error(res.error || 'Yüklenemedi');
        }
        setItems(res.data.items || []);
      })
      .catch((e) => {
        if (!cancelled) {
          setItems([]);
          setError(e instanceof Error ? e.message : 'Yüklenemedi');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, date]);

  const oturumlarBase = akademikTabHref('ozel-ders-yonetimi', 'birebir-ders-oturumlari');
  const sablonBase = akademikTabHref('ozel-ders-yonetimi', 'haftalik-program-sablonlari');

  function hrefFor(item: EtkilenenDers): string {
    if (item.oturum_id) {
      return `${oturumlarBase}?date=${item.session_date}&oturum_id=${item.oturum_id}`;
    }
    if (item.program_id && item.ogrenci_id) {
      return `${sablonBase}?program_id=${item.program_id}&ogrenci_id=${item.ogrenci_id}`;
    }
    if (item.program_id) {
      return `${oturumlarBase}?date=${item.session_date}&program_id=${item.program_id}`;
    }
    return `${oturumlarBase}?date=${item.session_date}`;
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title={date ? dayjs(date).format('DD.MM.YYYY dddd') : 'Etkilenen dersler'}
      description={
        title
          ? `${title}${ozelDersAktif ? ' · özel ders devam' : ' · özel ders tatil'}`
          : 'Bu güne denk gelen planlanan ve mevcut özel dersler'
      }
    >
      {error && <div className="od-banner-error">{error}</div>}
      {loading ? (
        <SkeletonRows rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconBookOpen size={22} />}
          title="Etkilenen ders yok"
          description="Bu güne düşen aktif program slotu veya oturum bulunamadı."
        />
      ) : (
        <div className="od-table-scroll">
          <table className="od-table">
            <thead>
              <tr>
                <th>Saat</th>
                <th>Öğrenci</th>
                <th>Ders</th>
                <th>Öğretmen</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const key = item.oturum_id
                  ? `o-${item.oturum_id}`
                  : `s-${item.slot_id}-${item.program_id}`;
                return (
                  <tr key={key}>
                    <td className="od-cell-primary">
                      {item.start_time}–{item.end_time}
                    </td>
                    <td>{item.ogrenci_ad}</td>
                    <td>{item.ders_kisa_ad || item.ders_ad}</td>
                    <td>{item.ogretmen_ad}</td>
                    <td>
                      {item.kind === 'oturum' ? (
                        <Badge tone={item.durum === 'IPTAL' ? 'secondary' : 'success'}>
                          {item.durum_display || item.durum || 'Oturum'}
                        </Badge>
                      ) : (
                        <Badge tone="secondary">Planlanan</Badge>
                      )}
                    </td>
                    <td>
                      <a className="od-btn od-btn-sm od-btn-secondary" href={hrefFor(item)}>
                        {item.oturum_id ? 'Oturuma git' : 'Programa git'}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
