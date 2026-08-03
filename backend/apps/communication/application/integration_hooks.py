"""
Modül entegrasyon hook'ları — tüm LMS modülleri buradan CommunicationService'e bağlanır.

Non-blocking: hata parent transaction'ı bozmaz, loglanır.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone

from apps.communication.application.communication_service import (
    CommunicationService,
    MessageContent,
    MessageSource,
    RecipientQuery,
    SendResult,
)
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.domain.enums import MessageType
from apps.communication.domain.models import Message

logger = logging.getLogger(__name__)

_service = CommunicationService()

SOURCE_GORUSME = 'gorusme'
SOURCE_ODEME = 'odeme'
SOURCE_ODEV = 'odev'
SOURCE_SINAV = 'sinav'
SOURCE_DEVAMSIZLIK = 'devamsizlik'
SOURCE_DUYURU = 'duyuru'


def _safe_hook(fn, *args, **kwargs) -> SendResult | None:
    try:
        return fn(*args, **kwargs)
    except Exception:
        logger.exception('Communication integration hook failed: %s', fn.__name__)
        return None


def _veli_recipient_query(veli, *, category: str) -> RecipientQuery:
    """Veli gönderiminde doğru thread ve telefon — ogrenci konuşmasına düşmeyi önler."""
    from apps.ogrenci.application.veli_contact import effective_veli_phone

    ogrenci = getattr(veli, 'ogrenci', None)
    phone = effective_veli_phone(veli, ogrenci) or (getattr(veli, 'telefon', '') or '').strip()
    return RecipientQuery(
        phone=phone or None,
        veli_id=veli.id,
        ogrenci_id=ogrenci.id if ogrenci else None,
        opt_in_category=category,
    )


def already_sent(
    kurum_id: int,
    source_module: str,
    source_id: str | int,
    *,
    veli_id: int | None = None,
    ogrenci_id: int | None = None,
) -> bool:
    qs = Message.objects.filter(
        source_module=source_module,
        source_ref_id=str(source_id),
        conversation__kurum_id=kurum_id,
    )
    if veli_id:
        qs = qs.filter(conversation__veli_id=veli_id)
    if ogrenci_id:
        qs = qs.filter(conversation__ogrenci_id=ogrenci_id)
    return qs.exists()


def send_text_to_veli(
    kurum_id: int,
    veli_id: int,
    body: str,
    category: str,
    source_module: str,
    source_id: str | int,
    *,
    sent_by_user_id: int | None = None,
    session_fallback: dict | None = None,
) -> SendResult | None:
    from apps.ogrenci.domain.models import OgrenciVeli

    veli = OgrenciVeli.objects.filter(id=veli_id, ogrenci__kurum_id=kurum_id).first()
    if not veli:
        return SendResult(success=False, errors=['Veli bulunamadı.'])
    if not ContactResolver.veli_allows_outbound(veli, category):
        return SendResult(success=False, errors=['Veli opt-out.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=_veli_recipient_query(veli, category=category),
        content=MessageContent(text=body, session_fallback=session_fallback),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_text_to_ogrenci(
    kurum_id: int,
    ogrenci_id: int,
    body: str,
    source_module: str,
    source_id: str | int,
    *,
    sent_by_user_id: int | None = None,
    session_fallback: dict | None = None,
) -> SendResult | None:
    from apps.ogrenci.domain.models import Ogrenci

    ogrenci = Ogrenci.objects.filter(id=ogrenci_id, kurum_id=kurum_id).first()
    if not ogrenci or not ogrenci.telefon:
        logger.info('Öğrenci telefonu yok, atlandı: ogrenci_id=%s', ogrenci_id)
        return SendResult(success=False, errors=['Öğrenci telefonu bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=RecipientQuery(phone=ogrenci.telefon, ogrenci_id=ogrenci_id),
        content=MessageContent(text=body, session_fallback=session_fallback),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_document_to_ogrenci(
    kurum_id: int,
    ogrenci_id: int,
    body: str,
    category: str,
    source_module: str,
    source_id: str | int,
    *,
    file_path: str | None = None,
    file_bytes: bytes | None = None,
    filename: str = 'document.pdf',
    sent_by_user_id: int | None = None,
    session_fallback: dict | None = None,
) -> SendResult | None:
    from apps.ogrenci.domain.models import Ogrenci

    ogrenci = Ogrenci.objects.filter(id=ogrenci_id, kurum_id=kurum_id).first()
    if not ogrenci or not ogrenci.telefon:
        return SendResult(success=False, errors=['Öğrenci telefonu bulunamadı.'])

    storage_path = file_path
    if file_bytes and not storage_path:
        storage_path = default_storage.save(
            f'communication/attachments/{filename}',
            ContentFile(file_bytes),
        )

    if not storage_path:
        return SendResult(success=False, errors=['Dosya bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=RecipientQuery(
            phone=ogrenci.telefon,
            ogrenci_id=ogrenci_id,
            opt_in_category=category,
        ),
        content=MessageContent(
            text=body,
            message_type=MessageType.DOCUMENT,
            attachment_path=storage_path,
            attachment_filename=filename,
            session_fallback=session_fallback,
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_document_to_veli(
    kurum_id: int,
    veli_id: int,
    body: str,
    category: str,
    source_module: str,
    source_id: str | int,
    *,
    file_path: str | None = None,
    file_bytes: bytes | None = None,
    filename: str = 'document.pdf',
    sent_by_user_id: int | None = None,
    session_fallback: dict | None = None,
) -> SendResult | None:
    from apps.ogrenci.domain.models import OgrenciVeli

    veli = OgrenciVeli.objects.filter(id=veli_id, ogrenci__kurum_id=kurum_id).first()
    if not veli:
        return SendResult(success=False, errors=['Veli bulunamadı.'])
    if not ContactResolver.veli_allows_outbound(veli, category):
        return SendResult(success=False, errors=['Veli opt-out.'])

    storage_path = file_path
    if file_bytes and not storage_path:
        storage_path = default_storage.save(
            f'communication/attachments/{filename}',
            ContentFile(file_bytes),
        )

    if not storage_path:
        return SendResult(success=False, errors=['Dosya bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=_veli_recipient_query(veli, category=category),
        content=MessageContent(
            text=body,
            message_type=MessageType.DOCUMENT,
            attachment_path=storage_path,
            attachment_filename=filename,
            session_fallback=session_fallback,
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def _store_attachment_bytes(
    *,
    file_path: str | None,
    file_bytes: bytes | None,
    filename: str,
) -> str | None:
    if file_path:
        return file_path
    if file_bytes:
        return default_storage.save(
            f'communication/attachments/{filename}',
            ContentFile(file_bytes),
        )
    return None


def send_template_document_to_ogrenci(
    kurum_id: int,
    ogrenci_id: int,
    *,
    template_name: str,
    template_language: str = 'tr',
    template_context: dict | None = None,
    channel_config_id: str | None = None,
    preview_text: str = '',
    category: str,
    source_module: str,
    source_id: str | int,
    file_path: str | None = None,
    file_bytes: bytes | None = None,
    filename: str = 'document.pdf',
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    """Meta DOCUMENT-header template: metin + PDF aynı WhatsApp mesajında."""
    from apps.ogrenci.domain.models import Ogrenci

    ogrenci = Ogrenci.objects.filter(id=ogrenci_id, kurum_id=kurum_id).first()
    if not ogrenci or not ogrenci.telefon:
        return SendResult(success=False, errors=['Öğrenci telefonu bulunamadı.'])

    storage_path = _store_attachment_bytes(
        file_path=file_path, file_bytes=file_bytes, filename=filename,
    )
    if not storage_path:
        return SendResult(success=False, errors=['Dosya bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=RecipientQuery(
            phone=ogrenci.telefon,
            ogrenci_id=ogrenci_id,
            opt_in_category=category,
        ),
        content=MessageContent(
            text=preview_text or f'[{template_name}]',
            message_type=MessageType.TEMPLATE,
            attachment_path=storage_path,
            attachment_filename=filename,
            attachment_mime_type='application/pdf',
            template_name=template_name,
            template_language=template_language or 'tr',
            channel_config_id=channel_config_id,
            template_context=template_context or {},
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_template_document_to_veli(
    kurum_id: int,
    veli_id: int,
    *,
    template_name: str,
    template_language: str = 'tr',
    template_context: dict | None = None,
    channel_config_id: str | None = None,
    preview_text: str = '',
    category: str,
    source_module: str,
    source_id: str | int,
    file_path: str | None = None,
    file_bytes: bytes | None = None,
    filename: str = 'document.pdf',
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    """Meta DOCUMENT-header template: metin + PDF aynı WhatsApp mesajında."""
    from apps.ogrenci.domain.models import OgrenciVeli

    veli = OgrenciVeli.objects.filter(id=veli_id, ogrenci__kurum_id=kurum_id).first()
    if not veli:
        return SendResult(success=False, errors=['Veli bulunamadı.'])
    if not ContactResolver.veli_allows_outbound(veli, category):
        return SendResult(success=False, errors=['Veli opt-out.'])

    storage_path = _store_attachment_bytes(
        file_path=file_path, file_bytes=file_bytes, filename=filename,
    )
    if not storage_path:
        return SendResult(success=False, errors=['Dosya bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=_veli_recipient_query(veli, category=category),
        content=MessageContent(
            text=preview_text or f'[{template_name}]',
            message_type=MessageType.TEMPLATE,
            attachment_path=storage_path,
            attachment_filename=filename,
            attachment_mime_type='application/pdf',
            template_name=template_name,
            template_language=template_language or 'tr',
            channel_config_id=channel_config_id,
            template_context=template_context or {},
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def _personel_recipient_query(
    kurum_id: int,
    personel_id: int | None,
    *,
    phone: str | None,
    category: str,
) -> RecipientQuery | None:
    """Personel gönderiminde telefon; kayıt yoksa doğrudan verilen numara."""
    resolved_phone = (phone or '').strip()
    if not resolved_phone and personel_id:
        from apps.personel.domain.models import Personel

        personel = Personel.objects.filter(id=personel_id, kurum_id=kurum_id).first()
        if personel:
            resolved_phone = (personel.cep_telefon or '').strip() or (personel.telefon or '').strip()
    if not resolved_phone:
        return None
    return RecipientQuery(
        phone=resolved_phone,
        personel_id=personel_id,
        opt_in_category=category,
    )


def send_text_to_personel(
    kurum_id: int,
    personel_id: int | None,
    body: str,
    source_module: str,
    source_id: str | int,
    *,
    phone: str | None = None,
    category: str = 'genel',
    sent_by_user_id: int | None = None,
    session_fallback: dict | None = None,
) -> SendResult | None:
    recipients = _personel_recipient_query(
        kurum_id, personel_id, phone=phone, category=category,
    )
    if recipients is None:
        return SendResult(success=False, errors=['Personel telefonu bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=recipients,
        content=MessageContent(text=body, session_fallback=session_fallback),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_document_to_personel(
    kurum_id: int,
    personel_id: int | None,
    body: str,
    source_module: str,
    source_id: str | int,
    *,
    phone: str | None = None,
    category: str = 'genel',
    file_path: str | None = None,
    file_bytes: bytes | None = None,
    filename: str = 'document.pdf',
    sent_by_user_id: int | None = None,
    session_fallback: dict | None = None,
) -> SendResult | None:
    recipients = _personel_recipient_query(
        kurum_id, personel_id, phone=phone, category=category,
    )
    if recipients is None:
        return SendResult(success=False, errors=['Personel telefonu bulunamadı.'])

    storage_path = _store_attachment_bytes(
        file_path=file_path, file_bytes=file_bytes, filename=filename,
    )
    if not storage_path:
        return SendResult(success=False, errors=['Dosya bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=recipients,
        content=MessageContent(
            text=body,
            message_type=MessageType.DOCUMENT,
            attachment_path=storage_path,
            attachment_filename=filename,
            session_fallback=session_fallback,
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def _template_content(
    *,
    template_name: str,
    template_language: str,
    template_context: dict | None,
    channel_config_id: str | None,
    preview_text: str,
    storage_path: str | None = None,
    filename: str = '',
) -> MessageContent:
    content = MessageContent(
        text=preview_text or f'[{template_name}]',
        message_type=MessageType.TEMPLATE,
        template_name=template_name,
        template_language=template_language or 'tr',
        channel_config_id=channel_config_id,
        template_context=template_context or {},
    )
    if storage_path:
        content.attachment_path = storage_path
        content.attachment_filename = filename
        content.attachment_mime_type = 'application/pdf'
    return content


def send_template_text_to_veli(
    kurum_id: int,
    veli_id: int,
    *,
    template_name: str,
    template_language: str = 'tr',
    template_context: dict | None = None,
    channel_config_id: str | None = None,
    preview_text: str = '',
    category: str,
    source_module: str,
    source_id: str | int,
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    """Ek olmadan Meta şablonu — 24 saatlik pencere dışında da iletilir."""
    from apps.ogrenci.domain.models import OgrenciVeli

    veli = OgrenciVeli.objects.filter(id=veli_id, ogrenci__kurum_id=kurum_id).first()
    if not veli:
        return SendResult(success=False, errors=['Veli bulunamadı.'])
    if not ContactResolver.veli_allows_outbound(veli, category):
        return SendResult(success=False, errors=['Veli opt-out.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=_veli_recipient_query(veli, category=category),
        content=_template_content(
            template_name=template_name,
            template_language=template_language,
            template_context=template_context,
            channel_config_id=channel_config_id,
            preview_text=preview_text,
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_template_text_to_ogrenci(
    kurum_id: int,
    ogrenci_id: int,
    *,
    template_name: str,
    template_language: str = 'tr',
    template_context: dict | None = None,
    channel_config_id: str | None = None,
    preview_text: str = '',
    category: str,
    source_module: str,
    source_id: str | int,
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    from apps.ogrenci.domain.models import Ogrenci

    ogrenci = Ogrenci.objects.filter(id=ogrenci_id, kurum_id=kurum_id).first()
    if not ogrenci or not ogrenci.telefon:
        return SendResult(success=False, errors=['Öğrenci telefonu bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=RecipientQuery(
            phone=ogrenci.telefon,
            ogrenci_id=ogrenci_id,
            opt_in_category=category,
        ),
        content=_template_content(
            template_name=template_name,
            template_language=template_language,
            template_context=template_context,
            channel_config_id=channel_config_id,
            preview_text=preview_text,
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_template_text_to_personel(
    kurum_id: int,
    personel_id: int | None,
    *,
    template_name: str,
    template_language: str = 'tr',
    template_context: dict | None = None,
    channel_config_id: str | None = None,
    preview_text: str = '',
    category: str = 'genel',
    source_module: str,
    source_id: str | int,
    phone: str | None = None,
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    recipients = _personel_recipient_query(
        kurum_id, personel_id, phone=phone, category=category,
    )
    if recipients is None:
        return SendResult(success=False, errors=['Personel telefonu bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=recipients,
        content=_template_content(
            template_name=template_name,
            template_language=template_language,
            template_context=template_context,
            channel_config_id=channel_config_id,
            preview_text=preview_text,
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def send_template_document_to_personel(
    kurum_id: int,
    personel_id: int | None,
    *,
    template_name: str,
    template_language: str = 'tr',
    template_context: dict | None = None,
    channel_config_id: str | None = None,
    preview_text: str = '',
    category: str = 'genel',
    source_module: str,
    source_id: str | int,
    phone: str | None = None,
    file_path: str | None = None,
    file_bytes: bytes | None = None,
    filename: str = 'document.pdf',
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    recipients = _personel_recipient_query(
        kurum_id, personel_id, phone=phone, category=category,
    )
    if recipients is None:
        return SendResult(success=False, errors=['Personel telefonu bulunamadı.'])

    storage_path = _store_attachment_bytes(
        file_path=file_path, file_bytes=file_bytes, filename=filename,
    )
    if not storage_path:
        return SendResult(success=False, errors=['Dosya bulunamadı.'])

    return _safe_hook(
        _service.send,
        kurum_id,
        recipients=recipients,
        content=_template_content(
            template_name=template_name,
            template_language=template_language,
            template_context=template_context,
            channel_config_id=channel_config_id,
            preview_text=preview_text,
            storage_path=storage_path,
            filename=filename,
        ),
        source=MessageSource(module=source_module, ref_id=source_id),
        sender_user_id=sent_by_user_id,
        process_immediately=True,
    )


def recently_sent_within_hours(
    kurum_id: int,
    source_module: str,
    source_id: str | int,
    *,
    veli_id: int | None = None,
    hours: int = 24,
) -> bool:
    """Son N saat içinde aynı kaynak için gönderim var mı?"""
    since = timezone.now() - timedelta(hours=hours)
    qs = Message.objects.filter(
        source_module=source_module,
        source_ref_id=str(source_id),
        conversation__kurum_id=kurum_id,
        created_at__gte=since,
    )
    if veli_id:
        qs = qs.filter(conversation__veli_id=veli_id)
    return qs.exists()


def notify_payment_reminder(
    kurum_id: int,
    taksit_id: int,
    *,
    sent_by_user_id: int | None = None,
    with_pdf: bool = False,
    force_resend: bool = False,
    category: str = 'odeme',
) -> SendResult | None:
    from apps.finans.application.overdue_messaging import (
        CATEGORY_ODEME_GECIKME,
        build_overdue_context,
    )
    from apps.odeme_takip.domain.models import Taksit

    taksit = (
        Taksit.objects.select_related(
            'sozlesme__ogrenci', 'sozlesme__veli', 'sozlesme__kurum',
        )
        .filter(id=taksit_id, sozlesme__kurum_id=kurum_id)
        .first()
    )
    if not taksit:
        return SendResult(success=False, errors=['Taksit bulunamadı.'])

    sozlesme = taksit.sozlesme
    ogrenci = sozlesme.ogrenci
    veli = _resolve_veli_for_sozlesme(sozlesme, category=category)
    if not veli:
        return SendResult(success=False, errors=['Ödeme bildirimi için uygun veli yok.'])

    source_id = f'taksit-{taksit_id}'
    if not force_resend:
        if already_sent(kurum_id, SOURCE_ODEME, source_id, veli_id=veli.id):
            return SendResult(success=False, errors=['Hatırlatma zaten gönderildi.'])
        if recently_sent_within_hours(
            kurum_id, SOURCE_ODEME, source_id, veli_id=veli.id, hours=24,
        ):
            return SendResult(success=False, errors=['Son 24 saat içinde hatırlatma gönderildi.'])

    ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
    vade = taksit.vade_tarihi.strftime('%d.%m.%Y') if taksit.vade_tarihi else ''
    kalan = int(taksit.kalan_tutar or taksit.tutar)
    today = timezone.localdate()

    if taksit.vade_tarihi and taksit.vade_tarihi < today:
        durum_metni = 'vadesi geçmiş'
    else:
        durum_metni = 'yaklaşan'

    fallback_body = (
        f'Sayın {veli.tam_ad},\n\n'
        f'{ogrenci_ad} için {taksit.taksit_no}. taksit ödemeniz ({durum_metni}) '
        f'vade: {vade}, kalan tutar: {kalan:,} TL.\n\n'
        f'Sözleşme No: {sozlesme.sozlesme_no}\n'
        f'3K Kampüs'
    ).replace(',', '.')

    tpl_category = category or 'odeme'
    ctx = build_overdue_context(taksit, toplam_gecikmis=kalan)
    ctx['veli_ad'] = veli.tam_ad

    from apps.communication.application.template_service import TemplateService
    from apps.communication.application.variable_resolver import resolve_variables

    # Kategori bazlı eski LMS şablonu (varsa) merkezi eşlemeye yedek metin olur.
    tpl = TemplateService().list_templates(
        kurum_id,
        category=tpl_category,
        active_only=True,
    ).first()
    if tpl and tpl.body:
        legacy_body = resolve_variables(tpl.body, ctx)
    else:
        legacy_body = fallback_body

    event_key = (
        'odeme.gecikme' if tpl_category == CATEGORY_ODEME_GECIKME else 'odeme.hatirlatma'
    )
    attachment = NotificationAttachment()
    if with_pdf:
        from apps.communication.application.pdf_render_service import PdfRenderService

        attachment = NotificationAttachment(
            filename=f'odeme-hatirlatma-{taksit_id}.pdf',
            file_bytes=PdfRenderService.render_simple_text_pdf(
                'Ödeme Hatırlatması', legacy_body,
            ),
        )

    return dispatch_event(
        kurum_id,
        event_key,
        recipient=NotificationRecipient.veli(veli.id),
        context=ctx,
        attachment=attachment,
        source=MessageSource(module=SOURCE_ODEME, ref_id=source_id),
        sube_id=getattr(ogrenci, 'sube_id', None),
        sent_by_user_id=sent_by_user_id,
        fallback_body=legacy_body,
    )


def notify_gorusme_reminder(
    kurum_id: int,
    gorusme_id: int,
    *,
    sent_by_user_id: int | None = None,
    notify_student: bool = True,
) -> dict:
    from apps.coaching.models import GorusmeKaydi

    gorusme = (
        GorusmeKaydi.objects.select_related('ogrenci', 'koc__teacher')
        .filter(id=gorusme_id, kurum_id=kurum_id)
        .first()
    )
    if not gorusme:
        return {'veli': None, 'ogrenci': None}

    if gorusme.durum != 'planlandi':
        return {'veli': None, 'ogrenci': None}

    today = timezone.localdate()
    if gorusme.gorusme_tarihi <= today:
        return {'veli': None, 'ogrenci': None}

    source_id = str(gorusme_id)
    koc_ad = str(gorusme.koc.teacher) if gorusme.koc_id else 'Koçunuz'
    tarih = gorusme.gorusme_tarihi.strftime('%d.%m.%Y')
    saat = gorusme.gorusme_saati.strftime('%H:%M') if gorusme.gorusme_saati else ''
    ogrenci_ad = f'{gorusme.ogrenci.ad} {gorusme.ogrenci.soyad}'.strip()

    base_context = {
        'ogrenci_ad': ogrenci_ad,
        'koc_ad': koc_ad,
        'tarih': tarih,
        'saat': saat,
        'konu': gorusme.konu,
    }
    sube_id = getattr(gorusme.ogrenci, 'sube_id', None)

    results = {'veli': None, 'ogrenci': None}

    from apps.ogrenci.domain.models import OgrenciVeli

    veliler = OgrenciVeli.objects.filter(
        ogrenci_id=gorusme.ogrenci_id,
    ).exclude(telefon='')
    for veli in veliler:
        if not ContactResolver.veli_allows_outbound(veli, 'duyuru'):
            continue
        veli_source = f'{source_id}:veli:{veli.id}'
        if already_sent(kurum_id, SOURCE_GORUSME, veli_source, veli_id=veli.id):
            continue
        results['veli'] = dispatch_event(
            kurum_id,
            'gorusme.hatirlatma',
            recipient=NotificationRecipient.veli(veli.id),
            context={**base_context, 'veli_ad': veli.tam_ad},
            source=MessageSource(module=SOURCE_GORUSME, ref_id=veli_source),
            sube_id=sube_id,
            sent_by_user_id=sent_by_user_id,
        )
        break

    if notify_student and not already_sent(
        kurum_id, SOURCE_GORUSME, f'{source_id}:ogrenci', ogrenci_id=gorusme.ogrenci_id,
    ):
        results['ogrenci'] = dispatch_event(
            kurum_id,
            'gorusme.hatirlatma',
            recipient=NotificationRecipient.ogrenci(gorusme.ogrenci_id),
            context=base_context,
            source=MessageSource(module=SOURCE_GORUSME, ref_id=f'{source_id}:ogrenci'),
            sube_id=sube_id,
            sent_by_user_id=sent_by_user_id,
        )

    return results


def notify_assignment(
    kurum_id: int,
    assignment_id: int,
    *,
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    from apps.coaching.assignment_manual.models import ManualAssignment

    assignment = (
        ManualAssignment.objects.select_related('student')
        .filter(id=assignment_id, student__kurum_id=kurum_id)
        .first()
    )
    if not assignment:
        return SendResult(success=False, errors=['Ödev bulunamadı.'])
    if assignment.status == ManualAssignment.Status.DRAFT:
        return SendResult(success=False, errors=['Taslak ödev bildirilmez.'])

    source_id = str(assignment_id)
    ogrenci = assignment.student
    ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
    teslim = assignment.due_date.strftime('%d.%m.%Y %H:%M') if assignment.due_date else ''

    from apps.ogrenci.domain.models import OgrenciVeli

    veliler = OgrenciVeli.objects.filter(ogrenci_id=ogrenci.id).exclude(telefon='')
    for veli in veliler:
        if not ContactResolver.veli_allows_outbound(veli, 'duyuru'):
            continue
        veli_source = f'{source_id}:veli:{veli.id}'
        if already_sent(kurum_id, SOURCE_ODEV, veli_source, veli_id=veli.id):
            continue
        return dispatch_event(
            kurum_id,
            'odev.atama',
            recipient=NotificationRecipient.veli(veli.id),
            context={
                'ogrenci_ad': ogrenci_ad,
                'veli_ad': veli.tam_ad,
                'odev_baslik': assignment.title,
                'teslim_tarihi': teslim,
            },
            source=MessageSource(module=SOURCE_ODEV, ref_id=veli_source),
            sube_id=getattr(ogrenci, 'sube_id', None),
            sent_by_user_id=sent_by_user_id,
        )

    return SendResult(success=False, errors=['Bildirim gönderilecek veli bulunamadı.'])


def send_assignment_report_pdf(
    kurum_id: int,
    assignment_id: int,
    *,
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    """Ödev rapor PDF gönderimi — Faz 5'te tam PDF endpoint ile genişletilebilir."""
    from apps.coaching.assignment_manual.models import ManualAssignment
    from apps.communication.application.pdf_render_service import PdfRenderService

    assignment = (
        ManualAssignment.objects.select_related('student')
        .filter(id=assignment_id, student__kurum_id=kurum_id)
        .first()
    )
    if not assignment:
        return SendResult(success=False, errors=['Ödev bulunamadı.'])

    ogrenci = assignment.student
    body = (
        f'Ödev Raporu\n\n'
        f'Öğrenci: {ogrenci.ad} {ogrenci.soyad}\n'
        f'Ödev: {assignment.title}\n'
        f'Durum: {assignment.get_status_display()}\n'
        f'Tamamlanma: %{assignment.completion_percent or 0}\n'
    )
    pdf_bytes = PdfRenderService.render_simple_text_pdf('Ödev Raporu', body)

    from apps.ogrenci.domain.models import OgrenciVeli

    veliler = OgrenciVeli.objects.filter(ogrenci_id=ogrenci.id).exclude(telefon='')
    for veli in veliler:
        if not ContactResolver.veli_allows_outbound(veli, 'duyuru'):
            continue
        source_id = f'{assignment_id}:pdf:{veli.id}'
        return send_document_to_veli(
            kurum_id,
            veli.id,
            f'{ogrenci.ad} için ödev raporu ektedir.',
            'duyuru',
            SOURCE_ODEV,
            source_id,
            file_bytes=pdf_bytes,
            filename=f'odev-{assignment_id}.pdf',
            sent_by_user_id=sent_by_user_id,
        )
    return SendResult(success=False, errors=['Veli bulunamadı.'])


