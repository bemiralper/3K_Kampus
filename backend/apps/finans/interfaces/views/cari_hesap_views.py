"""
Cari Hesap & Cari Hareket Views — API endpoint'leri
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from apps.finans.application.cari_hesap_service import CariHesapService
from apps.finans.application.cari_hareket_enrichment import build_cari_hareket_meta
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.interfaces.serializers.cari_hesap_serializer import (
    CariHesapListSerializer,
    CariHesapDetailSerializer,
    CariHesapCreateSerializer,
    CariHesapUpdateSerializer,
    CariHesapDropdownSerializer,
    CariHareketListSerializer,
)
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.cari_dosya import CariDosya


def _multipart_field(request, key: str, default: str = '') -> str:
    """multipart/form-data metin alanını güvenli oku."""
    raw = None
    if hasattr(request, 'data'):
        raw = request.data.get(key)
    if raw in (None, '', []):
        raw = request.POST.get(key)
    if raw is None:
        return default
    if isinstance(raw, (list, tuple)):
        raw = raw[0] if raw else default
    return str(raw).strip() if raw is not None else default


def _cari_sube_gate(request, pk):
    """Cari hesap kayıt düzeyinde şube erişim kapısı."""
    selector = CariHesapSelector()
    hesap = selector.get_by_id(pk)
    if not hesap:
        return None, Response({'detail': 'Cari hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    from apps.finans.interfaces.views.sube_context import assert_record_sube_access

    err = assert_record_sube_access(request, hesap.kurum_id, hesap.sube_id)
    if err:
        return None, err
    return hesap, None


class CariHesapListCreateView(APIView):
    """
    GET  → Kuruma ait cari hesaplar listesi
    POST → Yeni cari hesap oluştur
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = CariHesapSelector()
        hesap_turu = request.query_params.get('hesap_turu')
        arama = request.query_params.get('arama', '').strip()

        if arama:
            hesaplar = selector.search(kurum_id, arama, sube_id=sube_id, hesap_turu=hesap_turu)
        else:
            hesaplar = selector.list_by_kurum(kurum_id, sube_id=sube_id, hesap_turu=hesap_turu)

        hesap_list = list(hesaplar)
        hesap_ids = [h.pk for h in hesap_list]
        serializer = CariHesapListSerializer(
            hesap_list,
            many=True,
            context={
                'islem_totals': selector._islem_totals_map(hesap_ids),
                'son_hareket_map': selector._son_hareket_map(hesap_ids),
            },
        )
        return Response(serializer.data)

    def post(self, request):
        kurum_id = request.data.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        serializer = CariHesapCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        data['kurum_id'] = kurum_id
        data['sube_id'] = sube_id

        service = CariHesapService()
        hesap, errors = service.create(data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CariHesapDetailSerializer(hesap).data,
            status=status.HTTP_201_CREATED,
        )


