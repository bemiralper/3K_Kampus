"""
İletişim modülü — Repository katmanı
"""
from __future__ import annotations

import re
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.communication.domain.enums import (
    Channel,
    CommunicationDepartment,
    ConversationStatus,
    MessageDirection,
    MessageStatus,
    RecipientType,
    WebhookProcessingStatus,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    CommunicationLog,
    ContactIdentity,
    Conversation,
    Message,
    MessageStatusEvent,
    OutboundCampaign,
    OutboundQueueItem,
    RawWebhookEvent,
)
from apps.communication.interfaces.sube_context import filter_conversations_by_sube


class ChannelConfigRepository:
    @staticmethod
    def get_whatsapp_config(kurum_id: int) -> CommunicationChannelConfig | None:
        """Geriye uyum: varsayılan aktif WhatsApp hesabı (pasif default seçilmez)."""
        active = CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            is_active=True,
        ).order_by('-is_default', 'created_at')
        config = active.first()
        if config:
            return config
        # Aktif yoksa None — env (WHATSAPP_*) fallback kullanılsın.
        return None

    @staticmethod
    def get_by_id(kurum_id: int, config_id) -> CommunicationChannelConfig | None:
        return CommunicationChannelConfig.objects.filter(
            id=config_id,
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
        ).prefetch_related('allowed_subes', 'allowed_roles').first()

    @staticmethod
    def list_whatsapp(kurum_id: int, *, active_only: bool = False):
        qs = CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
        ).prefetch_related('allowed_subes', 'allowed_roles').order_by(
            '-is_default', 'name', 'created_at',
        )
        if active_only:
            qs = qs.filter(is_active=True)
        return qs

    @staticmethod
    def get_by_phone_number_id(phone_number_id: str) -> CommunicationChannelConfig | None:
        if not phone_number_id:
            return None
        return CommunicationChannelConfig.objects.filter(
            phone_number_id=phone_number_id,
            is_active=True,
            channel=Channel.WHATSAPP,
        ).first()

    @staticmethod
    def verify_token_exists(token: str) -> bool:
        if not token:
            return False
        return CommunicationChannelConfig.objects.filter(
            webhook_verify_token=token,
            is_active=True,
        ).exists()

    @staticmethod
    def phone_number_id_taken(
        phone_number_id: str,
        *,
        exclude_id=None,
        only_active: bool = True,
    ) -> bool:
        if not phone_number_id:
            return False
        qs = CommunicationChannelConfig.objects.filter(
            phone_number_id=phone_number_id,
            channel=Channel.WHATSAPP,
        )
        if only_active:
            qs = qs.filter(is_active=True)
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.exists()

    @staticmethod
    def upsert_whatsapp(kurum_id: int, data: dict) -> CommunicationChannelConfig:
        """Geriye uyum: mevcut varsayılan hesabı güncelle veya oluştur."""
        existing = ChannelConfigRepository.get_whatsapp_config(kurum_id)
        if existing:
            for key, value in data.items():
                setattr(existing, key, value)
            existing.save()
            return existing
        return CommunicationChannelConfig.objects.create(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            is_default=True,
            **{k: v for k, v in data.items() if k != 'channel'},
        )

    @staticmethod
    def create_whatsapp(kurum_id: int, data: dict) -> CommunicationChannelConfig:
        payload = {k: v for k, v in data.items() if k != 'channel'}
        payload['channel'] = Channel.WHATSAPP
        has_default = CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            is_default=True,
        ).exists()
        if not has_default:
            payload.setdefault('is_default', True)
        return CommunicationChannelConfig.objects.create(kurum_id=kurum_id, **payload)

    @staticmethod
    def clear_other_defaults(kurum_id: int, keep_id) -> None:
        CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            is_default=True,
        ).exclude(id=keep_id).update(is_default=False)


class ContactIdentityRepository:
    @staticmethod
    def get_by_e164(kurum_id: int, e164: str) -> ContactIdentity | None:
        return ContactIdentity.objects.filter(kurum_id=kurum_id, e164=e164).first()

    @staticmethod
    def update_or_create(kurum_id: int, e164: str, defaults: dict):
        return ContactIdentity.objects.update_or_create(
            kurum_id=kurum_id,
            e164=e164,
            defaults=defaults,
        )


def conversation_phone_tail(phone: str) -> str:
    digits = re.sub(r'\D', '', phone or '')
    return digits[-10:] if len(digits) >= 10 else digits


def _advisory_lock(*parts) -> None:
    """Transaction ömrü boyunca geçerli Postgres advisory kilidi (bigint anahtar).

    Postgres dışı motorlarda (sqlite test vb.) sessizce atlanır.
    """
    from django.db import connection

    if connection.vendor != 'postgresql':
        return
    import hashlib

    digest = hashlib.sha1('|'.join(str(p) for p in parts).encode('utf-8')).digest()
    key = int.from_bytes(digest[:8], 'big', signed=True)
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [key])


def _conversation_phone_q(contact_phone: str) -> Q:
    """Aynı hattı +90 / 0 / ham basamak biçimlerinde de bul."""
    tail = conversation_phone_tail(contact_phone)
    if not tail:
        return Q(contact_phone=contact_phone)
    variants = {contact_phone, f'+90{tail}', f'90{tail}', f'0{tail}', tail}
    return Q(contact_phone__in=variants) | Q(contact_phone__endswith=tail)


