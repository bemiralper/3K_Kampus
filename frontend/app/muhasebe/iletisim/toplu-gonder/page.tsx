import TopluGonderClient from "@/app/admin/iletisim/toplu-gonder/TopluGonderClient";

export const metadata = {
  title: "Toplu Gönderim — Muhasebe",
};

export default function MuhasebeTopluGonderPage() {
  return (
    <TopluGonderClient
      mode="muhasebe"
      campaignDetailPath={(id) => `/admin/iletisim/kampanyalar/${id}`}
    />
  );
}
