"""
Öğrenci listesi API — paylaşılan filtre, arama, serileştirme ve sayfalama.
"""
import csv
import io
import re
from datetime import datetime

from django.db import models
from django.db.models import Func, Value, CharField
from django.http import HttpResponse, JsonResponse

from apps.ogrenci.domain.models import OgrenciKayit, OgrenciVeli, OgrenciEgitimPaketi


MAX_EXPORT_ROWS = 5000
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100

SORT_MAP = {
    'name_asc': ('ogrenci__ad', 'ogrenci__soyad'),
    'name_desc': ('-ogrenci__ad', '-ogrenci__soyad'),
    'kayit_tarihi_desc': ('-kayit_tarihi', '-id'),
    'kayit_tarihi_asc': ('kayit_tarihi', 'id'),
    'created_at_desc': ('-created_at', '-id'),
    'created_at_asc': ('created_at', 'id'),
}

FILTER_KALEM_TURLERI = [
    ('grup_dersi', 'Grup Dersi'),
    ('ozel_ders', 'Özel Ders'),
    ('deneme', 'Deneme'),
    ('ek_hizmet', 'Ek Hizmet'),
]
FILTER_KALEM_TURU_VALUES = {v for v, _ in FILTER_KALEM_TURLERI}

FILTER_KALEM_GRUP_LABELS = {
    'grup_dersi': 'Grup Dersleri',
    'ozel_ders': 'Özel Dersler',
    'deneme': 'Denemeler',
    'ek_hizmet': 'Ek Hizmetler',
}
KALEM_TURU_LABELS = dict(FILTER_KALEM_TURLERI)


def parse_int_list_param(raw):
    """``1,2,3`` veya tekrarlayan query param → [int, ...]"""
    if not raw:
        return []
    if isinstance(raw, (list, tuple)):
        parts = raw
    else:
        parts = str(raw).split(',')
    seen = set()
    result = []
    for part in parts:
        part = str(part).strip()
        if not part:
            continue
        try:
            val = int(part)
        except ValueError:
            continue
        if val in seen:
            continue
        seen.add(val)
        result.append(val)
    return result


def parse_kalem_filter_param(raw):
    """``kalemler=grup_dersi:5,ozel_ders:3`` → [(turu, id), ...]"""
    if not raw:
        return []
    specs = []
    seen = set()
    for part in str(raw).split(','):
        part = part.strip()
        if not part or ':' not in part:
            continue
        tur, id_str = part.split(':', 1)
        tur = tur.strip()
        try:
            kid = int(id_str.strip())
        except ValueError:
            continue
        if tur not in FILTER_KALEM_TURU_VALUES:
            continue
        key = (tur, kid)
        if key in seen:
            continue
        seen.add(key)
        specs.append((tur, kid))
    return specs


def _catalog_models():
    from apps.egitim_paketleri.models import Deneme, EkHizmet, GrupDersi, OzelDers
    return {
        'grup_dersi': GrupDersi,
        'ozel_ders': OzelDers,
        'deneme': Deneme,
        'ek_hizmet': EkHizmet,
    }


def resolve_kalem_filter_turu(kalem, sozlesme):
    """
    Sözleşme kaleminin filtre türünü belirle.

    GrupDersi / OzelDers / Deneme / EkHizmet ayrı tablolardır; aynı sayısal ID
    farklı türlerde tekrarlanabilir. Bu yüzden tür, yalnızca kayıtlı kalem_turu
    ve sözleşme.paket_turu üzerinden çözülür — çapraz tablo ID araması yapılmaz.
    """
    from apps.odeme_takip.domain.enums import KalemTuru

    tur = kalem.kalem_turu

    if tur == KalemTuru.GRUP_DERSI:
        return 'grup_dersi'
    if tur == KalemTuru.OZEL_DERS:
        return 'ozel_ders'
    if tur == KalemTuru.DENEME:
        return 'deneme'
    if tur in (KalemTuru.EK_HIZMET, KalemTuru.EK_HIZMET_SATISI):
        return 'ek_hizmet'

    if tur == KalemTuru.PAKET and sozlesme:
        if (
            kalem.kalem_id == sozlesme.paket_id
            and sozlesme.paket_turu in FILTER_KALEM_TURU_VALUES
        ):
            return sozlesme.paket_turu

    return None


