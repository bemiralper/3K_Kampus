"""
Gün Sonu raporu WhatsApp gönderimi — mali hesap yetkililerine PDF.
"""
from __future__ import annotations

import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from apps.communication.application.communication_service import (
    CommunicationService,
    MessageContent,
    MessageSource,
    RecipientQuery,
    SendResult,
)
from apps.communication.domain.enums import MessageType
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

        meta = (report.get('ozet_rapor') or {}).get('meta') or {}
        body = (message or '').strip() or cls._default_message(meta)
        pdf_bytes = GunSonuExportService.render_pdf_bytes(report)
        filename = f"gun_sonu_{meta.get('tarih_iso', 'rapor')}.pdf"

        comm = CommunicationService()
        results = []
        sent = 0
        errors: list[str] = []

        for target in targets:
            unique_name = f"gun_sonu_{meta.get('tarih_iso', 'rapor')}_{uuid.uuid4().hex[:8]}.pdf"
            storage_path = default_storage.save(
                f'communication/attachments/{unique_name}',
                ContentFile(pdf_bytes),
            )
            result: SendResult = comm.send(
                kurum_id,
                recipients=RecipientQuery(phone=target['telefon']),
                content=MessageContent(
                    text=body,
                    message_type=MessageType.DOCUMENT,
                    attachment_path=storage_path,
                    attachment_filename=filename,
                ),
                source=MessageSource(module=SOURCE_GUN_SONU, ref_id=meta.get('tarih_iso', '')),
                sender_user_id=sender_user_id,
                process_immediately=True,
            )
            results.append({
                'recipient_id': target['id'],
                'ad_soyad': target['ad_soyad'],
                'telefon_maskeli': target['telefon_maskeli'],
                'success': result.success,
                'errors': result.errors,
            })
            if result.success:
                sent += 1
            elif result.errors:
                errors.extend(result.errors)

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
