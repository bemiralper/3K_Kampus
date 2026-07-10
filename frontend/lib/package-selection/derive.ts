import type {
  CatalogParentItem,
  IncludedSet,
  PackageCatalog,
  ParentPackageRef,
  StudentPackageSelection,
  BillableLineItem,
} from "./types";
import { parentTurToKategori } from "./types";

export function findParentInCatalog(
  catalog: PackageCatalog,
  parent: ParentPackageRef | null,
): CatalogParentItem | null {
  if (!parent) return null;
  const kategori = parentTurToKategori(parent.tur);
  const list = parent.tur === "grup_dersi" ? catalog.grupDersleri : catalog.premiumPaketler;
  return list.find((p) => p.id === parent.id && p.kategori === kategori) ?? null;
}

export function deriveIncludedFromParent(parent: CatalogParentItem | null): IncludedSet {
  if (!parent) {
    return {
      ekHizmetIds: new Set(),
      denemePaketiIds: new Set(),
      yayinPaketiIds: new Set(),
    };
  }
  return {
    ekHizmetIds: new Set(parent.dahil_ek_hizmet_ids || []),
    denemePaketiIds: new Set(parent.dahil_deneme_paketi_ids || []),
    yayinPaketiIds: new Set(parent.dahil_yayin_paketi_ids || []),
  };
}

export function sanitizeSelection(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
): StudentPackageSelection {
  const parentItem = findParentInCatalog(catalog, selection.parent);
  const included = deriveIncludedFromParent(parentItem);

  let ozelDersIds = [...selection.ozelDersIds];
  if (selection.parent?.tur === "premium") {
    ozelDersIds = [];
  }

  let denemePaketiId = selection.denemePaketiId;
  if (denemePaketiId != null && included.denemePaketiIds.has(denemePaketiId)) {
    denemePaketiId = null;
  }

  const yayinPaketiIds = selection.yayinPaketiIds.filter(
    (id) => !included.yayinPaketiIds.has(id),
  );

  const ekHizmetIds = selection.ekHizmetIds.filter(
    (id) => !included.ekHizmetIds.has(id),
  );

  return {
    parent: selection.parent,
    ozelDersIds,
    denemePaketiId,
    yayinPaketiIds,
    ekHizmetIds,
  };
}

export function deriveBillableItems(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
): BillableLineItem[] {
  const clean = sanitizeSelection(selection, catalog);
  const items: BillableLineItem[] = [];
  const parentItem = findParentInCatalog(catalog, clean.parent);

  if (parentItem && clean.parent) {
    items.push({
      key: `paket:${clean.parent.tur}:${parentItem.id}`,
      kalem_turu: "paket",
      paket_turu: clean.parent.tur,
      kalem_id: parentItem.id,
      kalem_adi: parentItem.ad,
      fiyat: parentItem.fiyat ?? 0,
      kdv_orani: parentItem.kdv_orani ?? 10,
    });
  }

  for (const id of clean.ozelDersIds) {
    const p = catalog.ozelDersler.find((x) => x.id === id);
    if (!p) continue;
    items.push({
      key: `paket:ozel_ders:${id}`,
      kalem_turu: "paket",
      paket_turu: "ozel_ders",
      kalem_id: id,
      kalem_adi: p.ad,
      fiyat: p.fiyat,
      kdv_orani: p.kdv_orani,
    });
  }

  if (clean.denemePaketiId != null) {
    const p = catalog.denemeler.find((x) => x.id === clean.denemePaketiId);
    if (p) {
      items.push({
        key: `paket:deneme:${p.id}`,
        kalem_turu: "paket",
        paket_turu: "deneme",
        kalem_id: p.id,
        kalem_adi: p.ad,
        fiyat: p.fiyat,
        kdv_orani: p.kdv_orani,
      });
    }
  }

  for (const id of clean.yayinPaketiIds) {
    const p = catalog.yayinPaketleri.find((x) => x.id === id);
    if (!p) continue;
    items.push({
      key: `paket:yayin:${id}`,
      kalem_turu: "paket",
      paket_turu: "yayin",
      kalem_id: id,
      kalem_adi: p.ad,
      fiyat: p.fiyat,
      kdv_orani: p.kdv_orani,
    });
  }

  for (const id of clean.ekHizmetIds) {
    const h = catalog.ekHizmetler.find((x) => x.id === id);
    if (!h || h.hizmet_turu === "deneme") continue;
    items.push({
      key: `ek:${id}`,
      kalem_turu: "ek_hizmet",
      kalem_id: id,
      kalem_adi: h.ad,
      fiyat: h.fiyat,
      kdv_orani: h.kdv_orani,
    });
  }

  return items;
}

export function deriveIncludedDisplayItems(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
) {
  const parentItem = findParentInCatalog(catalog, selection.parent);
  const included = deriveIncludedFromParent(parentItem);
  const ekHizmetler = catalog.ekHizmetler.filter((h) => included.ekHizmetIds.has(h.id));
  const denemeler = catalog.denemeler.filter((d) => included.denemePaketiIds.has(d.id));
  const yayinlar = catalog.yayinPaketleri.filter((y) => included.yayinPaketiIds.has(y.id));
  return { ekHizmetler, denemeler, yayinlar, included };
}
