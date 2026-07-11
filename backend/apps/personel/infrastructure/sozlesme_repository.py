"""
Personel Sözleşmeleri — Repository
DDD Pattern — Infrastructure Layer
"""
from datetime import date, time as dt_time

from django.db.models import Q, Sum, Count, Prefetch
from decimal import Decimal

from apps.personel.domain.sozlesme_models import (
    PersonelSozlesme, DersUcretTanim, AylikHakedis, AvansKaydi,
    UcretDonemi, MaasPlaniSatiri, SozlesmeMesaiSaati, SozlesmeMadde,
    SozlesmeDurumu, HakedisDurumu,
)
from apps.personel.application.contract_calc_service import (
    apply_computed_totals,
    generate_sozlesme_no,
    personel_no_from_id,
    derive_month_dates,
    calc_calisilan_gun,
    default_mesai_saatleri,
)


def _parse_time(val):
    if val is None or val == '':
        return None
    if isinstance(val, dt_time):
        return val
    parts = str(val).split(':')
    return dt_time(int(parts[0]), int(parts[1]))


class SozlesmeRepository:
    """Sözleşme veri erişim katmanı"""

    _prefetch = [
        'ders_ucretleri',
        'ders_ucretleri__brans',
        'ucret_donemleri',
        'maas_plani',
        'mesai_saatleri',
        'maddeler',
    ]

    _base_qs = PersonelSozlesme.objects.select_related(
        'personel', 'egitim_yili', 'kurum', 'sube', 'gorevlendirme',
        'gorevlendirme__brans', 'gorevlendirme__rol',
    ).prefetch_related(*_prefetch)

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
                    Q(personel__ad__icontains=s)
                    | Q(personel__soyad__icontains=s)
                    | Q(personel__tc_kimlik_no__icontains=s)
                    | Q(sozlesme_no__icontains=s)
                )
        return qs.order_by('-id')

    def get_by_id(self, pk):
        try:
            return self._base_qs.get(pk=pk)
        except PersonelSozlesme.DoesNotExist:
            return None

    def _apply_snapshots(self, data, personel_id=None):
        pid = personel_id or data.get('personel_id')
        if pid and not data.get('personel_no_snapshot'):
            data['personel_no_snapshot'] = personel_no_from_id(int(pid))
        return data

    def _sync_nested(self, sozlesme, data):
        if 'ders_ucretleri' in data:
            sozlesme.ders_ucretleri.all().delete()
            for du in data['ders_ucretleri'] or []:
                DersUcretTanim.objects.create(sozlesme=sozlesme, **du)

        if 'ucret_donemleri' in data:
            sozlesme.ucret_donemleri.all().delete()
            for ud in data['ucret_donemleri'] or []:
                UcretDonemi.objects.create(sozlesme=sozlesme, **ud)

        if 'maas_plani' in data:
            sozlesme.maas_plani.all().delete()
            rows = data['maas_plani'] or []
            contract_start = sozlesme.baslangic_tarihi
            rows = derive_month_dates(rows, contract_start)
            for row in rows:
                b = row.get('baslangic_tarihi')
                e = row.get('bitis_tarihi')
                if isinstance(b, str):
                    b = date.fromisoformat(b[:10])
                if isinstance(e, str):
                    e = date.fromisoformat(e[:10])
                MaasPlaniSatiri.objects.create(
                    sozlesme=sozlesme,
                    sira_no=int(row['sira_no']),
                    baslangic_tarihi=b,
                    bitis_tarihi=e,
                    calisilan_gun=row.get('calisilan_gun') or calc_calisilan_gun(b, e),
                    maas=Decimal(str(row.get('maas', 0))),
                    aciklama=row.get('aciklama', ''),
                )

        if 'mesai_saatleri' in data:
            sozlesme.mesai_saatleri.all().delete()
            rows = data['mesai_saatleri'] or default_mesai_saatleri()
            for row in rows:
                SozlesmeMesaiSaati.objects.create(
                    sozlesme=sozlesme,
                    gun=int(row['gun']),
                    baslangic=_parse_time(row.get('baslangic')),
                    bitis=_parse_time(row.get('bitis')),
                    mola_dakika=int(row.get('mola_dakika', 0)),
                    aktif=bool(row.get('aktif', True)),
                )

        if 'maddeler' in data:
            sozlesme.maddeler.all().delete()
            for i, row in enumerate(data['maddeler'] or [], start=1):
                SozlesmeMadde.objects.create(
                    sozlesme=sozlesme,
                    sira=int(row.get('sira', i)),
                    metin=row.get('metin', ''),
                )

    def _recompute_totals(self, sozlesme):
        plan = list(sozlesme.maas_plani.all())
        apply_computed_totals(sozlesme, plan)
        sozlesme.save(update_fields=[
            'toplam_sozlesme_bedeli', 'toplam_calisma_suresi_ay', 'net_maas',
            'baslangic_tarihi', 'bitis_tarihi',
        ])

    def create(self, data):
        nested_keys = ['ders_ucretleri', 'ucret_donemleri', 'maas_plani', 'mesai_saatleri', 'maddeler']
        nested = {k: data.pop(k, None) for k in nested_keys}
        nested = {k: v for k, v in nested.items() if v is not None}

        self._apply_snapshots(data)
        if not data.get('sozlesme_no'):
            data['sozlesme_no'] = generate_sozlesme_no(
                data['kurum_id'], data['egitim_yili_id'],
            )
        if not data.get('duzenlenme_tarihi'):
            data['duzenlenme_tarihi'] = date.today()

        sozlesme = PersonelSozlesme.objects.create(**data)
        self._sync_nested(sozlesme, nested)
        self._recompute_totals(sozlesme)
        return self.get_by_id(sozlesme.pk)

    def update(self, pk, data):
        nested_keys = ['ders_ucretleri', 'ucret_donemleri', 'maas_plani', 'mesai_saatleri', 'maddeler']
        nested = {}
        for k in nested_keys:
            if k in data:
                nested[k] = data.pop(k)

        sozlesme = self.get_by_id(pk)
        if not sozlesme:
            return None

        self._apply_snapshots(data, sozlesme.personel_id)
        for k, v in data.items():
            setattr(sozlesme, k, v)
        sozlesme.save()

        if nested:
            self._sync_nested(sozlesme, nested)
        self._recompute_totals(sozlesme)
        return self.get_by_id(pk)

    def delete(self, pk):
        sozlesme = self.get_by_id(pk)
        if sozlesme:
            sozlesme.delete()
            return True
        return False

    def get_stats(self, kurum_id, egitim_yili_id):
        qs = PersonelSozlesme.objects.filter(
            kurum_id=kurum_id, egitim_yili_id=egitim_yili_id,
        )
        toplam = qs.count()
        aktif = qs.filter(durum=SozlesmeDurumu.AKTIF).count()
        taslak = qs.filter(durum=SozlesmeDurumu.TASLAK).count()
        tur_dagilimi = dict(
            qs.values_list('sozlesme_turu').annotate(c=Count('id')).values_list('sozlesme_turu', 'c')
        )
        toplam_maas = qs.filter(durum=SozlesmeDurumu.AKTIF).aggregate(
            t=Sum('toplam_sozlesme_bedeli'),
        )['t'] or Decimal('0')

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
        aktif_sozlesmeler = PersonelSozlesme.objects.filter(
            kurum_id=kurum_id,
            egitim_yili_id=egitim_yili_id,
            durum=SozlesmeDurumu.AKTIF,
        ).prefetch_related('ders_ucretleri', 'ucret_donemleri', 'maas_plani')
        created = []
        for s in aktif_sozlesmeler:
            ders_ucret_tanim = s.ders_ucretleri.first()
            ders_basi_ucret = (
                s.ders_birim_ucret
                if s.ders_birim_ucret and s.ders_birim_ucret > 0
                else (ders_ucret_tanim.birim_ucret if ders_ucret_tanim else Decimal('0.00'))
            )
            maas = self._get_donemsel_maas(s, yil, ay)

            existing = AylikHakedis.objects.filter(sozlesme=s, yil=yil, ay=ay).first()
            if existing:
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
        baslangic = sozlesme.baslangic_tarihi
        if baslangic:
            ay_sirasi = (yil - baslangic.year) * 12 + (ay - baslangic.month) + 1
            if ay_sirasi >= 1:
                plan_row = sozlesme.maas_plani.filter(sira_no=ay_sirasi).first()
                if plan_row:
                    return plan_row.maas

        ucret_donemleri = list(sozlesme.ucret_donemleri.all())
        if ucret_donemleri:
            if not baslangic:
                return sozlesme.brut_maas or Decimal('0.00')
            ay_sirasi = (yil - baslangic.year) * 12 + (ay - baslangic.month) + 1
            if ay_sirasi < 1:
                ay_sirasi = 1
            for d in ucret_donemleri:
                if d.bitis_ay == 0:
                    if ay_sirasi >= d.baslangic_ay:
                        return d.brut_maas
                elif d.baslangic_ay <= ay_sirasi <= d.bitis_ay:
                    return d.brut_maas
            return ucret_donemleri[-1].brut_maas

        if sozlesme.brut_maas and sozlesme.brut_maas > 0:
            return sozlesme.brut_maas
        return sozlesme.net_maas or Decimal('0.00')

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
            'durum_dagilimi': dict(
                qs.values_list('durum').annotate(c=Count('id')).values_list('durum', 'c')
            ),
        }


class AvansRepository:
    """Avans kayıtları veri erişim katmanı"""

    _base_qs = AvansKaydi.objects.select_related(
        'sozlesme', 'sozlesme__personel', 'olusturan',
    )

    def get_all_for_hakedis(self, sozlesme_id, yil, ay):
        return self._base_qs.filter(
            sozlesme_id=sozlesme_id,
            mahsup_yil=yil,
            mahsup_ay=ay,
        )

    def get_all_for_sozlesme(self, sozlesme_id):
        return self._base_qs.filter(sozlesme_id=sozlesme_id)

    def get_all_for_personel(self, personel_id, kurum_id=None):
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
        agg = AvansKaydi.objects.filter(
            sozlesme_id=sozlesme_id,
            mahsup_yil=yil,
            mahsup_ay=ay,
        ).aggregate(toplam=Sum('tutar'))
        return agg['toplam'] or Decimal('0.00')
