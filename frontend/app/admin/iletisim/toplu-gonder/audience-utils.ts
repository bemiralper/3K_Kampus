import type {
  AudienceFilter,
  AudienceFilterGroup,
  AudienceFilterNode,
  AudiencePersonType,
} from "@/lib/communication-api";

export function emptyAudienceQuery(personTypes: AudiencePersonType[] = []): AudienceFilter {
  return {
    audience_type: "query",
    person_types: personTypes,
    tree: { join: "or", groups: [] },
    excluded_ogrenci_ids: [],
    excluded_veli_ids: [],
    excluded_personel_ids: [],
    included_ogrenci_ids: [],
    included_veli_ids: [],
    included_personel_ids: [],
    label: "",
  };
}

export function cloneQuery(query: AudienceFilter): AudienceFilter {
  return JSON.parse(JSON.stringify(query));
}

export function hasAnyFilter(query: AudienceFilter): boolean {
  return (query.tree?.groups || []).some((g) => (g.filters || []).length > 0);
}

export function personTypeLabel(type: string): string {
  if (type === "ogrenci") return "Öğrenci";
  if (type === "veli") return "Veli";
  if (type === "personel") return "Personel";
  return type;
}

export function formatFilterValue(value: unknown, optionLabel?: (raw: string) => string): string {
  const items = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  if (!items.length) return "seçilmedi";
  return items
    .map((item) => {
      const raw = typeof item === "object" && item
        ? String((item as { label?: string; id?: unknown }).label || (item as { id?: unknown }).id || "")
        : String(item);
      return optionLabel ? optionLabel(raw) : raw;
    })
    .join(", ");
}

export function togglePersonType(current: AudiencePersonType[], next: AudiencePersonType): AudiencePersonType[] {
  return current.includes(next) ? current.filter((t) => t !== next) : [...current, next];
}

export function addFilterToGroup(
  query: AudienceFilter,
  groupIndex: number,
  node: AudienceFilterNode,
): AudienceFilter {
  const next = cloneQuery(query);
  const groups = next.tree?.groups ? [...next.tree.groups] : [];
  while (groups.length <= groupIndex) {
    groups.push({ join: "and", filters: [] });
  }
  const group = { ...groups[groupIndex], filters: [...(groups[groupIndex].filters || [])] };
  const existing = group.filters.findIndex((f) => f.field === node.field);
  if (existing >= 0) group.filters[existing] = node;
  else group.filters.push(node);
  groups[groupIndex] = group;
  next.tree = { join: next.tree?.join || "or", groups };
  return next;
}

export function removeFilter(query: AudienceFilter, groupIndex: number, field: string): AudienceFilter {
  const next = cloneQuery(query);
  const groups = [...(next.tree?.groups || [])];
  if (!groups[groupIndex]) return next;
  groups[groupIndex] = {
    ...groups[groupIndex],
    filters: (groups[groupIndex].filters || []).filter((f) => f.field !== field),
  };
  next.tree = { join: next.tree?.join || "or", groups };
  return next;
}

export function addGroup(query: AudienceFilter): AudienceFilter {
  const next = cloneQuery(query);
  const groups = [...(next.tree?.groups || []), { join: "and", filters: [] } as AudienceFilterGroup];
  next.tree = { join: next.tree?.join || "or", groups };
  return next;
}

export function removeGroup(query: AudienceFilter, groupIndex: number): AudienceFilter {
  const next = cloneQuery(query);
  next.tree = {
    join: next.tree?.join || "or",
    groups: (next.tree?.groups || []).filter((_, i) => i !== groupIndex),
  };
  return next;
}

export function setTreeJoin(query: AudienceFilter, join: "and" | "or"): AudienceFilter {
  const next = cloneQuery(query);
  next.tree = { join, groups: next.tree?.groups || [] };
  return next;
}

export function applyQuickStart(
  personTypes: AudiencePersonType[],
  addField?: string,
): AudienceFilter {
  const query = emptyAudienceQuery(personTypes);
  if (addField) {
    query.tree = {
      join: "or",
      groups: [{ join: "and", filters: [{ field: addField, op: "in", value: [] }] }],
    };
  }
  return query;
}

export function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
}

