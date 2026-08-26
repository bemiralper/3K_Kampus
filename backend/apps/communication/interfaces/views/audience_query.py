"""Genel kitle oluşturucu API — katalog, önizleme, alıcı listesi, arama, kayıtlı kitleler."""
from django.core.exceptions import PermissionDenied, ValidationError
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from apps.coaching.services.coach_access import scoped_student_ids
from apps.communication.application.audience_catalog import build_audience_catalog
from apps.communication.application.audience_query import AudienceQueryService, normalize_query
from apps.communication.application.saved_audience_service import (
    create_saved_audience,
    delete_saved_audience,
    list_saved_audiences,
    serialize_saved_audience,
    update_saved_audience,
)
from apps.communication.interfaces.views.campaigns import CampaignBulkView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from shared.permissions import user_has_any_permission


def _egitim_yili_id(request) -> int | None:
    raw = (
        request.headers.get('X-Egitim-Yili-ID')
        or request.query_params.get('egitim_yili_id')
        or request.data.get('egitim_yili_id')
    )
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _query_from_request(request) -> dict:
    raw = request.data.get('query') or request.data.get('recipient_filter') or request.data
    if not isinstance(raw, dict):
        raw = {}
    return normalize_query(raw)


class AudienceCatalogView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        person_types = request.query_params.getlist('person_type')
        if not person_types:
            raw = request.query_params.get('person_types') or ''
            person_types = [p for p in raw.split(',') if p]
        return Response(build_audience_catalog(
            kurum_id,
            user=request.user,
            sube_id=sube_id,
            egitim_yili_id=_egitim_yili_id(request),
            person_types=person_types or None,
        ))


class AudiencePreviewView(CampaignBulkView):
    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        query = _query_from_request(request)
        result = AudienceQueryService.resolve(
            kurum_id,
            query,
            user=request.user,
            context_sube_id=sube_id,
            context_egitim_yili_id=_egitim_yili_id(request),
        )
        return Response(result.to_preview_dict())


class AudienceRecipientsView(CampaignBulkView):
    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        query = _query_from_request(request)
        result = AudienceQueryService.resolve(
            kurum_id,
            query,
            user=request.user,
            context_sube_id=sube_id,
            context_egitim_yili_id=_egitim_yili_id(request),
        )
        page = max(1, int(request.data.get('page') or request.query_params.get('page') or 1))
        page_size = min(100, max(1, int(
            request.data.get('page_size') or request.query_params.get('page_size') or 25
        )))
        start = (page - 1) * page_size
        rows = [p.to_row() for p in result.people]
        return Response({
            **result.to_preview_dict(),
            'recipients': rows[start:start + page_size],
            'page': page,
            'page_size': page_size,
            'recipients_total': len(rows),
        })


class AudienceSearchView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response({'results': [], 'query': q})

        from apps.coaching.services.coach_access import get_coach_profile, is_resource_admin

        if is_resource_admin(request.user) or user_has_any_permission(request.user, 'communication.manage'):
            allowed = None
        elif get_coach_profile(request.user) is not None:
            allowed = scoped_student_ids(request.user)
        elif user_has_any_permission(request.user, 'communication.bulk'):
            allowed = None
        else:
            allowed = scoped_student_ids(request.user)
        include_personel = request.query_params.get('include_personel', '1') not in ('0', 'false', 'no')
        if allowed is not None:
            include_personel = False

        kinds = request.query_params.getlist('kind') or ['ogrenci', 'veli', 'personel']
        results = []
        from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli

        name_q = Q(ad__icontains=q) | Q(soyad__icontains=q)
        if 'ogrenci' in kinds:
            oqs = Ogrenci.objects.filter(kurum_id=kurum_id).filter(name_q | Q(telefon__icontains=q))
            if sube_id:
                oqs = oqs.filter(sube_id=sube_id)
            if allowed is not None:
                oqs = oqs.filter(id__in=allowed)
            kayit_map = {}
            year_id = _egitim_yili_id(request)
            kqs = OgrenciKayit.objects.filter(ogrenci__in=oqs[:40]).select_related('sinif')
            if year_id:
                kqs = kqs.filter(egitim_yili_id=year_id)
            for k in kqs:
                kayit_map[k.ogrenci_id] = k.sinif.ad if k.sinif_id else ''
            for o in oqs[:20]:
                results.append({
                    'kind': 'ogrenci',
                    'id': o.id,
                    'label': o.tam_ad,
                    'phone': o.telefon,
                    'sinif': kayit_map.get(o.id, ''),
                    'meta': kayit_map.get(o.id, ''),
                })

        if 'veli' in kinds:
            vqs = OgrenciVeli.objects.filter(ogrenci__kurum_id=kurum_id).filter(
                name_q | Q(telefon__icontains=q)
            ).select_related('ogrenci')
            if sube_id:
                vqs = vqs.filter(ogrenci__sube_id=sube_id)
            if allowed is not None:
                vqs = vqs.filter(ogrenci_id__in=allowed)
            for v in vqs[:20]:
                results.append({
                    'kind': 'veli',
                    'id': v.id,
                    'label': v.tam_ad,
                    'phone': v.telefon,
                    'ogrenci_id': v.ogrenci_id,
                    'ogrenci_name': v.ogrenci.tam_ad,
                    'meta': f'{v.get_veli_turu_display()} · {v.ogrenci.tam_ad}',
                })

        if include_personel and 'personel' in kinds:
            from apps.personel.domain.models import Personel

            pqs = Personel.objects.filter(kurum_id=kurum_id).filter(
                Q(ad__icontains=q) | Q(soyad__icontains=q) | Q(telefon__icontains=q) | Q(cep_telefon__icontains=q)
            )
            if sube_id:
                pqs = pqs.filter(sube_id=sube_id)
            for p in pqs[:20]:
                results.append({
                    'kind': 'personel',
                    'id': p.id,
                    'label': p.tam_ad,
                    'phone': p.cep_telefon or p.telefon,
                    'meta': 'Personel',
                })

        return Response({'results': results, 'query': q})


class SavedAudienceListCreateView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        items = list_saved_audiences(
            kurum_id,
            request.user,
            context_sube_id=sube_id,
            context_egitim_yili_id=_egitim_yili_id(request),
        )
        return Response({'items': items, 'total': len(items)})

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            item = create_saved_audience(
                kurum_id,
                request.user,
                name=request.data.get('name') or '',
                query=request.data.get('query') or {},
                description=request.data.get('description') or '',
                sube_id=sube_id,
            )
        except ValidationError as exc:
            return Response(
                {'error': str(exc.message if hasattr(exc, 'message') else exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return Response(
            serialize_saved_audience(
                item,
                kurum_id=kurum_id,
                user=request.user,
                context_sube_id=sube_id,
                context_egitim_yili_id=_egitim_yili_id(request),
            ),
            status=status.HTTP_201_CREATED,
        )


class SavedAudienceDetailView(CampaignBulkView):
    def patch(self, request, audience_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            item = update_saved_audience(
                kurum_id,
                request.user,
                audience_id,
                name=request.data.get('name'),
                query=request.data.get('query'),
                description=request.data.get('description'),
            )
        except ValidationError as exc:
            return Response(
                {'error': str(exc.message if hasattr(exc, 'message') else exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return Response(serialize_saved_audience(
            item,
            kurum_id=kurum_id,
            user=request.user,
            context_sube_id=sube_id,
            context_egitim_yili_id=_egitim_yili_id(request),
        ))

    def delete(self, request, audience_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            delete_saved_audience(kurum_id, request.user, audience_id)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return Response(status=status.HTTP_204_NO_CONTENT)
