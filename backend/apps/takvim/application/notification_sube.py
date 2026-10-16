"""Bildirim satırına şube adı yazar veya okurken sohbetten çözer."""
from __future__ import annotations

import re

_CONV_RE = re.compile(
    r'conversation=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
    r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
)


def sube_fields(sube_id) -> dict:
    """create() gövdesine eklenecek sube_id + sube_ad."""
    if not sube_id:
        return {}
    from apps.sube.domain.models import Sube

    ad = Sube.objects.filter(pk=sube_id).values_list('ad', flat=True).first() or ''
    payload = {'sube_id': int(sube_id)}
    if ad:
        payload['sube_ad'] = ad[:120]
    return payload


def conversation_sube_id(conversation) -> int | None:
    if getattr(conversation, 'sube_id', None):
        return int(conversation.sube_id)
    from apps.communication.infrastructure.repository import ConversationRepository

    return ConversationRepository._resolve_sube_id(
        ogrenci_id=getattr(conversation, 'ogrenci_id', None),
        veli_id=getattr(conversation, 'veli_id', None),
    )


def annotate_notification_subes(notifications) -> None:
    """Kayıtta şube adı yoksa sohbet adresinden veya etkinlikten doldurur.

    Eski satırlar sube_ad taşımıyor; liste her seferinde yeniden hesaplanır,
    veritabanına yazılmaz.
    """
    pending = [
        n for n in notifications
        if not (getattr(n, 'sube_ad', None) or '').strip()
    ]
    if not pending:
        return

    conv_for: dict = {}
    conv_ids: list[str] = []
    for n in pending:
        match = _CONV_RE.search(getattr(n, 'url', '') or '')
        if not match:
            continue
        cid = match.group(1)
        conv_for[n.pk] = cid
        conv_ids.append(cid)

    sube_by_conv: dict[str, tuple[int, str]] = {}
    if conv_ids:
        from apps.communication.domain.models import Conversation

        rows = Conversation.objects.filter(id__in=conv_ids).select_related(
            'sube', 'ogrenci__sube', 'veli__ogrenci__sube',
        )
        for conv in rows:
            sube = conv.sube
            if sube is None and getattr(conv, 'ogrenci', None) is not None:
                sube = getattr(conv.ogrenci, 'sube', None)
            veli = getattr(conv, 'veli', None)
            if sube is None and veli is not None:
                ogr = getattr(veli, 'ogrenci', None)
                sube = getattr(ogr, 'sube', None) if ogr is not None else None
            if sube is not None:
                sube_by_conv[str(conv.id)] = (sube.id, sube.ad)

    name_ids: set[int] = set()
    event_sube: dict = {}
    for n in pending:
        cid = conv_for.get(n.pk)
        if cid and cid in sube_by_conv:
            sid, ad = sube_by_conv[cid]
            n.sube_id = sid
            n.sube_ad = ad
            continue
        event = getattr(n, 'event', None)
        sid = getattr(event, 'sube_id', None) if event is not None else None
        if not sid and getattr(n, 'sube_id', None):
            sid = n.sube_id
        if sid:
            event_sube[n.pk] = int(sid)
            name_ids.add(int(sid))

    if not name_ids:
        return
    from apps.sube.domain.models import Sube

    names = dict(Sube.objects.filter(id__in=name_ids).values_list('id', 'ad'))
    for n in pending:
        if (getattr(n, 'sube_ad', None) or '').strip():
            continue
        sid = event_sube.get(n.pk)
        ad = names.get(sid) if sid else ''
        if ad:
            n.sube_id = sid
            n.sube_ad = ad
