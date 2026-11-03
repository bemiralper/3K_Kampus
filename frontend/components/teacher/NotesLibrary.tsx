"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, FileImage, FileText, Files, LoaderCircle, Plus, Search, Trash2, UploadCloud, X } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/teacher/PortalUI";
import { localIso, teacherRequest, useTeacher, useTeacherData } from "@/lib/teacher-web";

type ClassRow = { id: number; sinif: { ad: string }; ders: { ad: string }; rol: string };
type Note = { id: number; session_date: string; file_name: string; mime_type?: string; size?: number };
const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
function shortDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }); }

export default function NotesLibrary({ planId: fixedPlanId, compact = false }: { planId?: number; compact?: boolean }) {
  const { scope, termId } = useTeacher();
  const classes = useTeacherData<{ results: ClassRow[] }>(termId ? `/api/teacher/classes/?term_id=${termId}` : null);
  const [selected, setSelected] = useState<number | null>(fixedPlanId || null);
  const plan = classes.data?.results.find(row => row.id === (fixedPlanId || selected)) || (!fixedPlanId ? classes.data?.results[0] : undefined);
  const notes = useTeacherData<{ results: Note[] }>(termId && plan ? `/api/teacher/classes/${plan.id}/notes/?term_id=${termId}` : null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [date, setDate] = useState(localIso(new Date()));
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canWrite = plan?.rol === "PRIMARY";
  useEffect(() => { if (new URLSearchParams(window.location.search).get("yukle") === "1") setUploadOpen(true); }, []);
  useEffect(() => { setFeedback(null); setDeleting(null); setFiles([]); }, [plan?.id, scope]);

  function chooseFiles(list: File[]) {
    const invalid = list.find(file => !allowed.includes(file.type) || file.size > 20 * 1024 * 1024 || file.size === 0);
    if (invalid) { setFeedback({ error: true, text: `“${invalid.name}” yüklenemiyor. PDF veya görsel seç; dosya boş olmamalı ve 20 MB sınırını aşmamalı.` }); return; }
    setFeedback(null); setFiles(list);
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!scope || !termId || !plan || !canWrite || !files.length || pending) return;
    setPending(true); setFeedback(null);
    let completed = 0;
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("term_id", String(termId)); body.append("session_date", date); body.append("file", file);
        await teacherRequest(`/api/teacher/classes/${plan.id}/notes/`, { method: "POST", body, scope, headers: { "Idempotency-Key": crypto.randomUUID() } });
        completed++;
      }
      setFiles([]); if (fileInput.current) fileInput.current.value = "";
      setUploadOpen(false); setFeedback({ error: false, text: `${completed} ders notu ${plan.sinif.ad} sınıfına yüklendi.` });
    } catch (err) {
      setFiles(files.slice(completed));
      setFeedback({ error: true, text: `${completed ? `${completed} dosya yüklendi. Kalan dosyalar: ` : ""}${err instanceof Error ? err.message : "Yükleme tamamlanamadı."}` });
    } finally { setPending(false); notes.reload(); }
  }
  async function openNote(note: Note) {
    if (!scope) return;
    // Open during the user gesture so Safari does not block the file tab.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const body = await teacherRequest<{ view: string }>(`/api/teacher/notes/${note.id}/link/`, { method: "POST", body: "{}", scope });
      const url = `/api/teacher/notes/${note.id}/file/?view=${encodeURIComponent(body.view)}`;
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (err) { tab?.close(); setFeedback({ error: true, text: err instanceof Error ? err.message : "Dosya açılamadı." }); }
  }
  async function removeNote() {
    if (!scope || !deleting || pending) return;
    setPending(true);
    try {
      await teacherRequest(`/api/teacher/notes/${deleting.id}/`, { method: "DELETE", scope });
      setFeedback({ error: false, text: "Ders notu kaldırıldı." }); setDeleting(null); notes.reload();
    } catch (err) { setFeedback({ error: true, text: err instanceof Error ? err.message : "Dosya silinemedi." }); }
    finally { setPending(false); }
  }
  const results = (notes.data?.results || []).filter(note => note.file_name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <>
    {!compact && <div className="tp-library-intro"><div><span className="tp-eyebrow">KENDİ BİLGİ KÜTÜPHANEN</span><h2>İyi bir ders, iyi bir notla kalır.</h2><p>Sınıfını seç, ders notlarını bir arada gör. PDF ve görsellerini yükle; materyallerin dersine bağlı, düzenli ve erişilebilir kalsın.</p></div><span className="tp-library-mark" aria-hidden="true"><Files size={36} strokeWidth={1.25} /></span></div>}
    {classes.error && <p className="tp-error" role="alert">{classes.error}<button type="button" onClick={classes.reload}>Yeniden dene</button></p>}
    {!fixedPlanId && <div className="tp-library-filters"><label>Sınıf ve ders<select className="tp-select" value={plan?.id || ""} disabled={pending || classes.loading} onChange={event => setSelected(Number(event.target.value))}>{!classes.data?.results.length && <option value="">Atanmış sınıf bulunmuyor</option>}{classes.data?.results.map(row => <option key={row.id} value={row.id}>{row.sinif.ad} · {row.ders.ad}</option>)}</select></label><div className="tp-search"><Search size={17} /><input aria-label="Ders notlarında ara" placeholder="Notlarında ara…" value={query} onChange={event => setQuery(event.target.value)} /></div></div>}
    <div className="tp-toolbar"><span className="tp-muted">{plan ? `${plan.sinif.ad} · ${plan.ders.ad}` : "Ders notları"} {notes.data ? ` / ${notes.data.results.length} materyal` : ""}</span>{canWrite && <button className="tp-button" type="button" disabled={pending} onClick={() => setUploadOpen(value => !value)}>{uploadOpen ? <X size={16} /> : <Plus size={16} />}{uploadOpen ? "Yüklemeyi kapat" : "Ders notu yükle"}</button>}</div>
    {feedback && <div role={feedback.error ? "alert" : "status"} className={`tp-feedback${feedback.error ? " is-error" : ""}`}>{feedback.error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{feedback.text}</span></div>}
    {uploadOpen && canWrite && <form className="tp-upload" onSubmit={upload}><div className="tp-upload-head"><h2>Yeni bir bilgi paylaş.</h2><span className="tp-pill">{plan?.sinif.ad}</span></div><label className={`tp-drop${dragging ? " is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!pending) chooseFiles(Array.from(event.dataTransfer.files)); }}><UploadCloud size={29} strokeWidth={1.5} /><strong>{files.length ? `${files.length} dosya seçildi` : "Dosyalarını buraya bırak veya seç"}</strong><span>{files.length ? files.map(file => file.name).join(" · ") : "PDF, PNG, JPG, WEBP · Dosya başına en fazla 20 MB"}</span><input ref={fileInput} aria-label="Yüklenecek ders notları" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple disabled={pending} onChange={event => chooseFiles(Array.from(event.target.files || []))} /></label><div className="tp-upload-bottom"><label>Ders tarihi<input className="tp-field" type="date" required value={date} disabled={pending} onChange={event => setDate(event.target.value)} /></label><button type="submit" className="tp-button" disabled={pending || !files.length}>{pending ? <LoaderCircle size={17} className="tp-spin" /> : <UploadCloud size={17} />}{pending ? "Yükleniyor…" : `${files.length || ""} dosya yükle`}</button></div></form>}
    {deleting && <div className="tp-note-confirm" role="alert"><p><strong>{deleting.file_name}</strong> dosyası kalıcı olarak silinecek. Devam edilsin mi?</p><div className="tp-actions"><button type="button" className="tp-button danger" disabled={pending} onClick={removeNote}>Dosyayı sil</button><button type="button" className="tp-ghost" disabled={pending} onClick={() => setDeleting(null)}>Vazgeç</button></div></div>}
    {classes.loading || notes.loading ? <LoadingState /> : notes.error ? <p className="tp-error" role="alert">{notes.error}<button type="button" onClick={notes.reload}>Yeniden dene</button></p> : !termId ? <EmptyState title="Önce bir ders dönemi gerekli" description="Dönemin tanımlandığında ders notlarını burada yönetebilirsin." /> : !plan ? <EmptyState title="Henüz atanmış bir sınıfın yok" description="Sınıf ve ders ataman yapıldığında materyallerini buradan yükleyebilirsin." /> : results.length ? <div className="tp-file-grid">{results.map(note => <article className="tp-file-card" key={note.id}><div className={`tp-file-cover${note.mime_type?.startsWith("image/") ? " is-image" : ""}`} aria-hidden="true"><span>{note.mime_type?.startsWith("image/") ? <FileImage size={29} strokeWidth={1.3} /> : <FileText size={29} strokeWidth={1.3} />}<b>{note.mime_type?.startsWith("image/") ? "GÖRSEL" : "PDF"}</b></span></div><div className="tp-file-body"><h3>{note.file_name}</h3><p>{shortDate(note.session_date)}{note.size ? ` · ${(note.size / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : ""}</p><div className="tp-file-actions"><button type="button" className="tp-ghost" onClick={() => openNote(note)}><Eye size={15} />Görüntüle</button>{canWrite && <button type="button" className="tp-icon-action" disabled={pending} aria-label={`${note.file_name} dosyasını sil`} onClick={() => setDeleting(note)}><Trash2 size={15} /></button>}</div></div></article>)}</div> : <EmptyState title={query ? "Aradığın not bulunamadı" : "İlk notun için yer hazır"} description={query ? "Dosya adını değiştirerek tekrar arayabilirsin." : canWrite ? "Bu sınıfa ait ders notlarını ve görsellerini yükleyerek kütüphaneni oluşturmaya başla." : "Sınıfın ders notları yüklendiğinde burada görünecek."} />}
  </>;
}