def kalem_matches_filter(kalem, sozlesme, filter_turu, filter_id):
    resolved = resolve_kalem_filter_turu(kalem, sozlesme)
    if resolved == filter_turu and kalem.kalem_id == filter_id:
        return True

    # Deneme paketi bazen ek hizmet satırı olarak kayıtlı (deneme_paketi FK)
    if filter_turu == 'deneme':
        from apps.egitim_paketleri.models import EkHizmet
        from apps.odeme_takip.domain.enums import KalemTuru

        if kalem.kalem_turu in (KalemTuru.EK_HIZMET, KalemTuru.EK_HIZMET_SATISI):
            eh = EkHizmet.objects.filter(id=kalem.kalem_id).first()
            if eh and eh.deneme_paketi_id == filter_id:
                return True

    return False


def get_ogrenci_ids_by_kalem_filter(sozlesme_qs, filter_turu, filter_id):
    return get_ogrenci_ids_by_kalem_filters(sozlesme_qs, [(filter_turu, filter_id)])


def get_ogrenci_ids_by_kalem_filters(sozlesme_qs, filter_specs):
    """Öğrenci ID'leri — seçili kalemlerden en az birine sahip olanlar (OR)."""
    if not filter_specs:
        return set()
    ogrenci_ids = set()
    for sozlesme in sozlesme_qs.prefetch_related('kalemler'):
        for kalem in sozlesme.kalemler.all():
            for filter_turu, filter_id in filter_specs:
                if kalem_matches_filter(kalem, sozlesme, filter_turu, filter_id):
                    ogrenci_ids.add(sozlesme.ogrenci_id)
                    break
            else:
                continue
            break
    return ogrenci_ids


def _filter_catalog_qs(model, ctx):
    """Kurum/şube/eğitim yılı kapsamındaki aktif katalog kayıtları."""
    qs = model.objects.filter(aktif_mi=True)
    kurum_id = ctx.get('kurum_id')
    sube_id = ctx.get('sube_id')
    egitim_yili_id = ctx.get('egitim_yili_id')
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    return qs.order_by('ad')


def build_kalem_gruplari(ctx):
    """
    Filtre drawer grupları — eğitim paketleri kataloğundan (GrupDersi, OzelDers,
    Deneme, EkHizmet). Sözleşmede henüz kullanılmamış paketler de listelenir.
    """
    models = _catalog_models()
    gruplar = []
    for tur, label in FILTER_KALEM_GRUP_LABELS.items():
        qs = _filter_catalog_qs(models[tur], ctx)
        kalemler = [{'kalem_id': p.id, 'kalem_adi': p.ad} for p in qs]
        gruplar.append({
            'tur': tur,
            'label': label,
            'count': len(kalemler),
            'kalemler': kalemler,
        })
    return gruplar


def build_egitim_kalemleri_options(ctx):
    """Katalog gruplarının düz listesi."""
    options = []
    for grup in build_kalem_gruplari(ctx):
        for kalem in grup['kalemler']:
            options.append({
                'kalem_turu': grup['tur'],
                'kalem_id': kalem['kalem_id'],
                'kalem_adi': kalem['kalem_adi'],
            })
    return options


EXPORT_COLUMNS = {
    'tam_ad': 'Ad Soyad',
    'ad': 'Ad',
    'soyad': 'Soyad',
    'tc_kimlik_no': 'TC Kimlik No',
    'okul_no': 'Okul No',
    'telefon': 'Telefon',
    'email': 'E-posta',
    'cinsiyet': 'Cinsiyet',
    'dogum_tarihi': 'Doğum Tarihi',
    'veli_ad_soyad': 'Veli Ad Soyad',
    'veli_telefon': 'Veli Telefon',
    'veli_yakinlik_display': 'Veli Yakınlık',
    'sinif_ad': 'Sınıf',
    'sinif_seviyesi': 'Sınıf Seviyesi',
    'sube_ad': 'Şube',
    'kayit_tarihi': 'Kayıt Tarihi',
    'giris_turu_display': 'Giriş Türü',
    'aktif_mi': 'Durum',
    'egitim_yili': 'Eğitim Yılı',
    'kalem_ozet': 'Eğitim Kalemleri',
}


