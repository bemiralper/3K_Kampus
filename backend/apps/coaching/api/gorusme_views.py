"""
Görüşme Kayıtları API Views
"""
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework.renderers import JSONRenderer
from django.db.models import Q, Count
from django.utils import timezone
from datetime import timedelta

from apps.coaching.models import (
    GorusmeKaydi, GorusmeAksiyon, GorusmeKatilimci,
    GorusmeDosya, GorusmeHatirlatma, CoachProfile,
    CoachStudentAssignment,
)
from apps.coaching.services.coach_access import user_can_access_student
from apps.coaching.interfaces.sube_context import (
    assert_coaching_student_sube_access,
    mandatory_coaching_context,
)
from shared.export.drf_renderers import XlsxRenderer, CsvRenderer
from apps.coaching.api.gorusme_serializers import (
    GorusmeKaydiListSerializer,
    GorusmeKaydiDetailSerializer,
    GorusmeKaydiCreateSerializer,
    GorusmeAksiyonSerializer,
    GorusmeAksiyonCreateSerializer,
    GorusmeKatilimciSerializer,
    GorusmeHatirlatmaSerializer,
    GorusmeHatirlatmaCreateSerializer,
    GorusmeDurumGuncelleSerializer,
)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


def _get_coach_profile(user):
    """
    Giriş yapmış kullanıcı koç mü? Koç ise CoachProfile döndür.
    User → Personel (related_name='personel') → CoachProfile (related_name='coach_profile')
    """
    try:
        personel = user.personel
        cp = personel.coach_profile
        if cp and cp.is_active and cp.is_coach:
            return cp
    except Exception:
        pass
    return None


def _is_admin(user):
    """Kullanıcı admin/superuser/staff mi?"""
    if user.is_superuser or user.is_staff:
        return True
    try:
        role_code = user.user_role.role.code
        return role_code in ('super_admin', 'admin', 'mudur', 'mudir_yardimcisi')
    except Exception:
        return False


def _student_access_denied(request, student_id):
    if user_can_access_student(request.user, student_id):
        return None
    return Response(
        {'error': 'Bu öğrenciye erişim yetkiniz yok.'},
        status=status.HTTP_403_FORBIDDEN,
    )


def _gorusme_sube_gate(request, gorusme):
    ctx, err = mandatory_coaching_context(request)
    if err:
        return None, err
    gate = assert_coaching_student_sube_access(
        request, gorusme.ogrenci.kurum_id, gorusme.ogrenci.sube_id,
    )
    if gate:
        return None, gate
    return ctx, None


# ═══════════════════════════════════════════════════════════════
# GÖRÜŞME KAYDI — Liste + Oluşturma
# ═══════════════════════════════════════════════════════════════

def _build_gorusme_queryset(request, ctx):
    """Görüşme listesi + export ortak filtre mantığı — Koç ise sadece kendi görüşmeleri."""
    qs = GorusmeKaydi.objects.select_related(
        'ogrenci', 'koc__teacher', 'olusturan'
    ).prefetch_related('aksiyonlar').filter(ogrenci__sube_id=ctx['sube_id'])

    # ─── Rol bazlı filtreleme ───
    coach_profile = _get_coach_profile(request.user)
    is_admin = _is_admin(request.user)

    if coach_profile and not is_admin:
        ogrenci_id = request.query_params.get('ogrenci_id')
        if ogrenci_id:
            is_assigned = CoachStudentAssignment.objects.filter(
                coach=coach_profile,
                student_id=ogrenci_id,
                end_date__isnull=True,
            ).exists()
            if is_assigned:
                # Öğrenci bana atanmışsa tüm görüşme geçmişini göster (önceki koçlar dahil)
                qs = qs.filter(ogrenci_id=ogrenci_id)
            else:
                qs = qs.filter(koc=coach_profile)
        else:
            qs = qs.filter(koc=coach_profile)
    # Admin: tüm görüşmeleri görür (ek filtre uygulanmaz)

    # Filtreler
    kurum_id = request.query_params.get('kurum_id')
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)

    ogrenci_id = request.query_params.get('ogrenci_id')
    if ogrenci_id:
        qs = qs.filter(ogrenci_id=ogrenci_id)

    koc_id = request.query_params.get('koc_id')
    if koc_id:
        qs = qs.filter(koc_id=koc_id)

    durum = request.query_params.get('durum')
    if durum:
        qs = qs.filter(durum=durum)

    gorusme_turu = request.query_params.get('gorusme_turu')
    if gorusme_turu:
        qs = qs.filter(gorusme_turu=gorusme_turu)

    oncelik = request.query_params.get('oncelik')
    if oncelik:
        qs = qs.filter(oncelik=oncelik)

    # Tarih aralığı filtresi
    tarih_baslangic = request.query_params.get('tarih_baslangic')
    if tarih_baslangic:
        qs = qs.filter(gorusme_tarihi__gte=tarih_baslangic)

    tarih_bitis = request.query_params.get('tarih_bitis')
    if tarih_bitis:
        qs = qs.filter(gorusme_tarihi__lte=tarih_bitis)

    # Arama
    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(konu__icontains=search) |
            Q(ogrenci__ad__icontains=search) |
            Q(ogrenci__soyad__icontains=search) |
            Q(etiketler__icontains=search)
        )

    return qs


