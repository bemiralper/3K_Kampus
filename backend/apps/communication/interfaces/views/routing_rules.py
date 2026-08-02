"""Departman yönlendirme kuralları CRUD."""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response

from apps.communication.domain.enums import CommunicationDepartment
from apps.communication.domain.models import ConversationRoutingRule
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationConfigPermission
from shared.permissions import user_has_any_permission


def _serialize_rule(r: ConversationRoutingRule) -> dict:
    return {
        'id': str(r.id),
        'name': r.name,
        'department': r.department,
        'is_active': r.is_active,
        'priority': r.priority,
        'conditions': r.conditions or {},
        'actions': r.actions or {},
    }


class RoutingRuleListCreateView(CommunicationAPIView):
    permission_classes = [CommunicationConfigPermission]

    def get(self, request):
        kurum_id, _, err = resolve_kurum_and_sube(request)
        if err:
            return err
        rules = ConversationRoutingRule.objects.filter(kurum_id=kurum_id).order_by('priority', 'name')
        return Response({'rules': [_serialize_rule(r) for r in rules]})

    def post(self, request):
        kurum_id, _, err = resolve_kurum_and_sube(request)
        if err:
            return err
        if not user_has_any_permission(request.user, 'communication.config', 'communication.manage'):
            return Response({'error': 'Yetkiniz yok.'}, status=403)
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'name gerekli.'}, status=400)
        department = request.data.get('department') or CommunicationDepartment.COACHING
        valid_depts = {c[0] for c in CommunicationDepartment.choices}
        if department not in valid_depts:
            return Response({'error': 'Geçersiz departman.'}, status=400)
        try:
            priority = int(request.data.get('priority') or 100)
        except (TypeError, ValueError):
            return Response({'error': 'priority sayı olmalı.'}, status=400)
        conditions = request.data.get('conditions') or {}
        actions = request.data.get('actions') or {}
        if not isinstance(conditions, dict) or not isinstance(actions, dict):
            return Response({'error': 'conditions ve actions nesne olmalı.'}, status=400)
        rule = ConversationRoutingRule.objects.create(
            kurum_id=kurum_id,
            name=name,
            department=department,
            is_active=bool(request.data.get('is_active', True)),
            priority=priority,
            conditions=conditions,
            actions=actions,
        )
        return Response(_serialize_rule(rule), status=status.HTTP_201_CREATED)


class RoutingRuleDetailView(CommunicationAPIView):
    permission_classes = [CommunicationConfigPermission]

    def patch(self, request, rule_id):
        kurum_id, _, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            rule = ConversationRoutingRule.objects.get(kurum_id=kurum_id, pk=rule_id)
        except ConversationRoutingRule.DoesNotExist:
            return Response({'error': 'Kural bulunamadı.'}, status=404)
        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({'error': 'name gerekli.'}, status=400)
            rule.name = name
        if 'department' in request.data:
            department = request.data.get('department')
            valid_depts = {c[0] for c in CommunicationDepartment.choices}
            if department not in valid_depts:
                return Response({'error': 'Geçersiz departman.'}, status=400)
            rule.department = department
        if 'is_active' in request.data:
            rule.is_active = bool(request.data['is_active'])
        if 'priority' in request.data:
            try:
                rule.priority = int(request.data['priority'])
            except (TypeError, ValueError):
                return Response({'error': 'priority sayı olmalı.'}, status=400)
        if 'conditions' in request.data:
            if not isinstance(request.data['conditions'], dict):
                return Response({'error': 'conditions nesne olmalı.'}, status=400)
            rule.conditions = request.data['conditions']
        if 'actions' in request.data:
            if not isinstance(request.data['actions'], dict):
                return Response({'error': 'actions nesne olmalı.'}, status=400)
            rule.actions = request.data['actions']
        rule.save()
        return Response(_serialize_rule(rule))

    def delete(self, request, rule_id):
        kurum_id, _, err = resolve_kurum_and_sube(request)
        if err:
            return err
        deleted, _ = ConversationRoutingRule.objects.filter(kurum_id=kurum_id, pk=rule_id).delete()
        if not deleted:
            return Response({'error': 'Kural bulunamadı.'}, status=404)
        return Response({'ok': True})
