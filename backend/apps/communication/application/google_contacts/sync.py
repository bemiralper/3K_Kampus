"""Öğrenci/veli kayıtlarını Google Kişiler ile eşitleme."""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from time import monotonic

from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections, transaction
from django.db.models import Prefetch, Q
from django.utils import timezone

from apps.communication.application.google_contacts.client import (
    GoogleContactNotFound,
    GoogleContactsError,
    GooglePeopleClient,
)
from apps.communication.application.google_contacts.naming import (
    contact_photo_bytes,
    enrollment_context,
    legacy_parent_desired,
    parent_desired,
    staff_desired,
    student_desired,
)
from apps.communication.domain.models import (
    GoogleContactMapping,
    GoogleContactRemoval,
    GoogleContactSubject,
    GoogleContactSyncStatus,
    GoogleContactsAccount,
    GoogleContactsAccountType,
)

logger = logging.getLogger(__name__)

AUTO_SYNC_LIMIT = 20


@dataclass
class ContactPlan:
    subject_type: str
    ogrenci_id: int | None
    veli_id: int | None
    desired: object | None
    personel_id: int | None = None


def accounts_for_ogrenci(ogrenci) -> list[GoogleContactsAccount]:
    accounts = GoogleContactsAccount.objects.filter(
        kurum_id=ogrenci.kurum_id,
        is_active=True,
    ).exclude(refresh_token_encrypted='')
    matched = []
    for account in accounts:
        if account.account_type == GoogleContactsAccountType.COACH:
            continue
        if account.account_type == GoogleContactsAccountType.BRANCH:
            if account.sube_id and account.sube_id != ogrenci.sube_id:
                continue
        matched.append(account)
    return matched


def _sube_ad(ogrenci) -> str:
    sube = getattr(ogrenci, 'sube', None)
    return (getattr(sube, 'ad', '') or '') if sube is not None else ''


def plans_for_student(ogrenci) -> list[ContactPlan]:
    sinif_ad, kayit_yili = enrollment_context(ogrenci)
    sube_ad = _sube_ad(ogrenci)
    ogrenci_id = ogrenci.id
    if not ogrenci.aktif_mi:
        plans = [ContactPlan(GoogleContactSubject.OGRENCI, ogrenci_id, None, None)]
        for veli in ogrenci.veliler.all():
            plans.append(ContactPlan(GoogleContactSubject.VELI, ogrenci_id, veli.id, None))
        plans.append(ContactPlan(GoogleContactSubject.VELI_LEGACY, ogrenci_id, None, None))
        return plans

    plans = [ContactPlan(
        GoogleContactSubject.OGRENCI,
        ogrenci_id,
        None,
        student_desired(ogrenci, sinif_ad=sinif_ad, sube_ad=sube_ad, kayit_yili=kayit_yili),
    )]
    veliler = list(ogrenci.veliler.all())
    if veliler:
        plans.append(ContactPlan(GoogleContactSubject.VELI_LEGACY, ogrenci_id, None, None))
        for veli in veliler:
            plans.append(ContactPlan(
                GoogleContactSubject.VELI,
                ogrenci_id,
                veli.id,
                parent_desired(veli, ogrenci, sinif_ad=sinif_ad, kayit_yili=kayit_yili),
            ))
    else:
        plans.append(ContactPlan(
            GoogleContactSubject.VELI_LEGACY,
            ogrenci_id,
            None,
            legacy_parent_desired(ogrenci, sinif_ad=sinif_ad, kayit_yili=kayit_yili),
        ))
    return plans


def _plan_key(subject_type: str, ogrenci_id, veli_id, personel_id=None) -> tuple:
    return (subject_type, ogrenci_id or 0, veli_id or 0, personel_id or 0)


