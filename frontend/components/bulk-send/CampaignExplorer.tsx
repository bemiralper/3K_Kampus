"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommConfirmDialog, type CommConfirmState } from "@/components/communication/CommDialog";
import { CommToast, useCommToast } from "@/components/communication/CommToast";
import CommunicationPageShell from "@/components/communication/CommunicationPageShell";
import "@/components/communication/communication.css";
import {
  CampaignDelivery,
  CampaignItem,
  WhatsAppAccount,
  cancelCampaign,
  communicationPortalPaths,
  describeAudienceSummary,
  fetchAccessibleWhatsAppAccounts,
  fetchCampaign,
  fetchCampaignDeliveries,
  fetchCampaigns,
  isCampaignActive,
  processCampaignQueue,
  retryFailedCampaign,
} from "@/lib/communication-api";

import {
  CampaignSegmentBar,
  CampaignStatusBadge,
  MessageStatusBadge,
  campaignSegments,
  formatDateTime,
  formatRelative,
} from "./CampaignProgress";
import type { BulkSendMode } from "./useBulkSendDraft";
import "./bulk-send.css";

const PAGE = 25;
const DELIVERY_PAGE = 40;

const STATUS_FILTERS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: "all", label: "Tümü", statuses: [] },
  { key: "active", label: "Devam eden", statuses: ["CONFIRMED", "QUEUED", "PROCESSING"] },
  { key: "done", label: "Tamamlanan", statuses: ["COMPLETED"] },
  { key: "partial", label: "Kısmi", statuses: ["PARTIAL"] },
  { key: "failed", label: "Başarısız", statuses: ["FAILED"] },
  { key: "cancelled", label: "İptal", statuses: ["CANCELLED"] },
  { key: "scheduled", label: "Zamanlanmış", statuses: ["DRAFT", "CONFIRMED"] },
];

const DELIVERY_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "Hepsi" },
  { key: "PENDING,SENDING", label: "Bekliyor" },
  { key: "SENT", label: "Gönderildi" },
  { key: "DELIVERED", label: "İletildi" },
  { key: "READ", label: "Okundu" },
  { key: "FAILED", label: "Başarısız" },
  { key: "CANCELLED", label: "İptal" },
];

interface Props {
  mode?: BulkSendMode;
}

/**
 * Gönderim Geçmişi v2 — solda kampanya kartları (sonsuz kaydırma, filtre),
 * sağda seçili kampanyanın detayı; URL `?campaign=` ile senkron.
 */
