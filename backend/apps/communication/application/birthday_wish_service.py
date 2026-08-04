"""
Doğum günü WhatsApp kutlaması.

Gece 00:01 cron'u aktif öğrencileri tarar; görsel havuzundan deterministik seçim
yapar ve `ogrenci.dogum_gunu` bildirimiyle tek tek kuyruğa yazar.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import date

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.communication.application.communication_service import MessageSource, SendResult
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.domain.models import BirthdayMediaAsset, BirthdayWishLog

logger = logging.getLogger(__name__)

EVENT_KEY = 'ogrenci.dogum_gunu'


@dataclass
class BirthdayWishRunResult:
    date: str
    scanned: int = 0
    sent: int = 0
    skipped: int = 0
    failed: int = 0
    details: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            'date': self.date,
            'scanned': self.scanned,
            'sent': self.sent,
            'skipped': self.skipped,
            'failed': self.failed,
            'details': self.details,
        }


def select_birthday_media(
    assets: list[BirthdayMediaAsset],
    *,
    ogrenci_id: int,
    year: int,
) -> BirthdayMediaAsset | None:
    """Öğrenci+yıl hash'i ile havuzdan sabit seçim (aynı gün yeniden koşunca aynı görsel)."""
    if not assets:
        return None
    digest = hashlib.sha256(f'{ogrenci_id}:{year}'.encode()).hexdigest()
    idx = int(digest[:8], 16) % len(assets)
    return assets[idx]


def _active_media(kurum_id: int, sube_id: int | None) -> list[BirthdayMediaAsset]:
    qs = BirthdayMediaAsset.objects.filter(kurum_id=kurum_id, is_active=True)
    if sube_id:
        qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
    else:
        qs = qs.filter(sube_id__isnull=True)
    return list(qs.order_by('sort_order', 'created_at'))


def _birthday_students(kurum_id: int, today: date, *, sube_id: int | None = None):
    from apps.ogrenci.domain.models import OgrenciKayit

    qs = OgrenciKayit.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True,
        ogrenci__aktif_mi=True,
        ogrenci__dogum_tarihi__isnull=False,
        ogrenci__dogum_tarihi__month=today.month,
        ogrenci__dogum_tarihi__day=today.day,
    ).select_related('ogrenci', 'sinif', 'sube')
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    return qs


def _context_for(kayit, today: date) -> dict:
    ogrenci = kayit.ogrenci
    dogum = ogrenci.dogum_tarihi
    yas = today.year - dogum.year if dogum else ''
    sinif = ''
    if kayit.sinif_id and getattr(kayit.sinif, 'ad', None):
        sinif = kayit.sinif.ad
    return {
        'ogrenci_ad': f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
        'yas': str(yas),
        'kurum_ad': getattr(getattr(kayit, 'kurum', None), 'ad', '') or '',
        'sube': getattr(getattr(kayit, 'sube', None), 'ad', '') or '',
        'sinif': sinif,
    }


