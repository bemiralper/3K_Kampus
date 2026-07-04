"""
Puan Hesaplama Motoru  (services/scoring.py)

TYT / AYT / LGS puan hesaplama.
ÖSYM katsayılarıyla: Başlangıç Puanı + Σ(net × katsayı) + OBP

Kaynak: ertansinansahin.com/yks-tyt-ayt-puan-hesaplama-ve-siralama-hesaplama
Her yılın katsayıları ÖSYM sonuçlarından elde edilmiştir.
"""
import math
from decimal import Decimal

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TYT KATSAYILARI  (ÖSYM — yıllara göre)
#  Formül: TYT Puan = Başlangıç + Türkçe×K1 + Sosyal×K2 + TMat×K3 + Fen×K4
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Yıl → { ders_adı: katsayı, ..., '_base': başlangıç_puanı }
TYT_KATSAYILAR = {
    2019: {'Türkçe': 3.10, 'Sosyal Bilimler': 3.03, 'Temel Matematik': 3.73, 'Fen Bilimleri': 3.49, '_base': 100.07},
    2020: {'Türkçe': 3.24, 'Sosyal Bilimler': 3.66, 'Temel Matematik': 3.34, 'Fen Bilimleri': 3.41, '_base': 99.42},
    2021: {'Türkçe': 2.92, 'Sosyal Bilimler': 2.98, 'Temel Matematik': 4.53, 'Fen Bilimleri': 3.18, '_base': 97.34},
    2022: {'Türkçe': 2.84, 'Sosyal Bilimler': 3.14, 'Temel Matematik': 2.87, 'Fen Bilimleri': 3.13, '_base': 145.89},
    2023: {'Türkçe': 2.89, 'Sosyal Bilimler': 3.02, 'Temel Matematik': 3.02, 'Fen Bilimleri': 3.06, '_base': 141.90},
    2024: {'Türkçe': 2.91, 'Sosyal Bilimler': 2.94, 'Temel Matematik': 2.93, 'Fen Bilimleri': 3.15, '_base': 144.953},
    2025: {'Türkçe': 2.83, 'Sosyal Bilimler': 2.99, 'Temel Matematik': 3.28, 'Fen Bilimleri': 2.53, '_base': 145.47},
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  AYT KATSAYILARI  (ÖSYM — yıllara göre, SAY puan türü)
#  AYT SAY Puan = Başlangıç + TYT(Türkçe×K + Sosyal×K + TMat×K + Fen×K) + AYT(Mat×K + Fiz×K + Kim×K + Bio×K)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AYT_SAY_KATSAYILAR = {
    2019: {'Türkçe': 1.23, 'Sosyal Bilimler': 1.20, 'Temel Matematik': 1.48, 'Fen Bilimleri': 1.38, 'Matematik': 2.98, 'Fizik': 3.11, 'Kimya': 3.13, 'Biyoloji': 3.08, '_base': 99.62},
    2020: {'Türkçe': 1.38, 'Sosyal Bilimler': 1.56, 'Temel Matematik': 1.43, 'Fen Bilimleri': 1.46, 'Matematik': 2.71, 'Fizik': 3.15, 'Kimya': 2.77, 'Biyoloji': 3.31, '_base': 99.13},
    2021: {'Türkçe': 1.13, 'Sosyal Bilimler': 1.16, 'Temel Matematik': 1.76, 'Fen Bilimleri': 1.24, 'Matematik': 3.40, 'Fizik': 3.48, 'Kimya': 2.46, 'Biyoloji': 2.21, '_base': 98.19},
    2022: {'Türkçe': 1.19, 'Sosyal Bilimler': 1.32, 'Temel Matematik': 1.21, 'Fen Bilimleri': 1.32, 'Matematik': 2.59, 'Fizik': 3.19, 'Kimya': 2.95, 'Biyoloji': 3.11, '_base': 125.41},
    2023: {'Türkçe': 1.19, 'Sosyal Bilimler': 1.24, 'Temel Matematik': 1.24, 'Fen Bilimleri': 1.26, 'Matematik': 2.82, 'Fizik': 2.48, 'Kimya': 2.94, 'Biyoloji': 3.10, '_base': 128.23},
    2024: {'Türkçe': 1.11, 'Sosyal Bilimler': 1.12, 'Temel Matematik': 1.11, 'Fen Bilimleri': 1.20, 'Matematik': 3.19, 'Fizik': 2.43, 'Kimya': 3.07, 'Biyoloji': 2.51, '_base': 133.28},
    2025: {'Türkçe': 1.20, 'Sosyal Bilimler': 1.27, 'Temel Matematik': 1.39, 'Fen Bilimleri': 1.07, 'Matematik': 2.89, 'Fizik': 2.46, 'Kimya': 2.53, 'Biyoloji': 2.61, '_base': 132.87},
}

