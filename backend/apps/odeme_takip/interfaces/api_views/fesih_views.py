"""
Fesih API Views
Sözleşme fesih hesaplama, uygulama ve detay endpointleri
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from apps.odeme_takip.permissions import ODEME_TAKIP_PERMISSIONS
from rest_framework.response import Response

from apps.odeme_takip.application.services.fesih_service import FesihService
from apps.odeme_takip.domain.enums import FesihNedeni


fesih_service = FesihService()


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def fesih_hesapla(request, pk):
    """
    Fesih önizleme hesaplaması.
    POST: {
        fesih_tarihi: "2025-06-15",
        kesintiler: [{"ad": "Kitap bedeli", "tutar": 500}, ...],
        ceza_orani: 10,
    }
    """
    data = request.data
    result, error = fesih_service.hesapla_onizleme(
        sozlesme_id=pk,
        fesih_tarihi=data.get('fesih_tarihi'),
        kesintiler=data.get('kesintiler', []),
        ceza_orani=data.get('ceza_orani', 0),
    )

    if error:
        return Response(error, status=status.HTTP_400_BAD_REQUEST)

    return Response(result)


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def fesih_onayla(request, pk):
    """
    Fesih işlemini uygular.
    POST: {
        fesih_tarihi: "2025-06-15",
        fesih_nedeni: "veli_talebi",
        fesih_aciklama: "Veli isteği ile...",
        kesintiler: [{"ad": "Kitap bedeli", "tutar": 500}, ...],
        ceza_orani: 10,
    }
    """
    data = request.data
    user = request.user if request.user.is_authenticated else None

    fesih, error = fesih_service.fesih_uygula(
        sozlesme_id=pk,
        fesih_tarihi=data.get('fesih_tarihi'),
        fesih_nedeni=data.get('fesih_nedeni', FesihNedeni.VELI_TALEBI),
        fesih_aciklama=data.get('fesih_aciklama', ''),
        kesintiler=data.get('kesintiler', []),
        ceza_orani=data.get('ceza_orani', 0),
        user=user,
    )

    if error:
        return Response(error, status=status.HTTP_400_BAD_REQUEST)

    return Response(_serialize_fesih(fesih), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def fesih_detay(request, pk):
    """
    Sözleşmeye ait fesih detayını getirir.
    """
    fesih = fesih_service.get_fesih_detay(sozlesme_id=pk)

    if not fesih:
        return Response(
            {'error': 'Bu sözleşmeye ait fesih kaydı bulunamadı'},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(_serialize_fesih(fesih))


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def fesih_nedenleri(request):
    """Fesih nedeni seçeneklerini döner"""
    return Response([
        {'value': code, 'label': label}
        for code, label in FesihNedeni.CHOICES
    ])


def _serialize_fesih(fesih):
    """SozlesmeFesih → dict"""
    return {
        'id': fesih.id,
        'sozlesme_id': fesih.sozlesme_id,
        'sozlesme_no': fesih.sozlesme.sozlesme_no if fesih.sozlesme else '',
        'ogrenci': {
            'ad': fesih.sozlesme.ogrenci.ad if fesih.sozlesme and fesih.sozlesme.ogrenci else '',
            'soyad': fesih.sozlesme.ogrenci.soyad if fesih.sozlesme and fesih.sozlesme.ogrenci else '',
        } if fesih.sozlesme else None,
        'fesih_tarihi': str(fesih.fesih_tarihi),
        'fesih_nedeni': fesih.fesih_nedeni,
        'fesih_nedeni_display': fesih.get_fesih_nedeni_display(),
        'fesih_aciklama': fesih.fesih_aciklama or '',
        'sozlesme_net_tutar': int(round(float(fesih.sozlesme_net_tutar or 0))),
        'toplam_odenen': int(round(float(fesih.toplam_odenen or 0))),
        'toplam_gun': fesih.toplam_gun,
        'kullanilan_gun': fesih.kullanilan_gun,
        'kullanilan_tutar': int(round(float(fesih.kullanilan_tutar or 0))),
        'kesintiler': fesih.kesintiler or [],
        'kesinti_tutari': int(round(float(fesih.kesinti_tutari or 0))),
        'ceza_orani': float(fesih.ceza_orani or 0),
        'ceza_tutari': int(round(float(fesih.ceza_tutari or 0))),
        'iade_tutari': int(round(float(fesih.iade_tutari or 0))),
        'iade_yapildi_mi': fesih.iade_yapildi_mi,
        'iade_tarihi': str(fesih.iade_tarihi) if fesih.iade_tarihi else None,
        'iptal_edilen_taksit_sayisi': fesih.iptal_edilen_taksit_sayisi,
        'fesih_eden': fesih.fesih_eden.get_full_name() if fesih.fesih_eden else None,
        'created_at': fesih.created_at.isoformat() if fesih.created_at else None,
    }
