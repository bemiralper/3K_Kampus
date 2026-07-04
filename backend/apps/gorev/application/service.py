"""Görev iş mantığı servisi."""
import logging
from datetime import datetime, timedelta
from typing import Optional

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from collections import defaultdict

from apps.gorev.domain.models import Gorev, GorevAtama, GorevTipi
from apps.gorev.domain.enums import GorevDurum, HedefTipi
from apps.gorev.application.bridge import GorevCalendarBridge
from apps.gorev.application.notification import GorevNotificationService
from apps.gorev.seed import seed_gorev_tipleri
from apps.roller.models import Role, UserRole
from apps.personel.domain.models import Personel

logger = logging.getLogger('gorev.service')


class GorevTipiService:
    def list_tipler(self, kurum_id: int, active_only=True):
        qs = GorevTipi.objects.filter(kurum_id=kurum_id, is_deleted=False)
        if active_only:
            qs = qs.filter(is_active=True)
        return qs.order_by('sira', 'ad')

    def get_or_seed(self, kurum_id: int, kod: str) -> Optional[GorevTipi]:
        tip = GorevTipi.objects.filter(
            kurum_id=kurum_id, kod=kod, is_deleted=False, is_active=True,
        ).first()
        if tip:
            return tip
        seed_gorev_tipleri(kurum_id)
        return GorevTipi.objects.filter(kurum_id=kurum_id, kod=kod, is_deleted=False).first()

    def seed_defaults(self, kurum_id: int):
        return seed_gorev_tipleri(kurum_id)


