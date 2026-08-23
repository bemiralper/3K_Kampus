"""
Gün sonu WhatsApp gönderimi.

Alıcılar mali hesap yetkilileri / yöneticilerdir. Özet sayfasından
Gün Sonu Raporu, detay sayfasından Gün Sonu Detay Raporu gider.
Otomatik gönderimde hangisinin gideceği ayrı seçilir.
Aynı Meta şablonu ({{tarih}}, {{rapor_ad}}, {{toplam_giren}}, {{toplam_cikan}})
kullanılır. Hat muhasebe numarasıdır.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.notification_schedule_service import (
    GUN_SONU_EVENT,
    auto_blocks_report,
    due_schedules,
    get_schedule,
    mark_sent,
    report_kind_tuple,
)
from apps.communication.application.staff_recipient_service import (
    list_staff_recipients,
    selected_personel_ids,
    yonetici_personel_qs,
)
from apps.finans.application.export.gun_sonu_detay_export_service import GunSonuDetayExportService
from apps.finans.application.export.gun_sonu_export_service import GunSonuExportService
from apps.finans.application.gun_sonu_detay_report_service import GunSonuDetayReportService
from apps.finans.application.gun_sonu_report_service import GunSonuReportService

logger = logging.getLogger(__name__)

SOURCE_GUN_SONU = 'finans.gun_sonu'
RAPOR_AD_OZET = 'Gün Sonu Raporu'
RAPOR_AD_DETAY = 'Gün Sonu Detay Raporu'
MESSAGE_BODY = (
    'Değerli Yetkilimiz,\n'
    '{{tarih}} tarihine ait {{rapor_ad}} ekte PDF olarak '
    'bilgilerinize sunulmuştur.\n\n'
    'Kuruma giren: {{toplam_giren}} TL\n'
    'Kurumdan çıkan: {{toplam_cikan}} TL\n\n'
    'İyi çalışmalar dileriz.'
)


class GunSonuWhatsappService:
    @classmethod
    def preview(
        cls,
        kurum_id: int,
        sube_id: int | None = None,
        *,
        rapor_tipi: str = 'ozet',
    ) -> dict:
        try:
            schedule = get_schedule(kurum_id, GUN_SONU_EVENT, sube_id)
        except Exception:
            logger.exception('Gün sonu zamanlama okunamadı')
            schedule = {
                'is_enabled': False, 'send_time': '18:00', 'report_kinds': 'ozet',
            }
        rapor_tipi = 'detay' if rapor_tipi == 'detay' else 'ozet'
        recipients = cls.list_recipients(kurum_id, sube_id)
        blocked = auto_blocks_report(schedule, rapor_tipi)
        warning = None
        if blocked:
            warning = (
                f"Bu rapor için otomatik gönderim açık ({schedule.get('send_time')}). "
                'Manuel WhatsApp gönderimi kapalı.'
            )
        elif not recipients:
            warning = (
                'Gönderilecek kişi yok. Finans → Mali Hesaplar → Yetkililer’den '
                'tüm hesaplar için yetkili ekleyin veya yönetici/muhasebe '
                'personel kartına WhatsApp telefonu yazın.'
            )
        return {
            'recipients': recipients,
            'count': len(recipients),
            'auto_enabled': bool(schedule.get('is_enabled')),
            'auto_blocks': blocked,
            'send_time': schedule.get('send_time'),
            'report_kinds': schedule.get('report_kinds') or 'ozet',
            'rapor_tipi': rapor_tipi,
            'warning': warning,
        }

    @classmethod
    def list_recipients(
        cls,
        kurum_id: int,
        sube_id: int | None = None,
        *,
        selected_only: bool = False,
    ) -> list[dict]:
        selected: set[int] = set()
        catalog: dict[int, dict] = {}
        try:
            selected = selected_personel_ids(kurum_id, GUN_SONU_EVENT, sube_id=sube_id)
            catalog = {
                row['id']: row
                for row in list_staff_recipients(
                    kurum_id, GUN_SONU_EVENT, sube_id=sube_id,
                )['items']
            }
        except Exception:
            logger.exception('Gün sonu yönetici listesi okunamadı')

        recipients: list[dict] = []
        seen_phones: set[str] = set()
        seen_personel: set[int] = set()

        for row in GunSonuReportService().list_whatsapp_recipients(kurum_id, sube_id):
            phone = (row.get('telefon') or '').strip()
            key = phone.replace(' ', '')
            if not key or key in seen_phones:
                continue
            seen_phones.add(key)
            personel_id = row.get('personel_id')
            if personel_id:
                seen_personel.add(personel_id)
            row_id = personel_id if personel_id else -int(row['id'])
            is_selected = (
                personel_id in selected if selected and personel_id else not selected
            )
            if selected_only and selected and not is_selected:
                continue
            recipients.append({
                'id': row_id,
                'personel_id': personel_id,
                'ad_soyad': row.get('ad_soyad') or '',
                'rol': row.get('rol') or 'Mali hesap yetkilisi',
                'telefon': phone,
                'telefon_maskeli': row.get('telefon_maskeli') or '',
                'mali_hesap_ad': row.get('mali_hesap_ad') or 'Tüm mali hesaplar',
                'selected': is_selected,
            })

        try:
            yoneticiler = yonetici_personel_qs(kurum_id, GUN_SONU_EVENT).order_by(
                'ad', 'soyad',
            )
        except Exception:
            logger.exception('Gün sonu yönetici sorgusu başarısız')
            yoneticiler = []

        for personel in yoneticiler:
            if selected_only and selected and personel.id not in selected:
                continue
            phone = (personel.cep_telefon or personel.telefon or '').strip()
            if not phone:
                continue
            key = phone.replace(' ', '')
            if key in seen_phones or personel.id in seen_personel:
                continue
            seen_phones.add(key)
            seen_personel.add(personel.id)
            info = catalog.get(personel.id) or {}
            recipients.append({
                'id': personel.id,
                'personel_id': personel.id,
                'ad_soyad': f'{personel.ad} {personel.soyad}'.strip(),
                'rol': info.get('rol') or '',
                'telefon': phone,
                'telefon_maskeli': GunSonuReportService._mask_phone(phone),
                'mali_hesap_ad': '',
                'selected': personel.id in selected if selected else True,
            })
        return recipients

    @classmethod
    def send(
        cls,
        kurum_id: int,
        *,
        gun: date,
        sube_id: int | None,
        recipient_ids: list[int] | None = None,
        message: str | None = None,
        sender_user_id: int | None = None,
        notlar: str = '',
        hazirlayan: str = 'Sistem',
        allow_when_auto: bool = False,
        rapor_tipi: str = 'ozet',
    ) -> dict:
        rapor_tipi = 'detay' if rapor_tipi == 'detay' else 'ozet'
        schedule = get_schedule(kurum_id, GUN_SONU_EVENT, sube_id)
        if auto_blocks_report(schedule, rapor_tipi) and not allow_when_auto:
            return {
                'success': False,
                'sent': 0,
                'total': 0,
                'errors': [
                    f"Bu rapor için otomatik gönderim açık ({schedule.get('send_time')}); "
                    'manuel WhatsApp gönderimi kapalı.',
                ],
                'results': [],
                'auto_enabled': True,
            }

        all_recipients = cls.list_recipients(
            kurum_id, sube_id, selected_only=allow_when_auto,
        )
        if recipient_ids:
            id_set = {int(x) for x in recipient_ids}
            targets = [r for r in all_recipients if r['id'] in id_set]
        else:
            targets = all_recipients

        if not targets:
            return {
                'success': False,
                'sent': 0,
                'total': 0,
                'errors': ['Alıcı yönetici bulunamadı.'],
                'results': [],
                'auto_enabled': bool(schedule.get('is_enabled')),
            }

        ozet_report = GunSonuReportService().build_ozet_rapor(
            kurum_id, gun, sube_id, hazirlayan=hazirlayan, notlar=notlar,
        )
        detay_report = None
        if rapor_tipi == 'detay':
            detay_report = GunSonuDetayReportService().build_detay_rapor(
                kurum_id, gun, sube_id, hazirlayan=hazirlayan, notlar=notlar,
            )
        ozet_rapor = ozet_report.get('ozet_rapor') or {}
        meta = ozet_rapor.get('meta') or {}
        gunluk = ozet_rapor.get('gunluk_ozet') or {}
        tarih_iso = meta.get('tarih_iso') or gun.isoformat()
        tarih_label = meta.get('tarih') or tarih_iso
        toplam_giren = cls._fmt_money(
            gunluk.get('toplam_alinan', gunluk.get('toplam_tahsilat')),
        )
        toplam_cikan = cls._fmt_money(
            (gunluk.get('toplam_gider') or 0) + (gunluk.get('toplam_iade') or 0),
        )

        if rapor_tipi == 'detay':
            detay_bytes = GunSonuDetayExportService.render_pdf_bytes(detay_report)
            attachments = ((
                'detay',
                RAPOR_AD_DETAY,
                f'gun_sonu_detay_{tarih_iso}.pdf',
                detay_bytes,
            ),)
        else:
            ozet_bytes = GunSonuExportService.render_pdf_bytes(ozet_report)
            attachments = ((
                'ozet',
                RAPOR_AD_OZET,
                f'gun_sonu_{tarih_iso}.pdf',
                ozet_bytes,
            ),)

        results = []
        sent = 0
        errors: list[str] = []

        for target in targets:
            recipient_ok = True
            part_errors: list[str] = []
            for kind, rapor_ad, filename, pdf_bytes in attachments:
                unique_name = f'{kind}_{tarih_iso}_{uuid.uuid4().hex[:8]}.pdf'
                storage_path = default_storage.save(
                    f'communication/attachments/{unique_name}',
                    ContentFile(pdf_bytes),
                )
                result = dispatch_event(
                    kurum_id,
                    GUN_SONU_EVENT,
                    recipient=NotificationRecipient.personel(
                        target.get('personel_id'), phone=target['telefon'],
                    ),
                    context={
                        'personel_ad': target['ad_soyad'],
                        'tarih': tarih_label,
                        'rapor_ad': rapor_ad,
                        'pdf_baslik': rapor_ad,
                        'toplam_giren': toplam_giren,
                        'toplam_cikan': toplam_cikan,
                    },
                    attachment=NotificationAttachment(
                        filename=filename, file_path=storage_path,
                    ),
                    source=MessageSource(
                        module=SOURCE_GUN_SONU,
                        ref_id=f'{tarih_iso}:{sube_id or 0}:{kind}:p{target["id"]}',
                    ),
                    sube_id=sube_id or meta.get('sube_id'),
                    sent_by_user_id=sender_user_id,
                    fallback_body=MESSAGE_BODY,
                )
                success = bool(result and result.success)
                result_errors = (
                    list(getattr(result, 'errors', None) or [])
                    if result else ['Gönderim başarısız']
                )
                if not success:
                    recipient_ok = False
                    part_errors.extend(f'{rapor_ad}: {err}' for err in result_errors)

            results.append({
                'recipient_id': target['id'],
                'ad_soyad': target['ad_soyad'],
                'telefon_maskeli': target['telefon_maskeli'],
                'success': recipient_ok,
                'errors': part_errors,
            })
            if recipient_ok:
                sent += 1
            elif part_errors:
                errors.extend(part_errors)

        return {
            'success': sent > 0,
            'sent': sent,
            'total': len(targets),
            'errors': errors,
            'results': results,
            'auto_enabled': bool(schedule.get('is_enabled')),
        }

    @classmethod
    def send_for_schedule(cls, row, *, gun: date | None = None, dry_run: bool = False) -> dict:
        from apps.sube.domain.models import Sube

        gun = gun or timezone_today()
        if row.sube_id:
            sube_ids = [row.sube_id]
        else:
            scoped = set(
                type(row).objects.filter(
                    kurum_id=row.kurum_id,
                    event_key=row.event_key,
                    sube__isnull=False,
                ).values_list('sube_id', flat=True)
            )
            sube_ids = list(
                Sube.objects.filter(kurum_id=row.kurum_id, aktif_mi=True)
                .exclude(id__in=scoped)
                .values_list('id', flat=True)
            )
        if dry_run:
            return {
                'kurum_id': row.kurum_id,
                'sube_ids': sube_ids,
                'dry_run': True,
                'sent': 0,
            }
        sent = 0
        errors: list[str] = []
        kinds = report_kind_tuple(getattr(row, 'report_kinds', None))
        for sube_id in sube_ids:
            for rapor_tipi in kinds:
                result = cls.send(
                    row.kurum_id,
                    gun=gun,
                    sube_id=sube_id,
                    allow_when_auto=True,
                    hazirlayan='Sistem (otomatik)',
                    rapor_tipi=rapor_tipi,
                )
                sent += int(result.get('sent') or 0)
                errors.extend(result.get('errors') or [])
        mark_sent(row, gun)
        return {
            'kurum_id': row.kurum_id,
            'sube_ids': sube_ids,
            'sent': sent,
            'errors': errors,
        }

    @classmethod
    def run_due(cls, *, now=None, dry_run: bool = False) -> list[dict]:
        results = []
        for row in due_schedules(event_key=GUN_SONU_EVENT, now=now):
            results.append(cls.send_for_schedule(row, dry_run=dry_run))
        return results

    @staticmethod
    def _fmt_money(value) -> str:
        try:
            return f'{int(value or 0):,}'.replace(',', '.')
        except (TypeError, ValueError):
            return str(value or '0')

    @staticmethod
    def render_message(
        *,
        tarih: str,
        rapor_ad: str,
        toplam_giren: str = '0',
        toplam_cikan: str = '0',
    ) -> str:
        return (
            MESSAGE_BODY
            .replace('{{tarih}}', tarih or '')
            .replace('{{rapor_ad}}', rapor_ad or '')
            .replace('{{toplam_giren}}', toplam_giren or '0')
            .replace('{{toplam_cikan}}', toplam_cikan or '0')
        )


def timezone_today():
    from django.utils import timezone
    return timezone.localdate()
