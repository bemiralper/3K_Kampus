"""
Term API Views
"""
import json
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError

from apps.term.domain.models import Term
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from shared.context import (
    get_secili_egitim_yili_id,
    resolve_tenant_context,
)
from django.db import IntegrityError


def parse_date(date_str):
    """String tarihi date objesine çevir"""
    if not date_str:
        return None
    if isinstance(date_str, datetime):
        return date_str.date()
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


@require_http_methods(["GET"])
def active_year_api(request):
    """
    Aktif eğitim yılını döndür
    GET /api/terms/active-year/
    """
    egitim_yili_id = get_secili_egitim_yili_id(request)
    if not egitim_yili_id:
        _, _, egitim_yili_id = resolve_tenant_context(request)
    
    if egitim_yili_id:
        try:
            egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
            return JsonResponse({
                'success': True,
                'data': {
                    'id': egitim_yili.id,
                    'baslangic_yil': egitim_yili.baslangic_yil,
                    'bitis_yil': egitim_yili.bitis_yil,
                    'aktif_mi': egitim_yili.aktif_mi,
                    'display': f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
                }
            })
        except EgitimYili.DoesNotExist:
            pass
    
    # Fallback: aktif yılı bul
    try:
        egitim_yili = EgitimYili.objects.filter(aktif_mi=True).first()
        if egitim_yili:
            return JsonResponse({
                'success': True,
                'data': {
                    'id': egitim_yili.id,
                    'baslangic_yil': egitim_yili.baslangic_yil,
                    'bitis_yil': egitim_yili.bitis_yil,
                    'aktif_mi': egitim_yili.aktif_mi,
                    'display': f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
                }
            })
    except Exception:
        pass
    
    return JsonResponse({
        'success': False,
        'error': 'Aktif eğitim yılı bulunamadı'
    }, status=404)



@require_http_methods(["GET"])
def term_list_api(request):
    """
    Dönem listesi
    GET /api/terms/
    """
    kurum_id, sube_id, egitim_yili_id = resolve_tenant_context(request)
    
    if not kurum_id or not sube_id:
        return JsonResponse({
            'error': 'Kurum ve şube bilgisi gerekli. Üst menüden kurum/şube seçin veya önce şube tanımlayın.'
        }, status=400)
    
    terms = Term.objects.filter(kurum_id=kurum_id, sube_id=sube_id)
    
    if egitim_yili_id:
        terms = terms.filter(egitim_yili_id=egitim_yili_id)
    
    terms = terms.select_related('egitim_yili').order_by('order_no', 'start_date')
    
    data = []
    for term in terms:
        data.append({
            'id': term.id,
            'name': term.name,
            'code': term.code,
            'term_type': term.term_type,
            'term_type_display': term.get_term_type_display(),
            'start_date': term.start_date.isoformat() if term.start_date else None,
            'end_date': term.end_date.isoformat() if term.end_date else None,
            'order_no': term.order_no,
            'is_active': term.is_active,
            'program_olusturulabilir': term.program_olusturulabilir,
            'yoklama_acik': term.yoklama_acik,
            'not_girisi_acik': term.not_girisi_acik,
            'ogrenci_kayit_acik': term.ogrenci_kayit_acik,
            'schedule_locked': term.schedule_locked,
            'auto_generate_enabled': term.auto_generate_enabled,
            'allow_conflict_override': term.allow_conflict_override,
            'egitim_yili': {
                'id': term.egitim_yili.id,
                'display': f"{term.egitim_yili.baslangic_yil}-{term.egitim_yili.bitis_yil}"
            }
        })
    
    return JsonResponse({
        'success': True,
        'terms': data
    })