AYT_EA_KATSAYILAR = {
    2019: {'Türkçe': 1.31, 'Sosyal Bilimler': 1.28, 'Temel Matematik': 1.57, 'Fen Bilimleri': 1.47, 'Matematik': 3.17, 'Edebiyat': 3.00, 'Tarih-1': 2.99, 'Coğrafya-1': 2.40, '_base': 98.24},
    2020: {'Türkçe': 1.38, 'Sosyal Bilimler': 1.55, 'Temel Matematik': 1.42, 'Fen Bilimleri': 1.45, 'Matematik': 2.69, 'Edebiyat': 3.18, 'Tarih-1': 3.54, 'Coğrafya-1': 2.96, '_base': 98.19},
    2021: {'Türkçe': 1.20, 'Sosyal Bilimler': 1.22, 'Temel Matematik': 1.86, 'Fen Bilimleri': 1.31, 'Matematik': 3.60, 'Edebiyat': 3.03, 'Tarih-1': 3.35, 'Coğrafya-1': 2.37, '_base': 92.49},
    2022: {'Türkçe': 1.22, 'Sosyal Bilimler': 1.35, 'Temel Matematik': 1.23, 'Fen Bilimleri': 1.34, 'Matematik': 2.65, 'Edebiyat': 3.21, 'Tarih-1': 3.33, 'Coğrafya-1': 2.28, '_base': 127.40},
    2023: {'Türkçe': 1.17, 'Sosyal Bilimler': 1.22, 'Temel Matematik': 1.22, 'Fen Bilimleri': 1.23, 'Matematik': 2.78, 'Edebiyat': 3.14, 'Tarih-1': 3.27, 'Coğrafya-1': 3.06, '_base': 128.96},
    2024: {'Türkçe': 1.14, 'Sosyal Bilimler': 1.15, 'Temel Matematik': 1.15, 'Fen Bilimleri': 1.23, 'Matematik': 3.28, 'Edebiyat': 2.83, 'Tarih-1': 2.38, 'Coğrafya-1': 2.54, '_base': 132.28},
    2025: {'Türkçe': 1.19, 'Sosyal Bilimler': 1.26, 'Temel Matematik': 1.38, 'Fen Bilimleri': 1.07, 'Matematik': 2.88, 'Edebiyat': 2.94, 'Tarih-1': 2.53, 'Coğrafya-1': 2.85, '_base': 129.34},
}