def notify_exam_result(
    kurum_id: int,
    exam_id: int,
    *,
    sent_by_user_id: int | None = None,
) -> dict:
    from apps.coaching.olcme_degerlendirme.models import Exam
    from apps.ogrenci.domain.models import OgrenciKayit, OgrenciVeli

    exam = Exam.objects.filter(id=exam_id, kurum_id=kurum_id).prefetch_related('siniflar').first()
    if not exam:
        return {'sent': 0, 'skipped': 0}

    source_id = f'{exam_id}:results'
    sinif_ids = list(exam.siniflar.values_list('id', flat=True))
    if not sinif_ids:
        return {'sent': 0, 'skipped': 0}

    kayit_qs = OgrenciKayit.objects.filter(
        kurum_id=kurum_id,
        sinif_id__in=sinif_ids,
        aktif_mi=True,
        ogrenci__aktif_mi=True,
    )
    if exam.egitim_yili_id:
        kayit_qs = kayit_qs.filter(egitim_yili_id=exam.egitim_yili_id)

    ogrenci_ids = list(kayit_qs.values_list('ogrenci_id', flat=True).distinct())
    if not ogrenci_ids:
        return {'sent': 0, 'skipped': 0}

    sent = 0
    skipped = 0
    veliler = (
        OgrenciVeli.objects
        .filter(
            ogrenci_id__in=ogrenci_ids,
            ogrenci__kurum_id=kurum_id,
        )
        .exclude(telefon='')
        .select_related('ogrenci')
    )

    seen_veli: set[int] = set()
    for veli in veliler:
        if veli.id in seen_veli:
            continue
        seen_veli.add(veli.id)
        if not ContactResolver.veli_allows_outbound(veli, 'duyuru'):
            skipped += 1
            continue
        veli_source = f'{source_id}:veli:{veli.id}'
        if already_sent(kurum_id, SOURCE_SINAV, veli_source, veli_id=veli.id):
            skipped += 1
            continue
        ogrenci = veli.ogrenci
        ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip() if ogrenci else ''
        result = dispatch_event(
            kurum_id,
            'sinav.sonuc',
            recipient=NotificationRecipient.veli(veli.id),
            context={
                'veli_ad': veli.tam_ad,
                'ogrenci_ad': ogrenci_ad,
                'sinav_ad': exam.name,
            },
            source=MessageSource(module=SOURCE_SINAV, ref_id=veli_source),
            sent_by_user_id=sent_by_user_id,
        )
        if result and result.success:
            sent += 1
        else:
            skipped += 1

    return {'sent': sent, 'skipped': skipped}


