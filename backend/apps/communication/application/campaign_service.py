"""
Toplu gönderim kampanyası — alıcı çözümleme ve yaşam döngüsü.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.coaching.services.coach_access import (
    get_coach_profile,
    is_resource_admin,
    scoped_student_ids,
)
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.enums import (
    CampaignStatus,
    Channel,
    MessageDirection,
    MessageStatus,
    MessageType,
    RecipientType,
)
from apps.communication.domain.models import OutboundCampaign
from apps.communication.infrastructure.repository import (
    ConversationRepository,
    MessageRepository,
    OutboundCampaignRepository,
    OutboundQueueRepository,
)
from shared.permissions import user_has_any_permission


OPT_IN_CATEGORY = 'duyuru'


@dataclass
class AudienceRecipient:
    e164: str
    recipient_type: str
    ogrenci_id: int | None = None
    veli_id: int | None = None
    display_name: str = ''
    raw_phone: str = ''


@dataclass
class AudiencePreview:
    total_recipients: int = 0
    ogrenci_count: int = 0
    veli_count: int = 0
    estimated_messages: int = 0
    invalid_phones: int = 0
    attachment_count: int = 0
    estimated_cost_usd: str = '0'
    ai_used: bool = False
    recipients: list[AudienceRecipient] = field(default_factory=list)

    def to_dict(self, *, include_recipients: bool = False) -> dict[str, Any]:
        data = {
            'total_recipients': self.total_recipients,
            'ogrenci_count': self.ogrenci_count,
            'veli_count': self.veli_count,
            'estimated_messages': self.estimated_messages,
            'invalid_phones': self.invalid_phones,
            'attachment_count': self.attachment_count,
            'estimated_cost_usd': self.estimated_cost_usd,
            'ai_used': self.ai_used,
        }
        if include_recipients:
            data['recipients'] = [
                {
                    'e164': r.e164,
                    'recipient_type': r.recipient_type,
                    'ogrenci_id': r.ogrenci_id,
                    'veli_id': r.veli_id,
                    'display_name': r.display_name,
                }
                for r in self.recipients
            ]
        return data


class AudienceResolver:
    """Filtre JSON → alıcı listesi."""

    @classmethod
    def resolve(
        cls,
        kurum_id: int,
        filter_json: dict | None,
        *,
        user=None,
        include_invalid: bool = False,
    ) -> AudiencePreview:
        filter_json = filter_json or {}
        audience_type = filter_json.get('audience_type', 'filtered')
        egitim_yili_id = filter_json.get('egitim_yili_id')

        allowed_student_ids = cls._scope_student_ids(user, kurum_id, filter_json)
        if allowed_student_ids is not None and not allowed_student_ids:
            return AudiencePreview()

        raw_entries: list[tuple[str, str, int | None, int | None, str]] = []

        if audience_type == 'all_veliler':
            raw_entries.extend(cls._collect_veliler(kurum_id, allowed_student_ids))
        elif audience_type == 'all_ogrenciler':
            raw_entries.extend(cls._collect_ogrenciler(kurum_id, allowed_student_ids))
        elif audience_type == 'sinif':
            sinif_id = filter_json.get('sinif_id')
            if sinif_id:
                raw_entries.extend(
                    cls._collect_by_sinif(kurum_id, int(sinif_id), egitim_yili_id, allowed_student_ids)
                )
        elif audience_type == 'sube':
            sube_id = filter_json.get('sube_id')
            if sube_id:
                raw_entries.extend(
                    cls._collect_by_sube(kurum_id, int(sube_id), allowed_student_ids)
                )
        elif audience_type == 'coach_students':
            coach_id = filter_json.get('coach_id') or cls._coach_id_from_user(user)
            if coach_id:
                raw_entries.extend(cls._collect_coach_students(kurum_id, int(coach_id)))
        elif audience_type == 'coach_parents':
            coach_id = filter_json.get('coach_id') or cls._coach_id_from_user(user)
            if coach_id:
                raw_entries.extend(cls._collect_coach_parents(kurum_id, int(coach_id)))
        elif audience_type == 'custom_ids':
            ogrenci_ids = filter_json.get('ogrenci_ids') or []
            veli_ids = filter_json.get('veli_ids') or []
            raw_entries.extend(cls._collect_custom_ids(kurum_id, ogrenci_ids, veli_ids, allowed_student_ids))
        else:
            # filtered — combine optional filters
            if filter_json.get('sinif_id'):
                raw_entries.extend(
                    cls._collect_by_sinif(
                        kurum_id,
                        int(filter_json['sinif_id']),
                        egitim_yili_id,
                        allowed_student_ids,
                    )
                )
            if filter_json.get('sube_id'):
                raw_entries.extend(
                    cls._collect_by_sube(kurum_id, int(filter_json['sube_id']), allowed_student_ids)
                )
            if filter_json.get('coach_id'):
                raw_entries.extend(cls._collect_coach_parents(kurum_id, int(filter_json['coach_id'])))
            ogrenci_ids = filter_json.get('ogrenci_ids') or []
            veli_ids = filter_json.get('veli_ids') or []
            if ogrenci_ids or veli_ids:
                raw_entries.extend(
                    cls._collect_custom_ids(kurum_id, ogrenci_ids, veli_ids, allowed_student_ids)
                )
            if not raw_entries and audience_type in ('filtered',):
                if filter_json.get('include_students'):
                    raw_entries.extend(cls._collect_ogrenciler(kurum_id, allowed_student_ids))
                if filter_json.get('include_veliler'):
                    raw_entries.extend(cls._collect_veliler(kurum_id, allowed_student_ids))

        return cls._dedupe_and_count(raw_entries, include_invalid=include_invalid)

    @classmethod
    def _scope_student_ids(cls, user, kurum_id: int, filter_json: dict):
        if not user or not user.is_authenticated:
            return None
        if is_resource_admin(user) or user_has_any_permission(
            user, 'communication.manage', 'communication.bulk'
        ):
            audience_type = filter_json.get('audience_type', '')
            if audience_type in ('coach_students', 'coach_parents'):
                coach_id = filter_json.get('coach_id') or cls._coach_id_from_user(user)
                if coach_id and not is_resource_admin(user):
                    return cls._student_ids_for_coach(int(coach_id))
            return None
        allowed = scoped_student_ids(user)
        return allowed

    @classmethod
    def _coach_id_from_user(cls, user) -> int | None:
        profile = get_coach_profile(user)
        return profile.id if profile else None

    @classmethod
    def _student_ids_for_coach(cls, coach_id: int) -> set[int]:
        from apps.coaching.models import CoachStudentAssignment

        return set(
            CoachStudentAssignment.objects.filter(
                coach_id=coach_id,
                end_date__isnull=True,
            ).values_list('student_id', flat=True)
        )

    @classmethod
    def _collect_veliler(cls, kurum_id: int, allowed_student_ids) -> list[tuple]:
        from apps.ogrenci.domain.models import OgrenciVeli

        qs = OgrenciVeli.objects.filter(
            ogrenci__kurum_id=kurum_id,
            ogrenci__aktif_mi=True,
        ).exclude(telefon='').select_related('ogrenci')
        if allowed_student_ids is not None:
            qs = qs.filter(ogrenci_id__in=allowed_student_ids)
        entries = []
        for veli in qs:
            if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                continue
            entries.append((
                veli.telefon,
                RecipientType.VELI,
                veli.ogrenci_id,
                veli.id,
                veli.tam_ad,
            ))
        return entries

    @classmethod
    def _collect_ogrenciler(cls, kurum_id: int, allowed_student_ids) -> list[tuple]:
        from apps.ogrenci.domain.models import Ogrenci

        qs = Ogrenci.objects.filter(kurum_id=kurum_id, aktif_mi=True).exclude(telefon='')
        if allowed_student_ids is not None:
            qs = qs.filter(id__in=allowed_student_ids)
        return [
            (o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad)
            for o in qs
        ]

    @classmethod
    def _collect_by_sinif(
        cls,
        kurum_id: int,
        sinif_id: int,
        egitim_yili_id,
        allowed_student_ids,
    ) -> list[tuple]:
        from apps.ogrenci.domain.models import OgrenciKayit, OgrenciVeli

        qs = OgrenciKayit.objects.filter(
            kurum_id=kurum_id,
            sinif_id=sinif_id,
            aktif_mi=True,
            ogrenci__aktif_mi=True,
        ).select_related('ogrenci')
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=int(egitim_yili_id))
        if allowed_student_ids is not None:
            qs = qs.filter(ogrenci_id__in=allowed_student_ids)

        entries: list[tuple] = []
        ogrenci_ids = list(qs.values_list('ogrenci_id', flat=True))
        for kayit in qs:
            o = kayit.ogrenci
            if o.telefon:
                entries.append((o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad))

        veli_qs = OgrenciVeli.objects.filter(
            ogrenci_id__in=ogrenci_ids,
        ).exclude(telefon='').select_related('ogrenci')
        for veli in veli_qs:
            if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                entries.append((
                    veli.telefon,
                    RecipientType.VELI,
                    veli.ogrenci_id,
                    veli.id,
                    veli.tam_ad,
                ))
        return entries

    @classmethod
    def _collect_by_sube(cls, kurum_id: int, sube_id: int, allowed_student_ids) -> list[tuple]:
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

        qs = Ogrenci.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            aktif_mi=True,
        ).exclude(telefon='')
        if allowed_student_ids is not None:
            qs = qs.filter(id__in=allowed_student_ids)
        entries = [
            (o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad)
            for o in qs
        ]
        ogrenci_ids = list(qs.values_list('id', flat=True))
        veli_qs = OgrenciVeli.objects.filter(ogrenci_id__in=ogrenci_ids).exclude(telefon='')
        for veli in veli_qs:
            if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                entries.append((
                    veli.telefon,
                    RecipientType.VELI,
                    veli.ogrenci_id,
                    veli.id,
                    veli.tam_ad,
                ))
        return entries

    @classmethod
    def _collect_coach_students(cls, kurum_id: int, coach_id: int) -> list[tuple]:
        student_ids = cls._student_ids_for_coach(coach_id)
        return cls._collect_ogrenciler(kurum_id, student_ids)

    @classmethod
    def _collect_coach_parents(cls, kurum_id: int, coach_id: int) -> list[tuple]:
        from apps.ogrenci.domain.models import OgrenciVeli

        student_ids = cls._student_ids_for_coach(coach_id)
        if not student_ids:
            return []
        veli_qs = OgrenciVeli.objects.filter(
            ogrenci_id__in=student_ids,
            ogrenci__kurum_id=kurum_id,
        ).exclude(telefon='')
        entries = []
        for veli in veli_qs:
            if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                entries.append((
                    veli.telefon,
                    RecipientType.VELI,
                    veli.ogrenci_id,
                    veli.id,
                    veli.tam_ad,
                ))
        return entries

    @classmethod
    def _collect_custom_ids(
        cls,
        kurum_id: int,
        ogrenci_ids: list,
        veli_ids: list,
        allowed_student_ids,
    ) -> list[tuple]:
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

        entries: list[tuple] = []
        if ogrenci_ids:
            qs = Ogrenci.objects.filter(
                kurum_id=kurum_id,
                id__in=ogrenci_ids,
                aktif_mi=True,
            ).exclude(telefon='')
            if allowed_student_ids is not None:
                qs = qs.filter(id__in=allowed_student_ids)
            for o in qs:
                entries.append((o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad))

        if veli_ids:
            veli_qs = OgrenciVeli.objects.filter(
                id__in=veli_ids,
                ogrenci__kurum_id=kurum_id,
            ).exclude(telefon='').select_related('ogrenci')
            if allowed_student_ids is not None:
                veli_qs = veli_qs.filter(ogrenci_id__in=allowed_student_ids)
            for veli in veli_qs:
                if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                    entries.append((
                        veli.telefon,
                        RecipientType.VELI,
                        veli.ogrenci_id,
                        veli.id,
                        veli.tam_ad,
                    ))
        return entries

    @classmethod
    def _dedupe_and_count(
        cls,
        raw_entries: list[tuple],
        *,
        include_invalid: bool = False,
    ) -> AudiencePreview:
        seen_e164: set[str] = set()
        recipients: list[AudienceRecipient] = []
        invalid = 0
        ogrenci_count = 0
        veli_count = 0

        for phone, rtype, ogrenci_id, veli_id, display_name in raw_entries:
            try:
                e164 = ContactResolver.normalize(phone)
            except (ValidationError, Exception):
                invalid += 1
                continue
            if e164 in seen_e164:
                continue
            seen_e164.add(e164)
            recipients.append(AudienceRecipient(
                e164=e164,
                recipient_type=rtype,
                ogrenci_id=ogrenci_id,
                veli_id=veli_id,
                display_name=display_name,
                raw_phone=phone,
            ))
            if rtype == RecipientType.OGRENCI:
                ogrenci_count += 1
            elif rtype == RecipientType.VELI:
                veli_count += 1

        preview = AudiencePreview(
            total_recipients=len(recipients),
            ogrenci_count=ogrenci_count,
            veli_count=veli_count,
            estimated_messages=len(recipients),
            invalid_phones=invalid,
            recipients=recipients if include_invalid else recipients,
        )
        return preview


class CampaignService:
    """Kampanya CRUD ve kuyruk üretimi."""

    def preview(
        self,
        kurum_id: int,
        filter_json: dict | None,
        *,
        user=None,
        attachment_count: int = 0,
        ai_used: bool = False,
    ) -> dict:
        from apps.communication.application.cost_estimator import estimate_campaign_cost

        preview = AudienceResolver.resolve(kurum_id, filter_json, user=user)
        preview.attachment_count = attachment_count
        preview.ai_used = ai_used
        cost = estimate_campaign_cost(preview.estimated_messages, attachment_count=attachment_count)
        preview.estimated_cost_usd = str(cost)
        return preview.to_dict()

    def resolve_recipients(
        self,
        kurum_id: int,
        filter_json: dict | None,
        *,
        user=None,
    ) -> dict:
        preview = AudienceResolver.resolve(kurum_id, filter_json, user=user, include_invalid=True)
        return preview.to_dict(include_recipients=True)

    def create_draft(
        self,
        kurum_id: int,
        *,
        created_by_id: int | None,
        sube_id: int | None = None,
        title: str = '',
        body: str = '',
        template_name: str = '',
        template_language: str = 'tr',
        template_components_json: list | None = None,
        audience_filter: dict | None = None,
        user=None,
        attachment_ids: list | None = None,
        template_id=None,
        scheduled_at=None,
        send_options: dict | None = None,
        save_as_template: bool = False,
        template_category: str = '',
    ) -> OutboundCampaign:
        from apps.communication.application.cost_estimator import estimate_campaign_cost
        from apps.communication.application.template_service import TemplateService
        from apps.communication.domain.models import CampaignAttachment, MessageTemplate

        audience_filter = audience_filter or {}
        if sube_id:
            audience_type = audience_filter.get('audience_type')
            if audience_type in ('all_veliler', 'all_ogrenciler'):
                audience_filter = {**audience_filter, 'sube_id': sube_id}
        if not body and not template_name and not template_id:
            raise ValidationError('Mesaj metni veya şablon adı zorunludur.')

        self._validate_audience_scope(kurum_id, audience_filter, user)

        attachment_ids = attachment_ids or []
        attachment_qs = CampaignAttachment.objects.filter(kurum_id=kurum_id, id__in=attachment_ids)
        if sube_id:
            attachment_qs = attachment_qs.filter(sube_id=sube_id)
        attachments = list(attachment_qs)
        if attachment_ids and len(attachments) != len(set(str(a) for a in attachment_ids)):
            raise ValidationError('Geçersiz ek dosya kimliği.')

        message_template = None
        if template_id:
            template_qs = MessageTemplate.objects.filter(
                kurum_id=kurum_id,
                id=template_id,
                is_active=True,
            )
            if sube_id:
                template_qs = template_qs.filter(sube_id=sube_id)
            message_template = template_qs.first()
            if not message_template:
                raise ValidationError('Şablon bulunamadı.')
            if not body:
                body = message_template.body

        preview_data = AudienceResolver.resolve(kurum_id, audience_filter, user=user)
        if preview_data.total_recipients == 0:
            raise ValidationError('Seçilen filtreye uygun alıcı bulunamadı.')

        if template_name:
            audience_filter = {
                **audience_filter,
                'template_name': template_name,
                'template_language': template_language or 'tr',
            }
            if template_components_json:
                audience_filter['template_components_json'] = template_components_json

        cost = estimate_campaign_cost(
            preview_data.estimated_messages,
            attachment_count=len(attachments),
        )

        send_options = send_options or {}
        if scheduled_at:
            send_options = {**send_options, 'scheduled': True}

        campaign = OutboundCampaignRepository.create_draft(
            kurum_id,
            created_by_id,
            {
                'sube_id': sube_id,
                'title': title or f'Toplu gönderim {timezone.now():%d.%m.%Y %H:%M}',
                'body_template': body or template_name,
                'recipient_filter_json': audience_filter,
                'preview_stats_json': {
                    **preview_data.to_dict(),
                    'attachment_count': len(attachments),
                    'estimated_cost_usd': str(cost),
                },
                'total_recipients': preview_data.total_recipients,
                'status': CampaignStatus.DRAFT,
                'template': message_template,
                'scheduled_at': scheduled_at,
                'send_options_json': send_options,
                'estimated_cost_usd': cost,
            },
        )

        if attachments:
            campaign.attachments.set(attachments)

        if save_as_template and body and user:
            TemplateService().create(
                kurum_id,
                sube_id=sube_id,
                user=user,
                name=title or f'Şablon {timezone.now():%d.%m.%Y}',
                body=body,
                category=template_category or 'ozel',
                attachment_ids_json=[str(a.id) for a in attachments],
            )

        if message_template:
            TemplateService().increment_usage(message_template)

        return campaign

    @transaction.atomic
    def confirm(self, campaign: OutboundCampaign, *, sender_user_id: int | None = None) -> OutboundCampaign:
        from apps.communication.application.variable_resolver import build_recipient_context, resolve_variables
        from apps.kurum.domain.models import Kurum

        if campaign.status != CampaignStatus.DRAFT:
            raise ValidationError('Sadece taslak kampanyalar onaylanabilir.')

        if campaign.scheduled_at and campaign.scheduled_at > timezone.now():
            campaign.status = CampaignStatus.CONFIRMED
            campaign.save(update_fields=['status', 'updated_at'])
            return campaign

        preview = AudienceResolver.resolve(
            campaign.kurum_id,
            campaign.recipient_filter_json,
        )
        if preview.total_recipients == 0:
            raise ValidationError('Alıcı listesi boş.')

        filter_json = campaign.recipient_filter_json or {}
        template_name = filter_json.get('template_name', '')
        message_type = MessageType.TEMPLATE if template_name else MessageType.TEXT
        body_template = campaign.body_template or template_name
        kurum = Kurum.objects.filter(id=campaign.kurum_id).first()
        campaign_attachments = list(campaign.attachments.all())

        campaign.status = CampaignStatus.CONFIRMED
        campaign.total_recipients = preview.total_recipients
        campaign.preview_stats_json = preview.to_dict()
        campaign.save(update_fields=[
            'status', 'total_recipients', 'preview_stats_json', 'updated_at',
        ])

        for recipient in preview.recipients:
            ogrenci = None
            veli = None
            if recipient.ogrenci_id:
                from apps.ogrenci.domain.models import Ogrenci

                ogrenci = Ogrenci.objects.select_related('sube').filter(id=recipient.ogrenci_id).first()
            if recipient.veli_id:
                from apps.ogrenci.domain.models import OgrenciVeli

                veli = OgrenciVeli.objects.filter(id=recipient.veli_id).first()

            sube_ad = ''
            if ogrenci and getattr(ogrenci, 'sube', None):
                sube_ad = getattr(ogrenci.sube, 'ad', '') or ''

            body = resolve_variables(
                body_template,
                build_recipient_context(
                    display_name=recipient.display_name,
                    recipient_type=recipient.recipient_type,
                    ogrenci=ogrenci,
                    veli=veli,
                    kurum=kurum,
                    sube_ad=sube_ad,
                ),
            )
            resolved = ContactResolver.resolve_contact(campaign.kurum_id, recipient.e164)
            conversation, _ = ConversationRepository.get_or_create_for_contact(
                kurum_id=campaign.kurum_id,
                channel=campaign.channel or Channel.WHATSAPP,
                contact_phone=recipient.e164,
                contact_type=recipient.recipient_type,
                contact_identity=resolved.identity,
                ogrenci_id=recipient.ogrenci_id or resolved.ogrenci_id,
                veli_id=recipient.veli_id or resolved.veli_id,
            )
            msg_type = message_type
            if campaign_attachments and not template_name:
                first = campaign_attachments[0]
                if (first.mime_type or '').startswith('image/'):
                    msg_type = MessageType.IMAGE
                else:
                    msg_type = MessageType.DOCUMENT

            message = MessageRepository.create(
                conversation=conversation,
                campaign=campaign,
                direction=MessageDirection.OUTBOUND,
                message_type=msg_type,
                body=body,
                status=MessageStatus.PENDING,
                sender_user_id=sender_user_id,
                source_module='campaign',
                source_ref_id=str(campaign.id),
            )

            if campaign_attachments:
                from apps.communication.domain.models import MessageAttachment

                for att in campaign_attachments:
                    MessageAttachment.objects.create(
                        message=message,
                        file=att.file,
                        original_name=att.original_name,
                        mime_type=att.mime_type,
                        file_size=att.file_size,
                        provider_media_id=att.provider_media_id or '',
                    )

            ConversationRepository.update_on_message(
                conversation,
                preview=body[:255],
                direction=MessageDirection.OUTBOUND,
            )
            OutboundQueueRepository.enqueue(
                kurum_id=campaign.kurum_id,
                message=message,
                campaign=campaign,
                next_attempt_at=timezone.now(),
            )

        campaign.status = CampaignStatus.QUEUED
        campaign.save(update_fields=['status', 'updated_at'])

        from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue

        dispatch_process_outbound_queue()

        return campaign

    @transaction.atomic
    def cancel(self, campaign: OutboundCampaign) -> OutboundCampaign:
        if campaign.status in (CampaignStatus.COMPLETED, CampaignStatus.CANCELLED):
            raise ValidationError('Bu kampanya iptal edilemez.')

        cancelled = OutboundQueueRepository.cancel_pending_for_campaign(campaign)
        campaign.status = CampaignStatus.CANCELLED
        campaign.save(update_fields=['status', 'updated_at'])
        campaign.refresh_from_db()
        return campaign

    @transaction.atomic
    def retry_failed(self, campaign: OutboundCampaign) -> dict:
        if campaign.status == CampaignStatus.CANCELLED:
            raise ValidationError('İptal edilmiş kampanya yeniden denenemez.')

        retried = OutboundQueueRepository.retry_failed_for_campaign(campaign)
        if retried:
            campaign.status = CampaignStatus.QUEUED
            campaign.save(update_fields=['status', 'updated_at'])
            from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue

            dispatch_process_outbound_queue()
        return {'retried_count': retried}

    def _validate_audience_scope(self, kurum_id: int, audience_filter: dict, user) -> None:
        from apps.communication.application.coach_scope import is_coach_bulk_user

        if not user or not user.is_authenticated:
            return
        if not is_coach_bulk_user(user):
            return

        allowed = scoped_student_ids(user)
        if allowed is None:
            return
        if not allowed:
            raise PermissionDenied('Toplu gönderim için yetkiniz yok.')

        audience_type = audience_filter.get('audience_type', '')
        if audience_type not in ('coach_students', 'coach_parents', 'custom_ids', 'filtered'):
            raise PermissionDenied('Koç yalnızca kendi öğrenci/veli kitlesine gönderebilir.')

        ogrenci_ids = audience_filter.get('ogrenci_ids') or []
        for oid in ogrenci_ids:
            if int(oid) not in allowed:
                raise PermissionDenied('Seçilen alıcılar koç kapsamının dışında.')

        veli_ids = audience_filter.get('veli_ids') or []
        if veli_ids:
            from apps.ogrenci.domain.models import OgrenciVeli

            for vid in veli_ids:
                veli = OgrenciVeli.objects.filter(id=vid, ogrenci__kurum_id=kurum_id).first()
                if veli and veli.ogrenci_id not in allowed:
                    raise PermissionDenied('Seçilen alıcılar koç kapsamının dışında.')


class CampaignStatsService:
    """Webhook durum güncellemelerinde kampanya sayaçları."""

    STATUS_COUNT_FIELD = {
        MessageStatus.SENT: 'sent_count',
        MessageStatus.DELIVERED: 'delivered_count',
        MessageStatus.READ: 'read_count',
        MessageStatus.FAILED: 'failed_count',
    }

    @classmethod
    def refresh_campaign_stats(cls, campaign_id) -> None:
        from apps.communication.domain.models import Message

        campaign = OutboundCampaign.objects.filter(id=campaign_id).first()
        if not campaign:
            return

        msgs = Message.objects.filter(campaign_id=campaign_id, direction=MessageDirection.OUTBOUND)
        sent = msgs.filter(status__in=[
            MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ,
        ]).count()
        delivered = msgs.filter(status__in=[MessageStatus.DELIVERED, MessageStatus.READ]).count()
        read = msgs.filter(status=MessageStatus.READ).count()
        failed = msgs.filter(status=MessageStatus.FAILED).count()
        pending = msgs.filter(status__in=[
            MessageStatus.PENDING, MessageStatus.SENDING,
        ]).count()
        cancelled = msgs.filter(status=MessageStatus.CANCELLED).count()

        campaign.sent_count = sent
        campaign.delivered_count = delivered
        campaign.read_count = read
        campaign.failed_count = failed
        campaign.save(update_fields=[
            'sent_count', 'delivered_count', 'read_count', 'failed_count', 'updated_at',
        ])

        cls._update_campaign_status(campaign, pending, failed, cancelled)
        cls._update_template_stats(campaign_id)

    @classmethod
    def _update_template_stats(cls, campaign_id) -> None:
        from apps.communication.domain.models import Message
        from apps.communication.application.template_service import TemplateService

        campaign = OutboundCampaign.objects.filter(id=campaign_id).select_related('template').first()
        if not campaign or not campaign.template_id:
            return

        msgs = Message.objects.filter(
            campaign_id=campaign_id,
            direction=MessageDirection.OUTBOUND,
        ).order_by('-updated_at')[:1]
        for msg in msgs:
            TemplateService.update_stats_on_message_status(msg, msg.status)

    @classmethod
    def _update_campaign_status(
        cls,
        campaign: OutboundCampaign,
        pending: int,
        failed: int,
        cancelled: int,
    ) -> None:
        if campaign.status == CampaignStatus.CANCELLED:
            return

        total = campaign.total_recipients or 0
        done = total - pending

        if pending > 0 and campaign.status in (CampaignStatus.QUEUED, CampaignStatus.CONFIRMED):
            campaign.status = CampaignStatus.PROCESSING
            campaign.save(update_fields=['status', 'updated_at'])
            return

        if pending > 0:
            return

        if done == 0:
            return

        if failed > 0 and (done - failed - cancelled) > 0:
            new_status = CampaignStatus.PARTIAL
        elif failed > 0:
            new_status = CampaignStatus.PARTIAL
        else:
            new_status = CampaignStatus.COMPLETED

        if campaign.status != new_status:
            campaign.status = new_status
            campaign.save(update_fields=['status', 'updated_at'])
