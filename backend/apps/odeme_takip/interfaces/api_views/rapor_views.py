"""
Rapor API Views — Dashboard istatistikleri & Öğrenci Risk Skoru
"""
from datetime import date, timedelta

from django.db.models import Sum, Avg, Count, F, Q, ExpressionWrapper, DurationField, Exists, OuterRef
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from apps.odeme_takip.permissions import ODEME_TAKIP_PERMISSIONS
from rest_framework.response import Response

from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.application.services.risk_skoru_utils import (
    hesapla_risk_skoru,
    hesapla_vade_uyum_orani,
    risk_seviyesi,
)
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat, Taksit
from apps.odeme_takip.domain.enums import (
    SozlesmeDurum, TahsilatDurum, TahsilatTuru, TaksitDurum,
)
from apps.ogrenci.domain.models import OgrenciKayit

from shared.context import get_secili_egitim_yili_id
from apps.odeme_takip.interfaces.sube_context import resolve_mandatory_odeme_context


def _sozlesmesiz_kayit_qs(kurum_id, sube_id, egitim_yili_id):
    """Aktif kaydı olup iptal dışı sözleşmesi olmayan öğrenciler."""
    with_contract = Sozlesme.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
    ).exclude(durum=SozlesmeDurum.IPTAL).values_list('ogrenci_id', flat=True)
    return OgrenciKayit.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        aktif_mi=True,
    ).exclude(ogrenci_id__in=with_contract).select_related(
        'ogrenci', 'sinif', 'sinif_seviyesi',
    )


