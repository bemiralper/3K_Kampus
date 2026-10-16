'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  createProgram,
  fetchHakedis,
  fetchOturumlar,
  fetchProgramlar,
  resolveDersLabel,
  syncProgramlar,
  type BirebirProgram,
  type PaketDersi,
} from '@/lib/ozel-ders-api';
import { searchKutuphaneStudents, type KutuphaneStudentOption } from '@/lib/kutuphane-student-search';
import { trIncludes } from '@/lib/text-format';
import { akademikTabHref } from '@/lib/akademik-routes';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import {
  Badge,
  Drawer,
  EmptyState,
  avatarGradient,
  initials,
  formatCurrency,
} from './ozelDersUi';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconChevronRight,
  IconClose,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUsers,
} from './icons';
import './ozel-ders.css';
import './ogrenci-programlari.css';

dayjs.locale('tr');

type DashboardStats = {
  todaySessions: number;
  pendingAttendance: number;
  todayEarnings: number;
  activeStudents: number;
  activeTeachers: number;
  weekSessions: number;
  pendingTelafi: number;
  premiumPackages: number;
};

type StudentProgramGroup = {
  ogrenci: number;
  ogrenci_ad: string;
  programs: BirebirProgram[];
  primary: BirebirProgram;
  paketAds: string[];
  paketDersleri: PaketDersi[];
  slotCount: number;
  expectedHaftalik: number;
  needsSablon: boolean;
  durum: string;
  durum_display: string;
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
  notlar: string;
};