AYT_SOZ_KATSAYILAR = {
    2019: {'Türkçe': 1.39, 'Sosyal Bilimler': 1.36, 'Temel Matematik': 1.67, 'Fen Bilimleri': 1.56, 'Edebiyat': 3.19, 'Tarih-1': 3.18, 'Coğrafya-1': 2.55, 'Tarih-2': 3.34, 'Coğrafya-2': 2.75, 'Felsefe Grubu': 3.14, 'DKAB': 3.32, '_base': 95.11},
    2020: {'Türkçe': 1.35, 'Sosyal Bilimler': 1.53, 'Temel Matematik': 1.37, 'Fen Bilimleri': 1.42, 'Edebiyat': 3.12, 'Tarih-1': 3.47, 'Coğrafya-1': 2.91, 'Tarih-2': 3.70, 'Coğrafya-2': 2.60, 'Felsefe Grubu': 3.22, 'DKAB': 3.94, '_base': 94.45},
    2021: {'Türkçe': 1.19, 'Sosyal Bilimler': 1.22, 'Temel Matematik': 1.85, 'Fen Bilimleri': 1.30, 'Edebiyat': 3.01, 'Tarih-1': 3.33, 'Coğrafya-1': 2.35, 'Tarih-2': 4.98, 'Coğrafya-2': 2.61, 'Felsefe Grubu': 3.65, 'DKAB': 2.74, '_base': 92.90},
    2022: {'Türkçe': 1.15, 'Sosyal Bilimler': 1.27, 'Temel Matematik': 1.16, 'Fen Bilimleri': 1.27, 'Edebiyat': 3.03, 'Tarih-1': 3.15, 'Coğrafya-1': 2.15, 'Tarih-2': 3.51, 'Coğrafya-2': 2.22, 'Felsefe Grubu': 3.89, 'DKAB': 2.93, '_base': 127.68},
    2023: {'Türkçe': 1.13, 'Sosyal Bilimler': 1.18, 'Temel Matematik': 1.18, 'Fen Bilimleri': 1.19, 'Edebiyat': 3.03, 'Tarih-1': 3.16, 'Coğrafya-1': 2.96, 'Tarih-2': 3.07, 'Coğrafya-2': 2.99, 'Felsefe Grubu': 3.67, 'DKAB': 2.81, '_base': 128.44},
    2024: {'Türkçe': 1.23, 'Sosyal Bilimler': 1.24, 'Temel Matematik': 1.24, 'Fen Bilimleri': 1.33, 'Edebiyat': 3.06, 'Tarih-1': 2.57, 'Coğrafya-1': 2.74, 'Tarih-2': 3.16, 'Coğrafya-2': 2.82, 'Felsefe Grubu': 3.85, 'DKAB': 3.13, '_base': 130.36},
    2025: {'Türkçe': 1.13, 'Sosyal Bilimler': 1.19, 'Temel Matematik': 1.31, 'Fen Bilimleri': 1.01, 'Edebiyat': 2.79, 'Tarih-1': 2.39, 'Coğrafya-1': 2.70, 'Tarih-2': 3.80, 'Coğrafya-2': 2.47, 'Felsefe Grubu': 3.76, 'DKAB': 2.36, '_base': 129.61},
}

# Diploma notu ağırlığı
DIPLOMA_KATSAYI = 0.6   # OBP = diploma_notu × 0.6


def _normalize_section_name(name: str, context: str = 'tyt') -> str:
    """
    Section adını katsayı sözlüğüyle eşleştir.

    context: 'tyt' veya 'ayt'
      - TYT'de "Matematik" → "Temel Matematik" (TYT katsayı tablosundaki anahtar)
      - AYT'de "Matematik" olduğu gibi kalır (AYT katsayı tablosundaki anahtar = 40 soru toplam)
    """
    name = name.strip()

    # Ortak mapping
    common = {
        'T. Matematik': 'Temel Matematik',
        'Sosyal': 'Sosyal Bilimler',
        'Fen': 'Fen Bilimleri',
        'Türk Dili ve Edebiyatı': 'Edebiyat',
        'TDE': 'Edebiyat',
        'Din Kültürü': 'DKAB',
        'Din Kültürü ve Ahlak Bilgisi': 'DKAB',
        'İlave Felsefe': 'DKAB',
    }

    if context == 'tyt':
        # TYT'de "Matematik" = "Temel Matematik" katsayı tablosu anahtarı
        common['Matematik'] = 'Temel Matematik'

    # AYT'de "Matematik" olduğu gibi kalır — katsayı tablosunda "Matematik" var (40 soru toplam)

    return common.get(name, name)


