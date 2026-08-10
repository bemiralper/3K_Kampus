"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Result } from "antd";
import {
  AKADEMIK_MODULE_LABEL,
  akademikPortalHomeHref,
  akademikTabHref,
  resolveAkademikBase,
  type AkademikGroupDef,
} from "@/lib/akademik-routes";
import { AKADEMIK_TAB_PAGES } from "./akademikTabPages";
import { canReadAkademik } from "@/lib/akademik-permissions";
import { useAuth } from "@/lib/contexts/AuthContext";
import "./akademik-operasyon.css";

type Props = {
  group: AkademikGroupDef;
  children: React.ReactNode;
};

export default function AkademikGroupLayout({ group, children }: Props) {
  const pathname = usePathname();
  const basePath = resolveAkademikBase(pathname);
  const homeHref = akademikPortalHomeHref(basePath);
  const { user } = useAuth();

  if (user && !canReadAkademik(user.permissions)) {
    return (
      <div className="akademik-page">
        <Result
          status="403"
          title="Yetkiniz Yok"
          subTitle="Akademik Operasyonlar modülünü görüntülemek için gerekli yetkiye sahip değilsiniz. Erişim gerekiyorsa yöneticinizden 'Sınıf' veya 'Eğitim Tanımları' yetkisi talep edin."
          extra={<Link href={homeHref}>Ana Sayfaya Dön</Link>}
        />
      </div>
    );
  }

  return (
    <div className="akademik-page">
      <div className="akademik-hero">
        <div>
          <h1>{group.label}</h1>
          <nav className="akademik-breadcrumb" aria-label="Breadcrumb">
            <Link href={homeHref}>Ana Sayfa</Link>
            <span>/</span>
            <Link href={basePath}>{AKADEMIK_MODULE_LABEL}</Link>
            <span>/</span>
            <span>{group.label}</span>
          </nav>
        </div>
      </div>

      <nav className="akademik-tab-nav" aria-label={`${group.label} sekmeleri`}>
        <div className="akademik-tab-nav-scroll">
          {group.tabs.map((tab) => {
            const href = akademikTabHref(group.slug, tab.segment, basePath);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const isPlaceholder = !AKADEMIK_TAB_PAGES[tab.segment];
            return (
              <Link
                key={tab.segment}
                href={href}
                className={`akademik-tab${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
                {isPlaceholder && <span className="akademik-tab-badge">Yakında</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="akademik-tab-panel akademik-tab-panel--wide">{children}</div>
    </div>
  );
}
