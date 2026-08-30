"""
Özel ders yoklama / telafi veli WhatsApp bildirimleri.

Non-blocking: hata parent transaction'ı bozmaz.
Idempotency: BirebirOturumBildirimLog + Message source_ref.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.notification_dispatcher import (
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.variable_resolver import resolve_variables
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirOturumBildirimLog,
    OturumDurumu,
    SebepKodu,
    TelafiDurumu,
)

logger = logging.getLogger(__name__)

SOURCE_MODULE = 'ozel_ders'
OPT_IN_CATEGORY = 'devamsizlik'

EVENT_OGRETMEN_GELMEDI = 'ozel_ders.ogretmen_gelmedi'
EVENT_OGRENCI_GELMEDI = 'ozel_ders.ogrenci_gelmedi'
EVENT_OGRENCI_GELMEDI_TELAFI = 'ozel_ders.ogrenci_gelmedi_telafi'
EVENT_IPTAL = 'ozel_ders.iptal'
EVENT_TELAFI_PLANLANDI = 'ozel_ders.telafi_planlandi'
EVENT_ISLENDI = 'ozel_ders.islendi'

# source_ref_id max 64 — kısa kodlar
_EVENT_REF = {
    EVENT_OGRETMEN_GELMEDI: 'og',
    EVENT_OGRENCI_GELMEDI: 'ogr',
    EVENT_OGRENCI_GELMEDI_TELAFI: 'ogt',
    EVENT_IPTAL: 'ip',
    EVENT_TELAFI_PLANLANDI: 'tp',
    EVENT_ISLENDI: 'is',
}

_DAY_TR = {
    0: 'Pazartesi',
    1: 'Salı',
    2: 'Çarşamba',
    3: 'Perşembe',
    4: 'Cuma',
    5: 'Cumartesi',
    6: 'Pazar',
}

_MONTH_TR = {
    1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan', 5: 'Mayıs', 6: 'Haziran',
    7: 'Temmuz', 8: 'Ağustos', 9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
}

_DURUM_LABEL = {
    OturumDurumu.ISLENDI: 'İşlendi',
    OturumDurumu.ONLINE: 'Online',
    OturumDurumu.OGRETMEN_GELMEDI: 'Öğretmen Gelmedi',
    OturumDurumu.OGRENCI_GELMEDI: 'Öğrenci Gelmedi',
    OturumDurumu.IPTAL: 'İptal',
    OturumDurumu.PLANLANDI: 'Planlandı',
}


def _person_ad(obj) -> str:
    if obj is None:
        return ''
    ad = getattr(obj, 'tam_ad', None)
    if ad:
        return str(ad)
    return f'{getattr(obj, "ad", "")} {getattr(obj, "soyad", "")}'.strip()


def _format_date_tr(d) -> str:
    if not d:
        return ''
    return f'{d.day} {_MONTH_TR.get(d.month, "")} {d.year} {_DAY_TR.get(d.weekday(), "")}'.strip()


def _format_time_tr(t) -> str:
    if not t:
        return ''
    return t.strftime('%H.%M')


def _sebep_text(oturum: BirebirDersOturumu) -> str:
    kod = (oturum.sebep_kodu or '').strip()
    label = dict(SebepKodu.choices).get(kod, '') if kod else ''
    aciklama = (oturum.sebep_aciklama or '').strip()
    if kod == SebepKodu.DIGER and aciklama:
        return aciklama
    if label and aciklama:
        return f'{label} — {aciklama}'
    return aciklama or label or ''


def _source_ref(oturum_id: int, event_key: str, veli_id: int) -> str:
    code = _EVENT_REF.get(event_key, 'x')
    return f'o:{oturum_id}:{code}:{veli_id}'[:64]


def _build_context(
    oturum: BirebirDersOturumu,
    *,
    veli=None,
    ek_bilgi: str = '',
    ders_durumu: str = '',
) -> dict[str, str]:
    ogrenci = oturum.ogrenci
    return {
        'veli_ad': _person_ad(veli) or 'Velimiz',
        'ogrenci_ad': _person_ad(ogrenci),
        'ders_tarihi': _format_date_tr(oturum.session_date),
        'ders_saati': _format_time_tr(oturum.start_time),
        'ders_adi': getattr(oturum.ders, 'ad', None) or str(oturum.ders_id),
        'ogretmen_ad': _person_ad(oturum.ogretmen),
        'ders_durumu': ders_durumu or _DURUM_LABEL.get(oturum.durum, oturum.durum),
        'sebep': _sebep_text(oturum),
        'ek_bilgi': ek_bilgi,
        'kurum_ad': getattr(getattr(oturum, 'kurum', None), 'ad', '') or '',
        'sube': getattr(getattr(oturum, 'sube', None), 'ad', '') or '',
    }


def _fallback_body(event_key: str, ctx: dict[str, str]) -> str:
    """Katalogdaki varsayılan metni doldurur (İletişim şablonlarıyla aynı kaynak)."""
    from apps.communication.application.notification_events import get_event
    event = get_event(event_key)
    template = event.default_body('VELI') if event else ''
    if not template:
        return ''
    body = resolve_variables(template, ctx)
    if not (ctx.get('ek_bilgi') or '').strip():
        body = re.sub(r'\nEk bilgi:\s*', '\n', body)
    return re.sub(r'\n{3,}', '\n\n', body).strip()


def _already_logged(oturum_id: int, event_key: str, veli_id: int) -> bool:
    return BirebirOturumBildirimLog.objects.filter(
        oturum_id=oturum_id,
        event_key=event_key,
        veli_id=veli_id,
    ).exists()


def _send_to_veliler(
    oturum: BirebirDersOturumu,
    event_key: str,
    *,
    sent_by_user_id: Optional[int] = None,
    ek_bilgi: str = '',
    extra_ctx: Optional[dict] = None,
) -> int:
    from apps.ogrenci.application.veli_contact import list_outbound_veliler

    sent = 0
    try:
        pairs = list_outbound_veliler(oturum.ogrenci)
    except Exception:
        logger.exception('list_outbound_veliler failed for oturum %s', oturum.id)
        return 0

    for veli, _phone in pairs:
        if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
            continue
        if _already_logged(oturum.id, event_key, veli.id):
            continue

        ctx = _build_context(oturum, veli=veli, ek_bilgi=ek_bilgi)
        if extra_ctx:
            ctx.update(extra_ctx)
        body = _fallback_body(event_key, ctx)
        source_ref = _source_ref(oturum.id, event_key, veli.id)

        try:
            result = dispatch_event(
                oturum.kurum_id,
                event_key,
                recipient=NotificationRecipient.veli(veli.id),
                context=ctx,
                source=MessageSource(module=SOURCE_MODULE, ref_id=source_ref),
                sube_id=oturum.sube_id,
                sent_by_user_id=sent_by_user_id,
                fallback_body=body,
            )
            message = None
            mid = getattr(result, 'message_id', None) if result else None
            if mid:
                from apps.communication.domain.models import Message
                message = Message.objects.filter(pk=mid).first()

            # Log even on soft failure so we don't spam; status visible in history
            BirebirOturumBildirimLog.objects.get_or_create(
                oturum_id=oturum.id,
                event_key=event_key,
                veli_id=veli.id,
                defaults={'message': message},
            )
            if result and getattr(result, 'success', False):
                sent += 1
        except Exception:
            logger.exception(
                'ozel_ders notify failed oturum=%s event=%s veli=%s',
                oturum.id, event_key, veli.id,
            )
            try:
                BirebirOturumBildirimLog.objects.get_or_create(
                    oturum_id=oturum.id,
                    event_key=event_key,
                    veli_id=veli.id,
                )
            except Exception:
                pass
    return sent


def notify_yoklama(
    oturum: BirebirDersOturumu,
    *,
    send_whatsapp: bool,
    sent_by_user_id: Optional[int] = None,
) -> None:
    """Yoklama durumuna göre veli bildirimi (opt-in kuralları set_durum tarafında)."""
    if not send_whatsapp:
        return

    event_key = None
    telafi_bekleniyor = oturum.telafi_durumu == TelafiDurumu.BEKLENIYOR
    if oturum.durum == OturumDurumu.OGRETMEN_GELMEDI:
        event_key = EVENT_OGRETMEN_GELMEDI
    elif oturum.durum == OturumDurumu.OGRENCI_GELMEDI:
        event_key = (
            EVENT_OGRENCI_GELMEDI_TELAFI if telafi_bekleniyor else EVENT_OGRENCI_GELMEDI
        )
    elif oturum.durum == OturumDurumu.IPTAL:
        event_key = EVENT_IPTAL
    elif oturum.durum in (OturumDurumu.ISLENDI, OturumDurumu.ONLINE):
        event_key = EVENT_ISLENDI
    if not event_key:
        return

    def _run():
        _send_to_veliler(
            oturum,
            event_key,
            sent_by_user_id=sent_by_user_id,
            ek_bilgi=(oturum.notes or '').strip(),
        )

    try:
        transaction.on_commit(_run)
    except Exception:
        logger.exception('notify_yoklama schedule failed')


def notify_telafi_planlandi(
    kaynak: BirebirDersOturumu,
    telafi: BirebirDersOturumu,
    *,
    sent_by_user_id: Optional[int] = None,
) -> None:
    """Telafi planlandığında — mesajda mutlaka orijinal ders tarihi/saati."""
    extra = {
        'telafi_tarihi': _format_date_tr(telafi.session_date),
        'telafi_saati': _format_time_tr(telafi.start_time),
        'ders_tarihi': _format_date_tr(kaynak.session_date),
        'ders_saati': _format_time_tr(kaynak.start_time),
    }

    def _run():
        _send_to_veliler(
            kaynak,
            EVENT_TELAFI_PLANLANDI,
            sent_by_user_id=sent_by_user_id,
            ek_bilgi=(telafi.notes or kaynak.notes or '').strip(),
            extra_ctx=extra,
        )

    try:
        transaction.on_commit(_run)
    except Exception:
        logger.exception('notify_telafi_planlandi schedule failed')


def serialize_bildirimler(oturum: BirebirDersOturumu) -> list[dict]:
    from apps.communication.application.notification_events import get_event

    rows = (
        BirebirOturumBildirimLog.objects
        .filter(oturum_id=oturum.id)
        .select_related('message')
        .order_by('-created_at')
    )
    out = []
    for log in rows:
        event = get_event(log.event_key)
        msg = log.message
        status = getattr(msg, 'status', None) or 'PENDING'
        from apps.communication.application.delivery_error import explain_delivery_failure

        failed = explain_delivery_failure(getattr(msg, 'failed_reason', '') or '')
        out.append({
            'id': log.id,
            'event_key': log.event_key,
            'event_label': event.label if event else log.event_key,
            'veli_id': log.veli_id,
            'gonderim_tarihi': timezone.localtime(log.created_at).isoformat() if log.created_at else None,
            'status': status,
            'status_display': (
                dict(getattr(msg, '_meta').get_field('status').choices).get(status, status)
                if msg else status
            ),
            'provider_message_id': getattr(msg, 'provider_message_id', '') or '',
            'failed_reason': failed,
            'gonderildi': status in ('SENT', 'DELIVERED', 'READ', 'PENDING', 'SENDING'),
        })
    return out
