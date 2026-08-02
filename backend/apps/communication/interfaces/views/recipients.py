"""
Alıcı çözümleme API.
"""
from django.db.models import Q
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
        q_filter = (
            Q(ad__icontains=q)
            | Q(soyad__icontains=q)
            | Q(telefon__icontains=q)
        )

        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

        ogr_qs = Ogrenci.objects.filter(
            kurum_id=kurum_id,
            aktif_mi=True,
        ).filter(
            q_filter | Q(okul_no__icontains=q) | Q(tc_kimlik_no__icontains=q)
        )
        if sube_id:
            ogr_qs = ogr_qs.filter(sube_id=sube_id)
        for o in ogr_qs.select_related('sinif').order_by('ad', 'soyad')[:12]:
            sinif_ad = getattr(getattr(o, 'sinif', None), 'ad', None) or ''
            results.append({
                'kind': 'ogrenci',
                'id': o.id,
                'label': o.tam_ad,
                'meta': sinif_ad or 'Öğrenci',
                'phone': (o.telefon or '').strip(),
                'sinif': sinif_ad,
                'ad': o.ad,
                'soyad': o.soyad,
            })

        veli_qs = OgrenciVeli.objects.filter(
            ogrenci__kurum_id=kurum_id,
            ogrenci__aktif_mi=True,
        ).filter(
            Q(ad__icontains=q) | Q(soyad__icontains=q) | Q(telefon__icontains=q)
            | Q(tc_kimlik_no__icontains=q)
        )
        if sube_id:
            veli_qs = veli_qs.filter(ogrenci__sube_id=sube_id)
        for v in veli_qs.select_related('ogrenci').order_by('ad', 'soyad')[:12]:
            tur = dict(OgrenciVeli.VELI_TURU_CHOICES).get(v.veli_turu, 'Veli')
            ogr_name = v.ogrenci.tam_ad if v.ogrenci_id else ''
            results.append({
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
            })

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
                results.append({
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
        return Response({
            'results': results[:30],
            'query': q,
            'counts': {
                'ogrenci': sum(1 for r in results if r['kind'] == 'ogrenci'),
                'veli': sum(1 for r in results if r['kind'] == 'veli'),
                'personel': sum(1 for r in results if r['kind'] == 'personel'),
            },
        })
