'use client';

import { useState } from 'react';
import type { LookupItem } from '../types';
import r from './roster.module.css';

type AudiencePickerProps = {
  sinifSeviyeleri: LookupItem[];
  siniflar: LookupItem[];
  denemePaketleri: LookupItem[];
  sinifSeviyesiIds: number[];
  sinifIds: number[];
  denemePaketiIds: number[];
  onToggleSeviye: (id: number) => void;
  onToggleSinif: (id: number) => void;
  onTogglePaket: (id: number) => void;
};

/** Sınav oluşturma «Kimler girecek» ve genel bilgiler düzenlemesi için ortak kitle seçici. */
export default function AudiencePicker({
  sinifSeviyeleri,
  siniflar,
  denemePaketleri,
  sinifSeviyesiIds,
  sinifIds,
  denemePaketiIds,
  onToggleSeviye,
  onToggleSinif,
  onTogglePaket,
}: AudiencePickerProps) {
  const [seviyeFilter, setSeviyeFilter] = useState<number | ''>('');
  const filteredSiniflar = seviyeFilter
    ? siniflar.filter(si => si.seviye_id === seviyeFilter)
    : siniflar;

  return (
    <div className={r.grid3}>
      <section className={r.card}>
        <div className={r.cardHead}>
          <div>
            <h3>Seviye</h3>
            <p>Sınıfsız kayıtlar da bu seviyeye yazılır.</p>
          </div>
        </div>
        <div className={r.cardBody}>
          {sinifSeviyeleri.length === 0 ? (
            <p className={r.meta}>Bu şubede tanımlı seviye yok.</p>
          ) : (
            <div className={r.choiceGrid}>
              {sinifSeviyeleri.map(sv => (
                <button
                  key={sv.id}
                  type="button"
                  className={sinifSeviyesiIds.includes(sv.id) ? r.choiceOn : r.choice}
                  onClick={() => onToggleSeviye(sv.id)}
                >
                  {sv.ad}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className={r.card}>
        <div className={r.cardHead}>
          <div>
            <h3>Sınıflar</h3>
            <p>Somut şube sınıfları.</p>
          </div>
        </div>
        <div className={r.cardBody}>
          {siniflar.length === 0 ? (
            <p className={r.meta}>Bu kurum için tanımlı sınıf bulunamadı.</p>
          ) : (
            <>
              <div className={r.filterRow}>
                <button
                  type="button"
                  className={seviyeFilter === '' ? r.filterOn : r.filter}
                  onClick={() => setSeviyeFilter('')}
                >
                  Tümü
                </button>
                {sinifSeviyeleri.map(sv => (
                  <button
                    key={sv.id}
                    type="button"
                    className={seviyeFilter === sv.id ? r.filterOn : r.filter}
                    onClick={() => setSeviyeFilter(sv.id)}
                  >
                    {sv.ad}
                  </button>
                ))}
              </div>
              <div className={r.choiceGrid}>
                {filteredSiniflar.map(si => (
                  <button
                    key={si.id}
                    type="button"
                    className={sinifIds.includes(si.id) ? r.choiceOn : r.choice}
                    onClick={() => onToggleSinif(si.id)}
                  >
                    {si.ad}
                  </button>
                ))}
                {filteredSiniflar.length === 0 && (
                  <p className={r.meta}>Bu seviyede sınıf yok.</p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
      <section className={r.card}>
        <div className={r.cardHead}>
          <div>
            <h3>Deneme paketi</h3>
            <p>Paketi olan öğrenciler (Deneme Kulübü dahil).</p>
          </div>
        </div>
        <div className={r.cardBody}>
          <div className={r.choiceGrid}>
            {denemePaketleri.map(p => (
              <button
                key={p.id}
                type="button"
                className={denemePaketiIds.includes(p.id) ? r.choiceOn : r.choice}
                onClick={() => onTogglePaket(p.id)}
              >
                {p.ad}
              </button>
            ))}
            {denemePaketleri.length === 0 && (
              <p className={r.meta}>Bu şubede tanımlı deneme paketi yok.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
