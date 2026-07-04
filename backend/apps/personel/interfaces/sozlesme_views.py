"""
Personel Sözleşmeleri — API Views
"""
import json
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from shared.permissions import require_module_permission

from django.db.models import Sum, Count, F

from apps.personel.application.sozlesme_service import SozlesmeService, HakedisService, AvansService
from apps.personel.domain.sozlesme_models import (
    PersonelSozlesme, DersUcretTanim, AylikHakedis, AvansKaydi,
    UcretDonemi, SozlesmeTuru, SozlesmeDurumu, UcretTipi, HakedisDurumu,
)


# ═══════════════════════════════════════════════════════════════
#  Yardımcılar
# ═══════════════════════════════════════════════════════════════

def _ctx(request):
    """Header'lardan kurum / egitim_yili context bilgisini oku."""
    kurum_id = request.headers.get('X-Kurum-ID') or request.session.get('active_kurum_id')
    ey_id = request.headers.get('X-EgitimYili-ID') or request.session.get('active_egitim_yili_id')
    kurum_id = int(kurum_id) if kurum_id else None
    ey_id = int(ey_id) if ey_id else None

    if not kurum_id:
        from apps.kurum.domain.models import Kurum
        k = Kurum.objects.filter(aktif_mi=True).first()
        kurum_id = k.id if k else None
    if not ey_id:
        from apps.egitim_yili.domain.models import EgitimYili
        e = EgitimYili.objects.filter(aktif_mi=True).first()
        ey_id = e.id if e else None

    return kurum_id, ey_id


def _serialize_sozlesme(s):
    """Sözleşme → dict"""
    return {
        'id': s.id,
        'personel_id': s.personel_id,
        'personel_ad': s.personel.tam_ad,
        'personel_foto': s.personel.fotograf.url if s.personel.fotograf else None,
        'egitim_yili_id': s.egitim_yili_id,
        'egitim_yili_display': str(s.egitim_yili),
        'sozlesme_turu': s.sozlesme_turu,
        'sozlesme_turu_display': s.get_sozlesme_turu_display(),
        'durum': s.durum,
        'durum_display': s.get_durum_display(),
        'baslangic_tarihi': s.baslangic_tarihi.isoformat() if s.baslangic_tarihi else None,
        'bitis_tarihi': s.bitis_tarihi.isoformat() if s.bitis_tarihi else None,
        'brut_maas': float(s.brut_maas),
        'net_maas': float(s.net_maas),
        'sgk_gun': s.sgk_gun,
        'ders_ucreti_aktif': s.ders_ucreti_aktif,
        'notlar': s.notlar,
        'sozlesme_dosya': s.sozlesme_dosya.url if s.sozlesme_dosya else None,
        # ── Fesih bilgileri ──
        'fesih_tarihi': s.fesih_tarihi.isoformat() if s.fesih_tarihi else None,
        'fesih_sebebi': s.fesih_sebebi or '',
        # ── Ders ücretleri ──
        'ders_ucretleri': [
            {
                'id': du.id,
                'brans_id': du.brans_id,
                'brans_ad': du.brans.ad if du.brans else 'Genel',
                'ucret_tipi': du.ucret_tipi,
                'ucret_tipi_display': du.get_ucret_tipi_display(),
                'birim_ucret': float(du.birim_ucret),
                'haftalik_saat': float(du.haftalik_saat),
                'min_saat': float(du.min_saat) if du.min_saat else None,
                'max_saat': float(du.max_saat) if du.max_saat else None,
                'notlar': du.notlar,
            }
            for du in s.ders_ucretleri.all()
        ],
        # ── Ücret dönemleri ──
        'ucret_donemleri': [
            {
                'id': ud.id,
                'baslangic_ay': ud.baslangic_ay,
                'bitis_ay': ud.bitis_ay,
                'brut_maas': float(ud.brut_maas),
                'net_maas': float(ud.net_maas),
                'aciklama': ud.aciklama,
            }
            for ud in s.ucret_donemleri.all()
        ],
        'created_at': s.created_at.isoformat() if s.created_at else None,
    }


def _serialize_hakedis(h):
    """Hakediş → dict"""
    return {
        'id': h.id,
        'sozlesme_id': h.sozlesme_id,
        'personel_ad': h.sozlesme.personel.tam_ad,
        'personel_id': h.sozlesme.personel_id,
        'sozlesme_turu': h.sozlesme.sozlesme_turu,
        'sozlesme_turu_display': h.sozlesme.get_sozlesme_turu_display(),
        'yil': h.yil,
        'ay': h.ay,
        'ay_display': _ay_adi(h.ay),
        'sabit_maas': float(h.sabit_maas),
        'toplam_ders_saati': float(h.toplam_ders_saati),
        'ders_basi_ucret': float(h.ders_basi_ucret),
        'ders_ucreti_toplam': float(h.ders_ucreti_toplam),
        'prim': float(h.prim),
        'fazla_mesai': float(h.fazla_mesai),
        'ek_odeme': float(h.ek_odeme),
        'avans': float(h.avans),
        'kesintiler': float(h.kesintiler),
        'brut_toplam': float(h.brut_toplam),
        'net_hakedis': float(h.net_hakedis),
        'durum': h.durum,
        'durum_display': h.get_durum_display(),
        'odeme_tarihi': h.odeme_tarihi.isoformat() if h.odeme_tarihi else None,
        'notlar': h.notlar,
    }


_AY_ADLARI = {
    1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan',
    5: 'Mayıs', 6: 'Haziran', 7: 'Temmuz', 8: 'Ağustos',
    9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
}

def _ay_adi(ay):
    return _AY_ADLARI.get(ay, str(ay))


def _dec(val, default='0.00'):
    try:
        return Decimal(str(val)) if val not in (None, '') else Decimal(default)
    except (InvalidOperation, ValueError):
        return Decimal(default)