export default function CampaignExplorer({ mode = "admin" }: Props) {
  const paths = communicationPortalPaths(mode);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("campaign");
  const { toast, show: showToast } = useCommToast();

  const [items, setItems] = useState<CampaignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    fetchAccessibleWhatsAppAccounts().then((r) => setAccounts(r.accounts || [])).catch(() => setAccounts([]));
  }, []);

  const statuses = useMemo(() => STATUS_FILTERS.find((f) => f.key === statusKey)?.statuses ?? [], [statusKey]);

  const load = useCallback(async (offset = 0, append = false) => {
    const mySeq = ++seq.current;
    if (!append) setLoading(true);
    setListError(null);
    try {
      const res = await fetchCampaigns({
        limit: PAGE, offset,
        status: statuses.length ? statuses : undefined,
        q: debouncedQ || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        channel_config_id: accountId || undefined,
      });
      if (mySeq !== seq.current) return;
      setItems((prev) => {
        if (!append) return res.campaigns;
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...res.campaigns.filter((c) => !seen.has(c.id))];
      });
      setTotal(res.total);
      setHasMore(res.has_more);
    } catch (err) {
      if (mySeq === seq.current) setListError(err instanceof Error ? err.message : "Liste yüklenemedi");
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  }, [statuses, debouncedQ, dateFrom, dateTo, accountId]);

  useEffect(() => { void load(0, false); }, [load]);

  // Devam eden kampanya varken ilk sayfayı sessizce tazele
  const anyActive = items.some((c) => isCampaignActive(c.status));
  useEffect(() => {
    if (!anyActive) return;
    const id = window.setInterval(() => void load(0, false), 6000);
    return () => window.clearInterval(id);
  }, [anyActive, load]);

  const select = (id: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("campaign", id); else sp.delete("campaign");
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };

  // Liste satırındaki özet, detaydan gelen taze veriyle güncellensin
  const patchItem = useCallback((c: CampaignItem) => {
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
  }, []);

  const crumbs = mode === "coach"
    ? [{ label: "Koç Paneli", href: "/coach/dashboard" }, { label: "Gönderim Geçmişi" }]
    : [{ label: mode === "muhasebe" ? "WhatsApp" : "İletişim", href: paths.home }, { label: "Gönderim Geçmişi" }];

  return (
    <CommunicationPageShell
      title="Gönderim Geçmişi"
      subtitle="Toplu WhatsApp gönderimleri, teslimat ve okunma durumları"
      breadcrumbs={crumbs}
      maxWidth="full"
      actions={<Link href={paths.bulk} className="bs-btn-primary">+ Yeni gönderim</Link>}
    >
      <div className={`bs bs-explorer${selectedId ? " is-detail" : ""}`}>
        <aside className="bs-list" aria-label="Kampanyalar">
          <div className="bs-list-tools">
            <input
              className="bs-input"
              placeholder="Başlıkta ara…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Kampanya ara"
            />
            <div className="bs-chips">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`bs-chip${statusKey === f.key ? " is-on" : ""}`}
                  onClick={() => setStatusKey(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <details className="bs-collapse">
              <summary>Daha fazla filtre <small>{[dateFrom, dateTo, accountId].filter(Boolean).length || ""}</small></summary>
              <div className="row" style={{ marginTop: 6 }}>
                <input type="date" className="bs-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Başlangıç tarihi" />
                <input type="date" className="bs-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Bitiş tarihi" />
              </div>
              {accounts.length > 1 && (
                <select className="bs-select" style={{ marginTop: 8 }} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Hat">
                  <option value="">Tüm hatlar</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.display_phone}</option>)}
                </select>
              )}
            </details>
            <div className="bs-small bs-muted">{total.toLocaleString("tr-TR")} gönderim</div>
          </div>

          {listError && <div className="bs-alert tone-bad">{listError}</div>}

          <div className="bs-list-scroll">
            {loading && items.length === 0 && (
              <>
                <div className="bs-skeleton" style={{ height: 84 }} />
                <div className="bs-skeleton" style={{ height: 84 }} />
                <div className="bs-skeleton" style={{ height: 84 }} />
              </>
            )}
            {!loading && items.length === 0 && (
              <div className="bs-empty">
                <strong>Gönderim yok</strong>
                Filtreyi genişletin ya da yeni bir gönderim başlatın.
              </div>
            )}
            {items.map((c) => <CampaignCard key={c.id} campaign={c} active={c.id === selectedId} onSelect={() => select(c.id)} />)}
            {hasMore && (
              <button type="button" className="bs-btn" onClick={() => void load(items.length, true)}>
                Daha fazla yükle
              </button>
            )}
          </div>
        </aside>

        <section className="bs-detail" aria-live="polite">
          {selectedId ? (
            <CampaignDetailPane
              key={selectedId}
              campaignId={selectedId}
              mode={mode}
              onBack={() => select(null)}
              onChanged={patchItem}
              onToast={showToast}
            />
          ) : (
            <div className="bs-card bs-empty" style={{ minHeight: 260, display: "grid", placeItems: "center" }}>
              <div>
                <strong>Bir gönderim seçin</strong>
                Soldaki listeden bir kampanyaya tıklayınca teslimat detayı burada açılır.
              </div>
            </div>
          )}
        </section>
      </div>
      <CommToast toast={toast} />
    </CommunicationPageShell>
  );
}