def _get_tyt_coefficients(year: int = 2025) -> dict:
    """Verilen yıl için TYT katsayılarını getir, yoksa en yakını kullan."""
    if year in TYT_KATSAYILAR:
        return TYT_KATSAYILAR[year]
    available = sorted(TYT_KATSAYILAR.keys())
    closest = min(available, key=lambda y: abs(y - year))
    return TYT_KATSAYILAR[closest]


def calculate_tyt_score(section_nets: dict, diploma_notu: float = 0, year: int = 2025) -> dict:
    """
    TYT puan hesaplama — ÖSYM katsayılarıyla.

    Formül: Puan = Başlangıç + Σ(net × katsayı)
    Yerleştirme: Y-TYT = Puan + OBP (OBP = diploma_notu × 0.6)

    section_nets: {"Türkçe": 26.25, "Sosyal Bilimler": 9.75, "Temel Matematik": 17.5, "Fen Bilimleri": 4.5}
    """
    coef = _get_tyt_coefficients(year)
    base = coef['_base']

    toplam_net = 0.0
    ham_puan = base

    for section_name, net in section_nets.items():
        net_val = float(net) if net else 0.0
        normalized = _normalize_section_name(section_name, context='tyt')
        k = coef.get(normalized, 0)
        if k == 0:
            # Bilinmeyen bölüm — atla (alt bölümler ana bölüme dahildir)
            continue
        toplam_net += net_val
        ham_puan += net_val * k

    # Diploma notu (OBP)
    diploma_ek = 0.0
    if diploma_notu and diploma_notu > 0:
        diploma_ek = diploma_notu * DIPLOMA_KATSAYI

    puan = ham_puan + diploma_ek
    puan = max(base, min(puan, 500.0 + diploma_ek))

    return {
        'ham_puan': round(ham_puan, 2),
        'toplam_net': round(toplam_net, 2),
        'puan': round(puan, 2),
        'diploma_ek': round(diploma_ek, 2),
        'max_puan': 500.0,
        'referans_yil': year,
    }


def calculate_ayt_score(section_nets: dict, tyt_nets: dict = None, puan_turu: str = 'SAY',
                         diploma_notu: float = 0, year: int = 2025) -> dict:
    """
    AYT puan hesaplama — ÖSYM katsayılarıyla.

    AYT puanı hesaplanırken TYT testlerinin netleri de formüle dahil edilir.
    Her test kendi katsayısıyla çarpılır ve başlangıç puanına eklenir.

    puan_turu: 'SAY', 'EA', 'SOZ'
    """
    if puan_turu == 'EA':
        coef_table = AYT_EA_KATSAYILAR
    elif puan_turu == 'SOZ':
        coef_table = AYT_SOZ_KATSAYILAR
    else:
        coef_table = AYT_SAY_KATSAYILAR

    coef = coef_table.get(year, coef_table[max(coef_table.keys())])
    base = coef['_base']

    ham_puan = base
    ayt_toplam_net = 0.0
    tyt_toplam_net = 0.0

    # TYT katkısı (TYT netleri AYT katsayılarıyla çarpılır)
    # SADECE 4 ana TYT bölümü kullanılır: Türkçe, Sosyal Bilimler, Temel Matematik, Fen Bilimleri
    # TYT alt bölüm netleri (Tarih, Coğrafya, Felsefe, Fizik, Kimya, Biyoloji vb.) KULLANILMAZ
    # çünkü bunların aynı isimli AYT katsayıları var ve çift sayıma neden olur.
    TYT_ANA_BOLUMLER = {'Türkçe', 'Sosyal Bilimler', 'Temel Matematik', 'Fen Bilimleri'}
    if tyt_nets:
        for section_name, net in tyt_nets.items():
            net_val = float(net) if net else 0.0
            normalized = _normalize_section_name(section_name, context='tyt')
            # Sadece 4 ana TYT bölümünü kabul et
            if normalized not in TYT_ANA_BOLUMLER:
                continue
            k = coef.get(normalized, 0)
            if k > 0:
                tyt_toplam_net += net_val
                ham_puan += net_val * k

    # AYT dersleri
    # AYT'de 'Matematik' = 40 sorunun toplam neti (Geometri dahil)
    # Alt bölüm netleri (Fizik, Kimya, Biyoloji, Edebiyat vb.) ayrı katsayılarla
    #
    # ÖNEMLİ: TYT bölüm adlarıyla aynı isme sahip AYT ana bölümleri
    # (ör: "Fen Bilimleri" ana bölüm) TYT katsayısıyla çarpılmamalı.
    # TYT katkısı zaten tyt_nets parametresinden hesaplanıyor.
    TYT_SECTION_NAMES = {'Türkçe', 'Sosyal Bilimler', 'Temel Matematik', 'Fen Bilimleri'}
    for section_name, net in section_nets.items():
        net_val = float(net) if net else 0.0
        normalized = _normalize_section_name(section_name, context='ayt')
        # TYT bölüm adıyla eşleşen AYT ana bölümlerini atla
        # (ör: AYT "Fen Bilimleri" ana bölüm neti TYT katsayısıyla çarpılmamalı)
        if normalized in TYT_SECTION_NAMES:
            continue
        k = coef.get(normalized, 0)
        if k > 0:
            ayt_toplam_net += net_val
            ham_puan += net_val * k

    # Diploma notu (OBP)
    diploma_ek = 0.0
    if diploma_notu and diploma_notu > 0:
        diploma_ek = diploma_notu * DIPLOMA_KATSAYI

    puan = ham_puan + diploma_ek

    return {
        'ham_puan': round(ham_puan, 2),
        'ayt_net': round(ayt_toplam_net, 2),
        'tyt_net': round(tyt_toplam_net, 2),
        'toplam_net': round(ayt_toplam_net + tyt_toplam_net, 2),
        'puan': round(puan, 2),
        'diploma_ek': round(diploma_ek, 2),
        'referans_yil': year,
    }


