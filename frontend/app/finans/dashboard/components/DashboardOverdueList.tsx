"use client";

import { useState } from "react";
import Link from "next/link";
import { useDashboardLinks } from "../useDashboardLinks";
import TopluGecikmeMesajModal from "@/components/finans/TopluGecikmeMesajModal";
import type { OverduePaymentItem } from "@/app/finans/types/overdue-types";
import { OverviewGecikenItem, OverviewGecikenOzet } from "../../services/dashboard-api";
import { fmtCurrency, fmtShortDate, fmtTutar } from "../dashboard-utils";
import { IconAlertTriangle, IconCheckCircle } from "../dashboard-icons";

interface Props {
  rows: OverviewGecikenItem[];
  ozet: OverviewGecikenOzet;
  kurumAd?: string;
}

function toOverdueItem(r: OverviewGecikenItem): OverduePaymentItem {
  return {
    taksit_id: r.taksit_id,
    sozlesme_id: r.sozlesme_id,
    sozlesme_no: r.sozlesme_no,
    ogrenci_id: r.ogrenci_id ?? 0,
    ogrenci_adi: r.ogrenci_adi,
    ogrenci_no: "",
    veli_adi: r.veli_adi,
    veli_telefon: r.veli_telefon,
    sube_id: null,
    sube_ad: null,
    sinif_id: null,
    sinif_ad: "",
    rehber_ogretmen: "",
    taksit_no: r.taksit_no,
    vade_tarihi: r.vade_tarihi,
    taksit_tutari: r.kalan_tutar,
    kalan_tutar: r.kalan_tutar,
    gecikme_gun: r.gecikme_gun,
    son_tahsilat_tarihi: null,
    toplam_gecikmis_tutar: r.kalan_tutar,
    durum_label: r.gecikme_gun >= 30 ? "30+ Gün" : r.gecikme_gun >= 8 ? "8-30 Gün" : "1-7 Gün",
    durum_renk: r.gecikme_gun >= 30 ? "red" : r.gecikme_gun >= 8 ? "orange" : "yellow",
    egitim_yili_id: null,
  };
}

export default function DashboardOverdueList({ rows, ozet, kurumAd }: Props) {
  const [selected, setSelected] = useState<OverviewGecikenItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const links = useDashboardLinks();

  const openWhatsApp = (row: OverviewGecikenItem) => {
    setSelected(row);
    setShowModal(true);
  };

  return (
    <>
      <div className="fdash-panel fdash-panel--flush">
        <div className="fdash-panel__head">
          <h3>
            <IconAlertTriangle className="w-[18px] h-[18px]" />
            Gecikmiş Borçlar
          </h3>
          <Link href={links.gecikmisOdemeler} className="fdash-panel__link">
            Tümü ({ozet.toplam_taksit_sayisi})
          </Link>
        </div>
        <div className="fdash-panel__body p-0">
          {ozet.toplam_taksit_sayisi > 0 && (
            <div className="fdash-panel__summary">
              Toplam {fmtCurrency(ozet.toplam_kalan_tutar)} · Ort. {ozet.ortalama_gecikme_gun} gün gecikme
            </div>
          )}
          <div className="finans-table-wrap max-h-80 overflow-y-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Vade</th>
                  <th>Gecikme</th>
                  <th className="text-right">Kalan</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center cell-secondary py-10">
                      <IconCheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                      Gecikmiş ödeme yok
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.taksit_id} style={{ borderLeft: "3px solid #dc2626" }}>
                      <td>
                        <div>{r.ogrenci_adi}</div>
                        <div className="cell-secondary text-xs">{r.sozlesme_no}</div>
                      </td>
                      <td className="cell-secondary">{fmtShortDate(r.vade_tarihi)}</td>
                      <td className="cell-secondary">{r.gecikme_gun} gün</td>
                      <td className="text-right cell-money">{fmtTutar(r.kalan_tutar)}</td>
                      <td className="text-right whitespace-nowrap">
                        <Link
                          href={links.odemeTakip(r.sozlesme_id)}
                          className="text-xs text-blue-600 hover:underline mr-2"
                        >
                          Tahsilat
                        </Link>
                        {r.veli_telefon && (
                          <button
                            type="button"
                            onClick={() => openWhatsApp(r)}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            WhatsApp
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && selected && (
        <TopluGecikmeMesajModal
          selectedItems={[toOverdueItem(selected)]}
          kurumAd={kurumAd}
          onClose={() => {
            setShowModal(false);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
