"""Günü birlik deneme kayıt API."""
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.kurum.services.kayit_tanimlari_service import seed_default_registration_types
from apps.ogrenci_kayit.permissions import OgrenciKayitModulePermission
from shared.permissions import OlcmeModulePermission

from ..application.gunu_birlik import (
    cancel_deneme_kaydi,
    change_deneme_oturumu,
    register_deneme_kaydi,
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

    from ..application.sinav_uygunluk import exam_date_error

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
    date_error = exam_date_error(exam)
    if date_error:
        return None, ctx, Response({'error': date_error}, status=400)
    return exam, ctx, None


def _seviye_param(request):
    raw = request.query_params.get('sinif_seviyesi')
    if raw in (None, ''):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


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

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), OgrenciKayitModulePermission()]
        return super().get_permissions()

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
        from ..application.deneme_ucret import deneme_odeme_secenekleri

        odeme = deneme_odeme_secenekleri(kurum_id, sube_id)
        return Response({
            'sinavlar': exam_options(kurum_id, sube_id, yil_id, _seviye_param(request)),
            'seviyeler': seviyeler,
            'odeme_yontemleri': odeme['odeme_yontemleri'],
            'mali_hesaplar': odeme['mali_hesaplar'],
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


class GunuBirlikGirisBelgesiView(APIView):
    """Kayıtlı katılımcının sınav giriş belgesi PDF'i."""

    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        from ..application.giris_belgesi import (
            giris_belgesi_filename,
            load_giris_context,
            render_giris_belgesi_pdf,
        )

        ctx, err = _context(request)
        if err:
            return err
        kurum_id, sube_id, _yil = ctx
        loaded, reason = load_giris_context(
            kurum_id, sube_id, request.query_params.get('exam_id'), request.query_params.get('ogrenci_id'),
        )
        if reason:
            return Response({'detail': reason}, status=404 if 'bulunamadı' in reason or 'yok' in reason else 400)
        pdf = render_giris_belgesi_pdf(loaded)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{giris_belgesi_filename(loaded)}"'
        return response


class GunuBirlikGirisBelgesiWhatsappView(APIView):
    """Giriş belgesini seçilen öğrenci veya veli sohbetine gönderir."""

    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def post(self, request):
        from ..application.giris_belgesi import load_giris_context, send_giris_belgesi_whatsapp

        ctx, err = _context(request)
        if err:
            return err
        kurum_id, sube_id, _yil = ctx
        loaded, reason = load_giris_context(
            kurum_id, sube_id, request.data.get('exam_id'), request.data.get('ogrenci_id'),
        )
        if reason:
            return Response({'detail': reason}, status=404 if 'bulunamadı' in reason or 'yok' in reason else 400)
        raw = request.data.get('alicilar') or request.data.get('hedefler') or []
        if isinstance(raw, str):
            raw = [part.strip() for part in raw.split(',') if part.strip()]
        result = send_giris_belgesi_whatsapp(
            loaded,
            alicilar=raw,
            sent_by_user_id=request.user.id if getattr(request.user, 'is_authenticated', False) else None,
        )
        status_code = 200 if result.get('ok') else 400
        return Response({'sent': result.get('sent', 0), 'detail': result.get('detail')}, status=status_code)


class GunuBirlikSinavIslemView(APIView):
    """Tarihi geçmemiş denemede oturum değiştirir veya kaydı iptal eder."""

    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def post(self, request):
        ctx, err = _context(request)
        if err:
            return err
        kurum_id, sube_id, _yil = ctx
        islem = request.data.get('islem')
        kwargs = dict(
            kurum_id=kurum_id,
            sube_id=sube_id,
            ogrenci_id=request.data.get('ogrenci_id'),
            exam_id=request.data.get('exam_id'),
        )
        try:
            if islem == 'oturum':
                result = change_deneme_oturumu(**kwargs, exam_session_id=request.data.get('exam_session_id'))
            elif islem == 'iptal':
                result = cancel_deneme_kaydi(**kwargs)
            elif islem == 'kayit':
                from ..application.deneme_ucret import parse_deneme_ucreti

                tutar = parse_deneme_ucreti(request.data.get('deneme_ucreti'))
                result = register_deneme_kaydi(
                    **kwargs,
                    exam_session_id=request.data.get('exam_session_id'),
                    deneme_ucreti=tutar,
                    user=request.user,
                    odeme_yontemi_id=request.data.get('odeme_yontemi_id'),
                    mali_hesap_id=request.data.get('mali_hesap_id'),
                )
            else:
                return Response({'detail': 'İşlem bulunamadı.'}, status=400)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(result)


class GunuBirlikUcretView(APIView):
    """Aynı TC ile daha önce yazılmış deneme ücretinin son tutarı."""

    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        from ..application.deneme_ucret import last_deneme_ucreti

        ctx, err = _context(request)
        if err:
            return err
        kurum_id, _sube_id, _yil = ctx
        tutar = last_deneme_ucreti(kurum_id, request.query_params.get('tc') or '')
        return Response({'tutar': tutar})


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
