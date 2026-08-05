"""
Koç–öğrenci ataması → koç portalında ekran mesajı (AppNotification).
"""
from __future__ import annotations

import logging
from typing import Iterable, Sequence

from apps.coaching.models import CoachProfile
from apps.ogrenci.domain.models import Ogrenci
from apps.takvim.domain.enums import RecipientType
from apps.takvim.infrastructure.repository import AppNotificationRepository

logger = logging.getLogger(__name__)

COACH_STUDENTS_URL = '/coach/ogrenciler'


class CoachingAssignmentNotificationService:
    def __init__(self):
        self.repo = AppNotificationRepository()

    def notify_students_assigned(
        self,
        coach: CoachProfile,
        students: Sequence[Ogrenci] | Iterable[Ogrenci],
    ) -> int:
        """Yeni öğrenci(ler) atandığında koça ekran mesajı."""
        student_list = list(students)
        if not student_list:
            return 0

        user_id, kurum_id = self._coach_recipient(coach)
        if not user_id or not kurum_id:
            return 0

        if len(student_list) == 1:
            student = student_list[0]
            name = self._student_name(student)
            baslik = f'Yeni öğrenci atandı: {name}'
            mesaj = f'{name} koçluk listenize eklendi. Profiline giderek takip edebilirsiniz.'
            url = f'{COACH_STUDENTS_URL}/{student.id}'
        else:
            names = ', '.join(self._student_name(s) for s in student_list[:5])
            extra = len(student_list) - 5
            if extra > 0:
                names = f'{names} ve {extra} öğrenci daha'
            baslik = f'{len(student_list)} öğrenci listenize eklendi'
            mesaj = f'{names} koçluk listenize atandı.'
            url = COACH_STUDENTS_URL

        return self._create_screen(
            kurum_id=kurum_id,
            user_id=user_id,
            baslik=baslik,
            mesaj=mesaj,
            ikon='🎓',
            renk='#0262A7',
            url=url,
        )

    def notify_student_removed(self, coach: CoachProfile, student: Ogrenci) -> int:
        """Öğrenci ataması sonlandığında eski koça ekran mesajı."""
        user_id, kurum_id = self._coach_recipient(coach)
        if not user_id or not kurum_id:
            return 0

        name = self._student_name(student)
        return self._create_screen(
            kurum_id=kurum_id,
            user_id=user_id,
            baslik=f'Koçluğundan çıkarıldı: {name}',
            mesaj=(
                f'{name} koçluğunuzdan çıkarıldı '
                '(başka bir koça verildi veya koçluk sonlandırıldı).'
            ),
            ikon='👋',
            renk='#64748B',
            # Öğrenci artık listede değil; yönlendirme butonu göstermeyelim.
            url='',
        )

    def _create_screen(
        self,
        *,
        kurum_id: int,
        user_id: int,
        baslik: str,
        mesaj: str,
        ikon: str,
        renk: str,
        url: str,
    ) -> int:
        try:
            self.repo.create({
                'kurum_id': kurum_id,
                'user_id': user_id,
                'alici_tip': RecipientType.PERSONEL,
                'baslik': baslik,
                'mesaj': mesaj,
                'ikon': ikon,
                'renk': renk,
                'url': url,
                'ekran_mesaji': True,
            })
            return 1
        except Exception:
            logger.exception(
                'Koç atama AppNotification oluşturulamadı (user_id=%s)',
                user_id,
            )
            return 0

    @staticmethod
    def _coach_recipient(coach: CoachProfile) -> tuple[int | None, int | None]:
        teacher = getattr(coach, 'teacher', None)
        if teacher is None:
            try:
                teacher = coach.teacher
            except Exception:
                return None, None
        user_id = getattr(teacher, 'user_id', None)
        kurum_id = getattr(teacher, 'kurum_id', None)
        if not user_id or not kurum_id:
            logger.warning(
                'Koç atama bildirimi atlandı: coach_id=%s user/kurum yok',
                getattr(coach, 'id', None),
            )
            return None, None
        return int(user_id), int(kurum_id)

    @staticmethod
    def _student_name(student: Ogrenci) -> str:
        return f'{student.ad} {student.soyad}'.strip() or f'Öğrenci #{student.id}'
