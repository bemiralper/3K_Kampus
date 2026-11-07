"""Para toplamlarında kuruşları koruyan dönüşüm."""
from decimal import Decimal


def as_money(value):
    return Decimal(str(value or 0))
