"""
Personel Sözleşmeleri — Repository
DDD Pattern — Infrastructure Layer
"""
from django.db.models import Q, Sum, Count, Prefetch
from decimal import Decimal

from apps.personel.domain.sozlesme_models import (
    PersonelSozlesme, DersUcretTanim, AylikHakedis, AvansKaydi,
    UcretDonemi, SozlesmeDurumu, HakedisDurumu,
)


class SozlesmeRepository:
    """Sözleşme veri erişim katmanı"""

    _base_qs = PersonelSozlesme.objects.select_related(
        'personel', 'egitim_yili', 'kurum',
    ).prefetch_related('ders_ucretleri', 'ders_ucretleri__brans', 'ucret_donemleri')

    # ── Liste ──
    def get_all(self, kurum_id, egitim_yili_id=None, filters=None):
        qs = self._base_qs.filter(kurum_id=kurum_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        if filters:
            if filters.get('durum'):
                qs = qs.filter(durum=filters['durum'])
            if filters.get('sozlesme_turu'):
                qs = qs.filter(sozlesme_turu=filters['sozlesme_turu'])
            if filters.get('search'):
                s = filters['search']
                qs = qs.filter(
                    Q(personel__ad__icontains=s) |
                    Q(personel__soyad__icontains=s) |
                    Q(personel__tc_kimlik_no__icontains=s)
                )
        return qs

    # ── Tekil ──
    def get_by_id(self, pk):
        try:
            return self._base_qs.get(pk=pk)
        except PersonelSozlesme.DoesNotExist:
            return None

    # ── Oluştur ──
    def create(self, data):
        ders_ucretleri_data = data.pop('ders_ucretleri', [])
        ucret_donemleri_data = data.pop('ucret_donemleri', [])
        sozlesme = PersonelSozlesme.objects.create(**data)
        for du in ders_ucretleri_data:
            du['sozlesme'] = sozlesme
            DersUcretTanim.objects.create(**du)
        for ud in ucret_donemleri_data:
            ud['sozlesme'] = sozlesme
            UcretDonemi.objects.create(**ud)
        return self.get_by_id(sozlesme.pk)

    # ── Güncelle ──
    def update(self, pk, data):
        ders_ucretleri_data = data.pop('ders_ucretleri', None)
        ucret_donemleri_data = data.pop('ucret_donemleri', None)
        sozlesme = self.get_by_id(pk)
        if not sozlesme:
            return None
        for k, v in data.items():
            setattr(sozlesme, k, v)
        sozlesme.save()

        if ders_ucretleri_data is not None:
            sozlesme.ders_ucretleri.all().delete()
            for du in ders_ucretleri_data:
                du['sozlesme'] = sozlesme
                DersUcretTanim.objects.create(**du)

        if ucret_donemleri_data is not None:
            sozlesme.ucret_donemleri.all().delete()
            for ud in ucret_donemleri_data:
                ud['sozlesme'] = sozlesme
                UcretDonemi.objects.create(**ud)

        return self.get_by_id(pk)

    # ── Sil ──
    def delete(self, pk):
        sozlesme = self.get_by_id(pk)
        if sozlesme:
            sozlesme.delete()
            return True
        return False

    # ── İstatistik ──
    def get_stats(self, kurum_id, egitim_yili_id):
        qs = PersonelSozlesme.objects.filter(
            kurum_id=kurum_id, egitim_yili_id=egitim_yili_id,
        )
        toplam = qs.count()
        aktif = qs.filter(durum=SozlesmeDurumu.AKTIF).count()
        taslak = qs.filter(durum=SozlesmeDurumu.TASLAK).count()
        tur_dagilimi = dict(qs.values_list('sozlesme_turu').annotate(c=Count('id')).values_list('sozlesme_turu', 'c'))
        toplam_maas = qs.filter(durum=SozlesmeDurumu.AKTIF).aggregate(t=Sum('brut_maas'))['t'] or Decimal('0')

        return {
            'toplam': toplam,
            'aktif': aktif,
            'taslak': taslak,
            'tur_dagilimi': tur_dagilimi,
            'toplam_brut_maas': float(toplam_maas),
        }


class HakedisRepository:
    """Aylık hakediş veri erişim katmanı"""

    _base_qs = AylikHakedis.objects.select_related(
        'sozlesme', 'sozlesme__personel', 'sozlesme__egitim_yili',
    )

    def get_all(self, kurum_id, yil=None, ay=None, filters=None):
        qs = self._base_qs.filter(sozlesme__kurum_id=kurum_id)
        if yil:
            qs = qs.filter(yil=yil)
        if ay:
            qs = qs.filter(ay=ay)
        if filters:
            if filters.get('durum'):
                qs = qs.filter(durum=filters['durum'])
            if filters.get('egitim_yili_id'):
                qs = qs.filter(sozlesme__egitim_yili_id=filters['egitim_yili_id'])
        return qs

    def get_by_id(self, pk):
        try:
            return self._base_qs.get(pk=pk)
        except AylikHakedis.DoesNotExist:
            return None

    def create(self, data):
        hakedis = AylikHakedis(**data)
        hakedis.hesapla()
        hakedis.save()
        return self.get_by_id(hakedis.pk)

    def update(self, pk, data):
        hakedis = self.get_by_id(pk)
        if not hakedis:
            return None
        for k, v in data.items():
            setattr(hakedis, k, v)
        hakedis.hesapla()
        hakedis.save()
        return self.get_by_id(pk)

    def delete(self, pk):
        h = self.get_by_id(pk)
        if h:
            h.delete()
            return True
        return False

    def bulk_create_for_month(self, kurum_id, egitim_yili_id, yil, ay):
        """
        Belirtilen ay için tüm aktif sözleşmelere hakediş oluştur.
        Sözleşmeden maaş ve ders birim ücreti otomatik doldurulur.
        Dönemsel ücretlendirme varsa ilgili dönemin maaşı kullanılır.
        Zaten var olanları güncelle (maaş/ders ücreti sözleşmeden çekilir).
        """
        aktif_sozlesmeler = PersonelSozlesme.objects.filter(
            kurum_id=kurum_id,
            egitim_yili_id=egitim_yili_id,
            durum=SozlesmeDurumu.AKTIF,
        ).prefetch_related('ders_ucretleri', 'ucret_donemleri')
        created = []
        for s in aktif_sozlesmeler:
            # Sözleşmedeki ders birim ücretini bul (ilk tanım veya 0)
            ders_ucret_tanim = s.ders_ucretleri.first()
            ders_basi_ucret = ders_ucret_tanim.birim_ucret if ders_ucret_tanim else Decimal('0.00')

            # ── Dönemsel ücretlendirme kontrolü ──
            maas = self._get_donemsel_maas(s, yil, ay)

            existing = AylikHakedis.objects.filter(sozlesme=s, yil=yil, ay=ay).first()
            if existing:
                # Mevcut kaydın maaş/ders ücretini sözleşmeden güncelle
                updated = False
                if existing.sabit_maas != maas:
                    existing.sabit_maas = maas
                    updated = True
                if existing.ders_basi_ucret != ders_basi_ucret:
                    existing.ders_basi_ucret = ders_basi_ucret
                    updated = True
                if updated:
                    existing.hesapla()
                    existing.save()
                    created.append(existing)
                continue

            h = AylikHakedis(
                sozlesme=s,
                yil=yil,
                ay=ay,
                sabit_maas=maas,
                ders_basi_ucret=ders_basi_ucret,
            )
            h.hesapla()
            h.save()
            created.append(h)
        return created

    def _get_donemsel_maas(self, sozlesme, yil, ay):
        """
        Sözleşmenin ücret dönemlerine göre aya uygun maaşı belirle.
        Dönem tanımlıysa: sözleşme başlangıcından kaçıncı ay olduğunu hesapla,
        o aya denk gelen dönemin maaşını kullan.
        Dönem yoksa: sözleşmedeki sabit brut_maas (veya net_maas).
        """
        ucret_donemleri = list(sozlesme.ucret_donemleri.all())
        if not ucret_donemleri:
            # Dönem yok → sabit maaş
            return sozlesme.brut_maas if sozlesme.brut_maas and sozlesme.brut_maas > 0 else (sozlesme.net_maas or Decimal('0.00'))

        # Sözleşme başlangıcından kaçıncı ay?
        baslangic = sozlesme.baslangic_tarihi
        if not baslangic:
            return sozlesme.brut_maas or Decimal('0.00')

        # Ay farkı hesapla (1-based)
        ay_sirasi = (yil - baslangic.year) * 12 + (ay - baslangic.month) + 1
        if ay_sirasi < 1:
            ay_sirasi = 1

        # Dönemlerden eşleşeni bul
        for d in ucret_donemleri:
            if d.bitis_ay == 0:
                # Sonsuza kadar — baslangic_ay'dan itibaren
                if ay_sirasi >= d.baslangic_ay:
                    return d.brut_maas
            else:
                if d.baslangic_ay <= ay_sirasi <= d.bitis_ay:
                    return d.brut_maas

        # Hiçbir dönem eşleşmediyse son dönemi kullan
        return ucret_donemleri[-1].brut_maas

    def get_stats(self, kurum_id, yil, ay):
        qs = AylikHakedis.objects.filter(
            sozlesme__kurum_id=kurum_id, yil=yil, ay=ay,
        )
        agg = qs.aggregate(
            toplam_brut=Sum('brut_toplam'),
            toplam_net=Sum('net_hakedis'),
            toplam_ders_saat=Sum('toplam_ders_saati'),
        )
        return {
            'kayit_sayisi': qs.count(),
            'toplam_brut': float(agg['toplam_brut'] or 0),
            'toplam_net': float(agg['toplam_net'] or 0),
            'toplam_ders_saat': float(agg['toplam_ders_saat'] or 0),
            'durum_dagilimi': dict(qs.values_list('durum').annotate(c=Count('id')).values_list('durum', 'c')),
        }


class AvansRepository:
    """Avans kayıtları veri erişim katmanı"""

    _base_qs = AvansKaydi.objects.select_related(
        'sozlesme', 'sozlesme__personel', 'olusturan',
    )

    def get_all_for_hakedis(self, sozlesme_id, yil, ay):
        """Belirli bir sözleşme/ay için avans kayıtlarını getir."""
        return self._base_qs.filter(
            sozlesme_id=sozlesme_id,
            mahsup_yil=yil,
            mahsup_ay=ay,
        )

    def get_all_for_sozlesme(self, sozlesme_id):
        """Bir sözleşmenin tüm avans kayıtları."""
        return self._base_qs.filter(sozlesme_id=sozlesme_id)

    def get_all_for_personel(self, personel_id, kurum_id=None):
        """Personelin tüm avans kayıtları (tüm sözleşmeler dahil)."""
        qs = self._base_qs.filter(sozlesme__personel_id=personel_id)
        if kurum_id:
            qs = qs.filter(sozlesme__kurum_id=kurum_id)
        return qs

    def get_by_id(self, pk):
        try:
            return self._base_qs.get(pk=pk)
        except AvansKaydi.DoesNotExist:
            return None

    def create(self, data):
        avans = AvansKaydi.objects.create(**data)
        return self.get_by_id(avans.pk)

    def update(self, pk, data):
        avans = self.get_by_id(pk)
        if not avans:
            return None
        for k, v in data.items():
            setattr(avans, k, v)
        avans.save()
        return self.get_by_id(pk)

    def delete(self, pk):
        avans = self.get_by_id(pk)
        if avans:
            avans.delete()
            return True
        return False

    def toplam_avans(self, sozlesme_id, yil, ay):
        """Belirli ay için toplam avans tutarı."""
        agg = AvansKaydi.objects.filter(
            sozlesme_id=sozlesme_id,
            mahsup_yil=yil,
            mahsup_ay=ay,
        ).aggregate(toplam=Sum('tutar'))
        return agg['toplam'] or Decimal('0.00')