function CampaignCard({ campaign: c, active, onSelect }: { campaign: CampaignItem; active: boolean; onSelect: () => void }) {
  const s = campaignSegments(c);
  return (
    <button type="button" className={`bs-item${active ? " is-on" : ""}`} onClick={onSelect} aria-current={active}>
      <div className="bs-item-top">
        <span className="bs-item-title">{c.title || c.template_name || "Başlıksız gönderim"}</span>
        <CampaignStatusBadge status={c.status} />
      </div>
      <CampaignSegmentBar campaign={c} />
      <div className="bs-item-nums">
        <span><b>{c.total_recipients}</b> alıcı</span>
        <span><b>{c.read_count}</b> okundu</span>
        {s.failed > 0 && <span style={{ color: "var(--bs-bad)" }}><b style={{ color: "inherit" }}>{s.failed}</b> başarısız</span>}
      </div>
      <div className="bs-item-meta">
        {c.channel_config_name && <span>{c.channel_config_name}</span>}
        {c.audience_summary && <span>{describeAudienceSummary(c.audience_summary)}</span>}
        <span title={formatDateTime(c.created_at)}>{formatRelative(c.created_at)}</span>
        {c.created_by_name && <span>{c.created_by_name}</span>}
      </div>
    </button>
  );
}

function groupDeliveries(rows: CampaignDelivery[]) {
  const groups: Array<{ key: string; title: string; rows: CampaignDelivery[] }> = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = row.ogrenci_id ? `ogr-${row.ogrenci_id}` : `solo-${row.id}`;
    const title = row.student_name || row.contact_name || "Alıcı";
    const at = index.get(key);
    if (at == null) {
      index.set(key, groups.length);
      groups.push({ key, title, rows: [row] });
    } else {
      groups[at].rows.push(row);
    }
  }
  return groups;
}

