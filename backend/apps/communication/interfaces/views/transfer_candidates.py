"""Sohbet devretme için personel/kullanıcı arama."""
from __future__ import annotations

from rest_framework.response import Response

from apps.communication.application.transfer_targets import (
    candidate_personel_qs,
    user_has_communication_access,
)
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationModulePermission
from apps.personel.domain.user_account import resolve_personel_user


class TransferCandidatesView(CommunicationAPIView):
    """GET /api/communication/transfer-candidates/?q= — user hesabı olan personeller.

    Aday kuralı `transfer_targets` ile paylaşılır; devir ucu aynı kuralı doğrular.
    """

    permission_classes = [CommunicationModulePermission]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        q = (request.query_params.get('q') or '').strip()
        qs = candidate_personel_qs(kurum_id, sube_id, q)[:40]

        results = []
        for p in qs:
            user = resolve_personel_user(p)
            if not user or not user.is_active:
                continue
            if user.id == request.user.id:
                continue
            if not user_has_communication_access(user):
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
