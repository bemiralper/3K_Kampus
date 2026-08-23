"""Olay bazlı yönetici/personel alıcı seçimi."""
from __future__ import annotations

from django.db import transaction
from django.db.models import Q

from apps.communication.application.notification_events import get_event
from apps.communication.domain.models import NotificationStaffRecipient
from apps.personel.domain.models import Personel
from apps.roller.models import UserRole

YONETICI_ROLE_CODES = (
    'kurum_yoneticisi',
    'sube_yoneticisi',
    'egitim_yoneticisi',
)

KAYIT_SOZLESME_EVENT = 'ogrenci.kayit_sozlesme'
GUN_SONU_EVENT = 'finans.gun_sonu'
GUN_SONU_EXTRA_ROLE_CODES = ('muhasebe', 'super_admin')


def _role_label(code: str) -> str:
    return {
        'kurum_yoneticisi': 'Kurum yöneticisi',
        'sube_yoneticisi': 'Şube yöneticisi',
        'egitim_yoneticisi': 'Eğitim yöneticisi',
        'muhasebe': 'Muhasebe',
        'super_admin': 'Süper yönetici',
    }.get(code, code)


def role_codes_for_event(event_key: str | None = None) -> tuple[str, ...]:
    """Gün sonu için yönetici + muhasebe; diğer olaylarda yalnızca yöneticiler."""
    from apps.roller.models import Role

    codes = list(YONETICI_ROLE_CODES)
    if event_key == GUN_SONU_EVENT:
        codes.extend(GUN_SONU_EXTRA_ROLE_CODES)
        extra = Role.objects.filter(
            silindi_mi=False,
        ).filter(
            Q(code__icontains='yonetici') | Q(name__icontains='yönetici'),
        ).values_list('code', flat=True)
        codes.extend(extra)
    return tuple(dict.fromkeys(c for c in codes if c))


def _yonetici_user_ids(kurum_id: int, event_key: str | None = None):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    role_users = UserRole.objects.filter(
        role__code__in=role_codes_for_event(event_key),
        role__silindi_mi=False,
    ).filter(
        Q(kurum_id=kurum_id) | Q(kurum__isnull=True),
    ).values_list('user_id', flat=True)
    super_users = User.objects.filter(is_active=True, is_superuser=True).values_list('id', flat=True)
    return set(role_users) | set(super_users)


def _yonetici_gorev_personel_ids(kurum_id: int, event_key: str | None = None):
    from apps.personel.domain.models import PersonelGorevlendirme

    return set(
        PersonelGorevlendirme.objects.filter(
            kurum_id=kurum_id,
            aktif_mi=True,
            rol__code__in=role_codes_for_event(event_key),
            rol__silindi_mi=False,
        ).values_list('personel_id', flat=True)
    )


def yonetici_personel_qs(kurum_id: int, event_key: str | None = None):
    """Kurum/şube/eğitim yöneticisi personelleri.

    Rol hem giriş hesabında (UserRole) hem yıllık görevlendirmede olabilir;
    WhatsApp telefonu Personel kaydından gelir, hesap şart değildir.
    Gün sonu olayında muhasebe ve adı/kodu yönetici olan roller de dahildir.
    """
    return Personel.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True,
    ).filter(
        Q(user_id__in=_yonetici_user_ids(kurum_id, event_key))
        | Q(id__in=_yonetici_gorev_personel_ids(kurum_id, event_key)),
    ).select_related('user', 'sube').distinct()


def selected_personel_ids(kurum_id: int, event_key: str, sube_id: int | None = None) -> set[int]:
    qs = NotificationStaffRecipient.objects.filter(kurum_id=kurum_id, event_key=event_key)
    if sube_id:
        qs = qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
    else:
        qs = qs.filter(sube__isnull=True)
    return set(qs.values_list('personel_id', flat=True))


def list_staff_recipients(kurum_id: int, event_key: str, sube_id: int | None = None) -> dict:
    event = get_event(event_key)
    if event is None:
        raise ValueError(f'Tanımsız bildirim olayı: {event_key}')

    selected = selected_personel_ids(kurum_id, event_key, sube_id=sube_id)
    role_codes = role_codes_for_event(event_key)
    role_by_user = {
        row['user_id']: row['role__code']
        for row in UserRole.objects.filter(
            role__code__in=role_codes,
            role__silindi_mi=False,
        ).filter(
            Q(kurum_id=kurum_id) | Q(kurum__isnull=True),
        ).values('user_id', 'role__code')
    }
    from apps.personel.domain.models import PersonelGorevlendirme

    role_by_personel = {}
    for row in PersonelGorevlendirme.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True,
        rol__code__in=role_codes,
        rol__silindi_mi=False,
    ).values('personel_id', 'rol__code'):
        role_by_personel.setdefault(row['personel_id'], row['rol__code'])

    items = []
    for personel in yonetici_personel_qs(kurum_id, event_key).order_by('ad', 'soyad'):
        phone = (personel.cep_telefon or personel.telefon or '').strip()
        role_code = (
            role_by_user.get(personel.user_id, '')
            or role_by_personel.get(personel.id, '')
            or ('kurum_yoneticisi' if getattr(personel.user, 'is_superuser', False) else '')
        )
        items.append({
            'id': personel.id,
            'ad': personel.ad,
            'soyad': personel.soyad,
            'rol': _role_label(role_code),
            'rol_kodu': role_code,
            'telefon': phone,
            'has_phone': bool(phone),
            'selected': personel.id in selected,
        })
    return {
        'event_key': event_key,
        'event_label': event.label,
        'items': items,
    }


@transaction.atomic
def replace_staff_recipients(
    kurum_id: int,
    event_key: str,
    personel_ids: list[int],
    sube_id: int | None = None,
) -> dict:
    event = get_event(event_key)
    if event is None:
        raise ValueError(f'Tanımsız bildirim olayı: {event_key}')

    allowed = set(yonetici_personel_qs(kurum_id, event_key).values_list('id', flat=True))
    chosen = []
    for raw in personel_ids or []:
        try:
            pid = int(raw)
        except (TypeError, ValueError):
            continue
        if pid in allowed:
            chosen.append(pid)

    scope = NotificationStaffRecipient.objects.filter(
        kurum_id=kurum_id, event_key=event_key,
    )
    if sube_id:
        scope = scope.filter(sube_id=sube_id)
    else:
        scope = scope.filter(sube__isnull=True)
    scope.delete()

    NotificationStaffRecipient.objects.bulk_create([
        NotificationStaffRecipient(
            kurum_id=kurum_id,
            sube_id=sube_id,
            event_key=event_key,
            personel_id=pid,
        )
        for pid in chosen
    ])
    return list_staff_recipients(kurum_id, event_key, sube_id=sube_id)