def calculate_all_ayt_scores(section_nets: dict, tyt_nets: dict = None,
                             diploma_notu: float = 0, year: int = 2025) -> dict:
    """
    AYT sınavı için SAY, EA, SÖZ puanlarını aynı anda hesapla.

    Döndürür: {
        'SAY': { ham_puan, puan, ayt_net, tyt_net, ... },
        'EA':  { ham_puan, puan, ayt_net, tyt_net, ... },
        'SOZ': { ham_puan, puan, ayt_net, tyt_net, ... },
    }
    """
    results = {}
    for puan_turu in ('SAY', 'EA', 'SOZ'):
        results[puan_turu] = calculate_ayt_score(
            section_nets, tyt_nets, puan_turu, diploma_notu, year
        )
    return results


def calculate_score_for_exam(exam, section_nets: dict, year: int = 2025,
                              student_id: int = None, raw_student_name: str = None,
                              raw_student_id: str = None, puan_turu: str = 'SAY') -> dict:
    """
    Sınav türüne göre otomatik puan hesapla.

    student_id: AYT sınavında linked TYT'den öğrencinin netleri çekilir.
    raw_student_name: student_id yoksa ad-soyad ile eşleştirme yapılır.
    raw_student_id: Son çare olarak sıra numarası ile eşleştirme.
    puan_turu: AYT puan türü ('SAY', 'EA', 'SOZ')
    """
    exam_type = exam.exam_type

    if exam_type == 'YKS_TYT':
        return calculate_tyt_score(section_nets, year=year)
    elif exam_type == 'YKS_AYT':
        # AYT için TYT netleri linked exam'dan gelir
        tyt_nets = _get_linked_tyt_nets(exam, student_id, raw_student_name, raw_student_id)
        return calculate_ayt_score(section_nets, tyt_nets, puan_turu=puan_turu, year=year)
    else:
        # Genel sınav: TYT formülüyle hesapla
        return calculate_tyt_score(section_nets, year=year)


