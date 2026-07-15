"""Mandatory şube bağlamı — personel list/read endpoint'leri."""
from django.db.models import Exists, OuterRef, Q
from django.http import JsonResponse

from apps.egitim_yili.domain.models import EgitimYili
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from shared.context import get_secili_egitim_yili_id, get_secili_kurum_id
from shared.sube_access import get_allowed_subeler_for_user, serialize_sube
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def _error_response(err):
    return JsonResponse({'error': err['error']}, status=err['status'])


def resolve_mandatory_personel_sube(request, kurum_id):
    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, _error_response(err)
    return sube_id, None


def assert_gorevlendirme_record_sube_access(request, kurum_id, record_sube_id):
    err = _assert_record(request, kurum_id, record_sube_id)
    if err:
        return _error_response(err)
    return None


def mandatory_personel_context(request):
    """
    Liste/arama endpoint'leri için zorunlu kurum + şube bağlamı.

    Returns:
        (ctx_dict, None) veya (None, JsonResponse)
    """
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, JsonResponse({'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = resolve_mandatory_personel_sube(request, kurum_id)
    if err:
        return None, err

    egitim_yili_id = get_secili_egitim_yili_id(request)
    egitim_yili = None
    if egitim_yili_id:
        egitim_yili = EgitimYili.objects.filter(id=egitim_yili_id).first()

    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': egitim_yili_id,
        'egitim_yili': egitim_yili,
    }, None


def _gorevlendirme_exists_filter(kurum_id, egitim_yili_id=None):
    filt = {
        'personel_id': OuterRef('pk'),
        'kurum_id': kurum_id,
        'aktif_mi': True,
    }
    if egitim_yili_id:
        filt['egitim_yili_id'] = egitim_yili_id
    return filt


def personel_queryset_for_sube(kurum_id, sube_id, egitim_yili_id=None, *, aktif_only=True):
    """
    Aktif şubede görünür personeller.

    Personel birden fazla şubede görünebilir: aktif görevlendirme şubesi veya ana şube (personel.sube).
    """
    gorev_base = _gorevlendirme_exists_filter(kurum_id, egitim_yili_id)
    has_gorev_in_sube = PersonelGorevlendirme.objects.filter(
        **gorev_base,
        gorev_sube_id=sube_id,
    )

    qs = Personel.objects.filter(kurum_id=kurum_id)
    if aktif_only:
        qs = qs.filter(aktif_mi=True)

    return qs.filter(
        Q(Exists(has_gorev_in_sube))
        | Q(sube_id=sube_id)
    ).select_related('kurum', 'sube', 'user').order_by('soyad', 'ad')


def personel_visible_in_sube(personel, sube_id, egitim_yili_id=None):
    """Personel kaydı aktif şube bağlamında görünür mü?"""
    if not personel or not sube_id:
        return False

    gorev_base = {
        'personel': personel,
        'kurum_id': personel.kurum_id,
        'aktif_mi': True,
    }
    if egitim_yili_id:
        gorev_base['egitim_yili_id'] = egitim_yili_id

    gorev_qs = PersonelGorevlendirme.objects.filter(**gorev_base)
    if gorev_qs.filter(gorev_sube_id=sube_id).exists():
        return True
    if personel.sube_id == sube_id:
        return True
    return False


def assert_personel_record_sube_access(request, personel, egitim_yili_id=None):
    """
    Personel detay/mutasyon — görevlendirme veya ana şube üzerinden erişim doğrulama.

    Returns:
        None başarılı
        JsonResponse hata
    """
    kurum_id = personel.kurum_id
    sube_id, err = resolve_mandatory_personel_sube(request, kurum_id)
    if err:
        return err

    if egitim_yili_id is None:
        egitim_yili_id = get_secili_egitim_yili_id(request)

    if not personel_visible_in_sube(personel, sube_id, egitim_yili_id):
        return JsonResponse({'error': 'Kayıt bu şubeye ait değil.'}, status=403)
    return None


def allowed_subeler_for_request(request, kurum_id):
    """Dropdown — kullanıcının erişebildiği şubeler."""
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        qs = get_allowed_subeler_for_user(user, kurum_id=int(kurum_id))
    else:
        from apps.sube.domain.models import Sube
        qs = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).order_by('ad')
    return [serialize_sube(s) for s in qs]


def personel_queryset_for_gorev_sube(kurum_id, sube_id, egitim_yili_id=None, *, aktif_only=True):
    """
    Yalnızca bu şubede aktif görevlendirmesi olan personeller.

    Sözleşme oluşturma için kullanılır (ana şube fallback yok).
    """
    gorev_base = _gorevlendirme_exists_filter(kurum_id, egitim_yili_id)
    has_gorev = PersonelGorevlendirme.objects.filter(
        **gorev_base,
        gorev_sube_id=sube_id,
    )
    qs = Personel.objects.filter(kurum_id=kurum_id)
    if aktif_only:
        qs = qs.filter(aktif_mi=True)
    return qs.filter(Exists(has_gorev)).select_related('kurum', 'sube', 'user').order_by('soyad', 'ad')


def personel_has_gorev_in_sube(personel_id, kurum_id, sube_id, egitim_yili_id=None):
    filt = {
        'personel_id': personel_id,
        'kurum_id': kurum_id,
        'gorev_sube_id': sube_id,
        'aktif_mi': True,
    }
    if egitim_yili_id:
        filt['egitim_yili_id'] = egitim_yili_id
    return PersonelGorevlendirme.objects.filter(**filt).exists()


def resolve_gorevlendirme_for_sube(personel_id, kurum_id, sube_id, egitim_yili_id=None):
    """Aktif şubedeki görevlendirme kaydı (varsa)."""
    filt = {
        'personel_id': personel_id,
        'kurum_id': kurum_id,
        'gorev_sube_id': sube_id,
        'aktif_mi': True,
    }
    if egitim_yili_id:
        filt['egitim_yili_id'] = egitim_yili_id
    return (
        PersonelGorevlendirme.objects.filter(**filt)
        .select_related('brans', 'rol', 'gorev_sube')
        .order_by('id')
        .first()
    )
