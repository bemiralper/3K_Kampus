"""
Şablon kategorisi CRUD API.
"""
from django.core.exceptions import ValidationError

from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.interfaces.sube_context import assert_record_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationModulePermission, TemplateWritePermission


def _serialize_category(cat, *, template_count: int = 0) -> dict:
    return {
        'id': str(cat.id),
        'slug': cat.slug,
        'label': cat.label,
        'audience_scope': cat.audience_scope,
        'sort_order': cat.sort_order,
        'is_active': cat.is_active,
        'template_count': template_count,
        'created_at': cat.created_at.isoformat(),
        'updated_at': cat.updated_at.isoformat(),
    }


class TemplateCategoryListCreateView(CommunicationAPIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [CommunicationModulePermission()]
        return [TemplateWritePermission()]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        active_only = request.query_params.get('active_only', '').lower() in ('1', 'true', 'yes')
        all_scopes = request.query_params.get('all_scopes', '').lower() in ('1', 'true', 'yes')
        service = TemplateCategoryService()
        categories = service.list_categories(
            kurum_id,
            sube_id=sube_id,
            active_only=active_only,
            user=None if all_scopes else request.user,
        )

        from apps.communication.domain.models import MessageTemplate
        from django.db.models import Count

        counts = {
            row['category']: row['cnt']
            for row in MessageTemplate.objects.filter(
                kurum_id=kurum_id,
                sube_id=sube_id,
                is_active=True,
            ).values('category').annotate(cnt=Count('id'))
        }

        return Response({
            'categories': [
                _serialize_category(c, template_count=counts.get(c.slug, 0))
                for c in categories
            ],
            'total': categories.count(),
        })

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        label = request.data.get('label', '')
        audience_scope = request.data.get('audience_scope', 'genel')
        sort_order = request.data.get('sort_order')
        try:
            sort_order_val = int(sort_order) if sort_order is not None else None
        except (TypeError, ValueError):
            return Response({'error': 'sort_order geçersiz.'}, status=status.HTTP_400_BAD_REQUEST)

        service = TemplateCategoryService()
        try:
            category = service.create(
                kurum_id,
                sube_id=sube_id,
                label=label,
                audience_scope=audience_scope,
                sort_order=sort_order_val,
            )
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_serialize_category(category), status=status.HTTP_201_CREATED)


class TemplateCategoryDetailView(CommunicationAPIView):
    permission_classes = [TemplateWritePermission]

    def patch(self, request, category_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        service = TemplateCategoryService()
        category = service.get_category(kurum_id, category_id, sube_id=sube_id)
        if not category:
            return Response({'error': 'Kategori bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, category.sube_id)
        if gate:
            return gate

        label = request.data.get('label')
        audience_scope = request.data.get('audience_scope')
        sort_order = request.data.get('sort_order')
        is_active = request.data.get('is_active')
        try:
            sort_order_val = int(sort_order) if sort_order is not None else None
        except (TypeError, ValueError):
            return Response({'error': 'sort_order geçersiz.'}, status=status.HTTP_400_BAD_REQUEST)

        if is_active is not None and not isinstance(is_active, bool):
            is_active = str(is_active).lower() in ('1', 'true', 'yes')

        try:
            category = service.update(
                category,
                label=label,
                audience_scope=audience_scope,
                sort_order=sort_order_val,
                is_active=is_active,
            )
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_serialize_category(category))

    def delete(self, request, category_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        service = TemplateCategoryService()
        category = service.get_category(kurum_id, category_id, sube_id=sube_id)
        if not category:
            return Response({'error': 'Kategori bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, category.sube_id)
        if gate:
            return gate

        try:
            service.delete(category)
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_204_NO_CONTENT)
