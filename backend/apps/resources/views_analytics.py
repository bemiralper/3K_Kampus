"""Kaynak analiz API + PDF."""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication
from django.http import HttpResponse

from .permissions import IsResourceManager
from .application import analytics as A
from .application.analytics_pdf import build_analytics_pdf


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


class ResourceAnalyticsViewSet(viewsets.ViewSet):
    """Kaynak analiz/rapor uçları — sadece admin/koç erişebilir (öğrenci/veli hariç)."""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated, IsResourceManager]

    def list(self, request):
        return Response({'success': True, 'data': A.summary(request)})

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        return Response({'success': True, 'data': A.summary(request)})

    @action(detail=False, methods=['get'], url_path='action-items')
    def action_items(self, request):
        return Response({'success': True, 'data': A.action_items(request)})

    @action(detail=False, methods=['get'], url_path='top-books')
    def top_books(self, request):
        metric = request.query_params.get('metric') or 'students'
        limit_raw = request.query_params.get('limit')
        if limit_raw is None or limit_raw == '':
            limit = 20
        elif str(limit_raw).lower() in ('0', 'all', 'none', 'unlimited'):
            limit = 0
        else:
            try:
                limit = max(0, int(limit_raw))
            except (TypeError, ValueError):
                limit = 20
        used_only = str(request.query_params.get('used_only') or '').lower() in (
            '1', 'true', 'yes',
        )
        return Response({
            'success': True,
            'data': A.top_books(request, metric=metric, limit=limit, used_only=used_only),
        })

    @action(detail=False, methods=['get'], url_path='publishers')
    def publishers(self, request):
        return Response({'success': True, 'data': A.publishers_report(request)})

    @action(detail=False, methods=['get'], url_path='by-lesson')
    def by_lesson(self, request):
        return Response({'success': True, 'data': A.by_lesson(request)})

    @action(detail=False, methods=['get'], url_path='incomplete')
    def incomplete(self, request):
        return Response({'success': True, 'data': A.incomplete_books(request)})

    @action(detail=False, methods=['get'], url_path='intervention')
    def intervention(self, request):
        return Response({'success': True, 'data': A.intervention(request)})

    @action(detail=False, methods=['get'], url_path='priority-summary')
    def priority_summary(self, request):
        return Response({'success': True, 'data': A.priority_summary(request)})

    @action(detail=False, methods=['get'], url_path='usage-trend')
    def usage_trend(self, request):
        months = int(request.query_params.get('months') or 6)
        return Response({'success': True, 'data': A.usage_trend(request, months=months)})

    @action(detail=False, methods=['get'], url_path='avg-per-student')
    def avg_per_student(self, request):
        return Response({'success': True, 'data': A.avg_per_student(request)})

    @action(detail=False, methods=['get'], url_path='by-coach')
    def by_coach(self, request):
        return Response({'success': True, 'data': A.by_coach(request)})

    @action(detail=False, methods=['get'], url_path='lesson-publisher-matrix')
    def lesson_publisher_matrix(self, request):
        return Response({'success': True, 'data': A.lesson_publisher_matrix(request)})

    @action(detail=False, methods=['get'], url_path='usage-rate')
    def usage_rate(self, request):
        return Response({'success': True, 'data': A.usage_rate(request)})

    @action(detail=False, methods=['get'], url_path='idle')
    def idle(self, request):
        days_raw = request.query_params.get('days')
        days = int(days_raw) if days_raw not in (None, '', 'null') else None
        return Response({'success': True, 'data': A.idle_books(request, days=days)})

    @action(detail=False, methods=['get'], url_path='hot-incomplete')
    def hot_incomplete(self, request):
        min_s = int(request.query_params.get('min_students') or 5)
        return Response({'success': True, 'data': A.hot_incomplete(request, min_students=min_s)})

    @action(detail=False, methods=['get'], url_path='pool-growth')
    def pool_growth(self, request):
        months = int(request.query_params.get('months') or 6)
        return Response({'success': True, 'data': A.pool_growth(request, months=months)})

    @action(detail=False, methods=['get'], url_path='churn')
    def churn(self, request):
        return Response({'success': True, 'data': A.churn(request)})

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        q = request.query_params.get('q') or ''
        return Response({'success': True, 'data': A.global_search(request, q)})

    @action(detail=False, methods=['get'], url_path='book-students')
    def book_students(self, request):
        book_id = request.query_params.get('book_id')
        if not book_id:
            return Response(
                {'success': False, 'error': 'book_id gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            'success': True,
            'data': A.students_for_book(request, int(book_id)),
        })

    @action(detail=False, methods=['post'], url_path='report-pdf')
    def report_pdf(self, request):
        report_type = request.data.get('report_type') or 'genel'
        try:
            pdf_bytes = build_analytics_pdf(request, report_type=report_type)
        except Exception as exc:
            return Response(
                {'success': False, 'error': f'PDF oluşturulamadı: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        resp = HttpResponse(pdf_bytes, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="kaynak-analiz-{report_type}.pdf"'
        return resp
