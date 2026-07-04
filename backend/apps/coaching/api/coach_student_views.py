"""
Koç portalı — öğrenci listesi ve profil BFF API.
"""
from datetime import date

from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.coaching.models import CoachStudentAssignment, CoachingEvent, GorusmeKaydi
from apps.coaching.services.coach_access import (
    get_coach_profile,
    user_can_access_student,
)
from apps.coaching.services.coach_student_service import (
    build_coach_student_list,
    build_coach_student_profile,
)
from apps.coaching.interfaces.sube_context import (
    assert_coaching_student_sube_access,
    mandatory_coaching_context,
)
from apps.ogrenci.domain.models import Ogrenci
from shared.context import get_secili_kurum_id


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


class CoachStudentListView(APIView):
    """
    GET /api/coaching/students/
    Koç kapsamındaki öğrenci listesi.
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        data = build_coach_student_list(request.user, request, sube_id=ctx['sube_id'])
        return Response({
            'success': True,
            'data': data,
            'count': len(data),
        })


class CoachStudentProfileView(APIView):
    """
    GET /api/coaching/students/{id}/profile/
    Tek öğrenci için birleşik profil (BFF).
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        try:
            student = Ogrenci.objects.get(pk=student_id)
        except Ogrenci.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Öğrenci bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
        if gate:
            return gate

        if not user_can_access_student(request.user, student_id):
            return Response(
                {'success': False, 'error': 'Bu öğrenciye erişim yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        profile = build_coach_student_profile(request.user, request, student_id)
        if profile is None:
            return Response(
                {'success': False, 'error': 'Öğrenci bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({'success': True, 'data': profile})


def _resolve_coach_for_risk_report(user, student_id):
    """Risk bildirimi için koç profili — oturum koçu veya birincil atama."""
    coach_profile = get_coach_profile(user)
    if coach_profile:
        return coach_profile
    assignment = (
        CoachStudentAssignment.objects.filter(
            student_id=student_id,
            end_date__isnull=True,
        )
        .order_by('-is_primary', '-start_date')
        .select_related('coach')
        .first()
    )
    return assignment.coach if assignment else None


class CoachStudentRiskReportView(APIView):
    """
    POST /api/coaching/students/{id}/risk-report/
    Koç risk bildirimi — CoachingEvent RISK (+ opsiyonel görüşme taslağı).
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, student_id):
        if not user_can_access_student(request.user, student_id):
            return Response(
                {'success': False, 'error': 'Bu öğrenciye erişim yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            student = Ogrenci.objects.get(pk=student_id, aktif_mi=True)
        except Ogrenci.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Öğrenci bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        coach_profile = _resolve_coach_for_risk_report(request.user, student_id)
        if not coach_profile:
            return Response(
                {'success': False, 'error': 'Risk bildirimi için koç profili bulunamadı.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'success': False, 'error': 'Risk nedeni zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        notes = (request.data.get('notes') or '').strip()
        create_meeting_draft = bool(request.data.get('create_meeting_draft', False))

        description_parts = [f'Neden: {reason}']
        if notes:
            description_parts.append(notes)
        description = '\n'.join(description_parts)

        event = CoachingEvent.objects.create(
            student=student,
            coach=coach_profile,
            event_type='RISK',
            title=f'Risk Bildirimi — {reason}',
            description=description,
            event_date=timezone.now(),
            status='pending',
            event_source='risk_report',
            metadata={
                'reason': reason,
                'notes': notes,
                'reported_by': request.user.id,
            },
        )

        meeting_draft_id = None
        if create_meeting_draft:
            kurum_id = get_secili_kurum_id(request) or student.kurum_id
            meeting = GorusmeKaydi.objects.create(
                kurum_id=kurum_id,
                ogrenci=student,
                koc=coach_profile,
                gorusme_turu='ogrenci',
                durum='planlandi',
                oncelik='acil',
                gorusme_tarihi=date.today(),
                konu=f'Risk takibi: {reason}',
                notlar=notes,
                olusturan=request.user,
            )
            meeting_draft_id = meeting.id
            event.reference_id = meeting_draft_id
            event.metadata['meeting_draft_id'] = meeting_draft_id
            event.save(update_fields=['reference_id', 'metadata'])

        return Response({
            'success': True,
            'data': {
                'event_id': event.id,
                'meeting_draft_id': meeting_draft_id,
                'detail': 'Risk bildirimi kaydedildi.',
            },
        }, status=status.HTTP_201_CREATED)
