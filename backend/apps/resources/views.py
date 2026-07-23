"""
Resources Views
DRF ViewSets for Book-based Content Library API
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from shared.export.drf_renderers import CsvRenderer, XlsxRenderer
from .permissions import IsAuthenticatedResourceReadOrAdminWrite
from django.db.models import Prefetch, Count, Q, Max, F
from django.db import transaction

from .models import BookType, ResourceBook, ResourceUnit, ResourceTopic, ResourceContent
from .scoping import (
    filter_books_for_request,
    filter_by_book_kurum_for_request,
    get_request_kurum_id,
    get_request_sube_id,
    resolve_book_for_structure,
)
from .utils import (
    generate_book_kod,
    generate_topic_kod,
    generate_unit_kod,
    build_test_batch,
    next_incremented_content_name,
)
from .serializers import (
    BookTypeSerializer,
    ResourceBookSerializer, ResourceBookDetailSerializer,
    ResourceBookStructureSerializer, ResourceBookWriteSerializer,
    ResourceUnitSerializer, ResourceUnitDetailSerializer, ResourceUnitWriteSerializer,
    ResourceTopicSerializer, ResourceTopicDetailSerializer, ResourceTopicWriteSerializer,
    ResourceContentSerializer, ResourceContentWriteSerializer
)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF doğrulaması yapmayan SessionAuthentication"""
    def enforce_csrf(self, request):
        return  # CSRF kontrolünü atla


