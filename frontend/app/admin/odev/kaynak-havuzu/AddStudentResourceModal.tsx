"use client";

import { useEffect, useMemo, useState } from "react";
import {
  bulkAssignResources,
  fetchAvailableResources,
  type AvailableResource,
} from "@/lib/resources-api";
import { BookCover } from "@/components/resources/BookCover";
import { BookContentCompleteBadge } from "@/components/resources/BookContentCompleteBadge";

const OWNERSHIP = [
  { value: "STUDENT_OWNED", label: "Öğrencide var" },
  { value: "TO_PURCHASE", label: "Satın alınacak" },
  { value: "INSTITUTION_PROVIDED", label: "Kurum verecek" },
] as const;

type Ownership = (typeof OWNERSHIP)[number]["value"];

interface AddStudentResourceModalProps {
  open: boolean;
  studentId: string;
  ownedResources: AvailableResource[];
  initialLessonId?: number | null;
  onClose: () => void;
  onAdded: (message: string, tone: "success" | "error") => void;
}

function formatDifficulty(resource: AvailableResource): string | null {
  if (resource.zorluk_display) return resource.zorluk_display;
  if (resource.zorluk_min != null && resource.zorluk_max != null) {
    return `${resource.zorluk_min}-${resource.zorluk_max}`;
  }
  if (resource.zorluk_min != null) return `${resource.zorluk_min}+`;
  if (resource.zorluk_max != null) return `1-${resource.zorluk_max}`;
  return null;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
}

