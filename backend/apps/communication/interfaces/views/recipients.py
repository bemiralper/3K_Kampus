"""
Alıcı çözümleme API.
"""
from django.db.models import OuterRef, Q, Subquery
from rest_framework import status
from rest_framework.response import Response

from apps.coaching.services.coach_access import get_coach_profile
from apps.communication.application.campaign_service import AudienceResolver, CampaignService
from apps.communication.interfaces.serializers.config import CampaignPreviewRequestSerializer
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views.campaigns import CampaignBulkView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationModulePermission


class RecipientResolveView(CampaignBulkView):
    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = CampaignPreviewRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipient_filter = serializer.validated_data.get('recipient_filter') or {}
        audience_type = recipient_filter.get('audience_type')
        if sube_id and audience_type in ('all_veliler', 'all_ogrenciler'):
            recipient_filter = {**recipient_filter, 'sube_id': sube_id}

        result = CampaignService().resolve_recipients(
            kurum_id,
            recipient_filter,
            user=request.user,
        )
        return Response(result)


class CoachStudentsRecipientsView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        coach_profile = get_coach_profile(request.user)
        if not coach_profile:
            return Response({'error': 'Koç profili bulunamadı.'}, status=status.HTTP_403_FORBIDDEN)

        filter_json = {
            'audience_type': 'coach_students',
            'coach_id': coach_profile.id,
            'sube_id': sube_id,
        }
        result = AudienceResolver.resolve(kurum_id, filter_json, user=request.user)
        return Response(result.to_dict(include_recipients=True))


class CoachParentsRecipientsView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        coach_profile = get_coach_profile(request.user)
        if not coach_profile:
            return Response({'error': 'Koç profili bulunamadı.'}, status=status.HTTP_403_FORBIDDEN)

        filter_json = {
            'audience_type': 'coach_parents',
            'coach_id': coach_profile.id,
            'sube_id': sube_id,
        }
        result = AudienceResolver.resolve(kurum_id, filter_json, user=request.user)
        return Response(result.to_dict(include_recipients=True))