class CariHesapDetailView(APIView):
    """
    GET    → Cari hesap detay
    PUT    → Cari hesap güncelle
    DELETE → Cari hesap sil (soft delete)
    """

    def get(self, request, pk):
        hesap, err = _cari_sube_gate(request, pk)
        if err:
            return err

        serializer = CariHesapDetailSerializer(hesap)
        return Response(serializer.data)

    def put(self, request, pk):
        hesap, err = _cari_sube_gate(request, pk)
        if err:
            return err

        serializer = CariHesapUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        service = CariHesapService()
        hesap, errors = service.update(pk, serializer.validated_data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(CariHesapDetailSerializer(hesap).data)

    def delete(self, request, pk):
        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        service = CariHesapService()
        hesap, errors = service.soft_delete(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Cari hesap silindi.'}, status=status.HTTP_200_OK)


class CariHesapToggleView(APIView):
    """POST → Aktif/Pasif durumunu değiştirir."""

    def post(self, request, pk):
        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        service = CariHesapService()
        hesap, errors = service.toggle_aktif(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'detail': f'Cari hesap {"aktifleştirildi" if hesap.aktif_mi else "pasifleştirildi"}.',
            'aktif_mi': hesap.aktif_mi,
        })


class CariHesapDropdownView(APIView):
    """GET → Dropdown için minimal cari hesap listesi."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = CariHesapSelector()
        hesap_turu = request.query_params.get('hesap_turu')
        hesaplar = selector.dropdown_list(kurum_id, sube_id=sube_id, hesap_turu=hesap_turu)
        serializer = CariHesapDropdownSerializer(hesaplar, many=True)
        return Response(serializer.data)


class CariHesapRaporListView(APIView):
    """GET → Kurumdaki tüm cariler için bakiye / vade raporu."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = CariHesapSelector()
        hesap_turu = request.query_params.get('hesap_turu')
        arama = request.query_params.get('arama', '').strip() or None
        baslangic = request.query_params.get('baslangic') or None
        bitis = request.query_params.get('bitis') or None

        rows = selector.cari_rapor_listesi(
            kurum_id,
            sube_id=sube_id,
            hesap_turu=hesap_turu,
            arama=arama,
            baslangic=baslangic,
            bitis=bitis,
        )
        return Response(rows)


class CariRaporExportView(APIView):
    """POST → Cari bakiye raporu dışa aktarma (PDF / Excel / CSV)."""

    def post(self, request):
        from apps.finans.application.export.export_service import ExportService
        from apps.finans.interfaces.views.expansion_views import _enrich_filters_meta

        kurum_id = (request.data.get('filters_meta') or {}).get('kurum_id')
        if not kurum_id:
            kurum_id = request.data.get('kurum_id')
        if kurum_id:
            from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

            _, err = resolve_mandatory_finans_sube(request, kurum_id)
            if err:
                return err

        fmt = (request.data.get('format') or 'csv').lower()
        if fmt not in ExportService.SUPPORTED_FORMATS:
            return Response({'error': f'Desteklenmeyen format: {fmt}'}, status=400)

        columns = request.data.get('columns') or []
        rows = request.data.get('rows') or []
        title = request.data.get('title') or 'Cari Bakiye Raporu'
        filters_meta = request.data.get('filters_meta') or {}
        if request.user.is_authenticated and not filters_meta.get('raporu_olusturan'):
            filters_meta['raporu_olusturan'] = (
                request.user.get_full_name() or request.user.username
            )
        filters_meta.setdefault('report_kind', 'cari_bakiye')
        filters_meta.setdefault('rapor_adi', title)
        filters_meta.setdefault('para_birimi', 'TL')
        meta = _enrich_filters_meta(filters_meta, kurum_id)

        orientation = ExportService._normalize_orientation(
            request.data.get('orientation') or request.query_params.get('orientation'),
        )

        try:
            result = ExportService.build(
                fmt,
                rows,
                columns,
                title=title,
                filters_meta=meta,
                orientation=orientation,
            )
        except (ValueError, RuntimeError) as exc:
            return Response({'error': str(exc)}, status=400)

        if isinstance(result, dict):
            return Response(result)
        return result


class CariHesapCariOzetView(APIView):
    """GET → Cari hesap borç/alacak özeti."""

    def get(self, request, pk):
        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        selector = CariHesapSelector()
        ozet = selector.cari_ozet(pk)
        if not ozet:
            return Response({'detail': 'Cari hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ozet)


class CariHareketListView(APIView):
    """GET → Bir cari hesabın hareketleri."""

    def get(self, request, pk):
        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        selector = CariHesapSelector()

        filtreler = {}
        if request.query_params.get('islem_turu'):
            islem_turu_val = request.query_params['islem_turu']
            # Virgülle ayrılmış birden fazla islem_turu desteği: "odeme,mahsup"
            if ',' in islem_turu_val:
                filtreler['islem_turu__in'] = [t.strip() for t in islem_turu_val.split(',')]
            else:
                filtreler['islem_turu'] = islem_turu_val
        if request.query_params.get('yon'):
            filtreler['yon'] = request.query_params['yon']
        if request.query_params.get('baslangic'):
            filtreler['baslangic'] = request.query_params['baslangic']
        if request.query_params.get('bitis'):
            filtreler['bitis'] = request.query_params['bitis']

        hareketler = selector.hareketler(pk, filtreler=filtreler if filtreler else None)
        hareket_list = list(hareketler)
        serializer = CariHareketListSerializer(
            hareket_list,
            many=True,
            context={'kaynak_meta': build_cari_hareket_meta(hareket_list)},
        )
        return Response(serializer.data)


class CariDosyaListCreateView(APIView):
    """
    GET  → Cariye ait dosyaları listeler.
    POST → Yeni dosya yükler.
    """
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        dosyalar = CariDosya.objects.filter(cari_hesap_id=pk)
        data = []
        for d in dosyalar:
            data.append({
                'id': d.id,
                'dosya_adi': d.dosya_adi,
                'dosya_turu': d.dosya_turu,
                'dosya_turu_display': d.get_dosya_turu_display(),
                'dosya_url': d.dosya_url,
                'aciklama': d.aciklama,
                'dosya_boyutu': d.dosya_boyutu,
                'dosya_boyutu_fmt': d.dosya_boyutu_fmt,
                'yukleyen_adi': d.yukleyen.get_full_name() if d.yukleyen else None,
                'created_at': d.created_at.isoformat() if d.created_at else None,
            })
        return Response(data)

    def post(self, request, pk):
        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        dosya = request.FILES.get('dosya')
        if not dosya:
            return Response({'error': 'Dosya seçilmedi.'}, status=status.HTTP_400_BAD_REQUEST)

        dosya_adi = _multipart_field(request, 'dosya_adi') or dosya.name
        dosya_turu = _multipart_field(request, 'dosya_turu') or 'diger'
        aciklama = _multipart_field(request, 'aciklama')

        # Kurum ID — cari hesaptan çekelim
        from apps.finans.domain.cari_hesap import CariHesap
        try:
            hesap = CariHesap.objects.get(pk=pk)
        except CariHesap.DoesNotExist:
            return Response({'error': 'Cari hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        obj = CariDosya.objects.create(
            cari_hesap_id=pk,
            kurum_id=hesap.kurum_id,
            dosya=dosya,
            dosya_adi=dosya_adi,
            dosya_turu=dosya_turu,
            aciklama=aciklama,
            dosya_boyutu=dosya.size,
            yukleyen=request.user if request.user.is_authenticated else None,
        )
        return Response({
            'id': obj.id,
            'dosya_adi': obj.dosya_adi,
            'dosya_turu': obj.dosya_turu,
            'dosya_turu_display': obj.get_dosya_turu_display(),
            'dosya_url': obj.dosya_url,
            'aciklama': obj.aciklama,
            'dosya_boyutu': obj.dosya_boyutu,
            'dosya_boyutu_fmt': obj.dosya_boyutu_fmt,
            'created_at': obj.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class CariDosyaDeleteView(APIView):
    """DELETE → Dosyayı siler."""

    def delete(self, request, pk, dosya_id):
        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        try:
            dosya = CariDosya.objects.get(pk=dosya_id, cari_hesap_id=pk)
        except CariDosya.DoesNotExist:
            return Response({'error': 'Dosya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        # Fiziksel dosyayı da sil
        if dosya.dosya:
            dosya.dosya.delete(save=False)
        dosya.delete()
        return Response({'detail': 'Dosya silindi.'}, status=status.HTTP_200_OK)