# ═══════════════════════════════════════════════════════════════
#  SÖZLEŞME API
# ═══════════════════════════════════════════════════════════════

@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET', 'POST'])
def api_sozlesme_list_create(request):
    kurum_id, ey_id = _ctx(request)
    svc = SozlesmeService()

    if request.method == 'GET':
        filters = {
            'durum': request.GET.get('durum', ''),
            'sozlesme_turu': request.GET.get('sozlesme_turu', ''),
            'search': request.GET.get('search', ''),
        }
        qs = svc.list(kurum_id, ey_id, filters)
        return JsonResponse({
            'success': True,
            'data': [_serialize_sozlesme(s) for s in qs],
        })

    # POST — oluştur
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    data = {
        'kurum_id': kurum_id,
        'personel_id': body.get('personel_id'),
        'egitim_yili_id': ey_id,
        'sozlesme_turu': body.get('sozlesme_turu', SozlesmeTuru.TAM_ZAMANLI),
        'durum': body.get('durum', SozlesmeDurumu.TASLAK),
        'baslangic_tarihi': body.get('baslangic_tarihi'),
        'bitis_tarihi': body.get('bitis_tarihi'),
        'brut_maas': _dec(body.get('brut_maas')),
        'net_maas': _dec(body.get('net_maas')),
        'sgk_gun': int(body.get('sgk_gun', 30)),
        'ders_ucreti_aktif': body.get('ders_ucreti_aktif', False),
        'notlar': body.get('notlar', ''),
    }

    # Ders ücreti tanımları
    ders_ucretleri = []
    for du in body.get('ders_ucretleri', []):
        ders_ucretleri.append({
            'brans_id': du.get('brans_id') or None,
            'ucret_tipi': du.get('ucret_tipi', UcretTipi.SAAT_BASI),
            'birim_ucret': _dec(du.get('birim_ucret'), '0.01'),
            'haftalik_saat': _dec(du.get('haftalik_saat'), '0.0'),
            'min_saat': _dec(du.get('min_saat')) if du.get('min_saat') else None,
            'max_saat': _dec(du.get('max_saat')) if du.get('max_saat') else None,
            'notlar': du.get('notlar', ''),
        })
    data['ders_ucretleri'] = ders_ucretleri

    # Ücret dönemleri
    ucret_donemleri = []
    for ud in body.get('ucret_donemleri', []):
        ucret_donemleri.append({
            'baslangic_ay': int(ud.get('baslangic_ay', 1)),
            'bitis_ay': int(ud.get('bitis_ay', 0)),
            'brut_maas': _dec(ud.get('brut_maas')),
            'net_maas': _dec(ud.get('net_maas')),
            'aciklama': ud.get('aciklama', ''),
        })
    data['ucret_donemleri'] = ucret_donemleri

    try:
        sozlesme = svc.create(data)
        return JsonResponse({'success': True, 'data': _serialize_sozlesme(sozlesme)}, status=201)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET', 'PUT', 'DELETE'])
def api_sozlesme_detail(request, pk):
    svc = SozlesmeService()

    if request.method == 'GET':
        s = svc.get(pk)
        if not s:
            return JsonResponse({'success': False, 'error': 'Bulunamadı.'}, status=404)
        return JsonResponse({'success': True, 'data': _serialize_sozlesme(s)})

    if request.method == 'PUT':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

        data = {}
        field_map = {
            'sozlesme_turu': str, 'durum': str,
            'baslangic_tarihi': str, 'bitis_tarihi': str,
            'sgk_gun': int, 'ders_ucreti_aktif': bool, 'notlar': str,
        }
        for field, caster in field_map.items():
            if field in body:
                data[field] = caster(body[field])
        if 'brut_maas' in body:
            data['brut_maas'] = _dec(body['brut_maas'])
        if 'net_maas' in body:
            data['net_maas'] = _dec(body['net_maas'])
        if 'personel_id' in body:
            data['personel_id'] = body['personel_id']

        if 'ders_ucretleri' in body:
            ders_ucretleri = []
            for du in body['ders_ucretleri']:
                ders_ucretleri.append({
                    'brans_id': du.get('brans_id') or None,
                    'ucret_tipi': du.get('ucret_tipi', UcretTipi.SAAT_BASI),
                    'birim_ucret': _dec(du.get('birim_ucret'), '0.01'),
                    'haftalik_saat': _dec(du.get('haftalik_saat'), '0.0'),
                    'min_saat': _dec(du.get('min_saat')) if du.get('min_saat') else None,
                    'max_saat': _dec(du.get('max_saat')) if du.get('max_saat') else None,
                    'notlar': du.get('notlar', ''),
                })
            data['ders_ucretleri'] = ders_ucretleri

        if 'ucret_donemleri' in body:
            ucret_donemleri = []
            for ud in body['ucret_donemleri']:
                ucret_donemleri.append({
                    'baslangic_ay': int(ud.get('baslangic_ay', 1)),
                    'bitis_ay': int(ud.get('bitis_ay', 0)),
                    'brut_maas': _dec(ud.get('brut_maas')),
                    'net_maas': _dec(ud.get('net_maas')),
                    'aciklama': ud.get('aciklama', ''),
                })
            data['ucret_donemleri'] = ucret_donemleri

        try:
            sozlesme = svc.update(pk, data)
            if not sozlesme:
                return JsonResponse({'success': False, 'error': 'Bulunamadı.'}, status=404)
            return JsonResponse({'success': True, 'data': _serialize_sozlesme(sozlesme)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    # DELETE
    ok = svc.delete(pk)
    if ok:
        return JsonResponse({'success': True}, status=204)
    return JsonResponse({'success': False, 'error': 'Bulunamadı.'}, status=404)


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['POST'])
def api_sozlesme_durum(request, pk):
    """Sözleşme durumunu değiştir. Fesih durumunda fesih_sebebi ve fesih_tarihi de alınır."""
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    yeni_durum = body.get('durum')
    if not yeni_durum:
        return JsonResponse({'success': False, 'error': '"durum" alanı zorunlu.'}, status=400)

    fesih_sebebi = body.get('fesih_sebebi', '')
    fesih_tarihi = body.get('fesih_tarihi')

    svc = SozlesmeService()
    sozlesme, err = svc.durum_degistir(pk, yeni_durum, fesih_sebebi=fesih_sebebi, fesih_tarihi=fesih_tarihi)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)
    return JsonResponse({'success': True, 'data': _serialize_sozlesme(sozlesme)})


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_sozlesme_stats(request):
    kurum_id, ey_id = _ctx(request)
    svc = SozlesmeService()
    stats = svc.stats(kurum_id, ey_id)
    return JsonResponse({'success': True, 'data': stats})


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_sozlesme_helper_data(request):
    """Dropdown verilerini döndür: personeller, branşlar, enum'lar."""
    kurum_id, _ = _ctx(request)

    from apps.personel.domain.models import Personel
    from apps.egitim_tanimlari.models import Brans

    personeller = list(
        Personel.objects.filter(kurum_id=kurum_id, aktif_mi=True)
        .order_by('soyad', 'ad')
        .values('id', 'ad', 'soyad', 'tc_kimlik_no')
    )
    for p in personeller:
        p['tam_ad'] = f"{p['ad']} {p['soyad']}"

    branslar = list(
        Brans.objects.filter(aktif_mi=True).order_by('ad').values('id', 'ad', 'kod')
    )

    return JsonResponse({
        'success': True,
        'data': {
            'personeller': personeller,
            'branslar': branslar,
            'sozlesme_turleri': [{'value': v, 'label': l} for v, l in SozlesmeTuru.choices],
            'sozlesme_durumlari': [{'value': v, 'label': l} for v, l in SozlesmeDurumu.choices],
            'ucret_tipleri': [{'value': v, 'label': l} for v, l in UcretTipi.choices],
        },
    })