def _odemesiz_aktif_sozlesme_qs(kurum_id, sube_id, egitim_yili_id):
    """Aktif (tamamlanmış) sözleşmelerden henüz tahsilatı olmayanlar."""
    has_payment = Tahsilat.objects.filter(
        sozlesme_id=OuterRef('pk'),
        durum=TahsilatDurum.AKTIF,
    ).exclude(tahsilat_turu=TahsilatTuru.IADE)
    return Sozlesme.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        durum=SozlesmeDurum.AKTIF,
    ).annotate(has_odeme=Exists(has_payment)).filter(has_odeme=False)


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def dashboard_ozet(request):
    """
    Dashboard özet istatistikleri (genişletilmiş):
    - Brüt toplam, indirim, net tutar, tahsilat, kalan, gecikmiş
    - Bu ay tahsilat
    - Ortalama tahsil süresi (gün)
    - Sözleşmesiz öğrenci / taslak / ödemesiz aktif sözleşme sayıları
    """
    sozlesme_service = SozlesmeService()
    taksit_service = TaksitService()

    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err

    ozet_raw = sozlesme_service.get_ozet(kurum_id, sube_id, egitim_yili_id)

    # Vadesi geçenler
    vadesi_gecenler = taksit_service.get_vadesi_gecenler(kurum_id, sube_id)
    geciken_tutar = sum(float(t.kalan_tutar or 0) for t in vadesi_gecenler)
    geciken_sayi = len(vadesi_gecenler)

    # Brüt toplam
    base_qs = Sozlesme.objects.filter(
        kurum_id=kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id
    ).exclude(durum__in=[SozlesmeDurum.TASLAK, SozlesmeDurum.IPTAL])

    brut_toplam = base_qs.aggregate(t=Sum('brut_tutar'))['t'] or 0
    toplam_indirim = base_qs.aggregate(t=Sum('toplam_indirim_tutari'))['t'] or 0

    # Bu ay tahsilat
    bugun = date.today()
    ay_basi = bugun.replace(day=1)
    bu_ay_tahsilat = Tahsilat.objects.filter(
        sozlesme__in=base_qs,
        durum=TahsilatDurum.AKTIF,
        tahsilat_tarihi__gte=ay_basi,
        tahsilat_tarihi__lte=bugun,
    ).exclude(
        tahsilat_turu=TahsilatTuru.IADE
    ).aggregate(t=Sum('tutar'))['t'] or 0

    # Ortalama tahsil süresi: ödenen taksitlerde (vade → tahsilat tarihi arası gün)
    odenen_taksitler = Taksit.objects.filter(
        sozlesme__in=base_qs,
        durum=TaksitDurum.ODENDI,
        vade_tarihi__isnull=False,
    ).prefetch_related('tahsilatlar')

    toplam_gun = 0
    tahsil_sayisi = 0
    for taksit in odenen_taksitler:
        # İlk aktif tahsilat tarihini al
        ilk_tahsilat = taksit.tahsilatlar.filter(durum=TahsilatDurum.AKTIF).order_by('tahsilat_tarihi').first()
        if ilk_tahsilat and ilk_tahsilat.tahsilat_tarihi and taksit.vade_tarihi:
            fark = (ilk_tahsilat.tahsilat_tarihi - taksit.vade_tarihi).days
            toplam_gun += fark
            tahsil_sayisi += 1

    ort_tahsil_suresi = round(toplam_gun / tahsil_sayisi, 1) if tahsil_sayisi > 0 else 0

    taslak_sozlesme_sayisi = Sozlesme.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        durum=SozlesmeDurum.TASLAK,
    ).count()
    sozlesmesiz_ogrenci_sayisi = _sozlesmesiz_kayit_qs(kurum_id, sube_id, egitim_yili_id).count()
    odemesiz_sozlesme_sayisi = _odemesiz_aktif_sozlesme_qs(
        kurum_id, sube_id, egitim_yili_id
    ).count()

    ozet = {
        'toplam_sozlesme': ozet_raw.get('sozlesme_sayisi', 0),
        'brut_toplam': brut_toplam,
        'toplam_indirim': toplam_indirim,
        'toplam_hacim': ozet_raw.get('toplam_hacim', 0),       # net tutar
        'toplam_tahsilat': ozet_raw.get('toplam_tahsilat', 0),
        'acik_alacak': ozet_raw.get('acik_alacak', 0),
        'geciken_tutar': geciken_tutar,
        'geciken_taksit_sayisi': geciken_sayi,
        'bu_ay_tahsilat': bu_ay_tahsilat,
        'ort_tahsil_suresi': ort_tahsil_suresi,
        'sozlesmesiz_ogrenci_sayisi': sozlesmesiz_ogrenci_sayisi,
        'taslak_sozlesme_sayisi': taslak_sozlesme_sayisi,
        'odemesiz_sozlesme_sayisi': odemesiz_sozlesme_sayisi,
    }

    return Response(ozet)


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesmesiz_ogrenciler(request):
    """
    GET /api/odeme-takip/api/sozlesmesiz-ogrenciler/
    Kayıtlı olup iptal dışı sözleşmesi olmayan öğrenciler.
    """
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err

    q = (request.query_params.get('q') or '').strip()
    qs = _sozlesmesiz_kayit_qs(kurum_id, sube_id, egitim_yili_id).order_by(
        'ogrenci__soyad', 'ogrenci__ad',
    )
    if q:
        qs = qs.filter(
            Q(ogrenci__ad__icontains=q)
            | Q(ogrenci__soyad__icontains=q)
            | Q(okul_no__icontains=q)
            | Q(ogrenci__tc_kimlik_no__icontains=q)
        )

    results = []
    for kayit in qs[:200]:
        o = kayit.ogrenci
        results.append({
            'id': o.id,
            'ad': o.ad,
            'soyad': o.soyad,
            'tam_ad': o.tam_ad,
            'ogrenci_no': kayit.okul_no or '',
            'tc_kimlik_no': o.tc_kimlik_no or '',
            'sinif': kayit.sinif.ad if kayit.sinif_id else (
                kayit.sinif_seviyesi.ad if kayit.sinif_seviyesi_id else ''
            ),
            'kayit_id': kayit.id,
        })

    return Response({'count': len(results), 'results': results})


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def ogrenci_risk_skorlari(request):
    """
    Öğrenci bazlı mali risk skoru:
    - Gecikme sayısı
    - Ortalama gecikme günü
    - Kısmi ödeme oranı
    - Risk skoru (0-100, yüksek=iyi ödeme davranışı / düşük risk)
    """
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err

    base_qs = Sozlesme.objects.filter(
        kurum_id=kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id,
    ).exclude(durum__in=[SozlesmeDurum.TASLAK, SozlesmeDurum.IPTAL])

    # Öğrenci bazlı taksit analizi
    bugun = date.today()
    sonuclar = []

    ogrenci_ids = base_qs.values_list('ogrenci_id', flat=True).distinct()

    for ogrenci_id in ogrenci_ids:
        if not ogrenci_id:
            continue

        ogrenci_sozlesmeleri = base_qs.filter(ogrenci_id=ogrenci_id)
        taksitler = Taksit.objects.filter(sozlesme__in=ogrenci_sozlesmeleri)

        toplam_taksit = taksitler.count()
        if toplam_taksit == 0:
            continue

        # Gecikmiş (vadesi geçip hala ödenmemiş)
        geciken = taksitler.filter(
            vade_tarihi__lt=bugun,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.KISMI_ODENDI, TaksitDurum.GECIKTI],
        )
        gecikme_sayisi = geciken.count()

        # Ortalama gecikme günü
        toplam_gecikme_gun = 0
        for t in geciken:
            if t.vade_tarihi:
                toplam_gecikme_gun += (bugun - t.vade_tarihi).days
        ort_gecikme = round(toplam_gecikme_gun / gecikme_sayisi, 1) if gecikme_sayisi > 0 else 0

        # Kısmi ödeme oranı (kısmen ödenen taksit / toplam)
        kismi = taksitler.filter(durum=TaksitDurum.KISMI_ODENDI).count()
        kismi_oran = round(kismi / toplam_taksit * 100, 1) if toplam_taksit > 0 else 0

        # Ödeme yüzdesi (bilgi amaçlı — tüm plan)
        toplam_tutar = float(taksitler.aggregate(t=Sum('tutar'))['t'] or 0)
        toplam_odenen = float(taksitler.aggregate(t=Sum('odenen_tutar'))['t'] or 0)
        odeme_orani = round(toplam_odenen / toplam_tutar * 100, 1) if toplam_tutar > 0 else 0

        # Vadesi gelmiş taksitlere uyum (risk hesabında kullanılır)
        vadesi_gelen = taksitler.filter(
            vade_tarihi__lte=bugun,
            vade_tarihi__isnull=False,
        ).exclude(durum=TaksitDurum.IPTAL)
        vadesi_gelen_tutar = float(vadesi_gelen.aggregate(t=Sum('tutar'))['t'] or 0)
        vadesi_gelen_odenen = float(vadesi_gelen.aggregate(t=Sum('odenen_tutar'))['t'] or 0)
        vadesi_gelen_sayisi = vadesi_gelen.count()
        vade_uyum_orani = hesapla_vade_uyum_orani(vadesi_gelen_tutar, vadesi_gelen_odenen)

        risk_skoru = hesapla_risk_skoru(gecikme_sayisi, ort_gecikme, kismi_oran, vade_uyum_orani)
        risk_seviye = risk_seviyesi(risk_skoru)

        # Öğrenci bilgisi
        sozlesme = ogrenci_sozlesmeleri.select_related('ogrenci').first()
        ogrenci = sozlesme.ogrenci if sozlesme else None

        sonuclar.append({
            'ogrenci_id': ogrenci_id,
            'ogrenci_adi': f"{ogrenci.ad} {ogrenci.soyad}" if ogrenci else str(ogrenci_id),
            'ogrenci_no': getattr(ogrenci, 'ogrenci_no', ''),
            'toplam_taksit': toplam_taksit,
            'gecikme_sayisi': gecikme_sayisi,
            'ort_gecikme_gun': ort_gecikme,
            'kismi_oran': kismi_oran,
            'odeme_orani': odeme_orani,
            'vade_uyum_orani': vade_uyum_orani,
            'vadesi_gelen_sayisi': vadesi_gelen_sayisi,
            'toplam_tutar': toplam_tutar,
            'toplam_odenen': toplam_odenen,
            'kalan_borc': toplam_tutar - toplam_odenen,
            'risk_skoru': risk_skoru,
            'risk_seviye': risk_seviye,
        })

    # En riskli öğrencileri başa getir
    sonuclar.sort(key=lambda x: x['risk_skoru'])

    return Response(sonuclar)