class ConversationRepository:
    @staticmethod
    def get_by_id(kurum_id: int, conversation_id, *, sube_id: int | None = None) -> Conversation | None:
        qs = Conversation.objects.filter(
            kurum_id=kurum_id,
            id=conversation_id,
        )
        if sube_id is not None:
            qs = filter_conversations_by_sube(qs, sube_id)
        return qs.select_related(
            'ogrenci', 'ogrenci__sube', 'veli', 'veli__ogrenci', 'veli__ogrenci__sube',
            'kurum', 'contact_identity', 'contact_identity__personel',
            'contact_identity__veli', 'contact_identity__ogrenci',
            'assigned_coach', 'assigned_coach__teacher', 'claimed_by_user', 'sube',
        ).first()

    @staticmethod
    def find_latest_for_ogrenci(kurum_id: int, ogrenci_id: int, *, channel: str | None = None):
        qs = Conversation.objects.filter(kurum_id=kurum_id, ogrenci_id=ogrenci_id)
        if channel:
            qs = qs.filter(channel=channel)
        return qs.select_related('ogrenci', 'veli').order_by('-last_message_at', '-updated_at').first()

    @staticmethod
    def find_latest_for_veli(
        kurum_id: int,
        veli_id: int,
        *,
        channel: str | None = None,
        channel_config_id=None,
        department: str | None = None,
    ):
        qs = Conversation.objects.filter(kurum_id=kurum_id, veli_id=veli_id)
        if channel:
            qs = qs.filter(channel=channel)
        if department:
            qs = qs.filter(department=department)
        if channel_config_id:
            preferred = qs.filter(channel_config_id=channel_config_id).order_by(
                '-last_message_at', '-updated_at',
            ).first()
            if preferred:
                return preferred
        return qs.select_related('ogrenci', 'veli').order_by('-last_message_at', '-updated_at').first()

    @staticmethod
    def list_by_kurum_and_sube(kurum_id: int, sube_id: int, **filters):
        from datetime import timedelta

        from django.utils import timezone as dj_tz

        qs = filter_conversations_by_sube(
            Conversation.objects.filter(kurum_id=kurum_id, deleted_at__isnull=True),
            sube_id,
        )
        inbox = filters.get('inbox')
        status = filters.get('status')
        if status:
            qs = qs.filter(status=status)
        elif inbox == 'archived' or filters.get('archived'):
            qs = qs.filter(status=ConversationStatus.ARCHIVED)
        elif filters.get('exclude_archived') and inbox != 'archived':
            qs = qs.exclude(status=ConversationStatus.ARCHIVED)
        unread = filters.get('unread')
        if unread:
            qs = qs.filter(unread_count_coach__gt=0)
        if filters.get('read'):
            qs = qs.filter(unread_count_coach=0)
        ogrenci_id = filters.get('ogrenci_id')
        if ogrenci_id:
            qs = qs.filter(
                Q(ogrenci_id=ogrenci_id) | Q(veli__ogrenci_id=ogrenci_id)
            )
        search = filters.get('search')
        if search:
            criteria = (
                Q(contact_phone__icontains=search)
                | Q(subject__icontains=search)
                | Q(contact_name__icontains=search)
                | Q(ogrenci__ad__icontains=search)
                | Q(ogrenci__soyad__icontains=search)
                | Q(veli__ad__icontains=search)
                | Q(veli__soyad__icontains=search)
            )
            if filters.get('search_messages'):
                # Mesaj gövdesinde geçen sohbetler de listeye girsin (WhatsApp
                # aramasındaki gibi). Join çoğaltmasın diye alt sorgu; sabit 2000
                # sınırı kaldırıldı — büyük kurumda eksik sonuç veriyordu (M-12).
                # Alt sorgu şube filtreli dış sorguyla kesişir.
                criteria |= Q(
                    id__in=Message.objects.filter(
                        conversation__kurum_id=kurum_id,
                        deleted_at__isnull=True,
                        body__icontains=search,
                    ).values('conversation_id')
                )
            qs = qs.filter(criteria)
        channel_config_id = filters.get('channel_config_id')
        if channel_config_id:
            qs = qs.filter(channel_config_id=channel_config_id)
        department = filters.get('department')
        if department:
            qs = qs.filter(department=department)

        contact_kinds = filters.get('contact_kinds')
        if contact_kinds:
            kind_q = Q()
            for kind in contact_kinds:
                if kind == 'ogrenci':
                    kind_q |= Q(contact_type=RecipientType.OGRENCI)
                elif kind == 'veli':
                    kind_q |= Q(contact_type=RecipientType.VELI)
                elif kind == 'koc':
                    kind_q |= Q(
                        contact_type=RecipientType.PERSONEL,
                        contact_identity__personel__coach_profile__isnull=False,
                    )
                elif kind == 'ogretmen':
                    kind_q |= Q(
                        contact_type=RecipientType.PERSONEL,
                        contact_identity__personel__coach_profile__isnull=True,
                    )
                elif kind == 'diger':
                    kind_q |= Q(contact_type=RecipientType.RAW_PHONE)
            if kind_q:
                qs = qs.filter(kind_q)

        if filters.get('awaiting_reply'):
            qs = qs.filter(first_unanswered_at__isnull=False).exclude(
                status__in=[
                    ConversationStatus.REPLIED,
                    ConversationStatus.ARCHIVED,
                    ConversationStatus.CLOSED,
                ]
            )

        pinned_ids = filters.get('pinned_ids')
        if pinned_ids is not None:
            qs = qs.filter(id__in=pinned_ids)

        since_hours = filters.get('since_hours')
        if since_hours:
            threshold = dj_tz.now() - timedelta(hours=int(since_hours))
            qs = qs.filter(
                Q(last_message_at__gte=threshold)
                | Q(last_message_at__isnull=True, created_at__gte=threshold)
            )

        period = filters.get('period')
        if period and period != 'all':
            now = dj_tz.now()
            if period == '7d':
                qs = qs.filter(
                    Q(last_message_at__gte=now - timedelta(days=7))
                    | Q(last_message_at__isnull=True, created_at__gte=now - timedelta(days=7))
                )
            elif period == '30d':
                qs = qs.filter(
                    Q(last_message_at__gte=now - timedelta(days=30))
                    | Q(last_message_at__isnull=True, created_at__gte=now - timedelta(days=30))
                )
            elif period == 'year':
                qs = qs.filter(
                    Q(last_message_at__year=now.year)
                    | Q(last_message_at__isnull=True, created_at__year=now.year)
                )

        return qs.select_related(
            'ogrenci', 'ogrenci__sube', 'veli', 'veli__ogrenci', 'kurum',
            'assigned_coach', 'assigned_coach__teacher', 'claimed_by_user',
            'contact_identity', 'contact_identity__personel',
            # İsim çözümlemesi identity üzerinden de bakıyor; select_related
            # olmazsa satır başına ek sorgu (N+1) çıkar.
            'contact_identity__veli', 'contact_identity__ogrenci',
            'sube', 'channel_config',
        ).prefetch_related('tags').order_by(
            # İmleç sayfalaması için deterministik sıra: (last_message_at desc nulls last, id desc)
            F('last_message_at').desc(nulls_last=True),
            '-id',
        )

    @staticmethod
    def cursor_for(conversation: Conversation) -> str:
        """Liste sırasına (last_message_at desc nulls last, id desc) uygun opak imleç."""
        import base64

        ts = conversation.last_message_at.isoformat() if conversation.last_message_at else ''
        raw = f'{ts}|{conversation.id}'.encode('utf-8')
        return base64.urlsafe_b64encode(raw).decode('ascii')

    @staticmethod
    def apply_cursor(qs, cursor: str):
        """İmleçten sonraki satırlar; geçersiz imleç yok sayılır (ilk sayfa)."""
        import base64
        from datetime import datetime

        try:
            raw = base64.urlsafe_b64decode(cursor.encode('ascii')).decode('utf-8')
            ts_raw, _, conv_id = raw.partition('|')
        except Exception:
            return qs
        if not conv_id:
            return qs
        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except ValueError:
                return qs
            return qs.filter(
                Q(last_message_at__lt=ts)
                | Q(last_message_at=ts, id__lt=conv_id)
                | Q(last_message_at__isnull=True)
            )
        return qs.filter(last_message_at__isnull=True, id__lt=conv_id)

    @staticmethod
    def _resolve_sube_id(*, ogrenci_id=None, veli_id=None) -> int | None:
        if ogrenci_id:
            from apps.ogrenci.domain.models import Ogrenci
            return Ogrenci.objects.filter(id=ogrenci_id).values_list('sube_id', flat=True).first()
        if veli_id:
            from apps.ogrenci.domain.models import OgrenciVeli
            return (
                OgrenciVeli.objects.filter(id=veli_id)
                .values_list('ogrenci__sube_id', flat=True)
                .first()
            )
        return None

    @staticmethod
    def _fallback_sube_id(kurum_id: int, channel_config=None) -> int | None:
        """Eşleşmeyen numara için şube — seçili-şube hesaplarında ilk izinli şube.

        Tüm-şube hesaplarında null bırakılır; liste filtresi bu orphan sohbetleri
        her şube inbox'ında gösterir.
        """
        if channel_config is None:
            return None
        from apps.communication.domain.enums import WhatsAppAccountScope

        if getattr(channel_config, 'scope_type', None) != WhatsAppAccountScope.SELECTED_SUBES:
            return None
        return (
            channel_config.allowed_subes
            .filter(aktif_mi=True)
            .order_by('id')
            .values_list('id', flat=True)
            .first()
        )

    @staticmethod
    def find_by_phone(
        kurum_id: int,
        channel: str,
        contact_phone: str,
        *,
        channel_config_id=None,
        department: str | None = None,
    ):
        qs = Conversation.objects.filter(
            kurum_id=kurum_id,
            channel=channel,
        ).filter(_conversation_phone_q(contact_phone))
        if department:
            qs = qs.filter(department=department)
        if channel_config_id:
            preferred = qs.filter(channel_config_id=channel_config_id).select_related(
                'ogrenci', 'ogrenci__sube', 'veli', 'kurum', 'contact_identity', 'channel_config',
            ).order_by('-last_message_at', '-updated_at').first()
            if preferred:
                return preferred
        return qs.select_related(
            'ogrenci', 'ogrenci__sube', 'veli', 'kurum', 'contact_identity', 'channel_config',
        ).order_by('-last_message_at', '-updated_at').first()

    @staticmethod
    def inbound_department(
        kurum_id: int,
        channel: str,
        contact_phone: str,
        *,
        ogrenci_id=None,
        veli_id=None,
        channel_config=None,
    ) -> str | None:
        """Gelen mesaj hangi departmanın sohbetine düşmeli.

        Hattın departmanı esas alınır. Koçluk hattına gelen cevap muhasebe
        sohbetine, muhasebe hattına gelen cevap koçluk sohbetine kaymaz.
        Departmanı boş hatlarda kişiyle en son konuşan sohbet kullanılır.
        """
        cfg_dept = getattr(channel_config, 'department', None)
        if cfg_dept:
            return cfg_dept

        cfg_id = getattr(channel_config, 'id', None)
        base = Conversation.objects.filter(
            kurum_id=kurum_id,
            channel=channel,
            deleted_at__isnull=True,
        )
        if cfg_id:
            base = base.filter(
                Q(channel_config_id=cfg_id) | Q(channel_config_id__isnull=True)
            )

        candidates = []
        if veli_id is not None:
            candidates.append(base.filter(veli_id=veli_id))
        elif ogrenci_id is not None:
            candidates.append(base.filter(ogrenci_id=ogrenci_id, veli_id__isnull=True))
        candidates.append(base.filter(_conversation_phone_q(contact_phone)))

        for qs in candidates:
            department = (
                qs.order_by('-last_message_at', '-updated_at', '-created_at')
                .values_list('department', flat=True)
                .first()
            )
            if department:
                return department
        return getattr(channel_config, 'department', None)

    @staticmethod
    def align_accounting_line_conversations(channel_config) -> int:
        """Muhasebe hattına yazılmış koçluk etiketli sohbetleri portalın göreceği departmana çek."""
        if getattr(channel_config, 'department', None) != CommunicationDepartment.ACCOUNTING:
            return 0
        return Conversation.objects.filter(
            channel_config=channel_config,
            deleted_at__isnull=True,
        ).exclude(
            department=CommunicationDepartment.ACCOUNTING,
        ).update(department=CommunicationDepartment.ACCOUNTING)

    @staticmethod
    def _pick_existing_conversation(
        qs,
        *,
        ogrenci_id=None,
        veli_id=None,
    ):
        """Aynı telefon için birden fazla konuşma varsa en uygun olanı seç."""
        ordered = qs.order_by('-last_message_at', '-updated_at', '-created_at')
        if veli_id is not None:
            return ordered.filter(veli_id=veli_id).first()
        if ogrenci_id is not None:
            match = ordered.filter(ogrenci_id=ogrenci_id, veli_id__isnull=True).first()
            if match:
                return match
        return ordered.first()

    @staticmethod
    def get_or_create_for_contact(
        kurum_id: int,
        channel: str,
        contact_phone: str,
        *,
        contact_type: str = 'RAW_PHONE',
        contact_identity=None,
        ogrenci_id=None,
        veli_id=None,
        channel_config=None,
        channel_config_id=None,
        department: str | None = None,
    ) -> tuple[Conversation, bool]:
        """Kişi + departman için tek thread; yoksa açar.

        Aynı numaradan eşzamanlı iki webhook iki sohbet açmasın diye kurum +
        numara + departman anahtarıyla transaction'a bağlı advisory lock alınır
        (B-02). Silinmiş (soft-delete) thread bulunursa diriltilir; gelen mesaj
        görünmez bir sohbete düşmez (K-08).
        """
        cfg_id = channel_config_id or getattr(channel_config, 'id', None)
        thread_dept = department or getattr(channel_config, 'department', None)
        with transaction.atomic():
            _advisory_lock(kurum_id, conversation_phone_tail(contact_phone) or contact_phone, thread_dept or '')
            conversation, created = ConversationRepository._get_or_create_for_contact_locked(
                kurum_id,
                channel,
                contact_phone,
                contact_type=contact_type,
                contact_identity=contact_identity,
                ogrenci_id=ogrenci_id,
                veli_id=veli_id,
                channel_config=channel_config,
                cfg_id=cfg_id,
                thread_dept=thread_dept,
            )
        return conversation, created

    @staticmethod
    def revive_fields(conversation: Conversation) -> list[str]:
        """Soft-delete edilmiş thread'i bellek üzerinde dirilt; değişen alan adlarını döndür.

        Çağıran `save(update_fields=...)` yapar. Listeden kaldırılmış sohbete yeni
        temas gelince kayıt yeniden görünür olur (K-08).
        """
        if conversation.deleted_at is None:
            return []
        fields = ['deleted_at', 'deleted_by']
        conversation.deleted_at = None
        conversation.deleted_by = None
        if conversation.status in (ConversationStatus.CLOSED, ConversationStatus.ARCHIVED):
            conversation.status = ConversationStatus.NEW
            conversation.archived_at = None
            fields.extend(['status', 'archived_at'])
        from apps.communication.application.conversation_events import log_conversation_event
        from apps.communication.domain.enums import ConversationEventType

        log_conversation_event(
            conversation, ConversationEventType.UNARCHIVED, meta={'revived': True},
        )
        return fields

    @staticmethod
    def revive_if_deleted(conversation: Conversation) -> Conversation:
        fields = ConversationRepository.revive_fields(conversation)
        if fields:
            fields.append('updated_at')
            conversation.save(update_fields=fields)
        return conversation

    @staticmethod
    def _get_or_create_for_contact_locked(
        kurum_id: int,
        channel: str,
        contact_phone: str,
        *,
        contact_type: str,
        contact_identity,
        ogrenci_id,
        veli_id,
        channel_config,
        cfg_id,
        thread_dept,
    ) -> tuple[Conversation, bool]:
        defaults = {
            'status': ConversationStatus.OPEN,
            'contact_type': contact_type,
        }
        if contact_identity:
            defaults['contact_identity'] = contact_identity
        if ogrenci_id:
            defaults['ogrenci_id'] = ogrenci_id
        if veli_id:
            defaults['veli_id'] = veli_id
        if cfg_id:
            defaults['channel_config_id'] = cfg_id
        if thread_dept:
            defaults['department'] = thread_dept
        sube_id = ConversationRepository._resolve_sube_id(ogrenci_id=ogrenci_id, veli_id=veli_id)
        if not sube_id and not ogrenci_id and not veli_id:
            sube_id = ConversationRepository._fallback_sube_id(kurum_id, channel_config)
        if sube_id:
            defaults['sube_id'] = sube_id

        def _scoped(qs):
            # Aynı kişi + aynı departman = tek sohbet. Koçluk ve muhasebe
            # aynı WhatsApp hattından gitse bile ayrı thread kalır.
            if thread_dept:
                qs = qs.filter(department=thread_dept)
            if not cfg_id:
                return qs
            preferred = qs.filter(
                Q(channel_config_id=cfg_id) | Q(channel_config_id__isnull=True)
            )
            if preferred.exists():
                return preferred
            return qs

        existing = None
        if veli_id is not None:
            existing = _scoped(
                Conversation.objects.filter(
                    kurum_id=kurum_id,
                    channel=channel,
                    veli_id=veli_id,
                )
            ).order_by('-last_message_at', '-updated_at', '-created_at').first()
        elif ogrenci_id is not None:
            existing = (
                _scoped(
                    Conversation.objects.filter(
                        kurum_id=kurum_id,
                        channel=channel,
                        ogrenci_id=ogrenci_id,
                        veli_id__isnull=True,
                    )
                )
                .order_by('-last_message_at', '-updated_at', '-created_at')
                .first()
            )

        if not existing:
            base_qs = _scoped(
                Conversation.objects.filter(
                    kurum_id=kurum_id,
                    channel=channel,
                ).filter(_conversation_phone_q(contact_phone))
            )
            existing = ConversationRepository._pick_existing_conversation(
                base_qs,
                ogrenci_id=ogrenci_id,
                veli_id=veli_id,
            )

        if existing:
            conversation = existing
            created = False
        else:
            conversation = Conversation.objects.create(
                kurum_id=kurum_id,
                channel=channel,
                contact_phone=contact_phone,
                **defaults,
            )
            created = True

        if not created:
            update_fields = ConversationRepository.revive_fields(conversation)
            if contact_phone and conversation.contact_phone != contact_phone:
                conversation.contact_phone = contact_phone
                update_fields.append('contact_phone')
            if contact_identity and conversation.contact_identity_id != getattr(contact_identity, 'id', None):
                conversation.contact_identity = contact_identity
                update_fields.append('contact_identity')
            if veli_id is not None and conversation.veli_id != veli_id:
                conversation.veli_id = veli_id
                update_fields.append('veli_id')
            if ogrenci_id is not None and conversation.ogrenci_id != ogrenci_id:
                conversation.ogrenci_id = ogrenci_id
                update_fields.append('ogrenci_id')
            # Eşleşen kişi şubesi veya seçili-şube fallback; null orphan'ları bilinçli bırak.
            effective_sube = sube_id
            if (
                not effective_sube
                and not conversation.sube_id
                and not conversation.ogrenci_id
                and not conversation.veli_id
                and not ogrenci_id
                and not veli_id
            ):
                effective_sube = ConversationRepository._fallback_sube_id(
                    kurum_id, channel_config,
                )
            if effective_sube and conversation.sube_id != effective_sube:
                conversation.sube_id = effective_sube
                update_fields.append('sube_id')
            if contact_type and conversation.contact_type != contact_type:
                conversation.contact_type = contact_type
                update_fields.append('contact_type')
            if cfg_id and conversation.channel_config_id != cfg_id:
                conversation.channel_config_id = cfg_id
                update_fields.append('channel_config_id')
            if thread_dept and conversation.department != thread_dept:
                conversation.department = thread_dept
                update_fields.append('department')
            if update_fields:
                update_fields.append('updated_at')
                conversation.save(update_fields=update_fields)
        return conversation, created

    @staticmethod
    def get_or_create_by_phone(kurum_id: int, channel: str, contact_phone: str) -> tuple[Conversation, bool]:
        return ConversationRepository.get_or_create_for_contact(
            kurum_id=kurum_id,
            channel=channel,
            contact_phone=contact_phone,
        )

    @staticmethod
    def update_on_message(
        conversation: Conversation,
        *,
        preview: str,
        direction: str,
        channel_config=None,
        actor=None,
        department: str | None = None,
        occurred_at=None,
        source_module: str | None = None,
    ) -> None:
        from django.conf import settings

        now = occurred_at or timezone.now()
        # Geciken webhook eski bir mesaj getirdiyse "son mesaj" zamanı geri gitmez.
        if not conversation.last_message_at or now > conversation.last_message_at:
            conversation.last_message_at = now
        conversation.last_message_preview = (preview or '')[:255]
        if direction == MessageDirection.INBOUND:
            # Eşzamanlı iki inbound sayacı ezmesin: atomik artış (M-08)
            Conversation.objects.filter(pk=conversation.pk).update(
                unread_count_coach=F('unread_count_coach') + 1,
            )
            conversation.refresh_from_db(fields=['unread_count_coach'])
            # 24 saatlik pencere bu alandan hesaplanır; ticket routing kapalıyken de yazılmalı.
            if not conversation.last_customer_message_at or now > conversation.last_customer_message_at:
                conversation.last_customer_message_at = now
            conversation.save(update_fields=[
                'last_message_at',
                'last_message_preview',
                'last_customer_message_at',
                'updated_at',
            ])
            if getattr(settings, 'COMMUNICATION_TICKET_ROUTING', True):
                from apps.communication.application.conversation_router import ConversationRouter
                ConversationRouter.apply_after_inbound(
                    conversation,
                    channel_config=channel_config or getattr(conversation, 'channel_config', None),
                    preview=preview,
                    department=department,
                )
            else:
                if conversation.status == ConversationStatus.ARCHIVED:
                    conversation.status = ConversationStatus.OPEN
                    conversation.save(update_fields=['status', 'updated_at'])
        elif direction == MessageDirection.OUTBOUND:
            conversation.save(update_fields=[
                'last_message_at',
                'last_message_preview',
                'updated_at',
            ])
            if getattr(settings, 'COMMUNICATION_TICKET_ROUTING', True):
                from apps.communication.application.conversation_router import ConversationRouter
                ConversationRouter.apply_after_outbound(
                    conversation, actor=actor, preview=preview, source_module=source_module,
                )
            else:
                conversation.status = ConversationStatus.AWAITING_REPLY
                conversation.save(update_fields=['status', 'updated_at'])

    @staticmethod
    def mark_all_read_bulk(qs, user, *, reset_counters: bool) -> int:
        """Bir sohbet kümesini toplu okundu yap — satır başına döngü yok (P-05).

        - Kullanıcı durumlarını (`notif_cleared_at`) tek `bulk_create` + tek `update`
        - Uygulama bildirimlerini tek `update`
        - `reset_counters` ise `unread_count_coach=0` + statü READ tek `update`
        Döndürülen değer etkilenen sohbet sayısıdır.
        """
        from apps.communication.domain.models import ConversationUserState

        ids = list(qs.values_list('id', flat=True))
        if not ids:
            return 0
        now = timezone.now()
        user_id = getattr(user, 'pk', None)
        kurum_ids = set(qs.values_list('kurum_id', flat=True).distinct())

        if user_id:
            existing = set(
                ConversationUserState.objects.filter(
                    user_id=user_id, conversation_id__in=ids,
                ).values_list('conversation_id', flat=True)
            )
            missing = [cid for cid in ids if cid not in existing]
            if missing:
                ConversationUserState.objects.bulk_create(
                    [
                        ConversationUserState(
                            conversation_id=cid, user_id=user_id, notif_cleared_at=now,
                        )
                        for cid in missing
                    ],
                    ignore_conflicts=True,
                )
            ConversationUserState.objects.filter(
                user_id=user_id, conversation_id__in=ids,
            ).update(notif_cleared_at=now, updated_at=now)
            try:
                from apps.takvim.domain.models import AppNotification

                str_ids = [str(cid) for cid in ids]
                url_q = Q()
                for cid in str_ids:
                    url_q |= Q(url__icontains=cid)
                AppNotification.objects.filter(
                    user_id=user_id, kurum_id__in=kurum_ids, is_read=False,
                ).filter(url_q).update(is_read=True, read_at=now)
            except Exception:
                pass

        if reset_counters:
            update_kwargs = {'unread_count_coach': 0, 'updated_at': now}
            Conversation.objects.filter(id__in=ids).update(**update_kwargs)
            if getattr(settings, 'COMMUNICATION_TICKET_ROUTING', True):
                Conversation.objects.filter(
                    id__in=ids,
                    status__in=[
                        ConversationStatus.NEW,
                        ConversationStatus.WAITING,
                        ConversationStatus.OPEN,
                    ],
                ).update(status=ConversationStatus.READ, updated_at=now)
        return len(ids)

    @staticmethod
    def clear_notifications_for_user(conversation: Conversation, user) -> None:
        """Sohbeti açan kişinin bildirimini kapatır; koç okunmamış sayacına dokunmaz."""
        if not getattr(user, 'pk', None):
            return
        state = ConversationRepository.user_state(conversation, user)
        state.notif_cleared_at = timezone.now()
        state.save(update_fields=['notif_cleared_at', 'updated_at'])
        ConversationRepository.mark_user_app_notifications(conversation, user)

    @staticmethod
    def mark_user_app_notifications(conversation: Conversation, user) -> None:
        if not getattr(user, 'pk', None):
            return
        try:
            from apps.takvim.infrastructure.repository import AppNotificationRepository

            AppNotificationRepository.mark_conversation_read_for_user(
                user_id=user.id,
                kurum_id=conversation.kurum_id,
                conversation_id=str(conversation.id),
            )
        except Exception:
            pass

    @staticmethod
    def exclude_cleared_notifications(qs, user):
        """Bu kullanıcının kapattığı (ve sonrası mesaj gelmeyen) sohbetleri çıkar."""
        from django.db.models import F, Q
        from django.db.models.functions import Coalesce
        from apps.communication.domain.models import ConversationUserState

        if not getattr(user, 'pk', None):
            return qs
        latest_inbound = Coalesce(
            F('conversation__last_customer_message_at'),
            F('conversation__last_message_at'),
        )
        cleared_ids = ConversationUserState.objects.filter(
            user=user,
            notif_cleared_at__isnull=False,
            conversation_id__in=qs.values('id'),
        ).filter(
            Q(notif_cleared_at__gte=latest_inbound)
            | Q(
                conversation__last_customer_message_at__isnull=True,
                conversation__last_message_at__isnull=True,
            ),
        ).values_list('conversation_id', flat=True)
        return qs.exclude(id__in=list(cleared_ids))

    @staticmethod
    def mark_read(conversation: Conversation) -> None:
        from django.conf import settings

        conversation.unread_count_coach = 0
        fields = ['unread_count_coach', 'updated_at']
        if getattr(settings, 'COMMUNICATION_TICKET_ROUTING', True):
            if conversation.status in (
                ConversationStatus.NEW,
                ConversationStatus.WAITING,
                ConversationStatus.OPEN,
            ):
                conversation.status = ConversationStatus.READ
                fields.append('status')
        conversation.save(update_fields=fields)

    @staticmethod
    def archive(conversation: Conversation) -> None:
        from apps.communication.application.conversation_events import log_conversation_event
        from apps.communication.domain.enums import ConversationEventType

        conversation.status = ConversationStatus.ARCHIVED
        conversation.archived_at = timezone.now()
        conversation.save(update_fields=['status', 'archived_at', 'updated_at'])
        log_conversation_event(conversation, ConversationEventType.ARCHIVED)

    @staticmethod
    def unarchive(conversation: Conversation) -> None:
        from apps.communication.application.conversation_events import log_conversation_event
        from apps.communication.domain.enums import ConversationEventType

        conversation.status = ConversationStatus.OPEN
        conversation.archived_at = None
        conversation.save(update_fields=['status', 'archived_at', 'updated_at'])
        log_conversation_event(conversation, ConversationEventType.UNARCHIVED)

    @staticmethod
    def mark_unread(conversation: Conversation) -> None:
        """Okundu işaretini geri al — kullanıcı sohbete dönmeyi hatırlasın."""
        if conversation.unread_count_coach < 1:
            conversation.unread_count_coach = 1
        fields = ['unread_count_coach', 'updated_at']
        if conversation.status == ConversationStatus.READ:
            conversation.status = ConversationStatus.NEW
            fields.append('status')
        conversation.save(update_fields=fields)

    @staticmethod
    def soft_delete(conversation: Conversation, actor=None) -> None:
        from apps.communication.application.conversation_events import log_conversation_event
        from apps.communication.domain.enums import ConversationEventType

        conversation.deleted_at = timezone.now()
        conversation.deleted_by = actor if getattr(actor, 'pk', None) else None
        conversation.status = ConversationStatus.CLOSED
        conversation.save(update_fields=['deleted_at', 'deleted_by', 'status', 'updated_at'])
        log_conversation_event(
            conversation, ConversationEventType.ARCHIVED, actor=actor, meta={'deleted': True},
        )

    @staticmethod
    def user_state(conversation, user):
        from apps.communication.domain.models import ConversationUserState

        state, _ = ConversationUserState.objects.get_or_create(
            conversation=conversation, user=user,
        )
        return state

    @staticmethod
    def pinned_conversation_ids(user, kurum_id: int) -> list:
        from apps.communication.domain.models import ConversationUserState

        if not getattr(user, 'pk', None):
            return []
        return list(
            ConversationUserState.objects.filter(
                user=user,
                pinned_at__isnull=False,
                conversation__kurum_id=kurum_id,
            ).values_list('conversation_id', flat=True)
        )

    @staticmethod
    def user_state_map(user, conversation_ids) -> dict:
        """{conversation_id: (pinned_at, muted_until)} — liste serileştirmesi için."""
        from apps.communication.domain.models import ConversationUserState

        if not getattr(user, 'pk', None) or not conversation_ids:
            return {}
        rows = ConversationUserState.objects.filter(
            user=user, conversation_id__in=conversation_ids,
        ).values_list('conversation_id', 'pinned_at', 'muted_until')
        return {str(cid): (pinned, muted) for cid, pinned, muted in rows}

    @staticmethod
    def unread_count_for_queryset(qs) -> int:
        from django.db.models import Sum

        result = qs.aggregate(total=Sum('unread_count_coach'))
        return int(result['total'] or 0)