def notify_absence(
    kurum_id: int,
    ogrenci_id: int,
    absence_date: date | datetime,
    *,
    aciklama: str = '',
    sent_by_user_id: int | None = None,
) -> SendResult | None:
    from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

    ogrenci = Ogrenci.objects.filter(id=ogrenci_id, kurum_id=kurum_id).first()
    if not ogrenci:
        return SendResult(success=False, errors=['Öğrenci bulunamadı.'])

    if isinstance(absence_date, datetime):
        tarih = absence_date.date().strftime('%d.%m.%Y')
    else:
        tarih = absence_date.strftime('%d.%m.%Y')

    ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
    source_id = f'{ogrenci_id}:{tarih}'

    veliler = OgrenciVeli.objects.filter(ogrenci_id=ogrenci_id).exclude(telefon='')
    for veli in veliler:
        if not ContactResolver.veli_allows_outbound(veli, 'devamsizlik'):
            continue
        veli_source = f'{source_id}:veli:{veli.id}'
        if already_sent(kurum_id, SOURCE_DEVAMSIZLIK, veli_source, veli_id=veli.id):
            continue
        return dispatch_event(
            kurum_id,
            'devamsizlik.bildirim',
            recipient=NotificationRecipient.veli(veli.id),
            context={
                'ogrenci_ad': ogrenci_ad,
                'veli_ad': veli.tam_ad,
                'tarih': tarih,
                'aciklama': aciklama,
            },
            source=MessageSource(module=SOURCE_DEVAMSIZLIK, ref_id=veli_source),
            sube_id=getattr(ogrenci, 'sube_id', None),
            sent_by_user_id=sent_by_user_id,
        )

    return SendResult(success=False, errors=['Devamsızlık bildirimi için uygun veli yok.'])


