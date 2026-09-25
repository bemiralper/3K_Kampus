"""
Kampanya API — preview, create, confirm, list, detail, retry, cancel.
"""
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError

from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.campaign_service import CampaignService
from apps.communication.application.communication_service import CommunicationService
from apps.communication.interfaces.serializers.campaign import (
    CampaignCreateSerializer,
    CampaignDetailSerializer,
    CampaignListSerializer,
)
from apps.communication.interfaces.serializers.campaign import CampaignPreviewRequestSerializer
from apps.communication.interfaces.sube_context import assert_record_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube, resolve_kurum_id as _resolve_kurum_id
from apps.communication.infrastructure.repository import OutboundCampaignRepository
from apps.communication.permissions import (
    CommunicationBulkPermission,
    user_can_manage_campaign,
)
from apps.communication.domain.enums import MessageStatus
from apps.communication.domain.models import Message


def _deliveries_qs(campaign, *, status_filter: str = '', q: str = ''):
    qs = Message.objects.filter(campaign=campaign).select_related(
        'conversation',
        'conversation__veli',
        'conversation__veli__ogrenci',
        'conversation__ogrenci',
        'conversation__contact_identity',
        'conversation__contact_identity__veli',
        'conversation__contact_identity__ogrenci',
        'conversation__contact_identity__personel',
    )
    if status_filter:
        statuses = [x.strip().upper() for x in status_filter.split(',') if x.strip()]
        if statuses:
            qs = qs.filter(status__in=statuses)
    if q:
        from django.db.models import Q as _Q

        qs = qs.filter(
            _Q(conversation__contact_phone__icontains=q)
            | _Q(conversation__contact_name__icontains=q)
            | _Q(conversation__veli__ad__icontains=q)
            | _Q(conversation__veli__soyad__icontains=q)
            | _Q(conversation__ogrenci__ad__icontains=q)
            | _Q(conversation__ogrenci__soyad__icontains=q)
        )
    return qs.order_by(
        'conversation__ogrenci__ad',
        'conversation__ogrenci__soyad',
        'conversation__contact_type',
        'created_at',
    )


def _campaign_deliveries(campaign, *, limit=500, offset=0, status_filter: str = '', q: str = '',
                         include_skipped: bool = True):
    from apps.communication.application.conversation_display import (
        looks_like_phone,
        resolve_conversation_display_name,
    )
    from apps.communication.application.delivery_error import summarize_delivery_failure

    from apps.communication.domain.models import OutboundQueueItem

    rows = []
    qs = _deliveries_qs(campaign, status_filter=status_filter, q=q)[offset:offset + limit]
    msg_ids = [m.id for m in qs]
    queue_by_message = {
        item.message_id: item
        for item in OutboundQueueItem.objects.filter(message_id__in=msg_ids).only(
            'message_id', 'next_attempt_at', 'attempt_count', 'max_attempts', 'last_error',
        )
    }
    lookup_cache: dict = {}
    for msg in qs:
        conv = msg.conversation
        name = ''
        if conv:
            name = resolve_conversation_display_name(
                conv,
                allow_live_lookup=True,
                lookup_cache=lookup_cache,
            )
            if looks_like_phone(name, conv.contact_phone):
                name = ''
        raw_reason = (msg.failed_reason or '').strip()
        if msg.status == MessageStatus.FAILED:
            short_reason, full_reason = summarize_delivery_failure(raw_reason)
        else:
            short_reason, full_reason = '', ''
        item = queue_by_message.get(msg.id)
        student_name = ''
        ogrenci = getattr(conv, 'ogrenci', None) if conv else None
        if ogrenci is None and conv is not None and getattr(conv, 'veli', None) is not None:
            ogrenci = getattr(conv.veli, 'ogrenci', None)
        if ogrenci is not None:
            student_name = f'{getattr(ogrenci, "ad", "")} {getattr(ogrenci, "soyad", "")}'.strip()
        rows.append({
            'id': str(msg.id),
            'contact_name': name,
            'phone': (conv.contact_phone if conv else '') or '',
            'contact_type': (conv.contact_type if conv else '') or '',
            'ogrenci_id': getattr(ogrenci, 'id', None),
            'student_name': student_name,
            'status': msg.status,
            'failed_reason': full_reason,
            'failed_reason_short': short_reason if full_reason else '',
            'sent_at': msg.sent_at.isoformat() if msg.sent_at else None,
            'next_attempt_at': (
                item.next_attempt_at.isoformat()
                if item is not None and item.next_attempt_at
                else None
            ),
            'attempt_count': item.attempt_count if item is not None else 0,
            'queue_note': _queue_note(msg, item, raw_reason),
        })
    opts = campaign.send_options_json if isinstance(getattr(campaign, 'send_options_json', None), dict) else {}
    seen_names = {(row['contact_name'], row['phone']) for row in rows}
    if not include_skipped:
        return rows
    for index, skipped in enumerate(opts.get('skipped_recipients') or []):
        if not isinstance(skipped, dict):
            continue
        name = (skipped.get('contact_name') or '').strip()
        phone = (skipped.get('phone') or '').strip()
        student = (skipped.get('student_name') or '').strip()
        if student and student != name:
            name = f'{name} · {student}' if name else student
        key = (name, phone)
        if key in seen_names:
            continue
        seen_names.add(key)
        reason = (skipped.get('failed_reason') or '').strip()
        rows.append({
            'id': f'skip-{index}-{phone}-{name}'[:80],
            'contact_name': name,
            'phone': phone,
            'contact_type': skipped.get('contact_type') or '',
            'ogrenci_id': skipped.get('ogrenci_id'),
            'student_name': student,
            'status': skipped.get('status') or 'FAILED',
            'failed_reason': reason,
            'failed_reason_short': reason,
            'sent_at': None,
            'next_attempt_at': None,
            'attempt_count': 0,
            'queue_note': '',
        })
    return rows