class MessageRepository:
    @staticmethod
    def create(conversation, **kwargs) -> Message:
        return Message.objects.create(conversation=conversation, **kwargs)

    @staticmethod
    def get_by_provider_id(provider_message_id: str) -> Message | None:
        if not provider_message_id:
            return None
        return Message.objects.filter(provider_message_id=provider_message_id).first()

    THREAD_PREFETCH = (
        'attachments',
        'reactions',
        'reactions__reacted_by',
        'reply_to__attachments',
        'starred_by',
    )

    @staticmethod
    def visible(conversation_id):
        """Sohbetteki silinmemiş mesajlar."""
        return Message.objects.filter(
            conversation_id=conversation_id, deleted_at__isnull=True,
        )

    @staticmethod
    def list_by_conversation(conversation_id, *, limit: int = 50, before_id=None):
        qs = MessageRepository.visible(conversation_id).order_by('-created_at')
        if before_id:
            qs = qs.filter(created_at__lt=Message.objects.filter(id=before_id).values('created_at')[:1])
        return qs.select_related('reply_to', 'forwarded_from', 'sender_user').prefetch_related(
            *MessageRepository.THREAD_PREFETCH,
        )[:limit]

    @staticmethod
    def list_since(conversation_id, *, after_id, limit: int = 100):
        """`after_id` sonrası gelen mesajlar + durumu değişen eski mesajlar.

        Teslim/okundu gibi durum güncellemeleri de bu artımlı yanıtla taşınır;
        istemci ayrı bir "son 40 mesajı yeniden çek" isteği yapmaz (FE-01).
        """
        anchor = Message.objects.filter(id=after_id).values('created_at')[:1]
        # "Durumu değişti" = oluşturulduktan en az 1 sn sonra güncellendi; aksi halde
        # auto_now farkı yüzünden her mesaj (anchor dahil) her seferinde dönerdi.
        status_changed = Q(updated_at__gt=anchor) & Q(
            updated_at__gt=F('created_at') + timedelta(seconds=1),
        )
        qs = MessageRepository.visible(conversation_id).filter(
            Q(created_at__gt=anchor) | status_changed,
        ).order_by('created_at')
        return qs.select_related('reply_to', 'forwarded_from', 'sender_user').prefetch_related(
            *MessageRepository.THREAD_PREFETCH,
        )[:limit]

    @staticmethod
    def list_around(conversation_id, *, anchor_id, before: int = 25, after: int = 25):
        """Bir mesajın etrafındaki pencere — arama sonucuna atlarken kullanılır."""
        anchor_created = Message.objects.filter(id=anchor_id).values('created_at')[:1]
        older = list(
            MessageRepository.visible(conversation_id)
            .filter(created_at__lt=anchor_created)
            .order_by('-created_at')
            .select_related('reply_to', 'forwarded_from', 'sender_user')
            .prefetch_related(*MessageRepository.THREAD_PREFETCH)[:before]
        )
        newer_and_anchor = list(
            MessageRepository.visible(conversation_id)
            .filter(created_at__gte=anchor_created)
            .order_by('created_at')
            .select_related('reply_to', 'forwarded_from', 'sender_user')
            .prefetch_related(*MessageRepository.THREAD_PREFETCH)[: after + 1]
        )
        older.reverse()
        return older + newer_and_anchor

    @staticmethod
    def search_in_conversation(conversation_id, query: str, *, limit: int = 60):
        """Sohbet içi metin araması — eskiden yeniye sıralı eşleşmeler."""
        return list(
            MessageRepository.visible(conversation_id)
            .filter(body__icontains=query)
            .order_by('created_at')
            .values('id', 'body', 'direction', 'created_at')[:limit]
        )

    @staticmethod
    def count_by_conversation(conversation_id) -> int:
        return MessageRepository.visible(conversation_id).count()


