"""
Cari v2 — Liste sorgu servisi.

Server-side filtreleme, sıralama ve sayfalama. Tüm bakiye/risk
hesaplamaları merkezi yardımcılarla yapılır.
"""
from __future__ import annotations

from django.db.models import (
    Case,
    DecimalField,
    ExpressionWrapper,
    F,
    Max,
    Q,
    Value,
    When,
)
from django.utils import timezone

from apps.finans.application.cari_balance import (
    aggregate_list_totals,
    empty_islem_totals,
)
from apps.finans.application.cari_v2.cari_risk_service import hesapla_risk
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.constants.cari_types import CariHareketTuru
from apps.finans.domain.cari_hesap import CariHesap

_DEC = DecimalField(max_digits=15, decimal_places=2)

_SORT_FIELDS = {
    'unvan': 'unvan',
    'gorunen_ad': 'unvan',
    'hesap_kodu': 'hesap_kodu',
    'net_bakiye': 'net_bakiye',
    'bakiye': 'net_bakiye',
    'acik_borc': 'f_acik_borc',
    'acik_alacak': 'f_acik_alacak',
    'toplam_borc': 'toplam_borc',
    'toplam_alacak': 'toplam_alacak',
    'son_islem_tarihi': 'son_islem_tarihi_ann',
    'created_at': 'created_at',
}


def _as_list(value):
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        items = list(value)
    else:
        items = [p.strip() for p in str(value).split(',')]
    items = [i for i in items if i not in (None, '')]
    return items or None


