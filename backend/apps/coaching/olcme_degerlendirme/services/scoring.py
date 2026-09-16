"""
Puan Hesaplama Motoru  (services/scoring.py)

TYT / AYT / LGS puan hesaplama.
ÖSYM katsayılarıyla: Başlangıç Puanı + Σ(net × katsayı) + OBP

Kaynak: ertansinansahin.com/yks-tyt-ayt-puan-hesaplama-ve-siralama-hesaplama
Her yılın katsayıları ÖSYM sonuçlarından elde edilmiştir.
"""
import math

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

TYT_ANA_BOLUMLER = frozenset({'Türkçe', 'Sosyal Bilimler', 'Temel Matematik', 'Fen Bilimleri'})
TYT_SOZ_EXTRA = frozenset({'Felsefe Grubu'})
_GENERIC_LINK_IDS = frozenset({'0', '00', '000', '-', '.', 'none', 'null'})


def is_reliable_tyt_link_code(raw_id: str | None) -> bool:
    """Sıra no / 0 gibi zayıf kodlarla başka öğrencinin TYT neti bağlanmasın."""
    if not raw_id:
        return False
    s = str(raw_id).strip()
    if not s or s.lower() in _GENERIC_LINK_IDS:
        return False
    if s.isdigit() and len(s) == 11:
        return True
    if s.isdigit() and len(s) <= 3:
        return False
    return len(s) >= 4


def _collapse_tyt_main_nets(tyt_nets: dict | None, *, include_soz_extra: bool = False) -> dict:
    """
    TYT ana test netlerini tekilleştir.

    Linked TYT hem ana bölüm (Temel Matematik 40q) hem alt bölüm (Matematik 30q)
    içerir. Alt ad TYT bağlamında Temel Matematik'e alias olduğu için ikisini
    toplamak puanı ~40 puan şişirir. Aynı anahtara düşen netlerden büyüğünü al.
    """
    if not tyt_nets:
        return {}
    allowed = set(TYT_ANA_BOLUMLER)
    if include_soz_extra:
        allowed |= set(TYT_SOZ_EXTRA)
    collapsed = {}
    for section_name, net in tyt_nets.items():
        net_val = float(net) if net else 0.0
        normalized = _normalize_section_name(section_name, context='tyt')
        if normalized not in allowed:
            continue
        prev = collapsed.get(normalized)
        if prev is None or net_val > prev:
            collapsed[normalized] = net_val
    return collapsed


def _ensure_ayt_math_net(section_nets: dict | None) -> dict:
    """Matematik-2 + Geometri varsa Matematik (40q) netini tamamla."""
    if not section_nets:
        return {}
    nets = dict(section_nets)
    parent = 0.0
    mat2 = 0.0
    geo = 0.0
    for name, net in nets.items():
        net_val = float(net) if net else 0.0
        normalized = _normalize_section_name(name, context='ayt')
        compact = normalized.replace(' ', '').replace('-', '').lower()
        if normalized == 'Matematik':
            parent = max(parent, net_val)
        elif compact in {'matematik2', 'mat2'}:
            mat2 += net_val
        elif normalized == 'Geometri':
            geo += net_val
    combo = mat2 + geo
    if mat2 and combo > parent:
        nets['Matematik'] = combo
    return nets


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
        'Felsefe (Seçmeli)': 'Felsefe Grubu',
        'Felsefe Seçmeli': 'Felsefe Grubu',
    }

    if context == 'tyt':
        # TYT'de "Matematik" = "Temel Matematik" katsayı tablosu anahtarı
        common['Matematik'] = 'Temel Matematik'

    # AYT'de "Matematik" olduğu gibi kalır — katsayı tablosunda "Matematik" var (40 soru toplam)

    return common.get(name, name)


FACTORY_TABLES = {
    'TYT': TYT_KATSAYILAR,
    'AYT_SAY': AYT_SAY_KATSAYILAR,
    'AYT_EA': AYT_EA_KATSAYILAR,
    'AYT_SOZ': AYT_SOZ_KATSAYILAR,
}