class MessageStatusEventRepository:
    STATUS_MAP = {
        'sent': MessageStatus.SENT,
        'delivered': MessageStatus.DELIVERED,
        'read': MessageStatus.READ,
        'failed': MessageStatus.FAILED,
    }

    #: Teslimat durumunun sırası — geç gelen/sırası bozulan webhook geriye saramaz (H-01).
    STATUS_RANK = {
        MessageStatus.PENDING: 0,
        MessageStatus.SENDING: 1,
        MessageStatus.SENT: 2,
        MessageStatus.DELIVERED: 3,
        MessageStatus.READ: 4,
    }

    @classmethod
    def _should_apply(cls, current: str, incoming: str) -> bool:
        """READ'den sonra DELIVERED gelirse zaman damgası yazılır, statü değişmez.

        FAILED: teslim edilmiş/okunmuş mesaj "başarısız" olamaz; SENT ve
        öncesinden FAILED'a geçiş serbest. CANCELLED: kullanıcı iptali,
        webhook onu ezmez (mesaj gitmişse worker zaten SENT yazmıştır).
        """
        if current == MessageStatus.CANCELLED:
            return False
        if incoming == MessageStatus.FAILED:
            return current not in (MessageStatus.DELIVERED, MessageStatus.READ)
        if current == MessageStatus.FAILED:
            # Meta 'failed' sonra 'sent' göndermez; gönderirse gerçek durum SENT'tir
            return True
        return cls.STATUS_RANK.get(incoming, 0) > cls.STATUS_RANK.get(current, 0)

    @staticmethod
    def apply_status_update(
        message: Message,
        *,
        meta_status: str,
        provider_event_id: str,
        occurred_at,
        raw_payload: dict | None = None,
    ) -> tuple[MessageStatusEvent | None, bool]:
        """Durum günceller; (event, created) döner. Duplicate ise created=False."""
        status = MessageStatusEventRepository.STATUS_MAP.get(meta_status)
        if not status:
            return None, False

        event, created = MessageStatusEvent.objects.get_or_create(
            message=message,
            status=status,
            provider_event_id=provider_event_id or '',
            defaults={
                'occurred_at': occurred_at,
                'raw_payload': raw_payload or {},
            },
        )
        if not created:
            return event, False

        # Eşzamanlı webhook'lara karşı satırı kilitle ve güncel durumu oku
        with transaction.atomic():
            locked = Message.objects.select_for_update().get(pk=message.pk)
            update_fields = ['updated_at']
            # Zaman damgaları sıradan bağımsız yazılır (yalnız boşsa)
            if status == MessageStatus.SENT and not locked.sent_at:
                locked.sent_at = occurred_at
                update_fields.append('sent_at')
            elif status == MessageStatus.DELIVERED and not locked.delivered_at:
                locked.delivered_at = occurred_at
                update_fields.append('delivered_at')
            elif status == MessageStatus.READ and not locked.read_at:
                locked.read_at = occurred_at
                update_fields.append('read_at')

            applied = MessageStatusEventRepository._should_apply(locked.status, status)
            if applied:
                locked.status = status
                update_fields.append('status')
                if status == MessageStatus.FAILED:
                    errors = (raw_payload or {}).get('errors', [])
                    if errors:
                        from apps.communication.application.delivery_error import (
                            explain_from_webhook_errors,
                        )
                        locked.failed_reason = explain_from_webhook_errors(errors)
                        update_fields.append('failed_reason')
            locked.save(update_fields=update_fields)

        # Çağıranın elindeki örneği de güncel tut
        message.status = locked.status
        message.sent_at = locked.sent_at
        message.delivered_at = locked.delivered_at
        message.read_at = locked.read_at
        message.failed_reason = locked.failed_reason
        return event, applied