def _queue_note(msg, item, raw_reason: str) -> str:
    """Bekleyen alıcı için 'neden gitmedi' açıklaması."""
    if msg.status not in (MessageStatus.PENDING, MessageStatus.SENDING):
        return ''
    if item is None:
        return 'Kuyruk kaydı yok — gönderimi yeniden başlatın.'
    if item.attempt_count:
        detail = (raw_reason or item.last_error or '').strip()
        base = f'{item.attempt_count}/{item.max_attempts} deneme yapıldı, tekrar denenecek.'
        return f'{base} {detail}'.strip() if detail else base
    return 'Kuyrukta, sırası bekleniyor.'


class CampaignBulkView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]


def _manage_gate(request, campaign):
    """Onay / iptal / yeniden deneme: kampanyayı açan kişi veya iletişim yöneticisi."""
    if user_can_manage_campaign(request.user, campaign):
        return None
    return Response(
        {'error': 'Bu kampanya üzerinde işlem yapma yetkiniz yok (yalnız oluşturan veya yönetici).'},
        status=status.HTTP_403_FORBIDDEN,
    )


class CampaignPreviewView(CampaignBulkView):
    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = CampaignPreviewRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipient_filter = serializer.validated_data.get('recipient_filter') or {}
        if sube_id and not recipient_filter.get('sube_id'):
            recipient_filter = {**recipient_filter, 'sube_id': sube_id}

        preview = CommunicationService().preview_campaign(
            kurum_id,
            recipient_filter,
            user=request.user,
            attachment_count=serializer.validated_data.get('attachment_count', 0),
            ai_used=serializer.validated_data.get('ai_used', False),
        )
        include_recipients = request.query_params.get('include_recipients') in ('1', 'true', 'yes')
        if include_recipients or request.data.get('include_recipients'):
            resolved = CampaignService().resolve_recipients(
                kurum_id, recipient_filter, user=request.user,
            )
            preview = {**preview, **resolved}
            # sayfalama
            page = int(request.data.get('page') or request.query_params.get('page') or 1)
            page_size = min(100, max(1, int(request.data.get('page_size') or 25)))
            recipients = preview.get('recipients') or []
            start = (page - 1) * page_size
            preview['recipients'] = recipients[start:start + page_size]
            preview['page'] = page
            preview['page_size'] = page_size
            preview['recipients_total'] = len(recipients)
        return Response(preview)


def _int_q(request, name, default, lo, hi):
    try:
        return max(lo, min(hi, int(request.query_params.get(name) or default)))
    except (TypeError, ValueError):
        return default


