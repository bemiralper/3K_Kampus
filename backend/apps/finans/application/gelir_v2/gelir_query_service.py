"""
Gelir v2 — Query Service (server-side filtre / sıralama / sayfalama).

Frontend hiçbir hesaplama yapmaz; tüm türetilmiş alanlar (kalan tutar, yüzde,
durum etiketi) burada üretilir.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Q

from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.constants.cari_types import GelirDurum
from apps.finans.application.finans_v2.filters import (
    parse_bool,
    parse_date_safe,
    parse_decimal,
    paginate,
    resolve_sort,
)

_DURUM_LABEL = dict(GelirDurum.CHOICES)

_SORT_MAP = {
    'fatura_tarihi': 'fatura_tarihi',
    'vade_tarihi': 'vade_tarihi',
    'net_tutar': 'net_tutar',
    'tahsil_edilen': 'tahsil_edilen',
    'fatura_no': 'fatura_no',
    'cari': 'cari_hesap__unvan',
    'durum': 'durum',
    'created_at': 'created_at',
}


class GelirQueryService:
    def _base_qs(self, kurum_id, sube_id):
        qs = GelirKaydi.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related(
            'cari_hesap', 'gelir_kategorisi', 'gelir_kaynagi', 'proje',
            'odeme_yontemi', 'olusturan', 'mali_hesap',
        ).prefetch_related('etiketler')

    def _apply_filters(self, qs, f):
        if not f:
            return qs

        arama = f.get('arama')
        if arama:
            qs = qs.filter(
                Q(fatura_no__icontains=arama)
                | Q(aciklama__icontains=arama)
                | Q(cari_hesap__unvan__icontains=arama)
                | Q(gelir_kategorisi__ad__icontains=arama)
            )

        if f.get('durum'):
            durumlar = [d for d in str(f['durum']).split(',') if d]
            qs = qs.filter(durum__in=durumlar)

        if f.get('cari_hesap_id'):
            qs = qs.filter(cari_hesap_id=f['cari_hesap_id'])
        if f.get('gelir_kategorisi_id'):
            kid = f['gelir_kategorisi_id']
            # Başlık (ana kategori) seçildiyse alt kategorileri de kapsa
            qs = qs.filter(
                Q(gelir_kategorisi_id=kid) | Q(gelir_kategorisi__parent_id=kid)
            )
        if f.get('gelir_kaynagi_id'):
            qs = qs.filter(gelir_kaynagi_id=f['gelir_kaynagi_id'])
        if f.get('proje_id'):
            qs = qs.filter(proje_id=f['proje_id'])
        if f.get('odeme_yontemi_id'):
            qs = qs.filter(odeme_yontemi_id=f['odeme_yontemi_id'])
        if f.get('olusturan_id'):
            qs = qs.filter(olusturan_id=f['olusturan_id'])
        if f.get('etiket_id'):
            qs = qs.filter(etiketler__id=f['etiket_id'])
        if f.get('belge_no'):
            qs = qs.filter(fatura_no__icontains=f['belge_no'])

        bas = parse_date_safe(f.get('baslangic'))
        if bas:
            qs = qs.filter(fatura_tarihi__gte=bas)
        bit = parse_date_safe(f.get('bitis'))
        if bit:
            qs = qs.filter(fatura_tarihi__lte=bit)

        tmin = parse_decimal(f.get('tutar_min'))
        if tmin is not None:
            qs = qs.filter(net_tutar__gte=tmin)
        tmax = parse_decimal(f.get('tutar_max'))
        if tmax is not None:
            qs = qs.filter(net_tutar__lte=tmax)

        kdv_var = parse_bool(f.get('kdv_var'))
        if kdv_var is True:
            qs = qs.filter(kdv_tutar__gt=0)
        elif kdv_var is False:
            qs = qs.filter(kdv_tutar=0)
        if f.get('kdv_orani') not in (None, ''):
            qs = qs.filter(kdv_orani=f['kdv_orani'])

        # tahsil durumu: bekleyen / tahsil / kismi
        tahsil = f.get('tahsil_durumu')
        if tahsil == 'bekleyen':
            qs = qs.filter(durum__in=[GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL])
        elif tahsil == 'tamamlanan':
            qs = qs.filter(durum=GelirDurum.TAHSIL_EDILDI)
        elif tahsil == 'kismi':
            qs = qs.filter(durum=GelirDurum.KISMI_TAHSIL)

        return qs.distinct()

    def list_paginated(self, kurum_id, sube_id, *, filters=None, sort=None,
                       page=1, page_size=25):
        qs = self._apply_filters(self._base_qs(kurum_id, sube_id), filters)
        order = resolve_sort(sort, _SORT_MAP, '-fatura_tarihi')
        qs = qs.order_by(order, '-created_at')
        items, meta = paginate(qs, page, page_size)
        return {
            'results': [self.serialize(g) for g in items],
            **meta,
        }

    @staticmethod
    def serialize(g: GelirKaydi):
        return {
            'id': g.id,
            'fatura_no': g.fatura_no,
            'fatura_tarihi': g.fatura_tarihi.isoformat() if g.fatura_tarihi else None,
            'vade_tarihi': g.vade_tarihi.isoformat() if g.vade_tarihi else None,
            'aciklama': g.aciklama,
            'cari_hesap': {
                'id': g.cari_hesap_id,
                'unvan': g.cari_hesap.unvan if g.cari_hesap_id else None,
            },
            'gelir_kategorisi': {
                'id': g.gelir_kategorisi_id,
                'ad': g.gelir_kategorisi.ad if g.gelir_kategorisi_id else None,
            },
            'gelir_kaynagi': {
                'id': g.gelir_kaynagi_id,
                'ad': g.gelir_kaynagi.ad if g.gelir_kaynagi_id else None,
            },
            'proje': {
                'id': g.proje_id,
                'ad': g.proje.ad if g.proje_id else None,
            },
            'odeme_yontemi': {
                'id': g.odeme_yontemi_id,
                'ad': g.odeme_yontemi.ad if g.odeme_yontemi_id else None,
            },
            'brut_tutar': str(g.brut_tutar),
            'kdv_orani': g.kdv_orani,
            'kdv_tutar': str(g.kdv_tutar),
            'net_tutar': str(g.net_tutar),
            'tahsil_edilen': str(g.tahsil_edilen),
            'kalan_tutar': str(g.kalan_tutar),
            'tahsilat_yuzdesi': str(g.tahsilat_yuzdesi),
            'durum': g.durum,
            'durum_label': _DURUM_LABEL.get(g.durum, g.durum),
            'etiketler': [
                {'id': e.id, 'ad': e.ad, 'renk': e.renk}
                for e in g.etiketler.all()
            ],
            'olusturan': (g.olusturan.get_full_name() or g.olusturan.username) if g.olusturan_id else None,
            'duzenlenebilir_mi': g.duzenlenebilir_mi,
            'iptal_edilebilir_mi': g.iptal_edilebilir_mi,
            'created_at': g.created_at.isoformat() if g.created_at else None,
        }
