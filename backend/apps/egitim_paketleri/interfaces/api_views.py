"""Egitim Paketleri REST API Views

Integer-Only: Tüm fiyatlar tam sayı (TL). Decimal KULLANILMAZ.
Modeldeki brut_fiyat = KDV dahil fiyat. net_fiyat ve kdv_tutari otomatik hesaplanır.
"""
import json
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from apps.egitim_paketleri.application.services import (
    GrupDersiService, OzelDersService, DenemeService, EkHizmetService
)
from apps.egitim_paketleri.interfaces.sube_context import (
    assert_paket_record_access,
    mandatory_paket_context,
)
from apps.egitim_tanimlari.models import SinifSeviyesi, Alan, Ders
from shared.context import get_secili_egitim_yili_id


def get_kurum_sube_context(request):
    """Zorunlu kurum + şube bağlamı. Hata durumunda request._paket_ctx_error set edilir."""
    ctx, err = mandatory_paket_context(request)
    if err:
        request._paket_ctx_error = err
        return None, None, None
    return ctx['kurum_id'], ctx['sube_id'], ctx['egitim_yili_id']


def _paket_ctx_error_response(request):
    return getattr(request, '_paket_ctx_error', None)


def _require_paket_record(request, record):
    ctx, err = mandatory_paket_context(request)
    if err:
        return None, err
    denied = assert_paket_record_access(request, ctx['kurum_id'], record)
    if denied:
        return None, denied
    return ctx, None


@method_decorator(csrf_exempt, name='dispatch')
class GrupDersiListCreateView(View):
    """Grup Dersi List ve Create API"""
    
    def get(self, request):
        kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        service = GrupDersiService()
        grup_dersleri = service.get_all(kurum_id, sube_id, egitim_yili_id)
        
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': p.id,
                    'ad': p.ad,
                    'kod': p.kod,
                    'fiyat': p.brut_fiyat,
                    'kdv_orani': p.kdv_orani,
                    'kdv_dahil_fiyat': p.brut_fiyat,
                    'net_fiyat': p.net_fiyat,
                    'kdv_tutari': p.kdv_tutari,
                    'aktif_mi': p.aktif_mi,
                    'aciklama': p.aciklama or '',
                    'sinif_seviyeleri': [{'id': s.id, 'ad': s.ad} for s in p.sinif_seviyeleri.all()],
                    'alan': {'id': p.alan_id, 'ad': p.alan.ad} if p.alan else None,
                    'dersler': [{'id': d.id, 'ad': d.ad} for d in p.dersler.all()],
                    'dahil_ek_hizmetler': [
                        {'id': h.id, 'ad': h.ad, 'hizmet_turu': h.hizmet_turu, 'fiyat': h.brut_fiyat}
                        for h in p.dahil_ek_hizmetler.all()
                    ],
                    'dahil_denemeler': [
                        {'id': d.id, 'ad': d.ad, 'deneme_sayisi': d.deneme_sayisi, 'fiyat': d.brut_fiyat}
                        for d in p.dahil_denemeler.all()
                    ],
                }
                for p in grup_dersleri
            ]
        })
    
    def post(self, request):
        try:
            data = json.loads(request.body)
            service = GrupDersiService()
            kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
            if err := _paket_ctx_error_response(request):
                return err
            
            create_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'egitim_yili_id': egitim_yili_id,
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'alan_id': data.get('alan_id'),
                'dersler_ids': data.get('dersler_ids', []),
                'dahil_ek_hizmetler_ids': data.get('dahil_ek_hizmetler_ids', []),
                'dahil_denemeler_ids': data.get('dahil_denemeler_ids', []),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            
            grup_dersi, errors = service.create(create_data)
            
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            
            return JsonResponse({
                'success': True,
                'data': {'id': grup_dersi.id, 'ad': grup_dersi.ad, 'kod': grup_dersi.kod}
            }, status=201)
            
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class GrupDersiDetailView(View):
    """Grup Dersi Detail, Update, Delete API"""
    
    def get(self, request, pk):
        service = GrupDersiService()
        p = service.get_by_id(pk)
        _, err = _require_paket_record(request, p)
        if err:
            return err
        
        return JsonResponse({
            'success': True,
            'data': {
                'id': p.id, 'ad': p.ad, 'kod': p.kod,
                'sinif_seviyeleri_ids': list(p.sinif_seviyeleri.values_list('id', flat=True)),
                'alan_id': p.alan_id,
                'dersler_ids': list(p.dersler.values_list('id', flat=True)),
                'dahil_ek_hizmetler_ids': list(p.dahil_ek_hizmetler.values_list('id', flat=True)),
                'dahil_denemeler_ids': list(p.dahil_denemeler.values_list('id', flat=True)),
                'fiyat': p.brut_fiyat,
                'kdv_orani': p.kdv_orani,
                'kdv_dahil_fiyat': p.brut_fiyat,
                'net_fiyat': p.net_fiyat,
                'kdv_tutari': p.kdv_tutari,
                'aciklama': p.aciklama or '',
                'aktif_mi': p.aktif_mi,
            }
        })
    
    def put(self, request, pk):
        try:
            service = GrupDersiService()
            p = service.get_by_id(pk)
            _, err = _require_paket_record(request, p)
            if err:
                return err
            data = json.loads(request.body)
            
            update_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'alan_id': data.get('alan_id'),
                'dersler_ids': data.get('dersler_ids', []),
                'dahil_ek_hizmetler_ids': data.get('dahil_ek_hizmetler_ids', []),
                'dahil_denemeler_ids': data.get('dahil_denemeler_ids', []),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            
            grup_dersi, errors = service.update(pk, update_data)
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            return JsonResponse({'success': True, 'data': {'id': grup_dersi.id, 'ad': grup_dersi.ad}})
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    
    def delete(self, request, pk):
        service = GrupDersiService()
        p = service.get_by_id(pk)
        _, err = _require_paket_record(request, p)
        if err:
            return err
        success, errors = service.delete(pk)
        if errors:
            return JsonResponse({'success': False, 'error': errors}, status=400)
        return JsonResponse({'success': True})


