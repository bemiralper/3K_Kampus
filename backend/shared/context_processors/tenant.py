"""
Tenant Context Processor
Makes tenant context available in all templates
"""

def tenant_context(request):
    """
    Add tenant context to template context
    """
    context = {
        'active_kurum': getattr(request, 'active_kurum', None),
        'active_sube': getattr(request, 'active_sube', None),
        'active_egitim_yili': getattr(request, 'active_egitim_yili', None),
        'active_schema': getattr(request, 'active_schema', None),
    }
    
    # Add all kurumlar, subeler, egitim_yillari for selectors
    if hasattr(request, 'user') and request.user.is_authenticated:
        from apps.kurum.domain.models import Kurum
        from apps.sube.domain.models import Sube
        from apps.egitim_yili.domain.models import EgitimYili
        
        context['all_kurumlar'] = Kurum.objects.all().order_by('ad')
        
        # Get subeler based on selected kurum
        if context['active_kurum']:
            context['all_subeler'] = Sube.objects.filter(
                kurum=context['active_kurum']
            ).order_by('ad')
        else:
            context['all_subeler'] = Sube.objects.none()
        
        # Get egitim_yillari based on selected sube
        if context['active_sube']:
            context['all_egitim_yillari'] = EgitimYili.objects.filter(
                sube=context['active_sube']
            ).order_by('-yil')
        else:
            context['all_egitim_yillari'] = EgitimYili.objects.none()
    
    return context
