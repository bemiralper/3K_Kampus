import KampanyaDetayClient from "@/app/admin/iletisim/kampanyalar/[id]/KampanyaDetayClient";

export const metadata = {
  title: "Kampanya Raporu — Muhasebe",
};

export default function MuhasebeKampanyaDetayPage() {
  return <KampanyaDetayClient portal="muhasebe" />;
}
