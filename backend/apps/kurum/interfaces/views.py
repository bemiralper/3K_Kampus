"""
Kurum Views
Presentation layer - TAB-based logic
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.urls import reverse
from apps.kurum.application.service import KurumService
from apps.sube.application.service import SubeService
from apps.egitim_yili.application.service import EgitimYiliService
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.egitim_yili.domain.models import EgitimYili


@login_required
def kurum_tanimlar(request):
    """
    Kurum Tanımları - TAB-based view
    Handles: kurumlar | subeler | egitim_yillari
    """
    # Get active tab from query param
    active_tab = request.GET.get('tab', 'kurumlar')
    
    # Initialize services
    kurum_service = KurumService()
    sube_service = SubeService()
    egitim_yili_service = EgitimYiliService()
    
    # Get selected filters from session
    selected_kurum_id = request.GET.get('kurum_id') or request.session.get('selected_kurum_id')
    selected_sube_id = request.GET.get('sube_id') or request.session.get('selected_sube_id')
    
    # Load data based on active tab
    kurumlar = []
    subeler = []
    egitim_yillari = []
    
    if active_tab == 'kurumlar':
        kurumlar = kurum_service.list_all_kurumlar()
    
    elif active_tab == 'subeler':
        if selected_kurum_id:
            subeler = sube_service.list_subeler(kurum_id=int(selected_kurum_id))
            request.session['selected_kurum_id'] = int(selected_kurum_id)
        else:
            subeler = sube_service.list_subeler()
    
    elif active_tab == 'egitim_yillari':
        if selected_kurum_id and selected_sube_id:
            egitim_yillari = egitim_yili_service.list_egitim_yillari(
                kurum_id=int(selected_kurum_id),
                sube_id=int(selected_sube_id)
            )
            request.session['selected_kurum_id'] = int(selected_kurum_id)
            request.session['selected_sube_id'] = int(selected_sube_id)
        else:
            egitim_yillari = egitim_yili_service.list_egitim_yillari()
    
    # Get all kurumlar and subeler for dropdowns
    all_kurumlar = kurum_service.list_all_kurumlar()
    all_subeler = []
    if selected_kurum_id:
        all_subeler = sube_service.list_subeler(kurum_id=int(selected_kurum_id))
    
    context = {
        'active_tab': active_tab,
        'kurumlar': kurumlar,
        'subeler': subeler,
        'egitim_yillari': egitim_yillari,
        'all_kurumlar': all_kurumlar,
        'all_subeler': all_subeler,
        'selected_kurum_id': int(selected_kurum_id) if selected_kurum_id else None,
        'selected_sube_id': int(selected_sube_id) if selected_sube_id else None,
    }
    
    return render(request, 'kurum/kurum_tanimlar.html', context)


@login_required
def kurum_create(request):
    """Create new institution"""
    if request.method == 'POST':
        service = KurumService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'telefon_sabit': request.POST.get('telefon_sabit', ''),
            'telefon_cep': request.POST.get('telefon_cep', ''),
            'yetkili_ad_soyad': request.POST.get('yetkili_ad_soyad', ''),
            'vergi_no': request.POST.get('vergi_no', ''),
            'vergi_dairesi': request.POST.get('vergi_dairesi', ''),
            'adres': request.POST.get('adres', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            kurum = service.create_kurum(data)
            messages.success(request, f'{kurum.ad} başarıyla oluşturuldu.')
            return redirect(reverse('kurum:tanimlar') + '?tab=kurumlar')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('kurum:tanimlar') + '?tab=kurumlar')


@login_required
def kurum_update(request, kurum_id):
    """Update institution"""
    service = KurumService()
    
    if request.method == 'POST':
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'telefon_sabit': request.POST.get('telefon_sabit', ''),
            'telefon_cep': request.POST.get('telefon_cep', ''),
            'yetkili_ad_soyad': request.POST.get('yetkili_ad_soyad', ''),
            'vergi_no': request.POST.get('vergi_no', ''),
            'vergi_dairesi': request.POST.get('vergi_dairesi', ''),
            'adres': request.POST.get('adres', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            kurum = service.update_kurum(kurum_id, data)
            if kurum:
                messages.success(request, f'{kurum.ad} başarıyla güncellendi.')
            else:
                messages.error(request, 'Kurum bulunamadı.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('kurum:tanimlar') + '?tab=kurumlar')


@login_required
def kurum_delete(request, kurum_id):
    """Delete institution with CASCADE warning"""
    service = KurumService()
    
    if request.method == 'POST':
        confirmed = request.POST.get('confirmed') == 'true'
        
        if not confirmed:
            # Get deletion impact info
            info = service.get_kurum_delete_info(kurum_id)
            if not info['exists']:
                messages.error(request, 'Kurum bulunamadı.')
                return redirect(reverse('kurum:tanimlar') + '?tab=kurumlar')
            
            # Return warning info as JSON for modal/confirmation
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse(info)
            
            messages.error(request, 'Silme işlemi onaylanmadı.')
        else:
            # Confirmed deletion
            if service.delete_kurum(kurum_id):
                messages.success(request, 'Kurum ve bağlı tüm veriler başarıyla silindi.')
            else:
                messages.error(request, 'Kurum silinemedi.')
    
    return redirect(reverse('kurum:tanimlar') + '?tab=kurumlar')


@login_required
def sube_create(request):
    """Create new branch"""
    if request.method == 'POST':
        service = SubeService()
        
        kurum_id = request.POST.get('kurum')
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'kurum_id': kurum_id,
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'adres': request.POST.get('adres', ''),
            'telefon': request.POST.get('telefon', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            sube = service.create_sube(data)
            messages.success(request, f'{sube.ad} başarıyla oluşturuldu.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('kurum:tanimlar') + '?tab=subeler')


@login_required
def sube_update(request, sube_id):
    """Update branch"""
    if request.method == 'POST':
        service = SubeService()
        
        # Önce mevcut şubeyi al (kurum_id'yi bilmek için)
        sube = service.get_sube(sube_id)
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'adres': request.POST.get('adres', ''),
            'telefon': request.POST.get('telefon', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            sube = service.update_sube(sube_id, data)
            if sube:
                messages.success(request, f'{sube.ad} başarıyla güncellendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('kurum:tanimlar') + '?tab=subeler')


@login_required
def sube_delete(request, sube_id):
    """Delete branch with CASCADE warning"""
    service = SubeService()
    
    if request.method == 'POST':
        confirmed = request.POST.get('confirmed') == 'true'
        
        if not confirmed:
            # Get deletion impact info
            info = service.get_sube_delete_info(sube_id)
            if not info['exists']:
                messages.error(request, 'Şube bulunamadı.')
                return redirect(reverse('kurum:tanimlar') + '?tab=subeler')
            
            # Return warning info as JSON for modal/confirmation
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse(info)
            
            messages.error(request, 'Silme işlemi onaylanmadı.')
        else:
            # Confirmed deletion
            if service.delete_sube(sube_id):
                messages.success(request, 'Şube ve bağlı tüm veriler başarıyla silindi.')
            else:
                messages.error(request, 'Şube silinemedi.')
    
    return redirect(reverse('kurum:tanimlar') + '?tab=subeler')


@login_required
def egitim_yili_create(request):
    """Create new education year"""
    if request.method == 'POST':
        service = EgitimYiliService()
        
        kurum_id = request.POST.get('kurum')
        sube_id = request.POST.get('sube')
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'yil': request.POST.get('yil'),
            'aktif_mi': aktif_mi,
        }
        
        try:
            # Eğer yeni eğitim yılı aktif olacaksa, önce aynı kurum-şubedeki tüm eğitim yıllarını pasif yap
            if aktif_mi and kurum_id and sube_id:
                from apps.egitim_yili.domain.models import EgitimYili
                EgitimYili.objects.filter(
                    kurum_id=kurum_id,
                    sube_id=sube_id,
                    aktif_mi=True
                ).update(aktif_mi=False)
            
            egitim_yili = service.create_egitim_yili(data, create_schema=True)
            messages.success(request, f'{egitim_yili.yil} eğitim yılı başarıyla oluşturuldu.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('kurum:tanimlar') + '?tab=egitim_yillari')


@login_required
def egitim_yili_update(request, egitim_yili_id):
    """Update education year"""
    if request.method == 'POST':
        service = EgitimYiliService()
        
        # Önce mevcut eğitim yılını al (kurum_id ve sube_id'yi bilmek için)
        egitim_yili_obj = service.get_egitim_yili(egitim_yili_id)
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'yil': request.POST.get('yil'),
            'aktif_mi': aktif_mi,
        }
        
        try:
            # Eğer bu eğitim yılı aktif olacaksa, önce aynı kurum-şubedeki diğer tüm eğitim yıllarını pasif yap
            if aktif_mi and egitim_yili_obj:
                from apps.egitim_yili.domain.models import EgitimYili
                EgitimYili.objects.filter(
                    kurum_id=egitim_yili_obj.kurum_id,
                    sube_id=egitim_yili_obj.sube_id,
                    aktif_mi=True
                ).exclude(id=egitim_yili_id).update(aktif_mi=False)
            
            egitim_yili = service.update_egitim_yili(egitim_yili_id, data)
            if egitim_yili:
                messages.success(request, f'{egitim_yili.yil} eğitim yılı başarıyla güncellendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('kurum:tanimlar') + '?tab=egitim_yillari')


@login_required
def egitim_yili_delete(request, egitim_yili_id):
    """Delete education year with schema drop warning"""
    service = EgitimYiliService()
    
    if request.method == 'POST':
        confirmed = request.POST.get('confirmed') == 'true'
        
        if not confirmed:
            # Get deletion impact info
            info = service.get_egitim_yili_delete_info(egitim_yili_id)
            if not info['exists']:
                messages.error(request, 'Eğitim yılı bulunamadı.')
                return redirect(reverse('kurum:tanimlar') + '?tab=egitim_yillari')
            
            # Return warning info as JSON for modal/confirmation
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse(info)
            
            messages.error(request, 'Silme işlemi onaylanmadı.')
        else:
            # Confirmed deletion - get schema name before deleting
            egitim_yili = service.get_egitim_yili(egitim_yili_id)
            
            if service.delete_egitim_yili(egitim_yili_id):
                # Drop schema (CASCADE with all data)
                if egitim_yili:
                    from shared.db.schema_manager import SchemaManager
                    schema_manager = SchemaManager()
                    schema_manager.drop_schema(egitim_yili.schema_adi, cascade=True)
                    messages.success(request, 'Eğitim yılı ve tüm veriler başarıyla silindi.')
                else:
                    messages.success(request, 'Eğitim yılı başarıyla silindi.')
            else:
                messages.error(request, 'Eğitim yılı silinemedi.')
    
    return redirect(reverse('kurum:tanimlar') + '?tab=egitim_yillari')


@login_required
def get_subeler_by_kurum(request, kurum_id):
    """AJAX endpoint: Get branches by institution"""
    service = SubeService()
    subeler = service.list_subeler(kurum_id=kurum_id)
    
    data = [
        {'id': sube.id, 'ad': sube.ad}
        for sube in subeler
    ]
    
    return JsonResponse(data, safe=False)


@login_required
def get_kurum_detail(request, kurum_id):
    """AJAX endpoint: Get institution details for editing"""
    service = KurumService()
    kurum = service.get_kurum_by_id(kurum_id)
    
    if kurum:
        data = {
            'id': kurum.id,
            'ad': kurum.ad,
            'kod': kurum.kod or '',
            'telefon_sabit': kurum.telefon_sabit or '',
            'telefon_cep': kurum.telefon_cep or '',
            'yetkili_ad_soyad': kurum.yetkili_ad_soyad or '',
            'vergi_no': kurum.vergi_no or '',
            'vergi_dairesi': kurum.vergi_dairesi or '',
            'adres': kurum.adres or '',
            'aktif_mi': kurum.aktif_mi,
        }
        return JsonResponse(data)
    
    return JsonResponse({'error': 'Kurum bulunamadı'}, status=404)


@login_required
def get_sube_detail(request, sube_id):
    """AJAX endpoint: Get branch details for editing"""
    service = SubeService()
    sube = service.get_sube_by_id(sube_id)
    
    if sube:
        data = {
            'id': sube.id,
            'kurum_id': sube.kurum_id,
            'ad': sube.ad,
            'kod': sube.kod or '',
            'telefon': sube.telefon or '',
            'adres': sube.adres or '',
            'aktif_mi': sube.aktif_mi,
        }
        return JsonResponse(data)
    
    return JsonResponse({'error': 'Şube bulunamadı'}, status=404)


@login_required
def get_egitim_yili_detail(request, egitim_yili_id):
    """AJAX endpoint: Get education year details for editing"""
    service = EgitimYiliService()
    egitim_yili = service.get_egitim_yili_by_id(egitim_yili_id)
    
    if egitim_yili:
        data = {
            'id': egitim_yili.id,
            'kurum_id': egitim_yili.kurum_id,
            'sube_id': egitim_yili.sube_id,
            'yil': egitim_yili.yil,
            'aktif_mi': egitim_yili.aktif_mi,
        }
        return JsonResponse(data)
    
    return JsonResponse({'error': 'Eğitim yılı bulunamadı'}, status=404)


@login_required
def set_active_context(request):
    """Set active kurum, sube, and egitim_yili context via AJAX"""
    if request.method == 'POST':
        kurum_id = request.POST.get('kurum_id')
        sube_id = request.POST.get('sube_id')
        egitim_yili_id = request.POST.get('egitim_yili_id')
        
        # Clear all context if no selection
        if not kurum_id:
            request.session.pop('active_kurum_id', None)
            request.session.pop('active_sube_id', None)
            request.session.pop('active_egitim_yili_id', None)
            return JsonResponse({'status': 'success', 'message': 'Context cleared'})
        
        # Set kurum
        request.session['active_kurum_id'] = int(kurum_id)
        
        # Set sube (clear if not provided)
        if sube_id:
            request.session['active_sube_id'] = int(sube_id)
        else:
            request.session.pop('active_sube_id', None)
            request.session.pop('active_egitim_yili_id', None)
        
        # Set egitim_yili (clear if not provided)
        if egitim_yili_id:
            request.session['active_egitim_yili_id'] = int(egitim_yili_id)
        else:
            request.session.pop('active_egitim_yili_id', None)
        
        # Get context info for response
        context_info = []
        if kurum_id:
            try:
                kurum = Kurum.objects.get(id=kurum_id)
                context_info.append(kurum.ad)
            except Kurum.DoesNotExist:
                pass
        
        if sube_id:
            try:
                sube = Sube.objects.get(id=sube_id)
                context_info.append(sube.ad)
            except Sube.DoesNotExist:
                pass
        
        if egitim_yili_id:
            try:
                egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
                context_info.append(egitim_yili.yil)
            except EgitimYili.DoesNotExist:
                pass
        
        return JsonResponse({
            'status': 'success',
            'message': 'Context updated',
            'context': ' / '.join(context_info)
        })
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request'}, status=400)


@login_required
def get_context_subeler(request):
    """AJAX endpoint: Get subeler for selected kurum in context selector"""
    kurum_id = request.GET.get('kurum_id')
    
    if kurum_id:
        subeler = Sube.objects.filter(kurum_id=kurum_id).order_by('ad')
        data = [{'id': s.id, 'ad': s.ad} for s in subeler]
        return JsonResponse(data, safe=False)
    
    return JsonResponse([], safe=False)


@login_required
def get_context_egitim_yillari(request):
    """AJAX endpoint: Get egitim_yillari for selected sube in context selector"""
    sube_id = request.GET.get('sube_id')
    
    if sube_id:
        egitim_yillari = EgitimYili.objects.filter(sube_id=sube_id).order_by('-yil')
        data = [{'id': e.id, 'yil': e.yil, 'schema_adi': e.schema_adi} for e in egitim_yillari]
        return JsonResponse(data, safe=False)
    
    return JsonResponse([], safe=False)
