import type { CariHesapCariOzet, CariHesapRaporItem } from "../../types/cari-hesap-types";

export function formatReportDateRange(baslangic?: string, bitis?: string): string {
  const fmt = (d?: string) => {
    if (!d) return "";
    const [y, m, day] = d.slice(0, 10).split("-");
    return y && m && day ? `${day}.${m}.${y}` : d;
  };
  if (baslangic && bitis) return `${fmt(baslangic)} - ${fmt(bitis)}`;
  if (baslangic) return `${fmt(baslangic)} -`;
  if (bitis) return `- ${fmt(bitis)}`;
  return "Tümü";
}

export function computeRaporTotalsFromList(items: CariHesapRaporItem[]) {
  let borclu = 0;
  let alacakli = 0;
  let sifir = 0;
  let toplamBorc = 0;
  let toplamAlacak = 0;

  for (const r of items) {
    toplamBorc += Number(r.toplam_borc || 0);
    toplamAlacak += Number(r.toplam_alacak || 0);
    if (r.bakiye_durumu === "borclu") borclu += 1;
    else if (r.bakiye_durumu === "alacakli") alacakli += 1;
    else sifir += 1;
  }

  return {
    toplam_cari: items.length,
    borclu_cari: borclu,
    alacakli_cari: alacakli,
    sifir_bakiye_cari: sifir,
    toplam_borc: toplamBorc,
    toplam_alacak: toplamAlacak,
    net_bakiye: toplamBorc - toplamAlacak,
  };
}

export function computeRaporTotalsFromOzet(ozet: CariHesapCariOzet) {
  const borclu = ozet.bakiye_durumu === "borclu" ? 1 : 0;
  const alacakli = ozet.bakiye_durumu === "alacakli" ? 1 : 0;
  const sifir = ozet.bakiye_durumu === "dengede" ? 1 : 0;
  return {
    toplam_cari: 1,
    borclu_cari: borclu,
    alacakli_cari: alacakli,
    sifir_bakiye_cari: sifir,
    toplam_borc: ozet.toplam_borc,
    toplam_alacak: ozet.toplam_alacak,
    net_bakiye: ozet.bakiye,
  };
}

export function defaultRaporBaslangic(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function defaultRaporBitis(): string {
  return new Date().toISOString().slice(0, 10);
}
