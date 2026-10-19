"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search, Upload, X } from "lucide-react";
import { useKurum } from "@/lib/contexts/KurumContext";
import {
  createOkul,
  deleteOkul,
  fetchOkulDeleteInfo,
  fetchOkullar,
  updateOkul,
  type OkulFormData,
  type OkulRecord,
} from "@/lib/okul-api";
import TopluOkulEkleModal from "@/components/okul/TopluOkulEkleModal";

const EMPTY_FORM: OkulFormData = {
  ad: "",
  okul_turu: "",
  il: "",
  ilce: "",
  not_metni: "",
  aktif_mi: true,
};

const inputClass =
  "box-border h-10 w-full rounded-lg border border-[#d5deea] bg-white px-3 text-sm font-[inherit] text-[#1e3352] outline-none transition-[border-color,box-shadow] placeholder:text-[#8b9bb0] focus:border-[#0061A6] focus:ring-2 focus:ring-[#0061A6]/15 disabled:cursor-not-allowed disabled:bg-[#f6f8fb]";

const btnPrimary =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#0061A6] bg-[#0061A6] px-3.5 text-sm font-[inherit] font-medium text-white transition-colors hover:border-[#004e86] hover:bg-[#004e86] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondary =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#d5deea] bg-white px-3.5 text-sm font-[inherit] font-medium text-[#1e3352] transition-colors hover:bg-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50";

const btnQuiet =
  "inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent px-2.5 text-[13px] font-[inherit] font-medium text-[#0061A6] transition-colors hover:bg-[#e8f2fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6]";

const btnDanger =
  "inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent px-2.5 text-[13px] font-[inherit] font-medium text-[#b42318] transition-colors hover:bg-[#fef3f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b42318]";

const btnCard =
  "inline-flex min-h-[40px] flex-1 cursor-pointer items-center justify-center rounded-lg border bg-white px-2 text-[13px] font-[inherit] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6]";

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center rounded-md bg-[#e7f6ee] px-2 py-0.5 text-xs font-medium text-[#0f7a45]"
          : "inline-flex items-center rounded-md bg-[#f1f4f8] px-2 py-0.5 text-xs font-medium text-[#5c6b80]"
      }
    >
      {active ? "Aktif" : "Pasif"}
    </span>
  );
}

function display(value: string) {
  return value?.trim() ? value : "—";
}