def send_birthday_wishes_for_kurum(
    kurum_id: int,
    *,
    sube_id: int | None = None,
    on_date: date | None = None,
    dry_run: bool = False,
) -> BirthdayWishRunResult:
    today = on_date or timezone.localdate()
    result = BirthdayWishRunResult(date=today.isoformat())
    media_cache: dict[int | None, list[BirthdayMediaAsset]] = {}

    for kayit in _birthday_students(kurum_id, today, sube_id=sube_id).iterator():
        result.scanned += 1
        ogrenci = kayit.ogrenci
        scope_sube = kayit.sube_id
        if scope_sube not in media_cache:
            media_cache[scope_sube] = _active_media(kurum_id, scope_sube)
        assets = media_cache[scope_sube]
        asset = select_birthday_media(assets, ogrenci_id=ogrenci.id, year=today.year)

        detail = {
            'ogrenci_id': ogrenci.id,
            'ad': f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
            'sube_id': scope_sube,
        }

        if BirthdayWishLog.objects.filter(
            kurum_id=kurum_id, ogrenci_id=ogrenci.id, year=today.year,
        ).exists():
            result.skipped += 1
            detail['status'] = 'already_sent'
            result.details.append(detail)
            continue

        if not (ogrenci.telefon or '').strip():
            result.skipped += 1
            detail['status'] = 'no_phone'
            result.details.append(detail)
            continue

        if asset is None:
            result.skipped += 1
            detail['status'] = 'no_media'
            result.details.append(detail)
            continue

        context = _context_for(kayit, today)
        # kurum_ad kayit üzerinden gelmeyebilir
        if not context.get('kurum_ad'):
            from apps.kurum.domain.models import Kurum
            kurum = Kurum.objects.filter(id=kurum_id).first()
            context['kurum_ad'] = kurum.ad if kurum else ''

        attachment = NotificationAttachment(
            filename=asset.original_name or f'birthday-{asset.id}.jpg',
            file_path=asset.file.name if asset.file else None,
            mime_type=asset.mime_type or '',
        )
        if attachment.is_empty:
            result.failed += 1
            detail['status'] = 'media_missing_file'
            result.details.append(detail)
            continue

        if dry_run:
            preview = dispatch_event(
                kurum_id,
                EVENT_KEY,
                recipient=NotificationRecipient.ogrenci(ogrenci.id),
                context=context,
                attachment=attachment,
                source=MessageSource(module='ogrenci', ref_id=f'bday-{ogrenci.id}-{today.year}'),
                sube_id=scope_sube,
                dry_run=True,
            )
            result.sent += 1
            detail['status'] = 'dry_run'
            detail['preview'] = preview.as_dict() if hasattr(preview, 'as_dict') else str(preview)
            detail['media_id'] = str(asset.id)
            result.details.append(detail)
            continue

        try:
            with transaction.atomic():
                log = BirthdayWishLog.objects.create(
                    kurum_id=kurum_id,
                    ogrenci_id=ogrenci.id,
                    year=today.year,
                    media_asset=asset,
                    status='sending',
                )
        except IntegrityError:
            result.skipped += 1
            detail['status'] = 'already_sent'
            result.details.append(detail)
            continue

        send_result = dispatch_event(
            kurum_id,
            EVENT_KEY,
            recipient=NotificationRecipient.ogrenci(ogrenci.id),
            context=context,
            attachment=attachment,
            source=MessageSource(module='ogrenci', ref_id=f'bday-{ogrenci.id}-{today.year}'),
            sube_id=scope_sube,
        )
        if isinstance(send_result, SendResult) and send_result.success:
            result.sent += 1
            log.status = 'sent'
            log.message_id = send_result.message_id or None
            log.detail = ''
            log.save(update_fields=['status', 'message_id', 'detail'])
            detail['status'] = 'sent'
            detail['message_id'] = send_result.message_id
        else:
            result.failed += 1
            errors = getattr(send_result, 'errors', None) or ['Gönderim başarısız']
            # Başarısızsa logu sil — aynı gün cron/manuel tekrar deneyebilsin
            log.delete()
            detail['status'] = 'failed'
            detail['errors'] = list(errors)
        detail['media_id'] = str(asset.id)
        result.details.append(detail)

    return result


def send_birthday_wishes_all(
    *,
    kurum_id: int | None = None,
    sube_id: int | None = None,
    on_date: date | None = None,
    dry_run: bool = False,
) -> list[dict]:
    from apps.kurum.domain.models import Kurum

    if kurum_id:
        kurumlar = Kurum.objects.filter(id=kurum_id)
    else:
        kurumlar = Kurum.objects.all().order_by('id')

    out = []
    for kurum in kurumlar.iterator():
        run = send_birthday_wishes_for_kurum(
            kurum.id,
            sube_id=sube_id,
            on_date=on_date,
            dry_run=dry_run,
        )
        payload = run.as_dict()
        payload['kurum_id'] = kurum.id
        payload['kurum_ad'] = kurum.ad
        out.append(payload)
        logger.info(
            'Doğum günü: kurum=%s scanned=%s sent=%s skipped=%s failed=%s',
            kurum.id, run.scanned, run.sent, run.skipped, run.failed,
        )
    return out