function DeliveryGroups({ deliveries }: { deliveries: CampaignDelivery[] }) {
  const groups = groupDeliveries(deliveries);
  return (
    <div className="bs-families">
      {groups.map((group) => (
        <section key={group.key} className="bs-family">
          <header className="bs-family-head">
            <strong>{group.title}</strong>
            <span>{group.rows.length} alıcı</span>
          </header>
          <ul>
            {group.rows.map((d) => (
              <li key={d.id}>
                <div className="who">
                  <b>{d.contact_name || "İsimsiz"}</b>
                  <span>{contactRoleLabel(d.contact_type)}</span>
                  {d.phone ? <span className="phone">{d.phone}</span> : null}
                </div>
                <div className="state">
                  <MessageStatusBadge status={d.status} />
                  <time>{formatDateTime(d.sent_at)}</time>
                </div>
                {d.status === "FAILED" && d.failed_reason ? (
                  <p className="err" title={d.failed_reason}>{d.failed_reason_short || d.failed_reason}</p>
                ) : null}
                {d.queue_note ? <p className="note">{d.queue_note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function contactRoleLabel(contactType: string | undefined): string {
  switch ((contactType || "").toUpperCase()) {
    case "OGRENCI":
    case "STUDENT":
      return "Öğrenci";
    case "VELI":
    case "PARENT":
      return "Veli";
    case "PERSONEL":
    case "STAFF":
      return "Personel";
    default:
      return contactType ? contactType : "—";
  }
}

function CampaignDetailPane({
  campaignId, mode, onBack, onChanged, onToast,
}: {
  campaignId: string;
  mode: BulkSendMode;
  onBack: () => void;
  onChanged: (c: CampaignItem) => void;
  onToast: (msg: string, tone?: "success" | "error" | "info") => void;
}) {
  const [campaign, setCampaign] = useState<CampaignItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CommConfirmState | null>(null);

  const [deliveries, setDeliveries] = useState<CampaignDelivery[]>([]);
  const [dTotal, setDTotal] = useState(0);
  const [dOffset, setDOffset] = useState(0);
  const [dStatus, setDStatus] = useState("");
  const [dQ, setDQ] = useState("");
  const [dDebounced, setDDebounced] = useState("");
  const [dArchived, setDArchived] = useState(false);
  const [dLoading, setDLoading] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDDebounced(dQ.trim()), 300);
    return () => window.clearTimeout(id);
  }, [dQ]);

  const loadCampaign = useCallback(async () => {
    try {
      const c = await fetchCampaign(campaignId);
      setCampaign(c);
      onChanged(c);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kampanya yüklenemedi");
    }
  }, [campaignId, onChanged]);

  useEffect(() => { void loadCampaign(); }, [loadCampaign]);

  useEffect(() => {
    if (!campaign || !isCampaignActive(campaign.status)) return;
    const id = window.setInterval(() => void loadCampaign(), 4000);
    return () => window.clearInterval(id);
  }, [campaign, loadCampaign]);

  useEffect(() => { setDOffset(0); }, [dStatus, dDebounced]);

  useEffect(() => {
    let cancelled = false;
    setDLoading(true);
    fetchCampaignDeliveries(campaignId, { limit: DELIVERY_PAGE, offset: dOffset, status: dStatus || undefined, q: dDebounced || undefined })
      .then((res) => {
        if (cancelled) return;
        setDeliveries(res.deliveries);
        setDTotal(res.total);
        setDArchived(res.archived);
      })
      .catch(() => { if (!cancelled) setDeliveries([]); })
      .finally(() => { if (!cancelled) setDLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, dOffset, dStatus, dDebounced, campaign?.sent_count, campaign?.failed_count, campaign?.read_count]);

  const run = async (kind: "cancel" | "retry" | "process") => {
    if (!campaign) return;
    setBusy(kind);
    try {
      const fresh = kind === "cancel"
        ? await cancelCampaign(campaign.id)
        : kind === "retry"
          ? await retryFailedCampaign(campaign.id)
          : await processCampaignQueue(campaign.id);
      setCampaign(fresh);
      onChanged(fresh);
      onToast(
        kind === "cancel" ? "Bekleyen mesajlar iptal edildi."
          : kind === "retry" ? `${fresh.retried_count ?? 0} mesaj yeniden kuyruğa alındı.`
            : "Kuyruk işlemesi başlatıldı.",
        "success",
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : "İşlem başarısız", "error");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  if (error) return <div className="bs-alert tone-bad">{error}</div>;
  if (!campaign) {
    return (
      <div className="bs-card">
        <div className="bs-skeleton" style={{ height: 22, width: "50%", marginBottom: 12 }} />
        <div className="bs-skeleton" style={{ height: 8, marginBottom: 12 }} />
        <div className="bs-skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  const seg = campaignSegments(campaign);
  const canCancel = campaign.can_manage && !["COMPLETED", "CANCELLED", "FAILED"].includes(campaign.status);
  const canRetry = campaign.can_manage && campaign.failed_count > 0 && campaign.status !== "CANCELLED";
  const canProcess = campaign.can_manage && (seg.pending > 0 || campaign.status === "CONFIRMED");
  const dPages = Math.max(1, Math.ceil(dTotal / DELIVERY_PAGE));
  const dPage = Math.floor(dOffset / DELIVERY_PAGE) + 1;

  return (
    <>
      <div className="bs-card">
        <button type="button" className="bs-btn-ghost bs-btn-sm bs-back" onClick={onBack} style={{ marginBottom: 8 }}>← Listeye dön</button>
        <div className="bs-detail-head">
          <div>
            <h2>{campaign.title || campaign.template_name || "Başlıksız gönderim"}</h2>
            <div className="bs-item-meta">
              <CampaignStatusBadge status={campaign.status} />
              <span>{formatDateTime(campaign.created_at)}</span>
              {campaign.created_by_name && <span>{campaign.created_by_name}</span>}
              {campaign.channel_config_name && <span>{campaign.channel_config_name}</span>}
              {campaign.scheduled_at && <span>Zamanlanmış: {formatDateTime(campaign.scheduled_at)}</span>}
            </div>
          </div>
          <div className="bs-detail-actions">
            {canProcess && (
              <button type="button" className="bs-btn bs-btn-sm" disabled={!!busy} onClick={() => void run("process")}>Kuyruğu işle</button>
            )}
            {canRetry && (
              <button type="button" className="bs-btn-primary bs-btn-sm" disabled={!!busy} onClick={() => setConfirm({
                title: "Gitmeyenlere gönder",
                description: `${campaign.failed_count} kişiye mesaj ulaşmadı. Hepsi yeniden kuyruğa alınacak.`,
                confirmLabel: "Gitmeyenlere gönder",
                onConfirm: () => run("retry"),
              })}>
                Gitmeyenlere gönder ({campaign.failed_count})
              </button>
            )}
            {canCancel && (
              <button type="button" className="bs-btn-danger bs-btn-sm" disabled={!!busy} onClick={() => setConfirm({
                title: "Gönderimi iptal et",
                description: "Yalnız bekleyen mesajlar durdurulur; gönderilmiş olanlar geri alınamaz.",
                confirmLabel: "İptal et",
                danger: true,
                onConfirm: () => run("cancel"),
              })}>
                İptal
              </button>
            )}
          </div>
        </div>

        {campaign.materialize_error && <div className="bs-alert tone-bad" style={{ marginTop: 10 }}>{campaign.materialize_error}</div>}
        {campaign.status === "CONFIRMED" && (
          <div className="bs-alert tone-info" style={{ marginTop: 10 }}>
            Alıcılar kuyruğa alınıyor: {campaign.materialized_count ?? 0}/{campaign.total_recipients}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <CampaignSegmentBar campaign={campaign} legend />
        </div>
        <div className="bs-progress-kpis">
          <div className="bs-kpi"><b>{campaign.total_recipients}</b><span>Alıcı</span></div>
          <div className="bs-kpi"><b>{campaign.sent_count}</b><span>Gönderildi</span></div>
          <div className="bs-kpi"><b>{campaign.delivered_count}</b><span>İletildi</span></div>
          <div className="bs-kpi"><b>{campaign.read_count}</b><span>Okundu</span></div>
          <div className="bs-kpi"><b style={{ color: campaign.failed_count ? "var(--bs-bad)" : undefined }}>{campaign.failed_count}</b><span>Başarısız</span></div>
          <div className="bs-kpi"><b>{campaign.replied_count ?? 0}</b><span>Yanıt</span></div>
        </div>

        {(campaign.resolved_body || campaign.template_name) && (
          <details className="bs-collapse" open>
            <summary>Gönderilen mesaj <small>{campaign.template_name}{campaign.template_language ? ` · ${campaign.template_language}` : ""}</small></summary>
            <div className="bs-message-box">{campaign.resolved_body || campaign.body_template || "—"}</div>
          </details>
        )}
        {campaign.audience_summary && (
          <dl className="bs-facts" style={{ marginTop: 12 }}>
            <div><dt>Kitle</dt><dd>{describeAudienceSummary(campaign.audience_summary)}</dd></div>
            {campaign.estimated_cost_usd && Number(campaign.estimated_cost_usd) > 0 && (
              <div><dt>Tahmini maliyet</dt><dd>${campaign.estimated_cost_usd}</dd></div>
            )}
          </dl>
        )}
      </div>

      <div className="bs-card">
        <div className="bs-card-head">
          <div>
            <h2>Alıcılar</h2>
            <p>{dTotal.toLocaleString("tr-TR")} kayıt{dArchived ? " · arşivden" : ""}</p>
          </div>
        </div>
        <div className="bs-toolbar" style={{ marginBottom: 10 }}>
          <div className="bs-chips">
            {DELIVERY_FILTERS.map((f) => (
              <button key={f.key || "all"} type="button" className={`bs-chip${dStatus === f.key ? " is-on" : ""}`} onClick={() => setDStatus(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <input className="bs-input grow" placeholder="Ad veya telefon…" value={dQ} onChange={(e) => setDQ(e.target.value)} aria-label="Alıcı ara" />
        </div>

        {dLoading && deliveries.length === 0 ? (
          <div className="bs-skeleton" style={{ height: 120 }} />
        ) : deliveries.length === 0 ? (
          <div className="bs-empty">Bu filtreye uyan alıcı yok.</div>
        ) : (
          <DeliveryGroups deliveries={deliveries} />
        )}
        {dPages > 1 && (
          <div className="bs-pager">
            <span>Sayfa {dPage} / {dPages}</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="bs-btn bs-btn-sm" disabled={dOffset === 0} onClick={() => setDOffset(Math.max(0, dOffset - DELIVERY_PAGE))}>Önceki</button>
              <button type="button" className="bs-btn bs-btn-sm" disabled={dOffset + DELIVERY_PAGE >= dTotal} onClick={() => setDOffset(dOffset + DELIVERY_PAGE)}>Sonraki</button>
            </span>
          </div>
        )}
      </div>

      <CommConfirmDialog state={confirm} busy={!!busy} onClose={() => setConfirm(null)} />
    </>
  );
}
