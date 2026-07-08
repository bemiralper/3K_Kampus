"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GelirKategorisiTreeItem } from "../types/gelir-kategori-types";
import type { GiderKategorisiTreeItem } from "../types/gider-kategori-types";

type TreeItem = GelirKategorisiTreeItem | GiderKategorisiTreeItem;

export default function CariV2KategoriPicker({
  tree,
  loading,
  selectedIds,
  onChange,
  placeholder = "Kategori seçin",
}: {
  tree: TreeItem[];
  loading?: boolean;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded(new Set(tree.map((k) => k.id)));
  }, [tree]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      tree
        .map((ana) => ({
          ...ana,
          alt_kategoriler: (ana.alt_kategoriler ?? []).filter(
            (alt) => !q || alt.ad.toLowerCase().includes(q),
          ),
        }))
        .filter((ana) => !q || ana.ad.toLowerCase().includes(q) || ana.alt_kategoriler.length > 0),
    [tree, q],
  );

  const labelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const ana of tree) {
      map.set(ana.id, ana.ad);
      for (const alt of ana.alt_kategoriler ?? []) {
        map.set(alt.id, `${ana.ad} › ${alt.ad}`);
      }
    }
    return map;
  }, [tree]);

  const selLabels = selectedIds.map((id) => labelMap.get(id)).filter(Boolean) as string[];

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const toggleExp = (id: number) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  return (
    <div ref={ref} className="cv2-katpick">
      <button type="button" className={`cv2-katpick__trigger ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
        <span className="cv2-katpick__trigger-text">
          {selLabels.length === 0 ? (
            <span className="cv2-muted">{placeholder}</span>
          ) : (
            <span>{selLabels.length} kategori seçili</span>
          )}
        </span>
        <span className={`cv2-katpick__chev ${open ? "open" : ""}`}>▾</span>
      </button>

      {selLabels.length > 0 && (
        <div className="cv2-katpick__tags">
          {selectedIds.map((id) => {
            const lbl = labelMap.get(id);
            if (!lbl) return null;
            return (
              <span key={id} className="cv2-katpick__tag">
                {lbl}
                <button type="button" onClick={() => toggle(id)} aria-label="Kaldır">×</button>
              </span>
            );
          })}
          <button type="button" className="cv2-katpick__clear" onClick={() => onChange([])}>Temizle</button>
        </div>
      )}

      {open && (
        <div className="cv2-katpick__panel">
          <div className="cv2-katpick__search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kategori ara…"
            />
          </div>
          <div className="cv2-katpick__list">
            {loading ? (
              <div className="cv2-muted" style={{ padding: 16, textAlign: "center", fontSize: 12 }}>Yükleniyor…</div>
            ) : filtered.length === 0 ? (
              <div className="cv2-muted" style={{ padding: 16, textAlign: "center", fontSize: 12 }}>
                {search ? "Sonuç bulunamadı" : "Kategori tanımlanmamış"}
              </div>
            ) : (
              filtered.map((ana) => (
                <div key={ana.id} className="cv2-katpick__group">
                  <div className="cv2-katpick__ana">
                    <button type="button" className="cv2-katpick__exp" onClick={() => toggleExp(ana.id)}>
                      <span className={expanded.has(ana.id) ? "open" : ""}>›</span>
                    </button>
                    <label className="cv2-katpick__row">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(ana.id)}
                        onChange={() => toggle(ana.id)}
                      />
                      <span className="cv2-katpick__ana-label">{ana.ad}</span>
                    </label>
                  </div>
                  {expanded.has(ana.id) && (ana.alt_kategoriler ?? []).length > 0 && (
                    <div className="cv2-katpick__alts">
                      {ana.alt_kategoriler.map((alt) => (
                        <label key={alt.id} className="cv2-katpick__row cv2-katpick__alt">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(alt.id)}
                            onChange={() => toggle(alt.id)}
                          />
                          <span>{alt.ad}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="cv2-katpick__foot">
            <span className="cv2-muted" style={{ fontSize: 11 }}>
              {selectedIds.length > 0 ? `${selectedIds.length} seçili` : "Hiç seçilmedi"}
            </span>
            <button type="button" className="cv2-btn cv2-btn--sm" onClick={() => setOpen(false)}>Tamam</button>
          </div>
        </div>
      )}
    </div>
  );
}
