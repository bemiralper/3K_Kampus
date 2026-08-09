"""
Resources Serializers
DRF Serializers for Book-based Content Library
"""
import re

from rest_framework import serializers
from apps.egitim_tanimlari.models import SinifSeviyesi
from .models import (
    BookType,
    ResourceBook,
    ResourcePublisher,
    ResourceUnit,
    ResourceTopic,
    ResourceContent,
)
from .scoping import get_request_kurum_id, get_request_sube_id
from .application.publisher_resolve import resolve_or_create_publisher
from .utils import (
    generate_book_kod,
    generate_topic_kod,
    generate_unit_kod,
    normalize_kod,
    to_title_case_tr,
)


class AutoKodWriteMixin:
    """UniqueTogetherValidator runs before validate(); ensure kod key exists on create."""

    def to_internal_value(self, data):
        if self.instance is None and isinstance(data, dict) and 'kod' not in data:
            data = {**data, 'kod': ''}
        return super().to_internal_value(data)


def _sinif_seviyeleri_ad(obj) -> str:
    levels = list(obj.sinif_seviyeleri.all())
    if levels:
        return ', '.join(s.ad for s in levels)
    if obj.sinif_seviyesi_id:
        return obj.sinif_seviyesi.ad
    return ''


class BookTypeSerializer(serializers.ModelSerializer):
    """Kitap Türü serializer"""
    
    class Meta:
        model = BookType
        fields = ['id', 'kod', 'ad', 'renk', 'ikon', 'aciklama', 'aktif_mi', 'sira']


