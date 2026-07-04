import TopluGonderClient from "@/app/admin/iletisim/toplu-gonder/TopluGonderClient";

export const metadata = {
  title: "Toplu Gönder — Koç Paneli",
};

export default function CoachTopluGonderPage() {
  return <TopluGonderClient mode="coach" />;
}
