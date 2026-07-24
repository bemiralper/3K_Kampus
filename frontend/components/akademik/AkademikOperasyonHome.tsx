"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AKADEMIK_GROUPS,
  AKADEMIK_MODULE_LABEL,
  akademikPortalHomeHref,
  akademikTabHref,
  resolveAkademikBase,
} from "@/lib/akademik-routes";
import "./akademik-operasyon.css";

export default function AkademikOperasyonHome() {
  const pathname = usePathname();
  const basePath = resolveAkademikBase(pathname);
  const homeHref = akademikPortalHomeHref(basePath);

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

      <div className="akademik-home-grid">
        {AKADEMIK_GROUPS.map((group) => (
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
