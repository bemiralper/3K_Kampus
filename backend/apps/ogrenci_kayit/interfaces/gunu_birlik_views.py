"""Günü birlik deneme kayıt API."""
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.kurum.services.kayit_tanimlari_service import seed_default_registration_types
from shared.permissions import OlcmeModulePermission

from ..application.gunu_birlik import (
    classify_rows,
    commit_rows,
    exam_options,
    excel_template,
    list_misafirler,
    load_seviyeler,
    parse_excel,
    summarize,
)
from ..application.services import get_active_context


def _context(request):
    kurum_id, sube_id, yil_id = get_active_context(request)
    if not kurum_id or not sube_id:
        return None, Response({'error': 'Kurum ve şube seçin.'}, status=400)
    return (kurum_id, sube_id, yil_id), None


def _exam_or_error(request, exam_id):
    from apps.coaching.olcme_degerlendirme.models import Exam

    ctx, err = _context(request)
    if err:
        return None, None, err
    kurum_id, sube_id, _yil = ctx
    try:
        exam_id = int(exam_id)
    except (TypeError, ValueError):
        return None, ctx, Response({'error': 'Sınav seçin.'}, status=400)
    exam = Exam.objects.filter(
        pk=exam_id, is_active=True, kurum_id=kurum_id, sube_id=sube_id,
    ).first()
    if not exam:
        return None, ctx, Response({'error': 'Sınav bulunamadı.'}, status=404)
    return exam, ctx, None


def _payload(exam, rows, *, committed: bool):
    return {
        'committed': committed,
        'exam': {
            'id': exam.id,
            'name': exam.name,
            'exam_date': exam.exam_date.isoformat() if exam.exam_date else None,
        },
        'rows': [row.as_dict() for row in rows],
        'ozet': summarize(rows),
    }


def _session_id(data):
    raw = data.get('exam_session_id')
    if raw in (None, ''):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


class GunuBirlikView(APIView):
    """GET misafir listesi. POST önizleme (commit=false) veya kayıt."""

    permission_classes = [IsAuthenticated, OlcmeModulePermission]

    def get(self, request):
        ctx, err = _context(request)
        if err:
            return err
        kurum_id, sube_id, _yil = ctx
        q = request.query_params.get('q') or ''
        rows = list_misafirler(kurum_id, sube_id, q=q)
        return Response({'ogrenciler': rows, 'count': len(rows)})

    def post(self, request):
        exam, ctx, err = _exam_or_error(request, request.data.get('exam_id'))
        if err:
            return err
        kurum_id, sube_id, _yil = ctx
        seviyeler = load_seviyeler(kurum_id, sube_id)
        raw_rows = request.data.get('ogrenciler') or []
        if not isinstance(raw_rows, list) or not raw_rows:
            return Response({'error': 'En az bir öğrenci girin.'}, status=400)
        session_id = _session_id(request.data)
        commit = bool(request.data.get('commit'))
        if commit:
            rows = commit_rows(exam, raw_rows, seviyeler, exam_session_id=session_id)
        else:
            rows = classify_rows(exam, raw_rows, seviyeler, exam_session_id=session_id)
        return Response(_payload(exam, rows, committed=commit))


class GunuBirlikSeceneklerView(APIView):
    permission_classes = [IsAuthenticated, OlcmeModulePermission]

    def get(self, request):
        seed_default_registration_types()
        ctx, err = _context(request)
        if err:
            return err
        kurum_id, sube_id, yil_id = ctx
        seviyeler = [
            {'id': s.id, 'ad': s.ad, 'kod': s.kod}
            for s in load_seviyeler(kurum_id, sube_id)
        ]
        return Response({
            'sinavlar': exam_options(kurum_id, sube_id, yil_id),
            'seviyeler': seviyeler,
        })


class GunuBirlikSablonView(APIView):
    permission_classes = [IsAuthenticated, OlcmeModulePermission]

    def get(self, request):
        content = excel_template()
        response = HttpResponse(
            content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename="gunu-birlik-kayit.xlsx"'
        return response


class GunuBirlikExcelView(APIView):
    """Excel'i okur ve önizleme döner. Kayıt yazmaz."""

    permission_classes = [IsAuthenticated, OlcmeModulePermission]

    def post(self, request):
        exam, ctx, err = _exam_or_error(request, request.data.get('exam_id') or request.POST.get('exam_id'))
        if err:
            return err
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'Excel dosyası seçin.'}, status=400)
        try:
            raw_rows = parse_excel(upload)
        except Exception:
            return Response({'error': 'Excel okunamadı. Şablonu kullanın.'}, status=400)
        if not raw_rows:
            return Response({'error': 'Dosyada öğrenci satırı yok.'}, status=400)
        kurum_id, sube_id, _yil = ctx
        seviyeler = load_seviyeler(kurum_id, sube_id)
        session_id = _session_id(request.data)
        rows = classify_rows(exam, raw_rows, seviyeler, exam_session_id=session_id)
        return Response(_payload(exam, rows, committed=False))
