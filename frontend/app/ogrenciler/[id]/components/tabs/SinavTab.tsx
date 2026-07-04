"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import {
  StudentExamResponse, StudentExamResult, StudentExamKPI,
  StudentExamTrend, StudentExamSectionDetail,
} from "@/components/olcme/types";
import { studentExamApi } from "@/components/olcme/api";
import s from "./SinavTab.module.css";

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */
const fmt = (n: number, d = 2) => Number(n).toFixed(d);
const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
};

const netCls = (n: number) => (n >= 80 ? s.netHigh : n >= 50 ? s.netMid : s.netLow);
const rankCls = (r: number) => (r === 1 ? s.rankGold : r === 2 ? s.rankSilver : r === 3 ? s.rankBronze : s.rankNormal);
const typeBadge = (t: string) => {
  if (t === "YKS_TYT") return s.badgeBlue;
  if (t === "YKS_AYT") return s.badgePurple;
  if (t === "DENEME") return s.badgeTeal;
  return s.badgeGray;
};
const typeLabel = (t: string) => (t === "YKS_TYT" ? "TYT" : t === "YKS_AYT" ? "AYT" : t === "DENEME" ? "Deneme" : t);

const PALETTE = ["#0262a7", "#7c3aed", "#ea580c", "#059669", "#e11d48", "#0d9488", "#d97706", "#6366f1"];
const barFill = (n: number, mx: number) => {
  const r = mx > 0 ? n / mx : 0;
  return r >= 0.7 ? "url(#gradGreen)" : r >= 0.4 ? "url(#gradBlue)" : "url(#gradRed)";
};

/* ─── Toast ─── */
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`${s.toast} ${type === "success" ? s.success : s.error}`}>{type === "success" ? "✓" : "✕"} {message}</div>;
}

/* ─── Custom Tooltip ─── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={s.customTooltip}>
      <div className={s.tooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={s.tooltipItem}>
          <span className={s.tooltipDot} style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className={s.tooltipValue}>{typeof p.value === "number" ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════ */
type SubTab = "gecmis" | "dashboard";

