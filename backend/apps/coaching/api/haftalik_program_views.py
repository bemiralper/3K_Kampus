"""Koç haftalık programı — JSON ve PDF."""
from django.http import HttpResponse
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.coaching.interfaces.sube_context import mandatory_coaching_context
from apps.coaching.models import CoachProfile
from apps.coaching.services.coach_access import (
    can_access_all_coaches,
    get_coach_profile,
    is_resource_admin,
)
from apps.coaching.services.haftalik_program import (
    build_haftalik_program_html,
    collect_week,
    empty_week,
    parse_week_start,
    pdf_filename,
)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


def _coach_options(kurum_id: int):
    rows = (
        CoachProfile.objects.filter(
            is_active=True,
            is_coach=True,
            teacher__kurum_id=kurum_id,
            teacher__aktif_mi=True,
        )
        .select_related('teacher')
        .order_by('teacher__ad', 'teacher__soyad', 'id')
    )
    return [
        {
            'id': row.id,
            'name': f'{row.teacher.ad} {row.teacher.soyad}'.strip(),
        }
        for row in rows
    ]


def _resolve_coach(request, kurum_id: int):
    """(coach | None, can_pick, error_response | None)."""
    own = get_coach_profile(request.user)
    can_pick = is_resource_admin(request.user) or can_access_all_coaches(request.user)
    if own and not can_pick:
        if own.teacher.kurum_id != kurum_id:
            return None, False, Response(
                {'success': False, 'error': 'Koç profili bu kuruma ait değil.'},
                status=403,
            )
        return own, False, None
    if not can_pick:
        return None, False, Response(
            {'success': False, 'error': 'Haftalık program için koç yetkisi gerekir.'},
            status=403,
        )

    options = CoachProfile.objects.filter(
        is_active=True,
        is_coach=True,
        teacher__kurum_id=kurum_id,
        teacher__aktif_mi=True,
    ).select_related('teacher')
    requested = request.query_params.get('coach_id')
    if requested:
        coach = options.filter(pk=requested).first()
        if coach is None:
            return None, True, Response(
                {'success': False, 'error': 'Koç bulunamadı.'},
                status=404,
            )
        return coach, True, None
    return options.order_by('teacher__ad', 'teacher__soyad', 'id').first(), True, None


class HaftalikProgramView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        try:
            week_start = parse_week_start(request.query_params.get('week'))
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)

        coach, can_pick, resolve_err = _resolve_coach(request, ctx['kurum_id'])
        if resolve_err:
            return resolve_err

        coaches = _coach_options(ctx['kurum_id']) if can_pick else []
        if coach is None:
            data = empty_week(week_start)
        else:
            data = collect_week(
                coach=coach,
                week_start=week_start,
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
            )
        data['can_pick_coach'] = can_pick
        data['coaches'] = coaches
        return Response({'success': True, 'data': data})


class HaftalikProgramPdfView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        try:
            week_start = parse_week_start(request.query_params.get('week'))
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=400)

        coach, _can_pick, resolve_err = _resolve_coach(request, ctx['kurum_id'])
        if resolve_err:
            return resolve_err
        if coach is None:
            return Response({'success': False, 'error': 'Koç bulunamadı.'}, status=404)

        payload = collect_week(
            coach=coach,
            week_start=week_start,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
        html_doc = build_haftalik_program_html(payload)
        from apps.communication.application.html_to_pdf import render_html_to_pdf

        try:
            pdf = render_html_to_pdf(html_doc, landscape=True)
        except Exception:
            return Response(
                {'success': False, 'error': 'PDF oluşturulamadı.'},
                status=503,
            )

        filename = pdf_filename(payload)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
