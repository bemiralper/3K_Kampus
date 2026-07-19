"""
Koç Risk Bildir → admin / müdür uygulama içi bildirim.
"""
from __future__ import annotations

import logging

from django.contrib.auth import get_user_model

from apps.coaching.models import CoachingEvent
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.takvim.domain.enums import RecipientType
from apps.takvim.infrastructure.repository import AppNotificationRepository

logger = logging.getLogger(__name__)

# Görev + coach_access rol kodları (kurulumda kullanılan alias'lar dahil)
ADMIN_ROLE_CODES = (
    'super_admin',
    'kurum_yoneticisi',
    'sube_yoneticisi',
    'egitim_yoneticisi',
    'admin',
    'mudur',
    'mudir_yardimcisi',
)

RISK_CENTER_URL = '/admin/coaching/risk'


class CoachingRiskNotificationService:
    def __init__(self):
        self.repo = AppNotificationRepository()

    def notify_admins_of_risk_report(
        self,
        event: CoachingEvent,
        *,
        kurum_id: int,
        reported_by_user_id: int | None = None,
    ) -> int:
        """
        Risk bildirimi sonrası admin/müdür fan-out.
        Returns: oluşturulan bildirim sayısı.
        """
        student = event.student
        student_name = f'{student.ad} {student.soyad}'.strip()
        coach_name = self._coach_display_name(event)
        reason = (event.metadata or {}).get('reason') or event.title
        notes = (event.metadata or {}).get('notes') or ''

        baslik = f'Risk Bildirimi: {student_name}'
        mesaj_parts = [f'Koç: {coach_name}', f'Neden: {reason}']
        if notes:
            mesaj_parts.append(notes[:160])
        mesaj = ' — '.join(mesaj_parts)

        url = f'{RISK_CENTER_URL}?event={event.id}'
        exclude = {reported_by_user_id} if reported_by_user_id else set()
        created = 0

        for user_id in self._admin_recipient_ids(kurum_id, student.sube_id):
            if user_id in exclude:
                continue
            try:
                self.repo.create({
                    'kurum_id': kurum_id,
                    'user_id': user_id,
                    'alici_tip': RecipientType.PERSONEL,
                    'baslik': baslik,
                    'mesaj': mesaj,
                    'ikon': '⚠️',
                    'renk': '#EF4444',
                    'url': url,
                    'ekran_mesaji': False,
                })
                created += 1
            except Exception:
                logger.exception(
                    'Risk bildirimi AppNotification oluşturulamadı (user_id=%s event_id=%s)',
                    user_id,
                    event.id,
                )
        return created

    def _admin_recipient_ids(self, kurum_id: int, student_sube_id: int | None) -> list[int]:
        ids: set[int] = set()

        admin_roles = Role.objects.filter(code__in=ADMIN_ROLE_CODES, silindi_mi=False)
        role_user_ids = list(
            UserRole.objects.filter(role__in=admin_roles).values_list('user_id', flat=True)
        )
        if not role_user_ids:
            return []

        personel_qs = Personel.objects.filter(
            kurum_id=kurum_id,
            user_id__in=role_user_ids,
            user_id__isnull=False,
        )
        # Şubesi tanımlı personel yalnızca kendi şubesindeki riskleri görsün;
        # şubesiz (kurum geneli) personel tümünü alır.
        if student_sube_id:
            from django.db.models import Q
            personel_qs = personel_qs.filter(
                Q(sube_id__isnull=True) | Q(sube_id=student_sube_id)
            )

        ids.update(personel_qs.values_list('user_id', flat=True))

        # Aktif superuser'lar (kurum personeli olmasa da takip edebilsin)
        User = get_user_model()
        ids.update(
            User.objects.filter(is_superuser=True, is_active=True).values_list('id', flat=True)
        )
        return [uid for uid in ids if uid]

    def _coach_display_name(self, event: CoachingEvent) -> str:
        try:
            teacher = event.coach.teacher
            return f'{teacher.ad} {teacher.soyad}'.strip() or str(teacher)
        except Exception:
            return 'Koç'