class GorusmeListCreateView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Görüşme listesi (filtreli) — Koç ise sadece kendi görüşmeleri"""
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        qs = _build_gorusme_queryset(request, ctx)
        serializer = GorusmeKaydiListSerializer(qs[:200], many=True)
        return Response(serializer.data)

    def post(self, request):
        """Yeni görüşme oluştur — Koç ise kendi profili otomatik atanır"""
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        ser = GorusmeKaydiCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        # Koç kontrolü: Koç ise koc_id'yi kendi profili yap
        coach_profile = _get_coach_profile(request.user)
        is_admin = _is_admin(request.user)

        if coach_profile and not is_admin:
            data['koc_id'] = coach_profile.id

        # Doğrulamalar
        from apps.ogrenci.domain.models import Ogrenci
        try:
            ogrenci = Ogrenci.objects.get(id=data['ogrenci_id'])
        except Ogrenci.DoesNotExist:
            return Response({'error': 'Öğrenci bulunamadı.'}, status=400)

        gate = assert_coaching_student_sube_access(request, ogrenci.kurum_id, ogrenci.sube_id)
        if gate:
            return gate

        denied = _student_access_denied(request, ogrenci.id)
        if denied:
            return denied

        try:
            koc = CoachProfile.objects.get(id=data['koc_id'])
        except CoachProfile.DoesNotExist:
            return Response({'error': 'Koç bulunamadı.'}, status=400)

        # Ana kaydı oluştur
        gorusme = GorusmeKaydi.objects.create(
            kurum_id=data['kurum_id'],
            ogrenci=ogrenci,
            koc=koc,
            gorusme_turu=data['gorusme_turu'],
            diger_tur_aciklama=data.get('diger_tur_aciklama', ''),
            durum=data.get('durum', 'planlandi'),
            yontem=data.get('yontem', 'yuz_yuze'),
            oncelik=data.get('oncelik', 'normal'),
            gorusme_tarihi=data['gorusme_tarihi'],
            gorusme_saati=data.get('gorusme_saati'),
            sure_dakika=data.get('sure_dakika'),
            konu=data['konu'],
            notlar=data.get('notlar', ''),
            motivasyon_skoru=data.get('motivasyon_skoru'),
            akademik_ozguven_skoru=data.get('akademik_ozguven_skoru'),
            stres_seviyesi=data.get('stres_seviyesi'),
            etiketler=data.get('etiketler', []),
            veli_ile_paylasilsin=data.get('veli_ile_paylasilsin', False),
            veli_ozet=data.get('veli_ozet', ''),
            sonraki_gorusme_tarihi=data.get('sonraki_gorusme_tarihi'),
            olusturan=request.user,
        )

        # Aksiyonlar
        for aksiyon_data in data.get('aksiyonlar', []):
            GorusmeAksiyon.objects.create(
                gorusme=gorusme,
                aciklama=aksiyon_data['aciklama'],
                sorumlu=aksiyon_data.get('sorumlu', 'ogrenci'),
                deadline=aksiyon_data.get('deadline'),
            )

        # Hatırlatmalar
        for hatirlatma_data in data.get('hatirlatmalar', []):
            GorusmeHatirlatma.objects.create(
                gorusme=gorusme,
                hatirlatma_tarihi=hatirlatma_data['hatirlatma_tarihi'],
                mesaj=hatirlatma_data['mesaj'],
                tip=hatirlatma_data.get('tip', 'genel'),
            )

        detail_ser = GorusmeKaydiDetailSerializer(gorusme)

        # ── Takvim Entegrasyonu ──
        self._sync_gorusme_to_calendar(gorusme, request.user.id)

        # ── WhatsApp hatırlatma (non-blocking) ──
        if data.get('send_whatsapp_reminder', True):
            self._notify_whatsapp_reminder(gorusme, request.user.id)

        return Response(detail_ser.data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _notify_whatsapp_reminder(gorusme, user_id):
        try:
            from apps.communication.application.integration_hooks import notify_gorusme_reminder
            notify_gorusme_reminder(gorusme.kurum_id, gorusme.id, sent_by_user_id=user_id)
        except Exception as e:
            import logging
            logging.getLogger('communication.integration').error(
                f'Görüşme WhatsApp hatırlatma hatası: {e}'
            )

    @staticmethod
    def _sync_gorusme_to_calendar(gorusme, user_id):
        """Görüşmeyi takvime senkronize et"""
        try:
            from apps.takvim.application.integration_service import CalendarIntegrationService
            svc = CalendarIntegrationService()
            svc.sync_gorusme(gorusme.kurum_id, gorusme, user_id)
            # Sonraki görüşme planı varsa onu da ekle
            if gorusme.sonraki_gorusme_tarihi:
                svc.sync_sonraki_gorusme(gorusme.kurum_id, gorusme, user_id)
        except Exception as e:
            import logging
            logging.getLogger('takvim.integration').error(f'Görüşme takvim sync hatası: {e}')


# ═══════════════════════════════════════════════════════════════
# GÖRÜŞME KAYDI — Detay + Güncelleme + Silme
# ═══════════════════════════════════════════════════════════════

class GorusmeDetailView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def _get_gorusme(self, pk):
        try:
            return GorusmeKaydi.objects.select_related(
                'ogrenci', 'koc__teacher', 'olusturan'
            ).prefetch_related(
                'aksiyonlar', 'katilimcilar', 'hatirlatmalar', 'dosyalar'
            ).get(id=pk)
        except GorusmeKaydi.DoesNotExist:
            return None

    def get(self, request, pk):
        """Görüşme detayı"""
        gorusme = self._get_gorusme(pk)
        if not gorusme:
            return Response({'error': 'Görüşme bulunamadı.'}, status=404)
        _, err = _gorusme_sube_gate(request, gorusme)
        if err:
            return err
        denied = _student_access_denied(request, gorusme.ogrenci_id)
        if denied:
            return denied
        serializer = GorusmeKaydiDetailSerializer(gorusme)
        return Response(serializer.data)

    def put(self, request, pk):
        """Görüşme güncelle"""
        gorusme = self._get_gorusme(pk)
        if not gorusme:
            return Response({'error': 'Görüşme bulunamadı.'}, status=404)

        _, err = _gorusme_sube_gate(request, gorusme)
        if err:
            return err
        denied = _student_access_denied(request, gorusme.ogrenci_id)
        if denied:
            return denied

        ser = GorusmeKaydiCreateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        # Basit alanları güncelle
        field_map = [
            'gorusme_turu', 'diger_tur_aciklama', 'durum', 'yontem',
            'oncelik', 'gorusme_tarihi', 'gorusme_saati', 'sure_dakika',
            'konu', 'notlar', 'motivasyon_skoru', 'akademik_ozguven_skoru',
            'stres_seviyesi', 'etiketler', 'veli_ile_paylasilsin',
            'veli_ozet', 'sonraki_gorusme_tarihi',
        ]
        for field in field_map:
            if field in data:
                setattr(gorusme, field, data[field])

        # Koç / öğrenci değiştiyse
        if 'koc_id' in data:
            try:
                gorusme.koc = CoachProfile.objects.get(id=data['koc_id'])
            except CoachProfile.DoesNotExist:
                return Response({'error': 'Koç bulunamadı.'}, status=400)

        if 'ogrenci_id' in data:
            from apps.ogrenci.domain.models import Ogrenci
            try:
                new_ogrenci = Ogrenci.objects.get(id=data['ogrenci_id'])
            except Ogrenci.DoesNotExist:
                return Response({'error': 'Öğrenci bulunamadı.'}, status=400)
            denied_new = _student_access_denied(request, new_ogrenci.id)
            if denied_new:
                return denied_new
            gorusme.ogrenci = new_ogrenci

        gorusme.save()

        # ── Takvim Entegrasyonu ──
        GorusmeListCreateView._sync_gorusme_to_calendar(gorusme, request.user.id)

        # ── WhatsApp hatırlatma (non-blocking) ──
        if data.get('send_whatsapp_reminder', True):
            GorusmeListCreateView._notify_whatsapp_reminder(gorusme, request.user.id)

        serializer = GorusmeKaydiDetailSerializer(gorusme)
        return Response(serializer.data)

    def delete(self, request, pk):
        """Görüşme sil"""
        gorusme = self._get_gorusme(pk)
        if not gorusme:
            return Response({'error': 'Görüşme bulunamadı.'}, status=404)

        _, err = _gorusme_sube_gate(request, gorusme)
        if err:
            return err
        denied = _student_access_denied(request, gorusme.ogrenci_id)
        if denied:
            return denied

        # ── Takvimden kaldır ──
        try:
            from apps.takvim.application.integration_service import CalendarIntegrationService, KaynakModul
            svc = CalendarIntegrationService()
            svc.remove_event(gorusme.kurum_id, KaynakModul.GORUSME, str(gorusme.id))
            svc.remove_event(gorusme.kurum_id, KaynakModul.GORUSME, f'sonraki_{gorusme.id}')
        except Exception:
            pass

        gorusme.delete()
        return Response({'detail': 'Görüşme silindi.'}, status=204)


# ═══════════════════════════════════════════════════════════════
# DURUM GÜNCELLEME
# ═══════════════════════════════════════════════════════════════

class GorusmeDurumView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Görüşme durumunu güncelle"""
        try:
            gorusme = GorusmeKaydi.objects.select_related('ogrenci').get(id=pk)
        except GorusmeKaydi.DoesNotExist:
            return Response({'error': 'Görüşme bulunamadı.'}, status=404)

        _, err = _gorusme_sube_gate(request, gorusme)
        if err:
            return err
        denied = _student_access_denied(request, gorusme.ogrenci_id)
        if denied:
            return denied

        ser = GorusmeDurumGuncelleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        gorusme.durum = ser.validated_data['durum']
        gorusme.save(update_fields=['durum', 'updated_at'])

        # ── Takvim durum senkronizasyonu ──
        GorusmeListCreateView._sync_gorusme_to_calendar(gorusme, request.user.id)

        return Response({
            'detail': f"Durum '{gorusme.get_durum_display()}' olarak güncellendi.",
            'durum': gorusme.durum,
            'durum_display': gorusme.get_durum_display(),
        })