class OutboundQueueRepository:
    @staticmethod
    def enqueue(
        kurum_id: int,
        message: Message,
        next_attempt_at=None,
        campaign: OutboundCampaign | None = None,
        priority: int = 100,
        send_options: dict | None = None,
    ) -> OutboundQueueItem:
        options = send_options or {}
        if options.get('template_name'):
            message.send_options = options
            message.save(update_fields=['send_options', 'updated_at'])
        return OutboundQueueItem.objects.create(
            kurum_id=kurum_id,
            message=message,
            campaign=campaign,
            priority=priority,
            next_attempt_at=next_attempt_at or timezone.now(),
            send_options=options,
        )

    @staticmethod
    def _eligible_filter(now=None) -> Q:
        """
        İşlenebilir kuyruk kaydı koşulu.

        Kilit (`locked_at`) yalnızca işleyen süreç yaşadığı sürece geçerlidir.
        Deploy/restart ya da worker timeout gönderimi yarıda keserse kilit
        temizlenmez; bu kayıtlar `COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS`
        sonrasında yeniden alınabilir olmalı, aksi halde kalıcı olarak
        "Bekliyor"/"Gönderiliyor" durumunda kalırlar.
        """
        now = now or timezone.now()
        stale_before = now - timedelta(
            seconds=int(
                getattr(settings, 'COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS', 600) or 600,
            ),
        )
        unlocked = Q(locked_at__isnull=True)
        stale_locked = Q(locked_at__lt=stale_before)
        retryable = Q(message__status=MessageStatus.FAILED, attempt_count__lt=F('max_attempts'))
        return (
            Q(next_attempt_at__lte=now)
            & (
                ((unlocked | stale_locked) & (Q(message__status=MessageStatus.PENDING) | retryable))
                # Gönderim sırasında düşen süreç: kilit bayat ya da hiç yazılmamış
                | ((unlocked | stale_locked) & Q(message__status=MessageStatus.SENDING))
            )
        )

    @staticmethod
    def worker_token() -> str:
        """Bu süreç için kilit sahibi kimliği (host:pid:rastgele)."""
        import os
        import socket
        import uuid

        token = getattr(OutboundQueueRepository, '_worker_token', None)
        if token is None:
            token = f'{socket.gethostname()[:20]}:{os.getpid()}:{uuid.uuid4().hex[:8]}'
            OutboundQueueRepository._worker_token = token
        return token

    @staticmethod
    @transaction.atomic
    def get_pending_batch(limit: int = 20):
        """FOR UPDATE SKIP LOCKED ile seçilen batch aynı transaction'da kilitlenir.

        Kilit (`locked_at`/`locked_by`) seçimle birlikte yazılır; ikinci bir
        işleyici (cron, Celery, arka plan thread) aynı kayıtları alamaz (B-04).
        """
        rows = list(
            OutboundQueueItem.objects.filter(OutboundQueueRepository._eligible_filter())
            .select_for_update(skip_locked=True)
            .order_by('priority', 'next_attempt_at')
            .values_list('id', 'locked_by', 'locked_at')[:limit]
        )
        if not rows:
            return []
        ids = [r[0] for r in rows]
        previous = {r[0]: (r[1] or '', r[2]) for r in rows}
        OutboundQueueItem.objects.filter(id__in=ids).update(
            locked_at=timezone.now(),
            locked_by=OutboundQueueRepository.worker_token(),
            updated_at=timezone.now(),
        )
        items = list(
            OutboundQueueItem.objects.filter(id__in=ids).select_related(
                'message', 'message__conversation', 'campaign',
            )
        )
        token = OutboundQueueRepository.worker_token()
        for item in items:
            prev_by, prev_at = previous.get(item.id, ('', None))
            # Başka bir sürecin bayat kilidi devralındı mı? (belirsiz gönderim kontrolü için)
            item.reclaimed_from_other_worker = bool(prev_at is not None and prev_by != token)
        return items

    @staticmethod
    def sweep_cancelled_items(*, stale_seconds: int | None = None) -> int:
        """İptal edilmiş mesajların artık kilitsiz / bayat kilitli kuyruk kayıtlarını siler.

        İptal, worker'ın elindeki kaydı silmez (worker gönderim öncesi kontrol
        eder ve kendisi temizler). Worker düşmüşse kayıt burada temizlenir.
        """
        timeout = stale_seconds or int(
            getattr(settings, 'COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS', 600) or 600,
        )
        stale_before = timezone.now() - timedelta(seconds=timeout)
        deleted, _ = OutboundQueueItem.objects.filter(
            message__status=MessageStatus.CANCELLED,
        ).filter(Q(locked_at__isnull=True) | Q(locked_at__lt=stale_before)).delete()
        return deleted

    @staticmethod
    def count_pending() -> int:
        return OutboundQueueItem.objects.filter(
            OutboundQueueRepository._eligible_filter(),
        ).count()

    @staticmethod
    @transaction.atomic
    def lock_item(item: OutboundQueueItem) -> OutboundQueueItem:
        """Tekil işleme için kilit al / yenile.

        `get_pending_batch` kilidi bu süreç adına zaten yazdıysa yalnız zaman
        yenilenir. Başka bir sürecin bayat kilidi devralınıyorsa sonsuz döngüye
        girmesin diye deneme sayılır.
        """
        token = OutboundQueueRepository.worker_token()
        fields = ['locked_at', 'locked_by', 'updated_at']
        if item.locked_at is not None and (item.locked_by or '') != token:
            item.attempt_count = min(item.attempt_count + 1, item.max_attempts)
            fields.append('attempt_count')
        item.locked_at = timezone.now()
        item.locked_by = token
        item.save(update_fields=fields)
        return item

    @staticmethod
    def mark_sent(item: OutboundQueueItem, provider_message_id: str = '') -> None:
        from django.db import IntegrityError

        msg = item.message
        msg.status = MessageStatus.SENT
        msg.sent_at = timezone.now()
        msg.failed_reason = ''
        fields = ['status', 'sent_at', 'provider_message_id', 'failed_reason', 'updated_at']
        opts = item.send_options if isinstance(item.send_options, dict) else {}
        stored = msg.send_options if isinstance(getattr(msg, 'send_options', None), dict) else {}
        if opts.get('template_name') and not stored.get('template_name'):
            msg.send_options = opts
            fields.append('send_options')
        if provider_message_id:
            msg.provider_message_id = provider_message_id
        try:
            with transaction.atomic():
                msg.save(update_fields=fields)
        except IntegrityError:
            # Sağlayıcı aynı kimliği ikinci kez döndürdü (stub / mock / anomali):
            # mesaj yine gönderilmiş sayılır, kimlik boş kalır (comm_msg_provider_id_uniq).
            msg.provider_message_id = ''
            msg.save(update_fields=fields)
        # Kayıt bu arada (iptal vb.) silinmiş olabilir — hata üretmesin
        OutboundQueueItem.objects.filter(pk=item.pk).delete()

    @staticmethod
    def defer_item(item: OutboundQueueItem, error: str, *, seconds: int = 60) -> None:
        """Hız sınırı: deneme sayılmadan kilidi bırak, kısa süre sonra tekrar dene (W-06)."""
        item.last_error = error
        item.locked_at = None
        item.locked_by = ''
        item.provider_call_started_at = None
        item.next_attempt_at = timezone.now() + timedelta(seconds=seconds)
        OutboundQueueItem.objects.filter(pk=item.pk).update(
            last_error=item.last_error,
            locked_at=None,
            locked_by='',
            provider_call_started_at=None,
            next_attempt_at=item.next_attempt_at,
            updated_at=timezone.now(),
        )
        msg = item.message
        if msg.status != MessageStatus.PENDING:
            msg.status = MessageStatus.PENDING
            msg.save(update_fields=['status', 'updated_at'])

    @staticmethod
    def mark_failed(item: OutboundQueueItem, error: str, *, permanent: bool = False) -> None:
        """`permanent=True`: tekrar denemenin sonucu değiştirmeyeceği hatalar (örn. 24 saat kuralı)."""
        item.attempt_count = item.max_attempts if permanent else item.attempt_count + 1
        item.last_error = error
        item.locked_at = None
        item.locked_by = ''
        item.provider_call_started_at = None
        backoff_minutes = [1, 5, 15, 60, 60]
        idx = min(item.attempt_count - 1, len(backoff_minutes) - 1)
        item.next_attempt_at = timezone.now() + timedelta(minutes=backoff_minutes[idx])
        # Kayıt bu arada silinmişse (iptal) UPDATE 0 satır etkiler; hata üretmez (C-02)
        OutboundQueueItem.objects.filter(pk=item.pk).update(
            attempt_count=item.attempt_count,
            last_error=item.last_error,
            locked_at=None,
            locked_by='',
            provider_call_started_at=None,
            next_attempt_at=item.next_attempt_at,
            updated_at=timezone.now(),
        )
        msg = item.message
        if msg.status == MessageStatus.CANCELLED:
            return
        if item.attempt_count >= item.max_attempts:
            msg.status = MessageStatus.FAILED
            msg.failed_reason = error
        else:
            msg.status = MessageStatus.PENDING
            msg.failed_reason = error
        msg.save(update_fields=['status', 'failed_reason', 'updated_at'])

    @staticmethod
    def release_stale_sending_for_campaign(campaign_id) -> int:
        """Uzun süredir Gönderiliyor kalan kampanya mesajlarını çöz.

        Sağlayıcı kimliği yazılmışsa mesaj gitmiştir → SENT.
        Çağrı başlamış ama sonuç yoksa yeniden gönderme (çift mesaj) → başarısız.
        Çağrı hiç başlamamışsa kuyruğa geri al.
        """
        from apps.communication.application.outbound_processor import UNCERTAIN_SEND_ERROR

        timeout = int(getattr(settings, 'COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS', 600) or 600)
        stale_before = timezone.now() - timedelta(seconds=timeout)
        stuck = list(
            Message.objects.filter(
                campaign_id=campaign_id,
                direction=MessageDirection.OUTBOUND,
                status=MessageStatus.SENDING,
                updated_at__lt=stale_before,
            ).select_related('conversation')
        )
        if not stuck:
            return 0
        items = {
            item.message_id: item
            for item in OutboundQueueItem.objects.filter(message_id__in=[m.id for m in stuck])
        }
        changed = 0
        for msg in stuck:
            item = items.get(msg.id)
            if item is not None and item.locked_at and item.locked_at >= stale_before:
                continue
            if (msg.provider_message_id or '').strip():
                msg.status = MessageStatus.SENT
                if not msg.sent_at:
                    msg.sent_at = timezone.now()
                msg.save(update_fields=['status', 'sent_at', 'updated_at'])
                if item is not None:
                    OutboundQueueItem.objects.filter(pk=item.pk).delete()
                changed += 1
                continue
            if item is not None and item.provider_call_started_at:
                OutboundQueueRepository.mark_failed(item, UNCERTAIN_SEND_ERROR, permanent=True)
                changed += 1
                continue
            if item is not None:
                OutboundQueueItem.objects.filter(pk=item.pk).update(
                    locked_at=None,
                    locked_by='',
                    provider_call_started_at=None,
                    next_attempt_at=timezone.now(),
                    updated_at=timezone.now(),
                )
            elif msg.conversation_id:
                OutboundQueueRepository.enqueue(
                    msg.conversation.kurum_id,
                    msg,
                    campaign=OutboundCampaign.objects.filter(id=campaign_id).first(),
                )
            msg.status = MessageStatus.PENDING
            msg.failed_reason = ''
            msg.save(update_fields=['status', 'failed_reason', 'updated_at'])
            changed += 1
        return changed