def _normalize_name_for_matching(name: str) -> str:
    """
    Ad-soyad'ı eşleştirme için normalize et.

    DAT dosyalarında Türkçe karakter farklılıkları olabiliyor:
    - FURUNCİ ↔ FÜRÜNCİ, ÇATALYÜREK ↔ ÇATALYUREK
    - Fazla boşluk, yapışık yazım: "BÜLB ÜL" ↔ "BÜLBÜL", "SAMETTTAŞ" ↔ "SAMET TAŞ"
    - Özel karakterler: "*", sayılar

    Strateji: Türkçe → ASCII, tüm boşluk/özel karakterleri sil, lowercase.
    """
    if not name:
        return ''
    s = name.strip().upper()
    # Türkçe → ASCII
    tr_map = str.maketrans('İŞĞÜÖÇışğüöçıİ', 'ISGUOCisgुociI')
    s = s.translate(tr_map)
    # Ü → U (translate bazen kaçırabilir)
    s = s.replace('Ü', 'U').replace('Ö', 'O').replace('Ş', 'S').replace('Ğ', 'G').replace('Ç', 'C').replace('İ', 'I')
    # Sadece harf bırak (boşluk, *, sayı gibi her şeyi sil)
    s = ''.join(c for c in s if c.isalpha())
    return s.upper()


def _get_linked_tyt_nets(exam, student_id: int = None,
                         raw_student_name: str = None,
                         raw_student_id: str = None) -> dict:
    """
    Bağlantılı TYT sınavından öğrencinin bölüm netleri çeker.

    Eşleştirme önceliği:
      1. student_id (DB'de kayıtlı öğrenci FK) — en güvenilir
      2. TC kimlik no (student FK varsa → tc_kimlik_no ile diğer sınavda ara)
      3. raw_student_name (ad-soyad) — önce birebir, sonra fuzzy (Türkçe normalize)
      4. raw_student_id (sıra numarası) — son çare
    """
    if not hasattr(exam, 'linked_tyt_exam') or not exam.linked_tyt_exam:
        return {}

    tyt_exam = exam.linked_tyt_exam

    # Lazy import — circular dependency önleme
    from ..models.result import StudentAnswer, StudentSectionScore

    tyt_answer = None

    # ── 1. student_id (DB FK) ─────────────────────────────────────────
    if student_id:
        tyt_answer = (
            StudentAnswer.objects
            .filter(
                session__exam=tyt_exam,
                session__status='COMPLETED',
                student_id=student_id,
            )
            .first()
        )

    # ── 2. TC kimlik no ──────────────────────────────────────────────
    if not tyt_answer and student_id:
        try:
            from apps.ogrenci.models import Ogrenci
            ogrenci = Ogrenci.objects.filter(id=student_id).first()
            if ogrenci and ogrenci.tc_kimlik_no:
                tyt_answer = (
                    StudentAnswer.objects
                    .filter(
                        session__exam=tyt_exam,
                        session__status='COMPLETED',
                        student__tc_kimlik_no=ogrenci.tc_kimlik_no,
                    )
                    .first()
                )
        except Exception:
            pass

    # ── 3a. raw_student_name — birebir eşleşme ──────────────────────
    if not tyt_answer and raw_student_name:
        tyt_answer = (
            StudentAnswer.objects
            .filter(
                session__exam=tyt_exam,
                session__status='COMPLETED',
                raw_student_name=raw_student_name,
            )
            .first()
        )

    # ── 3b. raw_student_name — fuzzy (Türkçe normalize) ─────────────
    if not tyt_answer and raw_student_name:
        normalized_name = _normalize_name_for_matching(raw_student_name)
        if normalized_name and len(normalized_name) >= 4:
            # TYT öğrencilerini al ve normalize isimlerle karşılaştır
            tyt_candidates = (
                StudentAnswer.objects
                .filter(
                    session__exam=tyt_exam,
                    session__status='COMPLETED',
                )
                .only('id', 'raw_student_name')
            )
            for candidate in tyt_candidates:
                cand_norm = _normalize_name_for_matching(candidate.raw_student_name)
                if cand_norm and cand_norm == normalized_name:
                    tyt_answer = candidate
                    break

    # ── 4. raw_student_id — son çare ─────────────────────────────────
    if not tyt_answer and raw_student_id:
        tyt_answer = (
            StudentAnswer.objects
            .filter(
                session__exam=tyt_exam,
                session__status='COMPLETED',
                raw_student_id=raw_student_id,
            )
            .first()
        )

    if tyt_answer:
        tyt_nets = {}
        for ss in tyt_answer.section_scores.select_related('section').all():
            tyt_nets[ss.section.name] = float(ss.net) if ss.net else 0.0
        return tyt_nets

    return {}


