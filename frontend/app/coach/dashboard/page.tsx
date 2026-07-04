"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { fetchKontrolBadge } from "@/lib/resources-api";
import { fetchGorevDashboardOzet, type GorevDashboardOzet } from "@/lib/gorev-api";

const PLACEHOLDER_ITEMS = [
  { label: "Riskli öğrenci kaydı yok", tone: "muted" },
  { label: "Takip edilecek risk öğrencisi bulunmuyor", tone: "muted" },
];

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const greeting = user?.first_name ? `Günaydın, ${user.first_name}` : "Bugün";
  const [overdueCount, setOverdueCount] = useState(0);
  const [gorevOzet, setGorevOzet] = useState<GorevDashboardOzet | null>(null);

  const loadBadge = useCallback(async () => {
    const [kontrolRes, gorevRes] = await Promise.all([
      fetchKontrolBadge(),
      fetchGorevDashboardOzet(),
    ]);
    if (kontrolRes.success && kontrolRes.data) {
      setOverdueCount(kontrolRes.data.overdue ?? 0);
    }
    if (gorevRes.success && gorevRes.data) {
      setGorevOzet(gorevRes.data);
    }
  }, []);

  useEffect(() => {
    loadBadge();
  }, [loadBadge]);

  return (
    <div>
      <section className="coach-hero">
        <p className="coach-hero-kicker">Koç Portalı</p>
        <h2 className="coach-hero-title">{greeting}</h2>
        <p className="coach-hero-sub">Günlük özet ve bekleyen işleriniz</p>
        <div className="coach-hero-stats">
          <Link href="/coach/gorevler" className="coach-hero-stat" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="coach-hero-stat-value">{gorevOzet?.bugun ?? 0}</div>
            <div className="coach-hero-stat-label">Bugün görev</div>
          </Link>
          <Link href="/coach/gorevler?tab=geciken" className="coach-hero-stat" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="coach-hero-stat-value" style={(gorevOzet?.geciken ?? 0) > 0 ? { color: "#dc2626" } : undefined}>
              {gorevOzet?.geciken ?? 0}
            </div>
            <div className="coach-hero-stat-label">Geciken görev</div>
          </Link>
          <div className="coach-hero-stat">
            <div className="coach-hero-stat-value">
              {(gorevOzet?.tip_sayaclari?.OGRENCI_GORUSME ?? 0) +
                (gorevOzet?.tip_sayaclari?.HAFTALIK_GORUSME ?? 0)}
            </div>
            <div className="coach-hero-stat-label">Bugün görüşme</div>
          </div>
        </div>
      </section>

      <header className="coach-page-header">
        <h2>Özet</h2>
        <p>Atanmış öğrencileriniz ve günlük takip alanları</p>
      </header>

      <div className="coach-dashboard-grid">
        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>⚠️</span> Riskli Öğrenciler
            </h3>
            <Link href="/coach/ogrenciler" className="coach-link-btn">
              Tümü →
            </Link>
          </div>
          <ul className="coach-widget-list">
            {PLACEHOLDER_ITEMS.map((item) => (
              <li key={item.label}>
                <div className="coach-placeholder-item">
                  <span className="coach-placeholder-dot" />
                  {item.label}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>📋</span> Geciken Ödevler
            </h3>
            {overdueCount > 0 && (
              <Link href="/coach/odev/kontrol?status=OVERDUE" className="coach-link-btn">
                Tümü →
              </Link>
            )}
          </div>
          {overdueCount > 0 ? (
            <p className="coach-widget-empty">
              <Link href="/coach/odev/kontrol?status=OVERDUE" className="coach-link-btn">
                {overdueCount} geciken ödev kontrol bekliyor →
              </Link>
            </p>
          ) : (
            <p className="coach-widget-empty">Kontrol bekleyen geciken ödev yok.</p>
          )}
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>✅</span> Bugünkü Görevler
            </h3>
            <Link href="/coach/gorevler" className="coach-link-btn">
              Tümü →
            </Link>
          </div>
          <ul className="coach-widget-list">
            <li>
              <div className="coach-placeholder-item">
                <span className="coach-placeholder-dot" />
                {gorevOzet?.bugun ?? 0} görev · {(gorevOzet?.tip_sayaclari?.ODEV_KONTROL ?? 0)} ödev kontrolü · {(gorevOzet?.tip_sayaclari?.VELI_GORUSME ?? 0)} veli araması
              </div>
            </li>
          </ul>
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>🎯</span> Bugünkü Görüşmeler
            </h3>
            <Link href="/coach/gorusmeler" className="coach-link-btn">
              Görüşmeler →
            </Link>
          </div>
          <p className="coach-widget-empty">Bugün planlanmış görüşme bulunmuyor.</p>
        </section>

        <section className="coach-widget">
          <div className="coach-widget-header">
            <h3 className="coach-widget-title">
              <span aria-hidden>🕐</span> Son Ziyaret Edilenler
            </h3>
          </div>
          <ul className="coach-widget-list">
            <li>
              <div className="coach-placeholder-item">
                <span className="coach-placeholder-dot" />
                Henüz ziyaret geçmişi yok
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
