"""Optik Okuma sayfası.

Mevcut optik form editörüne ve kayıtlı daire koordinatlarına yazmaz.
Tarama burada okunur, daireye tıklanarak düzeltilir, bilinen baskıyla doğrulanır.
Sonuç sınava bu ekrandan yazılmaz.
"""
from __future__ import annotations

from django.core.files.base import ContentFile
from django.http import HttpResponse
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.permissions import OlcmeModulePermission

from ..interfaces.sube_context import mandatory_olcme_context
from ..models import OptikDaireSablon, OptikOkumaKaynak, OptikOkumaOturumu, OptikOkumaSayfa
from ..services.daire_dizisi_raster import pdf_sayfa_mm, raster_gorsel, raster_kaynak, raster_pdf
from ..services.optik_okuma import dogrula, etkin_alanlar, sayfa_oku
from ..views import CsrfExemptSessionAuthentication

MAX_FILE_BYTES = 250 * 1024 * 1024
MAX_PAGES = 40


def _sablon(request, sablon_id):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return None, err
    sablon = OptikDaireSablon.objects.filter(pk=sablon_id, kurum_id=ctx['kurum_id'], aktif=True).first()
    if sablon is None:
        return None, Response({'error': 'Daire şablonu bulunamadı.'}, status=404)
    return sablon, None


def _oturum(request, oturum_id):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return None, err
    oturum = (
        OptikOkumaOturumu.objects
        .select_related('sablon')
        .filter(pk=oturum_id, sablon__kurum_id=ctx['kurum_id'])
        .first()
    )
    if oturum is None:
        return None, Response({'error': 'Okuma oturumu bulunamadı.'}, status=404)
    return oturum, None


def _sayfa_dict(page: OptikOkumaSayfa, detail=False) -> dict:
    secimler = (page.review or {}).get('secimler') or {}
    data = {
        'id': page.id,
        'sequence': page.sequence,
        'status': page.status,
        'confidence': page.confidence,
        'warnings': page.warnings,
        'critical_warnings': page.critical_warnings,
        'error_message': page.error_message,
        'registration': {
            key: page.registration.get(key)
            for key in ('method', 'confidence', 'a', 'b', 'dx', 'satir_kaydirma', 'skor', 'ikinci_skor', 'dropout')
        } if page.registration else {},
        'image_url': f'/api/coaching/olcme-degerlendirme/optik-okuma/sayfalar/{page.id}/gorsel/' if page.image else '',
    }
    if detail:
        decoded = page.decoded or {}
        data['decoded'] = decoded
        data['etkin'] = etkin_alanlar(decoded, secimler)
        data['overlay'] = page.overlay or []
        data['review'] = page.review or {}
        data['page_width_mm'] = float(page.oturum.sablon.sayfa_genislik_mm)
        data['page_height_mm'] = float(page.oturum.sablon.sayfa_yukseklik_mm)
    return data


def _oturum_dict(oturum: OptikOkumaOturumu, pages=False) -> dict:
    data = {
        'id': oturum.id,
        'sablon_id': oturum.sablon_id,
        'sablon_ad': oturum.sablon.ad,
        'status': oturum.status,
        'original_filename': oturum.original_filename,
        'total_pages': oturum.total_pages,
        'processed_pages': oturum.processed_pages,
        'created_at': oturum.created_at.isoformat(),
    }
    if pages:
        data['sayfalar'] = [_sayfa_dict(page) for page in oturum.sayfalar.all()]
    return data


