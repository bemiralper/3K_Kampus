"use client";

import React from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtTL } from "@/components/finans/FinansFilterBar";
import { durumMeta, type CekSenetV2Dashboard } from "../types/cek-senet-v2-types";

interface Props {
  data: CekSenetV2Dashboard;
  onCardClick: (sekme: string) => void;
}

interface CardDef {
  key: string;
  label: string;
  icon: string;
  tone: string;
  sekme: string;
  value: { adet: number; tutar: number };
}

export default function CekSenetV2Dashboard({ data, onCardClick }: Props) {
  const k = data.kpi;
  const cards: CardDef[] = [
    { key: "cek", label: "Toplam Çek", icon: "🧾", tone: "accent", sekme: "gelen-cekler", value: k.toplam_cek },
    { key: "senet", label: "Toplam Senet", icon: "📜", tone: "info", sekme: "gelen-senetler", value: k.toplam_senet },
    { key: "portfoy", label: "Toplam Portföy", icon: "💼", tone: "success", sekme: "portfoy", value: k.toplam_portfoy },
    { key: "risk", label: "Toplam Risk (Verilen)", icon: "⚠️", tone: "danger", sekme: "verilen-cekler", value: k.toplam_risk },
    { key: "tahsil", label: "Tahsil Bekleyen", icon: "⏳", tone: "warning", sekme: "portfoy", value: k.tahsil_bekleyen },
    { key: "odeme", label: "Ödeme Bekleyen", icon: "💳", tone: "purple", sekme: "verilen-cekler", value: k.odeme_bekleyen },
    { key: "yaklasan", label: "Yaklaşan Vadeler (7g)", icon: "📅", tone: "info", sekme: "portfoy", value: k.yaklasan_vadeler },
    { key: "geciken", label: "Gecikenler", icon: "🚨", tone: "danger", sekme: "portfoy", value: k.gecikenler },
  ];

  const pieData = data.durum_dagilim
    .filter((d) => d.adet > 0)
    .map((d) => ({ name: d.durum_label, value: d.adet, tutar: d.tutar, fill: durumMeta(d.durum).renk }));

  return (
    <div>
      <div className="csv2-cards">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`csv2-card csv2-card--${c.tone}`}
            onClick={() => onCardClick(c.sekme)}
          >
            <div className="csv2-card__top">
              <span className="csv2-card__label">{c.label}</span>
              <span className="csv2-card__icon">{c.icon}</span>
            </div>
            <div className="csv2-card__value">{fmtTL(c.value.tutar)}</div>
            <div className="csv2-card__sub">{c.value.adet} adet</div>
          </button>
        ))}
      </div>

      <div className="csv2-charts">
        <div className="csv2-chart-card">
          <h3 className="csv2-chart-title">Aylık Vade Dağılımı (Aktif)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.aylik_vade} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="ay_label" fontSize={12} />
              <YAxis fontSize={11} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))} />
              <Tooltip formatter={(v) => fmtTL(Number(v))} />
              <Legend />
              <Bar dataKey="alinan" name="Alınan" fill="#0262a7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="verilen" name="Verilen" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="csv2-chart-card">
          <h3 className="csv2-chart-title">Durum Dağılımı</h3>
          {pieData.length === 0 ? (
            <div className="csv2-empty">Veri yok</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name} (${e.value})`}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, _n, item) => [`${Number(v)} adet — ${fmtTL((item?.payload as { tutar?: number })?.tutar || 0)}`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