# ═══════════════════════════════════════════════════════════════
# AKSİYON YÖNETİMİ
# ═══════════════════════════════════════════════════════════════

class GorusmeAksiyonListCreateView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, gorusme_id):
        try:
            gorusme = GorusmeKaydi.objects.select_related('ogrenci').get(id=gorusme_id)
        except GorusmeKaydi.DoesNotExist:
            return Response({'error': 'Görüşme bulunamadı.'}, status=404)
        denied = _student_access_denied(request, gorusme.ogrenci_id)
        if denied:
            return denied
        aksiyonlar = GorusmeAksiyon.objects.filter(gorusme_id=gorusme_id)
        serializer = GorusmeAksiyonSerializer(aksiyonlar, many=True)
        return Response(serializer.data)

    def post(self, request, gorusme_id):
        try:
            gorusme = GorusmeKaydi.objects.select_related('ogrenci').get(id=gorusme_id)
        except GorusmeKaydi.DoesNotExist:
            return Response({'error': 'Görüşme bulunamadı.'}, status=404)

        denied = _student_access_denied(request, gorusme.ogrenci_id)
        if denied:
            return denied

        ser = GorusmeAksiyonCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        aksiyon = GorusmeAksiyon.objects.create(
            gorusme=gorusme,
            aciklama=ser.validated_data['aciklama'],
            sorumlu=ser.validated_data.get('sorumlu', 'ogrenci'),
            deadline=ser.validated_data.get('deadline'),
        )

        return Response(
            GorusmeAksiyonSerializer(aksiyon).data,
            status=status.HTTP_201_CREATED,
        )


