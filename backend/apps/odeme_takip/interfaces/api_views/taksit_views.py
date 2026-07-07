"""
Taksit API Views
"""
from datetime import date, timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from apps.odeme_takip.permissions import ODEME_TAKIP_PERMISSIONS
from rest_framework.response import Response

from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.interfaces.sube_context import (
    assert_taksit_record_access,
    gate_sozlesme_pk,
    resolve_mandatory_odeme_context,
)


def _serialize_taksit(t):
    return {
        'id': t.id,
        'taksit_no': t.taksit_no,
        'vade_tarihi': str(t.vade_tarihi) if t.vade_tarihi else None,
        'tutar': t.tutar or 0,
        'odenen_tutar': t.odenen_tutar or 0,
        'kalan_tutar': t.kalan_tutar or 0,
        'durum': t.durum,
        'odeme_yontemi_id': t.odeme_yontemi_id,
    }


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def taksit_list(request, sozlesme_id):
    """Sözleşmeye ait taksitler"""
    _, err = gate_sozlesme_pk(request, sozlesme_id)
    if err:
        return err
    service = TaksitService()
    taksitler = service.get_by_sozlesme(sozlesme_id)
    return Response([_serialize_taksit(t) for t in taksitler])


@api_view(['PUT'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def taksit_update(request, pk):
    """Taksit güncelle (vade tarihi / tutar)"""
    err = assert_taksit_record_access(request, pk)
    if err:
        return err
    service = TaksitService()
    taksit, errors = service.update_taksit(pk, request.data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_taksit(taksit))


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def taksit_plani_olustur(request, sozlesme_id):
    """
    Taksit planı yeniden oluştur — 4 yöntem destekler.
    body: {
        yontem: 'esit' | 'manuel' | 'yuzde' | 'kalani_bol',
        taksit_sayisi: int,           # esit, kalani_bol
        ilk_odeme_tarihi: str,        # esit, yuzde, kalani_bol
        periyot: str,                 # esit, yuzde, kalani_bol
        pesinat: float,               # esit (opsiyonel)
        taksitler: [{tutar, vade_tarihi}], # manuel
        yuzdeler: [30, 20, 25, 25],   # yuzde
    }
    """
    sozlesme, err = gate_sozlesme_pk(request, sozlesme_id)
    if err:
        return err

    from apps.odeme_takip.domain.enums import SozlesmeDurum
    if sozlesme.durum not in [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF]:
        return Response({'error': 'Sadece taslak veya aktif sözleşmelerin taksit planı değiştirilebilir'},
                        status=status.HTTP_400_BAD_REQUEST)

    data = request.data
    yontem = data.get('yontem', 'esit')
    taksit_sayisi = int(data.get('taksit_sayisi', 1))
    ilk_odeme_tarihi = data.get('ilk_odeme_tarihi', str(sozlesme.ilk_odeme_tarihi or sozlesme.baslangic_tarihi))
    periyot = data.get('periyot', sozlesme.taksit_periyodu or 'aylik')
    pesinat = int(data.get('pesinat', 0))
    manuel_taksitler = data.get('taksitler', [])
    yuzde_listesi = data.get('yuzdeler', [])
    taksit_odeme_yontemleri = data.get('taksit_odeme_yontemleri', [])

    taksit_service = TaksitService()

    result, errors = taksit_service.smart_recreate(
        sozlesme=sozlesme,
        taksit_sayisi=taksit_sayisi,
        ilk_odeme_tarihi=ilk_odeme_tarihi,
        periyot=periyot,
        yontem=yontem,
        pesinat=pesinat,
        manuel_taksitler=manuel_taksitler if yontem == 'manuel' else None,
        yuzde_listesi=yuzde_listesi if yontem == 'yuzde' else None,
        taksit_odeme_yontemleri=taksit_odeme_yontemleri,
    )

    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    # Sözleşmeyi de güncelle
    update_fields = {}
    if yontem != 'manuel':
        update_fields['taksit_sayisi'] = taksit_sayisi
    else:
        update_fields['taksit_sayisi'] = len(manuel_taksitler) + len(
            [t for t in (result if isinstance(result, list) else [])
             if hasattr(t, 'durum') and t.durum == 'odendi']
        )
    if ilk_odeme_tarihi:
        update_fields['ilk_odeme_tarihi'] = ilk_odeme_tarihi
    if periyot:
        update_fields['taksit_periyodu'] = periyot

    from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import SozlesmeRepository
    repo = SozlesmeRepository()
    repo.update(sozlesme, update_fields)

    # Audit log
    from apps.odeme_takip.domain.enums import GecmisIslemTuru
    from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import SozlesmeGecmisiRepository
    gecmis_repo = SozlesmeGecmisiRepository()
    yontem_label = {'esit': 'Eşit Taksit', 'manuel': 'Manuel', 'yuzde': '% Dağılım', 'kalani_bol': 'Kalanı Böl'}
    gecmis_repo.create({
        'sozlesme': sozlesme,
        'islem_turu': GecmisIslemTuru.REVIZYON,
        'yeni_deger': {
            'yontem': yontem,
            'taksit_sayisi': taksit_sayisi,
            'pesinat': str(pesinat),
        },
        'aciklama': f'Taksit planı yeniden oluşturuldu ({yontem_label.get(yontem, yontem)})',
        'islem_yapan': request.user if request.user.is_authenticated else None,
    })

    # Güncel taksitleri döndür
    taksitler = taksit_service.get_by_sozlesme(sozlesme_id)
    return Response([_serialize_taksit(t) for t in taksitler])


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def vadesi_gecenler(request):
    """Vadesi geçmiş taksitler"""
    service = TaksitService()
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err
    taksitler = service.get_vadesi_gecenler(kurum_id, sube_id)
    result = []
    for t in taksitler:
        item = _serialize_taksit(t)
        item['sozlesme_no'] = t.sozlesme.sozlesme_no if t.sozlesme else ''
        item['ogrenci_adi'] = (
            f'{t.sozlesme.ogrenci.ad} {t.sozlesme.ogrenci.soyad}'
            if t.sozlesme and t.sozlesme.ogrenci else ''
        )
        result.append(item)
    return Response(result)


DONEM_GUN_ARALIGI = {
    'bugun': 0,
    'yarin': 1,
    'hafta': 6,
    'ay': 30,
}


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def vadesi_gelecekler(request):
    """
    Vadesi gelecek (yaklaşan) taksitler.
    query: kurum_id, sube_id, egitim_yili_id, donem=bugun|yarin|hafta|ay, arama
    - bugun: sadece bugün vadesi gelenler
    - yarin: sadece yarın vadesi gelenler
    - hafta: bugünden itibaren 7 gün
    - ay: bugünden itibaren 30 gün
    """
    service = TaksitService()
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err
    donem = request.GET.get('donem', 'hafta')
    arama = request.GET.get('arama', '')

    today = timezone.localdate()
    if donem == 'yarin':
        baslangic = bitis = today + timedelta(days=1)
    elif donem == 'bugun':
        baslangic = bitis = today
    else:
        gun = DONEM_GUN_ARALIGI.get(donem, 6)
        baslangic = today
        bitis = today + timedelta(days=gun)

    taksitler = service.get_vadesi_gelecekler(
        kurum_id=kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id,
        baslangic=baslangic, bitis=bitis, arama=arama,
    )
    result = []
    for t in taksitler:
        item = _serialize_taksit(t)
        item['sozlesme_no'] = t.sozlesme.sozlesme_no if t.sozlesme else ''
        item['ogrenci_adi'] = (
            f'{t.sozlesme.ogrenci.ad} {t.sozlesme.ogrenci.soyad}'
            if t.sozlesme and t.sozlesme.ogrenci else ''
        )
        item['veli_adi'] = (
            f'{t.sozlesme.veli.ad} {t.sozlesme.veli.soyad}'
            if t.sozlesme and getattr(t.sozlesme, 'veli', None) else ''
        )
        item['sozlesme_id'] = t.sozlesme_id
        item['kalan_gun'] = (t.vade_tarihi - today).days if t.vade_tarihi else None
        result.append(item)
    return Response({
        'donem': donem,
        'baslangic': str(baslangic),
        'bitis': str(bitis),
        'sonuclar': result,
        'toplam_tutar': sum(r['kalan_tutar'] for r in result),
        'adet': len(result),
    })