class CampaignListCreateView(CampaignBulkView):
    """Gönderim geçmişi.

    Sayfalama: `limit` (varsayılan 30, en çok 100) + `offset`. Filtreler:
    `status` (virgülle çoklu), `date_from`, `date_to` (ISO tarih), `channel_config_id`,
    `created_by` (kullanıcı id), `q` (başlık). Eski istemciler `limit` vermezse de
    tam liste değil ilk 100 satır döner (H-09).
    """

    MAX_LIMIT = 100
    DEFAULT_LIMIT = 30

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        from apps.communication.application.campaign_service import CampaignStatsService

        qs = OutboundCampaignRepository.list_by_kurum_and_sube(kurum_id, sube_id)
        qs = OutboundCampaignRepository.apply_list_filters(
            qs,
            status=request.query_params.get('status') or '',
            date_from=request.query_params.get('date_from') or '',
            date_to=request.query_params.get('date_to') or '',
            channel_config_id=request.query_params.get('channel_config_id') or '',
            created_by=request.query_params.get('created_by') or '',
            q=request.query_params.get('q') or '',
        )
        total = qs.count()
        limit = _int_q(request, 'limit', self.MAX_LIMIT if not request.query_params.get('limit') else self.DEFAULT_LIMIT, 1, self.MAX_LIMIT)
        offset = _int_q(request, 'offset', 0, 0, 10_000_000)
        rows = list(qs.order_by('-created_at')[offset:offset + limit])
        # Aktif kampanyalarda ertelenmiş sayaç yenilemesini tamamla
        for c in rows:
            if c.status in ('QUEUED', 'PROCESSING'):
                CampaignStatsService.refresh_if_dirty(c.id)
        data = CampaignListSerializer(rows, many=True).data
        for row, c in zip(data, rows):
            row['can_manage'] = user_can_manage_campaign(request.user, c)
        return Response({
            'campaigns': data,
            'total': total,
            'limit': limit,
            'offset': offset,
            'has_more': offset + len(rows) < total,
        })

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = CampaignCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client_token = (serializer.validated_data.get('client_token') or '').strip()[:64]
        if client_token:
            existing = OutboundCampaignRepository.get_by_client_token(kurum_id, client_token)
            if existing is not None:
                # Aynı gönderim denemesinin tekrarı: mevcut kampanyayı döndür, yeni açma
                data = CampaignDetailSerializer(existing).data
                data['idempotent_replay'] = True
                return Response(data, status=status.HTTP_200_OK)

        service = CampaignService()
        try:
            campaign = service.create_draft(
                kurum_id,
                sube_id=sube_id,
                created_by_id=request.user.id if request.user.is_authenticated else None,
                client_token=client_token,
                title=serializer.validated_data.get('title', ''),
                body=serializer.validated_data.get('body', ''),
                template_name=serializer.validated_data.get('template_name', ''),
                template_language=serializer.validated_data.get('template_language', 'tr'),
                audience_filter=serializer.validated_data.get('audience_filter'),
                user=request.user,
                attachment_ids=serializer.validated_data.get('attachment_ids'),
                template_id=serializer.validated_data.get('template_id'),
                scheduled_at=serializer.validated_data.get('scheduled_at'),
                send_options=serializer.validated_data.get('send_options'),
                save_as_template=serializer.validated_data.get('save_as_template', False),
                template_category=serializer.validated_data.get('template_category', ''),
                channel_config_id=serializer.validated_data.get('channel_config_id'),
            )
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            # Yarış: aynı client_token ile eşzamanlı ikinci istek unique kısıta takıldı
            existing = OutboundCampaignRepository.get_by_client_token(kurum_id, client_token)
            if existing is None:
                raise
            data = CampaignDetailSerializer(existing).data
            data['idempotent_replay'] = True
            return Response(data, status=status.HTTP_200_OK)

        if serializer.validated_data.get('draft_only'):
            return Response(CampaignDetailSerializer(campaign).data, status=status.HTTP_201_CREATED)

        if serializer.validated_data.get('scheduled_at'):
            return Response(CampaignDetailSerializer(campaign).data, status=status.HTTP_201_CREATED)

        try:
            campaign = service.confirm(
                campaign,
                sender_user_id=request.user.id if request.user.is_authenticated else None,
                enqueue_async=True,
            )
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CampaignDetailSerializer(campaign).data, status=status.HTTP_201_CREATED)