def notify_announcement(
    kurum_id: int,
    body: str,
    *,
    title: str = '',
    sent_by_user_id: int | None = None,
    audience_filter: dict | None = None,
    template_name: str = '',
    template_language: str = 'tr',
) -> SendResult | None:
    from apps.communication.application.campaign_service import CampaignService

    filter_json = audience_filter or {'audience_type': 'all_veliler'}

    def _run():
        service = CampaignService()
        campaign = service.create_draft(
            kurum_id,
            created_by_id=sent_by_user_id,
            title=title or 'Duyuru',
            body=body,
            template_name=template_name,
            template_language=template_language,
            audience_filter=filter_json,
        )
        service.confirm(campaign, sender_user_id=sent_by_user_id)
        return SendResult(success=True, message_id=str(campaign.id))

    return _safe_hook(_run)


def _resolve_veli_for_sozlesme(sozlesme, category: str = 'odeme'):
    from apps.ogrenci.domain.models import OgrenciVeli

    if sozlesme.veli_id and sozlesme.veli.telefon:
        if ContactResolver.veli_allows_outbound(sozlesme.veli, category):
            return sozlesme.veli

    for veli in OgrenciVeli.objects.filter(ogrenci_id=sozlesme.ogrenci_id).exclude(telefon=''):
        if ContactResolver.veli_allows_outbound(veli, category):
            return veli
    return None
