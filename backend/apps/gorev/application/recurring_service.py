"""Tekrarlayan görev şablonları — üretim servisi."""
import calendar
import logging
from datetime import date, datetime, timedelta

from django.utils import timezone

from apps.gorev.domain.enums import TekrarTipi
from apps.gorev.domain.models import GorevTekrarSablonu
from apps.gorev.application.service import GorevService

logger = logging.getLogger('gorev.recurring')


class GorevRecurringService:
    def __init__(self):
        self.gorev_service = GorevService()

    def compute_next_date(self, sablon: GorevTekrarSablonu, from_date: date) -> date:
        tekrar = sablon.tekrar_tipi

        if tekrar == TekrarTipi.GUNLUK:
            return from_date + timedelta(days=1)

        if tekrar == TekrarTipi.HAFTALIK_PAZARTESI:
            days_ahead = (0 - from_date.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return from_date + timedelta(days=days_ahead)

        if tekrar == TekrarTipi.HAFTALIK_CUMA:
            days_ahead = (4 - from_date.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return from_date + timedelta(days=days_ahead)

        if tekrar == TekrarTipi.HAFTALIK:
            target_dow = sablon.tekrar_gun if sablon.tekrar_gun is not None else 0
            days_ahead = (target_dow - from_date.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return from_date + timedelta(days=days_ahead)

        if tekrar == TekrarTipi.AYLIK_GUN:
            day = sablon.tekrar_gun or 1
            day = min(day, 28)
            if from_date.day >= day:
                month = from_date.month + 1
                year = from_date.year
                if month > 12:
                    month = 1
                    year += 1
            else:
                month = from_date.month
                year = from_date.year
            return date(year, month, day)

        if tekrar == TekrarTipi.AY_SONU:
            last_day = calendar.monthrange(from_date.year, from_date.month)[1]
            if from_date.day >= last_day:
                month = from_date.month + 1
                year = from_date.year
                if month > 12:
                    month = 1
                    year += 1
                last_day = calendar.monthrange(year, month)[1]
            else:
                month = from_date.month
                year = from_date.year
            return date(year, month, last_day)

        return from_date + timedelta(days=1)

    def process_due_sablonlar(self, kurum_id: int = None) -> int:
        today = timezone.localdate()
        qs = GorevTekrarSablonu.objects.filter(
            aktif=True,
            is_deleted=False,
            sonraki_uretim_tarihi__lte=today,
        ).select_related('gorev_tipi')

        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)

        created = 0
        for sablon in qs:
            try:
                son_tarih = timezone.make_aware(
                    datetime.combine(sablon.sonraki_uretim_tarihi, datetime.min.time().replace(hour=9))
                )
                kaynak_id = f'sablon-{sablon.id}:{sablon.sonraki_uretim_tarihi.isoformat()}'

                from apps.gorev.application.rule_engine import GorevRuleEngine
                engine = GorevRuleEngine()
                if engine.gorev_exists(sablon.kurum_id, 'tekrar_sablon', kaynak_id):
                    sablon.sonraki_uretim_tarihi = self.compute_next_date(
                        sablon, sablon.sonraki_uretim_tarihi
                    )
                    sablon.save(update_fields=['sonraki_uretim_tarihi', 'updated_at'])
                    continue

                self.gorev_service.create_gorev(sablon.kurum_id, {
                    'gorev_tipi_id': str(sablon.gorev_tipi_id),
                    'baslik': sablon.baslik,
                    'aciklama': sablon.aciklama,
                    'oncelik': sablon.oncelik,
                    'son_tarih': son_tarih,
                    'tahmini_sure_dk': sablon.tahmini_sure_dk,
                    'tum_gun': sablon.tum_gun,
                    'hedef_tipi': sablon.hedef_tipi,
                    'hedef_rol_kodu': sablon.hedef_rol_kodu,
                    'hedef_user_ids': sablon.hedef_user_ids,
                    'kaynak_modul': 'tekrar_sablon',
                    'kaynak_id': kaynak_id,
                    'sube_id': sablon.sube_id,
                }, olusturan_id=sablon.olusturan_id)

                sablon.sonraki_uretim_tarihi = self.compute_next_date(
                    sablon, sablon.sonraki_uretim_tarihi
                )
                sablon.save(update_fields=['sonraki_uretim_tarihi', 'updated_at'])
                created += 1
            except Exception:
                logger.exception('Tekrar şablonu işlenemedi: %s', sablon.id)

        return created
