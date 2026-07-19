"""
Admin / müdür — koç risk bildirimleri listesi ve durum güncelleme.
"""
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.coaching.interfaces.sube_context import (
    assert_coaching_student_sube_access,
    mandatory_coaching_context,
)
from apps.coaching.models import CoachingEvent
from apps.coaching.services.coach_access import is_resource_admin
from apps.coaching.services.risk_notification import ADMIN_ROLE_CODES


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


def user_can_manage_risk_reports(user) -> bool:
    """Admin / müdür / yönetici rolleri — Risk Merkezi takibi."""
    if not user or not user.is_authenticated:
        return False
    if is_resource_admin(user) or user.is_superuser:
        return True
    try:
        return user.user_role.role.code in ADMIN_ROLE_CODES
    except Exception:
        return False


def _serialize_event(event: CoachingEvent) -> dict:
    student = event.student
    coach = event.coach
    coach_name = ''
    try:
        t = coach.teacher
        coach_name = f'{t.ad} {t.soyad}'.strip()
    except Exception:
        coach_name = str(coach) if coach else ''

    meta = event.metadata or {}
    return {
        'id': event.id,
        'student_id': student.id,
        'student_name': f'{student.ad} {student.soyad}'.strip(),
        'student_sube_id': student.sube_id,
        'coach_id': coach.id if coach else None,
        'coach_name': coach_name,
        'title': event.title,
        'description': event.description or '',
        'reason': meta.get('reason') or '',
        'notes': meta.get('notes') or '',
        'event_source': event.event_source or '',
        'status': event.status,
        'event_date': event.event_date.isoformat() if event.event_date else None,
        'created_at': event.created_at.isoformat() if getattr(event, 'created_at', None) else None,
        'meeting_draft_id': meta.get('meeting_draft_id') or event.reference_id,
    }


class CoachRiskReportListView(APIView):
    """
    GET /api/coaching/risk-reports/
    Admin/müdür: şubedeki RISK olayları (koç bildirimi + otomatik).
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not user_can_manage_risk_reports(request.user):
            return Response(
                {'success': False, 'error': 'Bu işlem için yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        qs = (
            CoachingEvent.objects.filter(
                event_type='RISK',
                student__kurum_id=ctx['kurum_id'],
                student__sube_id=ctx['sube_id'],
            )
            .select_related('student', 'coach', 'coach__teacher')
            .order_by('-event_date', '-id')
        )

        status_filter = (request.query_params.get('status') or '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)

        source = (request.query_params.get('source') or '').strip()
        if source == 'manual':
            qs = qs.filter(event_source='risk_report')
        elif source == 'auto':
            qs = qs.exclude(event_source='risk_report')

        limit = min(int(request.query_params.get('limit') or 100), 300)
        events = list(qs[:limit])

        pending = CoachingEvent.objects.filter(
            event_type='RISK',
            student__kurum_id=ctx['kurum_id'],
            student__sube_id=ctx['sube_id'],
            status='pending',
        ).count()

        return Response({
            'success': True,
            'data': [_serialize_event(e) for e in events],
            'count': len(events),
            'kpi': {
                'pending': pending,
                'shown': len(events),
            },
        })


class CoachRiskReportDetailView(APIView):
    """
    PATCH /api/coaching/risk-reports/{id}/
    Durum güncelle: pending | in_progress | completed | cancelled
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    ALLOWED_STATUS = {'pending', 'in_progress', 'completed', 'cancelled'}

    def patch(self, request, event_id):
        if not user_can_manage_risk_reports(request.user):
            return Response(
                {'success': False, 'error': 'Bu işlem için yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        try:
            event = CoachingEvent.objects.select_related('student').get(
                pk=event_id,
                event_type='RISK',
            )
        except CoachingEvent.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Risk kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        gate = assert_coaching_student_sube_access(
            request, event.student.kurum_id, event.student.sube_id,
        )
        if gate:
            return gate

        if event.student.kurum_id != ctx['kurum_id'] or event.student.sube_id != ctx['sube_id']:
            return Response(
                {'success': False, 'error': 'Kayıt bu şubeye ait değil.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_status = (request.data.get('status') or '').strip()
        if new_status not in self.ALLOWED_STATUS:
            return Response(
                {
                    'success': False,
                    'error': f'Geçersiz durum. İzin verilen: {", ".join(sorted(self.ALLOWED_STATUS))}',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        event.status = new_status
        meta = dict(event.metadata or {})
        meta['status_updated_by'] = request.user.id
        event.metadata = meta
        event.save(update_fields=['status', 'metadata', 'updated_at'])

        return Response({
            'success': True,
            'data': _serialize_event(event),
            'message': 'Risk durumu güncellendi.',
        })