class CommunicationLogRepository:
    @staticmethod
    def create_inbound(kurum_id, endpoint, http_status, request_body='', response_body='', error=''):
        CommunicationLog.objects.create(
            kurum_id=kurum_id if isinstance(kurum_id, int) else None,
            direction='INBOUND',
            endpoint=endpoint,
            http_status=http_status,
            request_body=request_body,
            response_body=response_body,
            error=error,
        )


class RawWebhookEventRepository:
    @staticmethod
    def create(**kwargs) -> RawWebhookEvent:
        provider_message_id = ''
        messages = kwargs.get('payload', {}).get('messages', [])
        if messages:
            provider_message_id = messages[0].get('id', '')
        statuses = kwargs.get('payload', {}).get('statuses', [])
        if statuses and not provider_message_id:
            provider_message_id = statuses[0].get('id', '')
        return RawWebhookEvent.objects.create(
            provider_message_id=provider_message_id,
            **kwargs,
        )

    @staticmethod
    def mark_processed(event: RawWebhookEvent, status: str, error: str = '') -> None:
        event.processing_status = status
        event.processing_error = error
        event.processed_at = timezone.now()
        event.save(update_fields=['processing_status', 'processing_error', 'processed_at'])


class OutboundCampaignRepository:
    @staticmethod
    def create_draft(kurum_id: int, created_by_id: int | None, data: dict) -> OutboundCampaign:
        return OutboundCampaign.objects.create(
            kurum_id=kurum_id,
            created_by_id=created_by_id,
            **data,
        )

    @staticmethod
    def get_by_id(kurum_id: int, campaign_id, *, sube_id: int | None = None) -> OutboundCampaign | None:
        qs = OutboundCampaign.objects.filter(
            kurum_id=kurum_id,
            id=campaign_id,
        )
        if sube_id is not None:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('created_by', 'sube', 'channel_config').first()

    @staticmethod
    def get_by_client_token(kurum_id: int, client_token: str) -> OutboundCampaign | None:
        if not client_token:
            return None
        return OutboundCampaign.objects.filter(
            kurum_id=kurum_id, client_token=client_token,
        ).select_related('created_by', 'sube', 'channel_config').first()

    @staticmethod
    def list_by_kurum_and_sube(kurum_id: int, sube_id: int):
        return OutboundCampaign.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
        ).select_related('created_by', 'sube', 'channel_config')

    @staticmethod
    def apply_list_filters(
        qs,
        *,
        status: str = '',
        date_from: str = '',
        date_to: str = '',
        channel_config_id: str = '',
        created_by: str = '',
        q: str = '',
    ):
        """Gönderim geçmişi filtreleri (H-09). Geçersiz değerler yok sayılır."""
        from datetime import date, datetime, time

        if status:
            statuses = [x.strip().upper() for x in status.split(',') if x.strip()]
            if statuses:
                qs = qs.filter(status__in=statuses)
        if date_from:
            try:
                d = date.fromisoformat(date_from[:10])
                qs = qs.filter(created_at__gte=timezone.make_aware(datetime.combine(d, time.min)))
            except ValueError:
                pass
        if date_to:
            try:
                d = date.fromisoformat(date_to[:10])
                qs = qs.filter(created_at__lte=timezone.make_aware(datetime.combine(d, time.max)))
            except ValueError:
                pass
        if channel_config_id:
            qs = qs.filter(channel_config_id=channel_config_id)
        if created_by:
            try:
                qs = qs.filter(created_by_id=int(created_by))
            except (TypeError, ValueError):
                pass
        if q:
            qs = qs.filter(title__icontains=q)
        return qs


