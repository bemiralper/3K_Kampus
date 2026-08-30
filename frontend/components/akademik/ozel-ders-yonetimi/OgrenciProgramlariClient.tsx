'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
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
import { akademikTabHref } from '@/lib/akademik-routes';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import {
  Badge,
  Drawer,
  EmptyState,
  MiniProgress,
  PageHeader,
  Segmented,
  SkeletonCards,
  StatCard,
  StatGrid,
  StatSkeleton,
  avatarGradient,
  initials,
  formatCurrency,
} from './ozelDersUi';
import {
  IconAlertTriangle,
  IconAward,
  IconBookOpen,
  IconCheckCircle,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconRefresh,
  IconRotateCcw,
  IconSearch,
  IconStar,
  IconUser,
  IconUsers,
  IconWallet,
} from './icons';
import './ozel-ders.css';

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

/** Aynı öğrencinin birden fazla programını tek kartta toplar */
type StudentProgramGroup = {
  ogrenci: number;
  ogrenci_ad: string;
  programs: BirebirProgram[];
  primary: BirebirProgram;
  paketAds: string[];
  paketDersleri: PaketDersi[];
  slotCount: number;
  /** Premium kota toplamı; yoksa paket ders adedi */
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

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

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
  const [sortBy, setSortBy] = useState<'ad' | 'eksik'>('ad');
  const [onlyNeedsSablon, setOnlyNeedsSablon] = useState(false);
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
    setStatsLoading(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const weekStart = dayjs().startOf('week').format('YYYY-MM-DD');
      const weekEnd = dayjs().endOf('week').format('YYYY-MM-DD');
      const [activePrograms, todayOturumlar, weekOturumlar, telafiPending, hakedisMonth] =
        await Promise.all([
          fetchProgramlar({ egitim_yili_id: egitimYiliId || undefined, durum: 'AKTIF' }),
          fetchOturumlar({ start_date: today, end_date: today, skip_materialize: 1 }),
          fetchOturumlar({ start_date: weekStart, end_date: weekEnd, skip_materialize: 1 }),
          fetchOturumlar({
            telafi_durumu: 'BEKLENIYOR',
            start_date: dayjs().subtract(60, 'day').format('YYYY-MM-DD'),
            end_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
            skip_materialize: 1,
          }),
          fetchHakedis({ yil: dayjs().year(), ay: dayjs().month() + 1 }),
        ]);

      const teacherSet = new Set(weekOturumlar.map((o) => o.ogretmen_ad).filter(Boolean));
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
        weekSessions: weekOturumlar.length,
        pendingTelafi: telafiPending.length,
        premiumPackages: premiumSet.size,
      });
    } catch {
      // Dashboard istatistikleri opsiyoneldir; sessiz geç.
    } finally {
      setStatsLoading(false);
    }
  }, [ready, egitimYiliId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Sayfa açılışında kayıt/sözleşmeden eksik programları sessizce senkronize et
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
        /* otomatik senkron opsiyonel */
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

  const studentGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    let groups = groupProgramsByStudent(rows);
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
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    if (onlyNeedsSablon) {
      groups = groups.filter((g) => g.needsSablon);
    }
    if (sortBy === 'eksik') {
      groups = [...groups].sort((a, b) => {
        if (a.needsSablon !== b.needsSablon) return a.needsSablon ? -1 : 1;
        return (a.ogrenci_ad || '').localeCompare(b.ogrenci_ad || '', 'tr');
      });
    }
    return groups;
  }, [rows, search, useKisaAd, onlyNeedsSablon, sortBy]);

  const needsSablonCount = useMemo(
    () => groupProgramsByStudent(rows).filter((g) => g.needsSablon).length,
    [rows],
  );

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

      <PageHeader
        icon={<IconUsers size={19} />}
        title="Öğrenci Programları"
        description="Kayıt ve sözleşmeden gelen özel ders / premium öğrenciler. Karta tıklayarak öğrencinin özel ders operasyon ekranını açın."
        actions={
          <>
            <button type="button" className="od-btn od-btn-secondary" onClick={onSync} disabled={syncing || !ready}>
              <IconRefresh size={15} /> {syncing ? 'Senkron…' : 'Senkronize et'}
            </button>
            <button type="button" className="od-btn od-btn-primary" onClick={() => setCreateOpen(true)}>
              <IconPlus size={15} /> Yeni Program
            </button>
          </>
        }
      />

      {(error || metaError) && <div className="od-banner-error">{error || metaError}</div>}

      {statsLoading && !stats ? (
        <StatSkeleton count={8} />
      ) : stats ? (
        <StatGrid>
          <StatCard icon={<IconCalendar size={19} />} tone="blue" value={stats.todaySessions} label="Bugünkü Ders" />
          <StatCard
            icon={<IconClock size={19} />}
            tone={stats.pendingAttendance > 0 ? 'orange' : 'slate'}
            value={stats.pendingAttendance}
            label="Bekleyen Yoklama"
          />
          <StatCard icon={<IconWallet size={19} />} tone="green" value={formatCurrency(stats.todayEarnings)} label="Bugünkü Hakediş" />
          <StatCard icon={<IconUser size={19} />} tone="purple" value={stats.activeStudents} label="Aktif Öğrenci" />
          <StatCard icon={<IconAward size={19} />} tone="teal" value={stats.activeTeachers} label="Aktif Öğretmen" />
          <StatCard icon={<IconBookOpen size={19} />} tone="blue" value={stats.weekSessions} label="Bu Hafta Ders" />
          <StatCard
            icon={<IconRotateCcw size={19} />}
            tone={stats.pendingTelafi > 0 ? 'red' : 'slate'}
            value={stats.pendingTelafi}
            label="Telafi Bekleyen"
          />
          <StatCard icon={<IconStar size={19} />} tone="pink" value={stats.premiumPackages} label="Premium Paket" />
        </StatGrid>
      ) : null}

      <div className="od-toolbar">
        <div className="od-search">
          <IconSearch size={16} />
          <input
            placeholder="Öğrenci, paket veya not ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Segmented
          options={[
            { value: 'AKTIF', label: 'Aktif' },
            { value: 'PASIF', label: 'Pasif' },
            { value: '', label: 'Tümü' },
          ]}
          value={durumFilter}
          onChange={setDurumFilter}
        />
        <Segmented
          options={[
            { value: 'ad', label: 'Ada Göre' },
            { value: 'eksik', label: 'Önce Eksik Atama' },
          ]}
          value={sortBy}
          onChange={setSortBy}
        />
        <button
          type="button"
          className={`od-btn od-btn-secondary od-btn-sm${onlyNeedsSablon ? ' is-active-pref' : ''}`}
          onClick={() => setOnlyNeedsSablon((v) => !v)}
          title="Sadece öğretmen/saat ataması eksik olan öğrencileri göster"
          aria-pressed={onlyNeedsSablon}
        >
          <IconAlertTriangle size={13} /> Eksik atama {needsSablonCount > 0 ? `(${needsSablonCount})` : ''}
        </button>
        <div className="od-toolbar-spacer" />
        <span className="od-cell-muted">{studentGroups.length} öğrenci</span>
        <button
          type="button"
          className="od-btn od-btn-secondary od-btn-icon"
          onClick={() => { load(); loadStats(); }}
          disabled={loading}
          title="Listeyi yenile"
        >
          <IconRefresh size={15} />
        </button>
        <button
          type="button"
          className={`od-btn od-btn-secondary od-btn-sm${useKisaAd ? ' is-active-pref' : ''}`}
          onClick={() => setUseKisaAd(!useKisaAd)}
          title="Kısa ad göster (Fizik-1 → Fizik; tanımlı kisa_ad varsa o kullanılır)"
          aria-pressed={useKisaAd}
        >
          {useKisaAd ? 'Kısa ad' : 'Uzun ad'}
        </button>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : studentGroups.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={24} />}
          title={search ? 'Aramanızla eşleşen öğrenci yok' : 'Henüz program yok'}
          description={
            search
              ? 'Farklı bir arama terimi deneyin veya filtreleri temizleyin.'
              : 'Kayıt veya sözleşmeden özel ders / premium paket geldiyse Senkronize et ile programlar oluşur.'
          }
          action={
            !search && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" className="od-btn od-btn-primary" onClick={onSync} disabled={syncing}>
                  <IconRefresh size={15} /> Senkronize et
                </button>
                <button type="button" className="od-btn od-btn-secondary" onClick={() => setCreateOpen(true)}>
                  <IconPlus size={15} /> Yeni Program
                </button>
              </div>
            )
          }
        />
      ) : (
        <div className="od-grid-cards">
          {studentGroups.map((g) => (
            <div
              key={g.ogrenci}
              className={`od-entity-card${g.needsSablon ? ' needs-attention' : ''}`}
              onClick={() => {
                const href = `${akademikTabHref('ozel-ders-yonetimi', 'ogrenci-ozel-ders')}?ogrenci_id=${g.ogrenci}`;
                router.push(href);
              }}
            >
              <div className="od-entity-card-top">
                <div className="od-avatar" style={{ background: avatarGradient(g.ogrenci) }}>
                  {initials(g.ogrenci_ad)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="od-entity-card-name">{g.ogrenci_ad || `Öğrenci #${g.ogrenci}`}</div>
                  <div className="od-entity-card-sub">
                    {g.baslangic_tarihi} {g.bitis_tarihi ? `– ${g.bitis_tarihi}` : '· süresiz'}
                    {g.programs.length > 1 ? ` · ${g.programs.length} paket` : ''}
                  </div>
                </div>
                <Badge tone={g.durum === 'AKTIF' ? 'success' : 'secondary'}>{g.durum_display}</Badge>
                <IconChevronRight size={15} className="od-entity-card-chevron" />
              </div>

              {g.paketAds.length > 0 && (
                <div className="od-entity-card-meta">
                  {g.paketAds.map((ad) => (
                    <Badge key={ad} tone="purple">
                      {ad}
                    </Badge>
                  ))}
                </div>
              )}

              <MiniProgress
                value={g.slotCount}
                max={g.expectedHaftalik > 0 ? g.expectedHaftalik : Math.max(g.slotCount, 1)}
                tone={g.needsSablon ? 'orange' : 'green'}
              />

              {g.paketDersleri.length > 0 && (
                <div className="od-entity-card-meta">
                  {g.paketDersleri.slice(0, 3).map((d) => (
                    <Badge key={d.id} tone="secondary">
                      {resolveDersLabel(d, useKisaAd)}
                      {d.haftalik_adet ? ` ×${d.haftalik_adet}` : ''}
                    </Badge>
                  ))}
                  {g.paketDersleri.length > 3 && (
                    <Badge tone="secondary">+{g.paketDersleri.length - 3}</Badge>
                  )}
                </div>
              )}
              <div className="od-entity-card-footer">
                <span className="od-cell-muted">
                  {g.slotCount === 0
                    ? 'Öğretmen/saat atanmadı — kartı açın'
                    : g.needsSablon
                      ? `Eksik atama: ${Math.max(g.expectedHaftalik - g.slotCount, 0)} ders`
                      : g.notlar
                        ? g.notlar.slice(0, 42)
                        : 'Şablon tamam'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

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
