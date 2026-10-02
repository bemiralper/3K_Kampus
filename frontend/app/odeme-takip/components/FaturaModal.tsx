"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE, apiHeaders, parseApiError, postHeaders } from "../helpers";

type Satir = {
  ad: string;
  kdv_orani: number;
  matrah: string;
  kdv: string;
  brut: string;
  yuzde?: string;
  katalog?: string;
};

type Onizleme = {
  tahsilat_id: number;
  sozlesme_no: string;
  ogrenci_adi?: string;
  paket_adi?: string;
  tahsilat_tarihi?: string;
  odeme: string;
  satirlar: Satir[];
  matrah: string;
  kdv: string;
  odenecek: string;
  alici: {
    ad: string;
    soyad: string;
    unvan: string;
    vkn: string;
    adres: string;
    il: string;
    ilce: string;
    eposta: string;
  };
  belge_tipi: "efatura" | "earsiv" | null;
  eksikler: string[];
  gonderilebilir: boolean;
  mevcut: {
    durum: string;
    belge_tipi: string;
    ettn: string;
    yerel_no: string;
    uyumsoft_no: string;
    hata_mesaji: string;
  } | null;
  portal_url: string;
};

type DraftLine = {
  key: string;
  ad: string;
  kdv_orani: number;
  katalog: number;
  yuzde: string;
  brut: string;
};

const tipLabel: Record<string, string> = {
  efatura: "e-Fatura",
  earsiv: "e-Arşiv",
};

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(value || 0);

