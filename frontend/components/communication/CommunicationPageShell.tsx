"use client";

import Link from "next/link";
import { ReactNode } from "react";
import "./communication.css";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface CommunicationPageShellProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: number | "full";
  className?: string;
}

export default function CommunicationPageShell({
  title,
  subtitle,
  icon = "💬",
  breadcrumbs,
  actions,
  children,
  maxWidth,
  className = "",
}: CommunicationPageShellProps) {
  const style =
    maxWidth === "full"
      ? { maxWidth: "none" }
      : maxWidth
        ? { maxWidth }
        : undefined;

  return (
    <div className={`comm-page${className ? ` ${className}` : ""}`} style={style}>
      <header className="comm-page-header">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="comm-breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((item, i) => (
              <span key={`${item.label}-${i}`} style={{ display: "contents" }}>
                {i > 0 && <span className="comm-breadcrumbs-sep">/</span>}
                {item.href ? (
                  <Link href={item.href}>{item.label}</Link>
                ) : (
                  <span>{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="comm-page-title-row">
          <div className="comm-page-title-block">
            <div className="comm-page-icon" aria-hidden="true">
              {icon}
            </div>
            <div>
              <h1>{title}</h1>
              {subtitle && <p className="comm-page-subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div>{actions}</div>}
        </div>
      </header>
      {children}
    </div>
  );
}