def format_date(value):
    return value.strftime('%d.%m.%Y') if value else ''


def parse_date_param(value):
    if not value:
        return None
    for fmt in ('%Y-%m-%d', '%d.%m.%Y'):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_list_params(request):
    """URL query parametrelerini standart dict'e çevir."""
    p = request.GET
    page = max(1, int(p.get('page', 1) or 1))
    page_size = min(MAX_PAGE_SIZE, max(1, int(p.get('page_size', DEFAULT_PAGE_SIZE) or DEFAULT_PAGE_SIZE)))

    kalemler = parse_kalem_filter_param(p.get('kalemler') or '')
    if not kalemler and p.get('kalem_turu') and p.get('kalem_id'):
        kalemler = parse_kalem_filter_param(f"{p.get('kalem_turu')}:{p.get('kalem_id')}")

    sinif_seviyesi_ids = parse_int_list_param(p.get('sinif_seviyesi_ids') or '')
    if not sinif_seviyesi_ids and p.get('sinif_seviyesi_id'):
        sinif_seviyesi_ids = parse_int_list_param(p.get('sinif_seviyesi_id'))

    sinif_ids = parse_int_list_param(p.get('sinif_ids') or '')
    if not sinif_ids and p.get('sinif_id'):
        sinif_ids = parse_int_list_param(p.get('sinif_id'))

    return {
        'q': (p.get('q') or '').strip(),
        'all_years': p.get('all_years', '') == '1',
        'durum': p.get('durum', 'all') if p.get('durum', 'all') in ('aktif', 'pasif', 'all') else 'all',
        'sinif_seviyesi_ids': sinif_seviyesi_ids,
        'giris_turu': (p.get('giris_turu') or '').strip() or None,
        'cinsiyet': (p.get('cinsiyet') or '').strip() or None,
        'paket_id': int(p['paket_id']) if p.get('paket_id') else None,
        'paket_turu': (p.get('paket_turu') or '').strip() or None,
        'kalemler': kalemler,
        'sinif_ids': sinif_ids,
        'sube_id': int(p['sube_id']) if p.get('sube_id') else None,
        'kayit_tarihi_bas': parse_date_param(p.get('kayit_tarihi_bas')),
        'kayit_tarihi_bit': parse_date_param(p.get('kayit_tarihi_bit')),
        'sort': p.get('sort', 'created_at_desc') if p.get('sort') in SORT_MAP else 'created_at_desc',
        'page': page,
        'page_size': page_size,
    }


def apply_smart_search(queryset, search_query, prefix=''):
    """
    Akıllı arama filtresi uygula.
    prefix: OgrenciKayit üzerinden ise 'ogrenci__' olacak
    """
    words = search_query.strip().split()
    if not words:
        return queryset

    p = prefix
    tel_field = f'{p}telefon' if p else 'telefon'
    tel_clean_name = f'{p.replace("__", "_")}telefon_clean' if p else 'telefon_clean'

    class RegexpReplace(Func):
        function = 'REGEXP_REPLACE'

    queryset = queryset.annotate(**{
        tel_clean_name: RegexpReplace(
            models.F(tel_field), Value(r'[^0-9]'), Value(''), Value('g'),
            output_field=CharField()
        ),
    })

    for word in words:
        digits_only = re.sub(r'[^0-9]', '', word)

        word_q = (
            models.Q(**{f'{p}ad__icontains': word}) |
            models.Q(**{f'{p}soyad__icontains': word}) |
            models.Q(**{f'{p}veliler__ad__icontains': word}) |
            models.Q(**{f'{p}veliler__soyad__icontains': word})
        )

        if digits_only:
            word_q = word_q | (
                models.Q(**{f'{p}tc_kimlik_no__icontains': digits_only}) |
                models.Q(**{tel_clean_name + '__icontains': digits_only}) |
                models.Q(**{f'{p}veliler__telefon__icontains': digits_only}) |
                models.Q(**{f'{p}veliler__telefon__icontains': word}) |
                models.Q(**{f'{p}veliler__tc_kimlik_no__icontains': digits_only})
            )
            if not p:
                word_q = word_q | models.Q(okul_no__icontains=digits_only)
            else:
                word_q = word_q | models.Q(okul_no__icontains=digits_only)

        queryset = queryset.filter(word_q)

    return queryset.distinct()