@method_decorator(csrf_exempt, name='dispatch')
class OzelDersListCreateView(View):
    """Özel Ders List ve Create API"""
    
    def get(self, request):
        service = OzelDersService()
        kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        ozel_dersler = service.get_all(kurum_id, sube_id, egitim_yili_id)
        
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': p.id, 'ad': p.ad, 'kod': p.kod,
                    'fiyat': p.brut_fiyat,
                    'kdv_orani': p.kdv_orani,
                    'kdv_dahil_fiyat': p.brut_fiyat,
                    'net_fiyat': p.net_fiyat,
                    'kdv_tutari': p.kdv_tutari,
                    'aktif_mi': p.aktif_mi,
                    'aciklama': p.aciklama or '',
                    'alan': {'id': p.alan_id, 'ad': p.alan.ad} if p.alan else None,
                    'sinif_seviyeleri': [{'id': s.id, 'ad': s.ad} for s in p.sinif_seviyeleri.all()],
                    'dersler': [{'id': d.id, 'ad': d.ad} for d in p.dersler.all()],
                }
                for p in ozel_dersler
            ]
        })
    
    def post(self, request):
        try:
            data = json.loads(request.body)
            service = OzelDersService()
            kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
            if err := _paket_ctx_error_response(request):
                return err
            
            create_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'egitim_yili_id': egitim_yili_id,
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'alan_id': data.get('alan_id'),
                'dersler_ids': data.get('dersler_ids', []),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            
            ozel_ders, errors = service.create(create_data)
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            return JsonResponse({'success': True, 'data': {'id': ozel_ders.id, 'ad': ozel_ders.ad, 'kod': ozel_ders.kod}}, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class OzelDersDetailView(View):
    """Özel Ders Detail, Update, Delete API"""
    
    def get(self, request, pk):
        service = OzelDersService()
        p = service.get_by_id(pk)
        _, err = _require_paket_record(request, p)
        if err:
            return err
        return JsonResponse({
            'success': True,
            'data': {
                'id': p.id, 'ad': p.ad, 'kod': p.kod,
                'sinif_seviyeleri_ids': list(p.sinif_seviyeleri.values_list('id', flat=True)),
                'alan_id': p.alan_id,
                'dersler_ids': list(p.dersler.values_list('id', flat=True)),
                'fiyat': p.brut_fiyat,
                'kdv_orani': p.kdv_orani,
                'kdv_dahil_fiyat': p.brut_fiyat,
                'net_fiyat': p.net_fiyat,
                'kdv_tutari': p.kdv_tutari,
                'aciklama': p.aciklama or '',
                'aktif_mi': p.aktif_mi,
            }
        })
    
    def put(self, request, pk):
        try:
            service = OzelDersService()
            p = service.get_by_id(pk)
            _, err = _require_paket_record(request, p)
            if err:
                return err
            data = json.loads(request.body)
            update_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'alan_id': data.get('alan_id'),
                'dersler_ids': data.get('dersler_ids', []),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            ozel_ders, errors = service.update(pk, update_data)
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            return JsonResponse({'success': True, 'data': {'id': ozel_ders.id, 'ad': ozel_ders.ad}})
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    
    def delete(self, request, pk):
        service = OzelDersService()
        p = service.get_by_id(pk)
        _, err = _require_paket_record(request, p)
        if err:
            return err
        success, errors = service.delete(pk)
        if errors:
            return JsonResponse({'success': False, 'error': errors}, status=400)
        return JsonResponse({'success': True})


@method_decorator(csrf_exempt, name='dispatch')
class DenemeListCreateView(View):
    """Deneme List ve Create API"""
    
    def get(self, request):
        service = DenemeService()
        kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        denemeler = service.get_all(kurum_id, sube_id, egitim_yili_id)
        
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': d.id, 'ad': d.ad, 'kod': d.kod,
                    'deneme_sayisi': d.deneme_sayisi,
                    'fiyat': d.brut_fiyat,
                    'kdv_orani': d.kdv_orani,
                    'kdv_dahil_fiyat': d.brut_fiyat,
                    'net_fiyat': d.net_fiyat,
                    'kdv_tutari': d.kdv_tutari,
                    'aktif_mi': d.aktif_mi,
                    'aciklama': d.aciklama or '',
                    'sinif_seviyeleri': [{'id': s.id, 'ad': s.ad} for s in d.sinif_seviyeleri.all()],
                }
                for d in denemeler
            ]
        })
    
    def post(self, request):
        try:
            data = json.loads(request.body)
            service = DenemeService()
            kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
            if err := _paket_ctx_error_response(request):
                return err
            
            create_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'egitim_yili_id': egitim_yili_id,
                'deneme_sayisi': data.get('deneme_sayisi', 1),
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            
            deneme, errors = service.create(create_data)
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            return JsonResponse({'success': True, 'data': {'id': deneme.id, 'ad': deneme.ad, 'kod': deneme.kod}}, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class DenemeDetailView(View):
    """Deneme Detail, Update, Delete API"""
    
    def get(self, request, pk):
        service = DenemeService()
        d = service.get_by_id(pk)
        _, err = _require_paket_record(request, d)
        if err:
            return err
        return JsonResponse({
            'success': True,
            'data': {
                'id': d.id, 'ad': d.ad, 'kod': d.kod,
                'deneme_sayisi': d.deneme_sayisi,
                'sinif_seviyeleri_ids': list(d.sinif_seviyeleri.values_list('id', flat=True)),
                'fiyat': d.brut_fiyat,
                'kdv_orani': d.kdv_orani,
                'kdv_dahil_fiyat': d.brut_fiyat,
                'net_fiyat': d.net_fiyat,
                'kdv_tutari': d.kdv_tutari,
                'aciklama': d.aciklama or '',
                'aktif_mi': d.aktif_mi,
            }
        })
    
    def put(self, request, pk):
        try:
            service = DenemeService()
            d = service.get_by_id(pk)
            _, err = _require_paket_record(request, d)
            if err:
                return err
            data = json.loads(request.body)
            update_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'deneme_sayisi': data.get('deneme_sayisi', 1),
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            deneme, errors = service.update(pk, update_data)
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            return JsonResponse({'success': True, 'data': {'id': deneme.id, 'ad': deneme.ad}})
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    
    def delete(self, request, pk):
        service = DenemeService()
        d = service.get_by_id(pk)
        _, err = _require_paket_record(request, d)
        if err:
            return err
        success, errors = service.delete(pk)
        if errors:
            return JsonResponse({'success': False, 'error': errors}, status=400)
        return JsonResponse({'success': True})


@method_decorator(csrf_exempt, name='dispatch')
class ReferansVerilerView(View):
    """Form için referans verileri"""
    
    def get(self, request):
        kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        sinif_seviyeleri = SinifSeviyesi.objects.filter(sube_id=sube_id, aktif_mi=True).order_by('sira', 'ad')
        alanlar = Alan.objects.filter(sube_id=sube_id, aktif_mi=True).order_by('sira', 'ad')
        dersler = Ders.objects.filter(sube_id=sube_id, aktif_mi=True).order_by('ad')
        
        return JsonResponse({
            'success': True,
            'data': {
                'sinif_seviyeleri': [{'id': s.id, 'ad': s.ad} for s in sinif_seviyeleri],
                'alanlar': [{'id': a.id, 'ad': a.ad} for a in alanlar],
                'dersler': [{'id': d.id, 'ad': d.ad} for d in dersler],
                'ek_hizmetler': [
                    {'id': h.id, 'ad': h.ad, 'hizmet_turu': h.hizmet_turu, 'fiyat': h.brut_fiyat}
                    for h in EkHizmetService().get_active(kurum_id, sube_id, egitim_yili_id)
                ],
                'denemeler': [
                    {'id': d.id, 'ad': d.ad, 'kod': d.kod, 'deneme_sayisi': d.deneme_sayisi, 'fiyat': d.brut_fiyat}
                    for d in DenemeService().get_active(kurum_id, sube_id, egitim_yili_id)
                ],
            }
        })


@method_decorator(csrf_exempt, name='dispatch')
class EkHizmetListCreateView(View):
    """Ek Hizmet List ve Create API"""
    
    def get(self, request):
        service = EkHizmetService()
        kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        ek_hizmetler = service.get_all(kurum_id, sube_id, egitim_yili_id)
        
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': h.id, 'ad': h.ad, 'kod': h.kod,
                    'hizmet_turu': h.hizmet_turu,
                    'hizmet_turu_display': h.get_hizmet_turu_display(),
                    'fiyat': h.brut_fiyat,
                    'kdv_orani': h.kdv_orani,
                    'kdv_dahil_fiyat': h.brut_fiyat,
                    'net_fiyat': h.net_fiyat,
                    'kdv_tutari': h.kdv_tutari,
                    'aktif_mi': h.aktif_mi,
                    'aciklama': h.aciklama or '',
                    'sinif_seviyeleri': [{'id': s.id, 'ad': s.ad} for s in h.sinif_seviyeleri.all()],
                    'deneme_paketi': {
                        'id': h.deneme_paketi.id,
                        'ad': h.deneme_paketi.ad,
                        'deneme_sayisi': h.deneme_paketi.deneme_sayisi,
                    } if h.deneme_paketi else None,
                }
                for h in ek_hizmetler
            ]
        })
    
    def post(self, request):
        try:
            data = json.loads(request.body)
            service = EkHizmetService()
            kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
            if err := _paket_ctx_error_response(request):
                return err
            
            create_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'hizmet_turu': data.get('hizmet_turu'),
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'egitim_yili_id': egitim_yili_id,
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'deneme_paketi_id': data.get('deneme_paketi_id'),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            
            ek_hizmet, errors = service.create(create_data)
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            return JsonResponse({
                'success': True,
                'data': {'id': ek_hizmet.id, 'ad': ek_hizmet.ad, 'kod': ek_hizmet.kod, 'hizmet_turu': ek_hizmet.hizmet_turu}
            }, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class EkHizmetDetailView(View):
    """Ek Hizmet Detail, Update, Delete API"""
    
    def get(self, request, pk):
        service = EkHizmetService()
        h = service.get_by_id(pk)
        _, err = _require_paket_record(request, h)
        if err:
            return err
        return JsonResponse({
            'success': True,
            'data': {
                'id': h.id, 'ad': h.ad, 'kod': h.kod,
                'hizmet_turu': h.hizmet_turu,
                'sinif_seviyeleri_ids': list(h.sinif_seviyeleri.values_list('id', flat=True)),
                'deneme_paketi_id': h.deneme_paketi_id,
                'fiyat': h.brut_fiyat,
                'kdv_orani': h.kdv_orani,
                'kdv_dahil_fiyat': h.brut_fiyat,
                'net_fiyat': h.net_fiyat,
                'kdv_tutari': h.kdv_tutari,
                'aciklama': h.aciklama or '',
                'aktif_mi': h.aktif_mi,
            }
        })
    
    def put(self, request, pk):
        try:
            service = EkHizmetService()
            h = service.get_by_id(pk)
            _, err = _require_paket_record(request, h)
            if err:
                return err
            data = json.loads(request.body)
            update_data = {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'hizmet_turu': data.get('hizmet_turu'),
                'sinif_seviyeleri_ids': data.get('sinif_seviyeleri_ids', []),
                'deneme_paketi_id': data.get('deneme_paketi_id'),
                'brut_fiyat': int(data.get('brut_fiyat', data.get('fiyat', 0))),
                'kdv_orani': int(data.get('kdv_orani', 10)),
                'aciklama': data.get('aciklama', ''),
                'aktif_mi': data.get('aktif_mi', True),
            }
            ek_hizmet, errors = service.update(pk, update_data)
            if errors:
                return JsonResponse({'success': False, 'error': errors}, status=400)
            return JsonResponse({'success': True, 'data': {'id': ek_hizmet.id, 'ad': ek_hizmet.ad}})
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    
    def delete(self, request, pk):
        service = EkHizmetService()
        h = service.get_by_id(pk)
        _, err = _require_paket_record(request, h)
        if err:
            return err
        success, errors = service.delete(pk)
        if errors:
            return JsonResponse({'success': False, 'error': errors}, status=400)
        return JsonResponse({'success': True})


# =============================================
# Ek Hizmet Satış API
# =============================================

@method_decorator(csrf_exempt, name='dispatch')
class EkHizmetSatisView(View):
    """Kayıtlı öğrenciye ek hizmet satışı — Integer-Only"""
    
    def post(self, request):
        try:
            from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet
            from apps.egitim_paketleri.models import EkHizmet, Deneme
            
            data = json.loads(request.body)
            ogrenci_id = data.get('ogrenci_id')
            ek_hizmet_id = data.get('ek_hizmet_id')
            deneme_paketi_id = data.get('deneme_paketi_id')
            fiyat = data.get('fiyat')
            
            if not ogrenci_id:
                return JsonResponse({'success': False, 'error': 'Öğrenci seçilmedi'}, status=400)
            if not ek_hizmet_id and not deneme_paketi_id:
                return JsonResponse({'success': False, 'error': 'Ek hizmet veya deneme paketi seçilmedi'}, status=400)
            
            try:
                ogrenci = Ogrenci.objects.get(id=ogrenci_id)
            except Ogrenci.DoesNotExist:
                return JsonResponse({'success': False, 'error': 'Öğrenci bulunamadı'}, status=404)
            
            kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
            if err := _paket_ctx_error_response(request):
                return err
            
            if deneme_paketi_id:
                try:
                    deneme_paketi = Deneme.objects.get(id=deneme_paketi_id, aktif_mi=True)
                except Deneme.DoesNotExist:
                    return JsonResponse({'success': False, 'error': 'Deneme paketi bulunamadı'}, status=404)
                
                ek_hizmet = EkHizmet.objects.filter(
                    deneme_paketi=deneme_paketi,
                    sube_id=sube_id,
                    egitim_yili_id=egitim_yili_id,
                    aktif_mi=True,
                ).first()
                
                if not ek_hizmet:
                    ek_hizmet = EkHizmet.objects.create(
                        ad=f"Deneme — {deneme_paketi.ad}",
                        kod=f"DNM_{deneme_paketi.kod}",
                        hizmet_turu='deneme',
                        kurum_id=kurum_id,
                        sube_id=sube_id,
                        egitim_yili_id=egitim_yili_id,
                        deneme_paketi=deneme_paketi,
                        brut_fiyat=deneme_paketi.brut_fiyat,
                        kdv_orani=deneme_paketi.kdv_orani,
                        aktif_mi=True,
                    )
                    ek_hizmet.sinif_seviyeleri.set(deneme_paketi.sinif_seviyeleri.all())
                
                satis_fiyat = int(fiyat) if fiyat is not None else deneme_paketi.brut_fiyat
            else:
                service = EkHizmetService()
                ek_hizmet = service.get_by_id(ek_hizmet_id)
                if not ek_hizmet:
                    return JsonResponse({'success': False, 'error': 'Ek hizmet bulunamadı'}, status=404)
                if not ek_hizmet.aktif_mi:
                    return JsonResponse({'success': False, 'error': 'Bu ek hizmet aktif değil'}, status=400)
                satis_fiyat = int(fiyat) if fiyat is not None else ek_hizmet.brut_fiyat
            
            # Mükerrer kontrol
            if OgrenciEkHizmet.objects.filter(ogrenci=ogrenci, ek_hizmet=ek_hizmet, aktif_mi=True).exists():
                return JsonResponse({
                    'success': False, 
                    'error': f'Bu öğrenci zaten "{ek_hizmet.ad}" hizmetine kayıtlı'
                }, status=400)
            
            ogrenci_ek_hizmet = OgrenciEkHizmet.objects.create(
                ogrenci=ogrenci,
                ek_hizmet=ek_hizmet,
                fiyat=satis_fiyat,
                dahil_mi=False,
                kaynak_paket_turu='bireysel',
                egitim_yili_id=egitim_yili_id,
                aktif_mi=True,
            )
            
            return JsonResponse({
                'success': True,
                'data': {
                    'id': ogrenci_ek_hizmet.id,
                    'ogrenci_ad': ogrenci.tam_ad,
                    'hizmet_ad': ek_hizmet.ad,
                    'fiyat': satis_fiyat,
                    'kdv_orani': ek_hizmet.kdv_orani,
                    'kdv_dahil_fiyat': satis_fiyat,  # brut_fiyat zaten KDV dahil
                },
                'message': f'"{ek_hizmet.ad}" hizmeti {ogrenci.tam_ad} öğrencisine başarıyla atandı'
            }, status=201)
            
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class OgrenciEkHizmetListView(View):
    """Bir öğrencinin mevcut ek hizmetlerini listele"""
    
    def get(self, request, ogrenci_id):
        from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet
        
        try:
            ogrenci = Ogrenci.objects.get(id=ogrenci_id)
        except Ogrenci.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Öğrenci bulunamadı'}, status=404)
        
        hizmetler = OgrenciEkHizmet.objects.filter(
            ogrenci=ogrenci
        ).select_related('ek_hizmet', 'egitim_yili').order_by('-created_at')
        
        return JsonResponse({
            'success': True,
            'data': {
                'ogrenci': {'id': ogrenci.id, 'tam_ad': ogrenci.tam_ad},
                'hizmetler': [
                    {
                        'id': h.id,
                        'ek_hizmet_id': h.ek_hizmet_id,
                        'ek_hizmet_ad': h.ek_hizmet.ad,
                        'hizmet_turu': h.ek_hizmet.hizmet_turu,
                        'hizmet_turu_display': h.ek_hizmet.get_hizmet_turu_display(),
                        'fiyat': h.fiyat,
                        'dahil_mi': h.dahil_mi,
                        'kaynak_paket_turu': h.kaynak_paket_turu or '',
                        'aktif_mi': h.aktif_mi,
                        'egitim_yili': str(h.egitim_yili) if h.egitim_yili else '',
                        'created_at': h.created_at.strftime('%d.%m.%Y') if h.created_at else '',
                    }
                    for h in hizmetler
                ]
            }
        })


@method_decorator(csrf_exempt, name='dispatch')
class EkHizmetSatisIptalView(View):
    """Ek hizmet satışını iptal et"""
    
    def delete(self, request, pk):
        from apps.ogrenci.domain.models import OgrenciEkHizmet
        try:
            kayit = OgrenciEkHizmet.objects.get(id=pk)
        except OgrenciEkHizmet.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Kayıt bulunamadı'}, status=404)
        if kayit.dahil_mi:
            return JsonResponse({'success': False, 'error': 'Pakete dahil olan hizmetler iptal edilemez'}, status=400)
        kayit.aktif_mi = False
        kayit.save(update_fields=['aktif_mi'])
        return JsonResponse({'success': True, 'message': f'"{kayit.ek_hizmet.ad}" hizmeti iptal edildi'})


@method_decorator(csrf_exempt, name='dispatch')
class OgrenciAraView(View):
    """Ek hizmet satışı için öğrenci arama"""
    
    def get(self, request):
        from apps.ogrenci.domain.models import Ogrenci
        q = request.GET.get('q', '').strip()
        if len(q) < 2:
            return JsonResponse({'success': True, 'data': []})
        
        kurum_id, sube_id, _ = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        ogrenciler = Ogrenci.objects.filter(aktif_mi=True).select_related('sinif_seviyesi')
        if kurum_id:
            ogrenciler = ogrenciler.filter(kurum_id=kurum_id)
        if sube_id:
            ogrenciler = ogrenciler.filter(sube_id=sube_id)
        
        from django.db.models import Q
        ogrenciler = ogrenciler.filter(
            Q(ad__icontains=q) | Q(soyad__icontains=q) | Q(tc_kimlik_no__icontains=q)
        )[:20]
        
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': o.id,
                    'tam_ad': o.tam_ad,
                    'tc_kimlik_no': o.tc_kimlik_no[:3] + '***' + o.tc_kimlik_no[-3:] if o.tc_kimlik_no and len(o.tc_kimlik_no) >= 6 else '',
                    'sinif_seviyesi': o.sinif_seviyesi.ad if o.sinif_seviyesi else '',
                }
                for o in ogrenciler
            ]
        })