class ResourcePublisherSerializer(serializers.ModelSerializer):
    """Yayınevi serializer — list annotate alanları opsiyonel."""

    book_count = serializers.IntegerField(read_only=True, required=False, default=0)
    used_book_count = serializers.IntegerField(read_only=True, required=False, default=0)
    student_usage_count = serializers.IntegerField(read_only=True, required=False, default=0)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = ResourcePublisher
        fields = [
            'id', 'kurum_id', 'ad', 'kisa_ad', 'logo', 'logo_url',
            'aktif_mi', 'aciklama', 'eslesme_anahtarlari', 'sira',
            'book_count', 'used_book_count', 'student_usage_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['kurum_id', 'logo', 'created_at', 'updated_at']

    def get_logo_url(self, obj):
        # Kitap kapakları gibi göreli /media/... — Next rewrite ile uyumlu
        if not obj.logo:
            return ''
        try:
            from apps.resources.application.kapak import media_path_url
            return media_path_url(obj.logo.name)
        except (ValueError, AttributeError):
            return ''

    def validate_ad(self, value):
        ad = re.sub(r'\s+', ' ', (value or '').strip())
        if not ad:
            raise serializers.ValidationError('Yayınevi adı zorunludur.')
        request = self.context.get('request')
        kurum_id = get_request_kurum_id(request) if request else None
        if kurum_id:
            qs = ResourcePublisher.objects.filter(kurum_id=kurum_id, ad__iexact=ad)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            existing = qs.first()
            if existing:
                raise serializers.ValidationError(
                    f'"{existing.ad}" adıyla bu kurumda zaten bir yayınevi var '
                    '(büyük/küçük harf farkı sayılmaz). Aynı yayınevini tekrar oluşturmak yerine '
                    'mevcut kaydı kullanın.'
                )
        return ad

    def create(self, validated_data):
        request = self.context.get('request')
        kurum_id = get_request_kurum_id(request) if request else None
        if not kurum_id:
            raise serializers.ValidationError({'kurum': 'Kurum bağlamı gerekli.'})
        validated_data['kurum_id'] = kurum_id
        if not validated_data.get('kisa_ad'):
            validated_data['kisa_ad'] = validated_data['ad'][:100]
        return super().create(validated_data)


class ResourceContentSerializer(serializers.ModelSerializer):
    """İçerik serializer"""
    content_type_display = serializers.CharField(source='get_content_type_display', read_only=True)
    difficulty_display = serializers.CharField(source='get_difficulty_display', read_only=True)
    page_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = ResourceContent
        fields = [
            'id', 'ad', 'content_type', 'content_type_display', 'sira',
            'question_count', 'difficulty', 'difficulty_display',
            'page_start', 'page_end', 'page_count',
            'estimated_minutes', 'video_url', 'video_duration',
            'aciklama', 'aktif_mi', 'created_at', 'updated_at'
        ]


class ResourceTopicSerializer(serializers.ModelSerializer):
    """Konu serializer"""
    content_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = ResourceTopic
        fields = [
            'id', 'ad', 'kod', 'sira', 'aciklama', 'aktif_mi',
            'content_count', 'created_at', 'updated_at'
        ]


class ResourceTopicDetailSerializer(serializers.ModelSerializer):
    """Konu detay serializer - içerikler dahil"""
    contents = ResourceContentSerializer(many=True, read_only=True)
    content_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = ResourceTopic
        fields = [
            'id', 'ad', 'kod', 'sira', 'aciklama', 'aktif_mi',
            'content_count', 'contents', 'created_at', 'updated_at'
        ]


class ResourceUnitSerializer(serializers.ModelSerializer):
    """Ünite serializer"""
    topic_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = ResourceUnit
        fields = [
            'id', 'ad', 'kod', 'sira', 'aciklama', 'aktif_mi',
            'topic_count', 'created_at', 'updated_at'
        ]


class ResourceUnitDetailSerializer(serializers.ModelSerializer):
    """Ünite detay serializer - konular dahil"""
    topics = ResourceTopicDetailSerializer(many=True, read_only=True)
    topic_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = ResourceUnit
        fields = [
            'id', 'ad', 'kod', 'sira', 'aciklama', 'aktif_mi',
            'topic_count', 'topics', 'created_at', 'updated_at'
        ]


def _serialize_kapak_url(obj):
    from apps.resources.application.kapak import resolve_book_kapak_url
    return resolve_book_kapak_url(obj)


class ResourceBookSerializer(serializers.ModelSerializer):
    """Kitap serializer"""
    book_type_display = serializers.CharField(source='book_type.ad', read_only=True)
    book_type_renk = serializers.CharField(source='book_type.renk', read_only=True)
    ders_ad = serializers.CharField(source='ders.ad', read_only=True)
    sinif_seviyesi_ad = serializers.SerializerMethodField()
    sinif_seviyeleri = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    sinif_seviyeleri_ad = serializers.SerializerMethodField()
    publisher = serializers.PrimaryKeyRelatedField(read_only=True)
    yayinevi = serializers.SerializerMethodField()
    
    # DB-level annotated counts (no more N+1)
    unit_count = serializers.IntegerField(source='db_unit_count', read_only=True, default=0)
    topic_count = serializers.IntegerField(source='db_topic_count', read_only=True, default=0)
    content_count = serializers.IntegerField(source='db_content_count', read_only=True, default=0)
    total_question_count = serializers.IntegerField(
        source='db_total_question_count', read_only=True, default=0,
    )
    
    zorluk_display = serializers.SerializerMethodField()
    kapak_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ResourceBook
        fields = [
            'id', 'ad', 'kod', 'kurum_id', 'sube_id', 'book_type', 'book_type_display', 'book_type_renk',
            'ders', 'ders_ad', 'sinif_seviyesi', 'sinif_seviyesi_ad',
            'sinif_seviyeleri', 'sinif_seviyeleri_ad',
            'publisher', 'yayinevi', 'yazar', 'yayin_yili', 'toplam_sayfa', 'isbn',
            'zorluk_min', 'zorluk_max', 'zorluk_display',
            'kapak_url', 'aciklama', 'aktif_mi', 'icerik_tamamlandi_mi', 'sira',
            'unit_count', 'topic_count', 'content_count', 'total_question_count',
            'created_at', 'updated_at'
        ]
    
    def get_yayinevi(self, obj):
        return obj.yayinevi or ''

    def get_sinif_seviyesi_ad(self, obj):
        return _sinif_seviyeleri_ad(obj)

    def get_sinif_seviyeleri_ad(self, obj):
        return _sinif_seviyeleri_ad(obj)
    
    def get_zorluk_display(self, obj):
        if obj.zorluk_min is not None and obj.zorluk_max is not None:
            return f"{obj.zorluk_min}-{obj.zorluk_max}"
        elif obj.zorluk_min is not None:
            return f"{obj.zorluk_min}+"
        elif obj.zorluk_max is not None:
            return f"0-{obj.zorluk_max}"
        return None

    def get_kapak_url(self, obj):
        return _serialize_kapak_url(obj)


class ResourceBookDetailSerializer(serializers.ModelSerializer):
    """Kitap detay serializer - üniteler dahil"""
    book_type_display = serializers.CharField(source='book_type.ad', read_only=True)
    book_type_renk = serializers.CharField(source='book_type.renk', read_only=True)
    ders_ad = serializers.CharField(source='ders.ad', read_only=True)
    sinif_seviyesi_ad = serializers.SerializerMethodField()
    sinif_seviyeleri = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    sinif_seviyeleri_ad = serializers.SerializerMethodField()
    publisher = serializers.PrimaryKeyRelatedField(read_only=True)
    yayinevi = serializers.SerializerMethodField()
    units = ResourceUnitDetailSerializer(many=True, read_only=True)
    unit_count = serializers.IntegerField(read_only=True)
    topic_count = serializers.IntegerField(read_only=True)
    content_count = serializers.IntegerField(read_only=True)
    total_question_count = serializers.IntegerField(
        source='db_total_question_count', read_only=True, default=0,
    )
    zorluk_display = serializers.SerializerMethodField()
    kapak_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ResourceBook
        fields = [
            'id', 'ad', 'kod', 'kurum_id', 'sube_id', 'book_type', 'book_type_display', 'book_type_renk',
            'ders', 'ders_ad', 'sinif_seviyesi', 'sinif_seviyesi_ad',
            'sinif_seviyeleri', 'sinif_seviyeleri_ad',
            'publisher', 'yayinevi', 'yazar', 'yayin_yili', 'toplam_sayfa', 'isbn',
            'zorluk_min', 'zorluk_max', 'zorluk_display',
            'kapak_url', 'aciklama', 'aktif_mi', 'icerik_tamamlandi_mi', 'sira',
            'unit_count', 'topic_count', 'content_count', 'total_question_count', 'units',
            'created_at', 'updated_at'
        ]

    def get_yayinevi(self, obj):
        return obj.yayinevi or ''
    
    def get_sinif_seviyesi_ad(self, obj):
        return _sinif_seviyeleri_ad(obj)

    def get_sinif_seviyeleri_ad(self, obj):
        return _sinif_seviyeleri_ad(obj)
    
    def get_zorluk_display(self, obj):
        if obj.zorluk_min is not None and obj.zorluk_max is not None:
            return f"{obj.zorluk_min}-{obj.zorluk_max}"
        elif obj.zorluk_min is not None:
            return f"{obj.zorluk_min}+"
        elif obj.zorluk_max is not None:
            return f"0-{obj.zorluk_max}"
        return None

    def get_kapak_url(self, obj):
        return _serialize_kapak_url(obj)


class ResourceBookStructureSerializer(serializers.ModelSerializer):
    """
    Kitap yapısı serializer - sadece nested struktur
    GET /api/resources/books/{id}/structure/
    """
    units = ResourceUnitDetailSerializer(many=True, read_only=True)
    
    class Meta:
        model = ResourceBook
        fields = ['id', 'ad', 'kod', 'icerik_tamamlandi_mi', 'units']


# Write serializers
class ResourceContentWriteSerializer(serializers.ModelSerializer):
    """İçerik oluşturma/güncelleme serializer"""
    
    class Meta:
        model = ResourceContent
        fields = [
            'id', 'topic', 'ad', 'content_type', 'sira',
            'question_count', 'difficulty',
            'page_start', 'page_end',
            'estimated_minutes', 'video_url', 'video_duration',
            'aciklama', 'aktif_mi'
        ]
    
    def validate(self, data):
        """İçerik tipine göre alan doğrulama (partial update'te instance alanlarını kullan)"""
        instance = getattr(self, 'instance', None)
        content_type = data.get(
            'content_type',
            getattr(instance, 'content_type', None),
        )

        if content_type == 'TEST_SET':
            question_count = data.get(
                'question_count',
                getattr(instance, 'question_count', None),
            )
            if not question_count:
                raise serializers.ValidationError({
                    'question_count': 'Test seti için soru sayısı zorunludur.'
                })

        if content_type == 'PAGE_RANGE':
            page_start = data.get(
                'page_start',
                getattr(instance, 'page_start', None),
            )
            page_end = data.get(
                'page_end',
                getattr(instance, 'page_end', None),
            )
            if page_start and page_end and page_start > page_end:
                raise serializers.ValidationError({
                    'page_end': 'Bitiş sayfası başlangıç sayfasından küçük olamaz.'
                })

        if content_type == 'VIDEO':
            video_url = data.get(
                'video_url',
                getattr(instance, 'video_url', None),
            )
            if not video_url:
                raise serializers.ValidationError({
                    'video_url': 'Video içeriği için URL zorunludur.'
                })
        
        return data


class ResourceTopicWriteSerializer(AutoKodWriteMixin, serializers.ModelSerializer):
    """Konu oluşturma/güncelleme serializer"""
    kod = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = ResourceTopic
        fields = ['id', 'unit', 'ad', 'kod', 'sira', 'aciklama', 'aktif_mi']

    def validate(self, data):
        if 'ad' in data and data['ad'] is not None:
            data['ad'] = to_title_case_tr(data['ad'])
        if self.instance is None or 'kod' in data:
            kod = (data.get('kod') or '').strip()
            if kod:
                data['kod'] = normalize_kod(kod)
            elif self.instance is None:
                unit = data.get('unit')
                if unit:
                    data['kod'] = generate_topic_kod(unit)
                else:
                    raise serializers.ValidationError({'kod': 'Ünite gerekli.'})
            else:
                data.pop('kod', None)
        return data


class ResourceUnitWriteSerializer(AutoKodWriteMixin, serializers.ModelSerializer):
    """Ünite oluşturma/güncelleme serializer"""
    kod = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = ResourceUnit
        fields = ['id', 'book', 'ad', 'kod', 'sira', 'aciklama', 'aktif_mi']

    def validate(self, data):
        if 'ad' in data and data['ad'] is not None:
            data['ad'] = to_title_case_tr(data['ad'])
        if self.instance is None or 'kod' in data:
            kod = (data.get('kod') or '').strip()
            if kod:
                data['kod'] = normalize_kod(kod)
            elif self.instance is None:
                book = data.get('book')
                if book:
                    data['kod'] = generate_unit_kod(book)
                else:
                    raise serializers.ValidationError({'kod': 'Kitap gerekli.'})
            else:
                data.pop('kod', None)
        return data


class ResourceBookWriteSerializer(AutoKodWriteMixin, serializers.ModelSerializer):
    """Kitap oluşturma/güncelleme serializer"""
    kod = serializers.CharField(required=False, allow_blank=True)
    sinif_seviyeleri = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=SinifSeviyesi.objects.filter(aktif_mi=True),
        required=False,
    )
    publisher = serializers.PrimaryKeyRelatedField(
        queryset=ResourcePublisher.objects.all(),
        required=False,
        allow_null=True,
    )
    # Geriye dönük: string yayınevi → publisher çözümle
    yayinevi = serializers.CharField(required=False, allow_blank=True, write_only=True)
    
    class Meta:
        model = ResourceBook
        fields = [
            'id', 'ad', 'kod', 'book_type',
            'ders', 'sinif_seviyesi', 'sinif_seviyeleri',
            'publisher', 'yayinevi', 'yazar', 'yayin_yili', 'toplam_sayfa', 'isbn',
            'zorluk_min', 'zorluk_max',
            'kapak_url', 'aciklama', 'aktif_mi', 'icerik_tamamlandi_mi', 'sira'
        ]
    
    def _resolve_sinif_seviyeleri(self, data):
        sinif_list = data.get('sinif_seviyeleri') or []
        sinif_single = data.get('sinif_seviyesi')
        if sinif_list:
            data['sinif_seviyesi'] = sinif_list[0]
            return sinif_list
        if sinif_single:
            data['sinif_seviyeleri'] = [sinif_single]
            return [sinif_single]
        raise serializers.ValidationError({'sinif_seviyeleri': 'En az bir sınıf seviyesi seçin.'})

    def validate(self, data):
        zorluk_min = data.get('zorluk_min')
        zorluk_max = data.get('zorluk_max')
        
        if zorluk_min is not None:
            if zorluk_min < 0 or zorluk_min > 10:
                raise serializers.ValidationError({'zorluk_min': 'Zorluk seviyesi 0-10 arasında olmalıdır.'})
        
        if zorluk_max is not None:
            if zorluk_max < 0 or zorluk_max > 10:
                raise serializers.ValidationError({'zorluk_max': 'Zorluk seviyesi 0-10 arasında olmalıdır.'})
        
        if zorluk_min is not None and zorluk_max is not None and zorluk_min > zorluk_max:
            raise serializers.ValidationError({'zorluk_max': 'Maksimum zorluk, minimum zorluktan küçük olamaz.'})

        if self.instance is None or 'sinif_seviyeleri' in data or 'sinif_seviyesi' in data:
            self._resolve_sinif_seviyeleri(data)

        if self.instance is None or 'kod' in data:
            kod = (data.get('kod') or '').strip()
            if kod:
                data['kod'] = normalize_kod(kod)
            elif self.instance is None:
                request = self.context.get('request')
                kurum_id = get_request_kurum_id(request) if request else None
                sube_id = get_request_sube_id(request, kurum_id=kurum_id) if request else None
                book_type = data.get('book_type')
                ders = data.get('ders')
                if kurum_id and book_type and ders:
                    data['kod'] = generate_book_kod(
                        kurum_id, book_type, ders, sube_id=sube_id,
                    )
                else:
                    raise serializers.ValidationError({'kod': 'Ders ve kitap türü seçin.'})
            else:
                data.pop('kod', None)

        request = self.context.get('request')
        kurum_id = get_request_kurum_id(request) if request else None
        yayinevi_raw = data.pop('yayinevi', serializers.empty)
        if yayinevi_raw is not serializers.empty and 'publisher' not in data:
            if yayinevi_raw:
                pub = resolve_or_create_publisher(kurum_id, yayinevi_raw)
                data['publisher'] = pub
            else:
                data['publisher'] = None
        elif data.get('publisher') is not None and kurum_id:
            if data['publisher'].kurum_id != kurum_id:
                raise serializers.ValidationError({'publisher': 'Yayınevi bu kuruma ait değil.'})
        
        return data

    def create(self, validated_data):
        validated_data.pop('yayinevi', None)
        sinif_list = validated_data.pop('sinif_seviyeleri', [])
        request = self.context.get('request')
        kurum_id = get_request_kurum_id(request) if request else None
        sube_id = get_request_sube_id(request, kurum_id=kurum_id) if request else None
        if not kurum_id:
            raise serializers.ValidationError({'kurum': 'Kurum bağlamı gerekli.'})
        if not sube_id:
            raise serializers.ValidationError({'sube': 'Şube bağlamı gerekli.'})
        validated_data['kurum_id'] = kurum_id
        validated_data['sube_id'] = sube_id
        book = super().create(validated_data)
        if sinif_list:
            book.sinif_seviyeleri.set(sinif_list)
        elif book.sinif_seviyesi_id:
            book.sinif_seviyeleri.set([book.sinif_seviyesi_id])
        return book

    def update(self, instance, validated_data):
        validated_data.pop('yayinevi', None)
        sinif_list = validated_data.pop('sinif_seviyeleri', None)
        old_ders_id = instance.ders_id
        was_incomplete = not instance.icerik_tamamlandi_mi
        book = super().update(instance, validated_data)
        if sinif_list is not None:
            book.sinif_seviyeleri.set(sinif_list)
            if sinif_list:
                book.sinif_seviyesi = sinif_list[0]
                book.save(update_fields=['sinif_seviyesi'])
        # Kitap dersi değişince öğrenci atamalarındaki denormalize lesson'ı senkronla;
        # aksi halde ödev ver ekranı eski ders altında göstermeye devam eder.
        if book.ders_id and book.ders_id != old_ders_id:
            from apps.student_resources.lesson_sync import sync_assignments_for_book
            sync_assignments_for_book(book.id, book.ders_id)
        if was_incomplete and book.icerik_tamamlandi_mi and book.kurum_id:
            try:
                from apps.gorev.application.rule_engine import GorevRuleEngine
                GorevRuleEngine().complete_resource_content_tasks(book.kurum_id, book.id)
            except Exception:
                pass
        return book
