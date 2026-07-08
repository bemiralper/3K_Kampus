"""
Finansman Tanımları — Ortak CRUD servis katmanı.

Tek bir jenerik taban (`FinansTanimService`) tüm tanım tipleri için CRUD, soft
delete, toggle ve kullanım kontrolü sağlar. Her tanım tipi yalnızca kendine özgü
alanları ve serileştirmeyi override eder (DRY + Open/Closed).
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from datetime import date, datetime

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.finans.domain.finansman_tanimlari import (
    AciklamaSablonu,
    AciklamaSablonuKapsam,
    GelirKaynagi,
    MaliyetMerkezi,
    MaliyetMerkeziTipi,
    MasrafTuru,
    Proje,
    ProjeDurum,
)


class FinansTanimService:
    """Finansman tanımları için jenerik CRUD servisi."""

    model = None
    # Base dışı, oluşturma/güncellemede kabul edilen ek alanlar
    extra_fields: tuple = ()

    # ─── Yardımcılar ──────────────────────────────
    def _base_qs(self, kurum_id, sube_id=None, include_kurum_geneli=True):
        qs = self.model.objects.filter(kurum_id=kurum_id)
        if sube_id:
            if include_kurum_geneli:
                qs = qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
            else:
                qs = qs.filter(sube_id=sube_id)
        return qs

    def _clean_str(self, value, default=''):
        return (value or default).strip() if isinstance(value, str) else default

    @staticmethod
    def _iso(value):
        """date/datetime/str değerini güvenle ISO string'e çevirir."""
        if value in (None, ''):
            return None
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        return str(value)

    def serialize(self, obj):
        """Ortak alanların serileştirilmesi; alt sınıflar genişletir."""
        return {
            'id': obj.id,
            'ad': obj.ad,
            'kod': obj.kod,
            'aciklama': obj.aciklama,
            'siralama': obj.siralama,
            'aktif_mi': obj.aktif_mi,
            'sube_id': obj.sube_id,
            'created_at': obj.created_at.isoformat() if obj.created_at else None,
        }

    def _apply_extra(self, obj, data, errors):
        """Alt sınıfa özel alanları objeye uygular (in-place). Override edilir."""
        return obj

    def _validate(self, data, errors, instance=None):
        """Alt sınıfa özel doğrulama. Override edilir."""
        return errors

    # ─── Okuma ────────────────────────────────────
    def list(self, kurum_id, sube_id=None, *, aktif_mi=None, arama=None, **extra):
        qs = self._base_qs(kurum_id, sube_id)
        if aktif_mi is not None:
            qs = qs.filter(aktif_mi=aktif_mi)
        if arama:
            qs = qs.filter(Q(ad__icontains=arama) | Q(kod__icontains=arama))
        qs = self._filter_extra(qs, extra)
        return [self.serialize(o) for o in qs]

    def _filter_extra(self, qs, extra):
        return qs

    def get(self, pk, kurum_id):
        try:
            obj = self.model.objects.get(pk=pk, kurum_id=kurum_id)
        except self.model.DoesNotExist:
            return None
        return obj

    # ─── Yazma ────────────────────────────────────
    def create(self, kurum_id, data, sube_id=None):
        errors = {}
        ad = self._clean_str(data.get('ad'))
        if not ad:
            errors['ad'] = 'Ad zorunludur.'
        self._validate(data, errors)
        if errors:
            return None, errors

        obj = self.model(
            kurum_id=kurum_id,
            sube_id=data.get('sube_id', sube_id),
            ad=ad,
            kod=self._clean_str(data.get('kod')),
            aciklama=self._clean_str(data.get('aciklama')),
            siralama=int(data.get('siralama') or 0),
            aktif_mi=bool(data.get('aktif_mi', True)),
        )
        self._apply_extra(obj, data, errors)
        if errors:
            return None, errors
        try:
            with transaction.atomic():
                obj.save()
        except IntegrityError:
            return None, {'ad': 'Bu tanım zaten mevcut.'}
        return obj, None

    def update(self, pk, kurum_id, data):
        obj = self.get(pk, kurum_id)
        if not obj:
            return None, {'genel': 'Tanım bulunamadı.'}
        errors = {}
        if 'ad' in data:
            ad = self._clean_str(data.get('ad'))
            if not ad:
                errors['ad'] = 'Ad boş olamaz.'
            else:
                obj.ad = ad
        for f in ('kod', 'aciklama'):
            if f in data:
                setattr(obj, f, self._clean_str(data.get(f)))
        if 'siralama' in data:
            obj.siralama = int(data.get('siralama') or 0)
        if 'aktif_mi' in data:
            obj.aktif_mi = bool(data.get('aktif_mi'))
        if 'sube_id' in data:
            obj.sube_id = data.get('sube_id')
        self._validate(data, errors, instance=obj)
        self._apply_extra(obj, data, errors)
        if errors:
            return None, errors
        try:
            with transaction.atomic():
                obj.save()
        except IntegrityError:
            return None, {'ad': 'Bu tanım zaten mevcut.'}
        return obj, None

    def toggle(self, pk, kurum_id):
        obj = self.get(pk, kurum_id)
        if not obj:
            return None, {'genel': 'Tanım bulunamadı.'}
        obj.aktif_mi = not obj.aktif_mi
        obj.save(update_fields=['aktif_mi', 'updated_at'])
        return obj, None

    def kullanim_sayisi(self, obj):
        """Tanımın kaç işlem kaydında kullanıldığı. Alt sınıf override eder."""
        return 0

    def delete(self, pk, kurum_id):
        obj = self.get(pk, kurum_id)
        if not obj:
            return False, {'genel': 'Tanım bulunamadı.'}
        if self.kullanim_sayisi(obj) > 0:
            return False, {
                'genel': 'Bu tanım işlem kayıtlarında kullanıldığı için silinemez. '
                         'Bunun yerine pasife alabilirsiniz.'
            }
        obj.silindi_mi = True
        obj.silinme_tarihi = timezone.now()
        obj.save(update_fields=['silindi_mi', 'silinme_tarihi', 'updated_at'])
        return True, None

    @staticmethod
    def _to_decimal(value, default=Decimal('0.00')):
        if value in (None, ''):
            return default
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return default


