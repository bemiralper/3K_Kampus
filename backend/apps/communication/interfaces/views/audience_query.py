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
    """Toplu gönderim — kişi araması.

    Eşleşen öğrencinin velileri ve eşleşen velinin öğrencisi de sonuca girer, böylece
    "zeynep" araması Zeynep'i ve Zeynep'in velisini birlikte döndürür. Satırlar
    ``group_key`` ile aile bazında gruplanır; ``groups`` alanı aynı satırları hazır
    gruplanmış hâlde verir.
    """

    #: Aile grubu başına dönülecek azami satır sayısı guard'ı.
    MAX_FAMILIES = 20
    MAX_PERSONEL = 20

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response({'results': [], 'groups': [], 'query': q})

        from apps.coaching.services.coach_access import get_coach_profile, is_resource_admin

        from apps.communication.permissions import user_can_bulk_communicate

        if is_resource_admin(request.user) or user_has_any_permission(request.user, 'communication.manage'):
            allowed = None
        elif get_coach_profile(request.user) is not None:
            allowed = scoped_student_ids(request.user)
        elif user_can_bulk_communicate(request.user):
            allowed = None
        else:
            allowed = scoped_student_ids(request.user)
        include_personel = request.query_params.get('include_personel', '1') not in ('0', 'false', 'no')
        if allowed is not None:
            include_personel = False

        kinds = request.query_params.getlist('kind') or ['ogrenci', 'veli', 'personel']
        from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli

        name_q = Q(ad__icontains=q) | Q(soyad__icontains=q)

        def scope_students(qs):
            if sube_id:
                qs = qs.filter(sube_id=sube_id)
            if allowed is not None:
                qs = qs.filter(id__in=allowed)
            return qs

        def scope_veliler(qs):
            if sube_id:
                qs = qs.filter(ogrenci__sube_id=sube_id)
            if allowed is not None:
                qs = qs.filter(ogrenci_id__in=allowed)
            return qs

        wants_family = 'ogrenci' in kinds or 'veli' in kinds
        # Öğrenci araması, 'ogrenci' istenmese bile yapılır: veli genişletmesinin çıpası odur.
        matched_students = []
        if wants_family:
            matched_students = list(
                scope_students(
                    Ogrenci.objects.filter(kurum_id=kurum_id).filter(name_q | Q(telefon__icontains=q))
                ).order_by('ad', 'soyad')[:self.MAX_FAMILIES]
            )
        matched_veliler = []
        if 'veli' in kinds:
            matched_veliler = list(
                scope_veliler(
                    OgrenciVeli.objects.filter(ogrenci__kurum_id=kurum_id).filter(
                        name_q | Q(telefon__icontains=q)
                    )
                ).select_related('ogrenci').order_by('ad', 'soyad')[:self.MAX_FAMILIES]
            )

        # Aile sırası: önce doğrudan eşleşen öğrenciler, sonra eşleşen velilerin öğrencileri.
        family_ids: list[int] = []
        seen_family: set[int] = set()
        for ogrenci in matched_students:
            if ogrenci.id not in seen_family:
                seen_family.add(ogrenci.id)
                family_ids.append(ogrenci.id)
        for veli in matched_veliler:
            if veli.ogrenci_id and veli.ogrenci_id not in seen_family:
                seen_family.add(veli.ogrenci_id)
                family_ids.append(veli.ogrenci_id)
        family_ids = family_ids[:self.MAX_FAMILIES]

        students_by_id = {o.id: o for o in matched_students if o.id in seen_family}
        missing_ids = [oid for oid in family_ids if oid not in students_by_id]
        if missing_ids:
            for ogrenci in scope_students(Ogrenci.objects.filter(kurum_id=kurum_id, id__in=missing_ids)):
                students_by_id[ogrenci.id] = ogrenci

        sinif_map: dict[int, str] = {}
        if family_ids:
            kqs = OgrenciKayit.objects.filter(ogrenci_id__in=family_ids).select_related('sinif')
            year_id = _egitim_yili_id(request)
            if year_id:
                kqs = kqs.filter(egitim_yili_id=year_id)
            for kayit in kqs:
                sinif_map[kayit.ogrenci_id] = kayit.sinif.ad if kayit.sinif_id else ''

        veliler_by_student: dict[int, list] = {}
        if family_ids and 'veli' in kinds:
            vqs = scope_veliler(
                OgrenciVeli.objects.filter(ogrenci_id__in=family_ids, ogrenci__kurum_id=kurum_id)
            ).select_related('ogrenci').order_by('-varsayilan', 'ad', 'soyad')
            for veli in vqs:
                veliler_by_student.setdefault(veli.ogrenci_id, []).append(veli)

        matched_keys = {('ogrenci', o.id) for o in matched_students}
        matched_keys |= {('veli', v.id) for v in matched_veliler}

        groups: list[dict] = []
        results: list[dict] = []

        for ogrenci_id in family_ids:
            ogrenci = students_by_id.get(ogrenci_id)
            if ogrenci is None:
                continue
            sinif = sinif_map.get(ogrenci_id, '')
            group_key = f'ogrenci:{ogrenci_id}'
            items: list[dict] = []
            if 'ogrenci' in kinds:
                items.append({
                    'kind': 'ogrenci',
                    'id': ogrenci.id,
                    'label': ogrenci.tam_ad,
                    'phone': (ogrenci.telefon or '').strip(),
                    'sinif': sinif,
                    'meta': sinif,
                    'role': 'Öğrenci',
                    'group_key': group_key,
                    'matched': ('ogrenci', ogrenci.id) in matched_keys,
                })
            for veli in veliler_by_student.get(ogrenci_id, []):
                rol = veli.get_veli_turu_display()
                items.append({
                    'kind': 'veli',
                    'id': veli.id,
                    'label': veli.tam_ad,
                    'phone': (veli.telefon or '').strip(),
                    'ogrenci_id': veli.ogrenci_id,
                    'ogrenci_name': ogrenci.tam_ad,
                    'meta': f'{rol} · {ogrenci.tam_ad}',
                    'role': rol,
                    'group_key': group_key,
                    'matched': ('veli', veli.id) in matched_keys,
                })
            if not items:
                continue
            groups.append({
                'key': group_key,
                'kind': 'aile',
                'label': ogrenci.tam_ad,
                'meta': sinif,
                'items': items,
            })
            results.extend(items)

        if include_personel and 'personel' in kinds:
            from apps.personel.domain.models import Personel

            pqs = Personel.objects.filter(kurum_id=kurum_id).filter(
                Q(ad__icontains=q) | Q(soyad__icontains=q) | Q(telefon__icontains=q) | Q(cep_telefon__icontains=q)
            )
            if sube_id:
                pqs = pqs.filter(sube_id=sube_id)
            personel_items = [{
                'kind': 'personel',
                'id': p.id,
                'label': p.tam_ad,
                'phone': (p.cep_telefon or p.telefon or '').strip(),
                'meta': 'Personel',
                'role': 'Personel',
                'group_key': 'personel',
                'matched': True,
            } for p in pqs.order_by('ad', 'soyad')[:self.MAX_PERSONEL]]
            if personel_items:
                groups.append({
                    'key': 'personel',
                    'kind': 'personel',
                    'label': 'Personel',
                    'meta': '',
                    'items': personel_items,
                })
                results.extend(personel_items)

        return Response({'results': results, 'groups': groups, 'query': q})


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