function mergePaketDersleri(programs: BirebirProgram[]): PaketDersi[] {
  const map = new Map<number, PaketDersi>();
  for (const p of programs) {
    for (const d of p.paket_dersleri || []) {
      const prev = map.get(d.id);
      if (!prev) {
        map.set(d.id, { ...d });
      } else if ((d.haftalik_adet || 0) > (prev.haftalik_adet || 0)) {
        map.set(d.id, { ...prev, haftalik_adet: d.haftalik_adet });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

function groupProgramsByStudent(programs: BirebirProgram[]): StudentProgramGroup[] {
  const byStudent = new Map<number, BirebirProgram[]>();
  for (const p of programs) {
    const list = byStudent.get(p.ogrenci) || [];
    list.push(p);
    byStudent.set(p.ogrenci, list);
  }
  const groups: StudentProgramGroup[] = [];
  for (const [, list] of byStudent) {
    const sorted = [...list].sort((a, b) => {
      if (a.durum !== b.durum) return a.durum === 'AKTIF' ? -1 : 1;
      return (b.slot_count || 0) - (a.slot_count || 0);
    });
    const primary = sorted[0];
    const paketAds = Array.from(
      new Set(
        sorted
          .map((p) => p.premium_paket_ad || p.ozel_ders_paket_ad)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const hasAktif = sorted.some((p) => p.durum === 'AKTIF');
    const paketDersleri = mergePaketDersleri(sorted);
    const kotaToplam = paketDersleri.reduce((s, d) => s + (d.haftalik_adet || 0), 0);
    const expectedHaftalik = kotaToplam > 0 ? kotaToplam : paketDersleri.length;
    const slotCount = sorted.reduce((s, p) => s + (p.slot_count || 0), 0);
    groups.push({
      ogrenci: primary.ogrenci,
      ogrenci_ad: primary.ogrenci_ad,
      programs: sorted,
      primary,
      paketAds,
      paketDersleri,
      slotCount,
      expectedHaftalik,
      needsSablon: slotCount === 0 || (expectedHaftalik > 0 && slotCount < expectedHaftalik),
      durum: hasAktif ? 'AKTIF' : primary.durum,
      durum_display: hasAktif ? 'Aktif' : primary.durum_display,
      baslangic_tarihi: sorted.map((p) => p.baslangic_tarihi).sort()[0],
      bitis_tarihi: sorted.every((p) => p.bitis_tarihi)
        ? sorted.map((p) => p.bitis_tarihi!).sort().slice(-1)[0]
        : null,
      notlar: sorted.map((p) => p.notlar).filter(Boolean).join(' · '),
    });
  }
  return groups.sort((a, b) => (a.ogrenci_ad || '').localeCompare(b.ogrenci_ad || '', 'tr'));
}

function formatPeriod(start: string, end: string | null) {
  const s = dayjs(start);
  if (!s.isValid()) return start || '—';
  const left = s.format('D MMM YYYY');
  if (!end) return `${left} · süresiz`;
  const e = dayjs(end);
  return e.isValid() ? `${left} – ${e.format('D MMM YYYY')}` : left;
}

type CardTag = {
  key: string;
  label: string;
  kind: 'pack' | 'ders';
  count: number;
};

function foldLabel(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

/** Sınav öneki, paket soneki ve -1/-2 düzeyini atar; "Fizik" ile "Fizik-1" aynı ders sayılır. */
function subjectKey(value: string) {
  return foldLabel(value)
    .replace(/^(tyt|ayt|ydt|lgs|kpss)\s+/, '')
    .replace(/\s+(premium\s+)?(paketi|paket)$/i, '')
    .replace(/\s+(özel ders|ozel ders)$/i, '')
    .replace(/[-–]\s*\d+$/, '')
    .replace(/\s+\d+$/, '')
    .trim();
}

function buildCardTags(group: StudentProgramGroup, useKisaAd: boolean): CardTag[] {
  const courses: CardTag[] = [];
  const byLabel = new Map<string, CardTag>();
  for (const ders of group.paketDersleri) {
    const label = resolveDersLabel(ders, useKisaAd).trim();
    if (!label || label === '—') continue;
    const key = foldLabel(label);
    const add = ders.haftalik_adet || 0;
    const prev = byLabel.get(key);
    if (prev) {
      prev.count += add;
      continue;
    }
    const tag: CardTag = { key, label, kind: 'ders', count: add };
    byLabel.set(key, tag);
    courses.push(tag);
  }

  const courseSubjects = new Set(courses.map((tag) => subjectKey(tag.label)));
  const packs: CardTag[] = [];
  const seenPacks = new Set<string>();
  for (const ad of group.paketAds) {
    const label = ad.trim();
    const key = foldLabel(label);
    if (!label || !key || seenPacks.has(key) || courseSubjects.has(subjectKey(label))) continue;
    seenPacks.add(key);
    packs.push({ key: `pack:${key}`, label, kind: 'pack', count: 0 });
  }

  return [...packs, ...courses];
}

export default function OgrenciProgramlariClient() {
  const router = useRouter();
  const { ready, egitimYiliId, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const [rows, setRows] = useState<BirebirProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [durumFilter, setDurumFilter] = useState<'AKTIF' | 'PASIF' | ''>('AKTIF');
  const [onlyNeedsSablon, setOnlyNeedsSablon] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Yeni Program Drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [studentQ, setStudentQ] = useState('');
  const [students, setStudents] = useState<KutuphaneStudentOption[]>([]);
  const [form, setForm] = useState({
    ogrenci_id: '',
    ogrenci_ad: '',
    baslangic_tarihi: dayjs().format('YYYY-MM-DD'),
    bitis_tarihi: '',
    notlar: '',
  });
  const [saving, setSaving] = useState(false);
  const didAutoSync = useRef(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchProgramlar({
        egitim_yili_id: egitimYiliId || undefined,
        durum: durumFilter || undefined,
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [ready, egitimYiliId, durumFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadStats = useCallback(async () => {
    if (!ready) return;
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const wStart = dayjs().startOf('week').format('YYYY-MM-DD');
      const wEnd = dayjs().endOf('week').format('YYYY-MM-DD');
      const [activePrograms, todayOturumlar, wOturumlar, telafiPending, hakedisMonth] =
        await Promise.all([
          fetchProgramlar({ egitim_yili_id: egitimYiliId || undefined, durum: 'AKTIF' }),
          fetchOturumlar({ start_date: today, end_date: today, skip_materialize: 1 }),
          fetchOturumlar({ start_date: wStart, end_date: wEnd, skip_materialize: 1 }),
          fetchOturumlar({
            telafi_durumu: 'BEKLENIYOR',
            start_date: dayjs().subtract(60, 'day').format('YYYY-MM-DD'),
            end_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
            skip_materialize: 1,
          }),
          fetchHakedis({ yil: dayjs().year(), ay: dayjs().month() + 1 }),
        ]);

      const teacherSet = new Set(wOturumlar.map((o) => o.ogretmen_ad).filter(Boolean));
      const premiumSet = new Set(
        activePrograms.map((p) => p.premium_paket).filter((v): v is number => v != null),
      );
      const todayEarnings = hakedisMonth
        .filter((h) => h.tarih === today)
        .reduce((sum, h) => sum + (h.tutar || 0), 0);

      setStats({
        todaySessions: todayOturumlar.length,
        pendingAttendance: todayOturumlar.filter((o) => o.durum === 'PLANLANDI').length,
        todayEarnings,
        activeStudents: new Set(activePrograms.map((p) => p.ogrenci)).size,
        activeTeachers: teacherSet.size,
        weekSessions: wOturumlar.length,
        pendingTelafi: telafiPending.length,
        premiumPackages: premiumSet.size,
      });
    } catch {
      /* opsiyonel */
    }
  }, [ready, egitimYiliId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!ready || didAutoSync.current) return;
    didAutoSync.current = true;
    let cancelled = false;
    (async () => {
      try {
        const r = await syncProgramlar(egitimYiliId);
        if (cancelled) return;
        if ((r.created || 0) + (r.updated || 0) > 0) {
          show(`Program senkronu: ${r.created} yeni, ${r.updated} güncellendi.`);
          await load();
          await loadStats();
        }
      } catch {
        /* opsiyonel */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, egitimYiliId, load, loadStats, show]);

  useEffect(() => {
    if (studentQ.trim().length < 2) {
      setStudents([]);
      return;
    }
    const t = setTimeout(() => {
      searchKutuphaneStudents(studentQ).then(setStudents).catch(() => setStudents([]));
    }, 250);
    return () => clearTimeout(t);
  }, [studentQ]);

  const allGroups = useMemo(() => groupProgramsByStudent(rows), [rows]);

  const studentGroups = useMemo(() => {
    const q = search.trim();
    let groups = allGroups;
    if (q) {
      groups = groups.filter((g) => {
        const haystack = [
          g.ogrenci_ad,
          g.notlar,
          ...g.paketAds,
          ...g.paketDersleri.map((d) => resolveDersLabel(d, useKisaAd)),
          ...g.paketDersleri.map((d) => d.ad),
        ]
          .filter(Boolean)
          .join(' ');
        return trIncludes(haystack, q);
      });
    }
    if (onlyNeedsSablon) {
      groups = groups.filter((g) => g.needsSablon);
    }
    return groups;
  }, [allGroups, search, useKisaAd, onlyNeedsSablon]);

  const needsSablonCount = useMemo(
    () => allGroups.filter((g) => g.needsSablon).length,
    [allGroups],
  );

  function openStudentProgram(ogrenciId: number) {
    router.push(
      `${akademikTabHref('ozel-ders-yonetimi', 'ogrenci-ozel-ders')}?ogrenci_id=${ogrenciId}`,
    );
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ogrenci_id) return;
    setSaving(true);
    try {
      await createProgram({
        ogrenci_id: Number(form.ogrenci_id),
        egitim_yili_id: egitimYiliId,
        baslangic_tarihi: form.baslangic_tarihi,
        bitis_tarihi: form.bitis_tarihi || null,
        notlar: form.notlar,
      });
      setCreateOpen(false);
      setForm({
        ogrenci_id: '',
        ogrenci_ad: '',
        baslangic_tarihi: dayjs().format('YYYY-MM-DD'),
        bitis_tarihi: '',
        notlar: '',
      });
      setStudentQ('');
      show('Program oluşturuldu.');
      await load();
      await loadStats();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Kayıt başarısız', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onSync() {
    setSyncing(true);
    try {
      const r = await syncProgramlar(egitimYiliId);
      show(`Senkron: ${r.created} yeni, ${r.updated} güncellendi, ${r.skipped} atlandı.`);
      await load();
      await loadStats();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Senkron başarısız', 'error');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="od-scope">
      {toastNode}

      <div className="op-hub">
        {/* 1. Üst Komut, Canlı Özet ve Arama Barı */}
        <section className="op-bar" aria-label="Özet ve filtreler">
          <div className="op-bar-top">
            <div className="op-stats-row">
              <button
                type="button"
                className={`op-stat-pill${needsSablonCount > 0 ? ' is-warn' : ''}${onlyNeedsSablon ? ' is-on' : ''}`}
                onClick={() => setOnlyNeedsSablon((v) => !v)}
                aria-pressed={onlyNeedsSablon}
              >
                <IconAlertTriangle size={14} />
                Eksik atama <strong>{needsSablonCount}</strong>
              </button>
              {stats && (
                <>
                  <span className="op-stat-pill">
                    Bugün <strong>{stats.todaySessions}</strong> ders
                  </span>
                  <span className={`op-stat-pill${stats.pendingAttendance > 0 ? ' is-warn' : ''}`}>
                    Yoklama <strong>{stats.pendingAttendance}</strong>
                  </span>
                  <span className="op-stat-pill">
                    Bu hafta <strong>{stats.weekSessions}</strong>
                  </span>
                  <span className="op-stat-pill">
                    Öğretmen <strong>{stats.activeTeachers}</strong>
                  </span>
                  {stats.pendingTelafi > 0 && (
                    <span className="op-stat-pill is-warn">
                      Telafi <strong>{stats.pendingTelafi}</strong>
                    </span>
                  )}
                  {stats.todayEarnings > 0 && (
                    <span className="op-stat-pill">
                      Hakediş <strong>{formatCurrency(stats.todayEarnings)}</strong>
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="op-actions">
              <button
                type="button"
                className="op-btn"
                onClick={() => setUseKisaAd(!useKisaAd)}
                aria-pressed={useKisaAd}
              >
                {useKisaAd ? 'Kısa ad' : 'Uzun ad'}
              </button>
              <button
                type="button"
                className="op-btn"
                onClick={onSync}
                disabled={syncing || !ready}
              >
                <IconRefresh size={14} /> {syncing ? 'Senkron…' : 'Senkronize et'}
              </button>
              <button
                type="button"
                className="op-btn op-btn-primary"
                onClick={() => setCreateOpen(true)}
              >
                <IconPlus size={15} /> Yeni Program
              </button>
            </div>
          </div>

          <div className="op-bar-filters">
            <div className="op-search">
              <IconSearch size={16} />
              <input
                type="text"
                placeholder="Öğrenci adı, paket veya ders ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Öğrenci adı, paket veya ders ara"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Aramayı temizle">
                  <IconClose size={14} />
                </button>
              )}
            </div>

            <div className="op-filter-right">
              <div className="op-segmented" role="tablist" aria-label="Durum filtresi">
                {(
                  [
                    { v: 'AKTIF', l: 'Aktif' },
                    { v: 'PASIF', l: 'Pasif' },
                    { v: '', l: 'Tümü' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    className={durumFilter === o.v ? 'is-on' : ''}
                    onClick={() => setDurumFilter(o.v)}
                  >
                    {o.l}
                  </button>
                ))}
              </div>

              <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>
                {studentGroups.length} öğrenci
              </span>
            </div>
          </div>
        </section>

        {(error || metaError) && <div className="od-banner-error">{error || metaError}</div>}

        {/* 2. Öğrenci Kartları Izgarası */}
        {!ready || loading ? (
          <div className="op-grid" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="op-student-card">
                <div className="op-card-head">
                  <div className="op-card-who">
                    <span className="od-skeleton" style={{ width: 42, height: 42, borderRadius: 12 }} />
                    <div>
                      <span className="od-skeleton" style={{ display: 'block', width: 130, height: 14, borderRadius: 6 }} />
                      <span className="od-skeleton" style={{ display: 'block', width: 90, height: 11, borderRadius: 6, marginTop: 6 }} />
                    </div>
                  </div>
                </div>
                <span className="od-skeleton" style={{ width: '100%', height: 26, borderRadius: 8 }} />
              </div>
            ))}
          </div>
        ) : studentGroups.length === 0 ? (
          <EmptyState
            icon={<IconUsers size={24} />}
            title={search || onlyNeedsSablon ? 'Eşleşen öğrenci bulunamadı' : 'Henüz program yok'}
            description={
              search || onlyNeedsSablon
                ? 'Aramayı veya eksik atama filtresini temizleyerek tüm öğrencileri görebilirsiniz.'
                : 'Kayıt veya sözleşmeden özel ders tanımlandıysa Senkronize et ile programları oluşturun.'
            }
            action={
              search || onlyNeedsSablon ? (
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    setSearch('');
                    setOnlyNeedsSablon(false);
                  }}
                >
                  Filtreleri Temizle
                </button>
              ) : (
                <button type="button" className="op-btn op-btn-primary" onClick={onSync}>
                  <IconRefresh size={14} /> Senkronize et
                </button>
              )
            }
          />
        ) : (
          <div className="op-grid">
            {studentGroups.map((g) => {
              const tags = buildCardTags(g, useKisaAd);
              const visibleTags = tags.slice(0, 4);
              const extraCount = tags.length - visibleTags.length;
              return (
                <button
                  key={g.ogrenci}
                  type="button"
                  className={`op-student-card${g.needsSablon ? ' is-gap' : ''}`}
                  onClick={() => openStudentProgram(g.ogrenci)}
                >
                  <div className="op-card-head">
                    <div className="op-card-who">
                      <span
                        className="op-avatar"
                        style={{ background: avatarGradient(g.ogrenci) }}
                        aria-hidden
                      >
                        {initials(g.ogrenci_ad)}
                      </span>
                      <div>
                        <span className="op-name">{g.ogrenci_ad || `Öğrenci #${g.ogrenci}`}</span>
                        <span className="op-sub">
                          {formatPeriod(g.baslangic_tarihi, g.bitis_tarihi)}
                        </span>
                      </div>
                    </div>

                    <span className="op-quota-badge">
                      {g.expectedHaftalik > 0
                        ? `${g.slotCount} / ${g.expectedHaftalik} ders`
                        : `${g.slotCount} ders`}
                    </span>
                  </div>

                  {visibleTags.length > 0 && (
                    <div className="op-card-tags">
                      {visibleTags.map((tag) => (
                        <span key={tag.key} className={tag.kind === 'pack' ? 'op-tag-pack' : 'op-tag-ders'}>
                          {tag.label}
                          {tag.count > 0 ? ` ×${tag.count}` : ''}
                        </span>
                      ))}
                      {extraCount > 0 && <span className="op-tag-ders">+{extraCount}</span>}
                    </div>
                  )}

                  <div className="op-card-foot">
                    <span>
                      {g.slotCount === 0
                        ? 'Öğretmen ve saat atanmadı'
                        : g.needsSablon
                          ? `${Math.max(g.expectedHaftalik - g.slotCount, 0)} ders ataması eksik`
                          : 'Haftalık program hazır'}
                    </span>
                    <span className="op-card-cta">
                      Programı Aç <IconChevronRight size={15} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Yeni Program Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Öğrenci Programı"
        description="Özel ders / premium paket öğrencisi için birebir program başlatın."
        footer={
          <>
            <button type="button" className="od-btn od-btn-secondary" onClick={() => setCreateOpen(false)}>
              Vazgeç
            </button>
            <button type="submit" form="od-create-program-form" className="od-btn od-btn-primary" disabled={saving || !form.ogrenci_id}>
              {saving ? 'Kaydediliyor…' : 'Programı Oluştur'}
            </button>
          </>
        }
      >
        <form id="od-create-program-form" className="od-form" onSubmit={onCreate}>
          <div className="od-form-group">
            <label>
              Öğrenci <span className="req">*</span>
            </label>
            <input
              autoFocus
              placeholder="Ad soyad ile arayın (en az 2 karakter)"
              value={studentQ}
              onChange={(e) => setStudentQ(e.target.value)}
            />
          </div>
          {students.length > 0 && (
            <div className="od-panel-list">
              {students.map((s) => (
                <div
                  key={s.id}
                  className="od-panel-list-item"
                  style={{
                    cursor: 'pointer',
                    background: String(form.ogrenci_id) === String(s.id) ? '#e8f4ff' : undefined,
                  }}
                  onClick={() => {
                    setForm((f) => ({ ...f, ogrenci_id: String(s.id), ogrenci_ad: s.tam_ad || `${s.ad} ${s.soyad}` }));
                    setStudentQ(s.tam_ad || `${s.ad} ${s.soyad}`);
                    setStudents([]);
                  }}
                >
                  <span>{s.tam_ad || `${s.ad} ${s.soyad}`}</span>
                  {s.sinif_ad && <Badge tone="secondary">{s.sinif_ad}</Badge>}
                </div>
              ))}
            </div>
          )}
          {form.ogrenci_id && (
            <div className="od-banner-success">
              <IconCheckCircle size={15} /> Seçildi: {form.ogrenci_ad}
            </div>
          )}

          <div className="od-form-row">
            <div className="od-form-group">
              <label>
                Başlangıç <span className="req">*</span>
              </label>
              <input
                type="date"
                required
                value={form.baslangic_tarihi}
                onChange={(e) => setForm((f) => ({ ...f, baslangic_tarihi: e.target.value }))}
              />
            </div>
            <div className="od-form-group">
              <label>Bitiş</label>
              <input
                type="date"
                value={form.bitis_tarihi}
                onChange={(e) => setForm((f) => ({ ...f, bitis_tarihi: e.target.value }))}
              />
              <span className="od-form-hint">Boş bırakılırsa süresiz kabul edilir.</span>
            </div>
          </div>

          <div className="od-form-group">
            <label>Notlar</label>
            <textarea
              placeholder="Program hakkında serbest not…"
              value={form.notlar}
              onChange={(e) => setForm((f) => ({ ...f, notlar: e.target.value }))}
            />
          </div>
        </form>
      </Drawer>
    </div>
  );
}