export default function OkullarClient() {
  const { activeSube } = useKurum();
  const [items, setItems] = useState<OkulRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [search, setSearch] = useState("");
  const [okulTuru, setOkulTuru] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [aktifFilter, setAktifFilter] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OkulFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOkullar({
        page,
        page_size: 25,
        search: search.trim() || undefined,
        okul_turu: okulTuru.trim() || undefined,
        il: il.trim() || undefined,
        ilce: ilce.trim() || undefined,
        aktif_mi: aktifFilter || undefined,
      });
      setItems(res.data || []);
      setTotalPages(res.pagination?.total_pages || 1);
      setTotalCount(res.pagination?.total_count || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Okul listesi yüklenemedi.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, okulTuru, il, ilce, aktifFilter]);

  useEffect(() => {
    loadData();
  }, [loadData, activeSube?.id]);

  useEffect(() => {
    setPage(1);
  }, [search, okulTuru, il, ilce, aktifFilter, activeSube?.id]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen, saving]);

  const openCreate = () => {
    setDrawerMode("create");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: OkulRecord) => {
    setDrawerMode("edit");
    setEditingId(row.id);
    setForm({
      ad: row.ad,
      okul_turu: row.okul_turu,
      il: row.il,
      ilce: row.ilce,
      not_metni: row.not_metni,
      aktif_mi: row.aktif_mi,
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.ad.trim()) {
      setFormError("Okul adı zorunludur.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (drawerMode === "create") {
        await createOkul(form);
      } else if (editingId) {
        await updateOkul(editingId, form);
      }
      setDrawerOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Kayıt başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: OkulRecord) => {
    try {
      const info = await fetchOkulDeleteInfo(row.id);
      if (!info.can_delete) {
        const deactivate = window.confirm(
          `Bu okul ${info.ogrenci_sayisi} öğrenci kaydında kullanılıyor. Silinemez; pasife alınsın mı?`
        );
        if (deactivate) {
          await updateOkul(row.id, { aktif_mi: false });
          await loadData();
        }
        return;
      }
      if (window.confirm(`"${row.ad}" okulunu silmek istediğinize emin misiniz?`)) {
        await deleteOkul(row.id);
        await loadData();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Silme işlemi başarısız.");
    }
  };

  const toggleAktif = async (row: OkulRecord) => {
    try {
      await updateOkul(row.id, { aktif_mi: !row.aktif_mi });
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Durum güncellenemedi.");
    }
  };

  const renderActions = (row: OkulRecord, layout: "table" | "card") => (
    <div className={layout === "card" ? "mt-3 flex flex-col gap-2 min-[480px]:flex-row" : "flex flex-wrap justify-end gap-0.5"}>
      <button
        type="button"
        className={layout === "card" ? `${btnCard} border-[#d7e6f4] text-[#0061A6] hover:bg-[#f4f8fc]` : btnQuiet}
        onClick={() => openEdit(row)}
      >
        Düzenle
      </button>
      <button
        type="button"
        className={layout === "card" ? `${btnCard} border-[#d7e6f4] text-[#0061A6] hover:bg-[#f4f8fc]` : btnQuiet}
        onClick={() => toggleAktif(row)}
      >
        {row.aktif_mi ? "Pasife Al" : "Aktifleştir"}
      </button>
      <button
        type="button"
        className={layout === "card" ? `${btnCard} border-[#f3d4d1] text-[#b42318] hover:bg-[#fef3f2]` : btnDanger}
        onClick={() => handleDelete(row)}
      >
        Sil
      </button>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-semibold tracking-tight text-[#1e3352]">Okullar</h1>
          <p className="m-0 mt-1 text-sm text-[#5c6b80]">
            Şube bazlı okul referans verisi
            {activeSube ? ` — ${activeSube.ad}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:shrink-0">
          <button type="button" className={btnSecondary} onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden />
            Toplu Okul Ekle
          </button>
          <button type="button" className={btnPrimary} onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            Yeni Okul
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b9bb0]" aria-hidden />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Okul adı ara…"
            aria-label="Okul adı ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          className={inputClass}
          placeholder="Okul türü"
          aria-label="Okul türü"
          value={okulTuru}
          onChange={(e) => setOkulTuru(e.target.value)}
        />
        <input className={inputClass} placeholder="İl" aria-label="İl" value={il} onChange={(e) => setIl(e.target.value)} />
        <input className={inputClass} placeholder="İlçe" aria-label="İlçe" value={ilce} onChange={(e) => setIlce(e.target.value)} />
        <div className="relative">
          <select
            className={`${inputClass} appearance-none pr-9`}
            aria-label="Durum"
            value={aktifFilter}
            onChange={(e) => setAktifFilter(e.target.value)}
          >
            <option value="">Tüm durumlar</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b9bb0]" aria-hidden />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#f3c7c3] bg-[#fef3f2] px-3.5 py-3 text-sm text-[#b42318]">
          {error}
        </div>
      )}

      <section className="min-w-0 overflow-hidden rounded-lg border border-[#e6ebf2] bg-white" aria-busy={loading}>
        {loading ? (
          <p className="m-0 px-4 py-10 text-center text-sm text-[#5c6b80]">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-10 text-center text-sm text-[#5c6b80]">Kayıt bulunamadı</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e6ebf2] bg-[#f8fafc] text-left">
                    <th scope="col" className="px-4 py-2.5 font-medium text-[#5c6b80]">Okul Adı</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-[#5c6b80]">Okul Türü</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-[#5c6b80]">İl</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-[#5c6b80]">İlçe</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-[#5c6b80]">Durum</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium text-[#5c6b80]">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-[#f0f3f7] last:border-b-0 hover:bg-[#f8fbfe]">
                      <td className="max-w-[280px] px-4 py-2.5 font-medium text-[#1e3352]">
                        <span className="break-words">{row.ad}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#31445c]">{display(row.okul_turu)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#31445c]">{display(row.il)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#31445c]">{display(row.ilce)}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill active={row.aktif_mi} />
                      </td>
                      <td className="px-3 py-1.5">{renderActions(row, "table")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-px bg-[#e6ebf2] md:grid-cols-2 xl:hidden">
              {items.map((row) => (
                <article key={row.id} className="bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="m-0 min-w-0 break-words text-sm font-semibold text-[#1e3352]">{row.ad}</h2>
                    <StatusPill active={row.aktif_mi} />
                  </div>
                  <p className="m-0 mt-1.5 break-words text-xs leading-relaxed text-[#5c6b80]">
                    <span>Tür: {display(row.okul_turu)}</span>
                    <span className="px-1.5 text-[#c5d0de]" aria-hidden>
                      ·
                    </span>
                    <span>İl: {display(row.il)}</span>
                    <span className="px-1.5 text-[#c5d0de]" aria-hidden>
                      ·
                    </span>
                    <span>İlçe: {display(row.ilce)}</span>
                  </p>
                  {renderActions(row, "card")}
                </article>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-[#e6ebf2] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <span className="text-[13px] text-[#5c6b80]">Toplam {totalCount} okul</span>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#d5deea] bg-white px-2 text-[13px] font-[inherit] font-medium text-[#1e3352] transition-colors hover:bg-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5 sm:text-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              Önceki
            </button>
            <span className="text-center text-[13px] tabular-nums text-[#31445c]">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#d5deea] bg-white px-2 text-[13px] font-[inherit] font-medium text-[#1e3352] transition-colors hover:bg-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5 sm:text-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Sonraki
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          </div>
        </div>
      </section>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-[1200] flex justify-end bg-[#0f2744]/40"
          onClick={() => !saving && setDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="okul-drawer-title"
            className="flex h-full w-full max-w-[440px] flex-col bg-white shadow-[-12px_0_40px_rgba(15,39,68,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#e6ebf2] px-4 py-3.5 sm:px-5">
              <h2 id="okul-drawer-title" className="m-0 text-base font-semibold text-[#1e3352]">
                {drawerMode === "create" ? "Yeni Okul" : "Okul Düzenle"}
              </h2>
              <button
                type="button"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#5c6b80] hover:bg-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6]"
                aria-label="Kapat"
                disabled={saving}
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="okul-ad" className="text-[13px] font-medium text-[#31445c]">
                    Okul Adı <span className="text-[#b42318]">*</span>
                  </label>
                  <input
                    id="okul-ad"
                    className={`${inputClass} ${formError ? "border-[#d92d20] focus:border-[#d92d20] focus:ring-[#d92d20]/15" : ""}`}
                    value={form.ad}
                    autoFocus
                    aria-invalid={formError ? true : undefined}
                    aria-describedby={formError ? "okul-form-error" : undefined}
                    onChange={(e) => setForm({ ...form, ad: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="okul-turu" className="text-[13px] font-medium text-[#31445c]">
                    Okul Türü
                  </label>
                  <input
                    id="okul-turu"
                    className={inputClass}
                    value={form.okul_turu || ""}
                    onChange={(e) => setForm({ ...form, okul_turu: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="okul-il" className="text-[13px] font-medium text-[#31445c]">
                      İl
                    </label>
                    <input
                      id="okul-il"
                      className={inputClass}
                      value={form.il || ""}
                      onChange={(e) => setForm({ ...form, il: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="okul-ilce" className="text-[13px] font-medium text-[#31445c]">
                      İlçe
                    </label>
                    <input
                      id="okul-ilce"
                      className={inputClass}
                      value={form.ilce || ""}
                      onChange={(e) => setForm({ ...form, ilce: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="okul-not" className="text-[13px] font-medium text-[#31445c]">
                    Not
                  </label>
                  <textarea
                    id="okul-not"
                    className={`${inputClass} h-auto min-h-[88px] resize-y py-2.5`}
                    rows={3}
                    value={form.not_metni || ""}
                    onChange={(e) => setForm({ ...form, not_metni: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="okul-durum" className="text-[13px] font-medium text-[#31445c]">
                    Durum
                  </label>
                  <div className="relative">
                    <select
                      id="okul-durum"
                      className={`${inputClass} appearance-none pr-9`}
                      value={form.aktif_mi ? "1" : "0"}
                      onChange={(e) => setForm({ ...form, aktif_mi: e.target.value === "1" })}
                    >
                      <option value="1">Aktif</option>
                      <option value="0">Pasif</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b9bb0]" aria-hidden />
                  </div>
                </div>
                {formError && (
                  <p id="okul-form-error" role="alert" className="m-0 text-[13px] text-[#b42318]">
                    {formError}
                  </p>
                )}
              </div>
              <div className="flex gap-2 border-t border-[#e6ebf2] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
                <button type="button" className={`${btnSecondary} flex-1 sm:flex-none`} disabled={saving} onClick={() => setDrawerOpen(false)}>
                  İptal
                </button>
                <button type="submit" className={`${btnPrimary} flex-1 sm:flex-none`} disabled={saving}>
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TopluOkulEkleModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onComplete={() => {
          setPage(1);
          loadData();
        }}
      />
    </div>
  );
}
