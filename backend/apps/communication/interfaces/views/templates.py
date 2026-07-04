"""
Mesaj şablonu CRUD API.
"""
from django.core.exceptions import PermissionDenied, ValidationError

from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.template_audience import visible_audience_scopes_for_user
from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.application.template_service import TemplateService
from apps.communication.interfaces.serializers.template import (
    MessageTemplateSerializer,
    MessageTemplateWriteSerializer,
)
from apps.communication.interfaces.sube_context import assert_record_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationModulePermission, TemplateWritePermission


class TemplateListCreateView(CommunicationAPIView):
    """Rol bazlı hazır yanıt şablonları — listeleme ve oluşturma."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [CommunicationModulePermission()]
        return [TemplateWritePermission()]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        category = request.query_params.get('category')
        audience_scope = request.query_params.get('audience_scope')
        service = TemplateService()
        templates = service.list_templates(
            kurum_id,
            sube_id=sube_id,
            category=category or None,
            audience_scope=audience_scope or None,
            user=request.user,
        )
        label_map = TemplateCategoryService().get_label_map(kurum_id, sube_id=sube_id)
        return Response({
            'templates': MessageTemplateSerializer(
                templates,
                many=True,
                context={'category_labels': label_map},
            ).data,
            'total': templates.count(),
        })

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = MessageTemplateWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = TemplateService()
        try:
            data = dict(serializer.validated_data)
            odev_role = (data.pop('odev_pdf_role', None) or '').strip() or None
            data.pop('is_active', None)
            template = service.create(
                kurum_id,
                sube_id=sube_id,
                user=request.user,
                **data,
            )
            if odev_role:
                from apps.communication.application.template_system_usage import (
                    activate_assignment_template_role,
                )
                activate_assignment_template_role(template, odev_role)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            MessageTemplateSerializer(
                template,
                context={'category_labels': TemplateCategoryService().get_label_map(kurum_id, sube_id=sube_id)},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class TemplateDetailView(CommunicationAPIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [CommunicationModulePermission()]
        return [TemplateWritePermission()]

    def get(self, request, template_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        template = TemplateService().get_template(kurum_id, template_id, sube_id=sube_id)
        if not template:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, template.sube_id)
        if gate:
            return gate

        return Response(
            MessageTemplateSerializer(
                template,
                context={'category_labels': TemplateCategoryService().get_label_map(template.kurum_id, sube_id=sube_id)},
            ).data,
        )

    def patch(self, request, template_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        template = TemplateService().get_template(kurum_id, template_id, sube_id=sube_id)
        if not template:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, template.sube_id)
        if gate:
            return gate

        serializer = MessageTemplateWriteSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            data = dict(serializer.validated_data)
            odev_role = (data.pop('odev_pdf_role', None) or '').strip() or None
            template = TemplateService().update(template, user=request.user, **data)
            if odev_role:
                from apps.communication.application.template_system_usage import (
                    activate_assignment_template_role,
                )
                activate_assignment_template_role(template, odev_role)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

        return Response(
            MessageTemplateSerializer(
                template,
                context={'category_labels': TemplateCategoryService().get_label_map(template.kurum_id, sube_id=sube_id)},
            ).data,
        )

    def delete(self, request, template_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        template = TemplateService().get_template(kurum_id, template_id, sube_id=sube_id)
        if not template:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, template.sube_id)
        if gate:
            return gate

        try:
            result = TemplateService().delete(template, user=request.user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'success': True,
            'reassigned': result.get('reassigned', []),
            'warning': result.get('warning', ''),
        })


class TemplateUseView(CommunicationAPIView):
    """Hazır yanıt kullanım sayacı (inbox)."""
    permission_classes = [CommunicationModulePermission]

    def post(self, request, template_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        template = TemplateService().get_template(kurum_id, template_id, sube_id=sube_id)
        if not template:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, template.sube_id)
        if gate:
            return gate

        scopes = visible_audience_scopes_for_user(request.user)
        if template.audience_scope not in scopes:
            return Response({'error': 'Bu şablona erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN)

        TemplateService().increment_usage(template)
        return Response({'ok': True, 'usage_count': template.usage_count + 1})


class TemplateStatsView(CommunicationAPIView):
    permission_classes = [CommunicationModulePermission]

    def get(self, request, template_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        template = TemplateService().get_template(kurum_id, template_id, sube_id=sube_id)
        if not template:
            return Response({'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, template.sube_id)
        if gate:
            return gate

        return Response({
            'template_id': str(template.id),
            'stats_sent': template.stats_sent,
            'stats_read': template.stats_read,
            'stats_failed': template.stats_failed,
            'avg_read_seconds': template.avg_read_seconds,
            'usage_count': template.usage_count,
        })
