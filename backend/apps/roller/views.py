"""
Rol Yönetimi API Views
"""
import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Count, Q
from django.utils import timezone

from .models import Role, Permission, RolePermission


def _serialize_role(role):
    return {
        'id': role.id,
        'code': role.code,
        'name': role.name,
        'description': role.description,
        'level': role.level,
        'is_system_role': role.is_system_role,
        'is_active': role.is_active,
        'silindi_mi': role.silindi_mi,
        'silinme_tarihi': role.silinme_tarihi.isoformat() if role.silinme_tarihi else None,
        'permission_count': getattr(role, 'permission_count', None),
        'created_at': role.created_at.isoformat(),
        'updated_at': role.updated_at.isoformat(),
    }


def _get_role_or_404(pk):
    try:
        return Role.all_objects.get(pk=pk), None
    except Role.DoesNotExist:
        return None, JsonResponse({
            'success': False,
            'error': 'Rol bulunamadı'
        }, status=404)


@csrf_exempt
@require_http_methods(["GET"])
def role_list_api(request):
    """
    Tüm rolleri listele
    
    Query params:
    - is_active: true/false
    - is_system_role: true/false
    - silindi_mi: true (silinen rolleri listele)
    - search: arama terimi
    """
    silindi = request.GET.get('silindi_mi')
    if silindi == 'true':
        queryset = Role.all_objects.filter(silindi_mi=True)
    else:
        queryset = Role.objects.all()
    
    # Filtreler
    is_active = request.GET.get('is_active')
    if is_active == 'true':
        queryset = queryset.filter(is_active=True)
    elif is_active == 'false':
        queryset = queryset.filter(is_active=False)
    
    is_system = request.GET.get('is_system_role')
    if is_system == 'true':
        queryset = queryset.filter(is_system_role=True)
    elif is_system == 'false':
        queryset = queryset.filter(is_system_role=False)
    
    search = request.GET.get('search', '').strip()
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search) |
            Q(code__icontains=search) |
            Q(description__icontains=search)
        )
    
    # Yetki sayısı ile birlikte al
    queryset = queryset.annotate(
        permission_count=Count('permissions')
    ).order_by('level', 'name')
    
    roles = [
        _serialize_role(role)
        for role in queryset
    ]
    
    return JsonResponse({
        'success': True,
        'roles': roles,
        'total': len(roles)
    })


