"""Öğrenci kayıt — okul doğrulama (şube izolasyonu)."""
from apps.okul.models import Okul


def resolve_school_for_enrollment(school_id, kurum_id, sube_id):
    """
    school_id + branchId doğrulaması.

    Returns:
        (okul, error_message)
    """
    if not school_id:
        return None, None
    try:
        sid = int(school_id)
    except (TypeError, ValueError):
        return None, 'Geçersiz okul seçimi.'

    okul = Okul.objects.filter(id=sid, kurum_id=kurum_id, sube_id=sube_id).first()
    if not okul:
        return None, 'Seçilen okul bulunamadı veya bu şubeye ait değil.'
    return okul, None