def estimate_ranking(puan: float, exam_type: str = 'YKS_TYT', ranking_year: int = 2025) -> dict:
    """
    Geçmiş yıl verilerine göre tahmini Türkiye sıralaması.
    ÖSYM gerçek sonuç verileri referans alınmıştır.
    ranking_year parametresi ile istenen yıl seçilebilir (varsayılan: 2025).

    NOT: Bu bir tahmindir, kesin değildir. Gerçek sıralama ÖSYM tarafından belirlenir.
    Tablolar ÖSYM sonuç istatistiklerinden derlenmiştir.
    """
    # ── TYT Sıralama Tabloları (puan → yaklaşık sıralama) ────────────────
    # 2022+ yıllarında başlangıç puanı ~145 olduğundan tablo buna göre ayarlanmıştır
    # Yaklaşık 3.4 milyon aday katılmaktadır
    tyt_tables = {
        2023: [
            (500, 1),
            (480, 120),
            (460, 1_400),
            (440, 6_500),
            (420, 20_000),
            (400, 55_000),
            (380, 120_000),
            (360, 230_000),
            (340, 400_000),
            (320, 620_000),
            (300, 900_000),
            (280, 1_250_000),
            (260, 1_650_000),
            (240, 2_000_000),
            (220, 2_350_000),
            (200, 2_650_000),
            (180, 2_900_000),
            (160, 3_100_000),
            (145, 3_400_000),
        ],
        2024: [
            (500, 1),
            (480, 100),
            (460, 1_200),
            (440, 5_800),
            (420, 18_500),
            (400, 50_000),
            (380, 110_000),
            (360, 215_000),
            (340, 380_000),
            (320, 590_000),
            (300, 870_000),
            (280, 1_220_000),
            (260, 1_600_000),
            (240, 1_980_000),
            (220, 2_320_000),
            (200, 2_620_000),
            (180, 2_880_000),
            (160, 3_080_000),
            (145, 3_400_000),
        ],
        2025: [
            (500, 1),
            (480, 110),
            (460, 1_300),
            (440, 6_000),
            (420, 19_000),
            (400, 52_000),
            (380, 115_000),
            (360, 220_000),
            (340, 390_000),
            (320, 600_000),
            (300, 880_000),
            (280, 1_230_000),
            (260, 1_620_000),
            (240, 1_990_000),
            (220, 2_340_000),
            (200, 2_640_000),
            (180, 2_890_000),
            (160, 3_090_000),
            (145, 3_400_000),
        ],
    }

    # ── AYT SAY Sıralama Tabloları ───────────────────────────────────────
    ayt_tables = {
        2023: [
            (500, 1),
            (480, 150),
            (460, 1_800),
            (440, 7_000),
            (420, 18_000),
            (400, 40_000),
            (380, 80_000),
            (360, 140_000),
            (340, 230_000),
            (320, 360_000),
            (300, 530_000),
            (280, 740_000),
            (260, 980_000),
            (240, 1_250_000),
            (220, 1_550_000),
            (200, 1_850_000),
            (180, 2_100_000),
            (160, 2_300_000),
            (130, 2_600_000),
        ],
        2024: [
            (500, 1),
            (480, 130),
            (460, 1_600),
            (440, 6_500),
            (420, 16_000),
            (400, 38_000),
            (380, 75_000),
            (360, 135_000),
            (340, 220_000),
            (320, 350_000),
            (300, 510_000),
            (280, 720_000),
            (260, 960_000),
            (240, 1_220_000),
            (220, 1_520_000),
            (200, 1_820_000),
            (180, 2_080_000),
            (160, 2_280_000),
            (133, 2_600_000),
        ],
        2025: [
            (500, 1),
            (480, 140),
            (460, 1_700),
            (440, 6_800),
            (420, 17_000),
            (400, 39_000),
            (380, 78_000),
            (360, 138_000),
            (340, 225_000),
            (320, 355_000),
            (300, 520_000),
            (280, 730_000),
            (260, 970_000),
            (240, 1_240_000),
            (220, 1_540_000),
            (200, 1_840_000),
            (180, 2_090_000),
            (160, 2_290_000),
            (133, 2_600_000),
        ],
    }

    # ── AYT EA Sıralama Tabloları ────────────────────────────────────
    ayt_ea_tables = {
        2025: [
            (500, 1),
            (480, 120),
            (460, 1_500),
            (440, 6_200),
            (420, 16_500),
            (400, 38_000),
            (380, 76_000),
            (360, 135_000),
            (340, 225_000),
            (320, 355_000),
            (300, 520_000),
            (280, 720_000),
            (260, 960_000),
            (240, 1_230_000),
            (220, 1_530_000),
            (200, 1_830_000),
            (180, 2_080_000),
            (160, 2_280_000),
            (130, 2_600_000),
        ],
    }

    # ── AYT SÖZ Sıralama Tabloları ───────────────────────────────────
    ayt_soz_tables = {
        2025: [
            (500, 1),
            (480, 100),
            (460, 1_300),
            (440, 5_500),
            (420, 15_000),
            (400, 36_000),
            (380, 72_000),
            (360, 130_000),
            (340, 218_000),
            (320, 345_000),
            (300, 510_000),
            (280, 710_000),
            (260, 950_000),
            (240, 1_220_000),
            (220, 1_520_000),
            (200, 1_820_000),
            (180, 2_070_000),
            (160, 2_270_000),
            (130, 2_600_000),
        ],
    }

    if exam_type in ('YKS_TYT', 'LGS', 'DENEME'):
        tables = tyt_tables
    elif exam_type == 'YKS_AYT_EA':
        tables = ayt_ea_tables
    elif exam_type == 'YKS_AYT_SOZ':
        tables = ayt_soz_tables
    else:
        tables = ayt_tables

    # Yıl yoksa en yakın mevcut yılı kullan
    year = ranking_year if ranking_year in tables else max(tables.keys())
    table = tables[year]

    # İnterpolasyon
    if puan >= table[0][0]:
        return {'tahmini_siralama': 1, 'yuzdelik_dilim': 100.0, 'tahmini': True, 'referans_yil': year}
    if puan <= table[-1][0]:
        return {'tahmini_siralama': table[-1][1], 'yuzdelik_dilim': 0.0, 'tahmini': True, 'referans_yil': year}

    for i in range(len(table) - 1):
        p1, r1 = table[i]
        p2, r2 = table[i + 1]
        if p2 <= puan <= p1:
            # Lineer interpolasyon
            ratio = (p1 - puan) / (p1 - p2)
            siralama = int(r1 + ratio * (r2 - r1))
            toplam = table[-1][1]
            yuzdelik = max(0, min(100, (1 - siralama / toplam) * 100))
            return {
                'tahmini_siralama': siralama,
                'yuzdelik_dilim': round(yuzdelik, 1),
                'tahmini': True,
                'referans_yil': year,
            }

    return {'tahmini_siralama': None, 'yuzdelik_dilim': None, 'tahmini': True, 'referans_yil': year}


def calculate_percentile(value: float, all_values: list) -> float:
    """Kurum içi yüzdelik dilim hesapla."""
    if not all_values:
        return 0.0
    count_below = sum(1 for v in all_values if v < value)
    return round((count_below / len(all_values)) * 100, 1)


def calculate_std_dev(values: list) -> float:
    """Standart sapma hesapla."""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
    return round(math.sqrt(variance), 2)