@csrf_exempt
@require_http_methods(["POST"])
def term_create_api(request):
    """
    Yeni dönem oluştur
    POST /api/terms/
    """
    kurum_id, sube_id, egitim_yili_id = resolve_tenant_context(request)
    
    if not kurum_id or not sube_id:
        return JsonResponse({
            'error': 'Kurum ve şube bilgisi gerekli. Üst menüden kurum/şube seçin veya önce şube tanımlayın.'
        }, status=400)
    
    if not egitim_yili_id:
        return JsonResponse({'error': 'Aktif eğitim yılı gerekli. Lütfen bir eğitim yılı seçin.'}, status=400)

    try:
        kurum = Kurum.objects.get(id=kurum_id)
    except Kurum.DoesNotExist:
        return JsonResponse({
            'error': 'Seçili kurum bulunamadı. Üst menüden geçerli bir kurum seçin.'
        }, status=400)

    try:
        sube = Sube.objects.get(id=sube_id, kurum_id=kurum_id)
    except Sube.DoesNotExist:
        return JsonResponse({
            'error': 'Seçili şube bulunamadı veya kuruma ait değil. Lütfen şube seçimini güncelleyin.'
        }, status=400)
    
    try:
        egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
    except EgitimYili.DoesNotExist:
        return JsonResponse({'error': 'Eğitim yılı bulunamadı'}, status=404)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON formatı'}, status=400)
    
    # Zorunlu alanlar
    name = data.get('name', '').strip()
    code = data.get('code', '').strip()
    start_date_str = data.get('start_date')
    end_date_str = data.get('end_date')
    
    if not name:
        return JsonResponse({'error': 'Dönem adı zorunludur'}, status=400)
    if not code:
        return JsonResponse({'error': 'Kısa kod zorunludur'}, status=400)
    if not start_date_str:
        return JsonResponse({'error': 'Başlangıç tarihi zorunludur'}, status=400)
    if not end_date_str:
        return JsonResponse({'error': 'Bitiş tarihi zorunludur'}, status=400)
    
    # Tarihleri parse et
    start_date = parse_date(start_date_str)
    end_date = parse_date(end_date_str)
    
    if not start_date:
        return JsonResponse({'error': 'Geçersiz başlangıç tarihi formatı (YYYY-MM-DD bekleniyor)'}, status=400)
    if not end_date:
        return JsonResponse({'error': 'Geçersiz bitiş tarihi formatı (YYYY-MM-DD bekleniyor)'}, status=400)
    
    if start_date >= end_date:
        return JsonResponse({'error': 'Başlangıç tarihi bitiş tarihinden önce olmalıdır'}, status=400)
    
    # Kod benzersizlik kontrolü
    if Term.objects.filter(kurum_id=kurum_id, sube_id=sube_id, egitim_yili=egitim_yili, code=code).exists():
        return JsonResponse({'error': f'"{code}" kodu bu eğitim yılında zaten kullanılıyor'}, status=400)
    
    try:
        term = Term.objects.create(
            kurum=kurum,
            sube=sube,
            egitim_yili=egitim_yili,
            name=name,
            code=code,
            term_type=data.get('term_type', 'regular'),
            start_date=start_date,
            end_date=end_date,
            order_no=data.get('order_no', 1),
            is_active=data.get('is_active', True),
            program_olusturulabilir=data.get('program_olusturulabilir', True),
            yoklama_acik=data.get('yoklama_acik', True),
            not_girisi_acik=data.get('not_girisi_acik', False),
            ogrenci_kayit_acik=data.get('ogrenci_kayit_acik', True),
            schedule_locked=data.get('schedule_locked', False),
            auto_generate_enabled=data.get('auto_generate_enabled', True),
            allow_conflict_override=data.get('allow_conflict_override', False),
        )
        
        return JsonResponse({
            'success': True,
            'message': f'"{term.name}" dönemi başarıyla oluşturuldu',
            'data': {
                'id': term.id,
                'name': term.name,
                'code': term.code
            }
        }, status=201)
        
    except ValidationError as e:
        return JsonResponse({'error': str(e)}, status=400)
    except IntegrityError:
        return JsonResponse({
            'error': 'Seçili kurum/şube/eğitim yılı geçersiz. Sayfayı yenileyip üst menüden tekrar seçim yapın.'
        }, status=400)
    except Exception as e:
        return JsonResponse({'error': f'Dönem oluşturulamadı: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["PATCH", "PUT"])
def term_update_api(request, term_id):
    """
    Dönem güncelle
    PATCH /api/terms/{id}/
    """
    kurum_id, sube_id, _ = resolve_tenant_context(request)
    
    if not kurum_id or not sube_id:
        return JsonResponse({
            'error': 'Kurum ve şube bilgisi gerekli. Üst menüden kurum/şube seçin veya önce şube tanımlayın.'
        }, status=400)
    
    try:
        term = Term.objects.get(id=term_id, kurum_id=kurum_id, sube_id=sube_id)
    except Term.DoesNotExist:
        return JsonResponse({'error': 'Dönem bulunamadı'}, status=404)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON formatı'}, status=400)
    
    # Güncellenebilir alanlar
    if 'name' in data:
        term.name = data['name'].strip()
    if 'code' in data:
        new_code = data['code'].strip()
        # Kod benzersizlik kontrolü (kendi kaydı hariç)
        if Term.objects.filter(
            kurum_id=kurum_id, 
            sube_id=sube_id, 
            egitim_yili=term.egitim_yili, 
            code=new_code
        ).exclude(id=term_id).exists():
            return JsonResponse({'error': f'"{new_code}" kodu bu eğitim yılında zaten kullanılıyor'}, status=400)
        term.code = new_code
    if 'term_type' in data:
        term.term_type = data['term_type']
    if 'start_date' in data:
        parsed_start = parse_date(data['start_date'])
        if parsed_start:
            term.start_date = parsed_start
    if 'end_date' in data:
        parsed_end = parse_date(data['end_date'])
        if parsed_end:
            term.end_date = parsed_end
    if 'order_no' in data:
        term.order_no = data['order_no']
    if 'is_active' in data:
        term.is_active = data['is_active']
    if 'program_olusturulabilir' in data:
        term.program_olusturulabilir = data['program_olusturulabilir']
    if 'yoklama_acik' in data:
        term.yoklama_acik = data['yoklama_acik']
    if 'not_girisi_acik' in data:
        term.not_girisi_acik = data['not_girisi_acik']
    if 'ogrenci_kayit_acik' in data:
        term.ogrenci_kayit_acik = data['ogrenci_kayit_acik']
    if 'schedule_locked' in data:
        term.schedule_locked = data['schedule_locked']
    if 'auto_generate_enabled' in data:
        term.auto_generate_enabled = data['auto_generate_enabled']
    if 'allow_conflict_override' in data:
        term.allow_conflict_override = data['allow_conflict_override']
    
    try:
        term.full_clean()
        term.save()
        
        return JsonResponse({
            'success': True,
            'message': f'"{term.name}" dönemi başarıyla güncellendi'
        })
        
    except ValidationError as e:
        return JsonResponse({'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'error': f'Dönem güncellenemedi: {str(e)}'}, status=500)



@require_http_methods(["GET"])
def term_detail_api(request, term_id):
    """
    Dönem detayı
    GET /api/terms/{id}/
    """
    kurum_id, sube_id, _ = resolve_tenant_context(request)
    
    if not kurum_id or not sube_id:
        return JsonResponse({
            'error': 'Kurum ve şube bilgisi gerekli. Üst menüden kurum/şube seçin veya önce şube tanımlayın.'
        }, status=400)
    
    try:
        term = Term.objects.select_related('egitim_yili').get(
            id=term_id, kurum_id=kurum_id, sube_id=sube_id
        )
    except Term.DoesNotExist:
        return JsonResponse({'error': 'Dönem bulunamadı'}, status=404)
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': term.id,
            'name': term.name,
            'code': term.code,
            'term_type': term.term_type,
            'term_type_display': term.get_term_type_display(),
            'start_date': term.start_date.isoformat() if term.start_date else None,
            'end_date': term.end_date.isoformat() if term.end_date else None,
            'order_no': term.order_no,
            'is_active': term.is_active,
            'program_olusturulabilir': term.program_olusturulabilir,
            'yoklama_acik': term.yoklama_acik,
            'not_girisi_acik': term.not_girisi_acik,
            'ogrenci_kayit_acik': term.ogrenci_kayit_acik,
            'schedule_locked': term.schedule_locked,
            'auto_generate_enabled': term.auto_generate_enabled,
            'allow_conflict_override': term.allow_conflict_override,
            'egitim_yili': {
                'id': term.egitim_yili.id,
                'display': f"{term.egitim_yili.baslangic_yil}-{term.egitim_yili.bitis_yil}"
            }
        }
    })