export default function SinavTab({ ogrenciId }: { ogrenciId: number }) {
  const [data, setData]       = useState<StudentExamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<SubTab>("gecmis");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toast, setToast]     = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await studentExamApi.results(ogrenciId);
      console.log('[SinavTab] ogrenciId=', ogrenciId, 'response=', result);
      setData(result);
    } catch (err) {
      console.error('[SinavTab] Hata:', err);
      setError("Veriler yüklenirken hata oluştu");
      setToast({ message: "Veriler yüklenirken hata oluştu", type: "error" });
    } finally { setLoading(false); }
  }, [ogrenciId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exams = useMemo(() => data?.exams ?? [], [data]);
  const kpi   = useMemo(() => data?.kpi ?? null, [data]);
  const trend = useMemo(() => data?.net_trend ?? [], [data]);

  const lastSections = useMemo(() => {
    if (!exams.length) return [];
    return exams[exams.length - 1].section_details?.filter(sec => !sec.is_sub_section) ?? [];
  }, [exams]);

  const sectionAvgs = useMemo(() => {
    if (!trend.length) return [];
    const m: Record<string, number[]> = {};
    trend.forEach(t => Object.entries(t.section_nets).forEach(([k, v]) => { (m[k] ??= []).push(v); }));
    return Object.entries(m)
      .map(([name, nets]) => ({ name, avg: +(nets.reduce((a, b) => a + b, 0) / nets.length).toFixed(2), last: nets[nets.length - 1], max: Math.max(...nets) }))
      .sort((a, b) => b.avg - a.avg);
  }, [trend]);

  const segment = useMemo(() => {
    if (!kpi || kpi.toplam_sinav === 0) return null;
    const n = kpi.ortalama_net;
    if (n >= 90) return { icon: "🏆", label: "Üst Düzey Performans", desc: "Mükemmel — İlk %10 diliminde yer alıyor", cls: s.top };
    if (n >= 65) return { icon: "📈", label: "Orta-Üst Düzey", desc: "İyi performans gösteriyor, gelişim potansiyeli yüksek", cls: s.mid };
    if (n >= 40) return { icon: "📊", label: "Orta Düzey", desc: "Belirli alanlarda gelişim desteğine ihtiyaç duyuyor", cls: s.low };
    return { icon: "⚠️", label: "Destek Gerekli", desc: "Acil müdahale ve bireysel takip önerilir", cls: s.risk };
  }, [kpi]);

  /* ─── RENDER ─── */
  if (loading) return (
    <div className="tab-panel">
      <div className={s.loadingWrap}>
        <div className={s.spinner} />
        <span className={s.loadingText}>Sınav verileri yükleniyor…</span>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="tab-panel">
      <div className={s.emptyState}>
        <div className={s.emptyIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7088a4" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h4>{error || "Veriler yüklenemedi"}</h4>
        <p>Lütfen daha sonra tekrar deneyiniz.</p>
      </div>
    </div>
  );

  if (!exams.length && !kpi) return (
    <div className="tab-panel">
      <div className={s.emptyState}>
        <div className={s.emptyIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7088a4" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </div>
        <h4>Sınav Bilgileri</h4>
        <p>Henüz sınav kaydı bulunmamaktadır.</p>
      </div>
    </div>
  );

  return (
    <div className={`tab-panel ${s.wrapper}`}>
      {/* ── KPI ── */}
      {kpi && <KPICards kpi={kpi} />}

      {/* ── Sub Tabs ── */}
      <div className={s.subTabs}>
        <button className={`${s.subTab} ${tab === "gecmis" ? s.active : ""}`} onClick={() => setTab("gecmis")}>
          <span className={s.subTabIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
          </span>
          Sınav Sonuçları
          <span className={s.subTabCount}>{exams.length}</span>
        </button>
        <button className={`${s.subTab} ${tab === "dashboard" ? s.active : ""}`} onClick={() => setTab("dashboard")}>
          <span className={s.subTabIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          </span>
          Performans Analizi
        </button>
      </div>

      {/* ── Content ── */}
      {tab === "gecmis" && <PastExams exams={exams} expanded={expanded} toggle={(id) => setExpanded(expanded === id ? null : id)} />}
      {tab === "dashboard" && <Dashboard kpi={kpi} trend={trend} sectionAvgs={sectionAvgs} lastSections={lastSections} segment={segment} />}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KPI CARDS
   ═══════════════════════════════════════════════════════════════════ */
function KPICards({ kpi }: { kpi: StudentExamKPI }) {
  return (
    <div className={s.kpiGrid}>
      <KPI color="blue"   icon="📝" value={String(kpi.toplam_sinav)}  label="Toplam Sınav" />
      <KPI color="green"  icon="📊" value={fmt(kpi.ortalama_net)}     label="Ort. Net"      change={kpi.net_degisim} />
      <KPI color="purple" icon="🎯" value={fmt(kpi.ortalama_puan)}    label="Ort. Puan"     change={kpi.puan_degisim} />
      <KPI color="orange" icon="🏅" value={fmt(kpi.max_net)}          label="En Yüksek Net" sub={`Min: ${fmt(kpi.min_net)}`} />
      {kpi.en_iyi_ders  && <KPI color="teal" icon="💪" value={kpi.en_iyi_ders}  label="En Güçlü Ders"      small />}
      {kpi.en_zayif_ders && <KPI color="rose" icon="📌" value={kpi.en_zayif_ders} label="Geliştirilecek Ders" small />}
    </div>
  );
}

function KPI({ color, icon, value, label, change, sub, small }: {
  color: string; icon: string; value: string; label: string;
  change?: number | null; sub?: string; small?: boolean;
}) {
  return (
    <div className={`${s.kpiCard} ${s[color]}`}>
      <div className={`${s.kpiIconWrap} ${s[color]}`}>{icon}</div>
      <div className={s.kpiValue} style={small ? { fontSize: 17 } : undefined}>{value}</div>
      <div className={s.kpiLabel}>{label}</div>
      {change !== null && change !== undefined && (
        <div className={`${s.kpiChange} ${change >= 0 ? s.positive : s.negative}`}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(2)}
        </div>
      )}
      {sub && <div className={s.kpiSubtext}>{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAST EXAMS
   ═══════════════════════════════════════════════════════════════════ */
function PastExams({ exams, expanded, toggle }: {
  exams: StudentExamResult[]; expanded: number | null; toggle: (id: number) => void;
}) {
  return (
    <div className={s.tableWrap}>
      <div className={s.tableHeader}>
        <div className={s.tableTitle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
          Sınav Sonuçları
        </div>
        <span className={s.tableBadge}>{exams.length} sınav</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className={s.examTable}>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Sınav</th>
              <th>Tür</th>
              <th className={s.center}>D</th>
              <th className={s.center}>Y</th>
              <th className={s.center}>B</th>
              <th className={s.center}>Net</th>
              <th className={s.center}>Puan</th>
              <th className={s.center}>Sıra</th>
              <th className={s.center}>Yüzdelik</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <ExamRow key={exam.exam_id} exam={exam} open={expanded === exam.exam_id} toggle={() => toggle(exam.exam_id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExamRow({ exam, open, toggle }: { exam: StudentExamResult; open: boolean; toggle: () => void }) {
  const main = exam.section_details?.filter(sec => !sec.is_sub_section) ?? [];
  const subs = exam.section_details?.filter(sec => sec.is_sub_section) ?? [];
  const has = main.length > 0;

  return (
    <Fragment>
      <tr className={has ? s.expandRow : undefined} onClick={has ? toggle : undefined}>
        <td style={{ textAlign: "center", padding: "13px 6px" }}>
          {has && <span className={`${s.expandChevron} ${open ? s.open : ""}`}>▶</span>}
        </td>
        <td>
          <div className={s.examName}>
            <span className={s.examNameText}>{exam.exam_name}</span>
            <span className={s.examDateMini}>{fmtDate(exam.exam_date)}</span>
          </div>
        </td>
        <td><span className={`${s.badge} ${typeBadge(exam.exam_type)}`}>{exam.exam_type_display || typeLabel(exam.exam_type)}</span></td>
        <td className={s.center} style={{ fontWeight: 600, color: "#059669" }}>{exam.total_correct}</td>
        <td className={s.center} style={{ fontWeight: 600, color: "#dc2626" }}>{exam.total_wrong}</td>
        <td className={s.center} style={{ color: "#7088a4" }}>{exam.total_empty}</td>
        <td className={s.center}>
          <div className={s.netMiniBar}>
            <span className={netCls(exam.total_net)} style={{ fontSize: 14 }}>{fmt(exam.total_net)}</span>
            <div className={s.netMiniTrack}>
              <div className={s.netMiniFill} style={{ width: `${Math.min(100, (exam.total_net / 120) * 100)}%`, background: exam.total_net >= 80 ? "#059669" : exam.total_net >= 50 ? "#0262a7" : "#dc2626" }} />
            </div>
          </div>
        </td>
        <td className={s.center}>
          <div className={s.puanCell}>
            <span className={s.puanMain}>{exam.puan > 0 ? fmt(exam.puan) : "—"}</span>
            {exam.ham_puan > 0 && <span className={s.puanSub}>ham: {fmt(exam.ham_puan)}</span>}
          </div>
        </td>
        <td className={s.center}>
          {exam.kurum_ici_sira > 0
            ? <span className={`${s.rankBadge} ${rankCls(exam.kurum_ici_sira)}`}>{exam.kurum_ici_sira}/{exam.toplam_ogrenci}</span>
            : "—"}
        </td>
        <td className={s.center}>
          {exam.yuzdelik_dilim != null
            ? <span className={`${s.badge} ${s.badgeGray}`}>%{exam.yuzdelik_dilim}</span>
            : "—"}
        </td>
      </tr>

      {open && (
        <>
          {/* Detail metrics */}
          <tr><td colSpan={10} style={{ padding: 0 }}>
            <div className={s.examDetailGrid}>
              <Detail label="Ham Puan" value={exam.ham_puan > 0 ? fmt(exam.ham_puan) : "—"} />
              <Detail label="Standart Puan" value={exam.puan > 0 ? fmt(exam.puan) : "—"} />
              <Detail label="Tahmini Sıralama" value={exam.tahmini_siralama ? exam.tahmini_siralama.toLocaleString("tr-TR") : "—"} />
              <Detail label="Yüzdelik Dilim" value={exam.yuzdelik_dilim != null ? `%${exam.yuzdelik_dilim}` : "—"} />
              <Detail label="Kurum İçi" value={exam.kurum_ici_sira > 0 ? `${exam.kurum_ici_sira} / ${exam.toplam_ogrenci}` : "—"} />
            </div>
          </td></tr>

          {/* Section rows */}
          {main.map(sec => <SectionRow key={sec.section_id} sec={sec} isSub={false} />)}
          {subs.map(sec => <SectionRow key={sec.section_id} sec={sec} isSub={true} />)}
        </>
      )}
    </Fragment>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.examDetailItem}>
      <span className={s.examDetailLabel}>{label}</span>
      <span className={s.examDetailValue}>{value}</span>
    </div>
  );
}

function SectionRow({ sec, isSub }: { sec: StudentExamSectionDetail; isSub: boolean }) {
  const pct = sec.question_count > 0 ? Math.min(100, (sec.net / sec.question_count) * 100) : 0;
  return (
    <tr className={s.sectionRow}>
      <td></td>
      <td colSpan={2}>
        <div className={`${s.sectionName} ${isSub ? s.sub : s.main}`}>
          {sec.section_name}
        </div>
      </td>
      <td className={s.center} style={{ color: "#059669", fontWeight: 600 }}>{sec.correct}</td>
      <td className={s.center} style={{ color: "#dc2626", fontWeight: 600 }}>{sec.wrong}</td>
      <td className={s.center} style={{ color: "#7088a4" }}>{sec.empty}</td>
      <td className={s.center}>
        <div className={s.netMiniBar}>
          <span className={netCls(sec.net)} style={{ fontSize: 13 }}>{fmt(sec.net)}</span>
          <div className={s.netMiniTrack}>
            <div className={s.netMiniFill} style={{ width: `${Math.max(pct, 4)}%`, background: pct >= 70 ? "#059669" : pct >= 40 ? "#0262a7" : "#dc2626" }} />
          </div>
        </div>
      </td>
      <td className={s.center} style={{ color: "#7088a4", fontSize: 11 }}>/{sec.question_count}</td>
      <td colSpan={2}></td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */
function Dashboard({ kpi, trend, sectionAvgs, lastSections, segment }: {
  kpi: StudentExamKPI | null;
  trend: StudentExamTrend[];
  sectionAvgs: { name: string; avg: number; last: number; max: number }[];
  lastSections: StudentExamSectionDetail[];
  segment: { icon: string; label: string; desc: string; cls: string } | null;
}) {
  const chartData = useMemo(() => trend.map((t, i) => ({
    name: t.exam_name.length > 18 ? t.exam_name.slice(0, 16) + "…" : t.exam_name,
    fullName: t.exam_name, net: t.toplam_net, puan: t.puan, idx: i + 1, ...t.section_nets,
  })), [trend]);

  const sectionNames = useMemo(() => {
    const set = new Set<string>();
    trend.forEach(t => Object.keys(t.section_nets).forEach(k => set.add(k)));
    return Array.from(set);
  }, [trend]);

  const maxAvg = useMemo(() => sectionAvgs.length ? Math.max(...sectionAvgs.map(s => s.max)) : 40, [sectionAvgs]);

  /* Radar data */
  const radarData = useMemo(() => {
    if (!sectionAvgs.length) return [];
    const maxVal = Math.max(...sectionAvgs.map(s => s.avg), 1);
    return sectionAvgs.map(s => ({
      subject: s.name.length > 10 ? s.name.slice(0, 9) + "…" : s.name,
      fullName: s.name,
      A: s.avg,
      fullMark: Math.ceil(maxVal * 1.2),
    }));
  }, [sectionAvgs]);

  if (!kpi && !trend.length) return (
    <div className={s.emptyState}>
      <div className={s.emptyIcon}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7088a4" strokeWidth="1.5"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg></div>
      <h4>Henüz Yeterli Veri Yok</h4>
      <p>En az 2 sınav sonucu ile performans analizi oluşturulabilir.</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Segment */}
      {segment && (
        <div className={`${s.segmentCard} ${segment.cls}`}>
          <div className={s.segmentIcon}>{segment.icon}</div>
          <div className={s.segmentBody}>
            <div className={s.segmentLabel}>{segment.label}</div>
            <div className={s.segmentDesc}>{segment.desc}</div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className={s.chartGrid}>
        {/* Net Trend (Area) */}
        {chartData.length >= 2 && (
          <div className={s.chartCard}>
            <div className={s.chartTitle}>
              <span className={`${s.chartTitleIcon} ${s.blue}`}>📈</span>
              Net &amp; Puan Gelişimi
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0262a7" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0262a7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPuan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "#7088a4" }} axisLine={{ stroke: "#eef2f7" }} />
                <YAxis tick={{ fontSize: 11, fill: "#7088a4" }} axisLine={{ stroke: "#eef2f7" }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="net" name="Toplam Net" stroke="#0262a7" strokeWidth={2.5} fill="url(#colorNet)" dot={{ r: 4, fill: "#fff", stroke: "#0262a7", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#0262a7" }} />
                <Area type="monotone" dataKey="puan" name="Puan" stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 5" fill="url(#colorPuan)" dot={{ r: 3, fill: "#fff", stroke: "#7c3aed", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Section Lines */}
        {chartData.length >= 2 && sectionNames.length > 0 && (
          <div className={s.chartCard}>
            <div className={s.chartTitle}>
              <span className={`${s.chartTitleIcon} ${s.purple}`}>📚</span>
              Ders Bazlı Gelişim
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "#7088a4" }} axisLine={{ stroke: "#eef2f7" }} />
                <YAxis tick={{ fontSize: 11, fill: "#7088a4" }} axisLine={{ stroke: "#eef2f7" }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {sectionNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} name={name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: PALETTE[i % PALETTE.length], strokeWidth: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Bottom Row: Bar Chart + Radar */}
      <div className={s.chartGrid}>
        {/* Bar Chart */}
        {sectionAvgs.length > 0 && (
          <div className={s.chartCard}>
            <div className={s.chartTitle}>
              <span className={`${s.chartTitleIcon} ${s.green}`}>📊</span>
              Ders Bazlı Ortalama Net
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, sectionAvgs.length * 50)}>
              <BarChart data={sectionAvgs} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradGreen" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#34d399" /></linearGradient>
                  <linearGradient id="gradBlue" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0262a7" /><stop offset="100%" stopColor="#3b9be0" /></linearGradient>
                  <linearGradient id="gradRed" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#dc2626" /><stop offset="100%" stopColor="#f87171" /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#7088a4" }} axisLine={{ stroke: "#eef2f7" }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: "#4b5e73", fontWeight: 500 }} width={75} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="avg" name="Ort. Net" radius={[0, 8, 8, 0]} maxBarSize={24}>
                  {sectionAvgs.map((entry, i) => (
                    <Cell key={i} fill={barFill(entry.avg, maxAvg)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Radar */}
        {radarData.length >= 3 && (
          <div className={s.chartCard}>
            <div className={s.chartTitle}>
              <span className={`${s.chartTitleIcon} ${s.orange}`}>🕸️</span>
              Ders Yetkinlik Haritası
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#eef2f7" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#4b5e73" }} />
                <PolarRadiusAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} />
                <Radar name="Ort. Net" dataKey="A" stroke="#0262a7" fill="#0262a7" fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: "#0262a7" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Insights Row */}
      {kpi && (kpi.en_iyi_ders || kpi.en_zayif_ders || kpi.net_degisim != null) && (
        <div className={s.chartCard}>
          <div className={s.chartTitle}>
            <span className={`${s.chartTitleIcon} ${s.blue}`}>💡</span>
            Öne Çıkan Tespitler
          </div>
          <div className={s.insightGrid}>
            {kpi.en_iyi_ders && (
              <div className={`${s.subjectInsight} ${s.subjectStrong}`}>💪 <strong>En güçlü ders:</strong> {kpi.en_iyi_ders}</div>
            )}
            {kpi.en_zayif_ders && (
              <div className={`${s.subjectInsight} ${s.subjectWeak}`}>📌 <strong>Geliştirilecek ders:</strong> {kpi.en_zayif_ders}</div>
            )}
            {kpi.net_degisim != null && (
              <div className={`${s.subjectInsight} ${s.subjectChange}`} style={{
                background: kpi.net_degisim >= 0 ? "linear-gradient(135deg, #f0fdf4, #e6faf4)" : "linear-gradient(135deg, #fef2f2, #fee2e2)",
                color: kpi.net_degisim >= 0 ? "#166534" : "#991b1b",
                borderColor: kpi.net_degisim >= 0 ? "#bbf7d0" : "#fecaca",
              }}>
                {kpi.net_degisim >= 0 ? "📈" : "📉"} <strong>Son değişim:</strong> {kpi.net_degisim >= 0 ? "+" : ""}{fmt(kpi.net_degisim)} net
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last Exam Section Bars */}
      {lastSections.length > 0 && (
        <div className={s.chartCard}>
          <div className={s.chartTitle}>
            <span className={`${s.chartTitleIcon} ${s.green}`}>🎯</span>
            Son Sınav — Ders Bazlı Net
          </div>
          {lastSections.map(sec => {
            const mx = sec.question_count || 40;
            const pct = Math.min(100, (sec.net / mx) * 100);
            return (
              <div key={sec.section_id} className={s.sectionBar}>
                <span className={s.sectionBarLabel}>{sec.section_name}</span>
                <div className={s.sectionBarTrack}>
                  <div className={s.sectionBarFill} style={{
                    width: `${Math.max(pct, 5)}%`,
                    background: pct >= 60 ? "linear-gradient(90deg, #059669, #34d399)" : pct >= 35 ? "linear-gradient(90deg, #0262a7, #3b9be0)" : "linear-gradient(90deg, #dc2626, #f87171)",
                  }}>
                    {pct > 15 && <span>{fmt(sec.net, 1)}</span>}
                  </div>
                </div>
                <span className={s.sectionBarValue}>{fmt(sec.net, 1)} / {sec.question_count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
