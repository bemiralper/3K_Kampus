import TahsilatRaporlarClient from "@/app/finans/tahsilat-raporlar/TahsilatRaporlarClient";

/** Admin `/finans/tahsilat-raporlar` ile paylaşılmayan sayfa — re-export layout karışmasını önler. */
export default function MuhasebeTahsilatRaporlarPage() {
  return <TahsilatRaporlarClient />;
}
