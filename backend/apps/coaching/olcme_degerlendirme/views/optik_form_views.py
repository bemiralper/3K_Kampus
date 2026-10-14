"""Optik form şablonu ve sınav katılımcılarına basım."""
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from django.db import transaction
from django.http import HttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.permissions import OlcmeModulePermission

from ..interfaces.sube_context import get_exam_or_response, mandatory_olcme_context
from ..models import ExamParticipant, OptikForm, OptikFormAlani
from ..services.optik_preset import preset_or_none
from ..services.optik_print import SAMPLE_VALUES, render_optik_pdf
from ..services.optik_values import optik_filename, participant_value_rows
from ..views import CsrfExemptSessionAuthentication

MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_PAGES = 600

_GEOMETRY = (
    'sayfa_genislik_mm', 'sayfa_yukseklik_mm',
    'sol_bas_mm', 'ust_bas_mm',
    'sol_pay_mm', 'sag_pay_mm', 'ust_pay_mm', 'alt_pay_mm',
    'balon_cap_mm',
)
_FIELD_NUMS = ('x_mm', 'y_mm', 'genislik_mm', 'yukseklik_mm', 'punto')


def _pdf_response(data: bytes, filename: str) -> HttpResponse:
    ascii_name = filename.encode('ascii', 'ignore').decode('ascii') or 'optik.pdf'
    response = HttpResponse(data, content_type='application/pdf')
    response['Content-Disposition'] = (
        f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'
    )
    return response


def _dec(value, label):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f'{label} sayı olmalıdır.')
    return number.quantize(Decimal('0.01')) if label != 'Punto' else number.quantize(Decimal('0.1'))


def _alan_dict(alan: OptikFormAlani) -> dict:
    return {
        'id': alan.id,
        'kod': alan.kod,
        'etiket': alan.etiket,
        'tur': alan.tur,
        'x_mm': float(alan.x_mm),
        'y_mm': float(alan.y_mm),
        'genislik_mm': float(alan.genislik_mm),
        'yukseklik_mm': float(alan.yukseklik_mm),
        'punto': float(alan.punto),
        'sablon': alan.sablon,
        'karakter_kumesi': alan.karakter_kumesi,
        'sutun_sayisi': alan.sutun_sayisi,
        'aktif': alan.aktif,
        'sira': alan.sira,
    }


def _form_dict(form: OptikForm, with_fields=False) -> dict:
    data = {
        'id': form.id,
        'ad': form.ad,
        'preset_kod': form.preset_kod,
        'pdf_adi': form.pdf.name.rsplit('/', 1)[-1] if form.pdf else '',
        'aktif': form.aktif,
        'alan_sayisi': form.alanlar.count() if not with_fields else None,
    }
    for key in _GEOMETRY:
        data[key] = float(getattr(form, key))
    if with_fields:
        alanlar = list(form.alanlar.all())
        data['alan_sayisi'] = len(alanlar)
        data['alanlar'] = [_alan_dict(a) for a in alanlar]
    return data


def _read_pdf(uploaded):
    if uploaded is None:
        raise ValueError('Form PDF seçin.')
    name = (getattr(uploaded, 'name', '') or '').lower()
    if not name.endswith('.pdf'):
        raise ValueError('Yalnızca PDF yüklenebilir.')
    if uploaded.size > MAX_PDF_BYTES:
        raise ValueError('PDF 20 MB sınırını aşıyor.')
    raw = uploaded.read()
    if not raw.startswith(b'%PDF'):
        raise ValueError('Dosya geçerli bir PDF değil.')
    uploaded.seek(0)
    return raw


def _apply_preset(form: OptikForm, kod: str):
    preset = preset_or_none(kod)
    if preset is None:
        raise ValueError('Bilinmeyen hazır yerleşim.')
    for key, value in preset['geometry']().items():
        setattr(form, key, value)
    form.preset_kod = 'OPTIK-129'
    form.save()
    form.alanlar.all().delete()
    OptikFormAlani.objects.bulk_create([
        OptikFormAlani(form=form, **row) for row in preset['alanlar']()
    ])


