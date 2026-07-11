"use client";

import Link from "next/link";
import {
  AKADEMIK_GROUPS,
  AKADEMIK_MODULE_LABEL,
  akademikTabHref,
} from "@/lib/akademik-routes";
import "./akademik-operasyon.css";

export default function AkademikOperasyonHome() {
  return (
    <div className="akademik-page">
      <div className="akademik-hero">
        <div>
          <h1>{AKADEMIK_MODULE_LABEL}</h1>
          <nav className="akademik-breadcrumb" aria-label="Breadcrumb">
            <Link href="/dashboard">Ana Sayfa</Link>
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
            href={akademikTabHref(group.slug, group.tabs[0].segment)}
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
