"""
Yerel WhatsApp Meta şablon CRUD + submit/resync/refresh/resubmit.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

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
        qs = MetaTemplateService.list_templates(
            kurum_id,
            channel_config_id=request.query_params.get('account_id')
            or request.query_params.get('channel_config_id'),
            status=request.query_params.get('status') or None,
            meta_category=request.query_params.get('meta_category') or None,
            language=request.query_params.get('language') or None,
            search=request.query_params.get('search') or None,
            approved_only=request.query_params.get('approved_only') in ('1', 'true', 'True'),
            usage=request.query_params.get('usage') or None,
        )
        return Response({
            'templates': WhatsAppMetaTemplateSerializer(qs, many=True).data,
            'total': qs.count(),
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
                user=request.user,
            )
        except MetaTemplateServiceError as exc:
            return _err(exc)
        return Response(
            WhatsAppMetaTemplateSerializer(tpl).data,
            status=status.HTTP_201_CREATED,
        )


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
        # Kullanım alanı Meta'ya gitmeyen yerel bir alan; onaylı şablonda da değişebilir.
        if 'usage_scope' in request.data:
            MetaTemplateService.set_usage_scope(tpl, data.get('usage_scope'))
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