class GorusmeAksiyonDetailView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        """Aksiyon güncelle (tamamla / düzenle)"""
        try:
            aksiyon = GorusmeAksiyon.objects.select_related('gorusme').get(id=pk)
        except GorusmeAksiyon.DoesNotExist:
            return Response({'error': 'Aksiyon bulunamadı.'}, status=404)

        denied = _student_access_denied(request, aksiyon.gorusme.ogrenci_id)
        if denied:
            return denied

        if 'tamamlandi' in request.data:
            aksiyon.tamamlandi = request.data['tamamlandi']
            if aksiyon.tamamlandi:
                aksiyon.tamamlanma_tarihi = timezone.now().date()
            else:
                aksiyon.tamamlanma_tarihi = None
        if 'aciklama' in request.data:
            aksiyon.aciklama = request.data['aciklama']
        if 'sorumlu' in request.data:
            aksiyon.sorumlu = request.data['sorumlu']
        if 'deadline' in request.data:
            aksiyon.deadline = request.data['deadline']

        aksiyon.save()
        return Response(GorusmeAksiyonSerializer(aksiyon).data)

    def delete(self, request, pk):
        try:
            aksiyon = GorusmeAksiyon.objects.select_related('gorusme').get(id=pk)
        except GorusmeAksiyon.DoesNotExist:
            return Response({'error': 'Aksiyon bulunamadı.'}, status=404)
        denied = _student_access_denied(request, aksiyon.gorusme.ogrenci_id)
        if denied:
            return denied
        aksiyon.delete()
        return Response({'detail': 'Aksiyon silindi.'}, status=204)


