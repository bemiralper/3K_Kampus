"use client";

import { OverviewOzetKartlar } from "../../services/dashboard-api";
import { fmtCurrency } from "../dashboard-utils";

interface Props {
  cards: OverviewOzetKartlar;
  hideGelirGider?: boolean;
  referansTarih?: string;
}

type CardKey = keyof OverviewOzetKartlar;
type Tone = "success" | "danger" | "accent" | "warning" | "slate";

interface CardDef {
  key: CardKey;
  label: string;
  tone: Tone;
  sub?: string;
}

const ALL_CARDS: CardDef[] = [
  { key: "bugun_alinan", label: "Bugün Alınan", tone: "success", sub: "Tahsilat" },
  { key: "bugun_gider", label: "Bugün Gider", tone: "danger", sub: "Ödeme" },
  { key: "bugun_net", label: "Bugün Net", tone: "accent", sub: "Gelir − gider" },
  { key: "bu_ay_alinan", label: "Bu Ay Alınan", tone: "success", sub: "Aylık tahsilat" },
  { key: "bu_ay_gider", label: "Bu Ay Gider", tone: "danger", sub: "Aylık gider" },
  { key: "bu_ay_net", label: "Bu Ay Net", tone: "accent", sub: "Aylık net" },
  { key: "kasa_toplam", label: "Kasa Toplam", tone: "warning", sub: "Nakit" },
  { key: "banka_toplam", label: "Banka Toplam", tone: "slate", sub: "Banka hesapları" },
];

const GELIR_ONLY_KEYS = new Set<CardKey>(["bugun_alinan", "bu_ay_alinan", "bugun_net", "bu_ay_net"]);

function formatRefDate(tarih: string) {
  return new Date(`${tarih}T12:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DashboardKpiCards({ cards, hideGelirGider, referansTarih }: Props) {
  const visible = hideGelirGider
    ? ALL_CARDS.filter((d) => !GELIR_ONLY_KEYS.has(d.key))
    : ALL_CARDS;

  return (
    <section className="fdash-block">
      <h2 className="fdash-block-label">
        Özet{referansTarih ? ` · ${formatRefDate(referansTarih)}` : ""}
      </h2>
      <div className="fdash-kpi-grid">
        {visible.map((def) => {
          const value = cards[def.key];
          const isNet = def.key.endsWith("_net");
          const valueClass =
            isNet && value !== 0 ? (value >= 0 ? "fdash-kpi__value--pos" : "fdash-kpi__value--neg") : "";

          return (
            <div key={def.key} className={`fdash-kpi fdash-kpi--${def.tone}`}>
              <div className="fdash-kpi__label">{def.label}</div>
              <div className={`fdash-kpi__value ${valueClass}`}>{fmtCurrency(value)}</div>
              {def.sub && <div className="fdash-kpi__sub">{def.sub}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
