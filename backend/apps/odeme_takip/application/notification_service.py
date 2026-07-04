"""
Ödeme planı / makbuz / sözleşme WhatsApp gönderimi — önizleme ve çoklu alıcı.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.integration_hooks import (
    SOURCE_ODEME,
    send_document_to_ogrenci,
    send_document_to_veli,
)
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat
from apps.ogrenci.application.veli_contact import list_outbound_veliler

from .odeme_notify_utils import (
    NOTIFY_MAKBUZ,
    NOTIFY_PLAN,
    NOTIFY_SOZLESME,
    build_makbuz_pdf_filename,
    build_pdf_attachment_message,
    build_sozlesme_pdf_filename,
    pdf_title_label,
)

OPT_IN_CATEGORY = 'odeme'
# Personel tarafından gönderilen belgeler (makbuz/sözleşme/plan) — genel iletişim kapsamında
DOCUMENT_DELIVERY_CATEGORY = 'genel'


@dataclass
class OdemeNotifyRecipient:
    recipient_type: str  # veli | ogrenci
    ogrenci_id: int
    veli_id: int | None
    display_name: str
    telefon: str
    body: str
    skip_reason: str = ''
    send_count: int = 0
    last_sent_at: str | None = None
    send_history: list[dict] = field(default_factory=list)


@dataclass
class OdemeNotifyPreview:
    notify_type: str
    entity_id: int
    sozlesme_id: int
    sozlesme_no: str
    student_name: str
    recipients: list[OdemeNotifyRecipient] = field(default_factory=list)
    pdf_title: str = ''
    extra_label: str = ''


class OdemeNotificationService:
    def _get_sozlesme(self, sozlesme_id: int, kurum_id: int) -> Sozlesme | None:
        return (
            Sozlesme.objects.select_related('ogrenci', 'veli', 'kurum')
            .filter(id=sozlesme_id, kurum_id=kurum_id)
            .first()
        )

    def _get_tahsilat(self, tahsilat_id: int, kurum_id: int) -> Tahsilat | None:
        return (
            Tahsilat.objects.select_related(
                'sozlesme', 'sozlesme__ogrenci', 'sozlesme__veli', 'sozlesme__kurum',
            )
            .filter(id=tahsilat_id, sozlesme__kurum_id=kurum_id)
            .first()
        )

    def _mask_phone(self, phone: str) -> str:
        p = (phone or '').strip()
        if len(p) > 6:
            return p[:4] + '***' + p[-2:]
        return '***'

    def _source_id(self, notify_type: str, entity_id: int, recipient_key: str) -> str:
        return f'{notify_type}:{entity_id}:{recipient_key}'

    def _recipient_send_history(
        self,
        kurum_id: int,
        source_ref: str,
        *,
        veli_id: int | None = None,
        ogrenci_id: int | None = None,
    ) -> list[dict]:
        from apps.communication.domain.models import Message

        qs = Message.objects.filter(
            source_module=SOURCE_ODEME,
            source_ref_id=source_ref,
            conversation__kurum_id=kurum_id,
        ).select_related('conversation').order_by('-created_at')

        if veli_id is not None:
            qs = qs.filter(conversation__veli_id=veli_id)
        elif ogrenci_id is not None:
            qs = qs.filter(conversation__ogrenci_id=ogrenci_id).filter(
                Q(conversation__veli_id__isnull=True),
            )

        history: list[dict] = []
        for msg in qs[:15]:
            history.append({
                'sent_at': timezone.localtime(msg.created_at).strftime('%d.%m.%Y %H:%M'),
                'status': msg.status,
            })
        return history

    def _build_recipients(
        self,
        kurum_id: int,
        *,
        notify_type: str,
        entity_id: int,
        ogrenci,
        sozlesme_no: str,
        extra_line: str = '',
    ) -> list[OdemeNotifyRecipient]:
        ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
        kurum = getattr(ogrenci, 'kurum', None)
        kurum_ad = kurum.ad if kurum else ''
        recipients: list[OdemeNotifyRecipient] = []

        veli_pairs = list_outbound_veliler(ogrenci)
        for veli, phone in veli_pairs:
            body = build_pdf_attachment_message(
                notify_type=notify_type,
                ogrenci_ad=ogrenci_ad,
                sozlesme_no=sozlesme_no,
                for_veli=True,
                kurum_ad=kurum_ad,
                extra_line=extra_line,
            )
            skip = ''
            if not ContactResolver.veli_allows_outbound(veli, DOCUMENT_DELIVERY_CATEGORY):
                skip = 'Veli iletişim izni bulunmuyor'

            source_ref = self._source_id(notify_type, entity_id, f'veli:{veli.id}')
            history = self._recipient_send_history(kurum_id, source_ref, veli_id=veli.id)

            recipients.append(OdemeNotifyRecipient(
                recipient_type='veli',
                ogrenci_id=ogrenci.id,
                veli_id=veli.id,
                display_name=veli.tam_ad,
                telefon=self._mask_phone(phone),
                body=body,
                skip_reason=skip,
                send_count=len(history),
                last_sent_at=history[0]['sent_at'] if history else None,
                send_history=history,
            ))

        if not veli_pairs:
            recipients.append(OdemeNotifyRecipient(
                recipient_type='veli',
                ogrenci_id=ogrenci.id,
                veli_id=None,
                display_name='',
                telefon='',
                body='',
                skip_reason='Veli telefonu bulunamadı',
            ))

        student_phone = (ogrenci.telefon or '').strip()
        student_body = build_pdf_attachment_message(
            notify_type=notify_type,
            ogrenci_ad=ogrenci_ad,
            sozlesme_no=sozlesme_no,
            for_veli=False,
            kurum_ad=kurum_ad,
            extra_line=extra_line,
        )
        student_skip = ''
        if not student_phone:
            student_skip = 'Öğrenci telefonu bulunamadı'

        student_source = self._source_id(notify_type, entity_id, 'ogrenci')
        student_history = self._recipient_send_history(
            kurum_id, student_source, ogrenci_id=ogrenci.id,
        )

        recipients.append(OdemeNotifyRecipient(
            recipient_type='ogrenci',
            ogrenci_id=ogrenci.id,
            veli_id=None,
            display_name=ogrenci_ad,
            telefon=self._mask_phone(student_phone) if student_phone else '',
            body=student_body,
            skip_reason=student_skip,
            send_count=len(student_history),
            last_sent_at=student_history[0]['sent_at'] if student_history else None,
            send_history=student_history,
        ))

        return recipients

    def preview_sozlesme(
        self,
        kurum_id: int,
        sozlesme_id: int,
        notify_type: str,
    ) -> OdemeNotifyPreview:
        if notify_type not in (NOTIFY_PLAN, NOTIFY_SOZLESME):
            raise ValueError('type plan veya sozlesme olmalı.')

        sozlesme = self._get_sozlesme(sozlesme_id, kurum_id)
        if not sozlesme:
            raise ValueError('Sözleşme bulunamadı.')
        if not sozlesme.ogrenci:
            raise ValueError('Sözleşmede öğrenci kaydı yok.')

        ogrenci_ad = f'{sozlesme.ogrenci.ad} {sozlesme.ogrenci.soyad}'.strip()
        recipients = self._build_recipients(
            kurum_id,
            notify_type=notify_type,
            entity_id=sozlesme_id,
            ogrenci=sozlesme.ogrenci,
            sozlesme_no=sozlesme.sozlesme_no or str(sozlesme_id),
        )

        return OdemeNotifyPreview(
            notify_type=notify_type,
            entity_id=sozlesme_id,
            sozlesme_id=sozlesme_id,
            sozlesme_no=sozlesme.sozlesme_no or str(sozlesme_id),
            student_name=ogrenci_ad,
            recipients=recipients,
            pdf_title=pdf_title_label(notify_type),
        )

    def preview_tahsilat(self, kurum_id: int, tahsilat_id: int) -> OdemeNotifyPreview:
        tahsilat = self._get_tahsilat(tahsilat_id, kurum_id)
        if not tahsilat:
            raise ValueError('Tahsilat bulunamadı.')
        if tahsilat.durum != 'aktif':
            raise ValueError('Yalnızca aktif tahsilat makbuzu gönderilebilir.')

        sozlesme = tahsilat.sozlesme
        if not sozlesme or not sozlesme.ogrenci:
            raise ValueError('Tahsilat sözleşme/öğrenci bilgisi eksik.')

        ogrenci_ad = f'{sozlesme.ogrenci.ad} {sozlesme.ogrenci.soyad}'.strip()
        tutar = int(round(float(tahsilat.tutar or 0)))
        extra = f'Tahsilat tutarı: {tutar:,} TL'.replace(',', '.')

        recipients = self._build_recipients(
            kurum_id,
            notify_type=NOTIFY_MAKBUZ,
            entity_id=tahsilat_id,
            ogrenci=sozlesme.ogrenci,
            sozlesme_no=sozlesme.sozlesme_no or str(sozlesme.id),
            extra_line=extra,
        )

        return OdemeNotifyPreview(
            notify_type=NOTIFY_MAKBUZ,
            entity_id=tahsilat_id,
            sozlesme_id=sozlesme.id,
            sozlesme_no=sozlesme.sozlesme_no or str(sozlesme.id),
            student_name=ogrenci_ad,
            recipients=recipients,
            pdf_title=pdf_title_label(NOTIFY_MAKBUZ),
            extra_label=extra,
        )

    def _render_pdf(
        self,
        notify_type: str,
        entity_id: int,
        kurum_id: int,
        *,
        sozlesme: Sozlesme | None = None,
        tahsilat: Tahsilat | None = None,
    ) -> tuple[bytes, str]:
        from .document_pdf_service import (
            render_makbuz_pdf,
            render_odeme_plan_pdf,
            render_sozlesme_pdf,
        )

        if notify_type == NOTIFY_PLAN:
            pdf_bytes = render_odeme_plan_pdf(entity_id, kurum_id)
            filename = build_sozlesme_pdf_filename(sozlesme, NOTIFY_PLAN) if sozlesme else 'Odeme-Plani.pdf'
        elif notify_type == NOTIFY_SOZLESME:
            pdf_bytes = render_sozlesme_pdf(entity_id, kurum_id)
            filename = build_sozlesme_pdf_filename(sozlesme, NOTIFY_SOZLESME) if sozlesme else 'Sozlesme.pdf'
        elif notify_type == NOTIFY_MAKBUZ:
            pdf_bytes = render_makbuz_pdf(entity_id, kurum_id)
            filename = build_makbuz_pdf_filename(tahsilat) if tahsilat else 'Tahsilat-Makbuzu.pdf'
        else:
            raise ValueError('Geçersiz belge türü.')

        if len(pdf_bytes) < 2500 or not pdf_bytes.startswith(b'%PDF'):
            raise ValueError('PDF oluşturulamadı.')
        return pdf_bytes, filename

    @transaction.atomic
    def send_sozlesme(
        self,
        kurum_id: int,
        sozlesme_id: int,
        notify_type: str,
        *,
        veli_ids: list[int] | None = None,
        include_student: bool = False,
        sent_by_user_id: int | None = None,
    ) -> dict:
        preview = self.preview_sozlesme(kurum_id, sozlesme_id, notify_type)
        sozlesme = self._get_sozlesme(sozlesme_id, kurum_id)
        if not sozlesme:
            raise ValueError('Sözleşme bulunamadı.')

        pdf_bytes, filename = self._render_pdf(
            notify_type, sozlesme_id, kurum_id, sozlesme=sozlesme,
        )
        return self._dispatch_send(
            kurum_id,
            preview,
            notify_type,
            sozlesme_id,
            veli_ids=veli_ids,
            include_student=include_student,
            sent_by_user_id=sent_by_user_id,
            pdf_bytes=pdf_bytes,
            filename=filename,
            sozlesme=sozlesme,
        )

    @transaction.atomic
    def send_tahsilat(
        self,
        kurum_id: int,
        tahsilat_id: int,
        *,
        veli_ids: list[int] | None = None,
        include_student: bool = False,
        sent_by_user_id: int | None = None,
    ) -> dict:
        preview = self.preview_tahsilat(kurum_id, tahsilat_id)
        tahsilat = self._get_tahsilat(tahsilat_id, kurum_id)
        if not tahsilat:
            raise ValueError('Tahsilat bulunamadı.')

        pdf_bytes, filename = self._render_pdf(
            NOTIFY_MAKBUZ, tahsilat_id, kurum_id, tahsilat=tahsilat,
        )
        return self._dispatch_send(
            kurum_id,
            preview,
            NOTIFY_MAKBUZ,
            tahsilat_id,
            veli_ids=veli_ids,
            include_student=include_student,
            sent_by_user_id=sent_by_user_id,
            pdf_bytes=pdf_bytes,
            filename=filename,
            sozlesme=tahsilat.sozlesme,
        )

    def _dispatch_send(
        self,
        kurum_id: int,
        preview: OdemeNotifyPreview,
        notify_type: str,
        entity_id: int,
        *,
        veli_ids: list[int] | None,
        include_student: bool,
        sent_by_user_id: int | None,
        pdf_bytes: bytes,
        filename: str,
        sozlesme: Sozlesme | None,
    ) -> dict:
        selected_veli = set(veli_ids or [])
        sent = 0
        skipped = 0
        errors: list[str] = []
        sent_details: list[dict] = []
        from apps.communication.application.debug_trace import mask_phone
        kurum_ad = sozlesme.kurum.ad if sozlesme and sozlesme.kurum else ''
        sozlesme_no = preview.sozlesme_no
        ogrenci_ad = preview.student_name
        extra_line = preview.extra_label

        for item in preview.recipients:
            if item.recipient_type == 'veli':
                if not item.veli_id or item.veli_id not in selected_veli:
                    continue
                if item.skip_reason:
                    skipped += 1
                    errors.append(f'{item.display_name}: {item.skip_reason}')
                    continue
                short_body = build_pdf_attachment_message(
                    notify_type=notify_type,
                    ogrenci_ad=ogrenci_ad,
                    sozlesme_no=sozlesme_no,
                    for_veli=True,
                    kurum_ad=kurum_ad,
                    extra_line=extra_line,
                )
                result = send_document_to_veli(
                    kurum_id,
                    item.veli_id,
                    short_body,
                    DOCUMENT_DELIVERY_CATEGORY,
                    SOURCE_ODEME,
                    self._source_id(notify_type, entity_id, f'veli:{item.veli_id}'),
                    file_bytes=pdf_bytes,
                    filename=filename,
                    sent_by_user_id=sent_by_user_id,
                )
                if result and result.success:
                    sent += 1
                    sent_details.append({
                        'recipient_type': 'veli',
                        'display_name': item.display_name,
                        'telefon': mask_phone(result.sent_to_phone or item.telefon),
                        'message_status': result.message_status or 'SENT',
                    })
                else:
                    skipped += 1
                    if result and result.errors:
                        label = item.display_name or item.recipient_type
                        errors.extend(f'{label}: {err}' for err in result.errors)
                    else:
                        label = item.display_name or item.recipient_type
                        errors.append(f'{label}: Gönderim başarısız.')

            elif item.recipient_type == 'ogrenci' and include_student:
                if item.skip_reason:
                    skipped += 1
                    errors.append(f'{item.display_name}: {item.skip_reason}')
                    continue
                short_body = build_pdf_attachment_message(
                    notify_type=notify_type,
                    ogrenci_ad=ogrenci_ad,
                    sozlesme_no=sozlesme_no,
                    for_veli=False,
                    kurum_ad=kurum_ad,
                    extra_line=extra_line,
                )
                result = send_document_to_ogrenci(
                    kurum_id,
                    item.ogrenci_id,
                    short_body,
                    DOCUMENT_DELIVERY_CATEGORY,
                    SOURCE_ODEME,
                    self._source_id(notify_type, entity_id, 'ogrenci'),
                    file_bytes=pdf_bytes,
                    filename=filename,
                    sent_by_user_id=sent_by_user_id,
                )
                if result and result.success:
                    sent += 1
                    sent_details.append({
                        'recipient_type': 'ogrenci',
                        'display_name': item.display_name,
                        'telefon': mask_phone(result.sent_to_phone or item.telefon),
                        'message_status': result.message_status or 'SENT',
                    })
                else:
                    skipped += 1
                    if result and result.errors:
                        label = item.display_name or item.recipient_type
                        errors.extend(f'{label}: {err}' for err in result.errors)
                    else:
                        label = item.display_name or item.recipient_type
                        errors.append(f'{label}: Gönderim başarısız.')

        if sent:
            try:
                from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue
                dispatch_process_outbound_queue()
            except Exception:
                pass

        return {'sent': sent, 'skipped': skipped, 'errors': errors, 'sent_details': sent_details}
