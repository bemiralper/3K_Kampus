"""Görev bildirim servisi — AppNotification üzerinden."""
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.gorev.application.html_content import plain_excerpt
from apps.gorev.domain.models import Gorev, GorevAtama
from apps.gorev.domain.enums import GorevDurum, GorevOncelik
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.takvim.domain.enums import RecipientType
from apps.takvim.infrastructure.repository import AppNotificationRepository


def _kind_label(gorev: Gorev) -> str:
    tip = gorev.gorev_tipi
    if tip and tip.kod == 'BILGILENDIRME':
        return 'Bilgilendirme'
    return 'Görev'


def _typed_subject(gorev: Gorev) -> str:
    """Bildirim başlığında görev tipinin adı durur. Bilgilendirmede tür zaten başlıktadır."""
    tip = gorev.gorev_tipi
    tip_ad = (tip.ad or '').strip() if tip else ''
    if _kind_label(gorev) == 'Bilgilendirme' or not tip_ad:
        return gorev.baslik
    return f'{tip_ad} — {gorev.baslik}'


def _clip_title(text: str) -> str:
    text = (text or '').strip()
    if len(text) <= 255:
        return text
    return text[:254].rstrip() + '…'


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
        kind = _kind_label(gorev)
        subject = _typed_subject(gorev)
        # Ekran mesajı açıklamayı taşımaz; başlık türü de belirtir.
        if show_screen:
            baslik = _clip_title(f'{kind}: {subject}')
            mesaj = ''
        else:
            baslik = _clip_title(f'Yeni {kind}: {subject}')
            mesaj = (
                plain_excerpt(gorev.aciklama)
                or f'{subject} — son tarih: {gorev.son_tarih:%d.%m.%Y %H:%M}'
            )
        self.repo.create({
            'kurum_id': gorev.kurum_id,
            'user_id': atama.atanan_user_id,
            'alici_tip': RecipientType.PERSONEL,
            'baslik': baslik,
            'mesaj': mesaj,
            'ikon': tip.ikon if tip else '📋',
            'renk': gorev.gorev_renk,
            'url': portal_url,
            'ekran_mesaji': show_screen,
            **self._sube_kwargs(gorev),
        })

    def notify_assignments(self, gorev: Gorev):
        for atama in gorev.atamalar.all():
            self.notify_new_assignment(gorev, atama)

    def notify_assignment_reminder(self, gorev: Gorev, atama: GorevAtama):
        portal_url = self._portal_url_for_user(atama.atanan_user_id, gorev)
        kalan = gorev.son_tarih - timezone.now()
        saat = max(1, int(kalan.total_seconds() // 3600))
        self.repo.create({
            'kurum_id': gorev.kurum_id,
            'user_id': atama.atanan_user_id,
            'alici_tip': RecipientType.PERSONEL,
            'baslik': _clip_title(f'{_kind_label(gorev)} Hatırlatması: {_typed_subject(gorev)}'),
            'mesaj': (
                plain_excerpt(gorev.aciklama)
                or (
                    f'{_typed_subject(gorev)} — son tarihe ~{saat} saat kaldı, '
                    + ('henüz görülmedi' if _kind_label(gorev) == 'Bilgilendirme' else 'henüz tamamlanmadı')
                )
            ),
            'ikon': '⏰',
            'renk': gorev.gorev_renk,
            'url': portal_url,
            **self._sube_kwargs(gorev),
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

    def notify_personal_reminder(self, gorev: Gorev, atama: GorevAtama):
        """Atanan kişinin kendi kurduğu hatırlatma, görevler ikonuna düşer."""
        self.repo.create({
            'kurum_id': gorev.kurum_id,
            'user_id': atama.atanan_user_id,
            'alici_tip': RecipientType.PERSONEL,
            'baslik': _clip_title(f'Hatırlatma: {_typed_subject(gorev)}'),
            'mesaj': f'Son tarih: {gorev.son_tarih:%d.%m.%Y %H:%M}',
            'ikon': '⏰',
            'renk': gorev.gorev_renk,
            'url': self._portal_url_for_user(atama.atanan_user_id, gorev),
            'ekran_mesaji': False,
            **self._sube_kwargs(gorev),
        })

    def notify_sender_feedback(self, gorev: Gorev, atama: GorevAtama, actor_user_id: int):
        """Atanan kişinin notu yalnız gönderene gider. Durum değişmez."""
        if not gorev.olusturan_id or gorev.olusturan_id == actor_user_id:
            return
        note = (atama.notlar or '').strip()
        if not note:
            return
        atanan_ad = self._resolve_user_name(gorev.kurum_id, atama.atanan_user_id)
        self.repo.create({
            'kurum_id': gorev.kurum_id,
            'user_id': gorev.olusturan_id,
            'alici_tip': RecipientType.PERSONEL,
            'baslik': _clip_title(f'Geri bildirim: {gorev.baslik}'),
            'mesaj': f'{atanan_ad}: {note[:500]}',
            'ikon': '💬',
            'renk': gorev.gorev_renk,
            'url': self._portal_url_for_user(gorev.olusturan_id, gorev),
            'ekran_mesaji': False,
            **self._sube_kwargs(gorev),
        })

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
                'baslik': _clip_title(baslik),
                'mesaj': mesaj,
                'ikon': ikon,
                'renk': gorev.gorev_renk,
                'url': f'/admin/gorevler/{gorev.id}',
                **self._sube_kwargs(gorev),
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

    def _sube_kwargs(self, gorev: Gorev) -> dict:
        from apps.takvim.application.notification_sube import sube_fields

        return sube_fields(gorev.sube_id)

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
        ur = UserRole.objects.select_related('role').filter(user_id=user_id).first()
        role_code = ur.role.code if ur else None

        if role_code == 'koc':
            return f'/coach/gorevler/{gorev.id}'
        if role_code == 'muhasebe':
            return f'/muhasebe/gorevler/{gorev.id}'
        return f'/admin/gorevler/{gorev.id}'
