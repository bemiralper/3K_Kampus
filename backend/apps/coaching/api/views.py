"""
Coaching API Views
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from shared.permissions import CoachAssignmentManagePermission
from rest_framework.authentication import SessionAuthentication
from django.db.models import Q

from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
from apps.coaching.api.serializers import (
    CoachProfileSerializer,
    CoachCreateUpdateSerializer,
    CoachMeUpdateSerializer,
    CoachStudentAssignmentSerializer,
    CoachStatsSerializer,
    CoachSelfStatsSerializer,
    AssignmentListSerializer,
    AssignmentCreateSerializer,
    AssignmentUpdateSerializer,
    BulkAssignSerializer,
    CoachChangeSerializer,
)
from apps.coaching.interfaces.sube_context import (
    assert_assignment_record_sube_access,
    assert_coaching_student_sube_access,
    filter_queryset_by_student_sube,
    mandatory_coaching_context,
)
from apps.coaching.services.coach_access import get_coach_profile, is_resource_admin
from apps.personel.domain.models import PersonelGorevlendirme


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF doğrulaması yapmayan SessionAuthentication"""
    def enforce_csrf(self, request):
        return  # CSRF kontrolünü atla


def sync_coaches_from_gorevlendirme(kurum_id=None, egitim_yili_id=None):
    """
    PersonelGorevlendirme'deki koç rolündeki personeller için
    otomatik CoachProfile oluştur.
    """
    from apps.personel.domain.models import PersonelGorevlendirme
    
    # Koç rolündeki görevlendirmeleri bul
    queryset = PersonelGorevlendirme.objects.filter(
        rol__code='koc',
        aktif_mi=True
    ).select_related('personel')
    
    if kurum_id:
        queryset = queryset.filter(kurum_id=kurum_id)
    if egitim_yili_id:
        queryset = queryset.filter(egitim_yili_id=egitim_yili_id)
    
    # Unique personel ID'leri
    personel_ids = queryset.values_list('personel_id', flat=True).distinct()
    
    # Mevcut CoachProfile'ları kontrol et
    existing_profiles = CoachProfile.objects.filter(
        teacher_id__in=personel_ids
    ).values_list('teacher_id', flat=True)
    
    # Eksik olanları oluştur
    new_profiles = []
    for personel_id in personel_ids:
        if personel_id not in existing_profiles:
            new_profiles.append(CoachProfile(
                teacher_id=personel_id,
                capacity=10,  # Varsayılan kapasite
                is_active=True,
                is_coach=True,
            ))
    
    if new_profiles:
        CoachProfile.objects.bulk_create(new_profiles)
    
    return len(new_profiles)


