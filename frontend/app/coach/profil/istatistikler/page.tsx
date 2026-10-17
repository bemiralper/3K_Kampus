"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import CoachProfilNav from "@/components/coach/CoachProfilNav";
import { fetchCoachMeStats, type CoachSelfStats } from "@/lib/coach-profile-api";

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const GLYPH: Record<string, string> = {
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  gauge: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  seat: "M4 20h16M6 20V10a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10M9 8V6a3 3 0 0 1 6 0v2",
  alert: "M12 9v4M12 17h.01M10.3 4.3 2.8 18a2 2 0 0 0 1.7 3h14.9a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z",
  check: "M20 6 9 17l-5-5",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z",
};

type Tone = "blue" | "green" | "amber" | "rose" | "slate";

function Metric({
  value,
  label,
  href,
  tone,
  glyph,
}: {
  value: number;
  label: string;
  href?: string;
  tone: Tone;
  glyph: string;
}) {
  const body = (
    <>
      <span className={`cprof-metric-icon is-${tone}`}>
        <Icon d={GLYPH[glyph] || GLYPH.users} />
      </span>
      <span className="cprof-metric-label">{label}</span>
      <strong className="cprof-metric-value">{value}</strong>
      {href ? <span className="cprof-metric-go" aria-hidden="true">›</span> : null}
    </>
  );
  if (!href) return <div className={`cprof-metric is-${tone}`}>{body}</div>;
  return (
    <Link href={href} className={`cprof-metric is-${tone} is-link`}>
      {body}
    </Link>
  );
}

function Split({ label, value }: { label: string; value: number }) {
  return (
    <div className="cprof-split-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cprof-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function CoachIstatistiklerPage() {
  const [stats, setStats] = useState<CoachSelfStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCoachMeStats().then((res) => {
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setError(res.error || "İstatistikler yüklenemedi");
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="coach-profil-page">
        <CoachProfilNav />
        <p className="coach-muted-text">Yükleniyor...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="coach-profil-page">
        <CoachProfilNav />
        <p className="coach-error-text">{error || "Veri bulunamadı."}</p>
      </div>
    );
  }

  const { ogrenciler, odevler, gorusmeler, gorevler } = stats;

  return (
    <div className="coach-profil-page">
      <CoachProfilNav />

      <Panel title="Öğrencilerim">
        <div className="cprof-metrics">
          <Metric value={ogrenciler.aktif_ogrenci} label="Aktif öğrenci" tone="blue" glyph="users" />
          <Metric value={ogrenciler.kapasite} label="Kapasite" tone="slate" glyph="gauge" />
          <Metric value={ogrenciler.bos_kapasite} label="Boş kapasite" tone="green" glyph="seat" />
          <Metric value={ogrenciler.riskli_ogrenci} label="Riskli öğrenci" tone="rose" glyph="alert" href="/coach/ogrenciler?filter=risk" />
          <Metric value={ogrenciler.odev_takibi} label="Ödev takibi" tone="amber" glyph="book" href="/coach/ogrenciler?filter=needs_meeting" />
        </div>
      </Panel>

      <Panel title="Ödevlerim">
        <div className="cprof-metrics">
          <Metric value={odevler.verilen.toplam} label="Verilen toplam" tone="blue" glyph="book" />
          <Metric value={odevler.tamamlanan} label="Tamamlanan" tone="green" glyph="check" />
          <Metric value={odevler.devam_eden} label="Devam eden" tone="slate" glyph="clock" />
          <Metric value={odevler.geciken} label="Geciken" tone="rose" glyph="alert" href="/coach/odev/kontrol?status=OVERDUE" />
          <Metric value={odevler.bekleyen_kontrol} label="Bugün kontrol" tone="amber" glyph="calendar" href="/coach/odev/kontrol?due_today=1" />
        </div>
        <div className="cprof-split">
          <Split label="Bu hafta verilen" value={odevler.verilen.bu_hafta} />
          <Split label="Bu ay verilen" value={odevler.verilen.bu_ay} />
        </div>
      </Panel>

      <Panel title="Görüşmelerim">
        <div className="cprof-metrics">
          <Metric value={gorusmeler.ogrenci.toplam} label="Öğrenci (toplam)" tone="blue" glyph="user" />
          <Metric value={gorusmeler.veli.toplam} label="Veli (toplam)" tone="slate" glyph="users" />
          <Metric value={gorusmeler.tamamlanan_toplam} label="Tamamlanan" tone="green" glyph="check" />
          <Metric value={gorusmeler.bugun_planli} label="Bugün planlı" tone="amber" glyph="calendar" href="/coach/gorusmeler" />
        </div>
        <div className="cprof-split">
          <Split label="Öğrenci — bu hafta" value={gorusmeler.ogrenci.bu_hafta} />
          <Split label="Öğrenci — bu ay" value={gorusmeler.ogrenci.bu_ay} />
          <Split label="Veli — bu hafta" value={gorusmeler.veli.bu_hafta} />
          <Split label="Veli — bu ay" value={gorusmeler.veli.bu_ay} />
        </div>
      </Panel>

      <Panel title="Görevlerim">
        <div className="cprof-metrics">
          <Metric value={gorevler.bekleyen} label="Bekleyen" tone="blue" glyph="inbox" href="/coach/gorevler" />
          <Metric value={gorevler.bugun} label="Bugün" tone="amber" glyph="calendar" href="/coach/gorevler" />
          <Metric value={gorevler.geciken} label="Geciken" tone="rose" glyph="alert" href="/coach/gorevler?tab=geciken" />
          <Metric value={gorevler.tamamlanan} label="Tamamlanan" tone="green" glyph="check" />
          <Metric value={gorevler.tamamlanamayan} label="Tamamlanamayan" tone="slate" glyph="alert" />
        </div>
      </Panel>
    </div>
  );
}
