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


def _role_label(code: str) -> str:
    return {
        'kurum_yoneticisi': 'Kurum yöneticisi',
        'sube_yoneticisi': 'Şube yöneticisi',
        'egitim_yoneticisi': 'Eğitim yöneticisi',
    }.get(code, code)


def _yonetici_user_ids(kurum_id: int):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    role_users = UserRole.objects.filter(
        role__code__in=YONETICI_ROLE_CODES,
        role__silindi_mi=False,
    ).filter(
        Q(kurum_id=kurum_id) | Q(kurum__isnull=True),
    ).values_list('user_id', flat=True)
    super_users = User.objects.filter(is_active=True, is_superuser=True).values_list('id', flat=True)
    return set(role_users) | set(super_users)


def _yonetici_gorev_personel_ids(kurum_id: int):
    from apps.personel.domain.models import PersonelGorevlendirme

    return set(
        PersonelGorevlendirme.objects.filter(
            kurum_id=kurum_id,
            aktif_mi=True,
            rol__code__in=YONETICI_ROLE_CODES,
            rol__silindi_mi=False,
        ).values_list('personel_id', flat=True)
    )


def yonetici_personel_qs(kurum_id: int):
    """Kurum/şube/eğitim yöneticisi personelleri.

    Rol hem giriş hesabında (UserRole) hem yıllık görevlendirmede olabilir;
    WhatsApp telefonu Personel kaydından gelir, hesap şart değildir.
    """
    return Personel.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True,
    ).filter(
        Q(user_id__in=_yonetici_user_ids(kurum_id))
        | Q(id__in=_yonetici_gorev_personel_ids(kurum_id)),
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
    role_by_user = {
        row['user_id']: row['role__code']
        for row in UserRole.objects.filter(
            role__code__in=YONETICI_ROLE_CODES,
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
        rol__code__in=YONETICI_ROLE_CODES,
        rol__silindi_mi=False,
    ).values('personel_id', 'rol__code'):
        role_by_personel.setdefault(row['personel_id'], row['rol__code'])

    items = []
    for personel in yonetici_personel_qs(kurum_id).order_by('ad', 'soyad'):
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

    allowed = set(yonetici_personel_qs(kurum_id).values_list('id', flat=True))
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
