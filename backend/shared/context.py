"""
Active Context Processor
Injects active context into all templates
"""


def _header_int(request, header_name):
    value = request.headers.get(header_name)
    if value:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    return None


def _default_kurum_id():
    try:
        from apps.kurum.domain.models import Kurum
        kurum = Kurum.objects.filter(aktif_mi=True).order_by('id').first()
        return kurum.id if kurum else None
    except Exception:
        return None


def _valid_kurum_id(kurum_id):
    if not kurum_id:
        return None
    try:
        from apps.kurum.domain.models import Kurum
        return kurum_id if Kurum.objects.filter(id=kurum_id).exists() else None
    except Exception:
        return None


def _valid_sube_id(sube_id, kurum_id=None):
    if not sube_id:
        return None
    try:
        from apps.sube.domain.models import Sube
        qs = Sube.objects.filter(id=sube_id)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        return sube_id if qs.exists() else None
    except Exception:
        return None


def _default_sube_id(kurum_id):
    if not kurum_id:
        return None
    try:
        from apps.sube.domain.models import Sube
        sube = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).order_by('id').first()
        if not sube:
            sube = Sube.objects.filter(kurum_id=kurum_id).order_by('id').first()
        return sube.id if sube else None
    except Exception:
        return None


def _valid_egitim_yili_id(egitim_yili_id):
    if not egitim_yili_id:
        return None
    try:
        from apps.egitim_yili.domain.models import EgitimYili
        return egitim_yili_id if EgitimYili.objects.filter(id=egitim_yili_id).exists() else None
    except Exception:
        return None


def _default_egitim_yili_id():
    try:
        from apps.egitim_yili.domain.models import EgitimYili
        yil = EgitimYili.objects.filter(aktif_mi=True).order_by('-baslangic_yil').first()
        if not yil:
            yil = EgitimYili.objects.order_by('-baslangic_yil').first()
        return yil.id if yil else None
    except Exception:
        return None


def get_secili_kurum_id(request):
    """Request'ten seçili kurum ID'sini döndürür (geçersiz ID'ler yok sayılır)."""
    candidates = [
        _header_int(request, 'X-Kurum-ID'),
        getattr(request, 'active_kurum_id', None),
        request.session.get('active_kurum_id') if hasattr(request, 'session') else None,
    ]
    for candidate in candidates:
        valid = _valid_kurum_id(candidate)
        if valid:
            return valid
    return _default_kurum_id()


def get_secili_sube_id(request, kurum_id=None):
    """Request'ten seçili şube ID'sini döndürür (geçersiz ID'ler yok sayılır)."""
    if kurum_id is None:
        kurum_id = get_secili_kurum_id(request)

    candidates = [
        _header_int(request, 'X-Sube-ID'),
        getattr(request, 'active_sube_id', None),
        request.session.get('active_sube_id') if hasattr(request, 'session') else None,
    ]
    for candidate in candidates:
        valid = _valid_sube_id(candidate, kurum_id)
        if valid:
            return valid
    return _default_sube_id(kurum_id)


def require_mandatory_sube_id(request, kurum_id=None):
    """
    Şube bağlamı zorunlu — query param, header veya session.
    Varsayılan şube kullanılmaz; eksikse None döner.
    """
    if kurum_id is None:
        kurum_id = get_secili_kurum_id(request)

    query_params = getattr(request, 'query_params', None) or request.GET
    raw = query_params.get('sube_id')
    if raw:
        try:
            valid = _valid_sube_id(int(raw), kurum_id)
            if valid:
                return valid
        except (TypeError, ValueError):
            pass

    candidates = [
        _header_int(request, 'X-Sube-ID'),
        getattr(request, 'active_sube_id', None),
        request.session.get('active_sube_id') if hasattr(request, 'session') else None,
    ]
    for candidate in candidates:
        valid = _valid_sube_id(candidate, kurum_id)
        if valid:
            return valid
    return None


def get_secili_egitim_yili_id(request):
    """
    Request'ten seçili eğitim yılı ID'sini döndürür.
    Session'dan veya request attribute'undan alır.
    Bulunamazsa aktif eğitim yılını döndürür.
    """
    egitim_yili_id = _header_int(request, 'X-EgitimYili-ID')
    if egitim_yili_id:
        valid = _valid_egitim_yili_id(egitim_yili_id)
        if valid:
            return valid

    # Önce request attribute'una bak
    egitim_yili_id = getattr(request, 'active_egitim_yili_id', None)
    
    # Session'dan kontrol et
    if not egitim_yili_id and hasattr(request, 'session'):
        egitim_yili_id = request.session.get('active_egitim_yili_id')

    valid = _valid_egitim_yili_id(egitim_yili_id)
    if valid:
        return valid
    
    return _default_egitim_yili_id()


def resolve_tenant_context(request):
    """Geçerli kurum, şube ve eğitim yılı ID'lerini döndürür."""
    kurum_id = get_secili_kurum_id(request)
    sube_id = get_secili_sube_id(request, kurum_id)
    egitim_yili_id = get_secili_egitim_yili_id(request)
    return kurum_id, sube_id, egitim_yili_id


def active_context_processor(request):
    context = {
        'active_kurum_id': getattr(request, 'active_kurum_id', None),
        'active_sube_id': getattr(request, 'active_sube_id', None),
        'active_egitim_yili_id': getattr(request, 'active_egitim_yili_id', None),
    }
    
    # Load actual objects if IDs exist
    if context['active_kurum_id']:
        try:
            from apps.kurum.domain.models import Kurum
            context['active_kurum'] = Kurum.objects.get(id=context['active_kurum_id'])
        except:
            context['active_kurum'] = None
    else:
        context['active_kurum'] = None
        
    if context['active_sube_id']:
        try:
            from apps.sube.domain.models import Sube
            context['active_sube'] = Sube.objects.get(id=context['active_sube_id'])
        except:
            context['active_sube'] = None
    else:
        context['active_sube'] = None
        
    if context['active_egitim_yili_id']:
        try:
            from apps.egitim_yili.domain.models import EgitimYili
            context['active_egitim_yili'] = EgitimYili.objects.get(id=context['active_egitim_yili_id'])
        except:
            context['active_egitim_yili'] = None
    else:
        context['active_egitim_yili'] = None
    
    # Add all kurumlar for context selector dropdown
    try:
        from apps.kurum.domain.models import Kurum
        context['all_kurumlar'] = Kurum.objects.filter(aktif_mi=True).order_by('ad')
    except:
        context['all_kurumlar'] = []
    
    # Add active schema info
    context['active_schema'] = getattr(request, 'active_schema', None)
    
    return context
