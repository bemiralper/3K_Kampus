"""Daire dizisi optik şablonu.

Koordinat editörünün kayıtlarına yazmaz ve onları okuyup dönüştürmez.
"""
import re
from copy import deepcopy
from decimal import Decimal
from io import BytesIO
from urllib.parse import quote

from django.core.files.base import ContentFile
from django.db import transaction
from django.http import HttpResponse
from PIL import Image, UnidentifiedImageError
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.permissions import OlcmeModulePermission

from ..interfaces.sube_context import get_exam_or_response, mandatory_olcme_context
from ..models import ExamParticipant, OptikDaireSablon, OptikYaziciProfili
from ..services.daire_dizisi_detect import daireleri_algila, izleri_algila_coklu
from ..services.daire_dizisi_fmt import fmt_uygula
from ..services.daire_dizisi_print import layout_daire, render_daire_pdf
from ..services.daire_dizisi_raster import kaynak_olcusu, raster_kaynak
from ..services.daire_dizisi_schema import (
    TUR_METIN,
    alan_izi,
    belge_dogrula,
    bos_belge,
    kalibrasyon_uygula,
    kalibrasyon_dogrula,
    satir_y,
    veri_kaynagi_listesi,
)
from ..services.daire_dizisi_tarama import tarama_kalibrasyon
from ..services.daire_dizisi_values import SAMPLE_DAIRE, daire_value_rows
from ..views import CsrfExemptSessionAuthentication

MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 600
_SLUG_RE = re.compile(r'[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+')


def _pdf_response(data: bytes, filename: str, uyarilar=None) -> HttpResponse:
    ascii_name = filename.encode('ascii', 'ignore').decode('ascii') or 'optik-daire.pdf'
    response = HttpResponse(data, content_type='application/pdf')
    response['Content-Disposition'] = (
        f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'
    )
    if uyarilar:
        response['X-Optik-Uyarilar'] = quote(' | '.join(uyarilar))[:800]
    return response


def _slug(name: str) -> str:
    slug = _SLUG_RE.sub('-', (name or 'sinav').strip()).strip('-')
    return f'{(slug or "sinav")[:80]}-daire.pdf'


def _sablon_dict(sablon: OptikDaireSablon, with_belge=False) -> dict:
    belge = sablon.belge if isinstance(sablon.belge, dict) else bos_belge()
    data = {
        'id': sablon.id,
        'ad': sablon.ad,
        'yontem': OptikDaireSablon.SURUM,
        'kaynak_adi': sablon.kaynak.name.rsplit('/', 1)[-1] if sablon.kaynak else '',
        'kaynak_tur': sablon.kaynak_tur,
        'sayfa_no': sablon.sayfa_no,
        'sayfa_sayisi': sablon.sayfa_sayisi,
        'sayfa_genislik_mm': float(sablon.sayfa_genislik_mm),
        'sayfa_yukseklik_mm': float(sablon.sayfa_yukseklik_mm),
        'aktif': sablon.aktif,
        'yazici_profili_id': sablon.yazici_profili_id,
        'yazici_profili_ad': sablon.yazici_profili.ad if sablon.yazici_profili else '',
        'alan_sayisi': len(belge.get('alanlar') or []),
    }
    if with_belge:
        data['belge'] = belge
    return data


def _load(request, sablon_pk):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return None, None, err
    sablon = OptikDaireSablon.objects.filter(pk=sablon_pk, kurum_id=ctx['kurum_id']).first()
    if sablon is None:
        return None, None, Response({'error': 'Daire şablonu bulunamadı.'}, status=404)
    return ctx, sablon, None


