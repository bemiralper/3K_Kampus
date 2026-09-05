import { redirect } from "next/navigation";

export default function MuhasebeFinansRaporlamaRedirect() {
  redirect("/muhasebe/finans/tahsilat-raporlar?tab=mali-analiz");
}
