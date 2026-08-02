"""Sohbet devretme için personel/kullanıcı arama."""
from __future__ import annotations

from django.db.models import Q
from rest_framework.response import Response

from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationModulePermission
from apps.personel.domain.models import Personel
from apps.personel.domain.user_account import resolve_personel_user


class TransferCandidatesView(CommunicationAPIView):
    """GET /api/communication/transfer-candidates/?q= — user hesabı olan personeller."""

    permission_classes = [CommunicationModulePermission]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        q = (request.query_params.get('q') or '').strip()
        qs = Personel.objects.filter(kurum_id=kurum_id, aktif_mi=True).select_related('sube')
        if sube_id is not None:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
        if q:
            qs = qs.filter(
                Q(ad__icontains=q)
                | Q(soyad__icontains=q)
                | Q(email__icontains=q)
                | Q(telefon__icontains=q)
            )
        qs = qs.order_by('soyad', 'ad')[:40]

        results = []
        for p in qs:
            user = resolve_personel_user(p)
            if not user or not user.is_active:
                continue
            if user.id == request.user.id:
                continue
            results.append({
                'user_id': user.id,
                'personel_id': p.id,
                'name': p.tam_ad or f'{p.ad} {p.soyad}'.strip(),
                'email': (user.email or p.email or '')[:120],
                'sube_ad': p.sube.ad if p.sube_id and p.sube else '',
            })
            if len(results) >= 20:
                break

        return Response({'candidates': results, 'total': len(results)})