def _apply_plan(account: GoogleContactsAccount, plan: ContactPlan, existing: dict | None = None) -> str:
    """Mevcut eşlemeyi günceller. 'pending', 'delete' veya 'unchanged' döner."""
    key = _plan_key(plan.subject_type, plan.ogrenci_id, plan.veli_id, plan.personel_id)
    mapping = None
    if existing is not None:
        mapping = existing.get(key)
    else:
        lookup = {'account': account, 'subject_type': plan.subject_type}
        if plan.subject_type == GoogleContactSubject.VELI:
            lookup['veli_id'] = plan.veli_id
        elif plan.subject_type == GoogleContactSubject.PERSONEL:
            lookup['personel_id'] = plan.personel_id
        else:
            lookup['ogrenci_id'] = plan.ogrenci_id
        mapping = GoogleContactMapping.objects.filter(**lookup).first()

    desired = plan.desired
    if desired is None:
        if mapping is None:
            return 'unchanged'
        if not mapping.resource_name:
            mapping.delete()
            if existing is not None:
                existing.pop(key, None)
            return 'delete'
        if mapping.status != GoogleContactSyncStatus.PENDING_DELETE:
            mapping.status = GoogleContactSyncStatus.PENDING_DELETE
            mapping.save(update_fields=['status', 'updated_at'])
            return 'delete'
        return 'unchanged'

    content_hash = desired.content_hash
    if (
        mapping is not None
        and mapping.status == GoogleContactSyncStatus.SYNCED
        and mapping.resource_name
        and mapping.content_hash == content_hash
    ):
        return 'unchanged'

    if mapping is None:
        mapping = GoogleContactMapping(
            account=account,
            kurum_id=account.kurum_id,
            subject_type=plan.subject_type,
            ogrenci_id=plan.ogrenci_id,
            veli_id=plan.veli_id,
            personel_id=plan.personel_id,
        )
        if existing is not None:
            existing[key] = mapping
    mapping.ogrenci_id = plan.ogrenci_id
    mapping.veli_id = plan.veli_id
    mapping.personel_id = plan.personel_id
    mapping.display_name = desired.display_name[:300]
    mapping.phone_e164 = desired.phone_e164[:20]
    mapping.status = GoogleContactSyncStatus.PENDING
    mapping.last_error = ''
    mapping.save()
    return 'pending'


def enqueue_ogrenci(ogrenci) -> int:
    accounts = accounts_for_ogrenci(ogrenci)
    if not accounts:
        return 0
    changed = 0
    for account in accounts:
        for plan in plans_for_student(ogrenci):
            result = _apply_plan(account, plan)
            if result != 'unchanged':
                changed += 1
    if changed:
        schedule_auto_sync(ogrenci.kurum_id)
    return changed


def enqueue_veli(veli) -> int:
    ogrenci = getattr(veli, 'ogrenci', None)
    if ogrenci is None:
        return 0
    return enqueue_ogrenci(ogrenci)


def accounts_for_personel(personel) -> list[GoogleContactsAccount]:
    sube_ids = {personel.sube_id} if personel.sube_id else set()
    sube_ids.update(
        personel.gorevlendirmeler.filter(aktif_mi=True).values_list('gorev_sube_id', flat=True)
    )
    accounts = GoogleContactsAccount.objects.filter(
        kurum_id=personel.kurum_id,
        is_active=True,
    ).exclude(refresh_token_encrypted='')
    matched = []
    for account in accounts:
        if account.account_type == GoogleContactsAccountType.COACH:
            continue
        if account.account_type == GoogleContactsAccountType.BRANCH:
            if account.sube_id and account.sube_id not in sube_ids:
                continue
        matched.append(account)
    return matched


def plans_for_staff(personel) -> list[ContactPlan]:
    desired = staff_desired(personel) if personel.aktif_mi else None
    return [ContactPlan(
        GoogleContactSubject.PERSONEL,
        None,
        None,
        desired,
        personel_id=personel.id,
    )]


def enqueue_personel(personel) -> int:
    accounts = accounts_for_personel(personel)
    if not accounts:
        return 0
    changed = 0
    for account in accounts:
        for plan in plans_for_staff(personel):
            if _apply_plan(account, plan) != 'unchanged':
                changed += 1
    if changed:
        schedule_auto_sync(personel.kurum_id)
    return changed


def queue_deletes_for_personel(personel) -> None:
    mappings = GoogleContactMapping.objects.filter(personel_id=personel.id).exclude(resource_name='')
    pairs = [(row.account_id, row.resource_name) for row in mappings]
    queue_remote_deletes(account_ids_and_resources=pairs)
    if pairs:
        schedule_auto_sync(personel.kurum_id)


