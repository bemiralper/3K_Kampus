"""Görev bildirim servisi — AppNotification üzerinden."""
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.gorev.domain.models import Gorev, GorevAtama
from apps.gorev.domain.enums import GorevDurum, GorevOncelik
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.takvim.domain.enums import RecipientType
from apps.takvim.infrastructure.repository import AppNotificationRepository


class GorevNotificationService:
    ADMIN_ROLE_CODES = (
        'super_admin', 'kurum_yoneticisi', 'sube_yoneticisi', 'egitim_yoneticisi',
    )

    def __init__(self):
        self.repo = AppNotificationRepository()

    def _should_show_screen(self, gorev: Gorev) -> bool:
        if gorev.ekran_mesaji:
            return True
        return gorev.oncelik in (GorevOncelik.KRITIK, GorevOncelik.YUKSEK)

    def notify_new_assignment(self, gorev: Gorev, atama: GorevAtama):
        tip = gorev.gorev_tipi
        portal_url = self._portal_url_for_user(atama.atanan_user_id, gorev)
        show_screen = self._should_show_screen(gorev)
        self.repo.create({
            'kurum_id': gorev.kurum_id,
            'user_id': atama.atanan_user_id,
            'alici_tip': RecipientType.PERSONEL,
            'baslik': f'Yeni Görev: {gorev.baslik}',
            'mesaj': gorev.aciklama or f'{tip.ad if tip else "Görev"} — son tarih: {gorev.son_tarih:%d.%m.%Y %H:%M}',
            'ikon': tip.ikon if tip else '📋',
            'renk': gorev.gorev_renk,
            'url': portal_url,
            'ekran_mesaji': show_screen,
        })

    def notify_assignments(self, gorev: Gorev):
        for atama in gorev.atamalar.all():
            self.notify_new_assignment(gorev, atama)

    def notify_assignment_reminder(self, gorev: Gorev, atama: GorevAtama):
        tip = gorev.gorev_tipi
        portal_url = self._portal_url_for_user(atama.atanan_user_id, gorev)
        kalan = gorev.son_tarih - timezone.now()
        saat = max(1, int(kalan.total_seconds() // 3600))
        self.repo.create({
            'kurum_id': gorev.kurum_id,
            'user_id': atama.atanan_user_id,
            'alici_tip': RecipientType.PERSONEL,
            'baslik': f'Görev Hatırlatması: {gorev.baslik}',
            'mesaj': (
                gorev.aciklama
                or f'{tip.ad if tip else "Görev"} — son tarihe ~{saat} saat kaldı, henüz tamamlanmadı'
            ),
            'ikon': '⏰',
            'renk': gorev.gorev_renk,
            'url': portal_url,
        })

    def notify_admins_atama_completed(self, gorev: Gorev, atama: GorevAtama, actor_user_id: int):
        atanan_ad = self._resolve_user_name(gorev.kurum_id, atama.atanan_user_id)
        durum_label = 'Tamamlandı' if atama.durum == GorevDurum.TAMAMLANDI else 'Tamamlanamadı'
        mesaj = f'{atanan_ad} — {durum_label}'
        if atama.notlar:
            mesaj = f'{mesaj}: {atama.notlar[:120]}'

        self._notify_admins(
            gorev=gorev,
            baslik=f'Görev {durum_label}: {gorev.baslik}',
            mesaj=mesaj,
            ikon='✅' if atama.durum == GorevDurum.TAMAMLANDI else '⚠️',
            exclude_user_ids={actor_user_id},
        )

    def notify_admins_atama_overdue(self, gorev: Gorev, atama: GorevAtama):
        atanan_ad = self._resolve_user_name(gorev.kurum_id, atama.atanan_user_id)
        self._notify_admins(
            gorev=gorev,
            baslik=f'Görev Gecikti: {gorev.baslik}',
            mesaj=f'{atanan_ad} — son tarih geçti ({gorev.son_tarih:%d.%m.%Y %H:%M})',
            ikon='⏰',
            exclude_user_ids=set(),
        )

    def _notify_admins(
        self,
        gorev: Gorev,
        baslik: str,
        mesaj: str,
        ikon: str,
        exclude_user_ids: set[int],
    ):
        for user_id in self._admin_recipient_ids(gorev):
            if user_id in exclude_user_ids:
                continue
            self.repo.create({
                'kurum_id': gorev.kurum_id,
                'user_id': user_id,
                'alici_tip': RecipientType.PERSONEL,
                'baslik': baslik,
                'mesaj': mesaj,
                'ikon': ikon,
                'renk': gorev.gorev_renk,
                'url': '/admin/gorevler',
            })

    def _admin_recipient_ids(self, gorev: Gorev) -> list[int]:
        ids: set[int] = set()
        if gorev.olusturan_id:
            ids.add(gorev.olusturan_id)

        admin_roles = Role.objects.filter(
            code__in=self.ADMIN_ROLE_CODES, silindi_mi=False,
        )
        role_user_ids = UserRole.objects.filter(role__in=admin_roles).values_list('user_id', flat=True)
        personel_admin_ids = Personel.objects.filter(
            kurum_id=gorev.kurum_id, user_id__in=role_user_ids,
        ).values_list('user_id', flat=True)
        ids.update(personel_admin_ids)

        User = get_user_model()
        staff_ids = User.objects.filter(is_staff=True, is_active=True).values_list('id', flat=True)
        ids.update(staff_ids)
        return list(ids)

    def _resolve_user_name(self, kurum_id: int, user_id: int) -> str:
        personel = Personel.objects.filter(kurum_id=kurum_id, user_id=user_id).first()
        if personel:
            return personel.tam_ad
        User = get_user_model()
        try:
            user = User.objects.get(id=user_id)
            full = user.get_full_name()
            return full.strip() or user.username
        except User.DoesNotExist:
            return f'Kullanıcı #{user_id}'

    def _portal_url_for_user(self, user_id: int, gorev: Gorev) -> str:
        try:
            role_code = UserRole.objects.select_related('role').get(user_id=user_id).role.code
        except UserRole.DoesNotExist:
            role_code = None

        if role_code == 'koc':
            return '/coach/gorevler'
        if role_code == 'muhasebe':
            return '/muhasebe/gorevler'
        return '/admin/gorevler'
