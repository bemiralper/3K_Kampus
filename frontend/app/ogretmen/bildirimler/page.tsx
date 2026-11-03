"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { EmptyState, LoadingState, PageHeading } from "@/components/teacher/PortalUI";
import { useTeacherData } from "@/lib/teacher-web";
type Item = { id: string; category: string; title: string; body: string; occurred_at: string };
type Page = { results: Item[]; categories: { code: string; label: string }[] };
export default function NotificationsPage() {
  const [category, setCategory] = useState("");
  const notes = useTeacherData<Page>(`/api/teacher/notifications/${category ? `?category=${encodeURIComponent(category)}` : ""}`);
  return <><PageHeading eyebrow="KAMPÜSLE BAĞLANTIDA KAL" title="Duyurular" description="Kurumdan haberler, program güncellemeleri ve ders bildirimlerin." /><div className="tp-toolbar"><div className="tp-tabs" role="group" aria-label="Duyuru kategorisi"><button type="button" aria-pressed={!category} onClick={() => setCategory("")}>Tümü</button>{notes.data?.categories.map(item => <button key={item.code} type="button" aria-pressed={category === item.code} onClick={() => setCategory(item.code)}>{item.label}</button>)}</div></div>{notes.error && <p className="tp-error">{notes.error}</p>}{notes.loading ? <LoadingState /> : notes.data?.results.length ? <section className="tp-notifications-list">{notes.data.results.map(item => <article className="tp-notification" key={item.id}><span className="tp-icon-tile"><Bell size={20} /></span><div><h3>{item.title}</h3><p>{item.body}</p><time dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</time></div></article>)}</section> : !notes.error && <EmptyState title="Şimdilik her şey güncel" description="Yeni duyurular ve ders programındaki değişiklikler burada seni bekleyecek." />}</>;
}