class RecipientSearchView(CommunicationAPIView):
    """
    Toplu gönderim — birleşik kişi araması (öğrenci / veli / personel).
    GET /api/communication/recipients/search/?q=
    """

    permission_classes = [CommunicationModulePermission]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response({'results': [], 'query': q})

        include_personel = request.query_params.get('include_personel', '1') not in (
            '0', 'false', 'no',
        )
        # Koç kapsamı: personel aramasını kapat
        coach_profile = get_coach_profile(request.user)
        if coach_profile and not request.user.is_superuser:
            include_personel = False

        results: list[dict] = []
        seen: set[tuple[str, int]] = set()
        q_filter = (
            Q(ad__icontains=q)
            | Q(soyad__icontains=q)
            | Q(telefon__icontains=q)
        )

        from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli

        def _add(row: dict) -> None:
            key = (row['kind'], row['id'])
            if key in seen:
                return
            seen.add(key)
            results.append(row)

        def _ogrenci_row(o, sinif_ad: str = '') -> dict:
            sinif = sinif_ad or getattr(o, 'aktif_sinif_ad', None) or ''
            return {
                'kind': 'ogrenci',
                'id': o.id,
                'label': o.tam_ad,
                'meta': sinif or 'Öğrenci',
                'phone': (o.telefon or '').strip(),
                'sinif': sinif,
                'ad': o.ad,
                'soyad': o.soyad,
            }

        def _veli_row(v) -> dict:
            tur = dict(OgrenciVeli.VELI_TURU_CHOICES).get(v.veli_turu, 'Veli')
            ogr_name = v.ogrenci.tam_ad if v.ogrenci_id and getattr(v, 'ogrenci', None) else ''
            return {
                'kind': 'veli',
                'id': v.id,
                'label': f'{v.ad} {v.soyad}'.strip(),
                'meta': f'{tur}' + (f' · {ogr_name}' if ogr_name else ''),
                'phone': (v.telefon or '').strip(),
                'veli_turu_display': tur,
                'ogrenci_id': v.ogrenci_id,
                'ogrenci_name': ogr_name,
                'ad': v.ad,
                'soyad': v.soyad,
            }

        # Okul no ve sınıf öğrencide değil, yıllık kayıtta (OgrenciKayit) tutulur.
        aktif_kayit = OgrenciKayit.objects.filter(
            ogrenci_id=OuterRef('pk'),
            aktif_mi=True,
        ).order_by('-egitim_yili__baslangic_yil', '-id')

        ogr_qs = Ogrenci.objects.filter(
            kurum_id=kurum_id,
            aktif_mi=True,
        ).filter(
            q_filter
            | Q(kayitlar__okul_no__icontains=q)
            | Q(tc_kimlik_no__icontains=q)
        ).annotate(
            aktif_sinif_ad=Subquery(aktif_kayit.values('sinif__ad')[:1]),
        ).distinct()
        if sube_id:
            ogr_qs = ogr_qs.filter(sube_id=sube_id)
        matched_students = list(ogr_qs.order_by('ad', 'soyad')[:12])
        for o in matched_students:
            _add(_ogrenci_row(o, o.aktif_sinif_ad or ''))

        veli_qs = OgrenciVeli.objects.filter(
            ogrenci__kurum_id=kurum_id,
            ogrenci__aktif_mi=True,
        ).filter(
            Q(ad__icontains=q) | Q(soyad__icontains=q) | Q(telefon__icontains=q)
            | Q(tc_kimlik_no__icontains=q)
        )
        if sube_id:
            veli_qs = veli_qs.filter(ogrenci__sube_id=sube_id)
        matched_veliler = list(veli_qs.select_related('ogrenci').order_by('ad', 'soyad')[:12])
        for v in matched_veliler:
            _add(_veli_row(v))

        # Aile genişletme: öğrenci → velileri; veli → öğrencisi (aynı anda listelenir)
        student_ids = {o.id for o in matched_students}
        student_ids.update(v.ogrenci_id for v in matched_veliler if v.ogrenci_id)
        if student_ids:
            family_veliler = (
                OgrenciVeli.objects.filter(
                    ogrenci_id__in=student_ids,
                    ogrenci__kurum_id=kurum_id,
                    ogrenci__aktif_mi=True,
                )
                .select_related('ogrenci')
                .order_by('-varsayilan', 'ad', 'soyad')
            )
            if sube_id:
                family_veliler = family_veliler.filter(ogrenci__sube_id=sube_id)
            for v in family_veliler[:40]:
                _add(_veli_row(v))

            missing_student_ids = [
                oid for oid in student_ids if ('ogrenci', oid) not in seen
            ]
            if missing_student_ids:
                family_students = (
                    Ogrenci.objects.filter(
                        id__in=missing_student_ids,
                        kurum_id=kurum_id,
                        aktif_mi=True,
                    )
                    .annotate(aktif_sinif_ad=Subquery(aktif_kayit.values('sinif__ad')[:1]))
                )
                if sube_id:
                    family_students = family_students.filter(sube_id=sube_id)
                for o in family_students:
                    _add(_ogrenci_row(o, o.aktif_sinif_ad or ''))

        if include_personel:
            from apps.personel.domain.models import Personel

            p_qs = Personel.objects.filter(
                kurum_id=kurum_id,
                aktif_mi=True,
            ).filter(
                Q(ad__icontains=q)
                | Q(soyad__icontains=q)
                | Q(telefon__icontains=q)
                | Q(cep_telefon__icontains=q)
                | Q(tc_kimlik_no__icontains=q)
            )
            if sube_id:
                p_qs = p_qs.filter(sube_id=sube_id)
            for p in p_qs.order_by('ad', 'soyad')[:12]:
                phone = (p.cep_telefon or p.telefon or '').strip()
                _add({
                    'kind': 'personel',
                    'id': p.id,
                    'label': p.tam_ad,
                    'meta': 'Personel',
                    'phone': phone,
                    'ad': p.ad,
                    'soyad': p.soyad,
                })

        # Tür önceliği: öğrenci → veli → personel, sonra ada göre
        kind_order = {'ogrenci': 0, 'veli': 1, 'personel': 2}
        results.sort(key=lambda r: (kind_order.get(r['kind'], 9), r['label'].lower()))
        capped = results[:40]
        return Response({
            'results': capped,
            'query': q,
            'counts': {
                'ogrenci': sum(1 for r in capped if r['kind'] == 'ogrenci'),
                'veli': sum(1 for r in capped if r['kind'] == 'veli'),
                'personel': sum(1 for r in capped if r['kind'] == 'personel'),
            },
        })
