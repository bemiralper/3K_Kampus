"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AKADEMIK_BASE,
  AKADEMIK_MODULE_LABEL,
  akademikTabHref,
  type AkademikGroupDef,
} from "@/lib/akademik-routes";
import "./akademik-operasyon.css";

type Props = {
  group: AkademikGroupDef;
  children: React.ReactNode;
};

export default function AkademikGroupLayout({ group, children }: Props) {
  const pathname = usePathname();

  return (
    <div className="akademik-page">
      <div className="akademik-hero">
        <div>
          <h1>{group.label}</h1>
          <nav className="akademik-breadcrumb" aria-label="Breadcrumb">
            <Link href="/dashboard">Ana Sayfa</Link>
            <span>/</span>
            <Link href={AKADEMIK_BASE}>{AKADEMIK_MODULE_LABEL}</Link>
            <span>/</span>
            <span>{group.label}</span>
          </nav>
        </div>
      </div>

      <nav className="akademik-tab-nav" aria-label={`${group.label} sekmeleri`}>
        <div className="akademik-tab-nav-scroll">
          {group.tabs.map((tab) => {
            const href = akademikTabHref(group.slug, tab.segment);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={tab.segment}
                href={href}
                className={`akademik-tab${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="akademik-tab-panel akademik-tab-panel--wide">{children}</div>
    </div>
  );
}
