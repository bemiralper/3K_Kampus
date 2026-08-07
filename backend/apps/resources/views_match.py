"""Yayınevi toplu eşleştirme API."""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication

from .permissions import IsAuthenticatedResourceReadOrAdminWrite
from .scoping import get_request_kurum_id, get_request_sube_id
from .application.publisher_match import assign_publisher_to_books, build_suggestions


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


class PublisherMatchViewSet(viewsets.ViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated, IsAuthenticatedResourceReadOrAdminWrite]

    def list(self, request):
        """GET /api/resources/publisher-match/ — öneriler listesi."""
        return self.suggestions(request)

    @action(detail=False, methods=['get'], url_path='suggestions')
    def suggestions(self, request):
        kurum_id = get_request_kurum_id(request)
        sube_id = get_request_sube_id(request, kurum_id=kurum_id)
        if not kurum_id or not sube_id:
            return Response(
                {'success': False, 'error': 'Kurum ve şube bağlamı gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        min_conf = float(request.query_params.get('min_confidence') or 0.55)
        only_empty = request.query_params.get('only_empty', 'true').lower() != 'false'
        data = build_suggestions(
            kurum_id,
            sube_id=sube_id,
            min_confidence=min_conf,
            only_empty=only_empty,
        )
        with_suggestion = sum(1 for r in data if r.get('publisher_id'))
        return Response({
            'success': True,
            'data': {
                'items': data,
                'total': len(data),
                'with_suggestion': with_suggestion,
            },
        })

    @action(detail=False, methods=['post'], url_path='confirm')
    def confirm(self, request):
        """
        Onayla — items: [{book_id, publisher_id}] veya
        book_ids + publisher_id (tek yayınevi).
        """
        kurum_id = get_request_kurum_id(request)
        sube_id = get_request_sube_id(request, kurum_id=kurum_id)
        if not kurum_id or not sube_id:
            return Response(
                {'success': False, 'error': 'Kurum ve şube bağlamı gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = request.data.get('items')
        updated = 0
        try:
            if items and isinstance(items, list):
                by_pub: dict[int, list[int]] = {}
                for item in items:
                    bid = int(item['book_id'])
                    pid = int(item['publisher_id'])
                    by_pub.setdefault(pid, []).append(bid)
                for pid, bids in by_pub.items():
                    updated += assign_publisher_to_books(
                        kurum_id=kurum_id,
                        sube_id=sube_id,
                        book_ids=bids,
                        publisher_id=pid,
                    )
            else:
                book_ids = request.data.get('book_ids') or []
                publisher_id = request.data.get('publisher_id')
                if not book_ids or not publisher_id:
                    return Response(
                        {'success': False, 'error': 'book_ids ve publisher_id veya items gerekli.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                updated = assign_publisher_to_books(
                    kurum_id=kurum_id,
                    sube_id=sube_id,
                    book_ids=[int(x) for x in book_ids],
                    publisher_id=int(publisher_id),
                )
        except ValueError as exc:
            return Response(
                {'success': False, 'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except (TypeError, KeyError) as exc:
            return Response(
                {'success': False, 'error': f'Geçersiz istek: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if updated == 0:
            return Response({
                'success': False,
                'error': 'Hiçbir kitap güncellenmedi. Kitap/şube kapsamını kontrol edin.',
                'data': {'updated': 0},
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'success': True,
            'data': {'updated': updated},
            'message': f'{updated} kitap eşleştirildi.',
        })

    @action(detail=False, methods=['post'], url_path='manual-bulk')
    def manual_bulk(self, request):
        """Manuel toplu: seçilen kitaplar + tek yayınevi."""
        return self.confirm(request)
