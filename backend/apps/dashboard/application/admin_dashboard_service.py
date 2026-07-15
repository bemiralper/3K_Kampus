"""Yönetici ana dashboard — kurum/şube/eğitim yılı kapsamlı özet."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.finans.application.dashboard_overview_service import _mali_hesap_bloklari, _pos_hesap_bloklari
from apps.finans.constants.account_types import MaliHesapTipi
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat
from apps.ogrenci.domain.models import OgrenciKayit
from apps.personel.application.services import PersonelService
from apps.personel.domain.models import PersonelGorevlendirme
from apps.personel.domain.sozlesme_models import AylikHakedis, PersonelSozlesme

PERSONEL_TUR_LABELS = {
    'ogretmen': 'Öğretmen',
    'koc': 'Koç',
    'rehber': 'Rehber',
    'muhasebe': 'Muhasebe',
    'sekreterya': 'Sekreterya',
    'yonetim': 'Yönetim',
    'diger': 'Diğer',
}

YONETIM_ROLE_CODES = {
    'super_admin', 'sube_muduru', 'egitim_yoneticisi', 'bilgi_islem', 'kurum_yoneticisi',
}
IDARI_ROLE_CODES = {'ik', 'destek_personeli', 'temizlik_personeli', 'sekreter', 'sekreterya'}
REHBER_ROLE_CODES = {'rehber', 'rehber_ogretmen', 'psikolojik_danisman'}


def _personel_tur_key(role_code: str | None) -> str:
    code = (role_code or '').strip().lower()
    if code in {'ogretmen'}:
        return 'ogretmen'
    if code in {'koc'}:
        return 'koc'
    if code in REHBER_ROLE_CODES or 'rehber' in code:
        return 'rehber'
    if code in {'muhasebe'}:
        return 'muhasebe'
    if code in IDARI_ROLE_CODES or 'sekreter' in code:
        return 'sekreterya'
    if code in YONETIM_ROLE_CODES or 'yonetici' in code or 'mudur' in code:
        return 'yonetim'
    return 'diger'


def _month_keys_last_12(ref: date) -> list[str]:
    keys: list[str] = []
    cur = ref.replace(day=1)
    for _ in range(11, -1, -1):
        d = cur - relativedelta(months=_)
        keys.append(d.strftime('%Y-%m'))
    return keys


def _month_label(ym: str) -> str:
    y, m = ym.split('-')
    months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
    return f"{months[int(m) - 1]} {y[2:]}"


TR_MONTHS_FULL = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]


def _dogum_gunu_etiket(kalan: int) -> str:
    if kalan == 0:
        return 'Bugün'
    if kalan == 1:
        return 'Yarın'
    return f'{kalan} gün sonra'


def _next_birthday(dogum: date, ref: date) -> date:
    try:
        candidate = dogum.replace(year=ref.year)
    except ValueError:
        candidate = date(ref.year, 2, 28)
    if candidate < ref:
        try:
            return dogum.replace(year=ref.year + 1)
        except ValueError:
            return date(ref.year + 1, 2, 28)
    return candidate


def _format_dogum_gunu(d: date) -> str:
    return f'{d.day} {TR_MONTHS_FULL[d.month - 1]}'


def _int_val(v) -> int:
    if v is None:
        return 0
    if isinstance(v, Decimal):
        return int(v)
    return int(v)


def _float_val(v) -> float:
    if v is None:
        return 0.0
    return float(v)


class AdminDashboardService:
    """Tek endpoint ile yönetici dashboard verisi."""

    @classmethod
    def build(cls, *, kurum_id: int, sube_id: int, egitim_yili_id: int | None) -> dict:
        bugun = timezone.localdate()
        ay_basi = bugun.replace(day=1)

        kayit_qs = OgrenciKayit.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
        )
        if egitim_yili_id:
            kayit_qs = kayit_qs.filter(egitim_yili_id=egitim_yili_id)

        aktif_kayit = kayit_qs.filter(aktif_mi=True)
        pasif_kayit = kayit_qs.filter(aktif_mi=False)
        aktif_ogrenci = aktif_kayit.count()
        pasif_ogrenci = pasif_kayit.count()

        yeni_kayit_bu_ay = kayit_qs.filter(kayit_tarihi__gte=ay_basi, kayit_tarihi__lte=bugun).count()

        cinsiyet_rows = (
            aktif_kayit.values('ogrenci__cinsiyet')
            .annotate(sayi=Count('id'))
        )
        cinsiyet = {'K': 0, 'E': 0, 'diger': 0}
        for row in cinsiyet_rows:
            key = row['ogrenci__cinsiyet']
            if key == 'K':
                cinsiyet['K'] = row['sayi']
            elif key == 'E':
                cinsiyet['E'] = row['sayi']
            else:
                cinsiyet['diger'] += row['sayi']

        sinif_dagilimi = cls._sinif_seviyesi_dagilimi(
            aktif_kayit, kurum_id, sube_id,
        )
        sinif_seviyesi_detay = cls._sinif_seviyesi_cinsiyet_detay(
            aktif_kayit, kurum_id, sube_id,
        )
        dogum_gunleri = cls._yaklasan_dogum_gunleri(aktif_kayit, bugun)

        kayit_12_ay = cls._ogrenci_kayit_12_ay(kayit_qs, bugun)
        paket_dagilimi = cls._egitim_paketi_dagilimi(kurum_id, sube_id, egitim_yili_id)

        personel_svc = PersonelService()
        sube_kw = {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'egitim_yili_id': egitim_yili_id,
        }
        toplam_personel = personel_svc.get_count(**sube_kw, aktif_only=False)
        aktif_personel = personel_svc.get_count(**sube_kw, aktif_only=True)

        gorev_qs = PersonelGorevlendirme.objects.filter(
            kurum_id=kurum_id,
            gorev_sube_id=sube_id,
            aktif_mi=True,
        ).select_related('rol', 'brans')
        if egitim_yili_id:
            gorev_qs = gorev_qs.filter(egitim_yili_id=egitim_yili_id)

        ogretmen_sayisi = gorev_qs.filter(rol__code='ogretmen').values('personel_id').distinct().count()
        idari_sayisi = (
            gorev_qs.exclude(rol__code__in=['ogretmen', 'koc'])
            .values('personel_id')
            .distinct()
            .count()
        )

        personel_turleri = cls._personel_tur_dagilimi(gorev_qs)
        brans_dagilimi = cls._brans_dagilimi(gorev_qs)
        personel_12_ay = cls._personel_ise_giris_12_ay(kurum_id, sube_id, egitim_yili_id, bugun)

        verilen_ders = cls._toplam_ders_saati(kurum_id, sube_id, egitim_yili_id)

        sozlesme_svc = SozlesmeService()
        ozet = sozlesme_svc.get_ozet(kurum_id, sube_id, egitim_yili_id) if egitim_yili_id else {}
        aktif_sozlesme = Sozlesme.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            durum=SozlesmeDurum.AKTIF,
        ).count() if egitim_yili_id else 0

        toplam_kayit = _int_val(ozet.get('toplam_hacim'))
        toplam_tahsil = _int_val(ozet.get('toplam_tahsilat'))
        kalan_tahsil = _int_val(ozet.get('acik_alacak'))

        kasa_hesaplari, banka_hesaplari, kasa_toplam, banka_toplam = _mali_hesap_bloklari(
            kurum_id, sube_id, egitim_yili_id,
        )
        _, pos_toplam = _pos_hesap_bloklari(kurum_id, sube_id)
        # "Kasa + Banka" KPI'sı Mali Hesaplar'daki TÜM canlı bakiyeleri kapsamalı;
        # önceden POS hesapları (örn. kart tahsilatının biriktiği hesap) bu
        # toplama dahil edilmiyordu ve kartta gösterilen tutar mali hesaplardaki
        # gerçek toplamdan daha az görünüyordu.
        kasa_banka_toplam = kasa_toplam + banka_toplam + pos_toplam
        kasa_dagilimi = cls._kasa_dagilimi(kasa_hesaplari, banka_hesaplari, kurum_id, sube_id, egitim_yili_id)
        tahsilat_12_ay = cls._aylik_tahsilat_12_ay(kurum_id, sube_id, egitim_yili_id, bugun)

        return {
            'context': {
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'egitim_yili_id': egitim_yili_id,
                'referans_tarih': bugun.isoformat(),
            },
            'genel': {
                'aktif_ogrenci': aktif_ogrenci,
                'aktif_personel': aktif_personel,
                'aktif_sozlesme': aktif_sozlesme,
                'kasa_banka_toplam': kasa_banka_toplam,
                'kasa_toplam': kasa_toplam,
                'banka_toplam': banka_toplam,
                'pos_toplam': pos_toplam,
            },
            'ogrenci': {
                'kpis': {
                    'aktif': aktif_ogrenci,
                    'pasif': pasif_ogrenci,
                    'aktif_sozlesme': aktif_sozlesme,
                    'yeni_kayit_bu_ay': yeni_kayit_bu_ay,
                },
                'sinif_seviyesi': sinif_dagilimi,
                'sinif_seviyesi_detay': sinif_seviyesi_detay,
                'cinsiyet': [
                    {'label': 'Kız', 'value': cinsiyet['K']},
                    {'label': 'Erkek', 'value': cinsiyet['E']},
                ],
                'cinsiyet_ozet': {
                    'kiz': cinsiyet['K'],
                    'erkek': cinsiyet['E'],
                    'toplam': cinsiyet['K'] + cinsiyet['E'] + cinsiyet['diger'],
                },
                'kayit_12_ay': kayit_12_ay,
                'paket_dagilimi': paket_dagilimi,
                'dogum_gunleri': dogum_gunleri,
            },
            'personel': {
                'kpis': {
                    'toplam': toplam_personel,
                    'ogretmen': ogretmen_sayisi,
                    'idari': idari_sayisi,
                    'verilen_ders_saati': verilen_ders,
                },
                'tur_dagilimi': personel_turleri,
                'brans_dagilimi': brans_dagilimi,
                'ise_giris_12_ay': personel_12_ay,
            },
            'finans': {
                'kpis': {
                    'toplam_kayit': toplam_kayit,
                    'tahsil_edilen': toplam_tahsil,
                    'kalan': kalan_tahsil,
                    'kasa_banka': kasa_banka_toplam,
                },
                'tahsilat_durumu': [
                    {'label': 'Tahsil Edilen', 'value': toplam_tahsil},
                    {'label': 'Kalan Tahsilat', 'value': kalan_tahsil},
                ],
                'tahsilat_12_ay': tahsilat_12_ay,
                'kasa_dagilimi': kasa_dagilimi,
            },
        }

    @classmethod
    def _sinif_seviyesi_dagilimi(cls, kayit_qs, kurum_id: int, sube_id: int) -> list[dict]:
        rows = (
            kayit_qs.values('sinif_seviyesi_id', 'sinif_seviyesi__ad', 'sinif_seviyesi__sira')
            .annotate(sayi=Count('id'))
        )
        by_id = {r['sinif_seviyesi_id']: r for r in rows if r['sinif_seviyesi_id']}
        # sinif üzerinden seviye
        sinif_rows = (
            kayit_qs.filter(sinif_seviyesi_id__isnull=True, sinif__sinif_seviyesi_id__isnull=False)
            .values('sinif__sinif_seviyesi_id', 'sinif__sinif_seviyesi__ad', 'sinif__sinif_seviyesi__sira')
            .annotate(sayi=Count('id'))
        )
        merged: dict[int, dict] = {}
        for r in rows:
            sid = r['sinif_seviyesi_id']
            if not sid:
                continue
            merged[sid] = {
                'label': r['sinif_seviyesi__ad'] or 'Belirsiz',
                'value': r['sayi'],
                'sira': r['sinif_seviyesi__sira'] or 0,
            }
        for r in sinif_rows:
            sid = r['sinif__sinif_seviyesi_id']
            if not sid:
                continue
            if sid in merged:
                merged[sid]['value'] += r['sayi']
            else:
                merged[sid] = {
                    'label': r['sinif__sinif_seviyesi__ad'] or 'Belirsiz',
                    'value': r['sayi'],
                    'sira': r['sinif__sinif_seviyesi__sira'] or 0,
                }

        seviyeler = SinifSeviyesi.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, aktif_mi=True,
        ).order_by('sira', 'ad')
        result = []
        seen = set()
        for sv in seviyeler:
            seen.add(sv.id)
            entry = merged.get(sv.id, {'label': sv.ad, 'value': 0, 'sira': sv.sira})
            result.append({'label': entry['label'], 'value': entry['value']})
        for sid, entry in merged.items():
            if sid not in seen:
                result.append({'label': entry['label'], 'value': entry['value']})
        return result

    @staticmethod
    def _resolve_sinif_seviyesi_kayit(kayit) -> tuple[int | None, str, int]:
        if kayit.sinif_seviyesi_id and kayit.sinif_seviyesi:
            sv = kayit.sinif_seviyesi
            return sv.id, sv.ad or 'Belirsiz', sv.sira or 0
        sinif = kayit.sinif
        if sinif and sinif.sinif_seviyesi_id and sinif.sinif_seviyesi:
            sv = sinif.sinif_seviyesi
            return sv.id, sv.ad or 'Belirsiz', sv.sira or 0
        return None, 'Belirsiz', 999

    @classmethod
    def _sinif_seviyesi_cinsiyet_detay(cls, kayit_qs, kurum_id: int, sube_id: int) -> list[dict]:
        merged: dict[int, dict] = {}
        kayitlar = kayit_qs.select_related(
            'ogrenci',
            'sinif_seviyesi',
            'sinif__sinif_seviyesi',
        )
        for kayit in kayitlar.iterator():
            sid, label, sira = cls._resolve_sinif_seviyesi_kayit(kayit)
            key = sid if sid is not None else 0
            if key not in merged:
                merged[key] = {
                    'label': label,
                    'sira': sira,
                    'kiz': 0,
                    'erkek': 0,
                    'toplam': 0,
                }
            cins = kayit.ogrenci.cinsiyet
            if cins == 'K':
                merged[key]['kiz'] += 1
            elif cins == 'E':
                merged[key]['erkek'] += 1
            merged[key]['toplam'] += 1

        seviyeler = SinifSeviyesi.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, aktif_mi=True,
        ).order_by('sira', 'ad')
        result: list[dict] = []
        seen: set[int] = set()
        for sv in seviyeler:
            seen.add(sv.id)
            entry = merged.get(sv.id, {'label': sv.ad, 'sira': sv.sira or 0, 'kiz': 0, 'erkek': 0, 'toplam': 0})
            result.append({
                'label': entry['label'],
                'kiz': entry['kiz'],
                'erkek': entry['erkek'],
                'toplam': entry['toplam'],
                'value': entry['toplam'],
            })
        extras = [
            merged[k] for k in merged if k not in seen and k != 0
        ]
        extras.sort(key=lambda x: x['sira'])
        for entry in extras:
            result.append({
                'label': entry['label'],
                'kiz': entry['kiz'],
                'erkek': entry['erkek'],
                'toplam': entry['toplam'],
                'value': entry['toplam'],
            })
        if 0 in merged and merged[0]['toplam'] > 0:
            entry = merged[0]
            result.append({
                'label': entry['label'],
                'kiz': entry['kiz'],
                'erkek': entry['erkek'],
                'toplam': entry['toplam'],
                'value': entry['toplam'],
            })
        return result

    @classmethod
    def _yaklasan_dogum_gunleri(cls, aktif_kayit, bugun: date, *, limit: int = 24, pencere: int = 30) -> dict:
        kayitlar = aktif_kayit.filter(
            ogrenci__dogum_tarihi__isnull=False,
        ).select_related(
            'ogrenci',
            'sinif',
            'sinif_seviyesi',
            'sinif__sinif_seviyesi',
        )
        items: list[dict] = []
        for kayit in kayitlar.iterator():
            ogrenci = kayit.ogrenci
            dogum = ogrenci.dogum_tarihi
            if not dogum:
                continue
            sonraki = _next_birthday(dogum, bugun)
            kalan = (sonraki - bugun).days
            if kalan > pencere:
                continue
            _, sinif_label, _ = cls._resolve_sinif_seviyesi_kayit(kayit)
            if kayit.sinif and kayit.sinif.ad:
                sinif_goster = kayit.sinif.ad
            else:
                sinif_goster = sinif_label
            yas = sonraki.year - dogum.year
            items.append({
                'ogrenci_id': ogrenci.id,
                'ad_soyad': f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
                'sinif': sinif_goster,
                'dogum_gunu': _format_dogum_gunu(sonraki),
                'yas': yas,
                'kalan_gun': kalan,
                'etiket': _dogum_gunu_etiket(kalan),
            })
        items.sort(key=lambda x: (x['kalan_gun'], x['ad_soyad']))
        bugun_list = [i for i in items if i['kalan_gun'] == 0]
        yarin_list = [i for i in items if i['kalan_gun'] == 1]
        return {
            'bugun': bugun_list,
            'yarin': yarin_list,
            'yaklasan': items[:limit],
            'ozet': {
                'bugun': len(bugun_list),
                'yarin': len(yarin_list),
                'otuz_gun_icinde': len(items),
            },
        }

    @classmethod
    def _ogrenci_kayit_12_ay(cls, kayit_qs, bugun: date) -> list[dict]:
        start = bugun.replace(day=1) - relativedelta(months=11)
        rows = (
            kayit_qs.filter(kayit_tarihi__gte=start)
            .annotate(ay=TruncMonth('kayit_tarihi'))
            .values('ay')
            .annotate(sayi=Count('id'))
        )
        by_month = {r['ay'].strftime('%Y-%m'): r['sayi'] for r in rows if r['ay']}
        return [
            {'label': _month_label(ym), 'value': by_month.get(ym, 0)}
            for ym in _month_keys_last_12(bugun)
        ]

    @classmethod
    def _egitim_paketi_dagilimi(cls, kurum_id, sube_id, egitim_yili_id) -> list[dict]:
        if not egitim_yili_id:
            return []
        qs = Sozlesme.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            durum=SozlesmeDurum.AKTIF,
        )
        rows = (
            qs.values('paket_adi')
            .annotate(sayi=Count('id'))
            .order_by('-sayi')[:12]
        )
        return [
            {'label': (r['paket_adi'] or 'Belirtilmemiş')[:40], 'value': r['sayi']}
            for r in rows
        ]

    @classmethod
    def _personel_tur_dagilimi(cls, gorev_qs) -> list[dict]:
        counts: dict[str, int] = defaultdict(int)
        seen: set[tuple[int, str]] = set()
        for g in gorev_qs.iterator():
            key = (g.personel_id, _personel_tur_key(g.rol.code if g.rol else None))
            if key in seen:
                continue
            seen.add(key)
            counts[key[1]] += 1
        order = ['ogretmen', 'koc', 'rehber', 'muhasebe', 'sekreterya', 'yonetim', 'diger']
        return [
            {'label': PERSONEL_TUR_LABELS[k], 'value': counts.get(k, 0)}
            for k in order
            if counts.get(k, 0) > 0
        ] or [{'label': PERSONEL_TUR_LABELS['diger'], 'value': 0}]

    @classmethod
    def _brans_dagilimi(cls, gorev_qs) -> list[dict]:
        rows = (
            gorev_qs.filter(rol__code='ogretmen', brans_id__isnull=False)
            .values('brans__ad')
            .annotate(sayi=Count('personel_id', distinct=True))
            .order_by('-sayi')[:15]
        )
        return [{'label': r['brans__ad'] or '—', 'value': r['sayi']} for r in rows]

    @classmethod
    def _personel_ise_giris_12_ay(cls, kurum_id, sube_id, egitim_yili_id, bugun: date) -> list[dict]:
        start = bugun.replace(day=1) - relativedelta(months=11)
        qs = PersonelSozlesme.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            baslangic_tarihi__gte=start,
            baslangic_tarihi__lte=bugun,
        )
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        rows = (
            qs.annotate(ay=TruncMonth('baslangic_tarihi'))
            .values('ay')
            .annotate(sayi=Count('id'))
        )
        by_month = {r['ay'].strftime('%Y-%m'): r['sayi'] for r in rows if r['ay']}
        return [
            {'label': _month_label(ym), 'value': by_month.get(ym, 0)}
            for ym in _month_keys_last_12(bugun)
        ]

    @classmethod
    def _toplam_ders_saati(cls, kurum_id, sube_id, egitim_yili_id) -> float:
        soz_qs = PersonelSozlesme.objects.filter(kurum_id=kurum_id, sube_id=sube_id)
        if egitim_yili_id:
            soz_qs = soz_qs.filter(egitim_yili_id=egitim_yili_id)
        agg = AylikHakedis.objects.filter(sozlesme__in=soz_qs).aggregate(t=Sum('toplam_ders_saati'))
        return round(_float_val(agg['t']), 1)

    @classmethod
    def _aylik_tahsilat_12_ay(cls, kurum_id, sube_id, egitim_yili_id, bugun: date) -> list[dict]:
        if not egitim_yili_id:
            return [{'label': _month_label(ym), 'value': 0} for ym in _month_keys_last_12(bugun)]
        start = bugun.replace(day=1) - relativedelta(months=11)
        base = Sozlesme.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        ).exclude(durum__in=[SozlesmeDurum.TASLAK, SozlesmeDurum.IPTAL])
        rows = (
            Tahsilat.objects.filter(
                sozlesme__in=base,
                durum=TahsilatDurum.AKTIF,
                tahsilat_tarihi__gte=start,
                tahsilat_tarihi__lte=bugun,
            )
            .exclude(tahsilat_turu=TahsilatTuru.IADE)
            .annotate(ay=TruncMonth('tahsilat_tarihi'))
            .values('ay')
            .annotate(tutar=Sum('tutar'))
        )
        by_month = {r['ay'].strftime('%Y-%m'): _int_val(r['tutar']) for r in rows if r['ay']}
        return [
            {'label': _month_label(ym), 'value': by_month.get(ym, 0)}
            for ym in _month_keys_last_12(bugun)
        ]

    @classmethod
    def _kasa_dagilimi(
        cls,
        kasa_hesaplari: list,
        banka_hesaplari: list,
        kurum_id: int,
        sube_id: int,
        egitim_yili_id,
    ) -> list[dict]:
        """
        Kasa/banka/POS bakiye dağılımı — hepsi CANLI BakiyeHareketi bakiyesinden.

        Önceki sürüm burada DonemBakiye'ye geri dönüyordu; bu, üstteki KPI kartı
        (_mali_hesap_bloklari → canlı bakiye) ile bu grafiği farklı kaynaklardan
        besleyip aynı ekranda iki farklı toplam göstermeye sebep oluyordu. Nakit +
        Banka toplamı artık KPI'daki kasa_banka_toplam ile birebir eşleşir; POS/
        Diğer, Mali Hesaplar ağacındaki gibi ayrıca canlı okunur (bilgi amaçlı,
        KPI toplamına dahil değildir).
        """
        from apps.finans.application.dashboard_overview_service import _mali_hesap_canli_bakiyeler

        groups = {
            'Nakit': sum(int(h.get('donem_sonu_bakiye') or 0) for h in kasa_hesaplari),
            'Banka Hesapları': sum(int(h.get('donem_sonu_bakiye') or 0) for h in banka_hesaplari),
            'POS Hesapları': 0,
            'Diğer Hesaplar': 0,
        }

        diger_tipler = [MaliHesapTipi.POS, MaliHesapTipi.SANAL_POS, MaliHesapTipi.E_CUZDAN, MaliHesapTipi.DIGER]
        for h in _mali_hesap_canli_bakiyeler(kurum_id, sube_id, tipler=diger_tipler):
            tip = h.get('mali_hesap_tip') or ''
            bakiye = _int_val(h.get('donem_sonu_bakiye'))
            if tip in (MaliHesapTipi.POS, MaliHesapTipi.SANAL_POS):
                groups['POS Hesapları'] += bakiye
            else:
                groups['Diğer Hesaplar'] += bakiye

        return [{'label': k, 'value': v} for k, v in groups.items() if v]