# ─── Gelir Kaynağı ────────────────────────────────
class GelirKaynagiService(FinansTanimService):
    model = GelirKaynagi

    def kullanim_sayisi(self, obj):
        return obj.gelir_kayitlari.filter(silindi_mi=False).count()

    def serialize(self, obj):
        d = super().serialize(obj)
        d['kullanim_sayisi'] = self.kullanim_sayisi(obj)
        return d


# ─── Maliyet / Gider Merkezi ──────────────────────
class MaliyetMerkeziService(FinansTanimService):
    model = MaliyetMerkezi

    def _filter_extra(self, qs, extra):
        tip = extra.get('tip')
        if tip in (MaliyetMerkeziTipi.MALIYET, MaliyetMerkeziTipi.GIDER):
            qs = qs.filter(tip=tip)
        return qs

    def _validate(self, data, errors, instance=None):
        tip = data.get('tip')
        if tip is not None and tip not in dict(MaliyetMerkeziTipi.CHOICES):
            errors['tip'] = 'Geçersiz merkez tipi.'
        return errors

    def _apply_extra(self, obj, data, errors):
        if 'tip' in data and data.get('tip'):
            obj.tip = data['tip']
        elif not obj.pk and not obj.tip:
            obj.tip = MaliyetMerkeziTipi.MALIYET
        if 'parent_id' in data:
            obj.parent_id = data.get('parent_id') or None
        return obj

    def kullanim_sayisi(self, obj):
        return obj.gider_kayitlari.filter(silindi_mi=False).count()

    def serialize(self, obj):
        d = super().serialize(obj)
        d['tip'] = obj.tip
        d['parent_id'] = obj.parent_id
        d['kullanim_sayisi'] = self.kullanim_sayisi(obj)
        return d