def _read_upload(uploaded):
    if uploaded is None:
        raise ValueError('Form dosyası seçin.')
    if uploaded.size > MAX_BYTES:
        raise ValueError('Dosya 20 MB sınırını aşıyor.')
    raw = uploaded.read()
    uploaded.seek(0)
    name = (getattr(uploaded, 'name', '') or '').lower()
    if name.endswith('.pdf') or raw.startswith(b'%PDF'):
        if not raw.startswith(b'%PDF'):
            raise ValueError('Dosya geçerli bir PDF değil.')
        return 'pdf'
    if name.endswith('.png') or raw.startswith(b'\x89PNG'):
        tur = 'png'
    elif name.endswith(('.jpg', '.jpeg')) or raw.startswith(b'\xff\xd8'):
        tur = 'jpg'
    else:
        raise ValueError('Yalnızca PDF, PNG veya JPG yüklenebilir.')
    try:
        Image.open(BytesIO(raw)).verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError('Görsel dosyası açılamadı.')
    return tur


def _sayfa_no(raw, sayfa_sayisi: int) -> int:
    try:
        number = int(raw if raw not in (None, '') else 1)
    except (TypeError, ValueError):
        raise ValueError('Sayfa numarası geçersiz.')
    if number < 1 or number > sayfa_sayisi:
        raise ValueError('Seçilen sayfa formda yok.')
    return number


def _benzersiz_ad(kurum_id, ad: str) -> str:
    base = ad.strip()
    candidate = base[:120]
    n = 2
    while OptikDaireSablon.objects.filter(kurum_id=kurum_id, ad=candidate).exists():
        suffix = f' ({n})'
        candidate = f'{base[:120 - len(suffix)]}{suffix}'
        n += 1
        if n > 40:
            raise ValueError('Bu ad kullanılıyor.')
    return candidate


def _kaynak_oku(sablon: OptikDaireSablon) -> bytes:
    if not sablon.kaynak:
        raise ValueError('Şablonun kaynak dosyası yok.')
    try:
        sablon.kaynak.open('rb')
        raw = sablon.kaynak.read()
    finally:
        sablon.kaynak.close()
    if not raw:
        raise ValueError('Kaynak dosya okunamadı.')
    return raw


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_veri_kaynaklari(request):
    _ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    return Response({'kaynaklar': veri_kaynagi_listesi(), 'surum': OptikDaireSablon.SURUM})


def _profil_dict(row):
    return {
        'id': row.id,
        'ad': row.ad,
        'kalibrasyon': row.kalibrasyon,
        'son_kalite': row.son_kalite,
        'varsayilan': row.varsayilan,
        'aktif': row.aktif,
        'updated_at': row.updated_at,
    }


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_yazici_profilleri(request):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    qs = OptikYaziciProfili.objects.filter(kurum_id=ctx['kurum_id']).order_by('ad', 'id')
    if request.method == 'GET':
        return Response([_profil_dict(row) for row in qs])
    ad = (request.data.get('ad') or '').strip()
    if not ad or len(ad) > 120:
        return Response({'error': 'Profil adı zorunludur.'}, status=400)
    try:
        kalibrasyon = kalibrasyon_dogrula(request.data.get('kalibrasyon'))
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    if qs.filter(ad=ad).exists():
        return Response({'error': 'Bu adda yazıcı profili zaten var.'}, status=400)
    varsayilan = bool(request.data.get('varsayilan')) or not qs.exists()
    with transaction.atomic():
        if varsayilan:
            qs.update(varsayilan=False)
        row = OptikYaziciProfili.objects.create(
            kurum_id=ctx['kurum_id'],
            ad=ad,
            kalibrasyon=kalibrasyon,
            varsayilan=varsayilan,
            son_kalite=request.data.get('son_kalite') if isinstance(request.data.get('son_kalite'), dict) else {},
        )
    return Response(_profil_dict(row), status=201)