@csrf_exempt
@require_http_methods(["POST"])
def role_create_api(request):
    """Yeni rol oluştur"""
    try:
        data = json.loads(request.body)
        
        code = data.get('code', '').strip()
        name = data.get('name', '').strip()
        
        if not code:
            return JsonResponse({
                'success': False,
                'error': 'Rol kodu gereklidir'
            }, status=400)
        
        if not name:
            return JsonResponse({
                'success': False,
                'error': 'Rol adı gereklidir'
            }, status=400)
        
        # Kod benzersizliği kontrolü (aktif kayıtlar)
        if Role.objects.filter(code=code).exists():
            return JsonResponse({
                'success': False,
                'error': f'"{code}" kodu ile bir rol zaten mevcut'
            }, status=400)

        deleted_role = Role.all_objects.filter(code=code, silindi_mi=True).first()
        if deleted_role:
            return JsonResponse({
                'success': False,
                'error': (
                    f'"{code}" kodu silinmiş bir rolde kullanılıyor. '
                    'Yeni rol oluşturmak yerine silinen roller listesinden geri getirebilirsiniz.'
                ),
                'deleted_role_id': deleted_role.id,
            }, status=400)
        
        role = Role.objects.create(
            code=code,
            name=name,
            description=data.get('description', ''),
            level=data.get('level', 100),
            is_system_role=False,  # API'den oluşturulan roller sistem rolü olamaz
            is_active=data.get('is_active', True)
        )
        
        # Yetkiler varsa ekle
        permission_ids = data.get('permission_ids', [])
        if permission_ids:
            permissions = Permission.objects.filter(id__in=permission_ids, is_active=True)
            for perm in permissions:
                RolePermission.objects.create(
                    role=role,
                    permission=perm,
                    granted_by=request.user if request.user.is_authenticated else None
                )
        
        return JsonResponse({
            'success': True,
            'role': {
                'id': role.id,
                'code': role.code,
                'name': role.name,
                'description': role.description,
                'level': role.level,
                'is_system_role': role.is_system_role,
                'is_active': role.is_active,
            },
            'message': 'Rol başarıyla oluşturuldu'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON verisi'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def role_detail_api(request, pk):
    """Rol detay, güncelleme ve silme"""
    role, error_response = _get_role_or_404(pk)
    if error_response:
        return error_response
    
    if request.method == 'GET':
        # Rol detayı
        permissions = role.permissions.filter(is_active=True).values(
            'id', 'code', 'name', 'module', 'permission_type'
        )
        
        return JsonResponse({
            'success': True,
            'role': {
                **_serialize_role(role),
                'permissions': list(permissions),
            }
        })
    
    elif request.method == 'PUT':
        if role.silindi_mi:
            return JsonResponse({
                'success': False,
                'error': 'Silinmiş rol düzenlenemez. Önce geri getirin.'
            }, status=400)
        # Rol güncelleme
        try:
            data = json.loads(request.body)
            
            # Sistem rolü kodu değiştirilemez
            if role.is_system_role:
                if 'code' in data and data['code'] != role.code:
                    return JsonResponse({
                        'success': False,
                        'error': 'Sistem rolünün kodu değiştirilemez'
                    }, status=400)
            else:
                new_code = data.get('code', '').strip()
                if new_code and new_code != role.code:
                    if Role.objects.filter(code=new_code).exclude(pk=pk).exists():
                        return JsonResponse({
                            'success': False,
                            'error': f'"{new_code}" kodu ile bir rol zaten mevcut'
                        }, status=400)
                    role.code = new_code
            
            # Diğer alanları güncelle
            if 'name' in data:
                role.name = data['name'].strip()
            if 'description' in data:
                role.description = data['description']
            if 'level' in data:
                role.level = data['level']
            if 'is_active' in data:
                role.is_active = data['is_active']
            
            role.save()
            
            # Yetkiler güncelle
            if 'permission_ids' in data:
                # Mevcut yetkileri temizle
                RolePermission.objects.filter(role=role).delete()
                
                # Yeni yetkiler ekle
                permission_ids = data['permission_ids']
                permissions = Permission.objects.filter(id__in=permission_ids, is_active=True)
                for perm in permissions:
                    RolePermission.objects.create(
                        role=role,
                        permission=perm,
                        granted_by=request.user if request.user.is_authenticated else None
                    )
            
            return JsonResponse({
                'success': True,
                'message': 'Rol başarıyla güncellendi'
            })
            
        except json.JSONDecodeError:
            return JsonResponse({
                'success': False,
                'error': 'Geçersiz JSON verisi'
            }, status=400)
    
    elif request.method == 'DELETE':
        if role.silindi_mi:
            return JsonResponse({
                'success': False,
                'error': 'Rol zaten silinmiş'
            }, status=400)

        # Rol silme (soft delete)
        if role.is_system_role:
            return JsonResponse({
                'success': False,
                'error': 'Sistem rolleri silinemez'
            }, status=400)
        
        # Kullanıcı ataması var mı kontrol et
        if role.user_roles.exists():
            return JsonResponse({
                'success': False,
                'error': 'Bu role atanmış kullanıcılar var. Önce kullanıcı atamalarını kaldırın.'
            }, status=400)
        
        role.silindi_mi = True
        role.silinme_tarihi = timezone.now()
        role.save(update_fields=['silindi_mi', 'silinme_tarihi', 'updated_at'])
        
        return JsonResponse({
            'success': True,
            'message': 'Rol silindi. İsterseniz silinen roller listesinden geri getirebilirsiniz.'
        })


@csrf_exempt
@require_http_methods(["POST"])
def role_restore_api(request, pk):
    """Silinmiş rolü geri getir"""
    role, error_response = _get_role_or_404(pk)
    if error_response:
        return error_response

    if not role.silindi_mi:
        return JsonResponse({
            'success': False,
            'error': 'Rol zaten aktif'
        }, status=400)

    conflict = Role.objects.filter(code=role.code).exclude(pk=role.pk).exists()
    if conflict:
        return JsonResponse({
            'success': False,
            'error': f'"{role.code}" kodu başka bir aktif rol tarafından kullanılıyor'
        }, status=400)

    role.silindi_mi = False
    role.silinme_tarihi = None
    role.save(update_fields=['silindi_mi', 'silinme_tarihi', 'updated_at'])

    return JsonResponse({
        'success': True,
        'message': 'Rol başarıyla geri getirildi',
        'role': _serialize_role(role),
    })


@csrf_exempt
@require_http_methods(["GET"])
def permission_list_api(request):
    """
    Tüm yetkileri listele
    
    Query params:
    - module: modül filtresi
    - permission_type: yetki türü filtresi
    """
    queryset = Permission.objects.filter(is_active=True)
    
    module = request.GET.get('module')
    if module:
        queryset = queryset.filter(module=module)
    
    perm_type = request.GET.get('permission_type')
    if perm_type:
        queryset = queryset.filter(permission_type=perm_type)
    
    queryset = queryset.order_by('module', 'permission_type', 'code')
    
    permissions = [
        {
            'id': perm.id,
            'code': perm.code,
            'name': perm.name,
            'description': perm.description,
            'module': perm.module,
            'permission_type': perm.permission_type,
        }
        for perm in queryset
    ]
    
    # Modüllere göre grupla
    modules = {}
    for perm in permissions:
        mod = perm['module']
        if mod not in modules:
            modules[mod] = []
        modules[mod].append(perm)
    
    return JsonResponse({
        'success': True,
        'permissions': permissions,
        'modules': modules,
        'total': len(permissions)
    })


@csrf_exempt
@require_http_methods(["GET"])
def role_stats_api(request):
    """Rol istatistikleri"""
    total_roles = Role.objects.count()
    active_roles = Role.objects.filter(is_active=True).count()
    system_roles = Role.objects.filter(is_system_role=True).count()
    custom_roles = Role.objects.filter(is_system_role=False).count()
    deleted_roles = Role.all_objects.filter(silindi_mi=True).count()
    
    total_permissions = Permission.objects.filter(is_active=True).count()
    modules = Permission.objects.filter(is_active=True).values('module').distinct().count()
    
    return JsonResponse({
        'success': True,
        'stats': {
            'total_roles': total_roles,
            'active_roles': active_roles,
            'system_roles': system_roles,
            'custom_roles': custom_roles,
            'deleted_roles': deleted_roles,
            'total_permissions': total_permissions,
            'total_modules': modules,
        }
    })