def get_varsayilan_veli(ogrenci):
    veli = OgrenciVeli.objects.filter(ogrenci=ogrenci, varsayilan=True).first()
    if not veli:
        veli = OgrenciVeli.objects.filter(ogrenci=ogrenci).first()
    return veli


def build_kayit_queryset(ctx, params, apply_durum=True):
    """OgrenciKayit queryset — kurum/şube/yıl ve gelişmiş filtreler."""
    use_all_years = params['all_years'] or not ctx.get('egitim_yili_id')
    effective_sube_id = params['sube_id'] or ctx['sube_id']

    qs = OgrenciKayit.objects.filter(
        kurum_id=ctx['kurum_id'],
        sube_id=effective_sube_id,
    ).select_related(
        'ogrenci', 'sinif', 'sinif__sinif_seviyesi', 'egitim_yili', 'sube'
    ).prefetch_related('ogrenci__veliler')

    if not use_all_years:
        qs = qs.filter(egitim_yili_id=ctx['egitim_yili_id'])

    if params['sinif_seviyesi_ids']:
        qs = qs.filter(sinif__sinif_seviyesi_id__in=params['sinif_seviyesi_ids'])

    if params['sinif_ids']:
        qs = qs.filter(sinif_id__in=params['sinif_ids'])

    if params['giris_turu']:
        qs = qs.filter(giris_turu=params['giris_turu'])

    if params['cinsiyet']:
        qs = qs.filter(ogrenci__cinsiyet=params['cinsiyet'])

    if params['kayit_tarihi_bas']:
        qs = qs.filter(kayit_tarihi__gte=params['kayit_tarihi_bas'])

    if params['kayit_tarihi_bit']:
        qs = qs.filter(kayit_tarihi__lte=params['kayit_tarihi_bit'])

    if params['paket_id'] and params['paket_turu']:
        ogrenci_ids = OgrenciEgitimPaketi.objects.filter(
            paket_id=params['paket_id'],
            paket_turu=params['paket_turu'],
            aktif_mi=True,
        ).values_list('ogrenci_id', flat=True)
        qs = qs.filter(ogrenci_id__in=ogrenci_ids)

    filter_kalemler = list(params.get('kalemler') or [])

    if filter_kalemler:
        from apps.odeme_takip.domain.models import Sozlesme
        from apps.odeme_takip.domain.enums import SozlesmeDurum

        sozlesme_qs = Sozlesme.objects.filter(
            kurum_id=ctx['kurum_id'],
            sube_id=effective_sube_id,
            durum__in=[SozlesmeDurum.AKTIF, SozlesmeDurum.TASLAK, SozlesmeDurum.TAMAMLANDI],
        )
        if not use_all_years and ctx.get('egitim_yili_id'):
            sozlesme_qs = sozlesme_qs.filter(egitim_yili_id=ctx['egitim_yili_id'])

        ogrenci_ids = get_ogrenci_ids_by_kalem_filters(sozlesme_qs, filter_kalemler)
        qs = qs.filter(ogrenci_id__in=ogrenci_ids)

    if params['q']:
        qs = apply_smart_search(qs, params['q'], prefix='ogrenci__')

    if apply_durum:
        if params['durum'] == 'aktif':
            qs = qs.filter(aktif_mi=True)
        elif params['durum'] == 'pasif':
            qs = qs.filter(aktif_mi=False)

    order = SORT_MAP.get(params['sort'], SORT_MAP['created_at_desc'])
    qs = qs.order_by(*order)

    return qs, use_all_years


def compute_filter_counts(qs):
    return {
        'aktif': qs.filter(aktif_mi=True).count(),
        'pasif': qs.filter(aktif_mi=False).count(),
    }