def _validate_alan(raw, index, page_w, page_h):
    if not isinstance(raw, dict):
        raise ValueError(f'{index}. alan geçersiz.')
    kod = (raw.get('kod') or '').strip().lower()
    etiket = (raw.get('etiket') or '').strip()
    if not kod or not etiket:
        raise ValueError(f'{index}. alanda kod ve etiket zorunludur.')
    if len(kod) > 40 or len(etiket) > 80:
        raise ValueError(f'{index}. alan adı çok uzun.')
    tur = (raw.get('tur') or 'metin').strip()
    if tur not in ('metin', 'balon'):
        raise ValueError(f'{etiket}: tür metin veya balon olmalıdır.')
    numbers = {}
    labels = {
        'x_mm': 'X', 'y_mm': 'Y', 'genislik_mm': 'Genişlik',
        'yukseklik_mm': 'Yükseklik', 'punto': 'Punto',
    }
    for key in _FIELD_NUMS:
        numbers[key] = _dec(raw.get(key), labels[key])
    if numbers['x_mm'] < 0 or numbers['y_mm'] < 0:
        raise ValueError(f'{etiket}: konum negatif olamaz.')
    if numbers['x_mm'] >= page_w or numbers['y_mm'] > page_h:
        raise ValueError(f'{etiket}: konum sayfa dışına taşıyor.')
    if numbers['genislik_mm'] <= 0 or numbers['genislik_mm'] > page_w:
        raise ValueError(f'{etiket}: genişlik geçersiz.')
    if numbers['punto'] < 5 or numbers['punto'] > 18:
        raise ValueError(f'{etiket}: punto 5 ile 18 arasında olmalıdır.')
    sablon = (raw.get('sablon') or '').strip()
    if len(sablon) > 200:
        raise ValueError(f'{etiket}: şablon çok uzun.')
    if tur == 'metin' and raw.get('aktif', True) and not sablon:
        raise ValueError(f'{etiket}: aktif metin alanının şablonu boş olamaz.')
    return {
        'kod': kod,
        'etiket': etiket,
        'tur': tur,
        **numbers,
        'sablon': sablon,
        'karakter_kumesi': (raw.get('karakter_kumesi') or '')[:120],
        'sutun_sayisi': _sutun(raw.get('sutun_sayisi'), etiket),
        'aktif': bool(raw.get('aktif', True)),
        'sira': index,
    }


def _sutun(value, etiket):
    try:
        count = int(value if value not in (None, '') else 1)
    except (TypeError, ValueError):
        raise ValueError(f'{etiket}: sütun sayısı sayı olmalıdır.')
    if count < 1 or count > 40:
        raise ValueError(f'{etiket}: sütun sayısı 1 ile 40 arasında olmalıdır.')
    return count


def ensure_balon_alanlari(form):
    """Eski kayıtta hiç balon yoksa hazır yerleşimdeki ızgaraları bir kez ekler.

    Kullanıcı bir balonu sildiyse geri konmaz. Metin kutularının yeri değişmez.
    """
    preset = preset_or_none(form.preset_kod)
    if preset is None:
        return
    if form.alanlar.filter(tur='balon').exists():
        return
    missing = [
        OptikFormAlani(form=form, **row)
        for row in preset['alanlar']()
        if row.get('tur') == 'balon'
    ]
    if missing:
        OptikFormAlani.objects.bulk_create(missing)


