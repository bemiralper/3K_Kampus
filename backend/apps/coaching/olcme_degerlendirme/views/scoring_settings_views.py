"""Puan katsayısı ayar API."""
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..interfaces.sube_context import mandatory_olcme_context
from ..models.scoring_settings import MANAGED_PUAN_YILLARI, OlcmeKatsayiSeti
from ..services.scoring_settings import (
    ensure_kurum_defaults,
    reset_year_coefficients,
    serialize_year_sets,
)
from ..views import CsrfExemptSessionAuthentication


def _kurum_or_error(request):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return None, err
    return ctx['kurum_id'], None


@api_view(['GET', 'PATCH'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def puan_ayarlari(request):
    """
    GET  /puan-ayarlari/  → varsayılan yıl + yıl listesi
    PATCH { default_puan_yili }
    """
    kurum_id, err = _kurum_or_error(request)
    if err:
        return err

    ayar = ensure_kurum_defaults(kurum_id)

    if request.method == 'PATCH':
        year = request.data.get('default_puan_yili')
        try:
            year = int(year)
        except (TypeError, ValueError):
            return Response({'error': 'Geçerli bir puan yılı girin.'}, status=400)
        if year not in MANAGED_PUAN_YILLARI:
            return Response({'error': 'Puan yılı 2024, 2025 veya 2026 olmalıdır.'}, status=400)
        ayar.default_puan_yili = year
        ayar.save(update_fields=['default_puan_yili', 'updated_at'])

    years = [serialize_year_sets(kurum_id, y) for y in MANAGED_PUAN_YILLARI]
    return Response({
        'default_puan_yili': ayar.default_puan_yili,
        'managed_years': list(MANAGED_PUAN_YILLARI),
        'years': years,
    })


@api_view(['GET', 'PUT'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def puan_ayarlari_katsayilar(request, year):
    """GET/PUT /puan-ayarlari/katsayilar/<year>/"""
    kurum_id, err = _kurum_or_error(request)
    if err:
        return err
    year = int(year)
    if year not in MANAGED_PUAN_YILLARI:
        return Response({'error': 'Puan yılı 2024, 2025 veya 2026 olmalıdır.'}, status=400)

    ensure_kurum_defaults(kurum_id)

    if request.method == 'PUT':
        payload = request.data.get('sets') or request.data
        if not isinstance(payload, dict):
            return Response({'error': 'sets nesnesi bekleniyor.'}, status=400)
        valid_kinds = {c.value for c in OlcmeKatsayiSeti.Kind}
        for kind, body in payload.items():
            if kind not in valid_kinds:
                continue
            coef = body.get('coefficients') if isinstance(body, dict) else body
            if not isinstance(coef, dict):
                return Response({'error': f'{kind}: coefficients sözlük olmalı.'}, status=400)
            row = OlcmeKatsayiSeti.objects.get(kurum_id=kurum_id, year=year, kind=kind)
            row.coefficients = coef
            row.save(update_fields=['coefficients', 'updated_at'])

    return Response(serialize_year_sets(kurum_id, year))


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def puan_ayarlari_reset(request, year):
    """POST /puan-ayarlari/katsayilar/<year>/reset/"""
    kurum_id, err = _kurum_or_error(request)
    if err:
        return err
    year = int(year)
    if year not in MANAGED_PUAN_YILLARI:
        return Response({'error': 'Puan yılı 2024, 2025 veya 2026 olmalıdır.'}, status=400)
    reset_year_coefficients(kurum_id, year)
    return Response(serialize_year_sets(kurum_id, year))