def paginate_queryset(queryset, page, page_size):
    total_count = queryset.count()
    total_pages = max(1, (total_count + page_size - 1) // page_size) if total_count else 1
    page = min(page, total_pages)
    start = (page - 1) * page_size
    items = list(queryset[start:start + page_size])
    return items, {
        'page': page,
        'page_size': page_size,
        'total_count': total_count,
        'total_pages': total_pages,
    }


def _catalog_kalem_adi(tur, kalem_id):
    models = _catalog_models()
    model = models.get(tur)
    if not model:
        return None
    paket = model.objects.filter(id=kalem_id).values_list('ad', flat=True).first()
    return paket or None


def _serialize_kalem_entry(kalem, sozlesme):
    resolved_tur = resolve_kalem_filter_turu(kalem, sozlesme)
    if not resolved_tur or resolved_tur not in FILTER_KALEM_TURU_VALUES:
        return None
    kalem_adi = _catalog_kalem_adi(resolved_tur, kalem.kalem_id) or kalem.kalem_adi or ''
    return {
        'kalem_turu': resolved_tur,
        'kalem_id': kalem.kalem_id,
        'kalem_turu_display': KALEM_TURU_LABELS.get(resolved_tur, resolved_tur),
        'kalem_adi': kalem_adi,
    }


def build_ogrenci_kalemler_map(kayit_list, filter_kalemler=None):
    """Kayıt listesi için yapılandırılmış eğitim kalemi listesi (toplu prefetch)."""
    if not kayit_list:
        return {}

    from apps.odeme_takip.domain.models import Sozlesme
    from apps.odeme_takip.domain.enums import SozlesmeDurum

    ogrenci_ids = {k.ogrenci_id for k in kayit_list}
    yil_ids = {k.egitim_yili_id for k in kayit_list if k.egitim_yili_id}
    if not ogrenci_ids or not yil_ids:
        return {k.id: [] for k in kayit_list}

    filter_set = set(filter_kalemler) if filter_kalemler else None
    cancelled = [SozlesmeDurum.IPTAL, SozlesmeDurum.FESHEDILMIS]
    pair_kalemler = {}
    sozlesmeler = Sozlesme.objects.filter(
        ogrenci_id__in=ogrenci_ids,
        egitim_yili_id__in=yil_ids,
    ).exclude(durum__in=cancelled).prefetch_related('kalemler')

    for sozlesme in sozlesmeler:
        key = (sozlesme.ogrenci_id, sozlesme.egitim_yili_id)
        entries = pair_kalemler.setdefault(key, {})
        for kalem in sozlesme.kalemler.all():
            entry = _serialize_kalem_entry(kalem, sozlesme)
            if not entry:
                continue
            dedupe_key = (entry['kalem_turu'], entry['kalem_id'])
            entries[dedupe_key] = entry

    result = {}
    for kayit in kayit_list:
        all_entries = list(
            pair_kalemler.get((kayit.ogrenci_id, kayit.egitim_yili_id), {}).values()
        )
        all_entries.sort(key=lambda x: (x['kalem_turu'], x['kalem_adi']))
        if filter_set:
            result[kayit.id] = [
                e for e in all_entries
                if (e['kalem_turu'], e['kalem_id']) in filter_set
            ]
        else:
            result[kayit.id] = all_entries
    return result


def build_kalem_ozet_map(kayit_list, filter_kalemler=None):
    """Kayıt listesi için sözleşme kalemi özet metni (CSV export uyumu)."""
    kalemler_map = build_ogrenci_kalemler_map(kayit_list, filter_kalemler=filter_kalemler)
    return {
        kayit_id: ', '.join(e['kalem_adi'] for e in entries if e.get('kalem_adi'))
        for kayit_id, entries in kalemler_map.items()
    }


def serialize_kayit_row(kayit, include_egitim_yili=False, kalem_ozet='', egitim_kalemleri=None):
    ogrenci = kayit.ogrenci
    veli = get_varsayilan_veli(ogrenci)

    row = {
        'id': ogrenci.id,
        'kayit_id': kayit.id,
        'ad': ogrenci.ad,
        'soyad': ogrenci.soyad,
        'tam_ad': ogrenci.tam_ad,
        'dogum_tarihi': format_date(ogrenci.dogum_tarihi),
        'tc_kimlik_no': ogrenci.tc_kimlik_no or '',
        'telefon': ogrenci.telefon or '',
        'email': ogrenci.email or '',
        'veli_ad_soyad': f"{veli.ad} {veli.soyad}" if veli else (ogrenci.veli_ad_soyad or ''),
        'veli_id': veli.id if veli else None,
        'veli_telefon': (
            (veli.telefon or ogrenci.veli_telefon or '') if veli else (ogrenci.veli_telefon or '')
        ),
        'veli_yakinlik': veli.veli_turu if veli else (ogrenci.veli_yakinlik or ''),
        'veli_yakinlik_display': (
            veli.get_veli_turu_display() if veli else (
                ogrenci.get_veli_yakinlik_display() if ogrenci.veli_yakinlik else ''
            )
        ),
        'aktif_mi': kayit.aktif_mi,
        'cinsiyet': ogrenci.cinsiyet or '',
        'sinif_id': kayit.sinif.id if kayit.sinif else None,
        'sinif_ad': kayit.sinif.ad if kayit.sinif else '',
        'sinif_seviyesi': (
            kayit.sinif.sinif_seviyesi.ad
            if kayit.sinif and kayit.sinif.sinif_seviyesi else ''
        ),
        'sube_ad': kayit.sube.ad if kayit.sube else '',
        'kayit_tarihi': format_date(kayit.kayit_tarihi),
        'okul_no': kayit.okul_no or '',
        'giris_turu': kayit.giris_turu,
        'giris_turu_display': (
            dict(OgrenciKayit.GIRIS_TURU_CHOICES).get(kayit.giris_turu, kayit.giris_turu)
            if kayit.giris_turu else ''
        ),
        'profil_foto': ogrenci.profil_foto.url if ogrenci.profil_foto else None,
    }

    if include_egitim_yili or kayit.egitim_yili:
        row['egitim_yili'] = kayit.egitim_yili.yil_str if kayit.egitim_yili else ''

    if egitim_kalemleri is not None:
        row['egitim_kalemleri'] = egitim_kalemleri
        row['kalem_ozet'] = kalem_ozet or ', '.join(
            e['kalem_adi'] for e in egitim_kalemleri if e.get('kalem_adi')
        )
    elif kalem_ozet:
        row['kalem_ozet'] = kalem_ozet

    return row


def build_csv_response(rows, column_keys):
    keys = [k for k in column_keys if k in EXPORT_COLUMNS]
    if not keys:
        keys = ['tam_ad', 'okul_no', 'sinif_seviyesi', 'veli_telefon', 'aktif_mi']

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow([EXPORT_COLUMNS[k] for k in keys])

    for row in rows:
        values = []
        for key in keys:
            val = row.get(key, '')
            if key == 'aktif_mi':
                val = 'Aktif' if val else 'Pasif'
            elif key == 'cinsiyet':
                if val == 'E':
                    val = 'Erkek'
                elif val == 'K':
                    val = 'Kadın'
            values.append(val if val is not None else '')
        writer.writerow(values)

    response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8-sig')
    response['Content-Disposition'] = 'attachment; filename="ogrenciler.csv"'
    return response


def format_export_row(row, keys):
    """Export satırını seçili sütunlarla düz metne çevir (CSV/JSON ortak)."""
    out = {}
    for key in keys:
        val = row.get(key, '')
        if key == 'aktif_mi':
            val = 'Aktif' if val else 'Pasif'
        elif key == 'cinsiyet':
            if val == 'E':
                val = 'Erkek'
            elif val == 'K':
                val = 'Kadın'
        out[key] = val if val is not None else ''
    return out


def build_json_export_response(rows, column_keys):
    keys = [k for k in column_keys if k in EXPORT_COLUMNS]
    if not keys:
        keys = ['tam_ad', 'okul_no', 'sinif_seviyesi', 'veli_telefon', 'aktif_mi']

    formatted = [format_export_row(row, keys) for row in rows]
    return JsonResponse({
        'success': True,
        'rows': formatted,
        'columns': keys,
        'column_labels': [EXPORT_COLUMNS[k] for k in keys],
        'total': len(formatted),
    })
