"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  bulkArchiveBooks,
  downloadAnalyticsPdf,
  fetchAnalyticsActionItems,
  fetchAnalyticsAvgPerStudent,
  fetchAnalyticsBookStudents,
  fetchAnalyticsByCoach,
  fetchAnalyticsByLesson,
  fetchAnalyticsChurn,
  fetchAnalyticsHotIncomplete,
  fetchAnalyticsIdle,
  fetchAnalyticsIncomplete,
  fetchAnalyticsIntervention,
  fetchAnalyticsMatrix,
  fetchAnalyticsPoolGrowth,
  fetchAnalyticsPriority,
  fetchAnalyticsPublishers,
  fetchAnalyticsSearch,
  fetchAnalyticsSummary,
  fetchAnalyticsTopBooks,
  fetchAnalyticsUsageRate,
  fetchAnalyticsUsageTrend,
  fetchPublishers,
  type ResourcePublisher,
} from "@/lib/resources-api";
import { notifyResourcesChanged } from "@/lib/resources-events";
import SortableTable from "./SortableTable";

type Filters = { publisher?: string; icerik?: string };

type InnerTab = {
  id: string;
  label: string;
  pdfType: string;
};

const INNER_TABS: InnerTab[] = [
  { id: "ozet", label: "Özet", pdfType: "genel" },
  { id: "kullanim", label: "Kullanım", pdfType: "top" },
  { id: "yayinevi", label: "Yayınevi", pdfType: "yayinevi" },
  { id: "ders", label: "Ders", pdfType: "ders" },
  { id: "icerik", label: "İçerik", pdfType: "eksik" },
  { id: "koc", label: "Koç", pdfType: "genel" },
  { id: "atil", label: "Atıl", pdfType: "genel" },
  { id: "degisim", label: "Değişim", pdfType: "genel" },
];

