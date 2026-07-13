"use client";

import { OverviewMaliHesap, OverviewOzetKartlar } from "../../services/dashboard-api";
import { fmtCurrency } from "../dashboard-utils";

interface Props {
  cards: OverviewOzetKartlar;
  hideGelirGider?: boolean;
  referansTarih?: string;
  kasaHesaplari?: OverviewMaliHesap[];
  bankaHesaplari?: OverviewMaliHesap[];
}

type CardKey = keyof OverviewOzetKartlar;
type Tone = "success" | "danger" | "accent" | "warning" | "slate";

interface CardDef {
  key: CardKey;
  label: string;
  tone: Tone;
  sub: string;
}

const BUGUN_CARDS: CardDef[] = [
  { key: "bugun_alinan", label: "Bugün Giren", tone: "success", sub: "Bugünkü tahsilatlar" },
  { key: "bugun_gider", label: "Bugün Çıkan", tone: "danger", sub: "Bugünkü ödemeler" },
  { key: "bugun_net", label: "Bugün Fark", tone: "accent", sub: "Giren − çıkan (günlük)" },
];

const AY_CARDS: CardDef[] = [
  { key: "bu_ay_alinan", label: "Bu Ay Giren", tone: "success", sub: "Ay başından bugüne tahsilat" },
  { key: "bu_ay_gider", label: "Bu Ay Çıkan", tone: "danger", sub: "Ay başından bugüne gider" },
  { key: "bu_ay_net", label: "Bu Ay Fark", tone: "accent", sub: "Giren − çıkan (aylık)" },
];

const GELIR_ONLY_KEYS = new Set<CardKey>(["bugun_alinan", "bu_ay_alinan", "bugun_net", "bu_ay_net"]);

function formatRefDate(tarih: string) {
  return new Date(`${tarih}T12:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function KpiCard({ def, value }: { def: CardDef; value: number }) {
  const isNet = def.key.endsWith("_net");
  const valueClass =
    isNet && value !== 0 ? (value >= 0 ? "fdash-kpi__value--pos" : "fdash-kpi__value--neg") : "";

  return (
    <div className={`fdash-kpi fdash-kpi--${def.tone}`}>
      <div className="fdash-kpi__label">{def.label}</div>
      <div className={`fdash-kpi__value ${valueClass}`}>{fmtCurrency(value)}</div>
      <div className="fdash-kpi__sub">{def.sub}</div>
    </div>
  );
}

function AccountList({
  title,
  total,
  accounts,
  emptyText,
}: {
  title: string;
  total: number;
  accounts: OverviewMaliHesap[];
  emptyText: string;
}) {
  return (
    <div className="fdash-accounts">
      <div className="fdash-accounts__head">
        <span className="fdash-accounts__title">{title}</span>
        <span className="fdash-accounts__total">{fmtCurrency(total)}</span>
      </div>
      {accounts.length === 0 ? (
        <p className="fdash-accounts__empty">{emptyText}</p>
      ) : (
        <ul className="fdash-accounts__list">
          {accounts.map((h) => (
            <li key={h.mali_hesap_id || h.id} className="fdash-accounts__row">
              <span className="fdash-accounts__name">{h.mali_hesap_ad}</span>
              <span className="fdash-accounts__bal">{fmtCurrency(h.donem_sonu_bakiye)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DashboardKpiCards({
  cards,
  hideGelirGider,
  referansTarih,
  kasaHesaplari = [],
  bankaHesaplari = [],
}: Props) {
  const bugun = hideGelirGider
    ? BUGUN_CARDS.filter((d) => !GELIR_ONLY_KEYS.has(d.key))
    : BUGUN_CARDS;
  const ay = hideGelirGider
    ? AY_CARDS.filter((d) => !GELIR_ONLY_KEYS.has(d.key))
    : AY_CARDS;

  return (
    <section className="fdash-block">
      <h2 className="fdash-block-label">
        Özet{referansTarih ? ` · ${formatRefDate(referansTarih)}` : ""}
      </h2>
      <p className="fdash-kpi-hint">
        Sol blok <strong>bugünün</strong> hareketleri, orta blok <strong>bu ayın</strong> toplamı.
        Sağda kasada / bankada şu an ne kadar olduğu hesap bazında görünür.
      </p>

      <div className="fdash-kpi-sections">
        <div>
          <h3 className="fdash-kpi-group-label">Bugün (günlük)</h3>
          <div className="fdash-kpi-grid fdash-kpi-grid--3">
            {bugun.map((def) => (
              <KpiCard key={def.key} def={def} value={cards[def.key]} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="fdash-kpi-group-label">Bu ay (aylık)</h3>
          <div className="fdash-kpi-grid fdash-kpi-grid--3">
            {ay.map((def) => (
              <KpiCard key={def.key} def={def} value={cards[def.key]} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="fdash-kpi-group-label">Kasa &amp; banka bakiyeleri</h3>
          <div className="fdash-accounts-grid">
            <AccountList
              title="Kasa (nakit)"
              total={cards.kasa_toplam}
              accounts={kasaHesaplari}
              emptyText="Henüz kasa hesabı yok."
            />
            <AccountList
              title="Banka"
              total={cards.banka_toplam}
              accounts={bankaHesaplari}
              emptyText="Henüz banka hesabı yok."
            />
          </div>
        </div>
      </div>
    </section>
  );
}