class OutboundQueueRepositoryExtensions:
    """OutboundQueueRepository kampanya yardımcıları."""

    @staticmethod
    @transaction.atomic
    def cancel_pending_for_campaign(campaign: OutboundCampaign) -> int:
        """Bekleyen mesajları iptal eder.

        Kilitsiz kayıtlar hemen silinir. Worker'ın elindeki (kilitli) kayıtlar
        SİLİNMEZ: mesaj CANCELLED yapılır, kampanyaya `cancel_requested_at`
        damgalanır; worker gönderimden hemen önce bunu görür, göndermez ve
        kaydı kendisi temizler (C-02). Gönderim çoktan başladıysa mesaj
        gerçek durumunu (SENT) alır.
        """
        now = timezone.now()
        OutboundCampaign.objects.filter(pk=campaign.pk).update(cancel_requested_at=now, updated_at=now)
        campaign.cancel_requested_at = now
        items = OutboundQueueItem.objects.filter(
            campaign=campaign,
            message__status__in=[MessageStatus.PENDING, MessageStatus.SENDING],
        )
        message_ids = list(items.values_list('message_id', flat=True))
        if not message_ids:
            return 0
        # Önce kilitsiz kayıtları sil (mesaj durumu değişince filtre eşleşmez), sonra mesajları iptal et
        OutboundQueueItem.objects.filter(
            message_id__in=message_ids, locked_at__isnull=True,
        ).delete()
        Message.objects.filter(id__in=message_ids).update(
            status=MessageStatus.CANCELLED, updated_at=now,
        )
        return len(message_ids)

    @staticmethod
    @transaction.atomic
    def retry_failed_for_campaign(campaign: OutboundCampaign, message_ids=None) -> int:
        """Başarısız mesajları yeniden kuyruğa alır.

        Deneme hakkı bitmiş kayıtların kuyruk satırı silinmez; bu yüzden eski
        uygulama ("kuyruk kaydı varsa atla") hiçbir şeyi yeniden denemiyordu
        (H-03). Var olan satır sıfırlanır, yoksa yeni satır açılır.
        """
        now = timezone.now()
        failed_messages = Message.objects.filter(
            campaign=campaign,
            direction=MessageDirection.OUTBOUND,
            status=MessageStatus.FAILED,
        )
        if message_ids:
            failed_messages = failed_messages.filter(id__in=list(message_ids))
        failed_ids = list(failed_messages.values_list('id', flat=True))
        if not failed_ids:
            return 0
        existing = OutboundQueueItem.objects.filter(message_id__in=failed_ids)
        # Worker'ın o an tuttuğu (kilitli, bayat olmayan) kayıtlara dokunma
        stale_before = now - timedelta(
            seconds=int(getattr(settings, 'COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS', 600) or 600),
        )
        resettable = existing.filter(Q(locked_at__isnull=True) | Q(locked_at__lt=stale_before))
        reset_message_ids = list(resettable.values_list('message_id', flat=True))
        resettable.update(
            attempt_count=0,
            last_error='',
            locked_at=None,
            locked_by='',
            provider_call_started_at=None,
            next_attempt_at=now,
            updated_at=now,
        )
        with_item = set(existing.values_list('message_id', flat=True))
        missing_ids = [mid for mid in failed_ids if mid not in with_item]
        for msg in Message.objects.filter(id__in=missing_ids):
            OutboundQueueRepository.enqueue(
                kurum_id=campaign.kurum_id,
                message=msg,
                campaign=campaign,
                next_attempt_at=now,
            )
        touched = set(reset_message_ids) | set(missing_ids)
        Message.objects.filter(id__in=touched).update(
            status=MessageStatus.PENDING, failed_reason='', updated_at=now,
        )
        return len(touched)


# Bind extensions onto repository class
OutboundQueueRepository.cancel_pending_for_campaign = (
    OutboundQueueRepositoryExtensions.cancel_pending_for_campaign
)
OutboundQueueRepository.retry_failed_for_campaign = (
    OutboundQueueRepositoryExtensions.retry_failed_for_campaign
)