class GorevService:
    def __init__(self):
        self.bridge = GorevCalendarBridge()
        self.notifier = GorevNotificationService()
        self.tip_service = GorevTipiService()

    def resolve_assignee_user_ids(
        self,
        kurum_id: int,
        hedef_tipi: str,
        hedef_rol_kodu: str = '',
        hedef_user_ids: list = None,
        sube_id: int = None,
    ) -> list[int]:
        hedef_user_ids = hedef_user_ids or []

        if hedef_tipi == HedefTipi.KULLANICI:
            return list(set(int(uid) for uid in hedef_user_ids if uid))

        personel_qs = Personel.objects.filter(kurum_id=kurum_id, user__isnull=False)
        if sube_id:
            personel_qs = personel_qs.filter(sube_id=sube_id)

        if hedef_tipi == HedefTipi.TUM_PERSONEL:
            return list(personel_qs.values_list('user_id', flat=True))

        if hedef_tipi == HedefTipi.ROL and hedef_rol_kodu:
            try:
                role = Role.objects.get(code=hedef_rol_kodu, silindi_mi=False)
            except Role.DoesNotExist:
                return []
            role_user_ids = UserRole.objects.filter(role=role).values_list('user_id', flat=True)
            return list(personel_qs.filter(user_id__in=role_user_ids).values_list('user_id', flat=True))

        return []

    @transaction.atomic
    def create_gorev(self, kurum_id: int, data: dict, olusturan_id: int) -> Gorev:
        gorev_tipi_id = data.get('gorev_tipi_id')
        if not gorev_tipi_id:
            default_tip = self.tip_service.get_or_seed(kurum_id, 'YAPILACAK')
            gorev_tipi_id = default_tip.id if default_tip else None

        gorev = Gorev.objects.create(
            kurum_id=kurum_id,
            sube_id=data.get('sube_id'),
            egitim_yili_id=data.get('egitim_yili_id'),
            donem_id=data.get('donem_id'),
            gorev_tipi_id=gorev_tipi_id,
            baslik=data['baslik'],
            aciklama=data.get('aciklama', ''),
            oncelik=data.get('oncelik', 'NORMAL'),
            son_tarih=data['son_tarih'],
            tahmini_sure_dk=data.get('tahmini_sure_dk', 30),
            tum_gun=data.get('tum_gun', False),
            hedef_tipi=data.get('hedef_tipi', HedefTipi.KULLANICI),
            hedef_rol_kodu=data.get('hedef_rol_kodu', ''),
            hedef_user_ids=data.get('hedef_user_ids', []),
            hedef_grup_id=data.get('hedef_grup_id'),
            kaynak_modul=data.get('kaynak_modul', ''),
            kaynak_id=data.get('kaynak_id', ''),
            aksiyon_url=data.get('aksiyon_url', ''),
            ekran_mesaji=bool(data.get('ekran_mesaji', False)),
            olusturan_id=olusturan_id,
        )

        user_ids = self.resolve_assignee_user_ids(
            kurum_id=kurum_id,
            hedef_tipi=gorev.hedef_tipi,
            hedef_rol_kodu=gorev.hedef_rol_kodu,
            hedef_user_ids=gorev.hedef_user_ids,
            sube_id=gorev.sube_id,
        )

        for uid in user_ids:
            GorevAtama.objects.create(gorev=gorev, atanan_user_id=uid)

        from apps.takvim.application.service import EventTypeService
        EventTypeService.seed_defaults(kurum_id)
        self.bridge.sync_gorev(gorev, olusturan_id)
        self.notifier.notify_assignments(gorev)
        return gorev

    def list_gorevler(self, kurum_id: int, filters: dict = None):
        filters = filters or {}
        qs = Gorev.objects.filter(kurum_id=kurum_id, is_deleted=False).select_related('gorev_tipi')

        if filters.get('sube_id'):
            qs = qs.filter(sube_id=filters['sube_id'])
        if filters.get('oncelik'):
            qs = qs.filter(oncelik=filters['oncelik'])
        if filters.get('gorev_tipi_id'):
            qs = qs.filter(gorev_tipi_id=filters['gorev_tipi_id'])
        if filters.get('search'):
            qs = qs.filter(Q(baslik__icontains=filters['search']) | Q(aciklama__icontains=filters['search']))

        if filters.get('baslangic'):
            qs = qs.filter(son_tarih__gte=filters['baslangic'])
        if filters.get('bitis'):
            qs = qs.filter(son_tarih__lte=filters['bitis'])

        if filters.get('atanan_user_id'):
            qs = qs.filter(atamalar__atanan_user_id=filters['atanan_user_id'])
        if filters.get('durum'):
            qs = qs.filter(atamalar__durum=filters['durum'])

        if filters.get('geciken'):
            qs = qs.filter(
                son_tarih__lt=timezone.now(),
                atamalar__durum__in=[GorevDurum.BEKLIYOR, GorevDurum.BASLADI, GorevDurum.DEVAM_EDIYOR],
            )

        return qs.distinct().order_by('son_tarih')

    def list_atamalar(self, kurum_id: int, user_id=None, filters: dict = None):
        filters = filters or {}
        qs = GorevAtama.objects.filter(
            gorev__kurum_id=kurum_id,
            gorev__is_deleted=False,
        ).select_related('gorev', 'gorev__gorev_tipi')

        if user_id is not None:
            qs = qs.filter(atanan_user_id=user_id)

        if filters.get('durum'):
            qs = qs.filter(durum=filters['durum'])
        if filters.get('oncelik'):
            qs = qs.filter(gorev__oncelik=filters['oncelik'])
        if filters.get('search'):
            term = filters['search'].strip()
            if term:
                qs = qs.filter(
                    Q(gorev__baslik__icontains=term) | Q(gorev__aciklama__icontains=term),
                )
        if filters.get('baslangic'):
            qs = qs.filter(gorev__son_tarih__gte=filters['baslangic'])
        if filters.get('bitis'):
            qs = qs.filter(gorev__son_tarih__lte=filters['bitis'])
        if filters.get('geciken'):
            qs = qs.filter(
                gorev__son_tarih__lt=timezone.now(),
                durum__in=[GorevDurum.BEKLIYOR, GorevDurum.BASLADI, GorevDurum.DEVAM_EDIYOR],
            )

        return qs.order_by('gorev__son_tarih')

    def get_gorev(self, kurum_id: int, gorev_id) -> Optional[Gorev]:
        try:
            return Gorev.objects.select_related('gorev_tipi').prefetch_related('atamalar').get(
                id=gorev_id, kurum_id=kurum_id, is_deleted=False,
            )
        except Gorev.DoesNotExist:
            return None

    @transaction.atomic
    def update_gorev(self, gorev: Gorev, data: dict, user_id: int) -> Gorev:
        for field in ('baslik', 'aciklama', 'oncelik', 'son_tarih', 'tahmini_sure_dk',
                      'tum_gun', 'aksiyon_url', 'gorev_tipi_id', 'ekran_mesaji'):
            if field in data:
                setattr(gorev, field, data[field])
        gorev.updated_by = user_id
        gorev.save()
        if 'son_tarih' in data:
            GorevAtama.objects.filter(gorev=gorev).update(
                gecikme_bildirildi_at=None,
                son_hatirlatma_at=None,
            )
        self.bridge.sync_gorev(gorev, user_id)
        return gorev

    @transaction.atomic
    def delete_gorev(self, gorev: Gorev, user_id: int):
        self.bridge.remove_gorev(gorev)
        gorev.is_deleted = True
        gorev.deleted_at = timezone.now()
        gorev.updated_by = user_id
        gorev.save()

    @transaction.atomic
    def update_atama(self, atama: GorevAtama, data: dict, user_id: int) -> GorevAtama:
        now = timezone.now()
        prev_durum = atama.durum

        if not atama.ilk_acilma_at:
            atama.ilk_acilma_at = now

        if 'durum' in data:
            new_durum = data['durum']
            if new_durum in (GorevDurum.BASLADI, GorevDurum.DEVAM_EDIYOR) and not atama.baslama_at:
                atama.baslama_at = now
            if new_durum == GorevDurum.TAMAMLANDI:
                atama.tamamlanma_at = now
            if new_durum == GorevDurum.TAMAMLANMADI:
                atama.tamamlanma_at = now
            atama.durum = new_durum

        if 'notlar' in data:
            atama.notlar = data['notlar']
        if 'gorusuldu' in data:
            atama.gorusuldu = data['gorusuldu']
            if data['gorusuldu'] and atama.durum not in (GorevDurum.TAMAMLANDI, GorevDurum.TAMAMLANMADI, GorevDurum.IPTAL):
                atama.durum = GorevDurum.TAMAMLANDI
                atama.tamamlanma_at = now

        atama.save()
        self.bridge.sync_atama(atama, user_id)

        if prev_durum not in (GorevDurum.TAMAMLANDI, GorevDurum.TAMAMLANMADI) and atama.durum in (
            GorevDurum.TAMAMLANDI, GorevDurum.TAMAMLANMADI,
        ):
            self.notifier.notify_admins_atama_completed(atama.gorev, atama, user_id)

        return atama

    def get_takvim_events(self, kurum_id: int, filters: dict):
        from apps.gorev.helpers import serialize_gorev_compact_for_calendar, resolve_assignee_names

        qs = GorevAtama.objects.filter(
            gorev__kurum_id=kurum_id,
            gorev__is_deleted=False,
        ).select_related('gorev', 'gorev__gorev_tipi')

        if filters.get('atanan_user_id'):
            qs = qs.filter(atanan_user_id=filters['atanan_user_id'])
        if filters.get('baslangic'):
            qs = qs.filter(gorev__son_tarih__gte=filters['baslangic'])
        if filters.get('bitis'):
            qs = qs.filter(gorev__son_tarih__lt=filters['bitis'])
        if filters.get('durum'):
            qs = qs.filter(durum=filters['durum'])

        atamalar = list(qs)
        include_assignees = filters.get('include_assignees', False)

        user_ids = {a.atanan_user_id for a in atamalar}
        name_map = resolve_assignee_names(kurum_id, list(user_ids))

        gorev_assignees: dict = {}
        if include_assignees and atamalar:
            gorev_ids = {a.gorev_id for a in atamalar}
            rows = GorevAtama.objects.filter(
                gorev_id__in=gorev_ids, gorev__is_deleted=False,
            ).values_list('gorev_id', 'atanan_user_id')
            all_user_ids = {uid for _, uid in rows}
            all_names = resolve_assignee_names(kurum_id, list(all_user_ids))
            grouped = defaultdict(list)
            for gid, uid in rows:
                grouped[gid].append(all_names.get(uid, f'Kullanıcı #{uid}'))
            gorev_assignees = dict(grouped)

        return [
            serialize_gorev_compact_for_calendar(
                a.gorev,
                a,
                atanan_ad=name_map.get(a.atanan_user_id),
                atananlar=gorev_assignees.get(a.gorev_id) if include_assignees else None,
            )
            for a in atamalar
        ]

    def get_dashboard_ozet(self, kurum_id: int, user_id: int, role_code: str = None, view_all: bool = False) -> dict:
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)

        is_admin = view_all or role_code in (
            'super_admin', 'kurum_yoneticisi', 'sube_yoneticisi', 'egitim_yoneticisi',
        )

        if is_admin:
            atama_qs = GorevAtama.objects.filter(gorev__kurum_id=kurum_id, gorev__is_deleted=False)
        else:
            atama_qs = GorevAtama.objects.filter(
                gorev__kurum_id=kurum_id,
                gorev__is_deleted=False,
                atanan_user_id=user_id,
            )

        active = [GorevDurum.BEKLIYOR, GorevDurum.BASLADI, GorevDurum.DEVAM_EDIYOR]

        bugun = atama_qs.filter(
            gorev__son_tarih__gte=today_start,
            gorev__son_tarih__lt=today_end,
            durum__in=active,
        ).count()

        geciken = atama_qs.filter(
            gorev__son_tarih__lt=timezone.now(),
            durum__in=active,
        ).count()

        bekleyen = atama_qs.filter(durum=GorevDurum.BEKLIYOR).count()
        tamamlanan = atama_qs.filter(durum=GorevDurum.TAMAMLANDI).count()

        # Tip bazlı sayaçlar (bugün)
        tip_sayaclari = {}
        bugun_atamalar = atama_qs.filter(
            gorev__son_tarih__gte=today_start,
            gorev__son_tarih__lt=today_end,
            durum__in=active,
        ).select_related('gorev__gorev_tipi')

        for a in bugun_atamalar:
            kod = a.gorev.gorev_tipi.kod if a.gorev.gorev_tipi_id else 'DIGER'
            tip_sayaclari[kod] = tip_sayaclari.get(kod, 0) + 1

        return {
            'bugun': bugun,
            'geciken': geciken,
            'bekleyen': bekleyen,
            'tamamlanan': tamamlanan,
            'tip_sayaclari': tip_sayaclari,
            'role': role_code,
        }