@method_decorator(csrf_exempt, name='dispatch')
class UygunEkHizmetlerView(View):
    """Bir öğrenci için uygun ek hizmetleri listele"""
    
    def get(self, request, ogrenci_id):
        from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet
        try:
            ogrenci = Ogrenci.objects.select_related('sinif_seviyesi').get(id=ogrenci_id)
        except Ogrenci.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Öğrenci bulunamadı'}, status=404)
        
        kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        service = EkHizmetService()
        ek_hizmetler = service.get_active(kurum_id, sube_id, egitim_yili_id)
        
        mevcut_hizmet_ids = set(
            OgrenciEkHizmet.objects.filter(ogrenci=ogrenci, aktif_mi=True).values_list('ek_hizmet_id', flat=True)
        )
        
        uygun_hizmetler = []
        for h in ek_hizmetler:
            if h.id in mevcut_hizmet_ids:
                continue
            hizmet_seviyeleri = set(h.sinif_seviyeleri.values_list('id', flat=True))
            if hizmet_seviyeleri and ogrenci.sinif_seviyesi_id not in hizmet_seviyeleri:
                continue
            uygun_hizmetler.append({
                'id': h.id, 'ad': h.ad, 'kod': h.kod,
                'hizmet_turu': h.hizmet_turu,
                'hizmet_turu_display': h.get_hizmet_turu_display(),
                'fiyat': h.brut_fiyat,
                'kdv_orani': h.kdv_orani,
                'kdv_dahil_fiyat': h.brut_fiyat,
                'aciklama': h.aciklama or '',
                'deneme_paketi': {
                    'id': h.deneme_paketi.id,
                    'ad': h.deneme_paketi.ad,
                    'deneme_sayisi': h.deneme_paketi.deneme_sayisi,
                } if h.deneme_paketi else None,
            })
        
        return JsonResponse({
            'success': True,
            'data': {
                'ogrenci': {
                    'id': ogrenci.id, 'tam_ad': ogrenci.tam_ad,
                    'sinif_seviyesi': ogrenci.sinif_seviyesi.ad if ogrenci.sinif_seviyesi else '',
                },
                'uygun_hizmetler': uygun_hizmetler,
            }
        })