def _staff_queryset(account: GoogleContactsAccount):
    from apps.personel.domain.models import Personel, PersonelGorevlendirme

    qs = Personel.objects.filter(kurum_id=account.kurum_id).select_related('sube')
    if account.account_type == GoogleContactsAccountType.BRANCH and account.sube_id:
        qs = qs.filter(
            Q(sube_id=account.sube_id)
            | Q(gorevlendirmeler__gorev_sube_id=account.sube_id, gorevlendirmeler__aktif_mi=True)
        ).distinct()
    return qs.prefetch_related(
        Prefetch(
            'gorevlendirmeler',
            queryset=PersonelGorevlendirme.objects.filter(aktif_mi=True).select_related(
                'rol', 'brans', 'egitim_yili', 'gorev_sube',
            ),
            to_attr='aktif_gorevler',
        ),
    )


def queue_remote_deletes(*, account_ids_and_resources: list[tuple[int, str]]) -> None:
    rows = [
        GoogleContactRemoval(account_id=account_id, resource_name=resource_name)
        for account_id, resource_name in account_ids_and_resources
        if account_id and resource_name
    ]
    if rows:
        GoogleContactRemoval.objects.bulk_create(rows)


def queue_deletes_for_ogrenci(ogrenci) -> None:
    veli_ids = list(ogrenci.veliler.values_list('id', flat=True))
    mappings = GoogleContactMapping.objects.filter(
        Q(ogrenci_id=ogrenci.id) | Q(veli_id__in=veli_ids),
    ).exclude(resource_name='')
    queue_remote_deletes(account_ids_and_resources=[
        (row.account_id, row.resource_name) for row in mappings
    ])
    if mappings.exists():
        schedule_auto_sync(ogrenci.kurum_id)


def queue_deletes_for_veli(veli) -> None:
    mappings = GoogleContactMapping.objects.filter(veli_id=veli.id).exclude(resource_name='')
    pairs = [(row.account_id, row.resource_name) for row in mappings]
    kurum_id = None
    ogrenci = getattr(veli, 'ogrenci', None)
    if ogrenci is not None:
        kurum_id = ogrenci.kurum_id
    queue_remote_deletes(account_ids_and_resources=pairs)
    if pairs and kurum_id:
        schedule_auto_sync(kurum_id)


def _student_queryset(account: GoogleContactsAccount):
    from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit

    qs = Ogrenci.objects.filter(kurum_id=account.kurum_id).select_related('sube')
    if account.account_type == GoogleContactsAccountType.BRANCH and account.sube_id:
        qs = qs.filter(sube_id=account.sube_id)
    return qs.prefetch_related(
        'veliler',
        Prefetch(
            'kayitlar',
            queryset=OgrenciKayit.objects.filter(aktif_mi=True).select_related('sinif', 'egitim_yili').order_by('-id'),
            to_attr='aktif_kayitlar',
        ),
    )


def enqueue_account(account: GoogleContactsAccount) -> int:
    if account.account_type == GoogleContactsAccountType.COACH:
        return 0
    existing = {
        _plan_key(row.subject_type, row.ogrenci_id, row.veli_id, row.personel_id): row
        for row in GoogleContactMapping.objects.filter(account=account)
    }
    seen: set[tuple] = set()
    changed = 0
    scanned = 0
    for ogrenci in _student_queryset(account):
        for plan in plans_for_student(ogrenci):
            key = _plan_key(plan.subject_type, plan.ogrenci_id, plan.veli_id, plan.personel_id)
            seen.add(key)
            result = _apply_plan(account, plan, existing)
            if result != 'unchanged':
                changed += 1
        scanned += 1
        if scanned % 40 == 0 and drain_is_running(account):
            _touch_drain(account, seconds=300)
    for personel in _staff_queryset(account):
        for plan in plans_for_staff(personel):
            key = _plan_key(plan.subject_type, plan.ogrenci_id, plan.veli_id, plan.personel_id)
            seen.add(key)
            result = _apply_plan(account, plan, existing)
            if result != 'unchanged':
                changed += 1
    for key, mapping in list(existing.items()):
        if key in seen or mapping.pk is None:
            continue
        if mapping.resource_name and mapping.status != GoogleContactSyncStatus.PENDING_DELETE:
            mapping.status = GoogleContactSyncStatus.PENDING_DELETE
            mapping.save(update_fields=['status', 'updated_at'])
            changed += 1
        elif not mapping.resource_name:
            mapping.delete()
    return changed