@api_view(['PATCH', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_yazici_profili_detail(request, profil_pk):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    row = OptikYaziciProfili.objects.filter(pk=profil_pk, kurum_id=ctx['kurum_id']).first()
    if row is None:
        return Response({'error': 'Yazıcı profili bulunamadı.'}, status=404)
    if request.method == 'DELETE':
        row.delete()
        return Response(status=204)
    if 'ad' in request.data:
        ad = (request.data.get('ad') or '').strip()
        if not ad or len(ad) > 120:
            return Response({'error': 'Profil adı zorunludur.'}, status=400)
        if OptikYaziciProfili.objects.filter(kurum_id=ctx['kurum_id'], ad=ad).exclude(pk=row.pk).exists():
            return Response({'error': 'Bu adda yazıcı profili zaten var.'}, status=400)
        row.ad = ad
    if 'kalibrasyon' in request.data:
        try:
            row.kalibrasyon = kalibrasyon_dogrula(request.data.get('kalibrasyon'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
    if 'son_kalite' in request.data and isinstance(request.data.get('son_kalite'), dict):
        row.son_kalite = request.data['son_kalite']
    if 'aktif' in request.data:
        row.aktif = bool(request.data.get('aktif'))
    with transaction.atomic():
        if request.data.get('varsayilan'):
            OptikYaziciProfili.objects.filter(kurum_id=ctx['kurum_id']).exclude(pk=row.pk).update(varsayilan=False)
            row.varsayilan = True
        row.save()
    return Response(_profil_dict(row))


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_list(request):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    if request.method == 'GET':
        rows = OptikDaireSablon.objects.filter(kurum_id=ctx['kurum_id']).order_by('ad', 'id')
        return Response([_sablon_dict(row) for row in rows])

    ad = (request.data.get('ad') or request.POST.get('ad') or '').strip()
    if not ad or len(ad) > 120:
        return Response({'error': 'Şablon adı zorunludur.'}, status=400)
    if OptikDaireSablon.objects.filter(kurum_id=ctx['kurum_id'], ad=ad).exists():
        return Response({'error': 'Bu adda bir şablon zaten var. Üzerine yazılmadı.'}, status=400)
    uploaded = request.FILES.get('kaynak') or request.FILES.get('dosya')
    try:
        tur = _read_upload(uploaded)
        raw = uploaded.read()
        uploaded.seek(0)
        olcu = kaynak_olcusu(raw, tur, 1)
        sayfa = _sayfa_no(request.data.get('sayfa_no') or request.POST.get('sayfa_no'), olcu['sayfa_sayisi'])
        if tur == 'pdf' and sayfa != 1:
            olcu = kaynak_olcusu(raw, tur, sayfa)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    belge = bos_belge()
    profil = OptikYaziciProfili.objects.filter(
        kurum_id=ctx['kurum_id'], varsayilan=True, aktif=True,
    ).first()
    if profil and isinstance(profil.kalibrasyon, dict):
        belge['kalibrasyon'] = deepcopy(profil.kalibrasyon)
    try:
        raster = raster_kaynak(raw, tur, sayfa)
        iz_png = raw if tur in ('png', 'jpg', 'jpeg') else raster['png']
        iz_w = olcu['genislik_mm'] if tur in ('png', 'jpg', 'jpeg') else raster['genislik_mm']
        iz_h = olcu['yukseklik_mm'] if tur in ('png', 'jpg', 'jpeg') else raster['yukseklik_mm']
        izler = izleri_algila_coklu(iz_png, float(iz_w), float(iz_h))
        iz = next((item for item in izler if item.get('kenar') == 'sol'), None)
        if iz:
            belge['iz'] = iz
            belge['izler'] = izler
    except Exception:
        pass
    sablon = OptikDaireSablon.objects.create(
        kurum_id=ctx['kurum_id'],
        ad=ad,
        kaynak=uploaded,
        kaynak_tur=tur,
        sayfa_no=sayfa,
        sayfa_sayisi=olcu['sayfa_sayisi'],
        sayfa_genislik_mm=Decimal(str(olcu['genislik_mm'])),
        sayfa_yukseklik_mm=Decimal(str(olcu['yukseklik_mm'])),
        belge=belge,
        yazici_profili=profil,
    )
    data = _sablon_dict(sablon, with_belge=True)
    if olcu.get('uyari'):
        data['uyari'] = olcu['uyari']
    return Response(data, status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_detail(request, sablon_pk):
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    if request.method == 'GET':
        return Response(_sablon_dict(sablon, with_belge=True))
    if request.method == 'DELETE':
        sablon.kaynak.delete(save=False)
        sablon.delete()
        return Response(status=204)

    old_source_name = None
    ad = (request.data.get('ad', sablon.ad) or '').strip()
    if not ad or len(ad) > 120:
        return Response({'error': 'Şablon adı zorunludur.'}, status=400)
    clash = OptikDaireSablon.objects.filter(kurum_id=sablon.kurum_id, ad=ad).exclude(pk=sablon.pk)
    if clash.exists():
        return Response({'error': 'Bu adda bir şablon zaten var. Üzerine yazılmadı.'}, status=400)
    sablon.ad = ad
    if 'aktif' in request.data:
        sablon.aktif = bool(request.data.get('aktif'))
    if 'yazici_profili_id' in request.data:
        raw_profil = request.data.get('yazici_profili_id')
        if raw_profil in (None, ''):
            sablon.yazici_profili = None
        else:
            try:
                profil_id = int(raw_profil)
            except (TypeError, ValueError):
                return Response({'error': 'Yazıcı profili geçersiz.'}, status=400)
            profil = OptikYaziciProfili.objects.filter(
                pk=profil_id, kurum_id=sablon.kurum_id, aktif=True,
            ).first()
            if profil is None:
                return Response({'error': 'Yazıcı profili bulunamadı.'}, status=404)
            sablon.yazici_profili = profil
    uploaded = request.FILES.get('kaynak')
    if uploaded:
        try:
            tur = _read_upload(uploaded)
            raw = uploaded.read()
            uploaded.seek(0)
            olcu = kaynak_olcusu(raw, tur, 1)
            sayfa = 1 if tur != 'pdf' else _sayfa_no(request.data.get('sayfa_no', 1), olcu['sayfa_sayisi'])
            if tur == 'pdf' and sayfa != 1:
                olcu = kaynak_olcusu(raw, tur, sayfa)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        old_source_name = sablon.kaynak.name if sablon.kaynak else None
        sablon.kaynak = uploaded
        sablon.kaynak_tur = tur
        sablon.sayfa_sayisi = olcu['sayfa_sayisi']
        sablon.sayfa_no = sayfa
        sablon.sayfa_genislik_mm = Decimal(str(olcu['genislik_mm']))
        sablon.sayfa_yukseklik_mm = Decimal(str(olcu['yukseklik_mm']))
    elif 'sayfa_no' in request.data:
        try:
            sayfa = _sayfa_no(request.data.get('sayfa_no'), sablon.sayfa_sayisi)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        if sablon.kaynak_tur == 'pdf' and sayfa != sablon.sayfa_no:
            try:
                olcu = kaynak_olcusu(_kaynak_oku(sablon), 'pdf', sayfa)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=400)
            sablon.sayfa_genislik_mm = Decimal(str(olcu['genislik_mm']))
            sablon.sayfa_yukseklik_mm = Decimal(str(olcu['yukseklik_mm']))
        sablon.sayfa_no = sayfa
    sablon.save()
    if old_source_name and old_source_name != sablon.kaynak.name:
        sablon.kaynak.storage.delete(old_source_name)
    return Response(_sablon_dict(sablon, with_belge=True))


@api_view(['PUT'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_belge(request, sablon_pk):
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    raw = request.data.get('belge') if isinstance(request.data, dict) else None
    try:
        belge, uyarilar = belge_dogrula(
            raw,
            float(sablon.sayfa_genislik_mm),
            float(sablon.sayfa_yukseklik_mm),
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    sablon.belge = belge
    if (
        sablon.yazici_profili
        and sablon.yazici_profili.aktif
        and isinstance(belge.get('kalibrasyon'), dict)
    ):
        sablon.yazici_profili.kalibrasyon.update(belge['kalibrasyon'])
        sablon.yazici_profili.save(update_fields=['kalibrasyon', 'updated_at'])
    sablon.save(update_fields=['belge', 'updated_at'])
    data = _sablon_dict(sablon, with_belge=True)
    data['uyarilar'] = uyarilar
    return Response(data)


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_layout(request, sablon_pk):
    """Editör ve baskının kullandığı aynı çözülmüş mm geometrisini döndürür."""
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    raw = request.data.get('belge') if isinstance(request.data, dict) else None
    if raw is None:
        raw = sablon.belge
    try:
        belge, uyarilar = belge_dogrula(
            raw,
            float(sablon.sayfa_genislik_mm),
            float(sablon.sayfa_yukseklik_mm),
        )
        # Form görselinin üstü gerçek milimetredir. Yazıcı payı yalnız işaret
        # baskısına eklenir. Editör form_uzayi isterse ölçek ve ofset tuvale girmez;
        # aksi halde şablondaki kalibrasyon bütün daireleri birlikte kaydırır.
        form_uzayi = bool(request.data.get('form_uzayi')) if isinstance(request.data, dict) else False
        if form_uzayi:
            belge = deepcopy(belge)
            belge['kalibrasyon'] = {
                'ofset_x_mm': 0.0,
                'ofset_y_mm': 0.0,
                'olcek': 1.0,
                'olcek_y': 1.0,
            }
        elif (
            sablon.yazici_profili_id
            and sablon.yazici_profili
            and sablon.yazici_profili.aktif
        ):
            belge = deepcopy(belge)
            belge['kalibrasyon'] = deepcopy(sablon.yazici_profili.kalibrasyon)
        lines, marks, layout_uyarilari = layout_daire(belge, SAMPLE_DAIRE)
    except ValueError as exc:
        return Response({'error': str(exc), 'hazir': False, 'hatalar': [str(exc)], 'uyarilar': []}, status=400)

    kalibrasyon = belge.get('kalibrasyon') or {}
    alanlar = []
    for alan in belge.get('alanlar') or []:
        if not alan.get('aktif', True):
            continue
        row = {'id': alan['id'], 'tur': alan['tur'], 'daireler': []}
        if alan.get('tur') != TUR_METIN:
            iz = alan_izi(belge, alan)
            cap = float(alan.get('cap_mm') or 0) * float(kalibrasyon.get('olcek') or 1)
            for r in range(int(alan['satir'])):
                y = satir_y(alan, r, iz)
                for c in range(int(alan['sutun'])):
                    x = float(alan['x_mm']) + c * float(alan['aralik_x_mm'])
                    x, resolved_y = kalibrasyon_uygula(x, y, kalibrasyon)
                    row['daireler'].append({
                        'satir': r,
                        'sutun': c,
                        'x_mm': x,
                        'y_mm': resolved_y,
                        'cap_mm': cap,
                    })
        alanlar.append(row)
    return Response({
        'hazir': True,
        'hatalar': [],
        'uyarilar': list(dict.fromkeys(uyarilar + layout_uyarilari)),
        'belge': belge,
        'alanlar': alanlar,
        'ornek': {'metinler': lines, 'isaretler': marks},
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_kopyala(request, sablon_pk):
    ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    istenen = (request.data.get('ad') or '').strip()
    try:
        if istenen:
            if len(istenen) > 120:
                raise ValueError('Şablon adı çok uzun.')
            if OptikDaireSablon.objects.filter(kurum_id=ctx['kurum_id'], ad=istenen).exists():
                raise ValueError('Bu adda bir şablon zaten var. Üzerine yazılmadı.')
            ad = istenen
        else:
            ad = _benzersiz_ad(ctx['kurum_id'], f'{sablon.ad} kopya')
        raw = _kaynak_oku(sablon)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    with transaction.atomic():
        kopya = OptikDaireSablon.objects.create(
            kurum_id=sablon.kurum_id,
            ad=ad,
            kaynak_tur=sablon.kaynak_tur,
            sayfa_no=sablon.sayfa_no,
            sayfa_sayisi=sablon.sayfa_sayisi,
            sayfa_genislik_mm=sablon.sayfa_genislik_mm,
            sayfa_yukseklik_mm=sablon.sayfa_yukseklik_mm,
            belge=sablon.belge,
            aktif=sablon.aktif,
            yazici_profili=sablon.yazici_profili,
        )
        kopya.kaynak.save(f'{kopya.pk}-{sablon.kaynak.name.rsplit("/", 1)[-1]}', ContentFile(raw), save=True)
    return Response(_sablon_dict(kopya, with_belge=True), status=201)


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_sayfa(request, sablon_pk):
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    try:
        sayfa = _sayfa_no(request.GET.get('no', sablon.sayfa_no), sablon.sayfa_sayisi)
        info = raster_kaynak(_kaynak_oku(sablon), sablon.kaynak_tur, sayfa)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    response = HttpResponse(info['png'], content_type='image/png')
    response['X-Sayfa-Genislik-Mm'] = str(info['genislik_mm'])
    response['X-Sayfa-Yukseklik-Mm'] = str(info['yukseklik_mm'])
    response['X-Sayfa-Sayisi'] = str(info['sayfa_sayisi'])
    response['X-Sayfa-No'] = str(sayfa)
    if info.get('uyari'):
        response['X-Raster-Uyari'] = quote(info['uyari'])
    return response


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_algila(request, sablon_pk):
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    try:
        sayfa = _sayfa_no(request.data.get('sayfa_no', sablon.sayfa_no), sablon.sayfa_sayisi)
        kaynak = _kaynak_oku(sablon)
        info = raster_kaynak(kaynak, sablon.kaynak_tur, sayfa)
        if request.data.get('sadece_iz'):
            sonuc = {'daireler': [], 'diziler': [], 'uyari': ''}
        else:
            sonuc = daireleri_algila(info['png'], info['genislik_mm'], info['yukseklik_mm'])
        if (sablon.kaynak_tur or '').lower() in ('png', 'jpg', 'jpeg'):
            iz_png, iz_w, iz_h = kaynak, sablon.sayfa_genislik_mm, sablon.sayfa_yukseklik_mm
        else:
            iz_png, iz_w, iz_h = info['png'], info['genislik_mm'], info['yukseklik_mm']
        sonuc['izler'] = izleri_algila_coklu(iz_png, float(iz_w), float(iz_h))
        sonuc['iz'] = next((item for item in sonuc['izler'] if item.get('kenar') == 'sol'), None)
        if request.data.get('sadece_iz') and not sonuc['iz']:
            sonuc['uyari'] = 'Sol kenarda kesikli iz bulunamadı.'
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    sonuc['kaydedildi'] = False
    return Response(sonuc)


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_fmt(request, sablon_pk):
    """FMT satır/sütun dosyasından alanları kurar. Şablonu kaydetmez."""
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    uploaded = request.FILES.get('dosya') or request.FILES.get('fmt')
    if uploaded is not None:
        if uploaded.size > 256 * 1024:
            return Response({'error': 'FMT dosyası 256 KB sınırını aşıyor.'}, status=400)
        raw = uploaded.read()
        dosya = uploaded.name or 'form.fmt'
    else:
        raw = request.data.get('metin') if hasattr(request, 'data') else None
        dosya = 'form.fmt'
        if not isinstance(raw, str) or not raw.strip():
            return Response({'error': 'FMT dosyası seçin.'}, status=400)
    kenar = None
    data = request.data if isinstance(getattr(request, 'data', None), dict) else {}
    if data.get('x0_mm') not in (None, '') and data.get('y0_mm') not in (None, ''):
        kenar = {
            'x0_mm': data.get('x0_mm'),
            'y0_mm': data.get('y0_mm'),
            'aralik_x_mm': data.get('aralik_x_mm') or 4.3,
            'aralik_y_mm': data.get('aralik_y_mm') or 4.3,
            'cap_mm': data.get('cap_mm') or 3.2,
        }
    try:
        sonuc = fmt_uygula(
            raw,
            dosya,
            sablon.belge if isinstance(sablon.belge, dict) else {},
            float(sablon.sayfa_genislik_mm),
            float(sablon.sayfa_yukseklik_mm),
            kenar,
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    return Response(sonuc)


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_tarama_kalibrasyon(request, sablon_pk):
    """Kayıtlı şablonla basılıp taranan sayfadan kalibrasyon önerisi. Kaydetmez."""
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    uploaded = request.FILES.get('tarama')
    try:
        _read_upload(uploaded)
        raw = uploaded.read()
        sonuc = tarama_kalibrasyon(
            raw,
            sablon.belge or {},
            float(sablon.sayfa_genislik_mm),
            float(sablon.sayfa_yukseklik_mm),
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    return Response(sonuc)


def _cikti(sablon, rows, formu_bas: bool):
    try:
        raw = _kaynak_oku(sablon)
        pdf, uyarilar = render_daire_pdf(raw, sablon, rows, formu_bas=formu_bas)
    except ValueError as exc:
        return None, Response({'error': str(exc)}, status=400)
    return (pdf, uyarilar), None


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_onizleme(request, sablon_pk):
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    packed, error = _cikti(sablon, [SAMPLE_DAIRE], formu_bas=True)
    if error:
        return error
    pdf, uyarilar = packed
    return _pdf_response(pdf, f'{sablon.ad}-onizleme.pdf', uyarilar)


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_daire_test_baski(request, sablon_pk):
    _ctx, sablon, err = _load(request, sablon_pk)
    if err:
        return err
    booklet_mode = request.data.get('booklet_mode') or 'fixed'
    booklet = (request.data.get('booklet') or 'A').strip().upper()
    if booklet_mode not in ('fixed', 'alternating_ab') or booklet not in ('A', 'B', 'C', 'D'):
        return Response({'error': 'Kitapçık seçimi geçersiz.'}, status=400)
    sample = {**SAMPLE_DAIRE, 'kitapcik': 'A' if booklet_mode == 'alternating_ab' else booklet}
    packed, error = _cikti(sablon, [sample], formu_bas=False)
    if error:
        return error
    pdf, uyarilar = packed
    return _pdf_response(pdf, f'{sablon.ad}-test.pdf', uyarilar)


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def exam_optik_daire_yazdir(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    try:
        sablon_id = int(request.data.get('sablon_id'))
    except (TypeError, ValueError):
        return Response({'error': 'Daire şablonu seçin.'}, status=400)
    sablon = OptikDaireSablon.objects.filter(
        pk=sablon_id, kurum_id=exam.kurum_id, aktif=True,
    ).first()
    if sablon is None:
        return Response({'error': 'Daire şablonu bulunamadı.'}, status=404)
    qs = (
        ExamParticipant.objects.filter(exam=exam)
        .select_related('student', 'room', 'exam_session', 'sinif_seviyesi')
    )
    raw_ids = request.data.get('participant_ids')
    if raw_ids not in (None, ''):
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({'error': 'Öğrenci seçimi geçersiz.'}, status=400)
        try:
            ids = [int(pk) for pk in raw_ids]
        except (TypeError, ValueError):
            return Response({'error': 'Öğrenci seçimi geçersiz.'}, status=400)
        qs = qs.filter(pk__in=ids)
    participants = list(qs.order_by('exam_session__order', 'room__order', 'seat_no', 'id'))
    if not participants:
        return Response({'error': 'Basılacak katılımcı yok.'}, status=400)
    if len(participants) > MAX_PAGES:
        return Response({'error': f'Bir seferde en fazla {MAX_PAGES} form basılabilir.'}, status=400)
    try:
        rows = daire_value_rows(
            exam,
            participants,
            booklet_mode=request.data.get('booklet_mode') or 'none',
            booklet=request.data.get('booklet') or 'A',
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    packed, error = _cikti(sablon, rows, formu_bas=False)
    if error:
        return error
    pdf, uyarilar = packed
    return _pdf_response(pdf, _slug(exam.name), uyarilar)