class CampaignDetailView(CampaignBulkView):
    def get(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate

        from apps.communication.application.campaign_service import CampaignStatsService
        from apps.communication.domain.enums import CampaignStatus

        if campaign.status in (
            CampaignStatus.QUEUED, CampaignStatus.PROCESSING, CampaignStatus.CONFIRMED,
        ):
            CampaignStatsService.refresh_campaign_stats(campaign.id)
            from apps.communication.application.celery_dispatch import (
                dispatch_process_outbound_queue,
            )
            dispatch_process_outbound_queue(drain=True, background=True)
        else:
            CampaignStatsService.refresh_if_dirty(campaign.id)
        campaign.refresh_from_db()
        data = CampaignDetailSerializer(campaign).data
        limit = _int_q(request, 'deliveries_limit', 50, 1, 500)
        opts = campaign.send_options_json if isinstance(campaign.send_options_json, dict) else {}
        skipped_n = len(opts.get('skipped_recipients') or [])
        archive = getattr(campaign, 'delivery_archive', None) if campaign.deliveries_archived_at else None
        if archive is not None and not Message.objects.filter(campaign=campaign).exists():
            rows = list(archive.rows or [])
            data['deliveries'] = rows[:limit]
            data['deliveries_total'] = len(rows)
            data['deliveries_archived'] = True
        else:
            data['deliveries'] = _campaign_deliveries(campaign, limit=limit)
            data['deliveries_total'] = Message.objects.filter(campaign=campaign).count() + skipped_n
            data['deliveries_archived'] = False
        data['deliveries_limit'] = limit
        data['materialize_error'] = opts.get('materialize_error') or ''
        data['can_manage'] = user_can_manage_campaign(request.user, campaign)
        return Response(data)


class CampaignDeliveriesView(CampaignBulkView):
    """Kampanya alıcı listesi — sayfalı ve filtreli (H-09).

    `limit` (≤200), `offset`, `status` (virgülle çoklu), `q` (ad/telefon).
    Atlanan alıcılar (`skipped_recipients`) yalnız ilk sayfada, filtre yokken eklenir.
    """

    def get(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate

        limit = _int_q(request, 'limit', 50, 1, 200)
        offset = _int_q(request, 'offset', 0, 0, 10_000_000)
        status_filter = (request.query_params.get('status') or '').strip()
        q = (request.query_params.get('q') or '').strip()

        archive = getattr(campaign, 'delivery_archive', None) if campaign.deliveries_archived_at else None
        if archive is not None and not Message.objects.filter(campaign=campaign).exists():
            rows = list(archive.rows or [])
            if status_filter:
                wanted = {x.strip().upper() for x in status_filter.split(',') if x.strip()}
                rows = [r for r in rows if (r.get('status') or '').upper() in wanted]
            if q:
                ql = q.lower()
                rows = [
                    r for r in rows
                    if ql in (r.get('contact_name') or '').lower() or ql in (r.get('phone') or '')
                ]
            return Response({
                'deliveries': rows[offset:offset + limit],
                'total': len(rows),
                'limit': limit,
                'offset': offset,
                'has_more': offset + limit < len(rows),
                'archived': True,
            })

        total = _deliveries_qs(campaign, status_filter=status_filter, q=q).count()
        rows = _campaign_deliveries(
            campaign, limit=limit, offset=offset, status_filter=status_filter, q=q,
            include_skipped=(offset == 0 and not status_filter and not q),
        )
        return Response({
            'deliveries': rows,
            'total': total,
            'limit': limit,
            'offset': offset,
            'has_more': offset + limit < total,
            'archived': False,
        })


class CampaignConfirmView(CampaignBulkView):
    def post(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate
        denied = _manage_gate(request, campaign)
        if denied:
            return denied

        service = CampaignService()
        try:
            campaign = service.confirm(
                campaign,
                sender_user_id=request.user.id if request.user.is_authenticated else None,
                enqueue_async=True,
            )
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CampaignDetailSerializer(campaign).data)


class CampaignRetryFailedView(CampaignBulkView):
    def post(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate
        denied = _manage_gate(request, campaign)
        if denied:
            return denied

        raw_ids = request.data.get('message_ids') or []
        if isinstance(raw_ids, str):
            raw_ids = [raw_ids]
        message_ids = [str(item) for item in raw_ids if item]

        service = CampaignService()
        try:
            result = service.retry_failed(campaign, message_ids=message_ids or None)
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        data = CampaignDetailSerializer(campaign).data
        data['retried_count'] = result['retried_count']
        return Response(data)


class CampaignProcessQueueView(CampaignBulkView):
    """
    Kampanyanın bekleyen mesajlarını hemen işlemeye başlar.

    Normalde `process_communication_queue` cron'u yapar; cron durmuşsa veya
    kullanıcı beklemek istemiyorsa bu uç kuyruğu elle tetikler.
    """

    def post(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate
        denied = _manage_gate(request, campaign)
        if denied:
            return denied

        from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue
        from apps.communication.domain.enums import CampaignStatus
        from apps.communication.domain.models import Message

        # Onaylandı ama alıcıları hiç üretilmemiş kampanya (materialize thread'i düşmüş)
        if (
            campaign.status in (CampaignStatus.DRAFT, CampaignStatus.CONFIRMED)
            and not Message.objects.filter(campaign=campaign).exists()
        ):
            try:
                campaign = CampaignService().confirm(
                    campaign,
                    sender_user_id=request.user.id if request.user.is_authenticated else None,
                )
            except ValidationError as exc:
                return Response(
                    {'error': str(exc.message if hasattr(exc, 'message') else exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            dispatch_process_outbound_queue(drain=True, background=True)

        campaign.refresh_from_db()
        return Response(CampaignDetailSerializer(campaign).data)


class CampaignCancelView(CampaignBulkView):
    def post(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate
        denied = _manage_gate(request, campaign)
        if denied:
            return denied

        service = CampaignService()
        try:
            campaign = service.cancel(campaign)
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CampaignDetailSerializer(campaign).data)
