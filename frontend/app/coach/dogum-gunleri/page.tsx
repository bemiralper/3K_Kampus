"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchCoachBirthdays, type CoachBirthdayItem } from "@/lib/coach-api";
import "./dogum-gunleri.css";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

const PALETTES: [string, string][] = [
  ["#fb7185", "#9f1239"],
  ["#f59e0b", "#c2410c"],
  ["#f472b6", "#9d174d"],
  ["#38bdf8", "#075985"],
  ["#a78bfa", "#5b21b6"],
  ["#34d399", "#047857"],
  ["#fb923c", "#9a3412"],
  ["#60a5fa", "#1d4ed8"],
];

type FilterId = "all" | "today" | "soon" | "past";

function formatTrDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function dayParts(iso: string): { day: string; month: string } {
  const [, month, day] = iso.split("-").map(Number);
  return {
    day: String(day || ""),
    month: MONTHS_SHORT[(month || 1) - 1] || "",
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("tr");
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase("tr");
}

function palette(name: string): [string, string] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function matchesQuery(row: CoachBirthdayItem, query: string): boolean {
  if (!query) return true;
  const hay = `${row.ad_soyad} ${row.sinif}`.toLocaleLowerCase("tr");
  return hay.includes(query);
}

export default function CoachDogumGunleriPage() {
  const [rows, setRows] = useState<CoachBirthdayItem[]>([]);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const day = new URLSearchParams(window.location.search).get("dogum-gunu");
    const focus = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
    setFocusDate(focus);
    let cancelled = false;
    fetchCoachBirthdays(focus).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error || "Doğum günleri yüklenemedi");
        setRows([]);
      } else {
        setRows(res.data ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = query.trim().toLocaleLowerCase("tr");
  const visible = useMemo(
    () => rows.filter((row) => matchesQuery(row, needle)),
    [rows, needle],
  );

  const today = visible.filter((row) => row.kalan_gun === 0);
  const soon = visible.filter((row) => row.kalan_gun > 0);
  const past = visible.filter((row) => row.kalan_gun < 0).sort((a, b) => b.kalan_gun - a.kalan_gun);
  const focusCount = focusDate ? rows.filter((row) => row.tarih === focusDate).length : 0;
  const focused = focusDate ? visible.filter((row) => row.tarih === focusDate) : [];

  const feature = useMemo(() => {
    if (filter === "today") {
      return { title: "Bugün", hint: "Kutlanacak öğrenciler", people: today };
    }
    if (filter === "soon" || filter === "past") return null;
    if (focused.length > 0 && focusDate) {
      return {
        title: formatTrDate(focusDate),
        hint: focused[0]?.etiket || "Bildirimdeki gün",
        people: focused,
      };
    }
    if (today.length > 0) {
      return { title: "Bugün", hint: "Kutlanacak öğrenciler", people: today };
    }
    if (soon.length > 0) {
      const day = soon[0].tarih;
      return {
        title: "Sıradaki kutlama",
        hint: formatTrDate(day),
        people: soon.filter((row) => row.tarih === day),
      };
    }
    return null;
  }, [filter, focused, focusDate, today, soon]);

  const featureIds = new Set(feature?.people.map((row) => row.ogrenci_id) ?? []);
  const upcomingGroups = groupByDate(soon.filter((row) => !featureIds.has(row.ogrenci_id)));
  const pastRest = past.filter((row) => !featureIds.has(row.ogrenci_id));

  const todayTotal = rows.filter((row) => row.kalan_gun === 0).length;
  const soonTotal = rows.filter((row) => row.kalan_gun > 0).length;
  const pastTotal = rows.filter((row) => row.kalan_gun < 0).length;

  const hero = heroCopy(rows, focusDate, focusCount);

  return (
    <div className="bday">
      <section className="bday-hero">
        <span className="bday-hero-orb bday-hero-orb-a" aria-hidden />
        <span className="bday-hero-orb bday-hero-orb-b" aria-hidden />
        <div className="bday-hero-copy">
          <p className="bday-kicker">Kutlamalar</p>
          <h2>{hero.title}</h2>
          <p className="bday-hero-lede">{hero.lede}</p>
        </div>
        <div className="bday-stats" role="tablist" aria-label="Doğum günü dönemleri">
          <StatButton id="today" label="Bugün" count={todayTotal} active={filter === "today"} onSelect={setFilter} />
          <StatButton id="soon" label="Yaklaşan" count={soonTotal} active={filter === "soon"} onSelect={setFilter} />
          <StatButton id="past" label="Geçen" count={pastTotal} active={filter === "past"} onSelect={setFilter} />
        </div>
      </section>

      <div className="bday-toolbar">
        <input
          className="bday-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Öğrenci veya sınıf ara"
          aria-label="Öğrenci veya sınıf ara"
        />
        {filter !== "all" && (
          <button type="button" className="bday-clear" onClick={() => setFilter("all")}>
            Tümü
          </button>
        )}
      </div>

      {loading && (
        <div className="bday-grid" aria-hidden>
          <div className="bday-skeleton" />
          <div className="bday-skeleton" />
          <div className="bday-skeleton" />
        </div>
      )}

      {error && <p className="bday-error">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <div className="bday-empty">
          <h3>{needle ? "Eşleşen öğrenci yok" : "Bu aralıkta doğum günü yok"}</h3>
          <p>{needle ? "Aramayı kısaltıp yeniden deneyin." : "Yeni kayıtlar geldikçe bu sayfa dolacak."}</p>
        </div>
      )}

      {!loading && !error && feature && (
        <section>
          <div className="bday-section-head">
            <h3>{feature.title}</h3>
            <span>{feature.hint}</span>
          </div>
          {feature.people.length === 0 ? (
            <div className="bday-empty">
              <h3>Bugün doğum günü olan öğrenci yok</h3>
              <p>Yaklaşan kutlamalar diğer sekmede.</p>
            </div>
          ) : (
            <div className="bday-grid">
              {feature.people.map((row) => (
                <BirthdayCard key={row.ogrenci_id} row={row} />
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && !error && filter !== "past" && filter !== "today" && upcomingGroups.length > 0 && (
        <section>
          <div className="bday-section-head">
            <h3>Yaklaşan</h3>
            <span>Önümüzdeki 30 gün</span>
          </div>
          <div className="bday-days">
            {upcomingGroups.map((group) => (
              <DayGroup key={group.tarih} tarih={group.tarih} etiket={group.etiket} rows={group.rows} />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && filter === "soon" && soon.length === 0 && visible.length > 0 && (
        <div className="bday-empty">
          <h3>Önümüzdeki 30 günde doğum günü yok</h3>
          <p>Son günlerdeki kutlamalar diğer sekmede.</p>
        </div>
      )}

      {!loading && !error && (filter === "all" || filter === "past") && pastRest.length > 0 && (
        <section>
          <div className="bday-section-head">
            <h3>Son günler</h3>
            <span>Geçen hafta</span>
          </div>
          <div className="bday-grid">
            {pastRest.map((row) => (
              <BirthdayCard key={row.ogrenci_id} row={row} muted />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && filter === "past" && past.length === 0 && visible.length > 0 && (
        <div className="bday-empty">
          <h3>Son 7 günde doğum günü yok</h3>
          <p>Yaklaşan liste dolu.</p>
        </div>
      )}
    </div>
  );
}

function heroCopy(
  rows: CoachBirthdayItem[],
  focusDate: string | null,
  focusCount: number,
): { title: string; lede: string } {
  const todayCount = rows.filter((row) => row.kalan_gun === 0).length;
  if (focusDate && focusCount > 0) {
    return {
      title: formatTrDate(focusDate),
      lede: focusCount === 1
        ? "Bildirimdeki öğrenci bu günde kutluyor."
        : `Bildirimdeki ${focusCount} öğrenci bu günde kutluyor.`,
    };
  }
  if (todayCount > 0) {
    return {
      title: todayCount === 1 ? "Bugün bir öğrenci kutluyor" : `Bugün ${todayCount} öğrenci kutluyor`,
      lede: "Karttan profile geçip gününü iletebilirsin.",
    };
  }
  const next = rows.find((row) => row.kalan_gun > 0);
  if (next) {
    return {
      title: `Sıradaki kutlama ${next.etiket.toLocaleLowerCase("tr")}`,
      lede: `${next.ad_soyad}${next.sinif ? ` · ${next.sinif}` : ""}`,
    };
  }
  return {
    title: "Doğum günleri",
    lede: "Bugün, son 7 gün ve önümüzdeki 30 gün.",
  };
}

function StatButton({
  id,
  label,
  count,
  active,
  onSelect,
}: {
  id: FilterId;
  label: string;
  count: number;
  active: boolean;
  onSelect: (id: FilterId) => void;
}) {
  return (
    <button
      type="button"
      className={`bday-stat${active ? " is-active" : ""}`}
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(active && id !== "all" ? "all" : id)}
    >
      <span className="bday-stat-num">{count}</span>
      <span className="bday-stat-label">{label}</span>
    </button>
  );
}

function groupByDate(rows: CoachBirthdayItem[]): { tarih: string; etiket: string; rows: CoachBirthdayItem[] }[] {
  const groups: { tarih: string; etiket: string; rows: CoachBirthdayItem[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.tarih === row.tarih) last.rows.push(row);
    else groups.push({ tarih: row.tarih, etiket: row.etiket, rows: [row] });
  }
  return groups;
}

function DayGroup({
  tarih,
  etiket,
  rows,
}: {
  tarih: string;
  etiket: string;
  rows: CoachBirthdayItem[];
}) {
  const parts = dayParts(tarih);
  return (
    <article className="bday-day">
      <div className="bday-day-mark">
        <strong>{parts.day}</strong>
        <span>{parts.month}</span>
        <em>{etiket}</em>
      </div>
      <div className="bday-day-people">
        {rows.map((row) => (
          <BirthdayCard key={row.ogrenci_id} row={row} />
        ))}
      </div>
    </article>
  );
}

function BirthdayCard({ row, muted = false }: { row: CoachBirthdayItem; muted?: boolean }) {
  const [from, to] = palette(row.ad_soyad);
  const body = (
    <>
      <div className="bday-card-top">
        <span
          className="bday-avatar"
          style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}
          aria-hidden
        >
          {initials(row.ad_soyad)}
        </span>
        <div className="bday-card-id">
          <h3>{row.ad_soyad}</h3>
          {row.sinif ? <p>{row.sinif}</p> : null}
        </div>
        {row.can_open && (
          <span className="bday-card-go" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
            </svg>
          </span>
        )}
      </div>
      <div className="bday-pills">
        {row.yas != null && <span className="bday-pill">{row.yas} yaş</span>}
        <span className={`bday-pill${row.kalan_gun === 0 ? " is-today" : " is-soft"}`}>{row.etiket}</span>
      </div>
    </>
  );

  if (!row.can_open) {
    return <article className={`bday-card${muted ? " is-muted" : ""}`}>{body}</article>;
  }

  return (
    <Link href={`/coach/ogrenciler/${row.ogrenci_id}`} className={`bday-card${muted ? " is-muted" : ""}`}>
      {body}
    </Link>
  );
}
