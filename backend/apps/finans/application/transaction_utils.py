"""Servislerin (sonuç, hata) sözleşmesini gerçek rollback ile birleştirir."""
from functools import wraps

from django.db import transaction


class ClosedFinancialPeriod(ValueError):
    pass


def atomic_result(method):
    @wraps(method)
    def wrapped(*args, **kwargs):
        try:
            with transaction.atomic():
                result = method(*args, **kwargs)
                if isinstance(result, tuple) and len(result) == 2 and result[1]:
                    transaction.set_rollback(True)
                return result
        except ClosedFinancialPeriod as exc:
            return None, {'genel': str(exc)}
    return wrapped
