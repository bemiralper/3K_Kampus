"""
Personel Views
DDD Pattern - Interfaces
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db import models
from datetime import datetime
import json

from apps.personel.application.services import (
    PersonelService,
    assign_user_role_for_personel,
    resolve_system_role_for_personel,
)
from apps.personel.domain.user_account import resolve_personel_user
from apps.kimlik.exceptions import KimlikConflictError
from apps.personel.domain.models import Personel
from apps.egitim_yili.domain.models import EgitimYili
from shared.permissions import require_module_permission


def _personel_sube_gate(request, personel):
    from apps.personel.interfaces.sube_context import assert_personel_record_sube_access
    return assert_personel_record_sube_access(request, personel)


def get_current_context(request):
    """
    Mevcut kurum, şube ve eğitim yılı bilgisini al.
    
    Öncelik sırası:
    1. HTTP Headers (X-Kurum-ID, X-Sube-ID, X-EgitimYili-ID) - Frontend Topbar seçimi
    2. Session
    3. Varsayılan (ilk aktif kayıt)
    """
    # Önce Header'lardan oku (Frontend seçimi)
    kurum_id = request.headers.get('X-Kurum-ID') or request.session.get('active_kurum_id')
    sube_id = request.headers.get('X-Sube-ID') or request.session.get('active_sube_id')
    egitim_yili_id = request.headers.get('X-EgitimYili-ID') or request.session.get('active_egitim_yili_id')
    
    # String'den int'e çevir
    kurum_id = int(kurum_id) if kurum_id else None
    sube_id = int(sube_id) if sube_id else None
    egitim_yili_id = int(egitim_yili_id) if egitim_yili_id else None
    
    # Eğer kurum/şube yoksa varsayılan olanları al
    if not kurum_id:
        from apps.kurum.domain.models import Kurum
        kurum = Kurum.objects.filter(aktif_mi=True).first()
        kurum_id = kurum.id if kurum else None
    
    if not sube_id:
        from apps.sube.domain.models import Sube
        sube = Sube.objects.filter(aktif_mi=True).first()
        sube_id = sube.id if sube else None
    
    # Eğitim yılı
    egitim_yili = None
    if egitim_yili_id:
        try:
            egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
        except EgitimYili.DoesNotExist:
            egitim_yili = None
            egitim_yili_id = None
    
    if not egitim_yili:
        egitim_yili = EgitimYili.objects.filter(aktif_mi=True).first()
        egitim_yili_id = egitim_yili.id if egitim_yili else None
    
    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': egitim_yili_id,
        'egitim_yili': egitim_yili,
    }


# ==================== PERSONEL TANIMLARI (YILDAN BAĞIMSIZ) ====================

@login_required
def personel_listesi(request):
    """Personel listesi sayfası"""
    ctx = get_current_context(request)
    service = PersonelService()
    
    search_query = request.GET.get('q', '')
    
    if search_query:
        personeller = service.search(search_query, ctx['kurum_id'], ctx['sube_id'])
    else:
        personeller = service.get_all(ctx['kurum_id'], ctx['sube_id'])
    
    toplam_personel = service.get_count(ctx['kurum_id'], ctx['sube_id'], aktif_only=False)
    aktif_personel = service.get_count(ctx['kurum_id'], ctx['sube_id'], aktif_only=True)
    
    context = {
        'personeller': personeller,
        'toplam_personel': toplam_personel,
        'aktif_personel': aktif_personel,
        'search_query': search_query,
    }
    
    return render(request, 'personel/personel_listesi.html', context)


@require_module_permission("personel")
def personel_list_api(request):
    """
    Personel listesi API
    
    Personel tanımları yıldan bağımsız olduğu için
    sadece kurum ve şubeye göre filtrelenir.
    """
    from apps.personel.interfaces.sube_context import mandatory_personel_context

    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    search_query = request.GET.get('q', '')
    show_inactive = request.GET.get('show_inactive', 'false') == 'true'
    
    def format_date(value):
        return value.strftime('%d.%m.%Y') if value else ''
    
    service = PersonelService()
    sube_kw = {
        'kurum_id': ctx['kurum_id'],
        'sube_id': ctx['sube_id'],
        'egitim_yili_id': ctx.get('egitim_yili_id'),
    }
    
    if search_query:
        personeller = service.search(search_query, **sube_kw)
    else:
        personeller = service.get_all(**sube_kw, aktif_only=not show_inactive)
    
    toplam_personel = service.get_count(**sube_kw, aktif_only=False)
    aktif_personel = service.get_count(**sube_kw, aktif_only=True)

    personel_rows = []
    for p in personeller:
        linked_user = resolve_personel_user(p)
        personel_rows.append({
                'id': p.id,
                'tc_kimlik_no': p.tc_kimlik_no or '',
                'ad': p.ad,
                'soyad': p.soyad,
                'tam_ad': p.tam_ad,
                'dogum_tarihi': format_date(p.dogum_tarihi),
                'cinsiyet': p.cinsiyet or '',
                'cinsiyet_display': p.get_cinsiyet_display() if p.cinsiyet else '',
                'telefon': p.telefon or '',
                'cep_telefon': p.cep_telefon or '',
                'email': p.email or '',
                'adres': p.adres or '',
                'il': p.il or '',
                'ilce': p.ilce or '',
                'acil_durum_kisi': p.acil_durum_kisi or '',
                'acil_durum_telefon': p.acil_durum_telefon or '',
                'aktif_mi': p.aktif_mi,
                'aktif_display': 'Aktif' if p.aktif_mi else 'Pasif',
                'has_user_account': linked_user is not None,
                'user_id': linked_user.id if linked_user else None,
                'user_email': linked_user.email if linked_user else '',
                'kurum_id': p.kurum_id,
                'kurum_ad': p.kurum.ad if p.kurum else '',
                'sube_id': p.sube_id,
                'sube_ad': p.sube.ad if p.sube else '',
                'notlar': p.notlar or '',
                'fotograf': p.fotograf.url if p.fotograf else '',
                'created_at': format_date(p.created_at),
        })

    return JsonResponse({
        'success': True,
        'personeller': personel_rows,
        'toplam_personel': toplam_personel,
        'aktif_personel': aktif_personel,
    })


@require_module_permission("personel")
def personel_detail_api(request, pk):
    """Personel detay API"""
    service = PersonelService()
    personel = service.get_by_id(pk)
    
    if not personel:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    def format_date(value):
        return value.strftime('%d.%m.%Y') if value else ''
    
    return JsonResponse({
        'success': True,
        'personel': {
            'id': personel.id,
            'tc_kimlik_no': personel.tc_kimlik_no or '',
            'ad': personel.ad,
            'soyad': personel.soyad,
            'tam_ad': personel.tam_ad,
            'dogum_tarihi': format_date(personel.dogum_tarihi),
            'dogum_tarihi_iso': personel.dogum_tarihi.isoformat() if personel.dogum_tarihi else '',
            'cinsiyet': personel.cinsiyet or '',
            'cinsiyet_display': personel.get_cinsiyet_display() if personel.cinsiyet else '',
            'telefon': personel.telefon or '',
            'cep_telefon': personel.cep_telefon or '',
            'email': personel.email or '',
            'adres': personel.adres or '',
            'il': personel.il or '',
            'ilce': personel.ilce or '',
            'acil_durum_kisi': personel.acil_durum_kisi or '',
            'acil_durum_telefon': personel.acil_durum_telefon or '',
            'aktif_mi': personel.aktif_mi,
            'has_user_account': personel.has_user_account,
            'user_email': personel.user.email if personel.user else '',
            'kurum_id': personel.kurum_id,
            'sube_id': personel.sube_id,
            'notlar': personel.notlar or '',
            'fotograf': personel.fotograf.url if personel.fotograf else '',
        }
    })


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_create_api(request):
    """Yeni personel oluştur API"""
    from apps.personel.interfaces.sube_context import mandatory_personel_context

    ctx, err = mandatory_personel_context(request)
    if err:
        return err
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON verisi'}, status=400)
    
    # Zorunlu alanlar
    required_fields = ['ad', 'soyad']
    for field in required_fields:
        if not data.get(field):
            return JsonResponse({'success': False, 'error': f'{field} alanı zorunludur'}, status=400)
    
    # Verileri hazırla
    personel_data = {
        'kurum_id': ctx['kurum_id'],
        'sube_id': ctx['sube_id'],
        'tc_kimlik_no': data.get('tc_kimlik_no') or None,
        'ad': data['ad'].strip(),
        'soyad': data['soyad'].strip(),
        'dogum_tarihi': data.get('dogum_tarihi') or None,
        'cinsiyet': data.get('cinsiyet') or None,
        'telefon': data.get('telefon', '').strip(),
        'cep_telefon': data.get('cep_telefon', '').strip(),
        'email': data.get('email', '').strip(),
        'adres': data.get('adres', '').strip(),
        'il': data.get('il', '').strip(),
        'ilce': data.get('ilce', '').strip(),
        'acil_durum_kisi': data.get('acil_durum_kisi', '').strip(),
        'acil_durum_telefon': data.get('acil_durum_telefon', '').strip(),
        'notlar': data.get('notlar', '').strip(),
        'aktif_mi': data.get('aktif_mi', True),
    }
    
    service = PersonelService()
    
    try:
        use_existing_id = data.get('use_existing_personel_id')
        if use_existing_id:
            gorevlendirme_data = None
            if data.get('create_gorevlendirme'):
                egitim_yili_id = data.get('egitim_yili_id') or ctx.get('egitim_yili_id')
                gorev_sube_id = data.get('gorev_sube_id') or ctx['sube_id']
                if not egitim_yili_id:
                    return JsonResponse({
                        'success': False,
                        'error': 'Personeli bu şubede göstermek için üst menüden eğitim yılı seçin.',
                    }, status=400)
                if egitim_yili_id and gorev_sube_id:
                    gorevlendirme_data = {
                        'egitim_yili_id': egitim_yili_id,
                        'gorev_sube_id': gorev_sube_id,
                        'rol_id': data.get('rol_id'),
                        'brans_id': data.get('brans_id'),
                        'aktif_mi': data.get('aktif_mi', True),
                    }
            result = service.reuse_existing_for_sube(
                int(use_existing_id),
                ctx['kurum_id'],
                ctx['sube_id'],
                gorevlendirme_data=gorevlendirme_data,
            )
            personel = result['personel']
            msg = 'Mevcut personel kullanıldı'
            if result['created_gorevlendirme']:
                msg = 'Mevcut personel için yeni şube görevlendirmesi oluşturuldu'
            return JsonResponse({
                'success': True,
                'message': msg,
                'reused': True,
                'personel': {
                    'id': personel.id,
                    'tam_ad': personel.tam_ad,
                },
                'gorevlendirme_id': result['gorevlendirme'].id if result['gorevlendirme'] else None,
            })

        create_user_account = data.get('create_user_account', False)
        kisi_id = data.get('kisi_id')
        personel = service.create(
            personel_data,
            create_user_account=create_user_account,
            kisi_id=int(kisi_id) if kisi_id else None,
        )
        
        response = {
            'success': True,
            'message': 'Personel başarıyla oluşturuldu',
            'personel': {
                'id': personel.id,
                'tam_ad': personel.tam_ad,
            },
        }
        return JsonResponse(response)
    except KimlikConflictError as e:
        return JsonResponse(e.as_dict(), status=409)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Bir hata oluştu: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
@require_module_permission("personel")
def personel_update_api(request, pk):
    """Personel güncelle API"""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON verisi'}, status=400)
    
    service = PersonelService()
    personel = service.get_by_id(pk)
    
    if not personel:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    # Güncellenebilir alanlar
    update_fields = [
        'tc_kimlik_no', 'ad', 'soyad', 'dogum_tarihi', 'cinsiyet',
        'telefon', 'cep_telefon', 'email', 'adres', 'il', 'ilce',
        'acil_durum_kisi', 'acil_durum_telefon', 'notlar', 'aktif_mi'
    ]
    
    update_data = {}
    for field in update_fields:
        if field in data:
            value = data[field]
            if field in ['ad', 'soyad', 'telefon', 'cep_telefon', 'email', 'adres', 'il', 'ilce', 'acil_durum_kisi', 'acil_durum_telefon', 'notlar']:
                value = value.strip() if value else ''
            if field == 'tc_kimlik_no' and not value:
                value = None
            if field == 'dogum_tarihi' and not value:
                value = None
            if field == 'cinsiyet' and not value:
                value = None
            update_data[field] = value
    
    try:
        personel = service.update(pk, update_data)
        
        return JsonResponse({
            'success': True,
            'message': 'Personel başarıyla güncellendi',
            'personel': {
                'id': personel.id,
                'tam_ad': personel.tam_ad,
            }
        })
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Bir hata oluştu: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
@require_module_permission("personel")
def personel_delete_api(request, pk):
    """Personel sil API (soft delete)"""
    service = PersonelService()
    personel = service.get_by_id(pk)
    
    if not personel:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    try:
        service.delete(pk)
        return JsonResponse({
            'success': True,
            'message': f'{personel.tam_ad} pasif duruma alındı'
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Bir hata oluştu: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_toggle_active_api(request, pk):
    """Personel aktif/pasif durumunu değiştir"""
    service = PersonelService()
    personel = service.get_by_id(pk)
    if not personel:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    try:
        personel = service.toggle_active_status(pk)
        status_text = 'aktif' if personel.aktif_mi else 'pasif'
        
        return JsonResponse({
            'success': True,
            'message': f'{personel.tam_ad} {status_text} duruma alındı',
            'aktif_mi': personel.aktif_mi
        })
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Bir hata oluştu: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_create_user_account_api(request, pk):
    """Personel için kullanıcı hesabı oluştur"""
    service = PersonelService()
    personel = service.get_by_id(pk)
    if not personel:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}
    
    password = data.get('password')
    
    try:
        personel = service.create_user_account_for_personel(pk, password)
        
        return JsonResponse({
            'success': True,
            'message': f'{personel.tam_ad} için kullanıcı hesabı oluşturuldu',
            'user_email': personel.user.email
        })
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Bir hata oluştu: {str(e)}'}, status=500)


# ==================== FOTOĞRAF UPLOAD API ====================

@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_upload_foto_api(request, pk):
    """Personel fotoğrafı yükle"""
    service = PersonelService()
    personel = service.get_by_id(pk)
    
    if not personel:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    if request.user.is_authenticated and not request.user.is_staff:
        try:
            own = request.user.personel
            if not own or own.id != personel.id:
                gate = _personel_sube_gate(request, personel)
                if gate:
                    return gate
        except Exception:
            gate = _personel_sube_gate(request, personel)
            if gate:
                return gate
    else:
        gate = _personel_sube_gate(request, personel)
        if gate:
            return gate
    
    if 'fotograf' not in request.FILES:
        return JsonResponse({'success': False, 'error': 'Fotoğraf dosyası bulunamadı'}, status=400)
    
    fotograf = request.FILES['fotograf']
    
    # Dosya boyutu kontrolü (5MB max)
    if fotograf.size > 5 * 1024 * 1024:
        return JsonResponse({'success': False, 'error': 'Dosya boyutu 5MB\'dan küçük olmalıdır'}, status=400)
    
    # Dosya tipi kontrolü
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if fotograf.content_type not in allowed_types:
        return JsonResponse({'success': False, 'error': 'Sadece JPEG, PNG, GIF veya WebP dosyaları kabul edilir'}, status=400)
    
    try:
        # Eski fotoğrafı sil
        if personel.fotograf:
            personel.fotograf.delete(save=False)
        
        # Yeni fotoğrafı kaydet
        personel.fotograf = fotograf
        personel.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Fotoğraf başarıyla yüklendi',
            'fotograf_url': personel.fotograf.url
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Bir hata oluştu: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
@require_module_permission("personel")
def personel_delete_foto_api(request, pk):
    """Personel fotoğrafını sil"""
    service = PersonelService()
    personel = service.get_by_id(pk)
    
    if not personel:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    if request.user.is_authenticated and not request.user.is_staff:
        try:
            own = request.user.personel
            if not own or own.id != personel.id:
                gate = _personel_sube_gate(request, personel)
                if gate:
                    return gate
        except Exception:
            gate = _personel_sube_gate(request, personel)
            if gate:
                return gate
    else:
        gate = _personel_sube_gate(request, personel)
        if gate:
            return gate
    
    try:
        if personel.fotograf:
            personel.fotograf.delete(save=True)
        
        return JsonResponse({
            'success': True,
            'message': 'Fotoğraf başarıyla silindi'
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Bir hata oluştu: {str(e)}'}, status=500)


# ==================== ROL API ====================

@require_module_permission("personel")
def personel_rol_list_api(request):
    """
    Personel rolleri listesi API
    Artık apps.roller.models.Role modelinden çekiliyor
    """
    from apps.roller.models import Role
    
    roller = Role.objects.filter(is_active=True).order_by('level', 'name')
    
    return JsonResponse({
        'success': True,
        'roller': [
            {
                'id': rol.id,
                'ad': rol.name,
                'kod': rol.code,
                'aciklama': rol.description or '',
                'sistem_rolu': rol.is_system_role,
                'level': rol.level,
                'aktif_mi': rol.is_active,
            }
            for rol in roller
        ]
    })


# ==================== İSTATİSTİK API ====================

@require_module_permission("personel")
def personel_stats_api(request):
    """Personel istatistikleri API"""
    from apps.personel.interfaces.sube_context import mandatory_personel_context

    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    service = PersonelService()
    sube_kw = {
        'kurum_id': ctx['kurum_id'],
        'sube_id': ctx['sube_id'],
        'egitim_yili_id': ctx.get('egitim_yili_id'),
    }
    
    toplam = service.get_count(**sube_kw, aktif_only=False)
    aktif = service.get_count(**sube_kw, aktif_only=True)
    pasif = toplam - aktif
    hesabi_olmayan = service.get_without_user_account(**sube_kw).count()
    
    return JsonResponse({
        'success': True,
        'stats': {
            'toplam': toplam,
            'aktif': aktif,
            'pasif': pasif,
            'hesabi_olmayan': hesabi_olmayan,
        }
    })


@require_module_permission("personel")
def personel_export_api(request):
    """Personel listesi — kurumsal Excel/CSV dışa aktarma."""
    from apps.personel.application.export import (
        build_export_columns,
        build_export_meta,
        build_export_rows,
        build_export_stats,
    )
    from apps.personel.interfaces.sube_context import mandatory_personel_context
    from shared.export import CsvExportService, ExcelExportService

    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    search_query = request.GET.get('q', '')
    show_inactive = request.GET.get('show_inactive', 'false') == 'true'
    export_format = (request.GET.get('format') or 'csv').lower()

    service = PersonelService()
    sube_kw = {
        'kurum_id': ctx['kurum_id'],
        'sube_id': ctx['sube_id'],
        'egitim_yili_id': ctx.get('egitim_yili_id'),
    }

    if search_query:
        personeller = service.search(search_query, **sube_kw)
    else:
        personeller = service.get_all(**sube_kw, aktif_only=not show_inactive)

    rows = build_export_rows(
        personeller,
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        egitim_yili_id=ctx.get('egitim_yili_id'),
    )
    columns = build_export_columns()
    meta = build_export_meta(request, ctx)
    stats = build_export_stats(rows)

    if export_format == 'xlsx':
        return ExcelExportService.export(
            rows, columns, meta=meta, stats=stats, filename='personel_listesi',
        )
    return CsvExportService.export(rows, columns, meta=meta, filename='personel_listesi')


# ==================== GÖREVLENDİRME API ====================

@csrf_exempt
@require_module_permission("personel")
def gorevlendirme_list_api(request):
    """
    Görevlendirme listesi API (Yıl Bazlı)
    
    GET: Tüm görevlendirmeleri listele
    Query params:
        - egitim_yili_id: Eğitim yılına göre filtrele
        - personel_id: Personele göre filtrele
        - aktif: Sadece aktif görevlendirmeler
    """
    from apps.personel.domain.models import PersonelGorevlendirme
    from apps.personel.interfaces.sube_context import mandatory_personel_context

    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    kurum_id = ctx['kurum_id']
    sube_id = ctx['sube_id']
    egitim_yili_id = ctx.get('egitim_yili_id')
    
    # Base queryset
    queryset = PersonelGorevlendirme.objects.filter(
        kurum_id=kurum_id,
        gorev_sube_id=sube_id,
    ).select_related(
        'personel', 'egitim_yili', 'gorev_sube', 'rol', 'brans'
    )
    
    # Eğitim yılı filtresi (query param veya context'ten)
    param_egitim_yili = request.GET.get('egitim_yili_id')
    if param_egitim_yili:
        queryset = queryset.filter(egitim_yili_id=param_egitim_yili)
    elif egitim_yili_id:
        queryset = queryset.filter(egitim_yili_id=egitim_yili_id)
    
    # Personel filtresi
    personel_id = request.GET.get('personel_id')
    if personel_id:
        queryset = queryset.filter(personel_id=personel_id)
    
    # Aktif filtresi
    aktif = request.GET.get('aktif')
    if aktif == 'true':
        queryset = queryset.filter(aktif_mi=True)
    elif aktif == 'false':
        queryset = queryset.filter(aktif_mi=False)
    
    queryset = queryset.order_by('-egitim_yili__baslangic_yil', 'personel__soyad', 'personel__ad')
    
    return JsonResponse({
        'success': True,
        'gorevlendirmeler': [
            {
                'id': g.id,
                'personel_id': g.personel_id,
                'personel_ad': g.personel.tam_ad,
                'personel_fotograf': g.personel.fotograf.url if g.personel.fotograf else None,
                'egitim_yili_id': g.egitim_yili_id,
                'egitim_yili_ad': str(g.egitim_yili),
                'gorev_sube_id': g.gorev_sube_id,
                'gorev_sube_ad': g.gorev_sube.ad if g.gorev_sube else None,
                'rol_id': g.rol_id,
                'rol_ad': g.rol.name if g.rol else None,
                'brans_id': g.brans_id,
                'brans_ad': g.brans.ad if g.brans else None,
                'gorev_baslangic': g.gorev_baslangic.isoformat() if g.gorev_baslangic else None,
                'gorev_bitis': g.gorev_bitis.isoformat() if g.gorev_bitis else None,
                'aktif_mi': g.aktif_mi,
                'notlar': g.notlar or '',
            }
            for g in queryset
        ]
    })


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def gorevlendirme_create_api(request):
    """Yeni görevlendirme oluştur"""
    from apps.personel.domain.models import PersonelGorevlendirme, Personel
    from apps.egitim_yili.domain.models import EgitimYili
    from apps.sube.domain.models import Sube
    from apps.personel.interfaces.sube_context import (
        assert_gorevlendirme_record_sube_access,
        mandatory_personel_context,
    )
    
    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    kurum_id = ctx['kurum_id']
    
    try:
        data = json.loads(request.body)
        
        # Gerekli alanlar
        personel_id = data.get('personel_id')
        egitim_yili_id = data.get('egitim_yili_id') or ctx.get('egitim_yili_id')
        gorev_sube_id = data.get('gorev_sube_id')
        
        if not personel_id:
            return JsonResponse({
                'success': False,
                'error': 'Personel seçilmedi'
            }, status=400)
        
        if not egitim_yili_id:
            return JsonResponse({
                'success': False,
                'error': 'Eğitim yılı seçilmedi (üst menüden seçin)'
            }, status=400)
            
        if not gorev_sube_id:
            return JsonResponse({
                'success': False,
                'error': 'Görev şubesi seçilmedi'
            }, status=400)

        gate = assert_gorevlendirme_record_sube_access(request, kurum_id, gorev_sube_id)
        if gate:
            return gate
        
        # Personel kontrolü
        try:
            personel = Personel.objects.get(id=personel_id, kurum_id=kurum_id)
        except Personel.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Personel bulunamadı'
            }, status=400)

        from apps.personel.interfaces.sube_context import assert_personel_record_sube_access
        personel_gate = assert_personel_record_sube_access(
            request, personel, ctx.get('egitim_yili_id'),
        )
        if personel_gate:
            # Personel başka şubede kayıtlı olabilir; hedef görev şubesine ekleme izni ver
            if personel.kurum_id != kurum_id:
                return personel_gate
            target_gate = assert_gorevlendirme_record_sube_access(
                request, kurum_id, gorev_sube_id,
            )
            if target_gate:
                return target_gate
        
        # Eğitim yılı kontrolü - Global model, kurum_id yok
        try:
            egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
        except EgitimYili.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Eğitim yılı bulunamadı'
            }, status=400)
        
        # Şube kontrolü
        try:
            gorev_sube = Sube.objects.get(id=gorev_sube_id, kurum_id=kurum_id)
        except Sube.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Şube bulunamadı'
            }, status=400)
        
        # Tarih parse
        gorev_baslangic = None
        gorev_bitis = None
        if data.get('gorev_baslangic'):
            from datetime import datetime
            gorev_baslangic = datetime.strptime(data['gorev_baslangic'], '%Y-%m-%d').date()
        if data.get('gorev_bitis'):
            from datetime import datetime
            gorev_bitis = datetime.strptime(data['gorev_bitis'], '%Y-%m-%d').date()
        
        gorevlendirme = PersonelGorevlendirme.objects.create(
            kurum_id=kurum_id,
            personel_id=personel_id,
            egitim_yili_id=egitim_yili_id,
            gorev_sube_id=gorev_sube_id,
            rol_id=data.get('rol_id'),
            brans_id=data.get('brans_id'),
            gorev_baslangic=gorev_baslangic,
            gorev_bitis=gorev_bitis,
            aktif_mi=data.get('aktif_mi', True),
            notlar=data.get('notlar', ''),
        )
        
        return JsonResponse({
            'success': True,
            'message': 'Görevlendirme oluşturuldu',
            'data': {
                'id': gorevlendirme.id,
                'personel_ad': gorevlendirme.personel.tam_ad,
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_module_permission("personel")
def koc_listesi_api(request):
    """
    Koç Listesi API
    
    Koç rolü atanmış personelleri döndürür.
    Eğitim yılına göre filtrelenebilir.
    
    Returns:
        - Aktif eğitim yılında koç rolü atanmış personeller
    """
    from apps.personel.domain.models import PersonelGorevlendirme
    from apps.personel.interfaces.sube_context import mandatory_personel_context

    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    kurum_id = ctx['kurum_id']
    sube_id = ctx['sube_id']
    egitim_yili_id = ctx.get('egitim_yili_id')
    
    # Koç rolündeki görevlendirmeleri bul
    queryset = PersonelGorevlendirme.objects.filter(
        kurum_id=kurum_id,
        gorev_sube_id=sube_id,
        rol__code='koc',
        aktif_mi=True
    ).select_related('personel', 'gorev_sube')
    
    # Eğitim yılı filtresi
    if egitim_yili_id:
        queryset = queryset.filter(egitim_yili_id=egitim_yili_id)
    
    # Distinct personeller (bir personel birden fazla şubede koç olabilir)
    personel_ids = queryset.values_list('personel_id', flat=True).distinct()
    
    # Personelleri al
    from apps.personel.domain.models import Personel
    personeller = Personel.objects.filter(
        id__in=personel_ids,
        aktif_mi=True
    ).order_by('soyad', 'ad')
    
    return JsonResponse({
        'success': True,
        'koclar': [
            {
                'id': p.id,
                'ad': p.ad,
                'soyad': p.soyad,
                'tam_ad': p.tam_ad,
                'email': p.email or '',
                'fotograf': p.fotograf.url if p.fotograf else None,
            }
            for p in personeller
        ],
        'toplam': len(personeller),
    })


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
@require_module_permission("personel")
def gorevlendirme_detail_api(request, pk):
    """Görevlendirme detay/güncelle/sil API"""
    from apps.personel.domain.models import PersonelGorevlendirme
    from apps.personel.interfaces.sube_context import (
        assert_gorevlendirme_record_sube_access,
        mandatory_personel_context,
    )
    
    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    kurum_id = ctx['kurum_id']
    
    try:
        gorevlendirme = PersonelGorevlendirme.objects.select_related(
            'personel', 'egitim_yili', 'gorev_sube', 'rol', 'brans'
        ).get(id=pk, kurum_id=kurum_id)
    except PersonelGorevlendirme.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Görevlendirme bulunamadı'
        }, status=404)

    gate = assert_gorevlendirme_record_sube_access(
        request, kurum_id, gorevlendirme.gorev_sube_id,
    )
    if gate:
        return gate
    
    # GET - Detay
    if request.method == 'GET':
        return JsonResponse({
            'success': True,
            'data': {
                'id': gorevlendirme.id,
                'personel_id': gorevlendirme.personel_id,
                'personel_ad': gorevlendirme.personel.tam_ad,
                'egitim_yili_id': gorevlendirme.egitim_yili_id,
                'egitim_yili_ad': str(gorevlendirme.egitim_yili),
                'gorev_sube_id': gorevlendirme.gorev_sube_id,
                'gorev_sube_ad': gorevlendirme.gorev_sube.ad if gorevlendirme.gorev_sube else None,
                'rol_id': gorevlendirme.rol_id,
                'rol_ad': gorevlendirme.rol.name if gorevlendirme.rol else None,
                'brans_id': gorevlendirme.brans_id,
                'brans_ad': gorevlendirme.brans.ad if gorevlendirme.brans else None,
                'gorev_baslangic': gorevlendirme.gorev_baslangic.isoformat() if gorevlendirme.gorev_baslangic else None,
                'gorev_bitis': gorevlendirme.gorev_bitis.isoformat() if gorevlendirme.gorev_bitis else None,
                'aktif_mi': gorevlendirme.aktif_mi,
                'notlar': gorevlendirme.notlar or '',
            }
        })
    
    # PUT - Güncelle
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            # Güncelle
            if 'personel_id' in data:
                gorevlendirme.personel_id = data['personel_id']
            if 'egitim_yili_id' in data:
                gorevlendirme.egitim_yili_id = data['egitim_yili_id']
            if 'gorev_sube_id' in data:
                new_sube_id = data['gorev_sube_id']
                sube_gate = assert_gorevlendirme_record_sube_access(
                    request, kurum_id, new_sube_id,
                )
                if sube_gate:
                    return sube_gate
                gorevlendirme.gorev_sube_id = new_sube_id
            if 'rol_id' in data:
                gorevlendirme.rol_id = data['rol_id'] if data['rol_id'] else None
            if 'brans_id' in data:
                gorevlendirme.brans_id = data['brans_id'] if data['brans_id'] else None
            if 'gorev_baslangic' in data:
                if data['gorev_baslangic']:
                    from datetime import datetime
                    gorevlendirme.gorev_baslangic = datetime.strptime(data['gorev_baslangic'], '%Y-%m-%d').date()
                else:
                    gorevlendirme.gorev_baslangic = None
            if 'gorev_bitis' in data:
                if data['gorev_bitis']:
                    from datetime import datetime
                    gorevlendirme.gorev_bitis = datetime.strptime(data['gorev_bitis'], '%Y-%m-%d').date()
                else:
                    gorevlendirme.gorev_bitis = None
            if 'aktif_mi' in data:
                gorevlendirme.aktif_mi = data['aktif_mi']
            if 'notlar' in data:
                gorevlendirme.notlar = data['notlar']
            
            gorevlendirme.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Görevlendirme güncellendi'
            })
            
        except json.JSONDecodeError:
            return JsonResponse({
                'success': False,
                'error': 'Geçersiz JSON'
            }, status=400)
    
    # DELETE - Sil
    elif request.method == 'DELETE':
        gorevlendirme.delete()
        return JsonResponse({
            'success': True,
            'message': 'Görevlendirme silindi'
        })


@csrf_exempt
@require_module_permission("personel")
def gorevlendirme_helper_data_api(request):
    """
    Görevlendirme formu için yardımcı veriler
    - Personeller
    - Eğitim Yılları
    - Şubeler
    - Roller (yeni sistem rollerinden)
    - Branşlar
    """
    from apps.egitim_yili.domain.models import EgitimYili
    from apps.egitim_tanimlari.models import Brans
    from apps.roller.models import Role  # Yeni rol sistemi
    from apps.personel.interfaces.sube_context import (
        allowed_subeler_for_request,
        mandatory_personel_context,
        personel_queryset_for_sube,
    )
    
    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    kurum_id = ctx['kurum_id']
    sube_id = ctx['sube_id']
    
    # Personeller — aktif şubede görünür olanlar
    personeller = personel_queryset_for_sube(
        kurum_id, sube_id, ctx.get('egitim_yili_id'), aktif_only=True,
    ).values('id', 'ad', 'soyad')
    
    # Eğitim Yılları - Global model, kurum_id yok
    egitim_yillari = EgitimYili.objects.filter(
        aktif_mi=True
    ).order_by('-baslangic_yil').values('id', 'baslangic_yil', 'bitis_yil', 'aktif_mi')
    
    # Şubeler — kullanıcının erişebildiği şubeler
    subeler = allowed_subeler_for_request(request, kurum_id)
    
    # Roller - Yeni sistem rolleri (global)
    roller = Role.objects.filter(
        is_active=True
    ).order_by('level', 'name').values('id', 'code', 'name', 'level', 'is_system_role')
    
    # Branşlar — aktif şubeye özel
    try:
        branslar = Brans.objects.filter(
            aktif_mi=True,
            sube_id=sube_id,
        ).order_by('ad').values('id', 'ad', 'kod')
    except Exception:
        branslar = []
    
    return JsonResponse({
        'success': True,
        'data': {
            'personeller': [
                {'id': p['id'], 'ad': f"{p['ad']} {p['soyad']}"} 
                for p in personeller
            ],
            'egitim_yillari': [
                {
                    'id': ey['id'], 
                    'ad': f"{ey['baslangic_yil']}-{ey['bitis_yil']}",
                    'aktif_mi': ey['aktif_mi']
                } 
                for ey in egitim_yillari
            ],
            'subeler': subeler,
            'roller': [
                {
                    'id': r['id'],
                    'kod': r['code'],
                    'ad': r['name'],
                    'level': r['level'],
                    'is_system_role': r['is_system_role']
                }
                for r in roller
            ],
            'branslar': list(branslar),
        }
    })


# ==================== PERSONEL DETAY API (GENİŞLETİLMİŞ) ====================

@require_module_permission("personel")
def personel_full_detail_api(request, pk):
    """
    Personel tam detay API - Detay sayfası için
    
    Personel bilgileri + kullanıcı hesap bilgileri + görevlendirmeler + aktivite logları
    """
    from apps.personel.domain.models import Personel, PersonelGorevlendirme, PersonelAktiviteLog
    from apps.roller.models import UserRole
    
    try:
        personel = Personel.objects.select_related('kurum', 'sube', 'user').get(pk=pk)
    except Personel.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    def format_date(value):
        return value.strftime('%d.%m.%Y') if value else None
    
    def format_datetime(value):
        return value.strftime('%d.%m.%Y %H:%M') if value else None
    
    # Kullanıcı hesap bilgileri (kurum genelinde — FK eksikse eş kayıt / username ile bul)
    from apps.personel.domain.user_account import personel_user_account_meta

    account_meta = personel_user_account_meta(personel, heal_link=True)
    linked_user = account_meta['user']
    user_data = None
    must_change_password = True
    if linked_user:
        user = linked_user
        user_data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_active': user.is_active,
            'last_login': format_datetime(user.last_login),
            'date_joined': format_datetime(user.date_joined),
        }
        # must_change_password bilgisini UserRole'dan al
        try:
            user_role = UserRole.objects.get(user=user)
            must_change_password = user_role.must_change_password
        except UserRole.DoesNotExist:
            must_change_password = True
    
    # Görevlendirmeler
    gorevlendirmeler = PersonelGorevlendirme.objects.filter(
        personel=personel
    ).select_related(
        'egitim_yili', 'gorev_sube', 'rol', 'brans'
    ).order_by('-egitim_yili__baslangic_yil')
    
    gorevlendirme_list = [
        {
            'id': g.id,
            'egitim_yili_id': g.egitim_yili_id,
            'egitim_yili_ad': str(g.egitim_yili),
            'egitim_yili_aktif': g.egitim_yili.aktif_mi if g.egitim_yili else False,
            'rol_id': g.rol_id,
            'rol_ad': g.rol.name if g.rol else None,
            'rol_kod': g.rol.code if g.rol else None,
            'gorev_sube_id': g.gorev_sube_id,
            'gorev_sube_ad': g.gorev_sube.ad if g.gorev_sube else None,
            'brans_id': g.brans_id,
            'brans_ad': g.brans.ad if g.brans else None,
            'gorev_baslangic': format_date(g.gorev_baslangic),
            'gorev_bitis': format_date(g.gorev_bitis),
            'aktif_mi': g.aktif_mi,
            'created_at': format_datetime(g.created_at),
        }
        for g in gorevlendirmeler
    ]
    
    # Aktivite logları (son 50)
    try:
        aktivite_loglari = PersonelAktiviteLog.objects.filter(
            personel=personel
        ).order_by('-created_at')[:50]
        
        aktivite_list = [
            {
                'id': a.id,
                'eylem': a.eylem,
                'eylem_display': a.get_eylem_display(),
                'detay': a.detay,
                'ip_adresi': a.ip_adresi,
                'user_agent': a.user_agent[:100] if a.user_agent else '',
                'sayfa_url': a.sayfa_url,
                'created_at': format_datetime(a.created_at),
            }
            for a in aktivite_loglari
        ]
    except:
        aktivite_list = []
    
    # İstatistikler
    stats = {
        'toplam_giris': 0,
        'son_giris': None,
        'son_cikis': None,
        'bu_ay_giris': 0,
        'bu_hafta_giris': 0,
    }
    
    try:
        from django.utils import timezone
        from datetime import timedelta
        
        now = timezone.now()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        # Toplam giriş
        stats['toplam_giris'] = PersonelAktiviteLog.objects.filter(
            personel=personel, eylem='LOGIN'
        ).count()
        
        # Son giriş
        son_giris = PersonelAktiviteLog.objects.filter(
            personel=personel, eylem='LOGIN'
        ).order_by('-created_at').first()
        if son_giris:
            stats['son_giris'] = format_datetime(son_giris.created_at)
        
        # Son çıkış
        son_cikis = PersonelAktiviteLog.objects.filter(
            personel=personel, eylem='LOGOUT'
        ).order_by('-created_at').first()
        if son_cikis:
            stats['son_cikis'] = format_datetime(son_cikis.created_at)
        
        # Bu ay giriş
        stats['bu_ay_giris'] = PersonelAktiviteLog.objects.filter(
            personel=personel, eylem='LOGIN', created_at__gte=month_ago
        ).count()
        
        # Bu hafta giriş
        stats['bu_hafta_giris'] = PersonelAktiviteLog.objects.filter(
            personel=personel, eylem='LOGIN', created_at__gte=week_ago
        ).count()
    except:
        pass
    
    return JsonResponse({
        'success': True,
        'personel': {
            'id': personel.id,
            'tc_kimlik_no': personel.tc_kimlik_no or '',
            'ad': personel.ad,
            'soyad': personel.soyad,
            'tam_ad': personel.tam_ad,
            'dogum_tarihi': format_date(personel.dogum_tarihi),
            'dogum_tarihi_iso': personel.dogum_tarihi.isoformat() if personel.dogum_tarihi else None,
            'cinsiyet': personel.cinsiyet or '',
            'cinsiyet_display': personel.get_cinsiyet_display() if personel.cinsiyet else '',
            'telefon': personel.telefon or '',
            'cep_telefon': personel.cep_telefon or '',
            'email': personel.email or '',
            'adres': personel.adres or '',
            'il': personel.il or '',
            'ilce': personel.ilce or '',
            'acil_durum_kisi': personel.acil_durum_kisi or '',
            'acil_durum_telefon': personel.acil_durum_telefon or '',
            'aktif_mi': personel.aktif_mi,
            'fotograf': personel.fotograf.url if personel.fotograf else None,
            'notlar': personel.notlar or '',
            'kurum': {'id': personel.kurum.id, 'ad': personel.kurum.ad} if personel.kurum else None,
            'sube': {'id': personel.sube.id, 'ad': personel.sube.ad} if personel.sube else None,
            'created_at': format_datetime(personel.created_at),
            'updated_at': format_datetime(personel.updated_at),
            # Kullanıcı hesap bilgileri
            'has_user_account': account_meta['has_user_account'],
            'user': user_data,
            'user_ana_sube_ad': personel.sube.ad if personel.sube else None,
            'user_account_shared': account_meta['user_account_shared'],
            'user_account_owner_sube_ad': account_meta['user_account_owner_sube_ad'],
            'must_change_password': must_change_password,
        },
        'gorevlendirmeler': gorevlendirme_list,
        'aktivite_loglari': aktivite_list,
        'stats': stats,
    })


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_create_user_api(request, pk):
    """
    Personel için kullanıcı hesabı oluştur
    
    Kullanıcı adı: email veya tc_kimlik_no
    Şifre: TC Kimlik No (geçici)
    must_change_password: True
    Rol: aktif görevlendirme rolü (opsiyonel role_code ile override)
    """
    from apps.personel.domain.models import Personel
    from django.contrib.auth.models import User

    try:
        payload = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        payload = {}
    requested_role_code = (payload.get('role_code') or '').strip() or None
    
    try:
        personel = Personel.objects.get(pk=pk)
    except Personel.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    if personel.user:
        return JsonResponse({'success': False, 'error': 'Bu personelin zaten bir kullanıcı hesabı var'}, status=400)
    
    # Kullanıcı adı: email varsa email, yoksa tc_kimlik_no
    username = personel.email if personel.email else personel.tc_kimlik_no
    if not username:
        return JsonResponse({
            'success': False, 
            'error': 'Kullanıcı oluşturmak için email veya TC Kimlik No gerekli'
        }, status=400)
    
    # Şifre: TC Kimlik No
    password = personel.tc_kimlik_no
    if not password:
        return JsonResponse({
            'success': False, 
            'error': 'Geçici şifre için TC Kimlik No gerekli'
        }, status=400)
    
    # Kullanıcı adı kontrolü
    if User.objects.filter(username=username).exists():
        return JsonResponse({
            'success': False, 
            'error': f'Bu kullanıcı adı ({username}) zaten kullanılıyor'
        }, status=400)
    
    try:
        # Kullanıcı oluştur
        user = User.objects.create_user(
            username=username,
            email=personel.email or '',
            password=password,
            first_name=personel.ad,
            last_name=personel.soyad,
        )
        
        # Personel ile ilişkilendir
        personel.user = user
        personel.save()

        assigned_role = assign_user_role_for_personel(
            user,
            personel,
            role_code=requested_role_code,
            must_change_password=True,
        )
        
        return JsonResponse({
            'success': True,
            'message': 'Kullanıcı hesabı oluşturuldu',
            'data': {
                'username': username,
                'temp_password': password,  # TC Kimlik No
                'must_change_password': True,
                'role_code': assigned_role.role.code if assigned_role else None,
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False, 
            'error': f'Kullanıcı oluşturulurken hata: {str(e)}'
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_sync_user_role_api(request, pk):
    """Personel kullanıcı rolünü aktif görevlendirme rolü ile eşitle."""
    from apps.personel.domain.models import Personel

    try:
        payload = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        payload = {}
    requested_role_code = (payload.get('role_code') or '').strip() or None

    try:
        personel = Personel.objects.select_related('user', 'kurum').get(pk=pk)
    except Personel.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate

    if not personel.user:
        return JsonResponse({'success': False, 'error': 'Bu personelin kullanıcı hesabı yok'}, status=400)

    assigned_role = assign_user_role_for_personel(
        personel.user,
        personel,
        role_code=requested_role_code,
        must_change_password=False,
    )
    if not assigned_role:
        return JsonResponse({'success': False, 'error': 'Atanacak rol bulunamadı'}, status=400)

    return JsonResponse({
        'success': True,
        'message': 'Kullanıcı rolü güncellendi',
        'data': {
            'role_code': assigned_role.role.code,
            'role_name': assigned_role.role.name,
        },
    })


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_reset_password_api(request, pk):
    """Personel şifresini sıfırla (TC'ye çevir)"""
    from apps.personel.domain.models import Personel
    from apps.roller.models import UserRole
    
    try:
        personel = Personel.objects.select_related('user').get(pk=pk)
    except Personel.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    if not personel.user:
        return JsonResponse({'success': False, 'error': 'Bu personelin kullanıcı hesabı yok'}, status=400)
    
    if not personel.tc_kimlik_no:
        return JsonResponse({'success': False, 'error': 'TC Kimlik No olmadan şifre sıfırlanamaz'}, status=400)
    
    try:
        # Şifreyi TC'ye çevir
        personel.user.set_password(personel.tc_kimlik_no)
        personel.user.save()
        
        # must_change_password'u True yap
        try:
            user_role = UserRole.objects.get(user=personel.user)
            user_role.must_change_password = True
            user_role.save()
        except UserRole.DoesNotExist:
            pass
        
        return JsonResponse({
            'success': True,
            'message': 'Şifre sıfırlandı. Yeni şifre: TC Kimlik No',
            'data': {
                'temp_password': personel.tc_kimlik_no,
                'must_change_password': True
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False, 
            'error': f'Şifre sıfırlanırken hata: {str(e)}'
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@require_module_permission("personel")
def personel_log_activity_api(request, pk):
    """Personel aktivite logu kaydet"""
    from apps.personel.domain.models import Personel, PersonelAktiviteLog
    
    try:
        personel = Personel.objects.get(pk=pk)
    except Personel.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Personel bulunamadı'}, status=404)

    gate = _personel_sube_gate(request, personel)
    if gate:
        return gate
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
    
    eylem = data.get('eylem', 'OTHER')
    detay = data.get('detay', '')
    sayfa_url = data.get('sayfa_url', '')
    
    # IP adresi
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip_adresi = x_forwarded_for.split(',')[0]
    else:
        ip_adresi = request.META.get('REMOTE_ADDR')
    
    # User agent
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    
    # Session ID
    oturum_id = request.session.session_key or ''
    
    try:
        log = PersonelAktiviteLog.objects.create(
            personel=personel,
            eylem=eylem,
            detay=detay,
            ip_adresi=ip_adresi,
            user_agent=user_agent,
            sayfa_url=sayfa_url,
            oturum_id=oturum_id
        )
        
        return JsonResponse({
            'success': True,
            'message': 'Aktivite kaydedildi',
            'log_id': log.id
        })
    except Exception as e:
        return JsonResponse({
            'success': False, 
            'error': f'Aktivite kaydedilemedi: {str(e)}'
        }, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def my_subeler_api(request):
    """
    Oturum açmış kullanıcının erişebileceği şubeler.

    GET /personel/api/my-subeler/?kurum_id=X&egitim_yili_id=Y

    kurum_yoneticisi → kurumdaki tüm şubeler
    Diğer roller (muhasebe dahil) → görevlendirme şubeleri (aktif eğitim yılı)
    """
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'Oturum gerekli'}, status=401)

    ctx = get_current_context(request)
    kurum_id = request.GET.get('kurum_id') or ctx.get('kurum_id')
    egitim_yili_id = request.GET.get('egitim_yili_id') or ctx.get('egitim_yili_id')

    kurum_id = int(kurum_id) if kurum_id else None
    egitim_yili_id = int(egitim_yili_id) if egitim_yili_id else None

    from shared.sube_access import (
        get_allowed_subeler_for_user,
        user_needs_sube_picker,
        user_requires_login_sube_selection,
        user_has_global_sube_access,
        serialize_sube,
        get_user_role_code,
    )

    subeler = get_allowed_subeler_for_user(
        request.user,
        kurum_id=kurum_id,
        egitim_yili_id=egitim_yili_id,
    )

    return JsonResponse({
        'success': True,
        'subeler': [serialize_sube(s) for s in subeler],
        'toplam': subeler.count(),
        'role_code': get_user_role_code(request.user),
        'global_sube_access': user_has_global_sube_access(request.user),
        'needs_sube_picker': user_needs_sube_picker(
            request.user,
            kurum_id=kurum_id,
            egitim_yili_id=egitim_yili_id,
        ),
        'requires_login_sube_selection': user_requires_login_sube_selection(
            request.user,
            kurum_id=kurum_id,
            egitim_yili_id=egitim_yili_id,
        ),
    })


@csrf_exempt
@require_http_methods(["GET"])
def my_kurumlar_api(request):
    """
    Oturum açmış kullanıcının erişebileceği kurumlar.

    GET /personel/api/my-kurumlar/
    """
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'Oturum gerekli'}, status=401)

    from shared.kurum_access import (
        get_allowed_kurumlar_for_user,
        user_needs_kurum_picker,
        serialize_kurum,
    )

    kurumlar = get_allowed_kurumlar_for_user(request.user)

    return JsonResponse({
        'success': True,
        'kurumlar': [serialize_kurum(k) for k in kurumlar],
        'toplam': kurumlar.count(),
        'needs_kurum_picker': user_needs_kurum_picker(request.user),
    })


@csrf_exempt
@require_http_methods(["GET"])
def finans_yetkili_personel_api(request):
    """
    Mali hesap yetkilisi adayı personel listesi.

    GET /personel/api/finans-yetkililer/?kurum_id=X&egitim_yili_id=Y

    Sadece kurum_yoneticisi ve muhasebe rollerindeki aktif personeller.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'Oturum gerekli'}, status=401)

    from apps.personel.domain.models import PersonelGorevlendirme
    from apps.personel.interfaces.sube_context import mandatory_personel_context

    ctx, err = mandatory_personel_context(request)
    if err:
        return err

    kurum_id = ctx['kurum_id']
    sube_id = ctx['sube_id']
    egitim_yili_id = request.GET.get('egitim_yili_id') or ctx.get('egitim_yili_id')
    egitim_yili_id = int(egitim_yili_id) if egitim_yili_id else ctx.get('egitim_yili_id')

    YETKILI_ROL_CODES = ('kurum_yoneticisi', 'muhasebe')

    gorev_qs = PersonelGorevlendirme.objects.filter(
        kurum_id=kurum_id,
        gorev_sube_id=sube_id,
        rol__code__in=YETKILI_ROL_CODES,
        aktif_mi=True,
        personel__aktif_mi=True,
    ).select_related('personel', 'rol', 'gorev_sube')

    if egitim_yili_id:
        gorev_qs = gorev_qs.filter(egitim_yili_id=egitim_yili_id)

    seen = set()
    personeller = []
    for g in gorev_qs.order_by('personel__soyad', 'personel__ad'):
        p = g.personel
        if p.id in seen:
            continue
        seen.add(p.id)
        personeller.append({
            'id': p.id,
            'ad': p.ad,
            'soyad': p.soyad,
            'tam_ad': p.tam_ad,
            'email': p.email or '',
            'telefon': p.cep_telefon or p.telefon or '',
            'rol_kodu': g.rol.code if g.rol else '',
            'rol_adi': g.rol.name if g.rol else '',
            'gorev_sube_ad': g.gorev_sube.ad if g.gorev_sube_id else '',
        })

    return JsonResponse({
        'success': True,
        'personeller': personeller,
        'toplam': len(personeller),
    })

