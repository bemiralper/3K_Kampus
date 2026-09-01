"""3K Modu katalogu ve haftalık odak hesabı (soru ağırlıklı)."""

from __future__ import annotations

from typing import Iterable

from .models import AssignmentLesson

K3_MODE_ORDER = [
    AssignmentLesson.K3Mode.OGREN,
    AssignmentLesson.K3Mode.PEKISTIR,
    AssignmentLesson.K3Mode.TEKRARLA,
    AssignmentLesson.K3Mode.HIZLAN,
    AssignmentLesson.K3Mode.TAMAMLA,
]

FOCUS_MIN_SHARE = 40
FOCUS_MIN_GAP = 15


def normalize_k3_mode(value) -> str:
    raw = (value or '').strip().upper()
    if raw in AssignmentLesson.K3Mode.values:
        return raw
    return ''


def compute_k3_distribution(mode_questions: dict[str, int]) -> list[dict]:
    """Soru paylarına göre yüzde dağılımı. Sıra katalog sırasıdır."""
    cleaned: dict[str, int] = {}
    for mode, count in (mode_questions or {}).items():
        key = normalize_k3_mode(mode)
        if not key:
            continue
        try:
            n = int(count or 0)
        except (TypeError, ValueError):
            n = 0
        if n <= 0:
            continue
        cleaned[key] = cleaned.get(key, 0) + n

    total = sum(cleaned.values())
    rows = []
    for mode in K3_MODE_ORDER:
        questions = cleaned.get(mode, 0)
        if questions <= 0:
            continue
        percent = round(100 * questions / total) if total else 0
        rows.append({
            'mode': mode,
            'label': AssignmentLesson.K3Mode(mode).label,
            'questions': questions,
            'percent': percent,
        })
    if rows:
        drift = 100 - sum(r['percent'] for r in rows)
        if drift and rows:
            rows[0]['percent'] += drift
    return rows


def resolve_week_focus(shares: Iterable[dict]) -> dict | None:
    """
    En yüksek pay belirgin öndeyse o modu döndür.

    - tek mod → odak
    - aksi halde birinci >= %40 ve (birinci − ikinci) >= 15
    """
    ranked = sorted(
        [s for s in shares if (s.get('percent') or 0) > 0],
        key=lambda s: (-int(s.get('percent') or 0), K3_MODE_ORDER.index(s['mode']) if s.get('mode') in K3_MODE_ORDER else 99),
    )
    if not ranked:
        return None
    if len(ranked) == 1:
        return ranked[0]
    top, second = ranked[0], ranked[1]
    if int(top['percent']) >= FOCUS_MIN_SHARE and int(top['percent']) - int(second['percent']) >= FOCUS_MIN_GAP:
        return top
    return None
