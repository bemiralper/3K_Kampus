import KampanyalarClient from "@/app/admin/iletisim/kampanyalar/KampanyalarClient";

export const metadata = {
  title: "Gönderim Geçmişi — Muhasebe",
};

export default function MuhasebeKampanyalarPage() {
  return <KampanyalarClient portal="muhasebe" />;
}