def get_factory_coefficients(kind: str, year: int) -> dict:
    """
    Hardcoded ÖSYM tablosu. 2026 henüz yok — 2025 kopyası döner.
    """
    table = FACTORY_TABLES.get(kind, TYT_KATSAYILAR)
    lookup_year = year
    if lookup_year not in table:
        if lookup_year == 2026 and 2025 in table:
            lookup_year = 2025
        else:
            available = sorted(table.keys())
            lookup_year = min(available, key=lambda y: abs(y - year))
    return dict(table[lookup_year])


def _get_tyt_coefficients(year: int = 2025) -> dict:
    """Verilen yıl için TYT katsayılarını getir, yoksa en yakını kullan."""
    return get_factory_coefficients('TYT', year)


def _lookup_db_coefficients(kurum_id, year: int, kind: str):
    if not kurum_id:
        return None
    from .scoring_settings import resolve_coefficients
    return resolve_coefficients(kurum_id, year, kind)


def calculate_tyt_score(section_nets: dict, diploma_notu: float = 0, year: int = 2025,
                        coefficients: dict = None) -> dict:
    """
    TYT puan hesaplama — ÖSYM katsayılarıyla.

    Formül: Puan = Başlangıç + Σ(net × katsayı)
    Yerleştirme: Y-TYT = Puan + OBP (OBP = diploma_notu × 0.6)

    section_nets: {"Türkçe": 26.25, "Sosyal Bilimler": 9.75, "Temel Matematik": 17.5, "Fen Bilimleri": 4.5}
    """
    coef = dict(coefficients) if coefficients else _get_tyt_coefficients(year)
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
                         diploma_notu: float = 0, year: int = 2025,
                         coefficients: dict = None) -> dict:
    """
    AYT puan hesaplama — ÖSYM katsayılarıyla.

    AYT puanı hesaplanırken TYT testlerinin netleri de formüle dahil edilir.
    Her test kendi katsayısıyla çarpılır ve başlangıç puanına eklenir.

    puan_turu: 'SAY', 'EA', 'SOZ'
    """
    if coefficients:
        coef = dict(coefficients)
    else:
        kind = {'EA': 'AYT_EA', 'SOZ': 'AYT_SOZ'}.get(puan_turu, 'AYT_SAY')
        coef = get_factory_coefficients(kind, year)
    base = coef['_base']

    ham_puan = base
    ayt_toplam_net = 0.0
    tyt_toplam_net = 0.0

    # TYT katkısı — sadece 4 ana test; aynı anahtara düşen alt bölümler tekilleşir.
    collapsed_tyt = _collapse_tyt_main_nets(
        tyt_nets, include_soz_extra=(puan_turu == 'SOZ'),
    )
    for section_name, net_val in collapsed_tyt.items():
        k = coef.get(section_name, 0)
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
    section_nets = _ensure_ayt_math_net(section_nets)
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
                             diploma_notu: float = 0, year: int = 2025,
                             kurum_id: int = None) -> dict:
    """
    AYT sınavı için SAY, EA, SÖZ puanlarını aynı anda hesapla.

    Döndürür: {
        'SAY': { ham_puan, puan, ayt_net, tyt_net, ... },
        'EA':  { ham_puan, puan, ayt_net, tyt_net, ... },
        'SOZ': { ham_puan, puan, ayt_net, tyt_net, ... },
    }
    """
    results = {}
    kind_map = {'SAY': 'AYT_SAY', 'EA': 'AYT_EA', 'SOZ': 'AYT_SOZ'}
    for puan_turu in ('SAY', 'EA', 'SOZ'):
        coef = _lookup_db_coefficients(kurum_id, year, kind_map[puan_turu])
        results[puan_turu] = calculate_ayt_score(
            section_nets, tyt_nets, puan_turu, diploma_notu, year,
            coefficients=coef,
        )
    return results