const formatAmount = (value: number) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(value || 0));

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseAmount(raw: string) {
  const text = raw.trim().replace(/\s/g, "").replace("₺", "");
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) {
    return Number(text.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (text.includes(",")) return Number(text.replace(",", ".")) || 0;
  return Number(text) || 0;
}

function taxOf(brut: number, rate: number) {
  const matrah = round2(brut / (1 + rate / 100));
  return { matrah, kdv: round2(brut - matrah) };
}

function draftFrom(rows: Satir[]): DraftLine[] {
  return rows.map((row, index) => ({
    key: `${index}-${row.ad}`,
    ad: row.ad,
    kdv_orani: row.kdv_orani,
    katalog: Number(row.katalog || 0),
    yuzde: formatAmount(Number(row.yuzde || 0)),
    brut: formatAmount(Number(row.brut || 0)),
  }));
}

function withShare(line: DraftLine, brut: number, odeme: number): DraftLine {
  const share = odeme > 0 ? (brut / odeme) * 100 : 0;
  return { ...line, brut: formatAmount(brut), yuzde: formatAmount(share) };
}

function splitEven(lines: DraftLine[], odeme: number): DraftLine[] {
  if (!lines.length) return lines;
  let used = 0;
  return lines.map((line, index) => {
    const brut = index === lines.length - 1 ? round2(odeme - used) : round2(odeme / lines.length);
    used = round2(used + brut);
    return withShare(line, brut, odeme);
  });
}

function splitCatalog(lines: DraftLine[], odeme: number): DraftLine[] {
  const weight = lines.reduce((sum, line) => sum + Math.max(line.katalog, 0), 0);
  if (weight <= 0) return splitEven(lines, odeme);
  let used = 0;
  const last = lines.reduce((found, line, index) => (line.katalog > 0 ? index : found), lines.length - 1);
  return lines.map((line, index) => {
    if (index === last) return withShare(line, round2(odeme - used), odeme);
    const brut = line.katalog > 0 ? round2((line.katalog / weight) * odeme) : 0;
    used = round2(used + brut);
    return withShare(line, brut, odeme);
  });
}

export function FaturaRowButton({ taslak, onClick }: { taslak: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={taslak ? "Uyumsoft’a gönderildi, onay bekliyor" : "Fatura oluştur"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 30,
        padding: "0 9px",
        borderRadius: 8,
        border: `1px solid ${taslak ? "#a7f3d0" : "#bfdbfe"}`,
        background: taslak ? "#ecfdf5" : "#eff6ff",
        color: taslak ? "#047857" : "#0262a7",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      </svg>
      {taslak ? "Gönderildi" : "Fatura"}
    </button>
  );
}

export default function FaturaModal({
  tahsilatId,
  onClose,
  onSent,
}: {
  tahsilatId: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const [data, setData] = useState<Onizleme | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [adres, setAdres] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/tahsilatlar/${tahsilatId}/fatura/`, { headers: apiHeaders(), credentials: "include" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(parseApiError(body, "Fatura hazırlanamadı."));
        return body as Onizleme;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setLines(draftFrom(body.satirlar));
        setAdres(body.alici.adres || "");
        setIl(body.alici.il || "");
        setIlce(body.alici.ilce || "");
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tahsilatId]);

  const odeme = Number(data?.odeme || 0);
  const taslak = data?.mevcut?.durum === "uyumsoft_taslak";
  const locked = taslak;

  const summary = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const brut = parseAmount(line.brut);
        const tax = taxOf(brut, line.kdv_orani);
        acc.brut = round2(acc.brut + brut);
        acc.matrah = round2(acc.matrah + tax.matrah);
        acc.kdv = round2(acc.kdv + tax.kdv);
        return acc;
      },
      { brut: 0, matrah: 0, kdv: 0 },
    );
  }, [lines]);
  const kalan = round2(odeme - summary.brut);
  const balanced = Math.abs(kalan) < 0.01;

  const patch = (index: number, next: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...next } : line)));
  };

  const changePercent = (index: number, raw: string) => {
    const brut = round2((odeme * parseAmount(raw)) / 100);
    patch(index, { yuzde: raw, brut: formatAmount(brut) });
  };

  const changeAmount = (index: number, raw: string) => {
    const brut = parseAmount(raw);
    const yuzde = odeme > 0 ? (brut / odeme) * 100 : 0;
    patch(index, { brut: raw, yuzde: formatAmount(yuzde) });
  };

  const balanceLast = () => {
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const amounts = prev.map((line) => parseAmount(line.brut));
      let diff = round2(odeme - amounts.reduce((sum, amount) => sum + amount, 0));
      for (let index = amounts.length - 1; index >= 0 && Math.abs(diff) >= 0.01; index -= 1) {
        const next = round2(amounts[index] + diff);
        if (next < 0) {
          diff = next;
          amounts[index] = 0;
        } else {
          amounts[index] = next;
          diff = 0;
        }
      }
      if (Math.abs(diff) >= 0.01) return prev;
      return prev.map((line, index) => withShare(line, amounts[index], odeme));
    });
  };

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/tahsilatlar/${tahsilatId}/fatura/gonder/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({
          adres,
          il,
          ilce,
          satirlar: lines
            .filter((line) => parseAmount(line.brut) > 0)
            .map((line) => ({
              ad: line.ad,
              kdv_orani: line.kdv_orani,
              brut: parseAmount(line.brut).toFixed(2),
              katalog: line.katalog.toFixed(2),
            })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(parseApiError(body, "Uyumsoft taslağı oluşturulamadı."));
      const next = body as Onizleme;
      setData(next);
      setLines(draftFrom(next.satirlar));
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uyumsoft taslağı oluşturulamadı.");
    } finally {
      setSending(false);
    }
  };

  const cancelSend = async () => {
    setCancelling(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/tahsilatlar/${tahsilatId}/fatura/iptal/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(parseApiError(body, "Gönderim iptal edilemedi."));
      const next = body as Onizleme;
      setData(next);
      setLines(draftFrom(next.satirlar));
      setAdres(next.alici.adres || "");
      setIl(next.alici.il || "");
      setIlce(next.alici.ilce || "");
      setConfirmCancel(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim iptal edilemedi.");
    } finally {
      setCancelling(false);
    }
  };

  const tarih = data?.tahsilat_tarihi
    ? new Date(data.tahsilat_tarihi).toLocaleDateString("tr-TR")
    : "";

  return (
    <div className="fatura-overlay" onClick={onClose}>
      <style>{MODAL_CSS}</style>
      <div className="fatura-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fatura-baslik">
        <header className="fatura-head">
          <div>
            <p className="fatura-kicker">Tahsilat faturası</p>
            <h2 id="fatura-baslik">{data?.ogrenci_adi || "Fatura"}</h2>
            <p className="fatura-sub">
              {[data?.sozlesme_no, data?.paket_adi, tarih].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" className="fatura-close" onClick={onClose} aria-label="Kapat">✕</button>
        </header>

        <div className="fatura-body">
          {loading && <p className="fatura-muted">Kalemler hazırlanıyor…</p>}
          {error && <div className="fatura-alert">{error}</div>}

          {data && (
            <>
              <div className="fatura-stats">
                <div>
                  <span>Tahsilat</span>
                  <strong>{money(odeme)}</strong>
                </div>
                <div>
                  <span>Belge</span>
                  <strong>{data.belge_tipi ? tipLabel[data.belge_tipi] : "Tespit ediliyor"}</strong>
                </div>
                <div>
                  <span>Alıcı</span>
                  <strong>{data.alici.unvan || "—"}</strong>
                </div>
              </div>

              <section className="fatura-section">
                <div className="fatura-section-head">
                  <div>
                    <h3>Kalemler</h3>
                    <p>Paketin içindeki hizmetler ayrı satır. Yüzdeyi veya tutarı değiştirin; toplam tahsilata eşit kalsın.</p>
                  </div>
                  {!locked && (
                    <div className="fatura-tools">
                      <button type="button" onClick={() => setLines((prev) => splitCatalog(prev, odeme))}>Liste fiyatı</button>
                      <button type="button" onClick={() => setLines((prev) => splitEven(prev, odeme))}>Eşit böl</button>
                    </div>
                  )}
                </div>

                <div className="fatura-lines">
                  {lines.map((line, index) => {
                    const brut = parseAmount(line.brut);
                    const tax = taxOf(brut, line.kdv_orani);
                    return (
                      <div className="fatura-line" key={line.key}>
                        <div className="fatura-line-name">
                          <strong>{line.ad}</strong>
                          {line.katalog > 0 && <span>Liste {money(line.katalog)}</span>}
                        </div>
                        <div className="fatura-controls">
                          <label>
                            KDV
                            <select
                              value={line.kdv_orani}
                              disabled={locked}
                              onChange={(event) => patch(index, { kdv_orani: Number(event.target.value) })}
                            >
                              <option value={0}>%0</option>
                              <option value={10}>%10</option>
                              <option value={20}>%20</option>
                            </select>
                          </label>
                          <label>
                            Pay %
                            <input
                              inputMode="decimal"
                              value={line.yuzde}
                              disabled={locked}
                              onChange={(event) => changePercent(index, event.target.value)}
                              onBlur={() => patch(index, { yuzde: formatAmount(parseAmount(line.yuzde)) })}
                            />
                          </label>
                          <label>
                            Tutar
                            <input
                              inputMode="decimal"
                              value={line.brut}
                              disabled={locked}
                              onChange={(event) => changeAmount(index, event.target.value)}
                              onBlur={() => patch(index, { brut: formatAmount(parseAmount(line.brut)) })}
                            />
                          </label>
                        </div>
                        <p className="fatura-tax">Matrah {money(tax.matrah)} · KDV {money(tax.kdv)}</p>
                      </div>
                    );
                  })}
                </div>

                <div className={`fatura-total ${balanced ? "ok" : "warn"}`}>
                  <div>
                    <span>Matrah {money(summary.matrah)}</span>
                    <span>KDV {money(summary.kdv)}</span>
                    <strong>Toplam {money(summary.brut)}</strong>
                  </div>
                  {!locked && (
                    balanced
                      ? <span className="fatura-ok">Tahsilatla eşleşiyor</span>
                      : (
                        <button type="button" onClick={balanceLast}>
                          {kalan > 0 ? `${money(kalan)} kalanı son satıra yaz` : `${money(Math.abs(kalan))} fazlayı son satırdan düş`}
                        </button>
                      )
                  )}
                </div>
              </section>

              <section className="fatura-section">
                <h3>Alıcı</h3>
                <div className="fatura-buyer">
                  <div>
                    <span>Ünvan</span>
                    <strong>{data.alici.unvan || "—"}</strong>
                  </div>
                  <div>
                    <span>TCKN / VKN</span>
                    <strong>{data.alici.vkn || "—"}</strong>
                  </div>
                  <label className="wide">
                    Açık adres
                    <input value={adres} disabled={locked} onChange={(event) => setAdres(event.target.value)} />
                  </label>
                  <label>
                    İlçe
                    <input value={ilce} disabled={locked} onChange={(event) => setIlce(event.target.value)} />
                  </label>
                  <label>
                    İl
                    <input value={il} disabled={locked} onChange={(event) => setIl(event.target.value)} />
                  </label>
                </div>
              </section>

              {data.eksikler.length > 0 && !taslak && (
                <ul className="fatura-missing">
                  {data.eksikler.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}

              {taslak && (
                <p className="fatura-done">
                  Fatura Uyumsoft’a iletildi. Onayı portaldan verin.
                  {data.mevcut?.uyumsoft_no ? ` Belge no: ${data.mevcut.uyumsoft_no}.` : ""}
                </p>
              )}
            </>
          )}
        </div>

        <footer className="fatura-foot">
          {taslak && !confirmCancel && (
            <button type="button" className="danger" onClick={() => setConfirmCancel(true)} disabled={cancelling}>
              Gönderimi iptal et
            </button>
          )}
          {taslak && confirmCancel && (
            <button type="button" className="danger" onClick={cancelSend} disabled={cancelling}>
              {cancelling ? "İptal ediliyor…" : "Evet, gönderimi iptal et"}
            </button>
          )}
          <span className="fatura-foot-spacer" />
          <button type="button" className="ghost" onClick={confirmCancel ? () => setConfirmCancel(false) : onClose}>
            {confirmCancel ? "Vazgeç" : "Kapat"}
          </button>
          {taslak ? (
            <a className="primary" href={data?.portal_url} target="_blank" rel="noreferrer">Uyumsoft portalı</a>
          ) : (
            <button type="button" className="primary" onClick={send} disabled={sending || !data || !balanced}>
              {sending ? "Gönderiliyor…" : "Uyumsoft’a gönder"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

const MODAL_CSS = `
.fatura-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(15,23,42,.48); display: flex; align-items: center; justify-content: center; padding: 16px; }
.fatura-dialog { width: min(880px, 100%); max-height: min(92vh, 900px); display: flex; flex-direction: column; background: #fff; border-radius: 20px; box-shadow: 0 24px 60px rgba(15,23,42,.22); overflow: hidden; color: #0f172a; }
.fatura-head { display: flex; justify-content: space-between; gap: 16px; padding: 18px 22px 14px; border-bottom: 1px solid #eef2f7; }
.fatura-kicker { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #0262a7; }
.fatura-head h2 { margin: 0; font-size: 22px; line-height: 1.2; }
.fatura-sub { margin: 6px 0 0; color: #64748b; font-size: 13px; }
.fatura-close { width: 36px; height: 36px; border: 0; border-radius: 10px; background: #f1f5f9; color: #334155; cursor: pointer; font-size: 16px; }
.fatura-body { overflow: auto; padding: 16px 22px 8px; }
.fatura-muted { color: #64748b; }
.fatura-alert { background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.fatura-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
.fatura-stats > div { background: #f8fafc; border: 1px solid #e8eef5; border-radius: 14px; padding: 12px 14px; }
.fatura-stats span, .fatura-buyer span, .fatura-line label, .fatura-buyer label { display: block; font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: .02em; text-transform: uppercase; }
.fatura-stats strong, .fatura-buyer strong { display: block; margin-top: 4px; font-size: 15px; }
.fatura-section { margin-bottom: 18px; }
.fatura-section h3 { margin: 0; font-size: 15px; }
.fatura-section-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
.fatura-section-head p { margin: 4px 0 0; color: #64748b; font-size: 13px; max-width: 520px; }
.fatura-tools { display: flex; gap: 8px; flex-shrink: 0; }
.fatura-tools button, .fatura-total button { border: 1px solid #dbe3ee; background: #fff; color: #0262a7; border-radius: 9px; padding: 7px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
.fatura-line { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid #f1f5f9; }
.fatura-line-name { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.fatura-line-name strong { font-size: 14px; }
.fatura-line-name span, .fatura-tax { color: #64748b; font-size: 12px; }
.fatura-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.fatura-tax { margin: 0; }
.fatura-controls input, .fatura-controls select, .fatura-buyer input {
  width: 100%; height: 40px; margin-top: 4px; box-sizing: border-box;
  border: 1px solid #d5deea; border-radius: 9px; padding: 0 12px;
  font: 14px/40px inherit; background-color: #fff; color: #0f172a;
  appearance: none; -webkit-appearance: none;
}
.fatura-controls select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2364748b' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center; padding-right: 28px;
}
.fatura-controls input:disabled, .fatura-controls select:disabled, .fatura-buyer input:disabled { background-color: #f8fafc; color: #475569; }
.fatura-total { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 8px; padding: 12px 14px; border-radius: 12px; background: #f8fafc; }
.fatura-total.warn { background: #fff7ed; }
.fatura-total.ok { background: #f0fdf4; }
.fatura-total div { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.fatura-ok { color: #047857; font-size: 13px; font-weight: 700; }
.fatura-buyer { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.fatura-buyer .wide { grid-column: 1 / -1; }
.fatura-missing { margin: 0 0 12px; padding-left: 18px; color: #b45309; font-size: 13px; }
.fatura-done { background: #ecfdf5; color: #047857; border-radius: 12px; padding: 10px 12px; font-size: 13px; }
.fatura-foot { display: flex; align-items: center; gap: 8px; padding: 12px 22px 16px; border-top: 1px solid #eef2f7; }
.fatura-foot-spacer { flex: 1; }
.fatura-foot .ghost, .fatura-foot .primary, .fatura-foot .danger { border-radius: 10px; padding: 10px 14px; font-size: 14px; font-weight: 700; cursor: pointer; text-decoration: none; }
.fatura-foot .ghost { border: 1px solid #d5deea; background: #fff; color: #334155; }
.fatura-foot .danger { border: 1px solid #fecaca; background: #fff; color: #b91c1c; }
.fatura-foot .primary { border: 0; background: #0262a7; color: #fff; }
.fatura-foot .primary:disabled, .fatura-foot .danger:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 720px) {
  .fatura-buyer { grid-template-columns: 1fr; }
  .fatura-section-head, .fatura-total, .fatura-head { flex-direction: column; }
  .fatura-line-name { flex-direction: column; gap: 2px; }
}
`;
