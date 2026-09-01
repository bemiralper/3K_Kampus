"""
Türkçe karakterlere duyarsız arama.

PostgreSQL ILIKE varsayılan collation'da:
- i/İ/ı/I eşleşmez ('ipek' ≠ 'İpek')
- ç/ğ/ö/ş/ü büyük-küçük genelde çalışır ama aksansız yazım çalışmaz
  ('gunes' ≠ 'Güneş', 'isik' ≠ 'Işık')

icontains / iexact / istartswith / iendswith her iki tarafta da
Türkçe harfleri ASCII karşılıklarına indirger, sonra LOWER + LIKE kullanır.
"""
from django.db.models import Field
from django.db.models.lookups import IContains, IEndsWith, IExact, IStartsWith

# İIı Çç Ğğ Öö Şş Üü  →  iii cc gg oo ss uu
_TR_FROM = "İIıÇçĞğÖöŞşÜü"
_TR_TO = "iiiccggoossuu"


def _fold_sql(sql: str) -> str:
    return f"LOWER(TRANSLATE({sql}, '{_TR_FROM}', '{_TR_TO}'))"


class _TurkishFoldedLookup:
    def as_postgresql(self, compiler, connection):
        lhs, lhs_params = self.process_lhs(compiler, connection)
        rhs, rhs_params = self.process_rhs(compiler, connection)
        if getattr(self, "lookup_name", "") == "iexact":
            sql = f"{_fold_sql(lhs)} = {_fold_sql(rhs)}"
            return sql, tuple(lhs_params) + tuple(rhs_params)
        sql = f"{_fold_sql(lhs)} LIKE {_fold_sql(rhs)} ESCAPE '\\'"
        return sql, tuple(lhs_params) + tuple(rhs_params)


class TurkishIContains(_TurkishFoldedLookup, IContains):
    lookup_name = "icontains"


class TurkishIExact(_TurkishFoldedLookup, IExact):
    lookup_name = "iexact"


class TurkishIStartsWith(_TurkishFoldedLookup, IStartsWith):
    lookup_name = "istartswith"


class TurkishIEndsWith(_TurkishFoldedLookup, IEndsWith):
    lookup_name = "iendswith"


def register_turkish_lookups() -> None:
    Field.register_lookup(TurkishIContains)
    Field.register_lookup(TurkishIExact)
    Field.register_lookup(TurkishIStartsWith)
    Field.register_lookup(TurkishIEndsWith)


register_turkish_lookups()