# MEB LGS ağırlıkları (8. sınıf). Standart puan için kitle ort/ss yok;
# kurum içi 100–500 ham puan: 100 + (ağırlıklı net / max) × 400.
LGS_WEIGHTS = {
    'Türkçe': 4,
    'İnkılap Tarihi': 1,
    'T.C. İnkılap Tarihi': 1,
    'T.C. İnkılap Tarihi ve Atatürkçülük': 1,
    'Din Kültürü': 1,
    'Din Kültürü ve Ahlak Bilgisi': 1,
    'Yabancı Dil': 1,
    'İngilizce': 1,
    'Matematik': 4,
    'Fen Bilimleri': 4,
    'Fen': 4,
}
LGS_NAME_ALIASES = {
    'Inkılap Tarihi': 'İnkılap Tarihi',
    'İnkılap': 'İnkılap Tarihi',
    'Inkılap': 'İnkılap Tarihi',
    'T.C. İnkılap': 'İnkılap Tarihi',
    'Din': 'Din Kültürü',
    'DKAB': 'Din Kültürü',
    'Ingilizce': 'İngilizce',
    'English': 'Yabancı Dil',
}
# Resmi LGS: 20+20+20 Türkçe/Mat/Fen (×4) + 10 İnkılap + 8 Din + 8 Dil (×1) = 266
LGS_MAX_WEIGHTED = 20 * 4 + 20 * 4 + 20 * 4 + 10 * 1 + 8 * 1 + 8 * 1

TYT_MAIN_EXAM_TYPES = frozenset({'YKS_TYT', 'DENEME'})
TYT_SOZ_EXTRA_SUB_NAMES = frozenset({
    'Felsefe (Seçmeli)', 'Felsefe Seçmeli', 'Felsefe Grubu', 'İlave Felsefe',
})


def _normalize_lgs_section_name(name: str) -> str:
    n = (name or '').strip()
    n = LGS_NAME_ALIASES.get(n, n)
    return n


def calculate_lgs_score(section_nets: dict, year: int = 2025) -> dict:
    """LGS ağırlıklı ham puan (100–500). ÖSYM/YKS katsayısı kullanılmaz."""
    weighted = 0.0
    toplam_net = 0.0
    for name, net in (section_nets or {}).items():
        net_val = float(net) if net else 0.0
        key = _normalize_lgs_section_name(name)
        w = LGS_WEIGHTS.get(key, 0)
        if not w:
            continue
        toplam_net += net_val
        weighted += net_val * w
    ham = 100.0
    if LGS_MAX_WEIGHTED:
        ham = 100.0 + (weighted / LGS_MAX_WEIGHTED) * 400.0
    ham = max(100.0, min(ham, 500.0))
    return {
        'ham_puan': round(ham, 2),
        'toplam_net': round(toplam_net, 2),
        'puan': round(ham, 2),
        'diploma_ek': 0.0,
        'max_puan': 500.0,
        'referans_yil': year,
        'skor_turu': 'LGS',
    }


def build_scoring_nets(answer, exam) -> dict:
    """Puan hesabı için bölüm netleri — TYT/LGS ana bölüm; AYT ana + çakışmayan alt.

    TYT alt 'Matematik' (30q) 'Temel Matematik' katsayısıyla ikinci kez
    çarpılmasın diye ana bölümler dışındaki netler atılır.
    """
    is_main_only = exam.exam_type in TYT_MAIN_EXAM_TYPES or exam.exam_type == 'LGS'
    result = {}
    for ss in answer.section_scores.all():
        sec = ss.section
        net_val = float(ss.net) if ss.net else 0.0
        if is_main_only:
            if not sec.is_sub_section:
                result[sec.name] = net_val
            continue
        if not sec.is_sub_section:
            result[sec.name] = net_val
        elif sec.name not in result:
            result[sec.name] = net_val
    return result