# ─── Proje ────────────────────────────────────────
class ProjeService(FinansTanimService):
    model = Proje

    def _filter_extra(self, qs, extra):
        durum = extra.get('durum')
        if durum in dict(ProjeDurum.CHOICES):
            qs = qs.filter(durum=durum)
        return qs

    def _validate(self, data, errors, instance=None):
        durum = data.get('durum')
        if durum is not None and durum not in dict(ProjeDurum.CHOICES):
            errors['durum'] = 'Geçersiz proje durumu.'
        return errors

    def _apply_extra(self, obj, data, errors):
        for f in ('baslangic_tarihi', 'bitis_tarihi'):
            if f in data:
                raw = data.get(f)
                setattr(obj, f, parse_date(raw) if isinstance(raw, str) and raw else (raw or None))
        if 'butce' in data:
            obj.butce = self._to_decimal(data.get('butce'))
        if 'durum' in data and data.get('durum'):
            obj.durum = data['durum']
        if 'renk' in data:
            obj.renk = self._clean_str(data.get('renk'), '#0262a7') or '#0262a7'
        return obj

    def kullanim_sayisi(self, obj):
        gelir = obj.gelir_kayitlari.filter(silindi_mi=False).count()
        gider = obj.gider_kayitlari.filter(silindi_mi=False).count()
        return gelir + gider

    def serialize(self, obj):
        d = super().serialize(obj)
        d.update({
            'baslangic_tarihi': self._iso(obj.baslangic_tarihi),
            'bitis_tarihi': self._iso(obj.bitis_tarihi),
            'butce': str(obj.butce),
            'durum': obj.durum,
            'renk': obj.renk,
            'kullanim_sayisi': self.kullanim_sayisi(obj),
        })
        return d


# ─── Masraf Türü ──────────────────────────────────
class MasrafTuruService(FinansTanimService):
    model = MasrafTuru

    def _filter_extra(self, qs, extra):
        odeme_tipi = extra.get('odeme_tipi')
        if odeme_tipi:
            qs = qs.filter(Q(odeme_tipi=odeme_tipi) | Q(odeme_tipi=''))
        return qs

    def _apply_extra(self, obj, data, errors):
        if 'odeme_tipi' in data:
            obj.odeme_tipi = self._clean_str(data.get('odeme_tipi'))
        if 'kesinti_turu' in data and data.get('kesinti_turu'):
            from apps.finans.constants.kesinti_types import KesintiTuru
            kt = self._clean_str(data.get('kesinti_turu'))
            if kt and kt not in KesintiTuru.get_values():
                errors['kesinti_turu'] = 'Geçersiz kesinti türü.'
            else:
                obj.kesinti_turu = kt
        if 'varsayilan_tutar' in data:
            obj.varsayilan_tutar = self._to_decimal(data.get('varsayilan_tutar'))
        return obj

    def kullanim_sayisi(self, obj):
        try:
            return obj.islem_masraflari.count()
        except Exception:
            return 0

    def serialize(self, obj):
        d = super().serialize(obj)
        d['odeme_tipi'] = obj.odeme_tipi
        d['kesinti_turu'] = obj.kesinti_turu
        d['varsayilan_tutar'] = str(obj.varsayilan_tutar)
        d['kullanim_sayisi'] = self.kullanim_sayisi(obj)
        return d


# ─── Açıklama Şablonu ─────────────────────────────
class AciklamaSablonuService(FinansTanimService):
    model = AciklamaSablonu

    def _filter_extra(self, qs, extra):
        kapsam = extra.get('kapsam')
        if kapsam in dict(AciklamaSablonuKapsam.CHOICES):
            qs = qs.filter(Q(kapsam=kapsam) | Q(kapsam=AciklamaSablonuKapsam.GENEL))
        return qs

    def _validate(self, data, errors, instance=None):
        kapsam = data.get('kapsam')
        if kapsam is not None and kapsam not in dict(AciklamaSablonuKapsam.CHOICES):
            errors['kapsam'] = 'Geçersiz kapsam.'
        return errors

    def _apply_extra(self, obj, data, errors):
        if 'icerik' in data:
            obj.icerik = (data.get('icerik') or '').strip()
        if 'kapsam' in data and data.get('kapsam'):
            obj.kapsam = data['kapsam']
        return obj

    def serialize(self, obj):
        d = super().serialize(obj)
        d['icerik'] = obj.icerik
        d['kapsam'] = obj.kapsam
        return d