# ═══════════════════════════════════════════════════════════════
# HATIRLATMA YÖNETİMİ
# ═══════════════════════════════════════════════════════════════

class GorusmeHatirlatmaListCreateView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, gorusme_id):
        try:
            gorusme = GorusmeKaydi.objects.select_related('ogrenci').get(id=gorusme_id)
        except GorusmeKaydi.DoesNotExist:
            return Response({'error': 'Görüşme bulunamadı.'}, status=404)

        denied = _student_access_denied(request, gorusme.ogrenci_id)
        if denied:
            return denied

        ser = GorusmeHatirlatmaCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        hatirlatma = GorusmeHatirlatma.objects.create(
            gorusme=gorusme,
            hatirlatma_tarihi=ser.validated_data['hatirlatma_tarihi'],
            mesaj=ser.validated_data['mesaj'],
            tip=ser.validated_data.get('tip', 'genel'),
        )

        return Response(
            GorusmeHatirlatmaSerializer(hatirlatma).data,
            status=status.HTTP_201_CREATED,
        )


class GorusmeHatirlatmaDeleteView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            h = GorusmeHatirlatma.objects.select_related('gorusme').get(id=pk)
        except GorusmeHatirlatma.DoesNotExist:
            return Response({'error': 'Hatırlatma bulunamadı.'}, status=404)
        denied = _student_access_denied(request, h.gorusme.ogrenci_id)
        if denied:
            return denied
        h.delete()
        return Response({'detail': 'Hatırlatma silindi.'}, status=204)


# ═══════════════════════════════════════════════════════════════
# ÖZET İSTATİSTİKLER
# ═══════════════════════════════════════════════════════════════