def calculate_score_for_exam(exam, section_nets: dict, year: int = 2025,
                              student_id: int = None, raw_student_name: str = None,
                              raw_student_id: str = None, puan_turu: str = 'SAY') -> dict:
    """
    Sınav türüne göre otomatik puan hesapla.

    student_id: AYT sınavında linked TYT'den öğrencinin netleri çekilir.
    raw_student_name: student_id yoksa ad-soyad ile eşleştirme yapılır.
    raw_student_id: Yalnızca TC / güvenilir okul no ile eşleştirme.
    puan_turu: AYT puan türü ('SAY', 'EA', 'SOZ')
    """
    exam_type = exam.exam_type
    kurum_id = getattr(exam, 'kurum_id', None)

    if exam_type == 'YKS_TYT':
        coef = _lookup_db_coefficients(kurum_id, year, 'TYT')
        return calculate_tyt_score(section_nets, year=year, coefficients=coef)
    if exam_type == 'YKS_AYT':
        tyt_nets = _get_linked_tyt_nets(exam, student_id, raw_student_name, raw_student_id)
        kind = {'EA': 'AYT_EA', 'SOZ': 'AYT_SOZ'}.get(puan_turu, 'AYT_SAY')
        coef = _lookup_db_coefficients(kurum_id, year, kind)
        return calculate_ayt_score(section_nets, tyt_nets, puan_turu=puan_turu, year=year, coefficients=coef)
    if exam_type == 'LGS':
        return calculate_lgs_score(section_nets, year=year)
    # DENEME / KURUM_ICI / diğer: TYT şablonuna yakın denemeler
    coef = _lookup_db_coefficients(kurum_id, year, 'TYT')
    return calculate_tyt_score(section_nets, year=year, coefficients=coef)


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


def _get_linked_tyt_answer(exam, student_id: int = None,
                           raw_student_name: str = None,
                           raw_student_id: str = None):
    """
    Bağlantılı TYT sınavından öğrencinin StudentAnswer kaydını döndürür.

    Eşleştirme önceliği:
      1. student_id (DB'de kayıtlı öğrenci FK) — en güvenilir
      2. TC kimlik no (student FK varsa → tc_kimlik_no ile diğer sınavda ara)
      3. raw_student_name (ad-soyad) — önce birebir, sonra fuzzy (Türkçe normalize)
      4. raw_student_id — yalnızca TC / güvenilir okul no (0, 1, 105 gibi sıra no değil)
    """
    if not hasattr(exam, 'linked_tyt_exam') or not exam.linked_tyt_exam:
        return None

    tyt_exam = exam.linked_tyt_exam

    # Lazy import — circular dependency önleme
    from ..models.result import StudentAnswer

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
        from apps.ogrenci.domain.models import Ogrenci
        tc = (
            Ogrenci.objects
            .filter(id=student_id)
            .values_list('tc_kimlik_no', flat=True)
            .first()
        )
        if tc:
            tyt_answer = (
                StudentAnswer.objects
                .filter(
                    session__exam=tyt_exam,
                    session__status='COMPLETED',
                    student__tc_kimlik_no=tc,
                )
                .first()
            )

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

    # ── 4. raw_student_id — yalnızca güvenilir kod (TC / okul no) ──
    if not tyt_answer and is_reliable_tyt_link_code(raw_student_id):
        tyt_answer = (
            StudentAnswer.objects
            .filter(
                session__exam=tyt_exam,
                session__status='COMPLETED',
                raw_student_id=raw_student_id,
            )
            .first()
        )

    return tyt_answer


def _get_linked_tyt_nets(exam, student_id: int = None,
                         raw_student_name: str = None,
                         raw_student_id: str = None) -> dict:
    """Bağlantılı TYT sınavından öğrencinin ana bölüm netlerini çeker."""
    tyt_answer = _get_linked_tyt_answer(exam, student_id, raw_student_name, raw_student_id)
    if not tyt_answer:
        return {}

    tyt_nets = {}
    soz_extra = 0.0
    for ss in tyt_answer.section_scores.select_related('section').all():
        name = (ss.section.name or '').strip()
        net_val = float(ss.net) if ss.net else 0.0
        if ss.section.is_sub_section:
            # Seçmeli felsefe Sosyal altında alt bölümdür; SÖZ TYT katkısı bunu ister.
            normalized = _normalize_section_name(name, context='tyt')
            if name in TYT_SOZ_EXTRA_SUB_NAMES or normalized == 'Felsefe Grubu':
                soz_extra = max(soz_extra, net_val)
            continue
        tyt_nets[name] = net_val
    if soz_extra:
        tyt_nets['Felsefe (Seçmeli)'] = soz_extra
    return tyt_nets