# ═══════════════════════════════════════════════════════════════
#  HAKEDİŞ API
# ═══════════════════════════════════════════════════════════════

@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET', 'POST'])
def api_hakedis_list_create(request):
    kurum_id, ey_id = _ctx(request)
    svc = HakedisService()

    if request.method == 'GET':
        yil = request.GET.get('yil')
        ay = request.GET.get('ay')
        filters = {
            'durum': request.GET.get('durum', ''),
            'egitim_yili_id': ey_id,
        }
        qs = svc.list(kurum_id, int(yil) if yil else None, int(ay) if ay else None, filters)
        return JsonResponse({
            'success': True,
            'data': [_serialize_hakedis(h) for h in qs],
        })

    # POST — tekil oluştur
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    data = {
        'sozlesme_id': body.get('sozlesme_id'),
        'yil': int(body.get('yil', 0)),
        'ay': int(body.get('ay', 0)),
        'sabit_maas': _dec(body.get('sabit_maas')),
        'toplam_ders_saati': _dec(body.get('toplam_ders_saati')),
        'ders_basi_ucret': _dec(body.get('ders_basi_ucret')),
        'ders_ucreti_toplam': _dec(body.get('ders_ucreti_toplam')),
        'prim': _dec(body.get('prim')),
        'fazla_mesai': _dec(body.get('fazla_mesai')),
        'ek_odeme': _dec(body.get('ek_odeme')),
        'avans': _dec(body.get('avans')),
        'kesintiler': _dec(body.get('kesintiler')),
        'notlar': body.get('notlar', ''),
    }

    try:
        hakedis = svc.create(data)
        return JsonResponse({'success': True, 'data': _serialize_hakedis(hakedis)}, status=201)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET', 'PUT', 'DELETE'])
def api_hakedis_detail(request, pk):
    svc = HakedisService()

    if request.method == 'GET':
        h = svc.get(pk)
        if not h:
            return JsonResponse({'success': False, 'error': 'Bulunamadı.'}, status=404)
        return JsonResponse({'success': True, 'data': _serialize_hakedis(h)})

    if request.method == 'PUT':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

        data = {}
        for field in ['sabit_maas', 'toplam_ders_saati', 'ders_basi_ucret', 'ders_ucreti_toplam',
                       'prim', 'fazla_mesai', 'ek_odeme', 'avans', 'kesintiler']:
            if field in body:
                data[field] = _dec(body[field])
        if 'notlar' in body:
            data['notlar'] = body['notlar']
        if 'odeme_tarihi' in body:
            data['odeme_tarihi'] = body['odeme_tarihi'] or None

        hakedis, err = svc.update(pk, data)
        if err:
            return JsonResponse({'success': False, 'error': err}, status=400)
        return JsonResponse({'success': True, 'data': _serialize_hakedis(hakedis)})

    # DELETE
    ok, err = svc.delete(pk)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)
    return JsonResponse({'success': True}, status=204)


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['POST'])
def api_hakedis_onayla(request, pk):
    svc = HakedisService()
    hakedis, err = svc.onayla(pk)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)
    return JsonResponse({'success': True, 'data': _serialize_hakedis(hakedis)})


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['POST'])
def api_hakedis_odendi(request, pk):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    odeme_tarihi = body.get('odeme_tarihi')
    if not odeme_tarihi:
        return JsonResponse({'success': False, 'error': '"odeme_tarihi" zorunlu.'}, status=400)

    svc = HakedisService()
    hakedis, err = svc.odendi_isaretle(pk, odeme_tarihi)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)
    return JsonResponse({'success': True, 'data': _serialize_hakedis(hakedis)})


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['POST'])
def api_hakedis_toplu_olustur(request):
    """Aktif sözleşmeler için belirtilen aya toplu hakediş oluştur."""
    kurum_id, ey_id = _ctx(request)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    yil = int(body.get('yil', 0))
    ay = int(body.get('ay', 0))
    if not (1 <= ay <= 12) or yil < 2020:
        return JsonResponse({'success': False, 'error': 'Geçersiz yıl/ay.'}, status=400)

    svc = HakedisService()
    created = svc.toplu_olustur(kurum_id, ey_id, yil, ay)
    return JsonResponse({
        'success': True,
        'data': {
            'olusturulan': len(created),
            'hakedisler': [_serialize_hakedis(h) for h in created],
        }
    })


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_hakedis_stats(request):
    kurum_id, _ = _ctx(request)
    yil = request.GET.get('yil')
    ay = request.GET.get('ay')
    if not yil or not ay:
        return JsonResponse({'success': False, 'error': 'yil ve ay zorunlu.'}, status=400)
    svc = HakedisService()
    stats = svc.stats(kurum_id, int(yil), int(ay))
    return JsonResponse({'success': True, 'data': stats})