def _as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class CariQueryService:
    """Cari hesap liste sorguları (filtre + sıralama + sayfalama)."""

    def __init__(self):
        self.selector = CariHesapSelector()

    # ─── Filtre uygulanmış queryset ──────────────
    def _build_queryset(self, kurum_id, sube_id, filters):
        filters = filters or {}
        qs = CariHesap.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        # Durum
        durum = filters.get('durum')
        if durum == 'aktif':
            qs = qs.filter(aktif_mi=True)
        elif durum == 'pasif':
            qs = qs.filter(aktif_mi=False)

        # Tür
        turler = _as_list(filters.get('hesap_turu'))
        if turler:
            qs = qs.filter(hesap_turu__in=turler)

        # Etiket
        etiketler = _as_list(filters.get('etiketler'))
        if etiketler:
            qs = qs.filter(etiketler__id__in=etiketler).distinct()

        # Kategori (serbest metin)
        kategori = filters.get('kategori')
        if kategori:
            qs = qs.filter(kategori__icontains=kategori)

        # Coğrafi / yetkili
        if filters.get('il'):
            qs = qs.filter(il__icontains=filters['il'])
        if filters.get('ilce'):
            qs = qs.filter(ilce__icontains=filters['ilce'])
        if filters.get('yetkili'):
            qs = qs.filter(yetkili_kisi__icontains=filters['yetkili'])

        # Gelir / gider türü (kategori ilişkisi)
        if filters.get('gelir_kategori'):
            qs = qs.filter(gelir_kategorileri__id=filters['gelir_kategori'])
        if filters.get('gider_kategori'):
            qs = qs.filter(gider_kategorileri__id=filters['gider_kategori'])

        # Arama
        arama = (filters.get('arama') or '').strip()
        if arama:
            qs = qs.filter(
                Q(unvan__icontains=arama)
                | Q(kisa_ad__icontains=arama)
                | Q(vergi_no__icontains=arama)
                | Q(hesap_kodu__icontains=arama)
                | Q(telefon__icontains=arama)
                | Q(email__icontains=arama)
            )

        # Hesaplanan alanlar
        qs = qs.annotate(
            net_bakiye=ExpressionWrapper(
                F('toplam_borc') - F('toplam_alacak'), output_field=_DEC,
            ),
        ).annotate(
            f_acik_borc=Case(
                When(net_bakiye__lt=0, then=F('net_bakiye') * Value(-1)),
                default=Value(0),
                output_field=_DEC,
            ),
            f_acik_alacak=Case(
                When(net_bakiye__gt=0, then=F('net_bakiye')),
                default=Value(0),
                output_field=_DEC,
            ),
            son_islem_tarihi_ann=Max('hareketler__islem_tarihi'),
        )

        # Bakiye durumu
        bd = filters.get('bakiye_durumu')
        if bd == 'borclu':
            qs = qs.filter(net_bakiye__lt=0)
        elif bd == 'alacakli':
            qs = qs.filter(net_bakiye__gt=0)
        elif bd == 'dengede':
            qs = qs.filter(net_bakiye=0)

        # Sayısal aralıklar
        rng = [
            ('bakiye_min', 'net_bakiye__gte'),
            ('bakiye_max', 'net_bakiye__lte'),
            ('borc_min', 'f_acik_borc__gte'),
            ('borc_max', 'f_acik_borc__lte'),
            ('alacak_min', 'f_acik_alacak__gte'),
            ('alacak_max', 'f_acik_alacak__lte'),
        ]
        for key, lookup in rng:
            val = _as_float(filters.get(key))
            if val is not None:
                qs = qs.filter(**{lookup: val})

        # Son işlem tarihi aralığı
        if filters.get('son_islem_baslangic'):
            qs = qs.filter(son_islem_tarihi_ann__gte=filters['son_islem_baslangic'])
        if filters.get('son_islem_bitis'):
            qs = qs.filter(son_islem_tarihi_ann__lte=filters['son_islem_bitis'])

        return qs

    def _apply_risk_vade_filter(self, qs, filters):
        """Risk / vade filtreleri (hesaplanan) — id kümesine indirger."""
        risk_filter = filters.get('risk_durumu')
        vade_filter = filters.get('vade')
        if not risk_filter and not vade_filter:
            return qs

        rows = list(qs.values('id', 'f_acik_borc', 'risk_limiti'))
        ids = [r['id'] for r in rows]
        if not ids:
            return qs.none()

        today = timezone.localdate()
        (vg_o, vgc_o, gv_o, vg_t, vgc_t, gv_t) = self.selector._vade_aging_maps(ids, today)

        allowed = set()
        for r in rows:
            hid = r['id']
            vadesi_gecmis = float(vgc_o.get(hid, 0)) + float(vgc_t.get(hid, 0))
            vadesi_gelen = float(vg_o.get(hid, 0)) + float(vg_t.get(hid, 0))
            gelecek = float(gv_o.get(hid, 0)) + float(gv_t.get(hid, 0))

            ok = True
            if risk_filter:
                risk = hesapla_risk(
                    float(r['f_acik_borc'] or 0),
                    float(r['risk_limiti'] or 0),
                    vadesi_gecmis,
                )
                ok = ok and (risk['risk_durumu'] == risk_filter)
            if vade_filter == 'gecmis':
                ok = ok and vadesi_gecmis > 0
            elif vade_filter == 'gelen':
                ok = ok and vadesi_gelen > 0
            elif vade_filter == 'gelecek':
                ok = ok and gelecek > 0
            if ok:
                allowed.add(hid)

        return qs.filter(id__in=allowed)

    def _sort(self, qs, sort):
        if not sort:
            return qs.order_by('unvan')
        desc = sort.startswith('-')
        key = sort[1:] if desc else sort
        field = _SORT_FIELDS.get(key)
        if not field:
            return qs.order_by('unvan')
        return qs.order_by(f'-{field}' if desc else field)

    def _row(self, hesap, islem_map, son_map, aging):
        hid = hesap.pk
        islem = islem_map.get(hid, empty_islem_totals())
        son = son_map.get(hid)
        son_yapan = None
        if son and son.islem_yapan:
            son_yapan = son.islem_yapan.get_full_name() or son.islem_yapan.username

        vg_o, vgc_o, gv_o, vg_t, vgc_t, gv_t = aging
        vadesi_gecmis = float(vgc_o.get(hid, 0)) + float(vgc_t.get(hid, 0))
        vadesi_gelen = float(vg_o.get(hid, 0)) + float(vg_t.get(hid, 0))
        gelecek = float(gv_o.get(hid, 0)) + float(gv_t.get(hid, 0))

        acik_borc = float(hesap.acik_borc)
        risk = hesapla_risk(acik_borc, float(hesap.risk_limiti or 0), vadesi_gecmis)

        return {
            'id': hid,
            'hesap_kodu': hesap.hesap_kodu,
            'unvan': hesap.unvan,
            'kisa_ad': hesap.kisa_ad,
            'gorunen_ad': hesap.gorunen_ad,
            'hesap_turu': hesap.hesap_turu,
            'hesap_turu_display': hesap.hesap_turu_display,
            'kategori': hesap.kategori,
            'vergi_no': hesap.vergi_no,
            'telefon': hesap.telefon,
            'email': hesap.email,
            'yetkili_kisi': hesap.yetkili_kisi,
            'il': hesap.il,
            'ilce': hesap.ilce,
            'etiketler': [
                {'id': e.id, 'ad': e.ad, 'renk': e.renk}
                for e in hesap.etiketler.all()
            ],
            'toplam_borc': float(hesap.toplam_borc),
            'toplam_alacak': float(hesap.toplam_alacak),
            'bakiye': float(hesap.bakiye),
            'acik_borc': acik_borc,
            'acik_alacak': float(hesap.acik_alacak),
            'bakiye_durumu': hesap.bakiye_durumu,
            'toplam_satis': islem[CariHareketTuru.SATIS],
            'toplam_alis': islem[CariHareketTuru.ALIS],
            'toplam_tahsilat': islem[CariHareketTuru.TAHSILAT],
            'toplam_odeme': islem[CariHareketTuru.ODEME],
            'toplam_iade': islem[CariHareketTuru.IADE],
            'toplam_mahsup': islem[CariHareketTuru.MAHSUP],
            'vadesi_gelen': vadesi_gelen,
            'vadesi_gecmis': vadesi_gecmis,
            'gelecek_vadeli': gelecek,
            'risk_limiti': float(hesap.risk_limiti or 0),
            'risk_durumu': risk['risk_durumu'],
            'risk_durumu_display': risk['risk_durumu_display'],
            'risk_skoru': risk['risk_skoru'],
            'son_islem_tarihi': son.islem_tarihi.isoformat() if son else None,
            'son_islem_turu': son.get_islem_turu_display() if son else None,
            'son_islem_yapan': son_yapan,
            'aktif_mi': hesap.aktif_mi,
            'created_at': hesap.created_at.isoformat() if hesap.created_at else None,
        }

    def list_paginated(
        self,
        kurum_id,
        sube_id=None,
        *,
        filters=None,
        sort=None,
        page=1,
        page_size=25,
    ):
        qs = self._build_queryset(kurum_id, sube_id, filters)
        qs = self._apply_risk_vade_filter(qs, filters or {})
        qs = self._sort(qs, sort)

        try:
            page = max(1, int(page))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(200, max(1, int(page_size)))
        except (TypeError, ValueError):
            page_size = 25

        count = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        hesap_list = list(
            qs.prefetch_related('etiketler')[start:end]
        )
        hesap_ids = [h.pk for h in hesap_list]

        islem_map = self.selector._islem_totals_map(hesap_ids)
        son_map = self.selector._son_hareket_map(hesap_ids)
        aging = self.selector._vade_aging_maps(hesap_ids, timezone.localdate())

        results = [self._row(h, islem_map, son_map, aging) for h in hesap_list]
        totals = aggregate_list_totals(results)
        total_pages = (count + page_size - 1) // page_size if page_size else 1

        return {
            'results': results,
            'count': count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'totals': totals,
        }
