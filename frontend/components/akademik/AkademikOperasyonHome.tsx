"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Result } from "antd";
import dayjs from "dayjs";
import {
  AKADEMIK_MODULE_LABEL,
  akademikPortalHomeHref,
  akademikTabHref,
  akademikVisibleGroups,
  resolveAkademikBase,
} from "@/lib/akademik-routes";
import { canReadAkademik } from "@/lib/akademik-permissions";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useKurum } from "@/lib/contexts/KurumContext";
import {
  fetchClassLessonPlanContext,
  fetchLessonSessions,
  fetchTeachersForAvailability,
} from "@/lib/academic-api";
import "./akademik-operasyon.css";

type Kpi = {
  label: string;
  value: string;
  hint?: string;
};

export default function AkademikOperasyonHome() {
  const pathname = usePathname();
  const basePath = resolveAkademikBase(pathname);
  const homeHref = akademikPortalHomeHref(basePath);
  const { user } = useAuth();
  const { activeKurum, activeSube, initialized } = useKurum();
  const [kpis, setKpis] = useState<Kpi[] | null>(null);

  useEffect(() => {
    if (!initialized || !activeKurum || !activeSube) return;
    let cancelled = false;

    (async () => {
      try {
        const [ctx, teachers] = await Promise.all([
          fetchClassLessonPlanContext(),
          fetchTeachersForAvailability({ aktif_only: true }),
        ]);
        let todaySessions: { status: string }[] = [];
        if (ctx.active_term_id) {
          try {
            todaySessions = await fetchLessonSessions({
              term_id: ctx.active_term_id,
              date: dayjs().format("YYYY-MM-DD"),
            });
          } catch {
            todaySessions = [];
          }
        }
        if (cancelled) return;
        const completed = todaySessions.filter((s) => s.status === "COMPLETED").length;
        setKpis([
          { label: "Aktif Sınıf", value: String(ctx.classrooms.length) },
          { label: "Aktif Öğretmen", value: String(teachers.length) },
          { label: "Bugünkü Ders", value: String(todaySessions.length) },
          {
            label: "Bugün Tamamlanan",
            value: todaySessions.length ? `${completed}/${todaySessions.length}` : "0",
          },
        ]);
      } catch {
        if (!cancelled) setKpis(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeKurum, activeSube, initialized]);

  if (user && !canReadAkademik(user.permissions || [], user)) {
    return (
      <div className="akademik-page">
        <Result
          status="403"
          title="Yetkiniz Yok"
          subTitle="Akademik Operasyonlar modülünü görüntülemek için gerekli yetkiye sahip değilsiniz."
          extra={<Link href={homeHref}>Ana Sayfaya Dön</Link>}
        />
      </div>
    );
  }

  return (
    <div className="akademik-page">
      <div className="akademik-hero">
        <div>
          <h1>{AKADEMIK_MODULE_LABEL}</h1>
          <nav className="akademik-breadcrumb" aria-label="Breadcrumb">
            <Link href={homeHref}>Ana Sayfa</Link>
            <span>/</span>
            <span>{AKADEMIK_MODULE_LABEL}</span>
          </nav>
          <p className="akademik-hero-desc">
            Sol menüden bir bölüm seçin; her bölümün alt ekranları sayfa içi sekmeler
            olarak açılır.
          </p>
        </div>
      </div>

      {kpis && (
        <div className="akademik-kpi-strip">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="akademik-kpi-card">
              <span className="akademik-kpi-value">{kpi.value}</span>
              <span className="akademik-kpi-label">{kpi.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="akademik-home-grid">
        {akademikVisibleGroups().map((group) => (
          <Link
            key={group.slug}
            href={akademikTabHref(group.slug, group.tabs[0].segment, basePath)}
            className="akademik-home-card"
          >
            <h2>{group.label}</h2>
            <p>{group.tabs.length} ekran</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
