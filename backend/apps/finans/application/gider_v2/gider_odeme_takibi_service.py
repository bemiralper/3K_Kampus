"""
Gider Ödeme Takibi — taksit/vade satırları.

Gider listesi fatura_tarihi ile sıralanır; bu görünüm vade_tarihi ile.
Ödenmiş / iptal satırlar varsayılan olarak gizlenir.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Case, Count, F, IntegerField, Q, Sum, Value, When
from django.utils import timezone

from apps.finans.application.finans_v2.filters import parse_date_safe, paginate
from apps.finans.application.gider_odeme_durumu import resolve_odeme_takibi_durum
from apps.finans.application.gider_v2.gider_query_service import GiderQueryService
from apps.finans.constants.gider_types import (
    GiderDurum,
    GiderOdemeTakibiDurum,
    GiderTaksitDurum,
)
from apps.finans.domain.gider_taksit import GiderTaksit


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def resolve_donem_range(donem: str, today: date) -> tuple[date | None, date | None]:
    """Ödeme/vade tarihi için hazır dönem aralığı. Gider tarihi kullanılmaz."""
    donem = (donem or '').strip()
    if donem == 'bugun':
        return today, today
    if donem == '7gun':
        return today, today + timedelta(days=7)
    if donem == 'bu_hafta':
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    if donem == 'bu_ay':
        return _month_bounds(today.year, today.month)
    if donem == 'gelecek_ay':
        year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        return _month_bounds(year, month)
    return None, None


class GiderOdemeTakibiQueryService:
    def list_paginated(
        self, kurum_id, sube_id, *, filters=None, allowed_sube_ids=None,
        page=1, page_size=25,
    ):
        today = timezone.localdate()
        f = filters or {}
        qs = self._base_qs(kurum_id)
        qs = self._apply_sube(qs, sube_id, f, allowed_sube_ids)
        qs = self._apply_filters(qs, f, today)
        ozet = qs.aggregate(adet=Count('id'), toplam=Sum('tutar'))
        qs = self._annotate_sort(qs, today).order_by('_prio', 'vade_tarihi', 'taksit_no', 'id')
        items, meta = paginate(qs, page, page_size)
        return {
            'results': [self.serialize(t, today=today) for t in items],
            'toplam_tutar': str(ozet['toplam'] or Decimal('0.00')),
            **meta,
        }

    def _base_qs(self, kurum_id):
        return GiderTaksit.objects.filter(gider_kaydi__kurum_id=kurum_id).select_related(
            'gider_kaydi',
            'gider_kaydi__cari_hesap',
            'gider_kaydi__gider_kategorisi',
            'gider_kaydi__maliyet_merkezi',
            'gider_kaydi__proje',
            'gider_kaydi__odeme_yontemi',
            'gider_kaydi__olusturan',
            'gider_kaydi__mali_hesap',
        ).prefetch_related('gider_kaydi__etiketler')

    def _apply_sube(self, qs, context_sube_id, f, allowed_ids):
        allowed = {int(x) for x in (allowed_ids or []) if x}
        if context_sube_id:
            allowed.add(int(context_sube_id))
        raw = str(f.get('filtre_sube_id') or '').strip()
        if raw == 'all' and allowed:
            return qs.filter(gider_kaydi__sube_id__in=allowed)
        if raw.isdigit() and int(raw) in allowed:
            return qs.filter(gider_kaydi__sube_id=int(raw))
        if context_sube_id:
            return qs.filter(gider_kaydi__sube_id=context_sube_id)
        if allowed:
            return qs.filter(gider_kaydi__sube_id__in=allowed)
        return qs.none()

    def _apply_filters(self, qs, f, today):
        qs = qs.exclude(gider_kaydi__durum=GiderDurum.IPTAL).exclude(durum=GiderTaksitDurum.IPTAL)

        durum = (f.get('durum') or '').strip()
        if durum in ('tumu', 'all'):
            pass
        elif durum == GiderOdemeTakibiDurum.ODENDI:
            qs = qs.filter(odenen_tutar__gte=F('tutar'), tutar__gt=0)
        elif durum:
            qs = self._filter_durum(qs, durum, today)
        else:
            qs = qs.filter(odenen_tutar__lt=F('tutar'))

        arama = (f.get('arama') or '').strip()
        if arama:
            qs = qs.filter(
                Q(gider_kaydi__fatura_no__icontains=arama)
                | Q(gider_kaydi__islem_belge_no__icontains=arama)
                | Q(gider_kaydi__aciklama__icontains=arama)
                | Q(aciklama__icontains=arama)
                | Q(gider_kaydi__cari_hesap__unvan__icontains=arama)
                | Q(gider_kaydi__gider_kategorisi__ad__icontains=arama)
            )

        if f.get('gider_kategorisi_id'):
            kid = f['gider_kategorisi_id']
            qs = qs.filter(
                Q(gider_kaydi__gider_kategorisi_id=kid)
                | Q(gider_kaydi__gider_kategorisi__parent_id=kid)
            )
        if f.get('cari_hesap_id'):
            qs = qs.filter(gider_kaydi__cari_hesap_id=f['cari_hesap_id'])

        donem = (f.get('donem') or '').strip()
        if donem and donem != 'ozel':
            bas, bit = resolve_donem_range(donem, today)
        else:
            bas = parse_date_safe(f.get('baslangic'))
            bit = parse_date_safe(f.get('bitis'))
        if bas:
            qs = qs.filter(vade_tarihi__gte=bas)
        if bit:
            qs = qs.filter(vade_tarihi__lte=bit)

        tip = (f.get('odeme_tipi') or '').strip()
        if tip == 'taksitli':
            qs = qs.filter(gider_kaydi__taksit_sayisi__gt=1)
        elif tip in ('tek', 'tek_odeme'):
            qs = qs.filter(gider_kaydi__taksit_sayisi__lte=1)

        return qs.distinct()

    def _filter_durum(self, qs, durum, today):
        sinir = today + timedelta(days=GiderOdemeTakibiDurum.YAKLASAN_GUN)
        if durum == GiderOdemeTakibiDurum.KISMI_ODENDI:
            return qs.filter(odenen_tutar__gt=0, odenen_tutar__lt=F('tutar'))
        qs = qs.filter(odenen_tutar=0)
        if durum == GiderOdemeTakibiDurum.GECIKTI:
            return qs.filter(vade_tarihi__lt=today)
        if durum == GiderOdemeTakibiDurum.BUGUN:
            return qs.filter(vade_tarihi=today)
        if durum == GiderOdemeTakibiDurum.YAKLASIYOR:
            return qs.filter(vade_tarihi__gt=today, vade_tarihi__lte=sinir)
        if durum == GiderOdemeTakibiDurum.ILERI_TARIHLI:
            return qs.filter(vade_tarihi__gt=sinir)
        if durum == GiderOdemeTakibiDurum.BEKLIYOR:
            return qs.filter(Q(vade_tarihi__isnull=True) | Q(vade_tarihi__gte=today))
        return qs

    def _annotate_sort(self, qs, today):
        sinir = today + timedelta(days=GiderOdemeTakibiDurum.YAKLASAN_GUN)
        return qs.annotate(
            _prio=Case(
                When(odenen_tutar__gte=F('tutar'), then=Value(9)),
                When(vade_tarihi__lt=today, then=Value(1)),
                When(vade_tarihi=today, then=Value(2)),
                When(vade_tarihi__lte=sinir, then=Value(3)),
                default=Value(4),
                output_field=IntegerField(),
            )
        )

    @staticmethod
    def serialize(taksit, today=None):
        today = today or timezone.localdate()
        gider = taksit.gider_kaydi
        durum = resolve_odeme_takibi_durum(
            taksit.vade_tarihi,
            taksit.tutar,
            taksit.odenen_tutar,
            iptal=(
                taksit.durum == GiderTaksitDurum.IPTAL
                or gider.durum == GiderDurum.IPTAL
            ),
            today=today,
        )
        odeme_aciklama = (taksit.aciklama or '').strip()
        gider_aciklama = (gider.aciklama or '').strip()
        aciklama = odeme_aciklama or gider_aciklama
        taksit_sayisi = gider.taksit_sayisi or 1
        taksitli = taksit_sayisi > 1
        return {
            'taksit_id': taksit.id,
            'gider_id': gider.id,
            'vade_tarihi': taksit.vade_tarihi.isoformat() if taksit.vade_tarihi else None,
            'gider_adi': gider.gider_kategorisi.ad if gider.gider_kategorisi_id else '—',
            'aciklama': aciklama,
            'aciklama_kaynak': 'odeme' if odeme_aciklama else 'gider',
            'taksit_no': taksit.taksit_no,
            'taksit_sayisi': taksit_sayisi,
            'taksit_label': f'{taksit.taksit_no} / {taksit_sayisi}' if taksitli else None,
            'tutar': str(taksit.tutar),
            'odenen_tutar': str(taksit.odenen_tutar),
            'kalan_tutar': str(taksit.kalan_tutar),
            'durum': durum,
            'durum_label': GiderOdemeTakibiDurum.LABEL.get(durum, durum),
            'odenebilir_mi': bool(gider.odenebilir_mi and taksit.kalan_tutar > 0),
            'gider': GiderQueryService.serialize(gider),
        }