def schedule_auto_sync(kurum_id: int) -> None:
    if not getattr(settings, 'GOOGLE_CONTACTS_AUTO_SYNC', True):
        return
    key = f'gcontacts:auto:{kurum_id}'
    if not cache.add(key, '1', timeout=30):
        return

    def _run():
        try:
            time.sleep(1.5)
            close_old_connections()
            sync_batch(kurum_id=kurum_id, limit=AUTO_SYNC_LIMIT, enqueue=False)
        except Exception:
            logger.exception('Google kişiler otomatik senkronu başarısız kurum=%s', kurum_id)
        finally:
            cache.delete(key)
            close_old_connections()

    transaction.on_commit(
        lambda: threading.Thread(target=_run, daemon=True, name=f'gcontacts-{kurum_id}').start()
    )


def _client_for(account, client_factory):
    if client_factory is not None:
        return client_factory(account)
    return GooglePeopleClient(account)


def _push_mapping(mapping: GoogleContactMapping, client) -> str:
    from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
    from apps.personel.domain.models import Personel

    if mapping.subject_type == GoogleContactSubject.PERSONEL:
        personel = (
            Personel.objects.select_related('sube')
            .filter(pk=mapping.personel_id)
            .first()
        )
        desired = staff_desired(personel) if personel is not None and personel.aktif_mi else None
        return _write_desired(mapping, client, desired)

    ogrenci = None
    veli = None
    if mapping.veli_id:
        veli = (
            OgrenciVeli.objects.select_related('ogrenci', 'ogrenci__sube')
            .filter(pk=mapping.veli_id)
            .first()
        )
        ogrenci = getattr(veli, 'ogrenci', None)
    elif mapping.ogrenci_id:
        ogrenci = Ogrenci.objects.select_related('sube').filter(pk=mapping.ogrenci_id).first()
    if ogrenci is None:
        return _write_desired(mapping, client, None)

    desired = None
    sinif_ad, kayit_yili = enrollment_context(ogrenci)
    if mapping.subject_type == GoogleContactSubject.OGRENCI:
        if ogrenci.aktif_mi:
            desired = student_desired(
                ogrenci, sinif_ad=sinif_ad, sube_ad=_sube_ad(ogrenci), kayit_yili=kayit_yili,
            )
    elif mapping.subject_type == GoogleContactSubject.VELI and veli is not None and ogrenci.aktif_mi:
        desired = parent_desired(veli, ogrenci, sinif_ad=sinif_ad, kayit_yili=kayit_yili)
    elif mapping.subject_type == GoogleContactSubject.VELI_LEGACY and ogrenci.aktif_mi:
        if not ogrenci.veliler.exists():
            desired = legacy_parent_desired(ogrenci, sinif_ad=sinif_ad, kayit_yili=kayit_yili)
    return _write_desired(mapping, client, desired)


