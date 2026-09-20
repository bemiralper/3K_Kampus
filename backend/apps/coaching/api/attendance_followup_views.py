"""Koç yoklama takibi ve yönetici eşik ayarları."""
from datetime import date, datetime

from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.coaching.api.risk_report_views import user_can_manage_risk_reports
from apps.coaching.interfaces.sube_context import (
    assert_coaching_student_sube_access,
    mandatory_coaching_context,
)
from apps.coaching.services.attendance_followup import (
    analysis_payload,
    followup_payload_for_students,
    followup_roster_students,
    get_or_create_thresholds,
    serialize_thresholds,
    student_history_payload,
)
from apps.coaching.services.coach_access import scoped_student_ids, user_can_access_student
from apps.ogrenci.domain.models import Ogrenci


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


def _parse_date(raw: str | None) -> date:
    if not raw:
        return date.today()
    try:
        return datetime.strptime(raw[:10], '%Y-%m-%d').date()
    except ValueError:
        return date.today()


def _scoped_students(request, ctx, on_date):
    return followup_roster_students(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        on_date=on_date,
        egitim_yili_id=ctx.get('egitim_yili_id'),
        allowed_ids=scoped_student_ids(request.user),
    )


class AttendanceFollowupView(APIView):
    """GET /api/coaching/attendance-followup/?date=YYYY-MM-DD"""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        on_date = _parse_date(request.query_params.get('date'))
        view = (request.query_params.get('view') or '').strip()
        student_id = request.query_params.get('student_id')
        if student_id:
            try:
                return AttendanceFollowupStudentView().get(request, int(student_id))
            except (TypeError, ValueError):
                return Response(
                    {'success': False, 'error': 'Geçersiz öğrenci.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        students = _scoped_students(request, ctx, on_date)
        if view == 'analysis':
            payload = analysis_payload(
                students,
                on_date=on_date,
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
                egitim_yili_id=ctx.get('egitim_yili_id'),
            )
            return Response({'success': True, 'data': payload})
        payload = followup_payload_for_students(
            students,
            on_date=on_date,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            egitim_yili_id=ctx.get('egitim_yili_id'),
        )
        return Response({'success': True, 'data': payload})


class AttendanceFollowupAnalysisView(APIView):
    """GET /api/coaching/attendance-followup/analysis/?date=YYYY-MM-DD"""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        on_date = _parse_date(request.query_params.get('date'))
        payload = analysis_payload(
            _scoped_students(request, ctx, on_date),
            on_date=on_date,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            egitim_yili_id=ctx.get('egitim_yili_id'),
        )
        return Response({'success': True, 'data': payload})


class AttendanceFollowupStudentView(APIView):
    """GET /api/coaching/attendance-followup/students/<id>/?date=YYYY-MM-DD"""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
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
        gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
        if gate:
            return gate
        if student.kurum_id != ctx['kurum_id'] or student.sube_id != ctx['sube_id']:
            return Response(
                {'success': False, 'error': 'Kayıt bu şubeye ait değil.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = student_history_payload(
            student,
            on_date=_parse_date(request.query_params.get('date')),
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            egitim_yili_id=ctx.get('egitim_yili_id'),
        )
        return Response({'success': True, 'data': payload})


class AttendanceThresholdView(APIView):
    """GET/PUT /api/coaching/attendance-thresholds/"""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    INT_FIELDS = (
        'absence_attention',
        'absence_alarm',
        'late_attention',
        'late_alarm',
        'consecutive_absent_alarm',
    )
    TEXT_FIELDS = (
        'recommended_action_attention',
        'recommended_action_alarm',
    )

    def get(self, request):
        if not user_can_manage_risk_reports(request.user):
            return Response(
                {'success': False, 'error': 'Bu işlem için yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        setting = get_or_create_thresholds(ctx['kurum_id'])
        return Response({'success': True, 'data': serialize_thresholds(setting)})

    def put(self, request):
        if not user_can_manage_risk_reports(request.user):
            return Response(
                {'success': False, 'error': 'Bu işlem için yetkiniz yok.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        setting = get_or_create_thresholds(ctx['kurum_id'])
        data = request.data or {}
        updates = {}
        for field in self.INT_FIELDS:
            if field not in data:
                continue
            try:
                value = int(data[field])
            except (TypeError, ValueError):
                return Response(
                    {'success': False, 'error': f'Geçersiz değer: {field}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if value < 1 or value > 60:
                return Response(
                    {'success': False, 'error': f'{field} 1–60 arasında olmalı.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            updates[field] = value
        for field in self.TEXT_FIELDS:
            if field not in data:
                continue
            text = str(data[field] or '').strip()[:160]
            if not text:
                return Response(
                    {'success': False, 'error': f'{field} boş olamaz.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            updates[field] = text

        absence_attention = updates.get('absence_attention', setting.absence_attention)
        absence_alarm = updates.get('absence_alarm', setting.absence_alarm)
        late_attention = updates.get('late_attention', setting.late_attention)
        late_alarm = updates.get('late_alarm', setting.late_alarm)
        if absence_alarm < absence_attention or late_alarm < late_attention:
            return Response(
                {'success': False, 'error': 'Alarm eşiği dikkat eşiğinden küçük olamaz.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for key, value in updates.items():
            setattr(setting, key, value)
        setting.updated_by = request.user
        setting.save()
        return Response({
            'success': True,
            'data': serialize_thresholds(setting),
            'message': 'Yoklama eşikleri kaydedildi.',
        })