@method_decorator(csrf_exempt, name='dispatch')
class UygunDenemePaketleriView(View):
    """Bir öğrenci için uygun deneme paketlerini listele"""

    def get(self, request, ogrenci_id):
        from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet

        try:
            ogrenci = Ogrenci.objects.select_related('sinif_seviyesi').get(id=ogrenci_id)
        except Ogrenci.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Öğrenci bulunamadı'}, status=404)

        kurum_id, sube_id, egitim_yili_id = get_kurum_sube_context(request)
        if err := _paket_ctx_error_response(request):
            return err
        service = DenemeService()
        denemeler = service.get_active(kurum_id, sube_id, egitim_yili_id)

        mevcut_deneme_paketi_ids = set(
            OgrenciEkHizmet.objects.filter(
                ogrenci=ogrenci, aktif_mi=True,
                ek_hizmet__hizmet_turu='deneme',
                ek_hizmet__deneme_paketi__isnull=False,
            ).values_list('ek_hizmet__deneme_paketi_id', flat=True)
        )

        uygun_paketler = []
        for d in denemeler:
            if d.id in mevcut_deneme_paketi_ids:
                continue
            paket_seviyeleri = set(d.sinif_seviyeleri.values_list('id', flat=True))
            if paket_seviyeleri and ogrenci.sinif_seviyesi_id not in paket_seviyeleri:
                continue
            uygun_paketler.append({
                'id': d.id, 'ad': d.ad, 'kod': d.kod,
                'deneme_sayisi': d.deneme_sayisi,
                'fiyat': d.brut_fiyat,
                'kdv_orani': d.kdv_orani,
                'kdv_dahil_fiyat': d.brut_fiyat,
                'aciklama': d.aciklama or '',
                'sinif_seviyeleri': [{'id': s.id, 'ad': s.ad} for s in d.sinif_seviyeleri.all()],
            })

        return JsonResponse({
            'success': True,
            'data': {
                'ogrenci': {
                    'id': ogrenci.id, 'tam_ad': ogrenci.tam_ad,
                    'sinif_seviyesi': ogrenci.sinif_seviyesi.ad if ogrenci.sinif_seviyesi else '',
                },
                'uygun_deneme_paketleri': uygun_paketler,
            }
        })