# ═══════════════════════════════════════════════════════════════
#  RAPOR API
# ═══════════════════════════════════════════════════════════════

@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_rapor_yillik(request):
    """Yıllık personel maliyet raporu — aylık bazda kırılım."""
    kurum_id, _ = _ctx(request)
    yil = int(request.GET.get('yil', date.today().year))

    qs = AylikHakedis.objects.filter(
        sozlesme__kurum_id=kurum_id, yil=yil,
    )

    # Aylık toplamlar
    aylik = []
    for m in range(1, 13):
        ay_qs = qs.filter(ay=m)
        agg = ay_qs.aggregate(
            brut=Sum('brut_toplam'),
            net=Sum('net_hakedis'),
            ders_saat=Sum('toplam_ders_saati'),
            ders_ucret=Sum('ders_ucreti_toplam'),
            sabit_maas=Sum('sabit_maas'),
            prim=Sum('prim'),
            fazla_mesai=Sum('fazla_mesai'),
            ek_odeme=Sum('ek_odeme'),
            avans=Sum('avans'),
            kesinti=Sum('kesintiler'),
        )
        aylik.append({
            'ay': m,
            'ay_adi': _ay_adi(m),
            'personel_sayisi': ay_qs.values('sozlesme__personel_id').distinct().count(),
            'brut_toplam': float(agg['brut'] or 0),
            'net_toplam': float(agg['net'] or 0),
            'ders_saat_toplam': float(agg['ders_saat'] or 0),
            'ders_ucret_toplam': float(agg['ders_ucret'] or 0),
            'sabit_maas_toplam': float(agg['sabit_maas'] or 0),
            'prim_toplam': float(agg['prim'] or 0),
            'fazla_mesai_toplam': float(agg['fazla_mesai'] or 0),
            'ek_odeme_toplam': float(agg['ek_odeme'] or 0),
            'avans_toplam': float(agg['avans'] or 0),
            'kesinti_toplam': float(agg['kesinti'] or 0),
        })

    # Yıl genel toplamı
    genel = qs.aggregate(
        brut=Sum('brut_toplam'),
        net=Sum('net_hakedis'),
        ders_saat=Sum('toplam_ders_saati'),
    )

    # Tür bazlı dağılım
    tur_dagilimi = list(
        qs.values(tur=F('sozlesme__sozlesme_turu'))
        .annotate(
            toplam_brut=Sum('brut_toplam'),
            toplam_net=Sum('net_hakedis'),
            kisi_sayisi=Count('sozlesme__personel_id', distinct=True),
        )
        .order_by('tur')
    )
    for t in tur_dagilimi:
        t['toplam_brut'] = float(t['toplam_brut'] or 0)
        t['toplam_net'] = float(t['toplam_net'] or 0)

    # Durum dağılımı (ödeme durumu)
    durum_dagilimi = list(
        qs.values('durum')
        .annotate(sayi=Count('id'), toplam=Sum('brut_toplam'))
        .order_by('durum')
    )
    for d in durum_dagilimi:
        d['toplam'] = float(d['toplam'] or 0)

    return JsonResponse({
        'success': True,
        'data': {
            'yil': yil,
            'aylik': aylik,
            'genel_brut': float(genel['brut'] or 0),
            'genel_net': float(genel['net'] or 0),
            'genel_ders_saat': float(genel['ders_saat'] or 0),
            'tur_dagilimi': tur_dagilimi,
            'durum_dagilimi': durum_dagilimi,
        },
    })


# ═══════════════════════════════════════════════════════════════
#  AVANS API
# ═══════════════════════════════════════════════════════════════

def _serialize_avans(a):
    """AvansKaydi → dict"""
    return {
        'id': a.id,
        'sozlesme_id': a.sozlesme_id,
        'personel_ad': a.sozlesme.personel.tam_ad,
        'personel_id': a.sozlesme.personel_id,
        'tarih': a.tarih.isoformat(),
        'tutar': float(a.tutar),
        'aciklama': a.aciklama,
        'mahsup_yil': a.mahsup_yil,
        'mahsup_ay': a.mahsup_ay,
        'mahsup_ay_display': _ay_adi(a.mahsup_ay),
        'olusturan': a.olusturan.get_full_name() if a.olusturan else None,
        'created_at': a.created_at.isoformat() if a.created_at else None,
    }


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET', 'POST'])
def api_avans_list_create(request):
    """Avans kayıtlarını listele veya yeni oluştur."""
    kurum_id, _ = _ctx(request)
    svc = AvansService()

    if request.method == 'GET':
        sozlesme_id = request.GET.get('sozlesme_id')
        personel_id = request.GET.get('personel_id')
        yil = request.GET.get('yil')
        ay = request.GET.get('ay')

        if sozlesme_id and yil and ay:
            qs = svc.list_for_hakedis(int(sozlesme_id), int(yil), int(ay))
        elif sozlesme_id:
            qs = svc.list_for_sozlesme(int(sozlesme_id))
        elif personel_id:
            qs = svc.list_for_personel(int(personel_id), kurum_id)
        else:
            from apps.personel.domain.sozlesme_models import AvansKaydi as AK
            qs = AK.objects.select_related(
                'sozlesme', 'sozlesme__personel', 'olusturan',
            ).filter(sozlesme__kurum_id=kurum_id).order_by('-tarih')

        return JsonResponse({
            'success': True,
            'data': [_serialize_avans(a) for a in qs],
        })

    # POST — oluştur
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    data = {
        'sozlesme_id': body.get('sozlesme_id'),
        'tarih': body.get('tarih'),
        'tutar': _dec(body.get('tutar'), '0.01'),
        'aciklama': body.get('aciklama', ''),
        'mahsup_yil': int(body.get('mahsup_yil', 0)),
        'mahsup_ay': int(body.get('mahsup_ay', 0)),
    }
    if hasattr(request, 'user') and request.user.is_authenticated:
        data['olusturan'] = request.user

    try:
        avans = svc.create(data)
        return JsonResponse({'success': True, 'data': _serialize_avans(avans)}, status=201)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET', 'PUT', 'DELETE'])
