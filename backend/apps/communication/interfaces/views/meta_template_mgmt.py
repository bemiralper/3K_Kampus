"""
Yerel WhatsApp Meta şablon CRUD + submit/resync/refresh/resubmit.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.application.academic_schedule_template_seed import (
    AcademicScheduleTemplateSeedService,
)
from apps.communication.application.kutuphane_yoklama_template_seed import (
    KutuphaneYoklamaTemplateSeedService,
)
from apps.communication.application.sinif_yoklama_template_seed import (
    SinifYoklamaTemplateSeedService,
)
from apps.communication.application.ozel_ders_template_seed import (
    OzelDersTemplateSeedService,
)
from apps.communication.application.kayit_sozlesme_template_seed import (
    KayitSozlesmeTemplateSeedService,
)
from apps.communication.application.campaign_duyuru_template_seed import (
    CampaignDuyuruTemplateSeedService,
)
from apps.communication.application.personal_chat_template_seed import (
    PersonalChatTemplateSeedService,
)
from apps.communication.application.meta_template_service import (
    MetaTemplateService,
    MetaTemplateServiceError,
)
from apps.communication.interfaces.serializers.meta_template import (
    WhatsAppMetaTemplateCloneSerializer,
    WhatsAppMetaTemplateSerializer,
    WhatsAppMetaTemplateWriteSerializer,
)
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationConfigPermission, CommunicationModulePermission


def _err(exc: MetaTemplateServiceError):
    return Response({'error': exc.message}, status=exc.status_code)


class MetaTemplateListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [CommunicationModulePermission()]
        return [CommunicationConfigPermission()]

    def get(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.query_params.get('account_id')
            or request.query_params.get('channel_config_id')
        )
        include_shared = request.query_params.get('include_shared_waba', '1') not in (
            '0', 'false', 'False', 'no',
        )
        dedupe = request.query_params.get('dedupe', '1') not in (
            '0', 'false', 'False', 'no',
        )
        qs = MetaTemplateService.list_templates(
            kurum_id,
            channel_config_id=account_id,
            status=request.query_params.get('status') or None,
            meta_category=request.query_params.get('meta_category') or None,
            language=request.query_params.get('language') or None,
            search=request.query_params.get('search') or None,
            approved_only=request.query_params.get('approved_only') in ('1', 'true', 'True'),
            usage=request.query_params.get('usage') or None,
            usage_exact=request.query_params.get('usage_exact') in ('1', 'true', 'True'),
            template_group=request.query_params.get('template_group') or None,
            include_shared_waba=include_shared,
            dedupe=dedupe,
        )
        shared_ids = (
            MetaTemplateService.shared_account_ids(kurum_id, account_id)
            if account_id else []
        )
        return Response({
            'templates': WhatsAppMetaTemplateSerializer(qs, many=True).data,
            'total': qs.count(),
            'shared_waba_account_ids': [str(i) for i in shared_ids],
            'shared_waba_account_count': len(shared_ids),
        })

    def post(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        ser = WhatsAppMetaTemplateWriteSerializer(data=request.data)
        if not ser.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': ser.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = ser.validated_data
        account_id = data.get('channel_config_id') or request.data.get('channel_config_id')
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            tpl = MetaTemplateService.create_draft(
                kurum_id,
                channel_config_id=account_id,
                name=data.get('name') or '',
                language=data.get('language') or 'tr',
                meta_category=data.get('meta_category'),
                body_named=data.get('body_named') or '',
                header_json=data.get('header_json') or {},
                footer_text=data.get('footer_text') or '',
                buttons_json=data.get('buttons_json') or [],
                usage_scope=data.get('usage_scope'),
                template_group=data.get('template_group') or '',
                user=request.user,
            )
        except MetaTemplateServiceError as exc:
            return _err(exc)

        pairing = None
        if data.get('also_create_app_template'):
            from django.core.exceptions import ValidationError

            from apps.communication.application.template_pairing_service import (
                PAIRING_INFO,
                TemplatePairingService,
            )
            from apps.communication.interfaces.serializers.template import (
                MessageTemplateSerializer,
            )

            try:
                app_tpl = TemplatePairingService.create_app_from_meta(
                    tpl,
                    sube_id=_sube_id,
                    user=request.user,
                    category=(data.get('app_template_category') or '').strip() or None,
                    audience_scope=(
                        data.get('app_template_audience_scope') or ''
                    ).strip() or None,
                    display_name=(data.get('app_template_name') or '').strip() or None,
                )
            except ValidationError as exc:
                return Response(
                    {
                        'error': (
                            f'Meta taslağı oluşturuldu ancak uygulama şablonu eklenemedi: {exc}'
                        ),
                        'template': WhatsAppMetaTemplateSerializer(tpl).data,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            pairing = {
                'app_template': MessageTemplateSerializer(app_tpl).data,
                'info': PAIRING_INFO,
            }

        payload = WhatsAppMetaTemplateSerializer(tpl).data
        if pairing:
            payload['pairing'] = pairing
            payload['info'] = pairing['info']
        else:
            from apps.communication.application.template_pairing_service import PAIRING_INFO
            payload['info'] = (
                f'{PAIRING_INFO} İsterseniz uygulama şablonları ekranından Meta karşılığı bağlayabilirsiniz.'
            )
        return Response(payload, status=status.HTTP_201_CREATED)


class MetaTemplateDetailView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [CommunicationModulePermission()]
        return [CommunicationConfigPermission()]

    def get(self, request, template_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(WhatsAppMetaTemplateSerializer(tpl).data)

    def patch(self, request, template_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        ser = WhatsAppMetaTemplateWriteSerializer(data=request.data, partial=True)
        if not ser.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': ser.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = ser.validated_data
        # Kullanım alanı / şablon grubu Meta'ya gitmeyen yerel alanlar; onaylıda da değişebilir.
        usage_touched = 'usage_scope' in request.data
        if usage_touched:
            try:
                MetaTemplateService.set_usage_scope(tpl, data.get('usage_scope'))
            except MetaTemplateServiceError as exc:
                return _err(exc)
            tpl.refresh_from_db()
        if 'template_group' in request.data:
            tpl = MetaTemplateService.set_template_group(tpl, data.get('template_group') or '')
        editable = {
            key: data.get(key)
            for key in (
                'name', 'language', 'meta_category', 'body_named',
                'header_json', 'footer_text', 'buttons_json',
            )
            if key in request.data
        }
        if not editable:
            return Response(WhatsAppMetaTemplateSerializer(tpl).data)
        try:
            tpl = MetaTemplateService.update_draft(tpl, **editable)
        except MetaTemplateServiceError as exc:
            return _err(exc)
        # update_draft full save sonrası usage_scope zaten nesnede; emin olmak için
        if usage_touched and data.get('usage_scope') and tpl.usage_scope != data.get('usage_scope'):
            tpl = MetaTemplateService.set_usage_scope(tpl, data.get('usage_scope'))
        return Response(WhatsAppMetaTemplateSerializer(tpl).data)

    def delete(self, request, template_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        delete_on_meta = request.query_params.get('delete_on_meta') in ('1', 'true', 'True')
        try:
            MetaTemplateService.delete_local(tpl, delete_on_meta=delete_on_meta)
        except MetaTemplateServiceError as exc:
            return _err(exc)
        return Response({'success': True})


class MetaTemplateSubmitView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request, template_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            tpl = MetaTemplateService.submit(tpl)
        except MetaTemplateServiceError as exc:
            return _err(exc)
        return Response(WhatsAppMetaTemplateSerializer(tpl).data)


class MetaTemplateResubmitView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request, template_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            tpl = MetaTemplateService.resubmit(tpl)
        except MetaTemplateServiceError as exc:
            return _err(exc)
        return Response(WhatsAppMetaTemplateSerializer(tpl).data)


class MetaTemplateRefreshStatusView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request, template_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            tpl = MetaTemplateService.refresh_status(tpl)
        except MetaTemplateServiceError as exc:
            return _err(exc)
        return Response(WhatsAppMetaTemplateSerializer(tpl).data)


class MetaTemplateCloneView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request, template_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        ser = WhatsAppMetaTemplateCloneSerializer(data=request.data)
        if not ser.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': ser.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            clone = MetaTemplateService.clone_as_draft(
                tpl,
                new_name=ser.validated_data['new_name'],
                user=request.user,
            )
        except MetaTemplateServiceError as exc:
            return _err(exc)
        return Response(
            WhatsAppMetaTemplateSerializer(clone).data,
            status=status.HTTP_201_CREATED,
        )


class MetaTemplateCreateAppView(APIView):
    """Mevcut Meta şablonundan uygulama şablonu oluştur (tekil)."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request, template_id):
        from django.core.exceptions import ValidationError

        from apps.communication.application.template_pairing_service import (
            PAIRING_INFO,
            TemplatePairingService,
        )
        from apps.communication.interfaces.serializers.template import (
            MessageTemplateSerializer,
        )

        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        tpl = MetaTemplateService.get(kurum_id, template_id)
        if not tpl:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            app = TemplatePairingService.create_app_from_meta(
                tpl,
                sube_id=sube_id,
                user=request.user,
                category=(request.data.get('category') or '').strip() or None,
                audience_scope=(request.data.get('audience_scope') or '').strip() or None,
                display_name=(request.data.get('name') or '').strip() or None,
            )
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                'success': True,
                'info': PAIRING_INFO,
                'app_template': MessageTemplateSerializer(app).data,
                'meta_template': WhatsAppMetaTemplateSerializer(tpl).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MetaTemplateImportAppBulkView(APIView):
    """Eşleşmeyen tüm Meta şablonlarını uygulama şablonlarına aktar."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        from apps.communication.application.template_pairing_service import (
            TemplatePairingService,
        )

        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        result = TemplatePairingService.import_unpaired_meta_templates(
            kurum_id,
            sube_id=sube_id,
            user=request.user,
            channel_config_id=(
                request.data.get('channel_config_id')
                or request.data.get('account_id')
            ),
            category=(request.data.get('category') or '').strip() or None,
            audience_scope=(request.data.get('audience_scope') or '').strip() or None,
        )
        return Response(result)


class MetaTemplateExampleMediaUploadView(APIView):
    """Template header örneği için Meta media upload — example_handle döner."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        import tempfile
        import os

        from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
        from apps.communication.infrastructure.repository import ChannelConfigRepository

        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = request.data.get('channel_config_id') or request.query_params.get('account_id')
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'file zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        account = None
        if account_id:
            account = ChannelConfigRepository.get_by_id(kurum_id, account_id)
        if account is None:
            account = ChannelConfigRepository.get_whatsapp_config(kurum_id)
        if not account:
            return Response({'error': 'WhatsApp hesabı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        mime = upload.content_type or 'application/octet-stream'
        suffix = os.path.splitext(upload.name or '')[1] or ''
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            for chunk in upload.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        try:
            client = WhatsAppCloudClient(channel_config=account)
            result = client.upload_template_media_handle(
                kurum_id,
                tmp_path,
                mime,
                file_name=upload.name or '',
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        if not result.get('success') or not result.get('handle'):
            return Response(
                {'error': result.get('error') or 'Medya yüklenemedi.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({
            'success': True,
            'example_handle': result['handle'],
            'mime_type': mime,
            'original_name': upload.name,
        })


class MetaTemplateSeedDuyuruView(APIView):
    """Kampanya CAMPAIGN taslaklarını (duyuru/hatırlatma/bilgilendirme) seçili hesaba ekler."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.data.get('channel_config_id')
            or request.data.get('account_id')
        )
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        force = bool(request.data.get('force'))
        try:
            result = CampaignDuyuruTemplateSeedService.seed(
                kurum_id,
                channel_config_id=account_id,
                user=request.user,
                skip_existing=not force,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MetaTemplateServiceError as exc:
            return _err(exc)

        status_code = (
            status.HTTP_400_BAD_REQUEST if result['errors'] else status.HTTP_200_OK
        )
        updated = result.get('updated_meta') or []
        return Response({
            'created_count': len(result['created_meta']),
            'updated_count': len(updated),
            'skipped_count': len(result['skipped_meta']),
            'created': result['created_meta'],
            'updated': updated,
            'skipped': result['skipped_meta'],
            'errors': result['errors'],
            'next_steps': result.get('next_steps') or [],
            'info': (
                f"{len(result['created_meta'])} taslak oluşturuldu, "
                f"{len(updated)} güncellendi, "
                f"{len(result['skipped_meta'])} atlandı."
            ),
        }, status=status_code)


class MetaTemplateSeedKutuphaneYoklamaView(APIView):
    """Kütüphane yoklama (gelmedi/geç/çıkış) Meta + LMS taslaklarını oluşturur ve bağlar."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.data.get('channel_config_id')
            or request.data.get('account_id')
        )
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur (Meta taslağı için).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        force = bool(request.data.get('force'))
        bind = request.data.get('bind', True)
        scope_sube = request.data.get('sube_id', sube_id)
        try:
            scope_sube_id = int(scope_sube) if scope_sube not in (None, '', 'null') else None
        except (TypeError, ValueError):
            scope_sube_id = sube_id
        try:
            result = KutuphaneYoklamaTemplateSeedService.seed(
                kurum_id,
                sube_id=scope_sube_id,
                channel_config_id=account_id,
                user=request.user,
                skip_existing=not force,
                bind=bool(bind),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MetaTemplateServiceError as exc:
            return _err(exc)

        status_code = (
            status.HTTP_400_BAD_REQUEST if result['errors'] else status.HTTP_200_OK
        )
        return Response({
            'created_app_count': len(result['created_app']),
            'updated_app_count': len(result.get('updated_app') or []),
            'skipped_app_count': len(result['skipped_app']),
            'created_meta_count': len(result['created_meta']),
            'updated_meta_count': len(result.get('updated_meta') or []),
            'skipped_meta_count': len(result['skipped_meta']),
            'bound_count': len(result.get('bound') or []),
            'created_app': result['created_app'],
            'updated_app': result.get('updated_app') or [],
            'skipped_app': result['skipped_app'],
            'created_meta': result['created_meta'],
            'updated_meta': result.get('updated_meta') or [],
            'skipped_meta': result['skipped_meta'],
            'bound': result.get('bound') or [],
            'errors': result['errors'],
            'next_steps': result.get('next_steps') or [],
            'event_keys': result.get('event_keys') or [],
            'info': (
                f"LMS +{len(result['created_app'])}/↻{len(result.get('updated_app') or [])}, "
                f"Meta +{len(result['created_meta'])}/↻{len(result.get('updated_meta') or [])}, "
                f"bağlandı {len(result.get('bound') or [])}."
            ),
        }, status=status_code)


class MetaTemplateSeedSinifYoklamaView(APIView):
    """Sınıf yoklama (gelmedi/geç) Meta + LMS taslaklarını oluşturur ve bağlar."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.data.get('channel_config_id')
            or request.data.get('account_id')
        )
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur (Meta taslağı için).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        force = bool(request.data.get('force'))
        bind = request.data.get('bind', True)
        scope_sube = request.data.get('sube_id', sube_id)
        try:
            scope_sube_id = int(scope_sube) if scope_sube not in (None, '', 'null') else None
        except (TypeError, ValueError):
            scope_sube_id = sube_id
        try:
            result = SinifYoklamaTemplateSeedService.seed(
                kurum_id,
                sube_id=scope_sube_id,
                channel_config_id=account_id,
                user=request.user,
                skip_existing=not force,
                bind=bool(bind),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MetaTemplateServiceError as exc:
            return _err(exc)

        status_code = (
            status.HTTP_400_BAD_REQUEST if result['errors'] else status.HTTP_200_OK
        )
        return Response({
            'created_app_count': len(result['created_app']),
            'updated_app_count': len(result.get('updated_app') or []),
            'skipped_app_count': len(result['skipped_app']),
            'created_meta_count': len(result['created_meta']),
            'updated_meta_count': len(result.get('updated_meta') or []),
            'skipped_meta_count': len(result['skipped_meta']),
            'bound_count': len(result.get('bound') or []),
            'created_app': result['created_app'],
            'updated_app': result.get('updated_app') or [],
            'skipped_app': result['skipped_app'],
            'created_meta': result['created_meta'],
            'updated_meta': result.get('updated_meta') or [],
            'skipped_meta': result['skipped_meta'],
            'bound': result.get('bound') or [],
            'errors': result['errors'],
            'next_steps': result.get('next_steps') or [],
            'event_keys': result.get('event_keys') or [],
            'info': (
                f"LMS +{len(result['created_app'])}/↻{len(result.get('updated_app') or [])}, "
                f"Meta +{len(result['created_meta'])}/↻{len(result.get('updated_meta') or [])}, "
                f"bağlandı {len(result.get('bound') or [])}."
            ),
        }, status=status_code)


class MetaTemplateSeedOzelDersView(APIView):
    """Özel ders yoklama/telafi Meta + LMS taslaklarını oluşturur ve bağlar."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.data.get('channel_config_id')
            or request.data.get('account_id')
        )
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur (Meta taslağı için).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        force = bool(request.data.get('force'))
        bind = request.data.get('bind', True)
        scope_sube = request.data.get('sube_id', sube_id)
        try:
            scope_sube_id = int(scope_sube) if scope_sube not in (None, '', 'null') else None
        except (TypeError, ValueError):
            scope_sube_id = sube_id
        try:
            result = OzelDersTemplateSeedService.seed(
                kurum_id,
                sube_id=scope_sube_id,
                channel_config_id=account_id,
                user=request.user,
                skip_existing=not force,
                bind=bool(bind),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MetaTemplateServiceError as exc:
            return _err(exc)

        status_code = (
            status.HTTP_400_BAD_REQUEST if result['errors'] else status.HTTP_200_OK
        )
        return Response({
            'created_app_count': len(result['created_app']),
            'updated_app_count': len(result.get('updated_app') or []),
            'skipped_app_count': len(result['skipped_app']),
            'created_meta_count': len(result['created_meta']),
            'updated_meta_count': len(result.get('updated_meta') or []),
            'skipped_meta_count': len(result['skipped_meta']),
            'bound_count': len(result.get('bound') or []),
            'created_app': result['created_app'],
            'updated_app': result.get('updated_app') or [],
            'skipped_app': result['skipped_app'],
            'created_meta': result['created_meta'],
            'updated_meta': result.get('updated_meta') or [],
            'skipped_meta': result['skipped_meta'],
            'bound': result.get('bound') or [],
            'errors': result['errors'],
            'next_steps': result.get('next_steps') or [],
            'event_keys': result.get('event_keys') or [],
            'info': (
                f"LMS +{len(result['created_app'])}/↻{len(result.get('updated_app') or [])}, "
                f"Meta +{len(result['created_meta'])}/↻{len(result.get('updated_meta') or [])}, "
                f"bağlandı {len(result.get('bound') or [])}."
            ),
        }, status=status_code)


class MetaTemplateSeedAcademicScheduleView(APIView):
    """Sınıf ders programı (veli/öğrenci) Meta + LMS taslaklarını oluşturur ve bağlar."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.data.get('channel_config_id')
            or request.data.get('account_id')
        )
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur (DOCUMENT Meta taslağı için).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        force = bool(request.data.get('force'))
        bind = request.data.get('bind', True)
        scope_sube = request.data.get('sube_id', sube_id)
        try:
            scope_sube_id = int(scope_sube) if scope_sube not in (None, '', 'null') else None
        except (TypeError, ValueError):
            scope_sube_id = sube_id
        try:
            result = AcademicScheduleTemplateSeedService.seed(
                kurum_id,
                sube_id=scope_sube_id,
                channel_config_id=account_id,
                user=request.user,
                skip_existing=not force,
                bind=bool(bind),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MetaTemplateServiceError as exc:
            return _err(exc)

        status_code = (
            status.HTTP_400_BAD_REQUEST if result['errors'] else status.HTTP_200_OK
        )
        return Response({
            'created_app_count': len(result['created_app']),
            'updated_app_count': len(result.get('updated_app') or []),
            'skipped_app_count': len(result['skipped_app']),
            'created_meta_count': len(result['created_meta']),
            'updated_meta_count': len(result.get('updated_meta') or []),
            'skipped_meta_count': len(result['skipped_meta']),
            'bound_count': len(result.get('bound') or []),
            'created_app': result['created_app'],
            'updated_app': result.get('updated_app') or [],
            'skipped_app': result['skipped_app'],
            'created_meta': result['created_meta'],
            'updated_meta': result.get('updated_meta') or [],
            'skipped_meta': result['skipped_meta'],
            'bound': result.get('bound') or [],
            'errors': result['errors'],
            'next_steps': result.get('next_steps') or [],
            'event_keys': result.get('event_keys') or [],
            'info': (
                f"LMS +{len(result['created_app'])}/↻{len(result.get('updated_app') or [])}, "
                f"Meta +{len(result['created_meta'])}/↻{len(result.get('updated_meta') or [])}, "
                f"bağlandı {len(result.get('bound') or [])}."
            ),
        }, status=status_code)


class MetaTemplateSeedKayitSozlesmeView(APIView):
    """Yeni kayıt sözleşmesi (yönetici) Meta + LMS taslaklarını oluşturur ve bağlar."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.data.get('channel_config_id')
            or request.data.get('account_id')
        )
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        force = bool(request.data.get('force'))
        bind = request.data.get('bind', True)
        scope_sube = request.data.get('sube_id', sube_id)
        try:
            scope_sube_id = int(scope_sube) if scope_sube not in (None, '', 'null') else None
        except (TypeError, ValueError):
            scope_sube_id = sube_id
        try:
            result = KayitSozlesmeTemplateSeedService.seed(
                kurum_id,
                sube_id=scope_sube_id,
                channel_config_id=account_id,
                user=request.user,
                skip_existing=not force,
                bind=bool(bind),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MetaTemplateServiceError as exc:
            return _err(exc)

        status_code = (
            status.HTTP_400_BAD_REQUEST if result['errors'] else status.HTTP_200_OK
        )
        return Response({
            'created_app_count': len(result['created_app']),
            'updated_app_count': len(result.get('updated_app') or []),
            'skipped_app_count': len(result['skipped_app']),
            'created_meta_count': len(result['created_meta']),
            'updated_meta_count': len(result.get('updated_meta') or []),
            'skipped_meta_count': len(result['skipped_meta']),
            'bound_count': len(result.get('bound') or []),
            'created_app': result['created_app'],
            'updated_app': result.get('updated_app') or [],
            'skipped_app': result['skipped_app'],
            'created_meta': result['created_meta'],
            'updated_meta': result.get('updated_meta') or [],
            'skipped_meta': result['skipped_meta'],
            'bound': result.get('bound') or [],
            'errors': result['errors'],
            'next_steps': result.get('next_steps') or [],
            'event_keys': result.get('event_keys') or [],
            'info': (
                f"LMS +{len(result['created_app'])}/↻{len(result.get('updated_app') or [])}, "
                f"Meta +{len(result['created_meta'])}/↻{len(result.get('updated_meta') or [])}, "
                f"bağlandı {len(result.get('bound') or [])}."
            ),
        }, status=status_code)


class MetaTemplateSeedPersonalChatView(APIView):
    """Personel sohbet açılış PERSONAL taslaklarını (veli/öğrenci) seçili hesaba ekler."""

    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = (
            request.data.get('channel_config_id')
            or request.data.get('account_id')
        )
        if not account_id:
            return Response(
                {'error': 'channel_config_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        force = bool(request.data.get('force'))
        try:
            result = PersonalChatTemplateSeedService.seed(
                kurum_id,
                channel_config_id=account_id,
                user=request.user,
                skip_existing=not force,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MetaTemplateServiceError as exc:
            return _err(exc)

        status_code = (
            status.HTTP_400_BAD_REQUEST if result['errors'] else status.HTTP_200_OK
        )
        updated = result.get('updated_meta') or []
        return Response({
            'created_count': len(result['created_meta']),
            'updated_count': len(updated),
            'skipped_count': len(result['skipped_meta']),
            'created': result['created_meta'],
            'updated': updated,
            'skipped': result['skipped_meta'],
            'errors': result['errors'],
            'department': result.get('department') or '',
            'next_steps': result.get('next_steps') or [],
            'info': (
                f"{len(result['created_meta'])} sohbet taslağı oluşturuldu, "
                f"{len(updated)} güncellendi, "
                f"{len(result['skipped_meta'])} atlandı "
                f"(dept={result.get('department') or '—'})."
            ),
        }, status=status_code)
