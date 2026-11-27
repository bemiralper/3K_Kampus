"""
Gelir v2 — Query Service (server-side filtre / sıralama / sayfalama).

Frontend hiçbir hesaplama yapmaz; tüm türetilmiş alanlar (kalan tutar, yüzde,
durum etiketi) burada üretilir.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import F, Q, Sum
from django.utils import timezone

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

_TAHSIL_DURUMU_LABEL = {
    'tahsil_edildi': 'Tahsil Edildi',
    'kismi_tahsil': 'Kısmi Tahsil Edildi',
    'gecikti': 'Vadesi Geçti',
    'ileri_tarihli': 'İleri Tarihli',
    'bekliyor': 'Tahsilat Bekliyor',
    'taslak': 'Taslak',
    'iptal': 'İptal',
}


def compute_tahsil_durumu(g: GelirKaydi, bugun=None) -> str:
    if g.durum == GelirDurum.IPTAL:
        return 'iptal'
    if g.durum == GelirDurum.TASLAK:
        return 'taslak'
    if g.durum == GelirDurum.TAHSIL_EDILDI or g.kalan_tutar <= Decimal('0'):
        return 'tahsil_edildi'
    bugun = bugun or timezone.localdate()
    if g.vade_tarihi and g.vade_tarihi < bugun:
        return 'gecikti'
    if g.durum == GelirDurum.KISMI_TAHSIL or (g.tahsil_edilen or Decimal('0')) > Decimal('0'):
        return 'kismi_tahsil'
    if g.vade_tarihi and g.vade_tarihi > bugun:
        return 'ileri_tarihli'
    return 'bekliyor'

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
        f = f or {}

        if f.get('durum'):
            durumlar = [d for d in str(f['durum']).split(',') if d]
            qs = qs.filter(durum__in=durumlar)
        else:
            # Varsayılan: iptal kayıtları listeleme/rapor dışında (dashboard ile tutarlı).
            qs = qs.exclude(durum=GelirDurum.IPTAL)

        arama = f.get('arama')
        if arama:
            qs = qs.filter(
                Q(fatura_no__icontains=arama)
                | Q(aciklama__icontains=arama)
                | Q(cari_hesap__unvan__icontains=arama)
                | Q(gelir_kategorisi__ad__icontains=arama)
            )

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
        vade_bas = parse_date_safe(f.get('vade_baslangic'))
        if vade_bas:
            qs = qs.filter(vade_tarihi__gte=vade_bas)
        vade_bit = parse_date_safe(f.get('vade_bitis'))
        if vade_bit:
            qs = qs.filter(vade_tarihi__lte=vade_bit)

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

        # tahsil durumu: bekleyen / tamamlanan / kismi / ileri_tarihli / gecikti
        tahsil = f.get('tahsil_durumu')
        bugun = timezone.localdate()
        if tahsil == 'bekleyen':
            qs = qs.filter(durum__in=[GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL])
        elif tahsil == 'tamamlanan':
            qs = qs.filter(durum=GelirDurum.TAHSIL_EDILDI)
        elif tahsil == 'kismi':
            qs = qs.filter(durum=GelirDurum.KISMI_TAHSIL)
        elif tahsil == 'ileri_tarihli':
            qs = qs.filter(
                durum=GelirDurum.ONAYLANDI,
                tahsil_edilen=0,
                vade_tarihi__gt=bugun,
            )
        elif tahsil == 'gecikti':
            qs = qs.filter(
                durum__in=[GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL],
                vade_tarihi__lt=bugun,
            )

        return qs.distinct()

    def list_paginated(self, kurum_id, sube_id, *, filters=None, sort=None,
                       page=1, page_size=25):
        qs = self._apply_filters(self._base_qs(kurum_id, sube_id), filters)
        agg = qs.aggregate(
            toplam_brut=Sum('brut_tutar'),
            toplam_kdv=Sum('kdv_tutar'),
            toplam_net=Sum('net_tutar'),
            toplam_tahsil=Sum('tahsil_edilen'),
        )
        t_brut = agg['toplam_brut'] or Decimal('0.00')
        t_kdv = agg['toplam_kdv'] or Decimal('0.00')
        t_net = agg['toplam_net'] or Decimal('0.00')
        t_tahsil = agg['toplam_tahsil'] or Decimal('0.00')
        totals = {
            'toplam_brut': str(t_brut),
            'toplam_kdv': str(t_kdv),
            'toplam_net': str(t_net),
            'toplam_tahsil': str(t_tahsil),
            'toplam_kalan': str(max(Decimal('0.00'), t_net - t_tahsil)),
        }
        order = resolve_sort(sort, _SORT_MAP, '-fatura_tarihi')
        qs = qs.order_by(order, '-created_at')
        items, meta = paginate(qs, page, page_size)
        return {
            'results': [self.serialize(g) for g in items],
            'totals': totals,
            **meta,
        }

    @staticmethod
    def serialize(g: GelirKaydi):
        tahsil_durumu = compute_tahsil_durumu(g)
        has_tahsilat = (g.tahsil_edilen or Decimal('0')) > Decimal('0')
        return {
            'id': g.id,
            'fatura_no': g.fatura_no,
            'belge_no': g.fatura_no or f'GL-{g.id}',
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
            'kdv_mod': getattr(g, 'kdv_mod', 'haric') or 'haric',
            'brut_tutar': str(g.brut_tutar),
            'kdv_orani': g.kdv_orani,
            'kdv_tutar': str(g.kdv_tutar),
            'net_tutar': str(g.net_tutar),
            'tahsil_edilen': str(g.tahsil_edilen),
            'kalan_tutar': str(g.kalan_tutar),
            'tahsilat_yuzdesi': str(g.tahsilat_yuzdesi),
            'durum': g.durum,
            'durum_label': _DURUM_LABEL.get(g.durum, g.durum),
            'tahsil_durumu': tahsil_durumu,
            'tahsil_durumu_label': _TAHSIL_DURUMU_LABEL.get(tahsil_durumu, tahsil_durumu),
            'has_tahsilat': has_tahsilat,
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
            'tahsil_edilebilir_mi': g.tahsil_edilebilir_mi,
            'iptal_edilebilir_mi': g.iptal_edilebilir_mi,
            'created_at': g.created_at.isoformat() if g.created_at else None,
        }

    @classmethod
    def serialize_detail(cls, g: GelirKaydi):
        from apps.finans.application.gelir_belge_service import list_gelir_ekler
        from apps.finans.constants.gider_types import OdemeDurum
        from apps.finans.interfaces.serializers.gelir_tahsilat_serializer import GelirTahsilatListSerializer

        data = cls.serialize(g)
        tahsilatlar = list(
            g.tahsilatlar.filter(durum=OdemeDurum.TAMAMLANDI).order_by('-tahsilat_tarihi', '-id')
        )
        data.update({
            'sube': {'id': g.sube_id, 'ad': g.sube.ad if g.sube_id else None},
            'mali_hesap': {
                'id': g.mali_hesap_id,
                'ad': g.mali_hesap.ad if g.mali_hesap_id else None,
            },
            'tahsilatlar': GelirTahsilatListSerializer(tahsilatlar, many=True).data,
            'ekli_belgeler': list_gelir_ekler(g),
        })
        return data