def api_avans_detail(request, pk):
    svc = AvansService()

    if request.method == 'GET':
        avans = svc.get(pk)
        if not avans:
            return JsonResponse({'success': False, 'error': 'Bulunamadı.'}, status=404)
        return JsonResponse({'success': True, 'data': _serialize_avans(avans)})

    if request.method == 'PUT':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

        data = {}
        if 'tarih' in body:
            data['tarih'] = body['tarih']
        if 'tutar' in body:
            data['tutar'] = _dec(body['tutar'])
        if 'aciklama' in body:
            data['aciklama'] = body['aciklama']
        if 'mahsup_yil' in body:
            data['mahsup_yil'] = int(body['mahsup_yil'])
        if 'mahsup_ay' in body:
            data['mahsup_ay'] = int(body['mahsup_ay'])

        updated, err = svc.update(pk, data)
        if err:
            return JsonResponse({'success': False, 'error': err}, status=400)
        return JsonResponse({'success': True, 'data': _serialize_avans(updated)})

    # DELETE
    ok, err = svc.delete(pk)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)
    return JsonResponse({'success': True}, status=204)


# ═══════════════════════════════════════════════════════════════
#  TOPLU ÖDENDİ (Maaş Bordrosu sayfası için)
# ═══════════════════════════════════════════════════════════════

@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['POST'])
def api_hakedis_toplu_onayla(request):
    """Birden çok hakediş'i toplu onayla."""
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    ids = body.get('ids', [])
    if not ids:
        return JsonResponse({'success': False, 'error': 'ID listesi boş.'}, status=400)

    svc = HakedisService()
    ok = 0
    errors = []
    for hid in ids:
        hakedis, err = svc.onayla(hid)
        if err:
            errors.append(f'#{hid}: {err}')
        else:
            ok += 1

    return JsonResponse({
        'success': True,
        'data': {'onaylanan': ok, 'hatalar': errors},
    })


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['POST'])
def api_hakedis_toplu_odendi(request):
    """Birden çok hakediş'i toplu ödendi olarak işaretle."""
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    ids = body.get('ids', [])
    odeme_tarihi = body.get('odeme_tarihi')
    if not ids:
        return JsonResponse({'success': False, 'error': 'ID listesi boş.'}, status=400)
    if not odeme_tarihi:
        return JsonResponse({'success': False, 'error': '"odeme_tarihi" zorunlu.'}, status=400)

    svc = HakedisService()
    ok = 0
    errors = []
    for hid in ids:
        hakedis, err = svc.odendi_isaretle(hid, odeme_tarihi)
        if err:
            errors.append(f'#{hid}: {err}')
        else:
            ok += 1

    return JsonResponse({
        'success': True,
        'data': {'odenen': ok, 'hatalar': errors},
    })


# ═══════════════════════════════════════════════════════════════
#  PERSONEL DETAY (Ödeme Geçmişi)
# ═══════════════════════════════════════════════════════════════

@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_personel_odeme_gecmisi(request, personel_id):
    """Personelin tüm aylardaki ödeme geçmişi."""
    kurum_id, _ = _ctx(request)

    from apps.personel.domain.models import Personel
    try:
        personel = Personel.objects.get(pk=personel_id, kurum_id=kurum_id)
    except Personel.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı.'}, status=404)

    # Tüm hakedişler
    hakedisler = AylikHakedis.objects.filter(
        sozlesme__personel_id=personel_id,
        sozlesme__kurum_id=kurum_id,
    ).select_related('sozlesme', 'sozlesme__personel', 'sozlesme__egitim_yili').order_by('-yil', '-ay')

    # Avans kayıtları
    avans_svc = AvansService()
    avanslar = avans_svc.list_for_personel(personel_id, kurum_id)

    # Toplamlar
    agg = hakedisler.aggregate(
        toplam_brut=Sum('brut_toplam'),
        toplam_net=Sum('net_hakedis'),
        toplam_ders_saat=Sum('toplam_ders_saati'),
        toplam_avans=Sum('avans'),
    )

    odenen = hakedisler.filter(durum=HakedisDurumu.ODENDI)
    odenen_toplam = odenen.aggregate(t=Sum('net_hakedis'))['t'] or 0

    return JsonResponse({
        'success': True,
        'data': {
            'personel': {
                'id': personel.id,
                'ad': personel.ad,
                'soyad': personel.soyad,
                'tam_ad': personel.tam_ad,
                'fotograf': personel.fotograf.url if personel.fotograf else None,
            },
            'hakedisler': [_serialize_hakedis(h) for h in hakedisler],
            'avanslar': [_serialize_avans(a) for a in avanslar],
            'ozet': {
                'toplam_ay': hakedisler.count(),
                'toplam_brut': float(agg['toplam_brut'] or 0),
                'toplam_net': float(agg['toplam_net'] or 0),
                'toplam_ders_saat': float(agg['toplam_ders_saat'] or 0),
                'toplam_avans': float(agg['toplam_avans'] or 0),
                'toplam_odenen': float(odenen_toplam),
                'odenen_ay': odenen.count(),
            },
        },
    })