export default function AnalizPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [innerTab, setInnerTab] = useState("ozet");
  const [filters, setFilters] = useState<Filters>({});
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [actions, setActions] = useState<Record<string, number>>({});
  const [priority, setPriority] = useState<Record<string, number>>({});
  const [topBooks, setTopBooks] = useState<any[]>([]);
  const [topMetric, setTopMetric] = useState<"students" | "intensity">("students");
  const [publishers, setPublishers] = useState<any[]>([]);
  const [byLesson, setByLesson] = useState<any[]>([]);
  const [incomplete, setIncomplete] = useState<any[]>([]);
  const [intervention, setIntervention] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [avgStudent, setAvgStudent] = useState<any[]>([]);
  const [byCoach, setByCoach] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<any>(null);
  const [usageRate, setUsageRate] = useState<Record<string, number>>({});
  const [idle, setIdle] = useState<any[]>([]);
  const [idleDays, setIdleDays] = useState("");
  const [hot, setHot] = useState<any[]>([]);
  const [growth, setGrowth] = useState<any[]>([]);
  const [churn, setChurn] = useState<any[]>([]);
  const [pubOptions, setPubOptions] = useState<ResourcePublisher[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [studentDrawer, setStudentDrawer] = useState<{
    bookId: number;
    ad: string;
    students: Array<{
      assignment_id: number;
      student_id: number;
      ad: string;
      soyad: string;
      assigned_at?: string | null;
    }>;
  } | null>(null);
  const [studentDrawerLoading, setStudentDrawerLoading] = useState(false);
  const [idleSelected, setIdleSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const fp = {
    publisher: filters.publisher,
    icerik: filters.icerik,
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [
      s, a, p, top, pubs, lesson, inc, inter, tr, avg, coach, mx, ur, idl, ht, gr, ch,
    ] = await Promise.all([
      fetchAnalyticsSummary(fp),
      fetchAnalyticsActionItems(fp),
      fetchAnalyticsPriority(fp),
      fetchAnalyticsTopBooks({ ...fp, metric: topMetric, limit: "20" }),
      fetchAnalyticsPublishers(fp),
      fetchAnalyticsByLesson(fp),
      fetchAnalyticsIncomplete(fp),
      fetchAnalyticsIntervention(fp),
      fetchAnalyticsUsageTrend(fp),
      fetchAnalyticsAvgPerStudent(fp),
      fetchAnalyticsByCoach(fp),
      fetchAnalyticsMatrix(fp),
      fetchAnalyticsUsageRate(fp),
      fetchAnalyticsIdle({ ...fp, days: idleDays || undefined }),
      fetchAnalyticsHotIncomplete(fp),
      fetchAnalyticsPoolGrowth(fp),
      fetchAnalyticsChurn(fp),
    ]);
    setSummary(s.data || {});
    setActions(a.data || {});
    setPriority(p.data || {});
    setTopBooks(Array.isArray(top.data) ? top.data : []);
    setPublishers(Array.isArray(pubs.data) ? pubs.data : []);
    setByLesson(Array.isArray(lesson.data) ? lesson.data : []);
    setIncomplete(Array.isArray(inc.data) ? inc.data : []);
    setIntervention(Array.isArray(inter.data) ? inter.data : []);
    setTrend(Array.isArray(tr.data) ? tr.data : []);
    setAvgStudent(Array.isArray(avg.data) ? avg.data : []);
    setByCoach(Array.isArray(coach.data) ? coach.data : []);
    setMatrix(mx.data || null);
    setUsageRate(ur.data || {});
    setIdle(Array.isArray(idl.data) ? idl.data : []);
    setHot(Array.isArray(ht.data) ? ht.data : []);
    setGrowth(Array.isArray(gr.data) ? gr.data : []);
    setChurn(Array.isArray(ch.data) ? ch.data : []);
    setLoading(false);
  }, [filters.publisher, filters.icerik, topMetric, idleDays]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    fetchPublishers({ aktif: "true" }).then((r) => {
      const data = Array.isArray(r.data) ? r.data : (r.data as any)?.results || [];
      setPubOptions(data);
    });
  }, [refreshKey]);

  const openStudents = async (bookId: number, ad: string) => {
    setStudentDrawer({ bookId, ad, students: [] });
    setStudentDrawerLoading(true);
    const res = await fetchAnalyticsBookStudents(bookId);
    setStudentDrawer({
      bookId,
      ad,
      students: Array.isArray(res.data) ? res.data : [],
    });
    setStudentDrawerLoading(false);
  };

  const formatAssignedAt = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const runSearch = async () => {
    if (!searchQ.trim()) return;
    const res = await fetchAnalyticsSearch(searchQ.trim());
    setSearchResult(res.data);
  };

  const archiveIdle = async () => {
    if (!idleSelected.size) return;
    if (!confirm(`${idleSelected.size} kitap arşivlensin mi?`)) return;
    await bulkArchiveBooks(Array.from(idleSelected));
    setIdleSelected(new Set());
    notifyResourcesChanged({ type: "archive" });
    load();
  };

  const makePdf = async () => {
    const tabMeta = INNER_TABS.find((t) => t.id === innerTab) || INNER_TABS[0];
    setPdfBusy(true);
    const blob = await downloadAnalyticsPdf({ report_type: tabMeta.pdfType, ...fp });
    setPdfBusy(false);
    if (!blob) {
      alert("PDF oluşturulamadı");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kaynak-${tabMeta.id}-${tabMeta.pdfType}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpi = [
    { label: "Toplam Kaynak", value: summary.total_books },
    { label: "Kullanılan", value: summary.used_books },
    { label: "Havuz ataması (öğrenci-kitap)", value: summary.student_assignments },
    { label: "Yayınevi", value: summary.publisher_count },
    { label: "İçeriği Tamam", value: summary.content_complete, color: "#059669" },
    { label: "İçeriği Eksik", value: summary.content_incomplete, color: "#d97706" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          className="kk-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Kitap, yayınevi veya ders ara…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button type="button" className="kk-btn kk-btn-active-on-light" onClick={runSearch}>Ara</button>
        <select
          className="kk-select"
          value={filters.publisher || ""}
          onChange={(e) => setFilters({ ...filters, publisher: e.target.value || undefined })}
        >
          <option value="">Tüm yayınevleri</option>
          <option value="empty">Yayınevi boş</option>
          {pubOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.ad}</option>
          ))}
        </select>
        <select
          className="kk-select"
          value={filters.icerik || ""}
          onChange={(e) => setFilters({ ...filters, icerik: e.target.value || undefined })}
        >
          <option value="">İçerik: Tümü</option>
          <option value="tamam">Tamam</option>
          <option value="eksik">Eksik</option>
        </select>
        <button type="button" className="kk-btn kk-btn-on-light" onClick={load} disabled={loading}>
          Yenile
        </button>
      </div>

      {searchResult && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <strong>Arama</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Kitaplar</div>
              <ul>{(searchResult.books || []).map((b: any) => <li key={b.id}>{b.ad}</li>)}</ul>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Yayınevleri</div>
              <ul>{(searchResult.publishers || []).map((p: any) => <li key={p.id}>{p.ad}</li>)}</ul>
            </div>
          </div>
        </div>
      )}

      <div className="kk-tab-row">
        {INNER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`kk-tab${innerTab === t.id ? " is-active" : ""}`}
            onClick={() => setInnerTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="kk-btn kk-btn-active-on-light"
          style={{ marginLeft: "auto" }}
          disabled={pdfBusy}
          onClick={makePdf}
        >
          {pdfBusy ? "PDF…" : "Bu sekme PDF"}
        </button>
      </div>

      {loading && <div style={{ color: "#64748b", marginBottom: 12 }}>Güncelleniyor…</div>}

      {innerTab === "ozet" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
            {kpi.map((k) => (
              <div key={k.label} style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: k.color || "#0f172a" }}>
                  {(k.value ?? 0).toLocaleString("tr-TR")}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Aksiyon Gerekenler</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <button type="button" className="kk-btn kk-btn-on-light" onClick={() => setInnerTab("icerik")}>
                {actions.hot_incomplete ?? 0} çok kullanılan + içerik eksik
              </button>
              <button type="button" className="kk-btn kk-btn-on-light" onClick={() => setInnerTab("icerik")}>
                {actions.content_incomplete ?? 0} içerik tamamlanmamış
              </button>
              <button type="button" className="kk-btn kk-btn-on-light" onClick={() => setInnerTab("atil")}>
                {actions.idle_books ?? 0} kullanılmayan
              </button>
              <div style={{ padding: 10, color: "#1e40af", fontWeight: 600 }}>
                {actions.unmatched_publisher ?? 0} yayınevi eşleşmemiş
              </div>
            </div>
            <p style={{ marginTop: 12, color: "#64748b" }}>
              Öncelik — Kritik: {priority.kritik ?? 0} · Yüksek: {priority.yuksek ?? 0} · Orta: {priority.orta ?? 0} · Düşük: {priority.dusuk ?? 0}
              {" · "}Kullanım oranı: %{usageRate.usage_rate_percent ?? 0}
            </p>
          </div>
        </>
      )}

      {innerTab === "kullanim" && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              background: "#f8fafc",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: "#0f172a" }}>Havuzdaki öğrenci:</strong> Kitabın kaç farklı öğrencinin kaynak havuzunda olduğu.
            {" · "}
            <strong style={{ color: "#0f172a" }}>Ödev kullanımı:</strong> Kitabın ödev / çalışma programında kaç kez seçildiği.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`kk-btn ${topMetric === "students" ? "kk-btn-active-on-light" : "kk-btn-on-light"}`}
              onClick={() => setTopMetric("students")}
              title="Kaynak havuzunda en çok öğrencide bulunan kitaplar"
            >
              Havuzdaki öğrenciye göre
            </button>
            <button
              type="button"
              className={`kk-btn ${topMetric === "intensity" ? "kk-btn-active-on-light" : "kk-btn-on-light"}`}
              onClick={() => setTopMetric("intensity")}
              title="Ödevlerde en sık kullanılan kitaplar"
            >
              Ödev kullanımına göre
            </button>
          </div>
          <SortableTable
            rows={topBooks}
            rowKey={(r) => r.id}
            columns={[
              { key: "ad", label: "Kitap", type: "text" },
              { key: "publisher_ad", label: "Yayınevi", type: "text", render: (r) => r.publisher_ad || "—" },
              { key: "ders_ad", label: "Ders", type: "text" },
              {
                key: "student_count",
                label: "Havuzdaki öğrenci",
                hint: "Kitabı kaynak havuzunda bulunan farklı öğrenci sayısı — tıklayınca liste açılır",
                type: "number",
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => openStudents(r.id, r.ad)}
                    title="Havuzdaki öğrencileri göster"
                    style={{
                      border: 0,
                      background: "none",
                      padding: 0,
                      color: "#0061a6",
                      fontWeight: 700,
                      cursor: "pointer",
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {r.student_count ?? 0}
                  </button>
                ),
              },
              {
                key: "intensity",
                label: "Ödev kullanımı",
                hint: "Ödev / çalışma programında bu kitabın seçilme sayısı",
                type: "number",
              },
              {
                key: "icerik_tamamlandi_mi",
                label: "İçerik",
                type: "text",
                render: (r) => (r.icerik_tamamlandi_mi ? "Tamam" : "Eksik"),
              },
            ]}
          />
          <h3 style={{ marginTop: 20 }}>Trend</h3>
          <SortableTable
            rows={trend}
            columns={[
              { key: "month", label: "Ay", type: "text" },
              {
                key: "assignments",
                label: "Havuza ekleme",
                hint: "O ay kaynak havuzuna yapılan atama sayısı",
                type: "number",
              },
              {
                key: "intensity",
                label: "Ödev kullanımı",
                hint: "O ay ödev / çalışma programında kitap seçilme sayısı",
                type: "number",
              },
            ]}
          />
        </div>
      )}

      {innerTab === "yayinevi" && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              background: "#f8fafc",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              color: "#475569",
            }}
          >
            Havuzdaki öğrenci = kaynak havuzundaki atamalar · Ödev kullanımı = ödevlerde seçilme sayısı · Pay = toplam havuz kullanımına oran
          </div>
          <SortableTable
            rows={publishers}
            rowKey={(r) => r.publisher_id ?? r.publisher_ad}
            columns={[
              { key: "publisher_ad", label: "Yayınevi", type: "text" },
              { key: "book_count", label: "Kitap", type: "number" },
              {
                key: "student_count",
                label: "Havuzdaki öğrenci",
                hint: "Bu yayınevinin kitaplarını havuzunda tutan öğrenci ataması sayısı",
                type: "number",
              },
              {
                key: "intensity",
                label: "Ödev kullanımı",
                hint: "Bu yayınevinin kitaplarının ödevlerde seçilme sayısı",
                type: "number",
              },
              {
                key: "share_percent",
                label: "Pay %",
                hint: "Toplam havuz kullanımına göre yüzde pay",
                type: "number",
              },
            ]}
          />
        </div>
      )}

      {innerTab === "ders" && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
          <SortableTable
            rows={byLesson}
            rowKey={(r) => r.ders_id}
            columns={[
              { key: "ders_ad", label: "Ders", type: "text" },
              { key: "book_count", label: "Kitap", type: "number" },
              { key: "used_books", label: "Kullanılan", type: "number" },
              { key: "content_complete", label: "Tamam", type: "number" },
              { key: "content_incomplete", label: "Eksik", type: "number" },
              { key: "student_assignments", label: "İlişki", type: "number" },
            ]}
          />
          <h3 style={{ marginTop: 20 }}>Öğrenci başına ortalama</h3>
          <SortableTable
            rows={avgStudent}
            rowKey={(r) => r.ders_id}
            columns={[
              { key: "ders_ad", label: "Ders", type: "text" },
              { key: "student_count", label: "Öğrenci", type: "number" },
              { key: "avg_resources", label: "Ortalama", type: "number" },
            ]}
          />
          <h3 style={{ marginTop: 20 }}>Ders × Yayınevi</h3>
          {matrix ? (
            <SortableTable
              rows={(matrix.rows || []).map((row: any) => {
                const flat: Record<string, any> = { ders_ad: row.ders_ad };
                for (const p of matrix.publishers || []) {
                  flat[`p_${p.id || 0}`] = row.values?.[String(p.id || 0)] ?? 0;
                }
                return flat;
              })}
              columns={[
                { key: "ders_ad", label: "Ders", type: "text" },
                ...(matrix.publishers || []).map((p: any) => ({
                  key: `p_${p.id || 0}`,
                  label: p.ad,
                  type: "number" as const,
                })),
              ]}
            />
          ) : (
            <div style={{ color: "#64748b" }}>Veri yok</div>
          )}
        </div>
      )}

      {innerTab === "icerik" && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>İçeriği Eksik</h3>
          <SortableTable
            rows={incomplete}
            rowKey={(r) => r.id}
            columns={[
              { key: "ad", label: "Kitap", type: "text" },
              { key: "ders_ad", label: "Ders", type: "text" },
              { key: "publisher_ad", label: "Yayınevi", type: "text", render: (r) => r.publisher_ad || "—" },
              {
                key: "student_count",
                label: "Havuzdaki öğrenci",
                hint: "Kitabı kaynak havuzunda bulunan öğrenci sayısı",
                type: "number",
              },
              { key: "priority", label: "Öncelik", type: "text" },
            ]}
          />
          <h3>Müdahale Gereken</h3>
          <SortableTable
            rows={intervention}
            rowKey={(r) => r.id}
            columns={[
              { key: "priority", label: "Öncelik", type: "text" },
              { key: "ad", label: "Kitap", type: "text" },
              {
                key: "student_count",
                label: "Havuzdaki öğrenci",
                hint: "Kitabı kaynak havuzunda bulunan öğrenci sayısı",
                type: "number",
              },
            ]}
          />
          <h3>Çok kullanılan + eksik</h3>
          <SortableTable
            rows={hot}
            rowKey={(r) => r.id}
            columns={[
              { key: "ad", label: "Kitap", type: "text" },
              {
                key: "student_count",
                label: "Havuzdaki öğrenci",
                hint: "Kitabı kaynak havuzunda bulunan öğrenci sayısı",
                type: "number",
              },
              {
                key: "intensity",
                label: "Ödev kullanımı",
                hint: "Ödev / çalışma programında seçilme sayısı",
                type: "number",
              },
              { key: "publisher_ad", label: "Yayınevi", type: "text", render: (r) => r.publisher_ad || "—" },
            ]}
          />
        </div>
      )}

      {innerTab === "koc" && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              background: "#f8fafc",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              color: "#475569",
            }}
          >
            Ortalama = koçun öğrencilerine düşen ortalama kaynak havuzu ataması (yarıştırmak için değil, düşük kullanımı görmek için).
          </div>
          <SortableTable
            rows={byCoach}
            rowKey={(r) => r.coach_id}
            columns={[
              { key: "coach_ad", label: "Koç", type: "text" },
              {
                key: "student_count",
                label: "Öğrenci sayısı",
                hint: "Koçun kaynak ataması olan öğrenci sayısı",
                type: "number",
              },
              {
                key: "resource_count",
                label: "Havuz ataması",
                hint: "Toplam aktif kaynak havuzu ataması",
                type: "number",
              },
              {
                key: "avg_resources",
                label: "Öğrenci başı kaynak",
                hint: "Havuz ataması / öğrenci sayısı",
                type: "number",
              },
            ]}
          />
        </div>
      )}

      {innerTab === "atil" && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <select className="kk-select" value={idleDays} onChange={(e) => setIdleDays(e.target.value)}>
              <option value="">Hiç kullanılmayan</option>
              <option value="90">Son 90 gün</option>
              <option value="180">Son 180 gün</option>
            </select>
            <button type="button" className="kk-btn kk-btn-active-on-light" disabled={!idleSelected.size} onClick={archiveIdle}>
              Seçilenleri arşivle ({idleSelected.size})
            </button>
          </div>
          <SortableTable
            rows={idle}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "id",
                label: "",
                type: "number",
                render: (r) => (
                  <input
                    type="checkbox"
                    checked={idleSelected.has(r.id)}
                    onChange={() => {
                      setIdleSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      });
                    }}
                  />
                ),
              },
              { key: "ad", label: "Kitap", type: "text" },
              { key: "ders_ad", label: "Ders", type: "text" },
              { key: "publisher_ad", label: "Yayınevi", type: "text", render: (r) => r.publisher_ad || "—" },
            ]}
          />
        </div>
      )}

      {innerTab === "degisim" && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Havuz büyüme</h3>
          <SortableTable
            rows={growth}
            columns={[
              { key: "month", label: "Ay", type: "text" },
              { key: "added", label: "Eklenen", type: "number" },
              { key: "removed", label: "Kaldırılan", type: "number" },
              { key: "net", label: "Net", type: "number" },
              {
                key: "growth_percent",
                label: "Büyüme %",
                type: "number",
                render: (r) => r.growth_percent ?? "—",
              },
            ]}
          />
          <h3>Churn</h3>
          <SortableTable
            rows={churn}
            rowKey={(r) => r.id}
            columns={[
              { key: "ad", label: "Kitap", type: "text" },
              { key: "added", label: "Eklenme", type: "number" },
              { key: "removed", label: "Kaldırılma", type: "number" },
              { key: "net", label: "Net", type: "number" },
            ]}
          />
        </div>
      )}

      {studentDrawer && (
        <>
          <div className="kk-drawer-backdrop" onClick={() => setStudentDrawer(null)} />
          <div className="kk-drawer">
            <div className="kk-drawer-header">
              <div>
                <h3 style={{ margin: 0 }}>Havuzdaki öğrenciler</h3>
                <div style={{ marginTop: 4, fontSize: 13, color: "#64748b", fontWeight: 500 }}>
                  {studentDrawer.ad}
                </div>
              </div>
              <button
                type="button"
                className="kk-btn kk-btn-on-light"
                aria-label="Kapat"
                onClick={() => setStudentDrawer(null)}
              >
                ×
              </button>
            </div>
            <div className="kk-drawer-body">
              {studentDrawerLoading ? (
                <div style={{ color: "#64748b" }}>Yükleniyor…</div>
              ) : (
                <>
                  <div
                    style={{
                      marginBottom: 14,
                      padding: "10px 12px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      fontSize: 13,
                      color: "#475569",
                    }}
                  >
                    Bu kitap <strong style={{ color: "#0f172a" }}>{studentDrawer.students.length}</strong> öğrencinin
                    kaynak havuzunda
                    {studentDrawer.students.length >= 200 ? " (ilk 200 gösteriliyor)" : ""}.
                  </div>
                  <SortableTable
                    rows={studentDrawer.students}
                    rowKey={(s) => s.assignment_id}
                    emptyLabel="Bu kitap henüz hiçbir öğrencinin havuzunda değil"
                    columns={[
                      {
                        key: "ad",
                        label: "Öğrenci",
                        type: "text",
                        render: (s) => `${s.ad || ""} ${s.soyad || ""}`.trim() || "—",
                      },
                      {
                        key: "assigned_at",
                        label: "Havuza eklenme",
                        type: "text",
                        render: (s) => formatAssignedAt(s.assigned_at),
                      },
                    ]}
                  />
                </>
              )}
            </div>
            <div className="kk-drawer-footer">
              <button type="button" className="kk-btn kk-btn-on-light" onClick={() => setStudentDrawer(null)}>
                Kapat
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