export default function AddStudentResourceModal({
  open,
  studentId,
  ownedResources,
  initialLessonId = null,
  onClose,
  onAdded,
}: AddStudentResourceModalProps) {
  const [resources, setResources] = useState<AvailableResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lesson, setLesson] = useState("all");
  const [bookType, setBookType] = useState("all");
  const [publisher, setPublisher] = useState("all");
  const [selected, setSelected] = useState<Record<number, AvailableResource>>({});
  const [ownership, setOwnership] = useState<Ownership>("STUDENT_OWNED");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const assigned = useMemo(
    () => new Set(ownedResources.map((resource) => resource.id)),
    [ownedResources],
  );
  const catalog = useMemo(() => {
    const seen = new Set(resources.map((resource) => resource.id));
    return [
      ...resources,
      ...ownedResources.filter((resource) => !seen.has(resource.id)),
    ];
  }, [resources, ownedResources]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLesson("all");
    setBookType("all");
    setPublisher("all");
    setSelected({});
    setOwnership("STUDENT_OWNED");
    setDueDate("");
    setLoadError(null);
    let cancelled = false;
    setLoading(true);
    fetchAvailableResources({
      student_ids: parseInt(studentId, 10),
      exclude_assigned: false,
      limit: 1000,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setResources(result.data);
          if (initialLessonId != null) {
            setLesson(String(initialLessonId));
          }
        } else {
          setResources([]);
          setLoadError("Kaynaklar yüklenemedi.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResources([]);
          setLoadError("Kaynaklar yüklenemedi.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, studentId, initialLessonId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  const lessons = useMemo(() => {
    const byId = new Map<number, string>();
    catalog.forEach((resource) => {
      if (resource.ders_id != null && !byId.has(resource.ders_id)) {
        byId.set(resource.ders_id, resource.ders_ad || "Ders");
      }
    });
    return [...byId.entries()]
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [catalog]);
  const types = useMemo(() => uniqueSorted(catalog.map((resource) => resource.book_type)), [catalog]);
  const publishers = useMemo(() => uniqueSorted(catalog.map((resource) => resource.yayinevi)), [catalog]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr");
    return catalog.filter((resource) => {
      if (lesson !== "all" && String(resource.ders_id) !== lesson) return false;
      if (bookType !== "all" && resource.book_type !== bookType) return false;
      if (publisher !== "all" && resource.yayinevi !== publisher) return false;
      if (!needle) return true;
      const haystack = `${resource.ad} ${resource.kod || ""} ${resource.yayinevi || ""} ${resource.book_type || ""} ${resource.ders_ad || ""}`.toLocaleLowerCase("tr");
      return haystack.includes(needle);
    });
  }, [catalog, query, lesson, bookType, publisher]);

  const available = filtered.filter((resource) => !assigned.has(resource.id));
  const owned = filtered.filter((resource) => assigned.has(resource.id));
  const selectedList = Object.values(selected);

  const toggle = (resource: AvailableResource) => {
    if (assigned.has(resource.id) || saving) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[resource.id]) delete next[resource.id];
      else next[resource.id] = resource;
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedList.length === 0 || saving) return;
    setSaving(true);
    try {
      const result = await bulkAssignResources({
        student_ids: [parseInt(studentId, 10)],
        resource_book_ids: selectedList.map((resource) => resource.id),
        ownership_type: ownership,
        due_date: dueDate || null,
        notes: "",
      });
      if (result.success) {
        const created = result.data?.created ?? 0;
        const skipped = result.data?.skipped ?? 0;
        const errorCount = result.data?.errors?.length ?? 0;
        let message = `${created} kaynak eklendi`;
        if (skipped) message += ` · ${skipped} zaten atanmıştı`;
        if (errorCount) message += ` · ${errorCount} hata`;
        onAdded(message, errorCount ? "error" : "success");
        onClose();
      } else {
        const errorMsg = typeof result.error === "string" ? result.error : "Kaynak eklenemedi";
        onAdded(errorMsg, "error");
      }
    } catch {
      onAdded("Kaynak eklenemedi", "error");
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="kh-add-shell" role="presentation">
      <div className="kh-add-dialog" role="dialog" aria-modal="true" aria-labelledby="kh-add-title">
        <header className="kh-add-head">
          <div>
            <h3 id="kh-add-title">Kaynak ekle</h3>
            <p>Birden fazla kaynak seçin. Öğrencide olanlar listede durur, yeniden seçilemez.</p>
          </div>
          <button type="button" className="kh-add-close" onClick={onClose} aria-label="Kapat" disabled={saving}>
            ×
          </button>
        </header>

        <div className="kh-add-filters">
          <input
            className="kh-add-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kaynak, yayınevi veya kod ara"
            autoFocus
          />
          <select value={lesson} onChange={(event) => setLesson(event.target.value)} aria-label="Ders">
            <option value="all">Tüm dersler</option>
            {lessons.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select value={bookType} onChange={(event) => setBookType(event.target.value)} aria-label="Kaynak türü">
            <option value="all">Tüm türler</option>
            {types.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select value={publisher} onChange={(event) => setPublisher(event.target.value)} aria-label="Yayınevi">
            <option value="all">Tüm yayınevleri</option>
            {publishers.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="kh-add-meta">
          {loading
            ? "Kaynaklar yükleniyor"
            : `${available.length} eklenebilir · ${owned.length} öğrencide var`}
        </div>

        <div className="kh-add-list">
          {loadError ? (
            <div className="kh-add-empty">{loadError}</div>
          ) : loading ? (
            <div className="kh-add-empty">Kaynaklar yükleniyor…</div>
          ) : available.length === 0 && owned.length === 0 ? (
            <div className="kh-add-empty">Bu filtreye uyan kaynak yok.</div>
          ) : (
            <>
              {available.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  checked={Boolean(selected[resource.id])}
                  onToggle={() => toggle(resource)}
                />
              ))}
              {owned.length > 0 && (
                <div className="kh-add-section">Öğrencide olanlar</div>
              )}
              {owned.map((resource) => (
                <ResourceRow key={resource.id} resource={resource} owned />
              ))}
            </>
          )}
        </div>

        <section className="kh-add-picked" aria-label="Seçilen kaynaklar">
          <div className="kh-add-picked-title">
            Seçilen kaynaklar
            <span>{selectedList.length}</span>
          </div>
          {selectedList.length === 0 ? (
            <p className="kh-add-picked-empty">Henüz kaynak seçilmedi.</p>
          ) : (
            <ul>
              {selectedList.map((resource) => (
                <li key={resource.id}>
                  <BookCover src={resource.kapak_url} alt="" size="sm" zoomable={false} />
                  <span>
                    <strong>{resource.ad}</strong>
                    <em>{resource.ders_ad}</em>
                  </span>
                  <button type="button" onClick={() => toggle(resource)} aria-label={`${resource.ad} seçimini kaldır`}>
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="kh-add-foot">
          <div className="kh-add-own" role="radiogroup" aria-label="Sahiplik">
            {OWNERSHIP.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={ownership === option.value}
                className={ownership === option.value ? "is-on" : ""}
                onClick={() => setOwnership(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="kh-add-date">
            Son tarih
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <div className="kh-add-actions">
            <button type="button" className="kh-add-cancel" onClick={onClose} disabled={saving}>
              Vazgeç
            </button>
            <button
              type="button"
              className="kh-add-save"
              onClick={handleSave}
              disabled={selectedList.length === 0 || saving}
            >
              {saving ? "Ekleniyor…" : `${selectedList.length} kaynak ekle`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ResourceRow({
  resource,
  checked = false,
  owned = false,
  onToggle,
}: {
  resource: AvailableResource;
  checked?: boolean;
  owned?: boolean;
  onToggle?: () => void;
}) {
  const difficulty = formatDifficulty(resource);
  const className = `kh-add-row${checked ? " is-on" : ""}${owned ? " is-owned" : ""}`;
  const body = (
    <>
      <span className="kh-add-check" aria-hidden="true">{owned ? "" : checked ? "✓" : ""}</span>
      <BookCover src={resource.kapak_url} alt="" size="sm" zoomable={false} />
      <span className="kh-add-copy">
        <span className="kh-add-name">{resource.ad}</span>
        <span className="kh-add-sub">
          {resource.ders_ad}
          {resource.book_type ? ` · ${resource.book_type}` : ""}
          {resource.yayinevi ? ` · ${resource.yayinevi}` : ""}
          {resource.yayin_yili ? ` · ${resource.yayin_yili}` : ""}
          {resource.icerik_tamamlandi_mi ? <BookContentCompleteBadge /> : null}
        </span>
      </span>
      {owned ? (
        <span className="kh-add-owned">Öğrencide var</span>
      ) : (
        <span className="kh-add-diff">{difficulty ? `Zorluk ${difficulty}` : "Zorluk —"}</span>
      )}
    </>
  );

  if (owned) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" className={className} onClick={onToggle} aria-pressed={checked}>
      {body}
    </button>
  );
}