# ═══════════════════════════════════════════════════════════════
#  PDF EXPORT
# ═══════════════════════════════════════════════════════════════

def _register_turkish_fonts():
    """Türkçe karakter destekli fontları kaydet (Vera — reportlab ile gelir)."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import reportlab, os
    font_dir = os.path.join(os.path.dirname(reportlab.__file__), 'fonts')
    if 'Vera' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('Vera', os.path.join(font_dir, 'Vera.ttf')))
    if 'VeraBd' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('VeraBd', os.path.join(font_dir, 'VeraBd.ttf')))
    if 'VeraIt' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('VeraIt', os.path.join(font_dir, 'VeraIt.ttf')))
    if 'VeraBI' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('VeraBI', os.path.join(font_dir, 'VeraBI.ttf')))


def _default_logo_path():
    import os
    from pathlib import Path
    from django.conf import settings
    candidates = [
        Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'img' / '3k-logo.png',
        Path(settings.BASE_DIR) / 'static' / 'img' / '3k-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            return str(path)
    return None


def _kurum_primary_hex(kurum):
    if kurum and getattr(kurum, 'tema_rengi', None):
        c = str(kurum.tema_rengi).strip()
        if c and not c.startswith('#'):
            c = f'#{c}'
        if len(c) >= 4:
            return c
    return '#0262a7'


def _resolve_kurum_logo_path(kurum):
    import os
    if kurum and getattr(kurum, 'app_logo', None):
        try:
            path = kurum.app_logo.path
            if path and os.path.isfile(path):
                return path
        except (ValueError, AttributeError, OSError):
            pass
    return _default_logo_path()


def _bordro_header_flowables(kurum, title, subtitle, content_width_cm=15):
    """Markalı PDF üst bandı — kurum logosu ve tema rengi."""
    from reportlab.lib import colors
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import ParagraphStyle

    primary = colors.HexColor(_kurum_primary_hex(kurum))
    logo_path = _resolve_kurum_logo_path(kurum)
    kurum_ad = (kurum.ad if kurum else 'Kurum').strip()

    left_cell = Paragraph('', ParagraphStyle('Empty', fontName='Vera', fontSize=1))
    if logo_path:
        try:
            left_cell = Image(logo_path, width=2.1 * cm, height=2.1 * cm)
        except Exception:
            pass

    title_style = ParagraphStyle(
        'BordroTitle', fontName='VeraBd', fontSize=12,
        textColor=colors.white, leading=15,
    )
    sub_style = ParagraphStyle(
        'BordroSub', fontName='Vera', fontSize=9,
        textColor=colors.HexColor('#E2E8F0'), leading=12,
    )
    right = Paragraph(
        f'<font color="white"><b>{title}</b></font><br/>'
        f'<font size="9" color="#E2E8F0">{kurum_ad}</font><br/>'
        f'<font size="8" color="#CBD5E1">{subtitle}</font>',
        title_style,
    )

    header_tbl = Table(
        [[left_cell, right]],
        colWidths=[2.8 * cm, content_width_cm * cm],
    )
    header_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), primary),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 10),
        ('LEFTPADDING', (1, 0), (1, 0), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    return [header_tbl, Spacer(1, 7 * mm)], primary


def _styled_info_table(info_data):
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import Table, TableStyle

    tbl = Table(info_data, colWidths=[4.5 * cm, 10.5 * cm])
    tbl.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Vera'),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('FONTNAME', (0, 0), (0, -1), 'VeraBd'),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#475569')),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#0F172A')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('LINEBELOW', (0, 0), (-1, -2), 0.25, colors.HexColor('#E2E8F0')),
    ]))
    return tbl


def _bordro_header_paragraphs(labels):
    """Dar sütunlarda başlıkların üst üste binmemesi için satır kırılımlı Paragraph."""
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph

    style = ParagraphStyle(
        'BordroTh', fontName='VeraBd', fontSize=7, leading=8.5,
        textColor=colors.white, alignment=1,
    )
    short_map = {
        'Ders Saat': 'Ders<br/>Saat',
        'Ders Ücret': 'Ders<br/>Ücret',
        'F.Mesai': 'Fazla<br/>Mesai',
        'Ek Ödeme': 'Ek<br/>Ödeme',
    }
    cells = []
    for label in labels:
        text = short_map.get(label, label.replace(' ', '<br/>') if len(label) > 7 else label)
        cells.append(Paragraph(text, style))
    return cells


def _bordro_list_col_widths(content_cm=26.7):
    """Toplu bordro tablosu — sütun genişlikleri sayfa genişliğine orantılı."""
    from reportlab.lib.units import cm
    fractions = [0.17, 0.07, 0.07, 0.06, 0.07, 0.06, 0.06, 0.06, 0.06, 0.06, 0.08, 0.08, 0.07]
    return [content_cm * f * cm for f in fractions]


def _build_bordro_pdf_single(hakedis):
    """Tek bir hakediş için PDF oluştur — reportlab ile."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    _register_turkish_fonts()

    kurum = hakedis.sozlesme.kurum
    primary_hex = _kurum_primary_hex(kurum)
    primary = colors.HexColor(primary_hex)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=1.5*cm, bottomMargin=2*cm)

    normal = ParagraphStyle('TRNormal', fontName='Vera', fontSize=9)

    elements = []
    header, _ = _bordro_header_flowables(
        kurum,
        'MAAŞ BORDROSU',
        f'{hakedis.sozlesme.personel.tam_ad} — {_ay_adi(hakedis.ay)} {hakedis.yil}',
        content_width_cm=15,
    )
    elements.extend(header)

    info_data = [
        ['Personel', hakedis.sozlesme.personel.tam_ad],
        ['Sözleşme Türü', hakedis.sozlesme.get_sozlesme_turu_display()],
        ['Dönem', f'{_ay_adi(hakedis.ay)} {hakedis.yil}'],
        ['Durum', hakedis.get_durum_display()],
    ]
    if hakedis.odeme_tarihi:
        info_data.append(['Ödeme Tarihi', hakedis.odeme_tarihi.strftime('%d.%m.%Y')])

    elements.append(_styled_info_table(info_data))
    elements.append(Spacer(1, 8*mm))

    fmtp = lambda v: f'{float(v):,.2f} ₺'
    kalem_data = [
        ['Kalem', 'Tutar'],
        ['Aylık Maaş', fmtp(hakedis.sabit_maas)],
    ]
    if hakedis.toplam_ders_saati > 0:
        kalem_data.append(['Ders Saati', f'{float(hakedis.toplam_ders_saati)} saat × {fmtp(hakedis.ders_basi_ucret)}'])
        kalem_data.append(['Ders Ücreti Toplamı', fmtp(hakedis.ders_ucreti_toplam)])
    if hakedis.prim > 0:
        kalem_data.append(['Prim', fmtp(hakedis.prim)])
    if hakedis.fazla_mesai > 0:
        kalem_data.append(['Fazla Mesai', fmtp(hakedis.fazla_mesai)])
    if hakedis.ek_odeme > 0:
        kalem_data.append(['Ek Ödeme', fmtp(hakedis.ek_odeme)])

    kalem_data.append(['', ''])
    kalem_data.append(['Brüt Toplam', fmtp(hakedis.brut_toplam)])

    if hakedis.avans > 0:
        kalem_data.append(['(−) Avans', fmtp(hakedis.avans)])
    if hakedis.kesintiler > 0:
        kalem_data.append(['(−) Kesintiler', fmtp(hakedis.kesintiler)])

    kalem_data.append(['', ''])
    kalem_data.append(['NET ÖDEME', fmtp(hakedis.net_hakedis)])

    tbl = Table(kalem_data, colWidths=[8*cm, 7*cm])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, -1), 'Vera'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('FONTNAME', (0, -1), (-1, -1), 'VeraBd'),
        ('FONTNAME', (0, 0), (-1, 0), 'VeraBd'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#ECFDF5')),
        ('TEXTCOLOR', (0, -1), (0, -1), colors.HexColor('#047857')),
        ('TEXTCOLOR', (1, -1), (1, -1), colors.HexColor('#047857')),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F8FAFC')]),
    ]))
    elements.append(tbl)

    if hakedis.notlar:
        elements.append(Spacer(1, 6*mm))
        elements.append(Paragraph(f'<b>Notlar:</b> {hakedis.notlar}', normal))

    doc.build(elements)
    buf.seek(0)
    return buf


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_bordro_pdf_tekil(request, pk):
    """Tek bir hakediş için PDF indir."""
    hakedis = AylikHakedis.objects.select_related(
        'sozlesme', 'sozlesme__personel', 'sozlesme__kurum',
    ).filter(pk=pk).first()
    if not hakedis:
        return JsonResponse({'success': False, 'error': 'Hakediş bulunamadı.'}, status=404)

    try:
        buf = _build_bordro_pdf_single(hakedis)
    except ImportError:
        return JsonResponse({'success': False, 'error': 'PDF kütüphanesi (reportlab) yüklü değil.'}, status=500)

    personel_ad = hakedis.sozlesme.personel.tam_ad.replace(' ', '_')
    filename = f'bordro_{personel_ad}_{hakedis.ay}_{hakedis.yil}.pdf'

    response = HttpResponse(buf.read(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_bordro_pdf_toplu(request):
    """Belirli ay/yıl için tüm bordroları tek PDF'de birleştir."""
    kurum_id, _ = _ctx(request)
    yil = int(request.GET.get('yil', date.today().year))
    ay = int(request.GET.get('ay', date.today().month))

    hakedisler = AylikHakedis.objects.filter(
        sozlesme__kurum_id=kurum_id, yil=yil, ay=ay,
    ).select_related('sozlesme', 'sozlesme__personel', 'sozlesme__kurum').order_by('sozlesme__personel__soyad')

    if not hakedisler.exists():
        return JsonResponse({'success': False, 'error': 'Bu ay için hakediş bulunamadı.'}, status=404)

    from apps.kurum.domain.models import Kurum
    kurum = Kurum.objects.filter(pk=kurum_id).first()

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer

        _register_turkish_fonts()

        primary = colors.HexColor(_kurum_primary_hex(kurum))

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                                leftMargin=1.5*cm, rightMargin=1.5*cm,
                                topMargin=1.2*cm, bottomMargin=1.5*cm)

        elements = []
        header, _ = _bordro_header_flowables(
            kurum,
            'MAAŞ BORDROSU LİSTESİ',
            f'{_ay_adi(ay)} {yil} · {hakedisler.count()} personel',
            content_width_cm=24,
        )
        elements.extend(header)
        elements.append(Spacer(1, 3*mm))

        fmtp = lambda v: f'{float(v):,.2f}'

        # Tablo başlıkları
        table_header_labels = [
            'Personel', 'Tür', 'Maaş', 'Ders Saat', 'Ders Ücret',
            'Prim', 'F.Mesai', 'Ek Ödeme', 'Avans', 'Kesinti',
            'Brüt', 'Net', 'Durum',
        ]
        data = [_bordro_header_paragraphs(table_header_labels)]
        toplam_brut = toplam_net = 0
        for h in hakedisler:
            data.append([
                h.sozlesme.personel.tam_ad,
                h.sozlesme.get_sozlesme_turu_display()[:10],
                fmtp(h.sabit_maas),
                str(float(h.toplam_ders_saati)),
                fmtp(h.ders_ucreti_toplam),
                fmtp(h.prim) if h.prim > 0 else '-',
                fmtp(h.fazla_mesai) if h.fazla_mesai > 0 else '-',
                fmtp(h.ek_odeme) if h.ek_odeme > 0 else '-',
                fmtp(h.avans) if h.avans > 0 else '-',
                fmtp(h.kesintiler) if h.kesintiler > 0 else '-',
                fmtp(h.brut_toplam),
                fmtp(h.net_hakedis),
                h.get_durum_display(),
            ])
            toplam_brut += float(h.brut_toplam)
            toplam_net += float(h.net_hakedis)

        # Toplam satırı
        data.append([
            f'TOPLAM ({hakedisler.count()} kişi)', '', '', '', '', '', '', '', '', '',
            fmtp(toplam_brut), fmtp(toplam_net), '',
        ])

        col_widths = _bordro_list_col_widths(26.7)
        tbl = Table(data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), primary),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 1), (-1, -1), 'Vera'),
            ('FONTSIZE', (0, 1), (-1, -1), 7.5),
            ('FONTNAME', (0, 0), (-1, 0), 'VeraBd'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
            ('ALIGN', (0, 1), (1, -1), 'LEFT'),
            ('FONTNAME', (0, -1), (-1, -1), 'VeraBd'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#ECFDF5')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F8FAFC')]),
        ]))
        elements.append(tbl)

        doc.build(elements)
        buf.seek(0)

    except ImportError:
        return JsonResponse({'success': False, 'error': 'PDF kütüphanesi (reportlab) yüklü değil.'}, status=500)

    filename = f'bordro_listesi_{ay}_{yil}.pdf'
    response = HttpResponse(buf.read(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ═══════════════════════════════════════════════════════════════
#  FİNANS ENTEGRASYONU — Maaş Giderleri
# ═══════════════════════════════════════════════════════════════

@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['POST'])
def api_maas_gider_kaydet(request):
    """
    Aylık bordroyu finans modülüne gider olarak kaydet.
    Body: { yil, ay, gider_kategorisi_id, (opsiyonel) mali_hesap_id, odeme_yontemi_id }
    Her ödendi durumundaki hakediş için ayrı GiderKaydi oluşturulur.
    """
    kurum_id, ey_id = _ctx(request)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    yil = body.get('yil')
    ay = body.get('ay')
    gider_kategorisi_id = body.get('gider_kategorisi_id')

    if not all([yil, ay, gider_kategorisi_id]):
        return JsonResponse({'success': False, 'error': 'yil, ay ve gider_kategorisi_id zorunludur.'}, status=400)

    yil, ay = int(yil), int(ay)

    # Ödendi durumundaki hakedişler
    hakedisler = AylikHakedis.objects.filter(
        sozlesme__kurum_id=kurum_id,
        sozlesme__egitim_yili_id=ey_id,
        yil=yil,
        ay=ay,
        durum=HakedisDurumu.ODENDI,
    ).select_related('sozlesme', 'sozlesme__personel')

    if not hakedisler.exists():
        return JsonResponse({
            'success': False,
            'error': f'{_ay_adi(ay)} {yil} için ödendi durumunda hakediş bulunamadı.',
        }, status=400)

    try:
        from apps.finans.domain.gider_kaydi import GiderKaydi, GiderKategorisi
        from apps.kurum.domain.models import Kurum
    except ImportError:
        return JsonResponse({
            'success': False,
            'error': 'Finans modülü bulunamadı.',
        }, status=500)

    kurum = Kurum.objects.filter(id=kurum_id).first()
    if not kurum:
        return JsonResponse({'success': False, 'error': 'Kurum bulunamadı.'}, status=404)

    kategori = GiderKategorisi.objects.filter(id=gider_kategorisi_id).first()
    if not kategori:
        return JsonResponse({'success': False, 'error': 'Gider kategorisi bulunamadı.'}, status=404)

    mali_hesap_id = body.get('mali_hesap_id')
    odeme_yontemi_id = body.get('odeme_yontemi_id')
    fatura_tarihi = body.get('fatura_tarihi', date.today().isoformat())

    created_giderler = []
    for h in hakedisler:
        tutar = h.brut_toplam
        if tutar <= 0:
            continue

        aciklama = f'{h.sozlesme.personel.tam_ad} — {_ay_adi(ay)} {yil} Maaş Gideri'

        gider_data = {
            'kurum': kurum,
            'gider_kategorisi': kategori,
            'fatura_tarihi': fatura_tarihi,
            'vade_tarihi': fatura_tarihi,
            'brut_tutar': tutar,
            'kdv_orani': 0,
            'aciklama': aciklama,
            'durum': 'onaylandi',
        }
        if mali_hesap_id:
            gider_data['mali_hesap_id'] = mali_hesap_id
        if odeme_yontemi_id:
            gider_data['odeme_yontemi_id'] = odeme_yontemi_id

        gider = GiderKaydi(**gider_data)
        gider.kdv_tutar = Decimal('0.00')
        gider.net_tutar = tutar
        gider.save()
        created_giderler.append({
            'id': gider.id,
            'personel': h.sozlesme.personel.tam_ad,
            'tutar': float(tutar),
        })

    return JsonResponse({
        'success': True,
        'data': {
            'olusturulan': len(created_giderler),
            'giderler': created_giderler,
            'toplam': sum(g['tutar'] for g in created_giderler),
        },
    })


@csrf_exempt
@require_module_permission("personel", manage_only=True)
@require_http_methods(['GET'])
def api_gider_kategorileri(request):
    """Finans modülündeki gider kategorilerini döndür."""
    kurum_id, _ = _ctx(request)

    try:
        from apps.finans.domain.gider_kaydi import GiderKategorisi
    except ImportError:
        return JsonResponse({
            'success': True,
            'data': [],
        })

    kategoriler = GiderKategorisi.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True,
    ).order_by('sira', 'ad').values('id', 'ad', 'ikon', 'renk', 'ust_kategori_id')

    return JsonResponse({
        'success': True,
        'data': list(kategoriler),
    })
