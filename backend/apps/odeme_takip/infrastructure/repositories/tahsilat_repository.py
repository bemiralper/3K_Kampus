"""
Tahsilat Repository
"""
from django.db.models import Sum, Q
from apps.odeme_takip.domain.models import Tahsilat
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru


class TahsilatRepository:

    def create(self, data):
        return Tahsilat.objects.create(**data)

    def get_by_id(self, id):
        try:
            return Tahsilat.objects.select_related(
                'sozlesme', 'taksit', 'odeme_yontemi', 'mali_hesap', 'islem_yapan'
            ).prefetch_related(
                'dagitimlar', 'dagitimlar__taksit'
            ).get(id=id)
        except Tahsilat.DoesNotExist:
            return None

    def get_by_sozlesme(self, sozlesme_id):
        return Tahsilat.objects.filter(
            sozlesme_id=sozlesme_id
        ).select_related(
            'taksit', 'odeme_yontemi', 'mali_hesap', 'islem_yapan', 'iptal_eden'
        ).prefetch_related(
            'dagitimlar', 'dagitimlar__taksit'
        ).order_by('-tahsilat_tarihi', '-created_at')

    def get_by_taksit(self, taksit_id):
        return Tahsilat.objects.filter(
            taksit_id=taksit_id, durum=TahsilatDurum.AKTIF
        ).exclude(
            tahsilat_turu=TahsilatTuru.IADE
        )

    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None, filters=None):
        qs = Tahsilat.objects.select_related(
            'sozlesme__ogrenci', 'taksit', 'odeme_yontemi', 'mali_hesap', 'islem_yapan'
        ).prefetch_related(
            'dagitimlar', 'dagitimlar__taksit'
        )
        if kurum_id:
            qs = qs.filter(sozlesme__kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(sozlesme__egitim_yili_id=egitim_yili_id)

        # Gelişmiş filtreler
        if filters:
            if filters.get('ogrenci_adi'):
                search = filters['ogrenci_adi']
                qs = qs.filter(
                    Q(sozlesme__ogrenci__ad__icontains=search) |
                    Q(sozlesme__ogrenci__soyad__icontains=search)
                )
            if filters.get('sozlesme_no'):
                qs = qs.filter(sozlesme__sozlesme_no__icontains=filters['sozlesme_no'])
            if filters.get('tarih_baslangic'):
                qs = qs.filter(tahsilat_tarihi__gte=filters['tarih_baslangic'])
            if filters.get('tarih_bitis'):
                qs = qs.filter(tahsilat_tarihi__lte=filters['tarih_bitis'])
            if filters.get('durum'):
                qs = qs.filter(durum=filters['durum'])
            if filters.get('tahsilat_turu'):
                qs = qs.filter(tahsilat_turu=filters['tahsilat_turu'])
            if filters.get('odeme_yontemi_id'):
                qs = qs.filter(odeme_yontemi_id=filters['odeme_yontemi_id'])

        return qs.order_by('-tahsilat_tarihi', '-created_at')

    def get_emanetler(self, sozlesme_id):
        """Emanet (fazla ödeme) tahsilatları — taksit null, tür emanet"""
        return Tahsilat.objects.filter(
            sozlesme_id=sozlesme_id,
            taksit__isnull=True,
            tahsilat_turu=TahsilatTuru.EMANET,
            durum=TahsilatDurum.AKTIF,
        )

    def update(self, tahsilat, data):
        for key, value in data.items():
            setattr(tahsilat, key, value)
        tahsilat.save()
        return tahsilat