class CoachViewSet(viewsets.ModelViewSet):
    """
    Koç Profili ViewSet
    
    Endpoints:
    - GET    /api/coaching/coaches/           - Liste
    - POST   /api/coaching/coaches/           - Oluştur
    - GET    /api/coaching/coaches/{id}/      - Detay
    - PATCH  /api/coaching/coaches/{id}/      - Güncelle
    - DELETE /api/coaching/coaches/{id}/      - Sil
    - GET    /api/coaching/coaches/{id}/stats/    - İstatistikler
    - GET    /api/coaching/coaches/{id}/students/ - Öğrenci listesi
    """
    
    queryset = CoachProfile.objects.select_related('teacher').all()
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['teacher__ad', 'teacher__soyad', 'teacher__tc_kimlik_no']
    ordering_fields = ['created_at', 'capacity', 'is_active']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        """Action'a göre serializer seç"""
        if self.action in ['create', 'update', 'partial_update']:
            return CoachCreateUpdateSerializer
        return CoachProfileSerializer
    
    def get_permissions(self):
        """Write işlemleri için admin yetkisi gerekli"""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        """Filtreleme ve optimizasyon"""
        queryset = super().get_queryset()
        
        # is_active filtresi
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            is_active_bool = is_active.lower() in ['true', '1', 'yes']
            queryset = queryset.filter(is_active=is_active_bool)
        
        # is_coach filtresi
        is_coach = self.request.query_params.get('is_coach')
        if is_coach is not None:
            is_coach_bool = is_coach.lower() in ['true', '1', 'yes']
            queryset = queryset.filter(is_coach=is_coach_bool)

        # Non-admin koç yalnızca kendi profilini okuyabilir
        if not is_resource_admin(self.request.user):
            cp = get_coach_profile(self.request.user)
            if cp:
                queryset = queryset.filter(pk=cp.pk)
            else:
                queryset = queryset.none()
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """
        Liste endpoint'i - success wrapper ile
        
        Görevlendirmeden gelen koçları otomatik senkronize eder.
        """
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        sync_coaches_from_gorevlendirme(
            kurum_id=ctx['kurum_id'],
            egitim_yili_id=ctx.get('egitim_yili_id'),
        )

        queryset = self.filter_queryset(self.get_queryset())
        if is_resource_admin(request.user):
            coach_ids_in_sube = CoachStudentAssignment.objects.filter(
                end_date__isnull=True,
                student__kurum_id=ctx['kurum_id'],
                student__sube_id=ctx['sube_id'],
            ).values_list('coach_id', flat=True)
            personel_ids = PersonelGorevlendirme.objects.filter(
                kurum_id=ctx['kurum_id'],
                gorev_sube_id=ctx['sube_id'],
                aktif_mi=True,
            ).values_list('personel_id', flat=True)
            queryset = queryset.filter(
                Q(id__in=coach_ids_in_sube) | Q(teacher_id__in=personel_ids)
            )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'success': True,
            'data': serializer.data,
        })
    
    def retrieve(self, request, *args, **kwargs):
        """Detay endpoint'i - success wrapper ile"""
        response = super().retrieve(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data,
        })
    
    def create(self, request, *args, **kwargs):
        """Oluşturma endpoint'i - success wrapper ile"""
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            self.perform_create(serializer)
            # Oluşturulan kaydı detay serializer ile döndür
            instance = serializer.instance
            detail_serializer = CoachProfileSerializer(instance)
            return Response({
                'success': True,
                'message': 'Koç profili başarıyla oluşturuldu.',
                'data': detail_serializer.data,
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': 'Doğrulama hatası',
            'errors': serializer.errors,
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        """Güncelleme endpoint'i - success wrapper ile"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            self.perform_update(serializer)
            # Güncellenen kaydı detay serializer ile döndür
            detail_serializer = CoachProfileSerializer(instance)
            return Response({
                'success': True,
                'message': 'Koç profili başarıyla güncellendi.',
                'data': detail_serializer.data,
            })
        return Response({
            'success': False,
            'error': 'Doğrulama hatası',
            'errors': serializer.errors,
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        """Silme endpoint'i - success wrapper ile"""
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({
            'success': True,
            'message': 'Koç profili başarıyla silindi.',
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get', 'patch'], url_path='me')
    def me(self, request):
        """
        Giriş yapmış koçun kendi profili.
        PATCH: yalnızca telefon / cep_telefon / email (Personel kaydı).
        """
        from apps.coaching.services.coach_access import get_coach_profile

        coach_profile = get_coach_profile(request.user)
        if not coach_profile:
            return Response({
                'success': False,
                'error': 'Koç profili bulunamadı.',
            }, status=status.HTTP_404_NOT_FOUND)

        personel = coach_profile.teacher

        if request.method == 'GET':
            profile_data = CoachProfileSerializer(
                coach_profile, context={'request': request},
            ).data
            profile_data['telefon'] = personel.telefon or ''
            profile_data['cep_telefon'] = personel.cep_telefon or ''
            profile_data['email'] = personel.email or request.user.email or ''
            return Response({'success': True, 'data': profile_data})

        serializer = CoachMeUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'Doğrulama hatası',
                'errors': serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        for field in ('telefon', 'cep_telefon', 'email'):
            if field in serializer.validated_data:
                setattr(personel, field, serializer.validated_data[field])
        personel.save(update_fields=['telefon', 'cep_telefon', 'email', 'updated_at'])

        profile_data = CoachProfileSerializer(
            coach_profile, context={'request': request},
        ).data
        profile_data['telefon'] = personel.telefon or ''
        profile_data['cep_telefon'] = personel.cep_telefon or ''
        profile_data['email'] = personel.email or request.user.email or ''
        return Response({
            'success': True,
            'message': 'Profil güncellendi.',
            'data': profile_data,
        })

    @action(detail=False, methods=['get'], url_path='me/stats')
    def me_stats(self, request):
        """
        Giriş yapmış koçun kendi performans istatistikleri.
        GET /api/coaching/coaches/me/stats/
        """
        from apps.coaching.services.coach_access import get_coach_profile
        from apps.coaching.services.coach_self_stats import get_coach_self_stats

        coach_profile = get_coach_profile(request.user)
        if not coach_profile:
            return Response({
                'success': False,
                'error': 'Koç profili bulunamadı.',
            }, status=status.HTTP_404_NOT_FOUND)

        stats_data = get_coach_self_stats(coach_profile, request.user)
        serializer = CoachSelfStatsSerializer(stats_data)
        return Response({
            'success': True,
            'data': serializer.data,
        })
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Koç istatistikleri
        
        GET /api/coaching/coaches/{id}/stats/
        
        Döndürür:
        - current_student_count: Mevcut öğrenci sayısı
        - available_capacity: Boş kapasite
        - active_assignments: Aktif atama sayısı
        - pending_events: Bekleyen etkinlik sayısı
        - completed_events: Tamamlanan etkinlik sayısı
        - total_events: Toplam etkinlik sayısı
        """
        coach = self.get_object()
        
        # Aktif atamalar
        active_assignments = CoachStudentAssignment.objects.filter(
            coach=coach,
            end_date__isnull=True
        ).count()
        
        # Etkinlik istatistikleri
        events = CoachingEvent.objects.filter(coach=coach)
        pending_events = events.filter(
            status__in=['pending', 'in_progress']
        ).count()
        completed_events = events.filter(status='completed').count()
        total_events = events.count()

        from apps.coaching.services.coach_self_stats import gorev_stats_for_user
        coach_user_id = coach.teacher.user_id if coach.teacher_id else None
        gorevler = gorev_stats_for_user(coach_user_id) if coach_user_id else {
            'bekleyen': 0, 'geciken': 0, 'tamamlanan': 0,
        }
        
        stats_data = {
            'current_student_count': coach.current_student_count,
            'available_capacity': coach.available_capacity,
            'active_assignments': active_assignments,
            'pending_events': pending_events,
            'completed_events': completed_events,
            'total_events': total_events,
            'gorev_bekleyen': gorevler.get('bekleyen', 0),
            'gorev_geciken': gorevler.get('geciken', 0),
            'gorev_tamamlanan': gorevler.get('tamamlanan', 0),
        }
        
        serializer = CoachStatsSerializer(stats_data)
        return Response({
            'success': True,
            'data': serializer.data,
        })
    
    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        """
        Koça atanmış öğrenciler
        
        GET /api/coaching/coaches/{id}/students/
        
        Query params:
        - active_only: true/false (varsayılan: true) - Sadece aktif atamaları göster
        """
        coach = self.get_object()
        
        # Aktif atamalar
        assignments = CoachStudentAssignment.objects.filter(
            coach=coach
        ).select_related('student')
        
        # active_only parametresi (varsayılan true)
        active_only = request.query_params.get('active_only', 'true')
        if active_only.lower() in ['true', '1', 'yes']:
            assignments = assignments.filter(end_date__isnull=True)
        
        assignments = assignments.order_by('-is_primary', '-start_date')
        
        serializer = CoachStudentAssignmentSerializer(assignments, many=True)
        return Response({
            'success': True,
            'data': serializer.data,
            'count': assignments.count(),
        })
    
    @action(detail=True, methods=['get'], url_path='available-students', url_name='available-students')
    def available_students(self, request, pk=None):
        """
        Koça atanabilecek öğrenciler
        
        GET /api/coaching/coaches/{id}/available-students/
        
        Query params:
        - search: Ad/soyad arama
        - sinif_id: Sınıfa göre filtre (aktif kayıt)
        
        Koçluk hizmeti: OgrenciEkHizmet, sözleşme kalemi veya grup dersi dahil koçluk.
        """
        from apps.coaching.services.eligibility import get_assignable_kocluk_ogrenci_queryset

        coach = self.get_object()

        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        kurum_id = ctx['kurum_id']
        sube_id = ctx['sube_id']
        egitim_yili_id = ctx.get('egitim_yili_id')

        queryset = get_assignable_kocluk_ogrenci_queryset(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        )

        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(ad__icontains=search) | Q(soyad__icontains=search)
            )

        sinif_id = request.query_params.get('sinif_id')
        if sinif_id:
            queryset = queryset.filter(
                kayitlar__sinif_id=sinif_id,
                kayitlar__aktif_mi=True,
            ).distinct()

        queryset = queryset.order_by('ad', 'soyad').values('id', 'ad', 'soyad')[:100]

        students = [
            {
                'id': s['id'],
                'ad': s['ad'],
                'soyad': s['soyad'],
                'full_name': f"{s['ad']} {s['soyad']}",
            }
            for s in queryset
        ]

        return Response({
            'success': True,
            'data': students,
            'count': len(students),
            'coach_available_capacity': coach.available_capacity,
        })


# ==================== ASSIGNMENT VIEWSET ====================

class AssignmentViewSet(viewsets.ModelViewSet):
    """
    Koç-Öğrenci Atama ViewSet
    
    Endpoints:
    - GET    /api/coaching/assignments/           - Liste
    - POST   /api/coaching/assignments/           - Oluştur
    - GET    /api/coaching/assignments/{id}/      - Detay
    - PATCH  /api/coaching/assignments/{id}/      - Güncelle
    - DELETE /api/coaching/assignments/{id}/      - Sil
    - POST   /api/coaching/assignments/bulk-assign/ - Toplu atama
    """
    
    queryset = CoachStudentAssignment.objects.select_related(
        'coach', 'coach__teacher', 'student'
    ).all()
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'student__ad', 'student__soyad',
        'coach__teacher__ad', 'coach__teacher__soyad'
    ]
    ordering_fields = ['start_date', 'created_at', 'is_primary']
    ordering = ['-start_date']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return AssignmentCreateSerializer
        if self.action in ['update', 'partial_update']:
            return AssignmentUpdateSerializer
        if self.action == 'bulk_assign':
            return BulkAssignSerializer
        if self.action == 'change_coach':
            return CoachChangeSerializer
        return AssignmentListSerializer
    
    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'bulk_assign', 'change_coach']:
            return [IsAuthenticated(), CoachAssignmentManagePermission()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        queryset = super().get_queryset()

        ctx = getattr(self, '_coaching_ctx', None)
        if ctx:
            queryset = filter_queryset_by_student_sube(queryset, ctx['sube_id'])
        
        # coach_id filtresi
        coach_id = self.request.query_params.get('coach_id')
        if coach_id:
            queryset = queryset.filter(coach_id=coach_id)
        
        # student_id filtresi
        student_id = self.request.query_params.get('student_id')
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        
        # active_only filtresi
        active_only = self.request.query_params.get('active_only', 'true')
        if active_only.lower() in ['true', '1', 'yes']:
            queryset = queryset.filter(end_date__isnull=True)
        
        # is_primary filtresi
        is_primary = self.request.query_params.get('is_primary')
        if is_primary is not None:
            is_primary_bool = is_primary.lower() in ['true', '1', 'yes']
            queryset = queryset.filter(is_primary=is_primary_bool)

        # Non-admin koç yalnızca kendi atamalarını okuyabilir
        if not is_resource_admin(self.request.user):
            cp = get_coach_profile(self.request.user)
            if cp:
                queryset = queryset.filter(coach=cp)
            else:
                queryset = queryset.none()
        
        return queryset

    def get_object(self):
        obj = super().get_object()
        gate = assert_assignment_record_sube_access(self.request, obj)
        if gate:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail=gate.data.get('error', 'Forbidden'))
        return obj
    
    def list(self, request, *args, **kwargs):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        self._coaching_ctx = ctx
        response = super().list(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data,
        })
    
    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return Response({
            'success': True,
            'data': response.data,
        })
    
    def create(self, request, *args, **kwargs):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err
        self._coaching_ctx = ctx

        from django.db import transaction
        from datetime import date
        
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            student = serializer.validated_data['student']
            gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
            if gate:
                return gate

            with transaction.atomic():
                # start_date yoksa bugünü kullan
                start_date = serializer.validated_data.get('start_date', date.today())
                
                instance = CoachStudentAssignment.objects.create(
                    coach=serializer.validated_data['coach'],
                    student=serializer.validated_data['student'],
                    start_date=start_date,
                    is_primary=serializer.validated_data.get('is_primary', True),
                    created_by=request.user if request.user.is_authenticated else None
                )
                
                result_serializer = AssignmentListSerializer(instance)
                return Response({
                    'success': True,
                    'message': 'Öğrenci koça atandı.',
                    'data': result_serializer.data,
                }, status=status.HTTP_201_CREATED)
        
        return Response({
            'success': False,
            'error': 'Doğrulama hatası',
            'errors': serializer.errors,
        }, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, *args, **kwargs):
        from datetime import date
        
        instance = self.get_object()
        
        # Soft delete - end_date'i bugün olarak ayarla
        instance.end_date = date.today()
        instance.save()
        
        return Response({
            'success': True,
            'message': 'Atama sonlandırıldı.',
        })
    
    @action(detail=False, methods=['post'], url_path='bulk-assign', url_name='bulk-assign')
    def bulk_assign(self, request):
        """
        Toplu öğrenci atama
        
        POST /api/coaching/assignments/bulk-assign/
        
        Body:
        {
            "coach_id": 1,
            "student_ids": [1, 2, 3],
            "start_date": "2026-02-08",  // opsiyonel
            "is_primary": true           // opsiyonel, varsayılan true
        }
        """
        from django.db import transaction
        from datetime import date
        from apps.coaching.services.eligibility import get_kocluk_ogrenci_ids

        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        serializer = BulkAssignSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                coach = CoachProfile.objects.select_for_update().get(
                    id=serializer.validated_data['coach_id']
                )
                student_ids = serializer.validated_data['student_ids']
                start_date = serializer.validated_data.get('start_date', date.today())
                is_primary = serializer.validated_data.get('is_primary', True)

                kocluk_ogrenci_ids = get_kocluk_ogrenci_ids(
                    kurum_id=ctx['kurum_id'],
                    sube_id=ctx['sube_id'],
                    egitim_yili_id=ctx.get('egitim_yili_id'),
                )
                
                # Koçluk hizmeti olmayan öğrenci ID'lerini tespit et
                gecersiz_ids = set(student_ids) - kocluk_ogrenci_ids
                if gecersiz_ids:
                    return Response({
                        'success': False,
                        'error': 'Seçilen öğrencilerden bazılarının aktif koçluk hizmeti bulunmuyor.',
                        'invalid_student_ids': list(gecersiz_ids),
                    }, status=status.HTTP_400_BAD_REQUEST)

                from apps.ogrenci.domain.models import Ogrenci
                students = Ogrenci.objects.filter(id__in=student_ids)
                
                # Assignments oluştur
                assignments = []
                for student in students:
                    assignments.append(CoachStudentAssignment(
                        coach=coach,
                        student=student,
                        start_date=start_date,
                        is_primary=is_primary,
                        created_by=request.user if request.user.is_authenticated else None
                    ))
                
                created = CoachStudentAssignment.objects.bulk_create(assignments)
                
                return Response({
                    'success': True,
                    'message': f'{len(created)} öğrenci koça atandı.',
                    'data': {
                        'coach_id': coach.id,
                        'assigned_count': len(created),
                        'new_student_count': coach.current_student_count,
                        'available_capacity': coach.available_capacity,
                    }
                }, status=status.HTTP_201_CREATED)
        
        return Response({
            'success': False,
            'error': 'Doğrulama hatası',
            'errors': serializer.errors,
        }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='change-coach', url_name='change-coach')
    def change_coach(self, request):
        """
        Öğrencinin birincil koçunu değiştir.

        POST /api/coaching/assignments/change-coach/
        """
        from datetime import date
        from apps.coaching.services.coach_change import change_primary_coach, CoachChangeError

        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        serializer = CoachChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'Doğrulama hatası',
                'errors': serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            from apps.ogrenci.domain.models import Ogrenci
            student = Ogrenci.objects.get(pk=serializer.validated_data['student_id'])
        except Ogrenci.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Öğrenci bulunamadı.',
            }, status=status.HTTP_404_NOT_FOUND)

        gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
        if gate:
            return gate

        try:
            result = change_primary_coach(
                student_id=serializer.validated_data['student_id'],
                new_coach_id=serializer.validated_data['new_coach_id'],
                transfer_date=serializer.validated_data.get('transfer_date', date.today()),
                created_by=request.user if request.user.is_authenticated else None,
            )
        except CoachChangeError as exc:
            return Response({
                'success': False,
                'error': exc.message,
                'code': exc.code,
            }, status=status.HTTP_400_BAD_REQUEST)

        previous_data = (
            AssignmentListSerializer(result.previous_assignment).data
            if result.previous_assignment else None
        )
        new_data = AssignmentListSerializer(result.new_assignment).data

        return Response({
            'success': True,
            'message': 'Koç değişikliği tamamlandı. Öğrenci geçmişi korundu.',
            'data': {
                'previous_assignment': previous_data,
                'new_assignment': new_data,
            },
        })

    @action(detail=False, methods=['get'], url_path='student-history', url_name='student-history')
    def student_history(self, request):
        """
        Öğrencinin koç atama geçmişi (aktif + sonlandırılmış).

        GET /api/coaching/assignments/student-history/?student_id=1
        """
        from apps.coaching.services.coach_change import get_student_assignment_history
        from apps.ogrenci.domain.models import Ogrenci

        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({
                'success': False,
                'error': 'student_id parametresi gerekli',
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = Ogrenci.objects.get(pk=int(student_id))
        except (Ogrenci.DoesNotExist, ValueError):
            return Response({
                'success': False,
                'error': 'Öğrenci bulunamadı.',
            }, status=status.HTTP_404_NOT_FOUND)

        gate = assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
        if gate:
            return gate

        assignments = get_student_assignment_history(int(student_id))
        serializer = AssignmentListSerializer(assignments, many=True)
        active = assignments.filter(end_date__isnull=True, is_primary=True).first()

        return Response({
            'success': True,
            'data': serializer.data,
            'count': assignments.count(),
            'active_coach': AssignmentListSerializer(active).data if active else None,
        })
