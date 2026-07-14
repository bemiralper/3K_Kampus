"""
Gider v2 — Query Service (server-side filtre / sıralama / sayfalama).
"""
from __future__ import annotations

from django.db.models import Q

from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.constants.gider_types import GiderDurum
from apps.finans.application.finans_v2.filters import (
    parse_bool,
    parse_date_safe,
    parse_decimal,
    paginate,
    resolve_sort,
)

_DURUM_LABEL = dict(GiderDurum.CHOICES)

_SORT_MAP = {
    'fatura_tarihi': 'fatura_tarihi',
    'vade_tarihi': 'vade_tarihi',
    'net_tutar': 'net_tutar',
    'odenen_toplam': 'odenen_toplam',
    'fatura_no': 'fatura_no',
    'cari': 'cari_hesap__unvan',
    'durum': 'durum',
    'created_at': 'created_at',
}


class GiderQueryService:
    def _base_qs(self, kurum_id, sube_id):
        qs = GiderKaydi.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related(
            'cari_hesap', 'gider_kategorisi', 'maliyet_merkezi', 'proje',
            'odeme_yontemi', 'olusturan', 'mali_hesap',
        ).prefetch_related('etiketler')

    def _apply_filters(self, qs, f):
        f = f or {}

        # Varsayılan: iptal kayıtları listeleme/rapor dışında (dashboard ile tutarlı).
        # İptal giderler cari'de IADE hareketi üretir; toplamlara dahil edilmemeli.
        if f.get('durum'):
            durumlar = [d for d in str(f['durum']).split(',') if d]
            qs = qs.filter(durum__in=durumlar)
        else:
            qs = qs.exclude(durum=GiderDurum.IPTAL)

        arama = f.get('arama')
        if arama:
            qs = qs.filter(
                Q(fatura_no__icontains=arama)
                | Q(aciklama__icontains=arama)
                | Q(cari_hesap__unvan__icontains=arama)
                | Q(gider_kategorisi__ad__icontains=arama)
            )

        if f.get('cari_hesap_id'):
            qs = qs.filter(cari_hesap_id=f['cari_hesap_id'])
        if f.get('gider_kategorisi_id'):
            kid = f['gider_kategorisi_id']
            # Başlık (ana kategori) seçildiyse alt kategorileri de kapsa
            qs = qs.filter(
                Q(gider_kategorisi_id=kid) | Q(gider_kategorisi__parent_id=kid)
            )
        if f.get('maliyet_merkezi_id'):
            qs = qs.filter(maliyet_merkezi_id=f['maliyet_merkezi_id'])
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

        odeme = f.get('odeme_durumu')
        if odeme == 'bekleyen':
            qs = qs.filter(durum__in=[GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI])
        elif odeme == 'tamamlanan':
            qs = qs.filter(durum=GiderDurum.ODENDI)
        elif odeme == 'kismi':
            qs = qs.filter(durum=GiderDurum.KISMI_ODENDI)

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
    def serialize(g: GiderKaydi):
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
            'gider_kategorisi': {
                'id': g.gider_kategorisi_id,
                'ad': g.gider_kategorisi.ad if g.gider_kategorisi_id else None,
            },
            'maliyet_merkezi': {
                'id': g.maliyet_merkezi_id,
                'ad': g.maliyet_merkezi.ad if g.maliyet_merkezi_id else None,
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
            'odenen_toplam': str(g.odenen_toplam),
            'kalan_tutar': str(g.kalan_tutar),
            'odeme_yuzdesi': str(g.odeme_yuzdesi),
            'taksit_sayisi': g.taksit_sayisi,
            'durum': g.durum,
            'durum_label': _DURUM_LABEL.get(g.durum, g.durum),
            'etiketler': [
                {'id': e.id, 'ad': e.ad, 'renk': e.renk}
                for e in g.etiketler.all()
            ],
            'olusturan': (
                (g.olusturan.get_full_name() or g.olusturan.username)
                if g.olusturan is not None
                else None
            ),
            'duzenlenebilir_mi': g.duzenlenebilir_mi,
            'iptal_edilebilir_mi': g.iptal_edilebilir_mi,
            'odenebilir_mi': g.odenebilir_mi,
            'created_at': g.created_at.isoformat() if g.created_at else None,
        }