export function includePerson(
  query: AudienceFilter,
  kind: "ogrenci" | "veli" | "personel",
  id: number,
): AudienceFilter {
  const next = cloneQuery(query);
  if (kind === "ogrenci") {
    next.included_ogrenci_ids = uniqueIds([...(next.included_ogrenci_ids || []), id]);
    next.excluded_ogrenci_ids = (next.excluded_ogrenci_ids || []).filter((item) => item !== id);
  } else if (kind === "veli") {
    next.included_veli_ids = uniqueIds([...(next.included_veli_ids || []), id]);
    next.excluded_veli_ids = (next.excluded_veli_ids || []).filter((item) => item !== id);
  } else {
    next.included_personel_ids = uniqueIds([...(next.included_personel_ids || []), id]);
    next.excluded_personel_ids = (next.excluded_personel_ids || []).filter((item) => item !== id);
  }
  return next;
}

export function excludePerson(
  query: AudienceFilter,
  kind: "ogrenci" | "veli" | "personel",
  id: number,
): AudienceFilter {
  const next = cloneQuery(query);
  if (kind === "ogrenci") {
    next.excluded_ogrenci_ids = uniqueIds([...(next.excluded_ogrenci_ids || []), id]);
    next.included_ogrenci_ids = (next.included_ogrenci_ids || []).filter((item) => item !== id);
  } else if (kind === "veli") {
    next.excluded_veli_ids = uniqueIds([...(next.excluded_veli_ids || []), id]);
    next.included_veli_ids = (next.included_veli_ids || []).filter((item) => item !== id);
  } else {
    next.excluded_personel_ids = uniqueIds([...(next.excluded_personel_ids || []), id]);
    next.included_personel_ids = (next.included_personel_ids || []).filter((item) => item !== id);
  }
  return next;
}

export function unexcludePerson(
  query: AudienceFilter,
  kind: "ogrenci" | "veli" | "personel",
  id: number,
): AudienceFilter {
  const next = cloneQuery(query);
  if (kind === "ogrenci") {
    next.excluded_ogrenci_ids = (next.excluded_ogrenci_ids || []).filter((item) => item !== id);
  } else if (kind === "veli") {
    next.excluded_veli_ids = (next.excluded_veli_ids || []).filter((item) => item !== id);
  } else {
    next.excluded_personel_ids = (next.excluded_personel_ids || []).filter((item) => item !== id);
  }
  return next;
}

export function removeIncluded(
  query: AudienceFilter,
  kind: "ogrenci" | "veli" | "personel",
  id: number,
): AudienceFilter {
  const next = cloneQuery(query);
  if (kind === "ogrenci") {
    next.included_ogrenci_ids = (next.included_ogrenci_ids || []).filter((item) => item !== id);
  } else if (kind === "veli") {
    next.included_veli_ids = (next.included_veli_ids || []).filter((item) => item !== id);
  } else {
    next.included_personel_ids = (next.included_personel_ids || []).filter((item) => item !== id);
  }
  return next;
}

export function listedIncludes(query: AudienceFilter): Array<{ kind: "ogrenci" | "veli" | "personel"; id: number }> {
  return [
    ...(query.included_ogrenci_ids || []).map((id) => ({ kind: "ogrenci" as const, id })),
    ...(query.included_veli_ids || []).map((id) => ({ kind: "veli" as const, id })),
    ...(query.included_personel_ids || []).map((id) => ({ kind: "personel" as const, id })),
  ];
}

export function hasIncluded(query: AudienceFilter): boolean {
  return listedIncludes(query).length > 0;
}

export function querySummary(query: AudienceFilter): string {
  if (query.label) return query.label;
  const types = (query.person_types || []).map((t) => {
    if (t === "ogrenci") return "öğrenciler";
    if (t === "veli") return "veliler";
    return "personeller";
  });
  const extras = listedIncludes(query).length;
  if (!types.length && extras) return `${extras} seçilen kişi`;
  const who = types.join(" + ") || "kişiler";
  if (!hasAnyFilter(query) && !extras) return `Tüm ${who}`;
  return extras ? `Seçilen ${who} + ${extras} kişi` : `Seçilen ${who}`;
}
