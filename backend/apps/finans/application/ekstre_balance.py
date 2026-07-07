"""
Cari ekstre bakiye hesapları — frontend ile aynı mantık (test / doğrulama).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any


def _dec(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    return Decimal(str(value))


def compare_hareket_chronological(a: dict, b: dict) -> int:
    date_a = str(a.get("islem_tarihi") or "")[:10]
    date_b = str(b.get("islem_tarihi") or "")[:10]
    if date_a != date_b:
        return -1 if date_a < date_b else 1
    created_a = str(a.get("created_at") or "")
    created_b = str(b.get("created_at") or "")
    if created_a and created_b and created_a != created_b:
        return -1 if created_a < created_b else 1
    return int(a.get("id") or 0) - int(b.get("id") or 0)


def get_bakiye_sonrasi(h: dict) -> Decimal:
    if h.get("bakiye_sonrasi") is not None:
        return _dec(h["bakiye_sonrasi"])
    return _dec(h.get("borc_sonrasi")) - _dec(h.get("alacak_sonrasi"))


def get_bakiye_oncesi(h: dict) -> Decimal:
    if h.get("bakiye_oncesi") is not None:
        return _dec(h["bakiye_oncesi"])
    return _dec(h.get("borc_oncesi")) - _dec(h.get("alacak_oncesi"))


def compute_devreden_bakiye(hareketler: list[dict]) -> Decimal:
    if not hareketler:
        return Decimal("0")
    sorted_rows = sorted(hareketler, key=lambda h: (
        str(h.get("islem_tarihi") or "")[:10],
        str(h.get("created_at") or ""),
        int(h.get("id") or 0),
    ))
    return get_bakiye_oncesi(sorted_rows[0])


def compute_kapanis_bakiye(hareketler: list[dict]) -> Decimal:
    if not hareketler:
        return compute_devreden_bakiye(hareketler)
    sorted_rows = sorted(hareketler, key=lambda h: (
        str(h.get("islem_tarihi") or "")[:10],
        str(h.get("created_at") or ""),
        int(h.get("id") or 0),
    ))
    return get_bakiye_sonrasi(sorted_rows[-1])