def _load_form(request, form_pk):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return None, None, err
    form = OptikForm.objects.filter(pk=form_pk, kurum_id=ctx['kurum_id']).first()
    if form is None:
        return None, None, Response({'error': 'Optik form bulunamadı.'}, status=404)
    return ctx, form, None


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_form_list(request):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return err
    if request.method == 'GET':
        forms = OptikForm.objects.filter(kurum_id=ctx['kurum_id']).order_by('ad', 'id')
        return Response([_form_dict(f) for f in forms])

    ad = (request.data.get('ad') or request.POST.get('ad') or '').strip()
    if not ad or len(ad) > 120:
        return Response({'error': 'Form adı zorunludur.'}, status=400)
    if OptikForm.objects.filter(kurum_id=ctx['kurum_id'], ad=ad).exists():
        return Response({'error': 'Bu adda bir form zaten var.'}, status=400)
    try:
        _read_pdf(request.FILES.get('pdf'))
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    preset_kod = (request.data.get('preset') or request.POST.get('preset') or '').strip()
    try:
        with transaction.atomic():
            form = OptikForm.objects.create(
                kurum_id=ctx['kurum_id'],
                ad=ad,
                pdf=request.FILES['pdf'],
            )
            if preset_kod:
                _apply_preset(form, preset_kod)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    return Response(_form_dict(form, with_fields=True), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_form_detail(request, form_pk):
    _ctx, form, err = _load_form(request, form_pk)
    if err:
        return err
    if request.method == 'GET':
        return Response(_form_dict(form, with_fields=True))
    if request.method == 'DELETE':
        form.pdf.delete(save=False)
        form.delete()
        return Response(status=204)

    ad = request.data.get('ad', form.ad)
    ad = (ad or '').strip()
    if not ad or len(ad) > 120:
        return Response({'error': 'Form adı zorunludur.'}, status=400)
    clash = OptikForm.objects.filter(kurum_id=form.kurum_id, ad=ad).exclude(pk=form.pk)
    if clash.exists():
        return Response({'error': 'Bu adda bir form zaten var.'}, status=400)
    form.ad = ad
    if 'aktif' in request.data:
        form.aktif = bool(request.data.get('aktif'))
    for key in _GEOMETRY:
        if key in request.data:
            try:
                setattr(form, key, _dec(request.data.get(key), key))
            except ValueError as exc:
                return Response({'error': str(exc)}, status=400)
    if form.sayfa_genislik_mm <= 0 or form.sayfa_yukseklik_mm <= 0:
        return Response({'error': 'Sayfa ölçüsü sıfırdan büyük olmalıdır.'}, status=400)
    if request.FILES.get('pdf'):
        try:
            _read_pdf(request.FILES['pdf'])
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        form.pdf.delete(save=False)
        form.pdf = request.FILES['pdf']
    preset_kod = (request.data.get('preset') or '').strip()
    form.save()
    if preset_kod:
        try:
            _apply_preset(form, preset_kod)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
    return Response(_form_dict(form, with_fields=True))


@api_view(['PUT'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_form_alanlar(request, form_pk):
    _ctx, form, err = _load_form(request, form_pk)
    if err:
        return err
    rows = request.data.get('alanlar') if isinstance(request.data, dict) else None
    if not isinstance(rows, list):
        return Response({'error': 'Alan listesi zorunludur.'}, status=400)
    if len(rows) > 40:
        return Response({'error': 'En fazla 40 alan tanımlanabilir.'}, status=400)
    try:
        cleaned = [
            _validate_alan(row, i, form.sayfa_genislik_mm, form.sayfa_yukseklik_mm)
            for i, row in enumerate(rows, start=1)
        ]
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    codes = [row['kod'] for row in cleaned]
    if len(codes) != len(set(codes)):
        return Response({'error': 'Alan kodları tekrar edemez.'}, status=400)
    with transaction.atomic():
        form.alanlar.all().delete()
        OptikFormAlani.objects.bulk_create([
            OptikFormAlani(form=form, **row) for row in cleaned
        ])
    return Response(_form_dict(form, with_fields=True))


def _render_or_error(form, rows, formu_bas=True):
    if not form.pdf:
        return None, Response({'error': 'Formun PDF dosyası yok.'}, status=400)
    try:
        form.pdf.open('rb')
        raw = form.pdf.read()
    finally:
        form.pdf.close()
    if not raw:
        return None, Response({'error': 'Form PDF okunamadı.'}, status=400)
    try:
        pdf = render_optik_pdf(raw, form, rows, formu_bas=formu_bas)
    except ValueError as exc:
        return None, Response({'error': str(exc)}, status=400)
    return pdf, None


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def optik_form_onizleme(request, form_pk):
    _ctx, form, err = _load_form(request, form_pk)
    if err:
        return err
    ensure_balon_alanlari(form)
    pdf, error = _render_or_error(form, [SAMPLE_VALUES])
    if error:
        return error
    return _pdf_response(pdf, f'{form.ad}-onizleme.pdf')


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def exam_optik_yazdir(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    try:
        form_id = int(request.data.get('form_id'))
    except (TypeError, ValueError):
        return Response({'error': 'Optik form seçin.'}, status=400)
    form = OptikForm.objects.filter(pk=form_id, kurum_id=exam.kurum_id, aktif=True).first()
    if form is None:
        return Response({'error': 'Optik form bulunamadı.'}, status=404)
    qs = (
        ExamParticipant.objects.filter(exam=exam)
        .select_related('student', 'room', 'exam_session', 'sinif_seviyesi')
    )
    raw_ids = request.data.get('participant_ids')
    if raw_ids not in (None, ''):
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({'error': 'Öğrenci seçimi geçersiz.'}, status=400)
        try:
            ids = [int(pk) for pk in raw_ids]
        except (TypeError, ValueError):
            return Response({'error': 'Öğrenci seçimi geçersiz.'}, status=400)
        qs = qs.filter(pk__in=ids)
    participants = list(qs.order_by('exam_session__order', 'room__order', 'seat_no', 'id'))
    if not participants:
        return Response({'error': 'Basılacak katılımcı yok.'}, status=400)
    if len(participants) > MAX_PAGES:
        return Response(
            {'error': f'Bir seferde en fazla {MAX_PAGES} form basılabilir.'},
            status=400,
        )
    ensure_balon_alanlari(form)
    rows = participant_value_rows(exam, participants)
    pdf, error = _render_or_error(form, rows, formu_bas=False)
    if error:
        return error
    return _pdf_response(pdf, optik_filename(exam.name))
