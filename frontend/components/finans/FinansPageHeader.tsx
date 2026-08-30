import type { ReactNode } from "react";
import "./finans-page-header.css";

export interface FinansPageTab {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: string;
  accentEnd?: string;
  actions?: ReactNode;
  tabs?: FinansPageTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}

export default function FinansPageHeader({
  title,
  subtitle,
  icon,
  accent = "#0262a7",
  accentEnd,
  actions,
  tabs,
  activeTab,
  onTabChange,
}: Props) {
  const end = accentEnd || accent;
  return (
    <header
      className={`fn-ph${tabs?.length ? " fn-ph--tabs" : ""}`}
      style={{
        ["--fn-ph-accent" as string]: accent,
        ["--fn-ph-accent-end" as string]: end,
      }}
    >
      <div className="fn-ph__hero">
        <div className="fn-ph__content">
          {icon ? <div className="fn-ph__icon">{icon}</div> : null}
          <div className="fn-ph__text">
            <h1 className="fn-ph__title">{title}</h1>
            {subtitle ? <p className="fn-ph__sub">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="fn-ph__actions">{actions}</div> : null}
      </div>
      {tabs?.length ? (
        <div className="tabs-modern">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-modern ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => onTabChange?.(tab.key)}
            >
              {tab.icon}
              {tab.label}
              {tab.count != null && tab.count > 0 ? (
                <span className="tab-count">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function IconGelir() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function IconGider() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14" />
      <path d="m18 13-6 6-6-6" />
      <path d="M5 5h14" />
    </svg>
  );
}

export function IconCari() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconTabList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

export function IconTabCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
