"""Kitap adından yayınevi önerisi — otomatik kaydetmez."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from apps.resources.models import ResourceBook, ResourcePublisher


def _normalize(text: str) -> str:
    text = unicodedata.normalize('NFKC', text or '')
    text = text.casefold()
    text = text.replace('ı', 'i').replace('İ', 'i')
    text = re.sub(r'[^\w\s]', ' ', text, flags=re.UNICODE)
    return re.sub(r'\s+', ' ', text).strip()


@dataclass
class MatchSuggestion:
    book_id: int
    book_ad: str
    publisher_id: int | None
    publisher_ad: str
    matched_key: str
    confidence: float

    def to_dict(self) -> dict:
        return {
            'book_id': self.book_id,
            'book_ad': self.book_ad,
            'publisher_id': self.publisher_id,
            'publisher_ad': self.publisher_ad,
            'matched_key': self.matched_key,
            'confidence': round(self.confidence, 4),
            'confidence_percent': int(round(self.confidence * 100)),
        }


def _publisher_keys(publisher: ResourcePublisher) -> list[str]:
    return [k for k in publisher.match_keys() if _normalize(k)]


def score_match(book_ad: str, key: str) -> float:
    """Kelime sınırı tercihli güven skoru 0–1."""
    hay = _normalize(book_ad)
    needle = _normalize(key)
    if not hay or not needle or len(needle) < 2:
        return 0.0
    if needle not in hay:
        return 0.0
    # Kelime sınırı (baş/son veya boşluk)
    pattern = rf'(?:^|\s){re.escape(needle)}(?:\s|$)'
    boundary = bool(re.search(pattern, hay))
    length_ratio = min(1.0, len(needle) / max(len(hay), 1))
    base = 0.55 + 0.35 * length_ratio
    if boundary:
        base = min(0.99, base + 0.12)
    else:
        base = min(0.92, base)
    # Çok kısa anahtarları cezalandır
    if len(needle) < 3:
        base *= 0.7
    return min(0.99, base)


def suggest_for_book(
    book: ResourceBook,
    publishers: list[ResourcePublisher],
    *,
    min_confidence: float = 0.55,
) -> MatchSuggestion | None:
    best: MatchSuggestion | None = None
    for pub in publishers:
        for key in _publisher_keys(pub):
            conf = score_match(book.ad, key)
            if conf < min_confidence:
                continue
            if best is None or conf > best.confidence or (
                conf == best.confidence and len(key) > len(best.matched_key)
            ):
                best = MatchSuggestion(
                    book_id=book.id,
                    book_ad=book.ad,
                    publisher_id=pub.id,
                    publisher_ad=pub.ad,
                    matched_key=key,
                    confidence=conf,
                )
    return best


def build_suggestions(
    kurum_id: int,
    *,
    sube_id: int | None = None,
    min_confidence: float = 0.55,
    only_empty: bool = True,
) -> list[dict]:
    pubs = list(
        ResourcePublisher.objects.filter(kurum_id=kurum_id, aktif_mi=True).order_by('ad')
    )
    if not pubs:
        return []

    books = ResourceBook.objects.filter(kurum_id=kurum_id, aktif_mi=True)
    if sube_id:
        books = books.filter(sube_id=sube_id)
    if only_empty:
        books = books.filter(publisher__isnull=True)
    books = books.order_by('ad')

    out = []
    for book in books.iterator():
        suggestion = suggest_for_book(book, pubs, min_confidence=min_confidence)
        if suggestion:
            out.append(suggestion.to_dict())
        else:
            out.append({
                'book_id': book.id,
                'book_ad': book.ad,
                'publisher_id': None,
                'publisher_ad': '',
                'matched_key': '',
                'confidence': 0,
                'confidence_percent': 0,
            })
    # Önerisi olanlar önce, güvene göre
    out.sort(key=lambda r: (-(r.get('confidence') or 0), r.get('book_ad') or ''))
    return out


def assign_publisher_to_books(
    *,
    kurum_id: int,
    sube_id: int | None,
    book_ids: list[int],
    publisher_id: int,
) -> int:
    publisher = ResourcePublisher.objects.filter(
        pk=publisher_id, kurum_id=kurum_id,
    ).first()
    if not publisher:
        raise ValueError('Yayınevi bulunamadı.')
    qs = ResourceBook.objects.filter(pk__in=book_ids, kurum_id=kurum_id)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    return qs.update(publisher_id=publisher.id)
