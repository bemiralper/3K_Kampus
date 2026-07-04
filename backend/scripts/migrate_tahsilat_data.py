"""
Data Migration: Çoklu tahsilat kayıtlarını birleştir + TahsilatDagitim oluştur

Mevcut eski yapı: Her taksit için ayrı Tahsilat kaydı
Yeni yapı: Tek Tahsilat kaydı + TahsilatDagitim kayıtları

Strateji:
1. toplam_odeme IS NOT NULL olan aktif tahsilatları grupla
2. Her grup için: ilk tahsilatı ana kayıt yap (tutar = toplam_odeme)
3. Grubun her tahsilatı için TahsilatDagitim oluştur
4. Gruptaki diğer tahsilatları sil (iptal değil, fiziksel sil — çünkü artık dagitim tablosunda)
5. toplam_odeme NULL olan tekil tahsilatlar için: kendi taksiti varsa dagitim oluştur
"""
import psycopg
from collections import defaultdict

conn = psycopg.connect('dbname=lms_db user=taner')
cur = conn.cursor()

# ═══════════════════════════════════════
# 1. Çoklu tahsilatları grupla (toplam_odeme NOT NULL, aktif)
# ═══════════════════════════════════════
cur.execute("""
    SELECT id, sozlesme_id, taksit_id, tutar, toplam_odeme, tahsilat_turu, 
           odeme_yontemi_id, tahsilat_tarihi, referans_no, aciklama, islem_yapan_id, durum
    FROM tahsilat 
    WHERE toplam_odeme IS NOT NULL AND durum = 'aktif'
    ORDER BY id
""")
aktif_coklu = cur.fetchall()

# Gruplama: aynı sozlesme + aynı toplam_odeme + aynı tarih = aynı ödeme
gruplar = defaultdict(list)
for row in aktif_coklu:
    key = (row[1], float(row[4]), str(row[7]))  # sozlesme_id, toplam_odeme, tarih
    gruplar[key].append(row)

print(f"Aktif çoklu tahsilat grupları: {len(gruplar)}")

for key, rows in gruplar.items():
    print(f"\n  Grup: sozlesme={key[0]}, toplam={key[1]}, tarih={key[2]}")
    ana = rows[0]  # İlk tahsilatı ana kayıt yap
    ana_id = ana[0]
    toplam = float(ana[4])
    
    print(f"    Ana tahsilat: ID={ana_id}, tutar={float(ana[3])}, taksit={ana[2]}")
    
    # Ana tahsilatın tutarını toplam_odeme'ye güncelle
    cur.execute(
        "UPDATE tahsilat SET tutar = %s WHERE id = %s",
        (toplam, ana_id)
    )
    print(f"    → Ana tahsilat tutarı {toplam} olarak güncellendi")
    
    # Her satır için TahsilatDagitim oluştur
    for row in rows:
        tid, _, taksit_id, tutar, _, _, _, _, _, _, _, _ = row
        if taksit_id:
            cur.execute(
                "INSERT INTO tahsilat_dagitim (tahsilat_id, taksit_id, tutar, created_at) VALUES (%s, %s, %s, NOW())",
                (ana_id, taksit_id, float(tutar))
            )
            print(f"    → Dagitim: taksit={taksit_id}, tutar={float(tutar)}")
    
    # Gruptaki diğer tahsilatları sil (ana hariç)
    for row in rows[1:]:
        diğer_id = row[0]
        cur.execute("DELETE FROM tahsilat WHERE id = %s", (diğer_id,))
        print(f"    → Silindi: ID={diğer_id}")

# ═══════════════════════════════════════
# 2. Tekil aktif tahsilatlar (toplam_odeme NULL, taksit var) → dagitim oluştur
# ═══════════════════════════════════════
cur.execute("""
    SELECT id, taksit_id, tutar FROM tahsilat 
    WHERE toplam_odeme IS NULL AND durum = 'aktif' AND taksit_id IS NOT NULL
""")
tekil = cur.fetchall()
print(f"\nTekil aktif tahsilatlar: {len(tekil)}")

for row in tekil:
    th_id, taksit_id, tutar = row
    # Zaten dagitim var mı kontrol
    cur.execute("SELECT COUNT(*) FROM tahsilat_dagitim WHERE tahsilat_id = %s", (th_id,))
    if cur.fetchone()[0] == 0:
        cur.execute(
            "INSERT INTO tahsilat_dagitim (tahsilat_id, taksit_id, tutar, created_at) VALUES (%s, %s, %s, NOW())",
            (th_id, taksit_id, float(tutar))
        )
        print(f"  → Dagitim oluşturuldu: tahsilat={th_id}, taksit={taksit_id}, tutar={float(tutar)}")

# ═══════════════════════════════════════
# 3. toplam_odeme alanını temizle (artık gereksiz)
# ═══════════════════════════════════════
cur.execute("UPDATE tahsilat SET toplam_odeme = NULL")

conn.commit()

# Sonuç kontrolü
cur.execute("SELECT COUNT(*) FROM tahsilat WHERE durum = 'aktif'")
print(f"\nSonuç: {cur.fetchone()[0]} aktif tahsilat")
cur.execute("SELECT COUNT(*) FROM tahsilat_dagitim")
print(f"Sonuç: {cur.fetchone()[0]} dagitim kaydı")

cur.close()
conn.close()
print("\n✅ Data migration tamamlandı!")