class BookTypeViewSet(viewsets.ModelViewSet):
    """
    Kitap Türü API ViewSet
    
    list: GET /api/resources/book-types/
    create: POST /api/resources/book-types/
    retrieve: GET /api/resources/book-types/{id}/
    update: PUT /api/resources/book-types/{id}/
    destroy: DELETE /api/resources/book-types/{id}/
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated, IsAuthenticatedResourceReadOrAdminWrite]
    queryset = BookType.objects.filter(aktif_mi=True).order_by('sira', 'ad')
    serializer_class = BookTypeSerializer
    
    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            self.perform_create(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Kitap türü başarıyla oluşturuldu.'
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            self.perform_update(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Kitap türü başarıyla güncellendi.'
            })
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # Önce bu türü kullanan kitap var mı kontrol et
        if instance.books.filter(aktif_mi=True).exists():
            return Response({
                'success': False,
                'error': 'Bu türü kullanan aktif kitaplar var. Önce kitapları silin veya türlerini değiştirin.'
            }, status=status.HTTP_400_BAD_REQUEST)
        # Hard delete - gerçekten sil
        instance.delete()
        return Response({
            'success': True,
            'message': 'Kitap türü başarıyla silindi.'
        })


class ResourceBookViewSet(viewsets.ModelViewSet):
    """
    Kaynak Kitap API ViewSet
    
    list: GET /api/resources/books/
    create: POST /api/resources/books/
    retrieve: GET /api/resources/books/{id}/
    update: PUT /api/resources/books/{id}/
    partial_update: PATCH /api/resources/books/{id}/
    destroy: DELETE /api/resources/books/{id}/
    structure: GET /api/resources/books/{id}/structure/
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated, IsAuthenticatedResourceReadOrAdminWrite]
    queryset = ResourceBook.objects.select_related(
        'ders', 'sinif_seviyesi', 'book_type', 'kurum', 'sube'
    ).prefetch_related('sinif_seviyeleri')
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ResourceBookDetailSerializer
        if self.action == 'structure':
            return ResourceBookStructureSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ResourceBookWriteSerializer
        return ResourceBookSerializer
    
    def get_queryset(self):
        queryset = filter_books_for_request(super().get_queryset(), self.request)
        queryset = queryset.annotate(
            db_unit_count=Count('units', filter=Q(units__aktif_mi=True), distinct=True),
            db_topic_count=Count('units__topics', filter=Q(units__aktif_mi=True, units__topics__aktif_mi=True), distinct=True),
            db_content_count=Count('units__topics__contents', filter=Q(
                units__aktif_mi=True, units__topics__aktif_mi=True, units__topics__contents__aktif_mi=True
            ), distinct=True),
        )
        
        # Filtering
        ders_id = self.request.query_params.get('ders')
        sinif_id = self.request.query_params.get('sinif_seviyesi')
        book_type_id = self.request.query_params.get('book_type')
        yayin_yili = self.request.query_params.get('yayin_yili')
        aktif = self.request.query_params.get('aktif')
        icerik_tamamlandi = self.request.query_params.get('icerik_tamamlandi')
        search = self.request.query_params.get('search')
        
        if ders_id:
            queryset = queryset.filter(ders_id=ders_id)
        if sinif_id:
            queryset = queryset.filter(
                Q(sinif_seviyesi_id=sinif_id) | Q(sinif_seviyeleri__id=sinif_id)
            ).distinct()
        if book_type_id:
            queryset = queryset.filter(book_type_id=book_type_id)
        if yayin_yili:
            queryset = queryset.filter(yayin_yili=yayin_yili)
        if aktif is not None:
            queryset = queryset.filter(aktif_mi=aktif.lower() == 'true')
        if icerik_tamamlandi is not None:
            queryset = queryset.filter(icerik_tamamlandi_mi=icerik_tamamlandi.lower() == 'true')
        if search:
            queryset = queryset.filter(ad__icontains=search)
        
        return queryset
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @action(detail=False, methods=['get'], url_path='suggest-kod')
    def suggest_kod(self, request):
        """Önerilen kitap kodu — GET /api/resources/books/suggest-kod/?book_type=&ders="""
        kurum_id = get_request_kurum_id(request)
        sube_id = get_request_sube_id(request, kurum_id=kurum_id)
        if not kurum_id or not sube_id:
            return Response(
                {'success': False, 'error': 'Kurum ve şube bağlamı gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        book_type_id = request.query_params.get('book_type')
        ders_id = request.query_params.get('ders')
        exclude_id = request.query_params.get('exclude_id')

        if not book_type_id or not ders_id:
            return Response(
                {'success': False, 'error': 'book_type ve ders parametreleri gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            book_type = BookType.objects.get(pk=book_type_id, aktif_mi=True)
            from apps.egitim_tanimlari.models import Ders
            ders = Ders.objects.get(pk=ders_id, aktif_mi=True)
        except (BookType.DoesNotExist, Ders.DoesNotExist):
            return Response({'success': False, 'error': 'Geçersiz ders veya kitap türü.'}, status=status.HTTP_400_BAD_REQUEST)

        kod = generate_book_kod(
            kurum_id,
            book_type,
            ders,
            exclude_id=int(exclude_id) if exclude_id else None,
            sube_id=sube_id,
        )
        return Response({'success': True, 'data': {'kod': kod}})

    @action(detail=True, methods=['post'], url_path='upload-kapak')
    def upload_kapak(self, request, pk=None):
        """Kitap kapağı yükle — 600x600 JPEG. POST multipart field: kapak"""
        from apps.resources.application.kapak import (
            process_kapak_image,
            resolve_book_kapak_url,
            validate_kapak_upload,
        )

        book = self.get_object()
        uploaded = request.FILES.get('kapak') or request.FILES.get('file')
        err = validate_kapak_upload(uploaded)
        if err:
            return Response({'success': False, 'error': err}, status=status.HTTP_400_BAD_REQUEST)

        try:
            processed = process_kapak_image(uploaded)
        except Exception:
            return Response(
                {'success': False, 'error': 'Görsel işlenemedi. Geçerli bir resim dosyası seçin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if book.kapak:
            book.kapak.delete(save=False)
        book.kapak.save(f'book_{book.id}_kapak.jpg', processed, save=False)
        book.kapak_url = ''
        book.save(update_fields=['kapak', 'kapak_url', 'updated_at'])

        return Response({
            'success': True,
            'message': 'Kapak görseli yüklendi.',
            'data': {'kapak_url': resolve_book_kapak_url(book)},
        })

    @action(detail=True, methods=['delete'], url_path='delete-kapak')
    def delete_kapak(self, request, pk=None):
        """Kitap kapağını kaldır."""
        from apps.resources.application.kapak import resolve_book_kapak_url

        book = self.get_object()
        if book.kapak:
            book.kapak.delete(save=False)
            book.kapak = None
        book.kapak_url = ''
        book.save(update_fields=['kapak', 'kapak_url', 'updated_at'])
        return Response({
            'success': True,
            'message': 'Kapak görseli silindi.',
            'data': {'kapak_url': resolve_book_kapak_url(book)},
        })

    @action(
        detail=False,
        methods=['get'],
        url_path='export',
        renderer_classes=[JSONRenderer, XlsxRenderer, CsvRenderer],
    )
    def export_books(self, request):
        """Filtrelenmiş kitap listesi — kolon seçimi/sıra ile JSON, CSV veya Excel."""
        from apps.resources.application.export import (
            EXPORT_COLUMNS,
            build_export_columns,
            build_export_meta,
            build_export_rows,
            build_export_stats,
            parse_column_keys,
        )

        kurum_id = get_request_kurum_id(request)
        sube_id = get_request_sube_id(request, kurum_id=kurum_id)
        if not kurum_id or not sube_id:
            return Response(
                {'success': False, 'error': 'Kurum ve şube bağlamı gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        column_keys = parse_column_keys(request.query_params.get('columns'))
        qs = self.filter_queryset(self.get_queryset()).order_by('sira', 'ad')
        ids_raw = request.query_params.get('ids')
        if ids_raw:
            try:
                id_list = [int(x) for x in ids_raw.split(',') if x.strip()]
                qs = qs.filter(id__in=id_list)
            except ValueError:
                pass

        books = list(qs[:5000])
        rows = build_export_rows(books, column_keys)
        fmt = (request.query_params.get('format') or 'json').lower()
        meta = build_export_meta(request, kurum_id=kurum_id, sube_id=sube_id)

        if fmt == 'csv':
            from shared.export import CsvExportService

            columns = build_export_columns(column_keys)
            return CsvExportService.export(rows, columns, meta=meta, filename='kaynak_kitaplar')

        if fmt == 'xlsx':
            from shared.export import ExcelExportService

            columns = build_export_columns(column_keys)
            stats = build_export_stats(rows)
            return ExcelExportService.export(
                rows, columns, meta=meta, stats=stats, filename='kaynak_kitaplar',
            )

        return Response({
            'success': True,
            'columns': column_keys,
            'column_labels': [EXPORT_COLUMNS[k] for k in column_keys],
            'rows': rows,
            'total': len(rows),
        })

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """Excel şablon indir — aktif şubedeki ders/sınıf + kitap türü açılır listeleri."""
        from django.http import HttpResponse
        from apps.resources.application.bulk_import import build_excel_template

        kurum_id = get_request_kurum_id(request)
        sube_id = get_request_sube_id(request, kurum_id=kurum_id)
        if not kurum_id or not sube_id:
            return Response(
                {'success': False, 'error': 'Kurum ve şube bağlamı gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = build_excel_template(kurum_id=kurum_id, sube_id=sube_id)
        resp = HttpResponse(
            data,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = 'attachment; filename="kaynak_kitap_sablonu.xlsx"'
        return resp

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Excel dosyasından toplu kitap yükleme."""
        from apps.resources.application.bulk_import import BulkBookImportService

        kurum_id = get_request_kurum_id(request)
        sube_id = get_request_sube_id(request, kurum_id=kurum_id)
        if not kurum_id or not sube_id:
            return Response(
                {'success': False, 'error': 'Kurum ve şube bağlamı gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        upload = request.FILES.get('file') or request.FILES.get('excel')
        if not upload:
            return Response(
                {'success': False, 'error': 'Excel dosyası gerekli (file).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        svc = BulkBookImportService(kurum_id=kurum_id, sube_id=sube_id)
        try:
            result = svc.import_excel(upload)
        except Exception as exc:
            return Response(
                {'success': False, 'error': f'Dosya okunamadı: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            'success': True,
            'data': result.to_dict(),
            'message': (
                f"{result.eklenen} kitap eklendi"
                + (f", {result.atlanan} atlandı" if result.atlanan else '')
                + (f", {result.hatali} hatalı" if result.hatali else '')
            ),
        })

    @action(detail=True, methods=['get'])
    def structure(self, request, pk=None):
        """
        Kitabın tam yapısını getir (units → topics → contents)
        GET /api/resources/books/{id}/structure/
        Opsiyonel: ?student_id= — ödev verirken atama üzerinden okuma
        """
        book = resolve_book_for_structure(request, pk)
        if not book:
            return Response(
                {
                    'success': False,
                    'error': (
                        'Kitap bulunamadı veya bu şube bağlamında görüntülenemiyor. '
                        'Üst bardaki şube seçimini kontrol edin.'
                    ),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        book = ResourceBook.objects.filter(pk=book.pk).prefetch_related(
            Prefetch(
                'units',
                queryset=ResourceUnit.objects.filter(aktif_mi=True).order_by('sira').prefetch_related(
                    Prefetch(
                        'topics',
                        queryset=ResourceTopic.objects.filter(aktif_mi=True).order_by('sira').prefetch_related(
                            Prefetch(
                                'contents',
                                queryset=ResourceContent.objects.filter(aktif_mi=True).order_by('sira')
                            )
                        )
                    )
                )
            )
        ).first()

        serializer = self.get_serializer(book)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        Kitabı tüm yapısıyla kopyala (units → topics → contents)
        POST /api/resources/books/{id}/duplicate/
        """
        source = self.get_queryset().prefetch_related(
            Prefetch(
                'units',
                queryset=ResourceUnit.objects.order_by('sira').prefetch_related(
                    Prefetch(
                        'topics',
                        queryset=ResourceTopic.objects.order_by('sira').prefetch_related(
                            Prefetch(
                                'contents',
                                queryset=ResourceContent.objects.order_by('sira')
                            )
                        )
                    )
                )
            )
        ).filter(pk=pk).first()
        if not source:
            return Response({'success': False, 'error': 'Kitap bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
        
        new_ad = request.data.get('ad', f"{source.ad} (Kopya)")
        new_kod = request.data.get('kod', f"{source.kod}_COPY")
        
        with transaction.atomic():
            # Duplicate book
            new_book = ResourceBook.objects.create(
                ad=new_ad,
                kod=new_kod,
                kurum=source.kurum,
                sube=source.sube,
                book_type=source.book_type,
                ders=source.ders,
                sinif_seviyesi=source.sinif_seviyesi,
                yayinevi=source.yayinevi,
                yazar=source.yazar,
                yayin_yili=source.yayin_yili,
                toplam_sayfa=source.toplam_sayfa,
                isbn='',
                zorluk_min=source.zorluk_min,
                zorluk_max=source.zorluk_max,
                kapak_url=source.kapak_url,
                aciklama=source.aciklama,
                aktif_mi=True,
                icerik_tamamlandi_mi=False,
                sira=source.sira,
            )
            if source.kapak:
                try:
                    source.kapak.open('rb')
                    new_book.kapak.save(
                        f'book_{new_book.id}_kapak.jpg',
                        source.kapak,
                        save=True,
                    )
                except Exception:
                    pass
            source_levels = list(source.sinif_seviyeleri.all())
            if source_levels:
                new_book.sinif_seviyeleri.set(source_levels)
            elif source.sinif_seviyesi_id:
                new_book.sinif_seviyeleri.set([source.sinif_seviyesi_id])
            
            unit_count = 0
            topic_count = 0
            content_count = 0
            
            for unit in source.units.all():
                new_unit = ResourceUnit.objects.create(
                    book=new_book,
                    ad=unit.ad,
                    kod=unit.kod,
                    sira=unit.sira,
                    aciklama=unit.aciklama,
                    aktif_mi=unit.aktif_mi,
                )
                unit_count += 1
                
                for topic in unit.topics.all():
                    new_topic = ResourceTopic.objects.create(
                        unit=new_unit,
                        ad=topic.ad,
                        kod=topic.kod,
                        sira=topic.sira,
                        aciklama=topic.aciklama,
                        aktif_mi=topic.aktif_mi,
                    )
                    topic_count += 1
                    
                    for content in topic.contents.all():
                        ResourceContent.objects.create(
                            topic=new_topic,
                            ad=content.ad,
                            content_type=content.content_type,
                            sira=content.sira,
                            question_count=content.question_count,
                            difficulty=content.difficulty,
                            page_start=content.page_start,
                            page_end=content.page_end,
                            estimated_minutes=content.estimated_minutes,
                            video_url=content.video_url,
                            video_duration=content.video_duration,
                            aciklama=content.aciklama,
                            aktif_mi=content.aktif_mi,
                        )
                        content_count += 1
        
        return Response({
            'success': True,
            'data': {
                'id': new_book.id,
                'ad': new_book.ad,
                'kod': new_book.kod,
            },
            'message': f'Kitap başarıyla kopyalandı: {unit_count} ünite, {topic_count} konu, {content_count} içerik.'
        }, status=status.HTTP_201_CREATED)
    
    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        data = response.data
        count = len(data) if isinstance(data, list) else 0
        resp = Response({
            'success': True,
            'data': data,
            'count': count,
        })
        resp['Cache-Control'] = 'no-store'
        resp['Vary'] = 'X-Sube-ID, X-Kurum-ID'
        return resp
    
    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            self.perform_create(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Kitap başarıyla oluşturuldu.'
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            self.perform_update(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Kitap başarıyla güncellendi.'
            })
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({
            'success': True,
            'message': 'Kitap başarıyla silindi.'
        }, status=status.HTTP_200_OK)


class ResourceUnitViewSet(viewsets.ModelViewSet):
    """
    Ünite API ViewSet
    
    list: GET /api/resources/units/
    create: POST /api/resources/units/
    retrieve: GET /api/resources/units/{id}/
    update: PUT /api/resources/units/{id}/
    destroy: DELETE /api/resources/units/{id}/
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated, IsAuthenticatedResourceReadOrAdminWrite]
    queryset = ResourceUnit.objects.select_related('book')
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ResourceUnitDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ResourceUnitWriteSerializer
        return ResourceUnitSerializer
    
    def get_queryset(self):
        queryset = filter_by_book_kurum_for_request(super().get_queryset(), self.request)
        
        book_id = self.request.query_params.get('book')
        if book_id:
            queryset = queryset.filter(book_id=book_id)
        
        aktif = self.request.query_params.get('aktif')
        if aktif is not None:
            queryset = queryset.filter(aktif_mi=aktif.lower() == 'true')
        
        return queryset.order_by('sira')
    
    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            self.perform_create(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Ünite başarıyla oluşturuldu.'
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            self.perform_update(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Ünite başarıyla güncellendi.'
            })
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({
            'success': True,
            'message': 'Ünite başarıyla silindi.'
        })

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """
        Ünite sırasını güncelle
        POST /api/resources/units/reorder/
        Body: { "ordered_ids": [3, 1, 2] }
        """
        ordered_ids = request.data.get('ordered_ids', [])
        if not ordered_ids:
            return Response({'success': False, 'error': 'ordered_ids gerekli'}, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            for index, unit_id in enumerate(ordered_ids):
                ResourceUnit.objects.filter(pk=unit_id).update(sira=index + 1)
        
        return Response({'success': True, 'message': 'Sıralama güncellendi.'})

    @action(detail=False, methods=['get'], url_path='suggest-kod')
    def suggest_kod(self, request):
        """Önerilen ünite kodu — GET /api/resources/units/suggest-kod/?book="""
        book_id = request.query_params.get('book')
        exclude_id = request.query_params.get('exclude_id')
        if not book_id:
            return Response(
                {'success': False, 'error': 'book parametresi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        book = filter_by_book_kurum_for_request(
            ResourceBook.objects.filter(pk=book_id), request
        ).first()
        if not book:
            return Response({'success': False, 'error': 'Kitap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        kod = generate_unit_kod(
            book,
            exclude_id=int(exclude_id) if exclude_id else None,
        )
        return Response({'success': True, 'data': {'kod': kod}})

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        Üniteyi tüm konuları ve içerikleriyle kopyala.
        POST /api/resources/units/{id}/duplicate/
        Body: { "ad": "...", "kod": "..." }  (kod opsiyonel)
        """
        source = self.get_queryset().prefetch_related(
            Prefetch(
                'topics',
                queryset=ResourceTopic.objects.order_by('sira').prefetch_related(
                    Prefetch(
                        'contents',
                        queryset=ResourceContent.objects.order_by('sira'),
                    )
                ),
            )
        ).filter(pk=pk).first()
        if not source:
            return Response(
                {'success': False, 'error': 'Ünite bulunamadı'},
                status=status.HTTP_404_NOT_FOUND,
            )

        new_ad = (request.data.get('ad') or f'{source.ad} (Kopya)').strip()
        if not new_ad:
            return Response(
                {'success': False, 'error': 'Ünite adı zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_kod = (request.data.get('kod') or '').strip() or generate_unit_kod(source.book)

        if ResourceUnit.objects.filter(book=source.book, kod=new_kod).exists():
            return Response(
                {'success': False, 'error': f'Bu kitapta "{new_kod}" kodu zaten var.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_sira = (
            ResourceUnit.objects.filter(book=source.book)
            .aggregate(m=Max('sira'))
            .get('m')
            or 0
        )

        with transaction.atomic():
            new_unit = ResourceUnit.objects.create(
                book=source.book,
                ad=new_ad,
                kod=new_kod,
                sira=max_sira + 1,
                aciklama=source.aciklama,
                aktif_mi=source.aktif_mi,
            )
            topic_count = 0
            content_count = 0
            for topic in source.topics.all():
                new_topic = ResourceTopic.objects.create(
                    unit=new_unit,
                    ad=topic.ad,
                    kod=topic.kod,
                    sira=topic.sira,
                    aciklama=topic.aciklama,
                    aktif_mi=topic.aktif_mi,
                )
                topic_count += 1
                for content in topic.contents.all():
                    ResourceContent.objects.create(
                        topic=new_topic,
                        ad=content.ad,
                        content_type=content.content_type,
                        sira=content.sira,
                        question_count=content.question_count,
                        difficulty=content.difficulty,
                        page_start=content.page_start,
                        page_end=content.page_end,
                        estimated_minutes=content.estimated_minutes,
                        video_url=content.video_url,
                        video_duration=content.video_duration,
                        aciklama=content.aciklama,
                        aktif_mi=content.aktif_mi,
                    )
                    content_count += 1

        return Response(
            {
                'success': True,
                'data': {'id': new_unit.id, 'ad': new_unit.ad, 'kod': new_unit.kod},
                'message': (
                    f'Ünite kopyalandı: {topic_count} konu, {content_count} içerik.'
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class ResourceTopicViewSet(viewsets.ModelViewSet):
    """
    Konu API ViewSet
    
    list: GET /api/resources/topics/
    create: POST /api/resources/topics/
    retrieve: GET /api/resources/topics/{id}/
    update: PUT /api/resources/topics/{id}/
    destroy: DELETE /api/resources/topics/{id}/
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated, IsAuthenticatedResourceReadOrAdminWrite]
    queryset = ResourceTopic.objects.select_related('unit', 'unit__book')
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ResourceTopicDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ResourceTopicWriteSerializer
        return ResourceTopicSerializer
    
    def get_queryset(self):
        queryset = filter_by_book_kurum_for_request(
            super().get_queryset(), self.request, kurum_lookup='unit__book__kurum_id'
        )
        unit_id = self.request.query_params.get('unit')
        if unit_id:
            queryset = queryset.filter(unit_id=unit_id)
        
        book_id = self.request.query_params.get('book')
        if book_id:
            queryset = queryset.filter(unit__book_id=book_id)
        
        aktif = self.request.query_params.get('aktif')
        if aktif is not None:
            queryset = queryset.filter(aktif_mi=aktif.lower() == 'true')
        
        return queryset.order_by('sira')
    
    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            self.perform_create(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Konu başarıyla oluşturuldu.'
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            self.perform_update(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'Konu başarıyla güncellendi.'
            })
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({
            'success': True,
            'message': 'Konu başarıyla silindi.'
        })

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """
        Konu sırasını güncelle
        POST /api/resources/topics/reorder/
        Body: { "ordered_ids": [3, 1, 2] }
        """
        ordered_ids = request.data.get('ordered_ids', [])
        if not ordered_ids:
            return Response({'success': False, 'error': 'ordered_ids gerekli'}, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            for index, topic_id in enumerate(ordered_ids):
                ResourceTopic.objects.filter(pk=topic_id).update(sira=index + 1)
        
        return Response({'success': True, 'message': 'Sıralama güncellendi.'})

    @action(detail=False, methods=['get'], url_path='suggest-kod')
    def suggest_kod(self, request):
        """Önerilen konu kodu — GET /api/resources/topics/suggest-kod/?unit="""
        unit_id = request.query_params.get('unit')
        exclude_id = request.query_params.get('exclude_id')
        if not unit_id:
            return Response(
                {'success': False, 'error': 'unit parametresi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        unit = filter_by_book_kurum_for_request(
            ResourceUnit.objects.filter(pk=unit_id), request
        ).first()
        if not unit:
            return Response({'success': False, 'error': 'Ünite bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        kod = generate_topic_kod(
            unit,
            exclude_id=int(exclude_id) if exclude_id else None,
        )
        return Response({'success': True, 'data': {'kod': kod}})

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        Konuyu tüm içerikleriyle kopyala.
        POST /api/resources/topics/{id}/duplicate/
        Body: { "ad": "...", "kod": "..." }  (kod opsiyonel)
        """
        source = self.get_queryset().prefetch_related(
            Prefetch(
                'contents',
                queryset=ResourceContent.objects.order_by('sira'),
            )
        ).filter(pk=pk).first()
        if not source:
            return Response(
                {'success': False, 'error': 'Konu bulunamadı'},
                status=status.HTTP_404_NOT_FOUND,
            )

        new_ad = (request.data.get('ad') or f'{source.ad} (Kopya)').strip()
        if not new_ad:
            return Response(
                {'success': False, 'error': 'Konu adı zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_kod = (request.data.get('kod') or '').strip() or generate_topic_kod(source.unit)

        if ResourceTopic.objects.filter(unit=source.unit, kod=new_kod).exists():
            return Response(
                {'success': False, 'error': f'Bu ünitede "{new_kod}" kodu zaten var.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_sira = (
            ResourceTopic.objects.filter(unit=source.unit)
            .aggregate(m=Max('sira'))
            .get('m')
            or 0
        )

        with transaction.atomic():
            new_topic = ResourceTopic.objects.create(
                unit=source.unit,
                ad=new_ad,
                kod=new_kod,
                sira=max_sira + 1,
                aciklama=source.aciklama,
                aktif_mi=source.aktif_mi,
            )
            content_count = 0
            for content in source.contents.all():
                ResourceContent.objects.create(
                    topic=new_topic,
                    ad=content.ad,
                    content_type=content.content_type,
                    sira=content.sira,
                    question_count=content.question_count,
                    difficulty=content.difficulty,
                    page_start=content.page_start,
                    page_end=content.page_end,
                    estimated_minutes=content.estimated_minutes,
                    video_url=content.video_url,
                    video_duration=content.video_duration,
                    aciklama=content.aciklama,
                    aktif_mi=content.aktif_mi,
                )
                content_count += 1

        return Response(
            {
                'success': True,
                'data': {'id': new_topic.id, 'ad': new_topic.ad, 'kod': new_topic.kod},
                'message': f'Konu kopyalandı: {content_count} içerik.',
            },
            status=status.HTTP_201_CREATED,
        )


class ResourceContentViewSet(viewsets.ModelViewSet):
    """
    İçerik API ViewSet
    
    list: GET /api/resources/contents/
    create: POST /api/resources/contents/
    retrieve: GET /api/resources/contents/{id}/
    update: PUT /api/resources/contents/{id}/
    destroy: DELETE /api/resources/contents/{id}/
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated, IsAuthenticatedResourceReadOrAdminWrite]
    queryset = ResourceContent.objects.select_related('topic', 'topic__unit', 'topic__unit__book')
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ResourceContentWriteSerializer
        return ResourceContentSerializer
    
    def get_queryset(self):
        queryset = filter_by_book_kurum_for_request(
            super().get_queryset(), self.request, kurum_lookup='topic__unit__book__kurum_id'
        )
        topic_id = self.request.query_params.get('topic')
        if topic_id:
            queryset = queryset.filter(topic_id=topic_id)
        
        unit_id = self.request.query_params.get('unit')
        if unit_id:
            queryset = queryset.filter(topic__unit_id=unit_id)
        
        book_id = self.request.query_params.get('book')
        if book_id:
            queryset = queryset.filter(topic__unit__book_id=book_id)
        
        content_type = self.request.query_params.get('content_type')
        if content_type:
            queryset = queryset.filter(content_type=content_type)
        
        aktif = self.request.query_params.get('aktif')
        if aktif is not None:
            queryset = queryset.filter(aktif_mi=aktif.lower() == 'true')
        
        return queryset.order_by('sira')
    
    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data
        })
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            self.perform_create(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'İçerik başarıyla oluşturuldu.'
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            self.perform_update(serializer)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': 'İçerik başarıyla güncellendi.'
            })
        return Response({
            'success': False,
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({
            'success': True,
            'message': 'İçerik başarıyla silindi.'
        })

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        İçeriği (test vb.) hemen altına kopyala; ad numarasını +1 yap.
        POST /api/resources/contents/{id}/duplicate/
        Body opsiyonel: { "ad": "Test-2" }
        """
        with transaction.atomic():
            source = (
                self.get_queryset()
                .select_for_update()
                .filter(pk=pk)
                .first()
            )
            if not source:
                return Response(
                    {'success': False, 'error': 'İçerik bulunamadı'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            new_ad = (request.data.get('ad') or '').strip()
            if not new_ad:
                new_ad = next_incremented_content_name(source.ad)

            # Kaynakın altındaki tüm içerikleri bir sıra kaydır
            ResourceContent.objects.filter(
                topic_id=source.topic_id,
                sira__gt=source.sira,
            ).update(sira=F('sira') + 1)

            new_content = ResourceContent.objects.create(
                topic=source.topic,
                ad=new_ad,
                content_type=source.content_type,
                sira=source.sira + 1,
                question_count=source.question_count,
                difficulty=source.difficulty,
                page_start=source.page_start,
                page_end=source.page_end,
                estimated_minutes=source.estimated_minutes,
                video_url=source.video_url,
                video_duration=source.video_duration,
                aciklama=source.aciklama,
                aktif_mi=source.aktif_mi,
            )

        return Response(
            {
                'success': True,
                'data': ResourceContentSerializer(new_content).data,
                'message': f'Çoğaltıldı: {new_content.ad}',
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'], url_path='next-test-batch')
    def next_test_batch(self, request):
        """
        Toplu test adlandırma önizlemesi
        GET /api/resources/contents/next-test-batch/?topic=&count=&mode=numbered|series&prefix=&start=auto|7
        """
        topic_id = request.query_params.get('topic')
        if not topic_id:
            return Response(
                {'success': False, 'error': 'topic parametresi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        topic = filter_by_book_kurum_for_request(
            ResourceTopic.objects.filter(pk=topic_id), request, kurum_lookup='unit__book__kurum_id'
        ).first()
        if not topic:
            return Response({'success': False, 'error': 'Konu bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        mode = request.query_params.get('mode', 'numbered')
        prefix = request.query_params.get('prefix', '')
        start = request.query_params.get('start', 'auto')
        try:
            count = int(request.query_params.get('count', '1'))
        except (TypeError, ValueError):
            return Response(
                {'success': False, 'error': 'Geçersiz count parametresi.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            batch = build_test_batch(
                int(topic_id),
                mode=mode,
                prefix=prefix,
                count=count,
                start=start,
            )
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'success': True, 'data': batch})

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """
        İçerik sırasını güncelle
        POST /api/resources/contents/reorder/
        Body: { "ordered_ids": [3, 1, 2] }
        """
        ordered_ids = request.data.get('ordered_ids', [])
        if not ordered_ids:
            return Response({'success': False, 'error': 'ordered_ids gerekli'}, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            for index, content_id in enumerate(ordered_ids):
                ResourceContent.objects.filter(pk=content_id).update(sira=index + 1)
        
        return Response({'success': True, 'message': 'Sıralama güncellendi.'})
