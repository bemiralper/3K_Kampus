"use client";

import Link from "next/link";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useDashboardLinks } from "../useDashboardLinks";

type Tone = "accent" | "emerald" | "rose" | "amber" | "slate" | "purple" | "info";

interface ShortcutDef {
  href: string;
  label: string;
  desc: string;
  tone: Tone;
  hidden?: boolean;
}

export default function DashboardShortcuts() {
  const { isMuhasebeMode } = useFinansPath();
  const links = useDashboardLinks();

  const items = ([
    { href: links.odemeTakip(), label: "Ödeme Takip", desc: "Tahsilat al", tone: "emerald" as Tone },
    { href: links.gunSonu, label: "Gün Sonu", desc: "Günlük kapanış", tone: "accent" as Tone },
    { href: links.vadesiGelenler, label: "Vadesi Gelenler", desc: "Yaklaşan vadeler", tone: "info" as Tone },
    { href: links.gecikmisOdemeler, label: "Gecikmiş", desc: "Vadesi geçenler", tone: "rose" as Tone },
    { href: links.donemTahsilat, label: "Dönem Tahsilat", desc: "Dönem özeti", tone: "amber" as Tone },
    { href: links.gelirIslemleri, label: "Gelir", desc: "Gelir kayıtları", tone: "emerald" as Tone, hidden: isMuhasebeMode },
    { href: links.giderIslemleri, label: "Gider", desc: "Gider kayıtları", tone: "rose" as Tone },
    { href: links.cariHesaplar, label: "Cari Hesaplar", desc: "Cari yönetimi", tone: "accent" as Tone },
    { href: links.kasaBanka, label: "Kasa / Banka", desc: "Mali hesaplar", tone: "slate" as Tone },
    { href: links.virman, label: "Virman", desc: "Transfer", tone: "purple" as Tone },
    { href: links.cekSenet, label: "Çek / Senet", desc: "Portföy", tone: "info" as Tone },
    { href: links.gelirGiderTanimlar, label: "Tanımlar", desc: "Kategori / etiket", tone: "slate" as Tone },
    { href: links.tahsilatRaporlar, label: "Raporlar", desc: "Mali analiz", tone: "accent" as Tone },
  ] satisfies ShortcutDef[]).filter((i) => !i.hidden);

  return (
    <section className="fdash-block">
      <h2 className="fdash-block-label">Kısayollar</h2>
      <div className="fdash-shortcut-grid">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`fdash-shortcut fdash-shortcut--${item.tone}`}
          >
            <div className="fdash-shortcut__label">{item.label}</div>
            <div className="fdash-shortcut__desc">{item.desc}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