class GorusmeOzetView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = GorusmeKaydi.objects.all()

        kurum_id = request.query_params.get('kurum_id')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)

        # ─── Rol bazlı filtreleme ───
        coach_profile = _get_coach_profile(request.user)
        is_admin = _is_admin(request.user)

        if coach_profile and not is_admin:
            qs = qs.filter(koc=coach_profile)

        koc_id = request.query_params.get('koc_id')
        if koc_id:
            qs = qs.filter(koc_id=koc_id)

        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        toplam = qs.count()
        planlanan = qs.filter(durum='planlandi').count()
        tamamlanan = qs.filter(durum='tamamlandi').count()
        iptal = qs.filter(durum='iptal').count()
        ertelenen = qs.filter(durum='ertelendi').count()
        bu_hafta = qs.filter(
            gorusme_tarihi__gte=week_start,
            gorusme_tarihi__lte=week_end,
        ).count()

        return Response({
            'toplam': toplam,
            'planlanan': planlanan,
            'tamamlanan': tamamlanan,
            'iptal': iptal,
            'ertelenen': ertelenen,
            'bu_hafta': bu_hafta,
        })


# ═══════════════════════════════════════════════════════════════
# DIŞA AKTARMA (Excel / CSV)
# ═══════════════════════════════════════════════════════════════

class GorusmeExportView(APIView):
    """Filtrelenmiş görüşme listesi — JSON, CSV veya Excel (?format=xlsx|csv)."""

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer, XlsxRenderer, CsvRenderer]

    def get(self, request):
        ctx, err = mandatory_coaching_context(request)
        if err:
            return err

        qs = _build_gorusme_queryset(request, ctx).order_by('-gorusme_tarihi', '-gorusme_saati')
        gorusmeler = list(qs[:5000])

        from apps.coaching.application.gorusme_export import (
            build_export_columns,
            build_export_meta,
            build_export_rows,
            build_export_stats,
        )

        rows = build_export_rows(gorusmeler)
        fmt = (request.query_params.get('format') or 'json').lower()

        if fmt in ('csv', 'xlsx'):
            meta = build_export_meta(request, ctx)
            columns = build_export_columns()
            if fmt == 'xlsx':
                from shared.export import ExcelExportService

                stats = build_export_stats(gorusmeler)
                return ExcelExportService.export(
                    rows, columns, meta=meta, stats=stats, filename='gorusmeler',
                )
            from shared.export import CsvExportService

            return CsvExportService.export(rows, columns, meta=meta, filename='gorusmeler')

        return Response({
            'success': True,
            'rows': rows,
            'total': len(rows),
        })


# ═══════════════════════════════════════════════════════════════
# KULLANICI PROFİL BİLGİSİ (Koç mu? Atanmış öğrencileri?)
# ═══════════════════════════════════════════════════════════════

class GorusmeKullaniciBilgiView(APIView):
    """
    Giriş yapmış kullanıcının koçluk görüşme sistemindeki profilini döndürür.
    - Admin ise: is_admin=True, tüm öğrencilere erişim
    - Koç ise: is_admin=False, coach_profile_id + atanmış öğrenci listesi
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        coach_profile = _get_coach_profile(user)
        is_admin = _is_admin(user)

        result = {
            'is_admin': is_admin,
            'is_coach': coach_profile is not None,
            'coach_profile_id': coach_profile.id if coach_profile else None,
            'coach_full_name': None,
            'assigned_students': [],
        }

        if coach_profile:
            result['coach_full_name'] = f"{coach_profile.teacher.ad} {coach_profile.teacher.soyad}"

            # Koçun atanmış aktif öğrencilerini getir
            assignments = CoachStudentAssignment.objects.filter(
                coach=coach_profile,
                end_date__isnull=True,
            ).select_related('student').order_by('student__ad', 'student__soyad')

            result['assigned_students'] = [
                {
                    'id': a.student.id,
                    'ad': a.student.ad,
                    'soyad': a.student.soyad,
                    'is_primary': a.is_primary,
                }
                for a in assignments
            ]

        return Response(result)
