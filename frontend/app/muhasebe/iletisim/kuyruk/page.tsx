import KuyrukClient from "@/app/admin/iletisim/kuyruk/KuyrukClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mesaj Kuyruğu — Muhasebe",
};

export default function MuhasebeKuyrukPage() {
  return <KuyrukClient portal="muhasebe" />;
}
