"""
Tahsilat API Views
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from apps.odeme_takip.permissions import (
    ODEME_TAKIP_PERMISSIONS,
    OdemePrintOrAuthenticatedPermission,
    validate_print_token_for_request,
)
from rest_framework.response import Response

from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.interfaces.api_views.sozlesme_views import _serialize_tahsilat
from apps.odeme_takip.interfaces.sube_context import (
    assert_sozlesme_record_access,
    assert_tahsilat_record_access,
    resolve_mandatory_odeme_context,
)


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_list(request):
    """Tüm tahsilatlar — filtreleme: ogrenci_adi, sozlesme_no, tarih aralığı, durum, tür"""
    service = TahsilatService()
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err

    filters = {}
    for key in ['ogrenci_adi', 'sozlesme_no', 'tarih_baslangic', 'tarih_bitis',
                'durum', 'tahsilat_turu', 'odeme_yontemi_id']:
        val = request.GET.get(key)
        if val:
            filters[key] = val

    tahsilatlar = service.get_all(kurum_id, sube_id, egitim_yili_id, filters if filters else None)
    return Response([_serialize_tahsilat(th) for th in tahsilatlar])


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_create(request):
    """Tahsilat kaydet — fazla ödeme otomatik sonraki taksitlere dağıtılır"""
    sozlesme_id = request.data.get('sozlesme_id')
    if sozlesme_id:
        sozlesme = SozlesmeService().get_by_id(sozlesme_id)
        err = assert_sozlesme_record_access(request, sozlesme)
        if err:
            return err

    service = TahsilatService()
    tahsilat, errors = service.create(
        request.data,
        user=request.user if request.user.is_authenticated else None,
    )
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    data = _serialize_tahsilat(tahsilat)
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_cancel(request, pk):
    """Tahsilat iptal et"""
    from apps.odeme_takip.domain.models import Tahsilat

    try:
        th = Tahsilat.objects.select_related('sozlesme').get(pk=pk)
    except Tahsilat.DoesNotExist:
        return Response({'error': 'Tahsilat bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    err = assert_tahsilat_record_access(request, th)
    if err:
        return err

    service = TahsilatService()
    neden = request.data.get('neden', '')
    try:
        tahsilat, errors = service.cancel(
            pk, neden,
            user=request.user if request.user.is_authenticated else None,
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response(
            {'error': 'Tahsilat iptal edilirken beklenmeyen bir hata oluştu.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_tahsilat(tahsilat))


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_iade(request):
    """
    İade — kurumdan öğrenciye/veliye nakit iade (kasadan/bankadan çıkış).
    body: { sozlesme_id, tutar, tahsilat_tarihi, aciklama,
            kaynak_tahsilat_id?, odeme_yontemi_id?, mali_hesap_id? }
    """
    sozlesme_id = request.data.get('sozlesme_id')
    if sozlesme_id:
        sozlesme = SozlesmeService().get_by_id(sozlesme_id)
        err = assert_sozlesme_record_access(request, sozlesme)
        if err:
            return err

    service = TahsilatService()
    iade, errors = service.iade_yap(
        request.data,
        user=request.user if request.user.is_authenticated else None,
    )
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_tahsilat(iade), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([OdemePrintOrAuthenticatedPermission])
def tahsilat_makbuz(request, pk):
    """Tahsilat makbuzu — yazdırma / PDF için detaylı veri"""
    from apps.odeme_takip.domain.models import Tahsilat

    print_ok = validate_print_token_for_request(request, pk, ('makbuz',))
    try:
        th = Tahsilat.objects.select_related(
            'sozlesme', 'sozlesme__ogrenci', 'sozlesme__kurum',
            'sozlesme__sube', 'sozlesme__veli', 'sozlesme__egitim_yili',
            'taksit', 'odeme_yontemi', 'islem_yapan',
        ).get(id=pk)
    except Tahsilat.DoesNotExist:
        return Response({'error': 'Tahsilat bulunamadı'}, status=status.HTTP_404_NOT_FOUND)

    if print_ok:
        payload = request._odeme_print_payload
        if not th.sozlesme or th.sozlesme.kurum_id != payload['kurum_id']:
            return Response({'error': 'Tahsilat bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
    else:
        err = assert_tahsilat_record_access(request, th)
        if err:
            return err

    sz = th.sozlesme
    kurum = sz.kurum if sz else None
    sube = sz.sube if sz else None
    ogrenci = sz.ogrenci if sz else None
    veli = sz.veli if sz else None

    # Sözleşmeye ait tüm taksitler
    taksit_listesi = []
    if sz:
        for t in sz.taksitler.all().order_by('taksit_no'):
            taksit_listesi.append({
                'taksit_no': t.taksit_no,
                'vade_tarihi': str(t.vade_tarihi) if t.vade_tarihi else None,
                'tutar': int(round(float(t.tutar or 0))),
                'odenen_tutar': int(round(float(t.odenen_tutar or 0))),
                'kalan_tutar': int(round(float(t.kalan_tutar or 0))),
                'durum': t.durum,
            })

    # Sözleşmeye ait tüm aktif tahsilatlar
    tahsilat_gecmisi = []
    if sz:
        from apps.odeme_takip.domain.models import Tahsilat as TahsilatModel
        for t in TahsilatModel.objects.filter(
            sozlesme=sz, durum='aktif'
        ).select_related('taksit', 'odeme_yontemi').order_by('tahsilat_tarihi'):
            tahsilat_gecmisi.append({
                'id': t.id,
                'tahsilat_tarihi': str(t.tahsilat_tarihi) if t.tahsilat_tarihi else None,
                'tutar': int(round(float(t.tutar or 0))),
                'taksit_no': t.taksit.taksit_no if t.taksit else None,
                'odeme_yontemi': t.odeme_yontemi.ad if t.odeme_yontemi else '',
                'tahsilat_turu': t.tahsilat_turu,
                'referans_no': t.referans_no or '',
            })

    # Bu tahsilatın dağıtım detayı
    from apps.odeme_takip.domain.models import TahsilatDagitim
    dagitim_detay = []
    for dag in TahsilatDagitim.objects.filter(
        tahsilat=th
    ).select_related('taksit').order_by('taksit__taksit_no'):
        dagitim_detay.append({
            'taksit_no': dag.taksit.taksit_no,
            'tutar': int(round(float(dag.tutar or 0))),
            'vade_tarihi': str(dag.taksit.vade_tarihi) if dag.taksit.vade_tarihi else None,
        })

    data = {
        # Makbuz bilgileri
        'makbuz_no': f'MKB-{th.id:06d}',
        'tahsilat_id': th.id,
        'tahsilat_tarihi': str(th.tahsilat_tarihi) if th.tahsilat_tarihi else None,
        'kayit_tarihi': str(th.created_at) if th.created_at else None,
        'tutar': int(round(float(th.tutar or 0))),
        'tahsilat_turu': th.tahsilat_turu,
        'referans_no': th.referans_no or '',
        'aciklama': th.aciklama or '',
        'durum': th.durum,
        'odeme_yontemi': th.odeme_yontemi.ad if th.odeme_yontemi else '',

        # Kurum bilgileri
        'kurum': {
            'ad': kurum.ad if kurum else '',
            'adres': kurum.adres if kurum else '',
            'telefon': kurum.telefon_sabit if kurum else '',
            'vergi_no': kurum.vergi_no if kurum else '',
            'vergi_dairesi': kurum.vergi_dairesi if kurum else '',
        } if kurum else None,
        'sube': {
            'ad': sube.ad if sube else '',
        } if sube else None,

        # Öğrenci bilgileri
        'ogrenci': {
            'ad': ogrenci.ad if ogrenci else '',
            'soyad': ogrenci.soyad if ogrenci else '',
            'ogrenci_no': getattr(ogrenci, 'ogrenci_no', '') if ogrenci else '',
        } if ogrenci else None,

        # Veli bilgileri
        'veli': {
            'ad': veli.ad if veli else '',
            'soyad': veli.soyad if veli else '',
            'tc_kimlik_no': veli.tc_kimlik_no if veli else '',
        } if veli else None,

        # Sözleşme bilgileri
        'sozlesme': {
            'sozlesme_no': sz.sozlesme_no if sz else '',
            'paket_adi': sz.paket_adi if sz else '',
            'net_tutar': int(round(float(sz.net_tutar or 0))) if sz else 0,
            'toplam_odenen': int(round(float(sz.toplam_odenen))) if sz else 0,
            'kalan_borc': int(round(float(sz.kalan_borc))) if sz else 0,
        } if sz else None,

        # Taksit bilgisi (bu tahsilatın taksiti)
        'taksit': {
            'taksit_no': th.taksit.taksit_no if th.taksit else None,
            'vade_tarihi': str(th.taksit.vade_tarihi) if th.taksit and th.taksit.vade_tarihi else None,
            'tutar': int(round(float(th.taksit.tutar or 0))) if th.taksit else None,
        } if th.taksit else None,

        # Tüm taksit planı
        'taksitler': taksit_listesi,

        # Tüm tahsilat geçmişi
        'tahsilat_gecmisi': tahsilat_gecmisi,

        # Bu tahsilatın dağıtım detayı
        'dagitim_detay': dagitim_detay,

        # İşlemi yapan
        'islem_yapan': th.islem_yapan.get_full_name() if th.islem_yapan else 'Sistem',
    }

    return Response(data)


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_mahsup(request):
    """Emanet → Taksit mahsubu"""
    service = TahsilatService()
    sozlesme_id = request.data.get('sozlesme_id')
    emanet_id = request.data.get('emanet_id')
    taksit_id = request.data.get('taksit_id')

    if not all([sozlesme_id, emanet_id, taksit_id]):
        return Response(
            {'error': 'sozlesme_id, emanet_id ve taksit_id zorunlu'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sozlesme = SozlesmeService().get_by_id(sozlesme_id)
    err = assert_sozlesme_record_access(request, sozlesme)
    if err:
        return err

    mahsup, errors = service.apply_advance(
        sozlesme_id, emanet_id, taksit_id,
        user=request.user if request.user.is_authenticated else None,
    )
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_tahsilat(mahsup), status=status.HTTP_201_CREATED)
