"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, FolderOpen, LoaderCircle } from "lucide-react";
import Link from "next/link";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="tp-page-heading"><div><span className="tp-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="tp-empty"><span className="tp-empty-icon"><FolderOpen size={25} strokeWidth={1.5} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function LoadingState() {
  return <div className="tp-loading" role="status"><LoaderCircle size={20} className="tp-spin" /> İçerik hazırlanıyor…</div>;
}
export function SectionHeading({ number, title, href, label = "Tümünü gör" }: { number: string; title: string; href?: string; label?: string }) {
  return <div className="tp-section-heading"><h2><span>{number}</span>{title}</h2>{href && <Link href={href}>{label}<ArrowUpRight size={15} /></Link>}</div>;
}
export function Initials({ name }: { name: string }) {
  return <span className="tp-avatar">{name.split(" ").filter(Boolean).slice(0, 2).map(s => s[0]).join("") || "Ö"}</span>;
}