def _write_desired(mapping: GoogleContactMapping, client, desired) -> str:
    if desired is None:
        if mapping.resource_name:
            client.delete_contact(mapping.resource_name)
        mapping.delete()
        return 'deleted'

    if (
        mapping.status == GoogleContactSyncStatus.SYNCED
        and mapping.resource_name
        and mapping.content_hash == desired.content_hash
    ):
        return 'skipped'

    body = desired.person_body()
    created = False
    if mapping.resource_name:
        try:
            person = client.update_contact(mapping.resource_name, body, mapping.etag)
        except GoogleContactNotFound:
            person = client.create_contact(body)
            created = True
    else:
        person = client.create_contact(body)
        created = True
    resource_name = person.get('resourceName') or mapping.resource_name
    mapping.resource_name = resource_name
    mapping.etag = person.get('etag') or mapping.etag
    mapping.save(update_fields=['resource_name', 'etag', 'updated_at'])
    previous_had_photo = '|' in (mapping.content_hash or '')
    photo_bytes = contact_photo_bytes(desired.photo_field) if desired.photo_digest else None
    if photo_bytes and resource_name:
        try:
            photo_person = client.update_contact_photo(resource_name, photo_bytes)
        except GoogleContactsError as exc:
            if exc.status_code == 429:
                raise
            logger.warning('Google kişi fotoğrafı yazılamadı resource=%s', resource_name, exc_info=True)
            photo_person = None
        etag = ((photo_person or {}).get('person') or {}).get('etag')
        if etag:
            mapping.etag = etag
    elif previous_had_photo and not created and resource_name and not desired.photo_digest:
        try:
            client.delete_contact_photo(resource_name)
        except GoogleContactsError as exc:
            if exc.status_code == 429:
                raise
            logger.warning('Google kişi fotoğrafı silinemedi resource=%s', resource_name, exc_info=True)
    mapping.display_name = desired.display_name[:300]
    mapping.phone_e164 = desired.phone_e164[:20]
    mapping.content_hash = desired.content_hash
    mapping.status = GoogleContactSyncStatus.SYNCED
    mapping.last_error = ''
    mapping.last_synced_at = timezone.now()
    mapping.save()
    if created and resource_name:
        for kind in desired.label_kinds():
            try:
                client.add_to_group(client.group_resource(kind), resource_name)
            except Exception:
                logger.warning('Google grup etiketi eklenemedi resource=%s', resource_name, exc_info=True)
    return 'created' if created else 'updated'


def _process_removal(removal: GoogleContactRemoval, client) -> str:
    try:
        client.delete_contact(removal.resource_name)
    except GoogleContactNotFound:
        pass
    removal.delete()
    return 'deleted'


def sync_batch(
    *,
    kurum_id: int,
    account_id=None,
    limit: int = 25,
    enqueue: bool = False,
    enqueue_only: bool = False,
    retry_failed: bool = False,
    deadline_seconds: float = 12,
    client_factory=None,
) -> dict:
    limit = max(1, min(int(limit or 25), 40))
    accounts = GoogleContactsAccount.objects.filter(
        kurum_id=kurum_id,
        is_active=True,
    ).exclude(refresh_token_encrypted='')
    if account_id:
        accounts = accounts.filter(id=account_id)
    accounts = list(accounts)
    enqueued = 0
    if enqueue:
        for account in accounts:
            enqueued += enqueue_account(account)
    deadline = monotonic() + max(3, float(deadline_seconds or 12))

    stats = {
        'enqueued': enqueued,
        'processed': 0,
        'created': 0,
        'updated': 0,
        'deleted': 0,
        'failed': 0,
        'skipped': 0,
        'remaining': 0,
        'retry_after_seconds': 0,
        'error': '',
    }
    if not accounts:
        return stats

    account_ids = [account.id for account in accounts]
    if enqueue_only:
        stats['remaining'] = _remaining_count(account_ids)
        return stats
    clients: dict = {}

    def get_client(account):
        if account.id not in clients:
            clients[account.id] = _client_for(account, client_factory)
        return clients[account.id]

    fatal = False
    removals = list(
        GoogleContactRemoval.objects.filter(account_id__in=account_ids).order_by('created_at')[:limit]
    )
    for removal in removals:
        account = next((item for item in accounts if item.id == removal.account_id), None)
        if account is None:
            continue
        try:
            _process_removal(removal, get_client(account))
            stats['deleted'] += 1
            stats['processed'] += 1
        except GoogleContactsError as exc:
            if _hold_for_rate_limit(stats, exc):
                fatal = True
                break
            stats['failed'] += 1
            stats['processed'] += 1
            stats['error'] = str(exc)[:300]
            removal.attempts += 1
            removal.last_error = str(exc)[:500]
            removal.save(update_fields=['attempts', 'last_error'])
            account.last_sync_error = stats['error']
            account.save(update_fields=['last_sync_error', 'updated_at'])
            fatal = exc.status_code in (401, 403)
        if fatal or stats['processed'] >= limit or monotonic() >= deadline:
            break

    room = limit - stats['processed']
    if room > 0 and not fatal:
        open_statuses = [
            GoogleContactSyncStatus.PENDING,
            GoogleContactSyncStatus.PENDING_DELETE,
        ]
        if retry_failed:
            open_statuses.append(GoogleContactSyncStatus.FAILED)
        mappings = list(
            GoogleContactMapping.objects.filter(
                account_id__in=account_ids,
                status__in=open_statuses,
            ).order_by('updated_at')[:room]
        )
        for mapping in mappings:
            account = next((item for item in accounts if item.id == mapping.account_id), None)
            if account is None:
                continue
            try:
                outcome = _push_mapping(mapping, get_client(account))
                stats[outcome] = stats.get(outcome, 0) + 1
                stats['processed'] += 1
            except GoogleContactsError as exc:
                if _hold_for_rate_limit(stats, exc):
                    fatal = True
                    break
                stats['failed'] += 1
                stats['processed'] += 1
                stats['error'] = str(exc)[:300]
                mapping.status = GoogleContactSyncStatus.FAILED
                mapping.last_error = str(exc)[:500]
                mapping.save(update_fields=['status', 'last_error', 'updated_at'])
                account.last_sync_error = stats['error']
                account.save(update_fields=['last_sync_error', 'updated_at'])
                fatal = exc.status_code in (401, 403)
            if fatal or monotonic() >= deadline:
                break

    remaining = _remaining_count(account_ids)
    stats['remaining'] = remaining
    now = timezone.now()
    for account in accounts:
        account.last_synced_at = now
        if stats['failed'] == 0:
            account.last_sync_error = ''
        account.refresh_from_db(fields=['last_sync_stats'])
        previous = account.last_sync_stats or {}
        account.last_sync_stats = {
            'created': stats['created'],
            'updated': stats['updated'],
            'deleted': stats['deleted'],
            'failed': stats['failed'],
            'skipped': stats['skipped'],
            'remaining': remaining,
        }
        if previous.get('draining_until'):
            account.last_sync_stats['draining_until'] = previous['draining_until']
        account.save(update_fields=['last_synced_at', 'last_sync_error', 'last_sync_stats', 'updated_at'])
    return stats


