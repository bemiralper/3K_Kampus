"""
Context Processors

Template'lerde kullanılmak üzere tenant bilgilerini sağlar.
"""


def tenant_context(request):
    """
    Template context'e tenant bilgilerini ekler.
    
    Usage in templates:
        {{ aktif_kurum.ad }}
        {{ aktif_sube.ad }}
        {{ aktif_egitim_yili.yil }}
    """
    return {
        'aktif_kurum': getattr(request, 'aktif_kurum', None),
        'aktif_sube': getattr(request, 'aktif_sube', None),
        'aktif_egitim_yili': getattr(request, 'aktif_egitim_yili', None),
    }
