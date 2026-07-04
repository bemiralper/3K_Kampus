import { cookies } from "next/headers";
import { fetchJson } from "@/lib/fetchJson";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type DashboardResponse = {
  total_kurumlar?: number;
  total_subeler?: number;
  total_egitim_yillari?: number;
  total_ogrenciler?: number;
  total_siniflar?: number;
  total_personel?: number;
  aktif_egitim_yili?: { baslangic_yil: number; bitis_yil: number } | null;
  recent_kurumlar?: Array<{ id: number; kod: string; ad: string; aktif_mi: boolean }>;
  recent_ogrenci_kayitlar?: Array<{
    id: number;
    ogrenci: { ad: string; soyad: string };
    sinif: { ad: string };
    egitim_yili: { baslangic_yil: number; bitis_yil: number };
  }>;
};

export default async function DashboardPage() {
  const cookieHeader = cookies().toString();
  const result = await fetchJson<DashboardResponse>(`${BACKEND_URL}/api/legacy/dashboard/`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });
  const data: DashboardResponse = result.data ?? {};

  const aktifYil = data.aktif_egitim_yili
    ? `${data.aktif_egitim_yili.baslangic_yil}-${data.aktif_egitim_yili.bitis_yil}`
    : "-";

  return (
    <div className="section">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">Günlük performans ve kayıt özeti.</p>
        </div>
        <span className="badge">Aktif Eğitim Yılı: {aktifYil}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span>Kurumlar</span>
          <h3>{data.total_kurumlar ?? 0}</h3>
        </div>
        <div className="stat-card">
          <span>Şubeler</span>
          <h3>{data.total_subeler ?? 0}</h3>
        </div>
        <div className="stat-card">
          <span>Öğrenciler</span>
          <h3>{data.total_ogrenciler ?? 0}</h3>
        </div>
        <div className="stat-card">
          <span>Sınıflar</span>
          <h3>{data.total_siniflar ?? 0}</h3>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Son Eklenen Kurumlar</h3>
        </div>
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ad</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {(data.recent_kurumlar ?? []).map((kurum) => (
                <tr key={kurum.id}>
                  <td>{kurum.kod}</td>
                  <td>{kurum.ad}</td>
                  <td>
                    <span className={`badge ${kurum.aktif_mi ? "success" : "danger"}`}>
                      {kurum.aktif_mi ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Son Öğrenci Kayıtları</h3>
        </div>
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Sınıf</th>
                <th>Eğitim Yılı</th>
              </tr>
            </thead>
            <tbody>
              {(data.recent_ogrenci_kayitlar ?? []).map((kayit) => (
                <tr key={kayit.id}>
                  <td>{kayit.ogrenci.ad} {kayit.ogrenci.soyad}</td>
                  <td>{kayit.sinif.ad}</td>
                  <td>{kayit.egitim_yili.baslangic_yil}-{kayit.egitim_yili.bitis_yil}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