def _hold_for_rate_limit(stats: dict, exc: GoogleContactsError) -> bool:
    if exc.status_code != 429:
        return False
    stats['error'] = str(exc)[:300]
    stats['retry_after_seconds'] = 35
    return True


def _parse_stamp(value: str):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def drain_is_running(account: GoogleContactsAccount) -> bool:
    until = _parse_stamp((account.last_sync_stats or {}).get('draining_until') or '')
    return bool(until and until > timezone.now())


def _touch_drain(account: GoogleContactsAccount, *, seconds: int = 90) -> None:
    account.refresh_from_db(fields=['last_sync_stats'])
    stats = dict(account.last_sync_stats or {})
    stats['draining_until'] = (timezone.now() + timedelta(seconds=seconds)).isoformat()
    account.last_sync_stats = stats
    account.save(update_fields=['last_sync_stats', 'updated_at'])


def _clear_drain(account_id) -> None:
    account = GoogleContactsAccount.objects.filter(id=account_id).first()
    if account is None:
        return
    stats = dict(account.last_sync_stats or {})
    stats.pop('draining_until', None)
    account.last_sync_stats = stats
    account.save(update_fields=['last_sync_stats', 'updated_at'])


def start_background_sync(*, kurum_id: int, account_id, retry_failed: bool = False) -> dict:
    """Kuyruğu tarayıcıya bağlı kalmadan yazar. Google limiti için turlar arasında bekler."""
    with transaction.atomic():
        account = (
            GoogleContactsAccount.objects.select_for_update()
            .filter(kurum_id=kurum_id, id=account_id, is_active=True)
            .exclude(refresh_token_encrypted='')
            .first()
        )
        if account is None:
            return {'started': False, 'already_running': False, 'remaining': 0, 'error': 'Bağlı hesap yok.'}
        if drain_is_running(account):
            return {
                'started': False,
                'already_running': True,
                'remaining': _remaining_count([account.id]),
                'error': '',
            }
        stats = dict(account.last_sync_stats or {})
        stats['draining_until'] = (timezone.now() + timedelta(seconds=90)).isoformat()
        account.last_sync_stats = stats
        account.last_sync_error = ''
        account.save(update_fields=['last_sync_stats', 'last_sync_error', 'updated_at'])
        claimed_id = account.id

    def _run():
        try:
            close_old_connections()
            need_enqueue = True
            idle = 0
            while True:
                _touch_drain(GoogleContactsAccount.objects.get(id=claimed_id), seconds=300)
                if need_enqueue:
                    # Bekleyen kartlar, tüm listenin taranması bitmeden yazılsın.
                    stats = sync_batch(
                        kurum_id=kurum_id,
                        account_id=claimed_id,
                        limit=12,
                        enqueue=False,
                        retry_failed=retry_failed,
                        deadline_seconds=20,
                    )
                    if stats.get('retry_after_seconds'):
                        time.sleep(int(stats['retry_after_seconds']))
                        continue
                    need_enqueue = False
                    stats = sync_batch(
                        kurum_id=kurum_id,
                        account_id=claimed_id,
                        limit=12,
                        enqueue=True,
                        retry_failed=retry_failed,
                        deadline_seconds=20,
                    )
                else:
                    stats = sync_batch(
                        kurum_id=kurum_id,
                        account_id=claimed_id,
                        limit=12,
                        enqueue=False,
                        deadline_seconds=20,
                    )
                if stats.get('retry_after_seconds'):
                    time.sleep(int(stats['retry_after_seconds']))
                    continue
                if stats['remaining'] <= 0:
                    break
                if stats['error'] and stats['processed'] == 0:
                    break
                if stats['processed'] == 0:
                    idle += 1
                    if idle >= 2:
                        break
                else:
                    idle = 0
                time.sleep(12)
        except Exception:
            logger.exception('Google kişiler arka plan eşitlemesi başarısız kurum=%s', kurum_id)
        finally:
            _clear_drain(claimed_id)
            close_old_connections()

    threading.Thread(
        target=_run,
        daemon=True,
        name=f'gcontacts-drain-{claimed_id}',
    ).start()
    return {
        'started': True,
        'already_running': False,
        'remaining': _remaining_count([claimed_id]),
        'error': '',
    }


