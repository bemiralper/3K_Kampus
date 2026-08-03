"""
Gün Sonu raporu WhatsApp gönderimi — mali hesap yetkililerine PDF.
"""
from __future__ import annotations

import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.finans.application.export.gun_sonu_export_service import GunSonuExportService
from apps.finans.application.gun_sonu_report_service import GunSonuReportService

SOURCE_GUN_SONU = 'finans.gun_sonu'


class GunSonuWhatsappService:
    @classmethod
    def preview(cls, kurum_id: int, sube_id: int | None = None) -> dict:
        recipients = GunSonuReportService().list_whatsapp_recipients(kurum_id, sube_id)
        return {
            'recipients': recipients,
            'count': len(recipients),
            'warning': None if recipients else (
                'WhatsApp gönderimi için mali hesaplara tanımlı yetkili telefonu bulunamadı.'
            ),
        }

    @classmethod
    def send(
        cls,
        kurum_id: int,
        report: dict,
        *,
        recipient_ids: list[int] | None = None,
        message: str | None = None,
        sender_user_id: int | None = None,
    ) -> dict:
        service = GunSonuReportService()
        all_recipients = service.list_whatsapp_recipients(
            kurum_id,
            (report.get('ozet_rapor') or {}).get('meta', {}).get('sube_id'),
        )
        if recipient_ids:
            id_set = {int(x) for x in recipient_ids}
            targets = [r for r in all_recipients if r['id'] in id_set]
        else:
            targets = all_recipients

        if not targets:
            return {'success': False, 'sent': 0, 'errors': ['Alıcı bulunamadı.'], 'results': []}

        ozet_rapor = report.get('ozet_rapor') or {}
        meta = ozet_rapor.get('meta') or {}
        gunluk = ozet_rapor.get('gunluk_ozet') or {}
        body = (message or '').strip() or cls._default_message(meta)
        pdf_bytes = GunSonuExportService.render_pdf_bytes(report)
        filename = f"gun_sonu_{meta.get('tarih_iso', 'rapor')}.pdf"

        def _fmt_money(value) -> str:
            try:
                return f'{int(value or 0):,}'.replace(',', '.')
            except (TypeError, ValueError):
                return str(value or '0')

        results = []
        sent = 0
        errors: list[str] = []

        for target in targets:
            unique_name = f"gun_sonu_{meta.get('tarih_iso', 'rapor')}_{uuid.uuid4().hex[:8]}.pdf"
            storage_path = default_storage.save(
                f'communication/attachments/{unique_name}',
                ContentFile(pdf_bytes),
            )
            result = dispatch_event(
                kurum_id,
                'finans.gun_sonu',
                recipient=NotificationRecipient.personel(
                    target.get('personel_id'), phone=target['telefon'],
                ),
                context={
                    'personel_ad': target['ad_soyad'],
                    'tarih': meta.get('tarih') or meta.get('tarih_iso', ''),
                    'toplam_tahsilat': _fmt_money(gunluk.get('toplam_tahsilat')),
                    'toplam_gider': _fmt_money(gunluk.get('toplam_gider')),
                    'pdf_baslik': 'Gün Sonu Raporu',
                },
                attachment=NotificationAttachment(
                    filename=filename, file_path=storage_path,
                ),
                source=MessageSource(module=SOURCE_GUN_SONU, ref_id=meta.get('tarih_iso', '')),
                sube_id=meta.get('sube_id'),
                sent_by_user_id=sender_user_id,
                fallback_body=body,
            )
            success = bool(result and result.success)
            result_errors = list(getattr(result, 'errors', None) or []) if result else ['Gönderim başarısız']
            results.append({
                'recipient_id': target['id'],
                'ad_soyad': target['ad_soyad'],
                'telefon_maskeli': target['telefon_maskeli'],
                'success': success,
                'errors': result_errors,
            })
            if success:
                sent += 1
            elif result_errors:
                errors.extend(result_errors)

        return {
            'success': sent > 0,
            'sent': sent,
            'total': len(targets),
            'errors': errors,
            'results': results,
        }

    @staticmethod
    def _default_message(meta: dict) -> str:
        return (
            f"📊 *{meta.get('baslik', 'Gün Sonu Finans Raporu')}*\n"
            f"Tarih: {meta.get('tarih', '')}\n"
            f"Şube: {meta.get('sube', '')}\n\n"
            "Detaylı özet rapor ekte yer almaktadır."
        )