def _blank_png(sablon: OptikDaireSablon) -> bytes | None:
    if not sablon.kaynak:
        return None
    sablon.kaynak.open('rb')
    try:
        raw = sablon.kaynak.read()
    finally:
        sablon.kaynak.close()
    info = raster_kaynak(raw, sablon.kaynak_tur, sablon.sayfa_no)
    return info.get('png')


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
@parser_classes([MultiPartParser, FormParser])
def optik_okuma_oturumlar(request):
    if request.method == 'GET':
        ctx, err = mandatory_olcme_context(request)
        if err:
            return err
        rows = (
            OptikOkumaOturumu.objects
            .filter(sablon__kurum_id=ctx['kurum_id'])
            .select_related('sablon')
            .order_by('-created_at')[:20]
        )
        return Response([_oturum_dict(row) for row in rows])

    sablon, err = _sablon(request, request.data.get('sablon_id'))
    if err:
        return err
    upload = request.FILES.get('dosya')
    if upload is None:
        return Response({'error': 'PDF, PNG veya JPG seçin.'}, status=400)
    if upload.size > MAX_FILE_BYTES:
        return Response({'error': 'Dosya 250 MB sınırını aşıyor.'}, status=400)
    raw = upload.read()
    name = (upload.name or '').lower()
    if raw.startswith(b'%PDF') or name.endswith('.pdf'):
        kind = 'pdf'
        count = pdf_sayfa_mm(raw, 1)[2]
    elif raw.startswith(b'\x89PNG') or name.endswith('.png'):
        kind, count = 'png', 1
    elif raw.startswith(b'\xff\xd8') or name.endswith(('.jpg', '.jpeg')):
        kind, count = 'jpg', 1
    else:
        return Response({'error': 'Yalnız PDF, PNG veya JPG yüklenebilir.'}, status=400)
    if count > MAX_PAGES:
        return Response({'error': f'Bu ekranda en fazla {MAX_PAGES} sayfa okunur.'}, status=400)
    oturum = OptikOkumaOturumu.objects.create(
        sablon=sablon,
        original_filename=upload.name or '',
        total_pages=count,
        uploaded_by=request.user if request.user.is_authenticated else None,
    )
    kaynak = OptikOkumaKaynak.objects.create(
        oturum=oturum,
        original_filename=upload.name or '',
        kind=kind,
        page_count=count,
    )
    kaynak.file.save(upload.name or f'kaynak.{kind}', ContentFile(raw), save=True)
    OptikOkumaSayfa.objects.bulk_create([
        OptikOkumaSayfa(oturum=oturum, kaynak=kaynak, sequence=index, source_page=index)
        for index in range(1, count + 1)
    ])
    return Response(_oturum_dict(oturum, pages=True), status=201)


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_okuma_detay(request, oturum_pk):
    oturum, err = _oturum(request, oturum_pk)
    if err:
        return err
    return Response(_oturum_dict(oturum, pages=True))


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_okuma_isle(request, oturum_pk):
    oturum, err = _oturum(request, oturum_pk)
    if err:
        return err
    try:
        batch = max(1, min(3, int(request.data.get('batch_size') or 1)))
    except (TypeError, ValueError):
        batch = 1
    pages = list(oturum.sayfalar.filter(status=OptikOkumaSayfa.Status.PENDING).order_by('sequence')[:batch])
    oturum.status = OptikOkumaOturumu.Status.PROCESSING
    oturum.save(update_fields=['status', 'updated_at'])
    blank = _blank_png(oturum.sablon) if pages else None
    belge = oturum.sablon.belge or {}
    width = float(oturum.sablon.sayfa_genislik_mm)
    height = float(oturum.sablon.sayfa_yukseklik_mm)
    for page in pages:
        try:
            kaynak = page.kaynak
            kaynak.file.open('rb')
            try:
                raw = kaynak.file.read()
            finally:
                kaynak.file.close()
            info = raster_pdf(raw, page.source_page) if kaynak.kind == 'pdf' else raster_gorsel(raw)
            result = sayfa_oku(info['png'], belge, width, height, blank)
            page.image.save(f'sayfa-{page.sequence}.png', ContentFile(result.pop('preview_png')), save=False)
            page.registration = result['registration']
            page.decoded = result['decoded']
            page.overlay = result['overlay']
            page.confidence = result['confidence']
            page.warnings = result['warnings']
            page.critical_warnings = result['critical_warnings']
            page.error_message = ''
            page.status = OptikOkumaSayfa.Status.REVIEW
        except Exception as exc:
            page.status = OptikOkumaSayfa.Status.ERROR
            page.error_message = str(exc)
        page.save()
    oturum.processed_pages = oturum.sayfalar.exclude(status=OptikOkumaSayfa.Status.PENDING).count()
    pending = oturum.sayfalar.filter(status=OptikOkumaSayfa.Status.PENDING).exists()
    oturum.status = OptikOkumaOturumu.Status.PROCESSING if pending else OptikOkumaOturumu.Status.REVIEW
    oturum.save(update_fields=['processed_pages', 'status', 'updated_at'])
    return Response(_oturum_dict(oturum, pages=True))


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_okuma_sayfa(request, sayfa_pk):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    page = (
        OptikOkumaSayfa.objects
        .select_related('oturum__sablon')
        .filter(pk=sayfa_pk, oturum__sablon__kurum_id=ctx['kurum_id'])
        .first()
    )
    if page is None:
        return Response({'error': 'Sayfa bulunamadı.'}, status=404)
    return Response(_sayfa_dict(page, detail=True))


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_okuma_gorsel(request, sayfa_pk):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    page = OptikOkumaSayfa.objects.filter(pk=sayfa_pk, oturum__sablon__kurum_id=ctx['kurum_id']).first()
    if page is None or not page.image:
        return Response({'error': 'Sayfa görseli bulunamadı.'}, status=404)
    page.image.open('rb')
    try:
        data = page.image.read()
    finally:
        page.image.close()
    return HttpResponse(data, content_type='image/png')


@api_view(['PATCH'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_okuma_incele(request, sayfa_pk):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    page = (
        OptikOkumaSayfa.objects
        .select_related('oturum__sablon')
        .filter(pk=sayfa_pk, oturum__sablon__kurum_id=ctx['kurum_id'])
        .first()
    )
    if page is None:
        return Response({'error': 'Sayfa bulunamadı.'}, status=404)
    secimler = request.data.get('secimler')
    if not isinstance(secimler, dict):
        return Response({'error': 'Seçimler nesne olmalıdır.'}, status=400)
    page.review = {'secimler': secimler}
    page.save(update_fields=['review', 'updated_at'])
    return Response(_sayfa_dict(page, detail=True))


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_okuma_dogrula(request, sayfa_pk):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    page = OptikOkumaSayfa.objects.filter(pk=sayfa_pk, oturum__sablon__kurum_id=ctx['kurum_id']).first()
    if page is None:
        return Response({'error': 'Sayfa bulunamadı.'}, status=404)
    beklenen = request.data.get('beklenen')
    if not isinstance(beklenen, dict):
        return Response({'error': 'Basılan değerler nesne olmalıdır.'}, status=400)
    secimler = (page.review or {}).get('secimler') or {}
    return Response(dogrula(page.decoded or {}, secimler, beklenen))
