"use client";

import { OverviewOzetKartlar } from "../../services/dashboard-api";
import { fmtCurrency } from "../dashboard-utils";
import {
  IconArrowDownCircle,
  IconArrowUpCircle,
  IconBank,
  IconCash,
  IconScale,
  IconClock,
} from "../dashboard-icons";
import DashboardSectionLabel from "./DashboardSectionLabel";

interface Props {
  cards: OverviewOzetKartlar;
  hideGelirGider?: boolean;
  referansTarih?: string;
}

type CardKey = keyof OverviewOzetKartlar;

interface CardDef {
  key: CardKey;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  tone: "blue" | "rose" | "slate" | "emerald" | "amber";
}

const TONE_STYLES: Record<CardDef["tone"], { bg: string; fg: string }> = {
  blue: { bg: "#eaf3fb", fg: "#0262a7" },
  rose: { bg: "#fdeceb", fg: "#dc2626" },
  slate: { bg: "#eef1f5", fg: "#475569" },
  emerald: { bg: "#e8f6ef", fg: "#059669" },
  amber: { bg: "#fef3e2", fg: "#b45309" },
};

const GUN_CARDS: CardDef[] = [
  { key: "bugun_alinan", label: "Bugün Alınan", icon: IconArrowDownCircle, tone: "emerald" },
  { key: "bugun_gider", label: "Bugün Gider", icon: IconArrowUpCircle, tone: "rose" },
  { key: "bugun_net", label: "Bugün Net", icon: IconScale, tone: "blue" },
];

const AY_CARDS: CardDef[] = [
  { key: "bu_ay_alinan", label: "Bu Ay Alınan", icon: IconArrowDownCircle, tone: "emerald" },
  { key: "bu_ay_gider", label: "Bu Ay Gider", icon: IconArrowUpCircle, tone: "rose" },
  { key: "bu_ay_net", label: "Bu Ay Net", icon: IconScale, tone: "blue" },
];

const HESAP_CARDS: CardDef[] = [
  { key: "kasa_toplam", label: "Kasa Toplam", icon: IconCash, tone: "amber" },
  { key: "banka_toplam", label: "Banka Toplam", icon: IconBank, tone: "slate" },
];

function SummaryCard({ def, value }: { def: CardDef; value: number }) {
  const isNet = def.key.endsWith("_net");
  const tone = TONE_STYLES[def.tone];
  const valueColor = isNet ? (value >= 0 ? "#059669" : "#dc2626") : "#111827";
  const Icon = def.icon;

  return (
    <div className="card-modern p-4 flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: tone.bg, color: tone.fg }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 mb-1 truncate">{def.label}</div>
        <div className="text-lg font-bold tabular-nums" style={{ color: valueColor }}>
          {fmtCurrency(value)}
        </div>
      </div>
    </div>
  );
}

const GELIR_ONLY_KEYS = new Set<CardKey>(["bugun_alinan", "bu_ay_alinan", "bugun_net", "bu_ay_net"]);

function visibleCards(defs: CardDef[], hideGelirGider?: boolean) {
  if (!hideGelirGider) return defs;
  return defs.filter((d) => !GELIR_ONLY_KEYS.has(d.key));
}

export default function DashboardSummaryCards({ cards, hideGelirGider, referansTarih }: Props) {
  const gunCards = visibleCards(GUN_CARDS, hideGelirGider);
  const ayCards = visibleCards(AY_CARDS, hideGelirGider);

  return (
    <div className="mb-6">
      <div
        className={`grid grid-cols-1 ${
          hideGelirGider && gunCards.length === 0 && ayCards.length === 0
            ? "sm:grid-cols-2"
            : "lg:grid-cols-[1fr_1fr_auto]"
        } gap-5`}
      >
        {gunCards.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <DashboardSectionLabel text="Bugün" />
              {referansTarih && (
                <span className="text-[11px] text-gray-400 flex items-center gap-1">
                  <IconClock className="w-3 h-3" />
                  {new Date(referansTarih + "T12:00:00").toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>
              )}
            </div>
            <div className={`grid grid-cols-1 ${gunCards.length > 1 ? "sm:grid-cols-3" : ""} gap-3`}>
              {gunCards.map((def) => (
                <SummaryCard key={def.key} def={def} value={cards[def.key]} />
              ))}
            </div>
          </div>
        )}

        {ayCards.length > 0 && (
          <div>
            <DashboardSectionLabel text="Bu Ay" />
            <div className={`grid grid-cols-1 ${ayCards.length > 1 ? "sm:grid-cols-3" : ""} gap-3`}>
              {ayCards.map((def) => (
                <SummaryCard key={def.key} def={def} value={cards[def.key]} />
              ))}
            </div>
          </div>
        )}

        <div>
          <DashboardSectionLabel text="Hesaplar" />
          <div className={`grid grid-cols-1 ${hideGelirGider ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-1"} gap-3`}>
            {HESAP_CARDS.map((def) => (
              <SummaryCard key={def.key} def={def} value={cards[def.key]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