def estimate_ranking(puan: float, exam_type: str = 'YKS_TYT', ranking_year: int = 2025) -> dict:
    """
    Geçmiş yıl verilerine göre tahmini Türkiye sıralaması.

    2025 AYT/TYT tabloları ÖSYM «YKS sınav puanlarının yığınsal dağılımı»
    (ham puan, OBP'siz) dilimleridir. SAY / EA / SÖZ aynı puanda çok farklı
    sıralama üretir — yerleştirme tabloları kopyalanmamalı.

    NOT: Bu bir tahmindir, kesin değildir. Gerçek sıralama ÖSYM tarafından belirlenir.
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
            (480, 180),
            (460, 2_050),
            (440, 8_163),
            (420, 21_061),
            (400, 44_193),
            (380, 79_260),
            (360, 127_655),
            (340, 193_064),
            (320, 282_276),
            (300, 404_024),
            (280, 570_335),
            (260, 794_784),
            (240, 1_073_527),
            (220, 1_379_866),
            (200, 1_686_626),
            (180, 1_977_665),
            (160, 2_210_463),
            (140, 2_303_695),
            (120, 2_310_493),
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
            (480, 701),
            (460, 4_715),
            (440, 12_449),
            (420, 24_779),
            (400, 40_857),
            (380, 60_085),
            (360, 81_946),
            (340, 106_251),
            (320, 134_493),
            (300, 169_418),
            (280, 213_365),
            (260, 270_804),
            (240, 348_345),
            (220, 458_302),
            (200, 627_659),
            (180, 892_884),
            (160, 1_149_472),
            (140, 1_277_493),
            (120, 1_291_435),
        ],
    }

    # ── AYT EA Sıralama Tabloları (ÖSYM 2025 ham puan yığınsal dağılımı) ─
    ayt_ea_tables = {
        2025: [
            (500, 1),
            (480, 32),
            (460, 175),
            (440, 560),
            (420, 1_325),
            (400, 2_823),
            (380, 6_028),
            (360, 15_691),
            (340, 35_436),
            (320, 68_083),
            (300, 115_961),
            (280, 185_253),
            (260, 285_967),
            (240, 431_085),
            (220, 629_436),
            (200, 875_112),
            (180, 1_134_243),
            (160, 1_350_772),
            (140, 1_474_465),
            (120, 1_494_355),
        ],
    }

    # ── AYT SÖZ Sıralama Tabloları (ÖSYM 2025 ham puan yığınsal dağılımı) ─
    ayt_soz_tables = {
        2025: [
            (500, 1),
            (480, 4),
            (460, 21),
            (440, 76),
            (420, 227),
            (400, 652),
            (380, 1_782),
            (360, 4_912),
            (340, 12_653),
            (320, 29_315),
            (300, 60_680),
            (280, 115_851),
            (260, 205_996),
            (240, 338_388),
            (220, 515_827),
            (200, 723_293),
            (180, 920_945),
            (160, 1_070_609),
            (140, 1_155_714),
            (120, 1_173_742),
        ],
    }

    if exam_type == 'LGS':
        # LGS için ÖSYM YKS yığınsal tablosu yok — tahmini TR sıra üretilmez.
        return {
            'tahmini_siralama': None,
            'yuzdelik_dilim': None,
            'tahmini': True,
            'referans_yil': ranking_year,
        }

    if exam_type in ('YKS_TYT', 'DENEME'):
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