def _remaining_count(account_ids) -> int:
    return GoogleContactMapping.objects.filter(
        account_id__in=account_ids,
        status__in=[
            GoogleContactSyncStatus.PENDING,
            GoogleContactSyncStatus.PENDING_DELETE,
        ],
    ).count() + GoogleContactRemoval.objects.filter(account_id__in=account_ids).count()


def account_counts(account: GoogleContactsAccount) -> dict:
    rows = GoogleContactMapping.objects.filter(account=account).values_list('status', flat=True)
    counts = {'synced': 0, 'pending': 0, 'failed': 0, 'pending_delete': 0}
    for status in rows:
        if status in counts:
            counts[status] += 1
    counts['removing'] = GoogleContactRemoval.objects.filter(account=account).count()
    return counts


def disconnect_account(account: GoogleContactsAccount, *, purge: bool, limit: int = 25, client_factory=None) -> dict:
    if purge:
        GoogleContactMapping.objects.filter(account=account).exclude(resource_name='').update(
            status=GoogleContactSyncStatus.PENDING_DELETE,
            updated_at=timezone.now(),
        )
        GoogleContactMapping.objects.filter(account=account, resource_name='').delete()
        stats = sync_batch(
            kurum_id=account.kurum_id,
            account_id=account.id,
            limit=limit,
            enqueue=False,
            client_factory=client_factory,
        )
        if stats['remaining'] == 0 and stats['failed'] == 0:
            _clear_tokens(account)
            stats['disconnected'] = True
        else:
            stats['disconnected'] = False
        return stats
    _clear_tokens(account)
    return {
        'disconnected': True,
        'remaining': 0,
        'processed': 0,
        'created': 0,
        'updated': 0,
        'deleted': 0,
        'failed': 0,
        'skipped': 0,
        'enqueued': 0,
        'error': '',
    }


def _clear_tokens(account: GoogleContactsAccount) -> None:
    account.is_active = False
    account.access_token_encrypted = ''
    account.refresh_token_encrypted = ''
    account.token_expires_at = None
    account.save(update_fields=[
        'is_active', 'access_token_encrypted', 'refresh_token_encrypted', 'token_expires_at', 'updated_at',
    ])
