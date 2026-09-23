import KampanyaDetayClient from "@/app/admin/iletisim/kampanyalar/[id]/KampanyaDetayClient";

export const metadata = {
  title: "Gönderim Detayı — Koç Paneli",
};

export default function CoachKampanyaDetayPage() {
  return (
    <div className="coach-toplu-gonder-page">
      <KampanyaDetayClient portal="coach" />
    </div>
  );
}
