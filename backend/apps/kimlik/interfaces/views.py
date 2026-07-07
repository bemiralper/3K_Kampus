from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.kimlik.application.resolver import KimlikResolver
from shared.context import get_secili_kurum_id, get_secili_sube_id


class KimlikResolveView(APIView):
    """GET /api/kimlik/resolve/?tc=&telefon=&context=personel|ogrenci|veli"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kurum_id = get_secili_kurum_id(request)
        if not kurum_id:
            return Response({'detail': 'Kurum bilgisi bulunamadı'}, status=400)

        sube_id = get_secili_sube_id(request)
        tc = request.query_params.get('tc', '').strip()
        telefon = request.query_params.get('telefon', '').strip()
        context = request.query_params.get('context', '').strip() or None
        exclude_kisi_id = request.query_params.get('exclude_kisi_id')
        exclude_kisi_id = int(exclude_kisi_id) if exclude_kisi_id else None

        resolver = KimlikResolver(kurum_id=kurum_id, sube_id=sube_id)
        result = resolver.resolve(tc=tc or None, telefon=telefon or None, context=context, exclude_kisi_id=exclude_kisi_id)
        if result.get('detail') and not result.get('found'):
            return Response(result, status=400)
        return Response(result)


class KimlikConflictReportView(APIView):
    """GET /api/kimlik/conflicts/ — çakışma özeti (admin)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.kimlik.management.commands.backfill_kisi import collect_conflicts

        kurum_id = get_secili_kurum_id(request)
        if not kurum_id:
            return Response({'detail': 'Kurum bilgisi bulunamadı'}, status=400)

        conflicts = collect_conflicts(kurum_id=kurum_id, dry_run=True)
        return Response({'count': len(conflicts), 'conflicts': conflicts[:200]})
