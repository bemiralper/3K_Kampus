"""
Toplu WhatsApp gönderimi.

Kampanya kuyruğu ve toplu döngüler aynı kapıyı kullanır: aynı anda sınırlı
işçi, saniyede sınırlı mesaj, aynı numaraya ara. Tek işçi (test) eski seri
yolu bozmaz. Sonuç, Meta yanıtı geldikten sonra döner.
"""
from __future__ import annotations

import contextvars
import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import TypeVar

from django.conf import settings
from django.db import close_old_connections

logger = logging.getLogger(__name__)

T = TypeVar('T')

_pool = contextvars.ContextVar('wa_bulk_pool', default=False)
_gate: 'SendGate | None' = None
_gate_lock = threading.Lock()


def queue_workers() -> int:
    raw = int(getattr(settings, 'COMMUNICATION_QUEUE_WORKERS', 8) or 1)
    return max(1, min(raw, 16))


def pool_active() -> bool:
    return bool(_pool.get())


class SendGate:
    """Hat tavanı ve aynı numaraya alt sınır. Meta 80/sn ve 131056 için."""

    def __init__(self, *, max_per_second: float, pair_gap_seconds: float):
        self._lock = threading.Lock()
        self._gap = 1.0 / max_per_second if max_per_second > 0 else 0.0
        self._pair = max(0.0, float(pair_gap_seconds or 0))
        self._next_global = 0.0
        self._next_phone: dict[str, float] = {}

    def wait(self, phone: str) -> None:
        phone = (phone or '').strip()
        while True:
            with self._lock:
                now = time.monotonic()
                ready = self._next_global
                if phone and self._pair:
                    ready = max(ready, self._next_phone.get(phone, 0.0))
                if now >= ready:
                    self._next_global = now + self._gap
                    if phone and self._pair:
                        self._next_phone[phone] = now + self._pair
                    return
                delay = ready - now
            time.sleep(min(delay, 0.25))


def reset_send_gate() -> None:
    global _gate
    with _gate_lock:
        _gate = None


def get_send_gate() -> SendGate:
    global _gate
    with _gate_lock:
        if _gate is None:
            _gate = SendGate(
                max_per_second=float(
                    getattr(settings, 'COMMUNICATION_QUEUE_MAX_PER_SECOND', 20) or 20,
                ),
                pair_gap_seconds=float(
                    getattr(settings, 'COMMUNICATION_QUEUE_PAIR_GAP_SECONDS', 6) or 0,
                ),
            )
        return _gate


def wait_send_slot(phone: str) -> None:
    get_send_gate().wait(phone)


def map_bulk(calls: list[Callable[[], T]]) -> list[T]:
    """Çağrıları sırayı koruyarak çalıştırır.

    Tek işçi veya tek çağrı aynı thread'dedir; hata olduğu gibi fırlar.
    Birden fazla işçi Meta çağrılarını yan yana yapar. Bir kayıt hata
    verirse diğerleri tamamlanır ve hata, sonuç listesinde Exception
    olarak durur.
    """
    if not calls:
        return []
    workers = queue_workers()
    if workers <= 1 or len(calls) <= 1:
        return [fn() for fn in calls]

    def run(fn: Callable[[], T]) -> T:
        token = _pool.set(True)
        close_old_connections()
        try:
            return fn()
        except Exception as exc:
            logger.exception('Toplu WhatsApp gönderimi başarısız')
            return exc  # type: ignore[return-value]
        finally:
            close_old_connections()
            _pool.reset(token)

    with ThreadPoolExecutor(
        max_workers=min(workers, len(calls)),
        thread_name_prefix='wa-send',
    ) as pool:
        return list(pool.map(run, calls))
