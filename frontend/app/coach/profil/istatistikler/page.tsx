"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CoachProfilNav from "@/components/coach/CoachProfilNav";
import { fetchCoachMeStats, type CoachSelfStats } from "@/lib/coach-profile-api";

function PeriodRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="coach-stats-period">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

      <section className="coach-profil-panel">
        <h3>Öğrencilerim</h3>
        <div className="coach-kpi-row">
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{ogrenciler.aktif_ogrenci}</div>
            <div className="coach-kpi-mini-label">Aktif öğrenci</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{ogrenciler.kapasite}</div>
            <div className="coach-kpi-mini-label">Kapasite</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{ogrenciler.bos_kapasite}</div>
            <div className="coach-kpi-mini-label">Boş kapasite</div>
          </div>
          <Link href="/coach/ogrenciler" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{ogrenciler.riskli_ogrenci}</div>
            <div className="coach-kpi-mini-label">Riskli öğrenci</div>
          </Link>
          <Link href="/coach/ogrenciler" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{ogrenciler.gorusme_bekleyen}</div>
            <div className="coach-kpi-mini-label">Görüşme bekleyen</div>
          </Link>
        </div>
      </section>

      <section className="coach-profil-panel">
        <h3>Ödevlerim</h3>
        <div className="coach-kpi-row">
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{odevler.verilen.toplam}</div>
            <div className="coach-kpi-mini-label">Verilen toplam</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{odevler.tamamlanan}</div>
            <div className="coach-kpi-mini-label">Tamamlanan</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{odevler.devam_eden}</div>
            <div className="coach-kpi-mini-label">Devam eden</div>
          </div>
          <Link href="/coach/odev/kontrol?status=OVERDUE" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{odevler.geciken}</div>
            <div className="coach-kpi-mini-label">Geciken</div>
          </Link>
          <Link href="/coach/odev/kontrol" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{odevler.bekleyen_kontrol}</div>
            <div className="coach-kpi-mini-label">Kontrol bekleyen</div>
          </Link>
        </div>
        <div className="coach-stats-period-grid">
          <PeriodRow label="Bu hafta verilen" value={odevler.verilen.bu_hafta} />
          <PeriodRow label="Bu ay verilen" value={odevler.verilen.bu_ay} />
        </div>
      </section>

      <section className="coach-profil-panel">
        <h3>Görüşmelerim</h3>
        <div className="coach-kpi-row">
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{gorusmeler.ogrenci.toplam}</div>
            <div className="coach-kpi-mini-label">Öğrenci (toplam)</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{gorusmeler.veli.toplam}</div>
            <div className="coach-kpi-mini-label">Veli (toplam)</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{gorusmeler.tamamlanan_toplam}</div>
            <div className="coach-kpi-mini-label">Tamamlanan</div>
          </div>
          <Link href="/coach/gorusmeler" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{gorusmeler.bugun_planli}</div>
            <div className="coach-kpi-mini-label">Bugün planlı</div>
          </Link>
        </div>
        <div className="coach-stats-period-grid">
          <PeriodRow label="Öğrenci — bu hafta" value={gorusmeler.ogrenci.bu_hafta} />
          <PeriodRow label="Öğrenci — bu ay" value={gorusmeler.ogrenci.bu_ay} />
          <PeriodRow label="Veli — bu hafta" value={gorusmeler.veli.bu_hafta} />
          <PeriodRow label="Veli — bu ay" value={gorusmeler.veli.bu_ay} />
        </div>
      </section>

      <section className="coach-profil-panel">
        <h3>Görevlerim</h3>
        <div className="coach-kpi-row">
          <Link href="/coach/gorevler" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{gorevler.bekleyen}</div>
            <div className="coach-kpi-mini-label">Bekleyen</div>
          </Link>
          <Link href="/coach/gorevler" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{gorevler.bugun}</div>
            <div className="coach-kpi-mini-label">Bugün</div>
          </Link>
          <Link href="/coach/gorevler?tab=geciken" className="coach-kpi-mini is-link">
            <div className="coach-kpi-mini-value">{gorevler.geciken}</div>
            <div className="coach-kpi-mini-label">Geciken</div>
          </Link>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{gorevler.tamamlanan}</div>
            <div className="coach-kpi-mini-label">Tamamlanan</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{gorevler.tamamlanamayan}</div>
            <div className="coach-kpi-mini-label">Tamamlanamayan</div>
          </div>
        </div>
      </section>
    </div>
  );
}
