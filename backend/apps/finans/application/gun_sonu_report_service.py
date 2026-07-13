"""
Gün Sonu Özet Raporu — bölümlü rapor verisi (A–G).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from django.db.models import Count, Sum
from django.utils import timezone

from apps.finans.application.gun_sonu_finans_helpers import (
    RAPOR_ODEME_KOVASI,
    RAPOR_ODEME_LABELS,
    bugun_alinan_toplam,
    bugun_islem_q,
    gun_local_datetime_q,
    kova_listesi_with_yuzde,
    net_nakit_degisim,
    odeme_kirilimi_topla,
)
from apps.finans.application.gun_sonu_service import GunSonuService
from apps.finans.constants.cari_types import GelirDurum
from apps.finans.constants.gider_types import GiderDurum, OdemeDurum
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.mali_hesap_yetkilisi import MaliHesapYetkilisi
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru


def _user_display(user) -> str:
    if not user:
        return 'Sistem'
    full = (user.get_full_name() or '').strip()
    return full or getattr(user, 'username', None) or 'Sistem'


def _fmt_date(d: date) -> str:
    return d.strftime('%d.%m.%Y')


def _fmt_datetime(dt: datetime) -> str:
    local = timezone.localtime(dt) if timezone.is_aware(dt) else dt
    return local.strftime('%d.%m.%Y %H:%M')


def _fmt_tl(amount: int | float) -> str:
    return f'₺{int(amount):,}'.replace(',', '.')


class GunSonuReportService:
    """Gün sonu özet raporu veri katmanı."""

    RAPOR_TAHSILAT_BUCKETS = RAPOR_ODEME_KOVASI
    RAPOR_BUCKET_LABELS = RAPOR_ODEME_LABELS

    def __init__(self):
        self._gun_sonu = GunSonuService()

    def build_ozet_rapor(
        self,
        kurum_id: int,
        gun: date | None = None,
        sube_id: int | None = None,
        *,
        hazirlayan: str | None = None,
        notlar: str = '',
        kurum_ad: str | None = None,
        sube_ad: str | None = None,
        base: dict | None = None,
    ) -> dict:
        gun = gun or timezone.localdate()
        if base is None:
            base = self._gun_sonu.ozet(kurum_id, gun, sube_id)

        sozlesme_tahsilat, sozlesme_adet = self._sozlesme_tahsilat(kurum_id, gun, sube_id)
        gelir_tahsilat, gelir_tahsilat_adet = self._gelir_tahsilat(kurum_id, gun, sube_id)
        gider_odeme, gider_odeme_adet = self._gider_odeme(kurum_id, gun, sube_id)
        iade_toplam, iade_adet = self._iade(kurum_id, gun, sube_id)

        toplam_tahsilat = sozlesme_tahsilat
        toplam_gelir = gelir_tahsilat
        toplam_gider = gider_odeme
        toplam_iade = iade_toplam
        net_nakit_girisi = net_nakit_degisim(kurum_id, gun, sube_id)
        net_gunluk_finansal = toplam_tahsilat + toplam_gelir - toplam_gider - toplam_iade

        odeme_kova = odeme_kirilimi_topla(kurum_id, gun, sube_id)
        tahsilat_dagilimi = kova_listesi_with_yuzde(odeme_kova)
        tahsilat_dagilimi_rapor = self._tahsilat_dagilimi_rapor(tahsilat_dagilimi)
        islem_sayilari = self._islem_sayilari(kurum_id, gun, sube_id, {
            'tahsilat': sozlesme_adet + gelir_tahsilat_adet,
            'iade': iade_adet,
        })
        kullanici_ozeti = self._kullanici_ozeti(kurum_id, gun, sube_id)

        if not kurum_ad:
            kurum_ad = self._kurum_ad(kurum_id)
        if not sube_ad and sube_id:
            sube_ad = self._sube_ad(sube_id)

        meta = {
            'marka': kurum_ad or '',
            'baslik': 'GÜN SONU FİNANS RAPORU',
            'tarih': _fmt_date(gun),
            'tarih_iso': str(gun),
            'sube': sube_ad or 'Tüm Şubeler',
            'sube_id': sube_id,
            'hazirlayan': hazirlayan or 'Sistem',
            'olusturulma': _fmt_datetime(timezone.now()),
            'kurum_ad': kurum_ad or '',
        }

        return {
            **base,
            'ozet_rapor': {
                'meta': meta,
                'gunluk_ozet': {
                    'toplam_tahsilat': toplam_tahsilat,
                    'toplam_alinan': bugun_alinan_toplam(kurum_id, gun, sube_id),
                    'toplam_iade': toplam_iade,
                    'toplam_gelir': toplam_gelir,
                    'toplam_gider': toplam_gider,
                    'net_nakit_girisi': net_nakit_girisi,
                    'net_gunluk_finansal_sonuc': net_gunluk_finansal,
                },
                'tahsilat_dagilimi': tahsilat_dagilimi_rapor,
                'tahsilat_ozeti': tahsilat_dagilimi,
                'islem_sayilari': islem_sayilari,
                'kullanici_ozeti': kullanici_ozeti,
                'notlar': (notlar or '').strip(),
            },
        }

    def list_whatsapp_recipients(self, kurum_id: int, sube_id: int | None = None) -> list[dict]:
        hesap_qs = MaliHesap.objects.filter(sube__kurum_id=kurum_id, aktif_mi=True)
        if sube_id:
            hesap_qs = hesap_qs.filter(sube_id=sube_id)

        seen_phones: set[str] = set()
        recipients: list[dict] = []

        yetkililer = (
            MaliHesapYetkilisi.objects.filter(
                mali_hesap__in=hesap_qs,
            )
            .select_related('mali_hesap', 'personel')
            .order_by('siralama', 'ad_soyad')
        )
        for y in yetkililer:
            phone = (y.telefon or '').strip()
            if not phone:
                continue
            key = phone.replace(' ', '')
            if key in seen_phones:
                continue
            seen_phones.add(key)
            recipients.append({
                'id': y.id,
                'ad_soyad': y.gorunen_ad,
                'rol': y.rol or '',
                'telefon': phone,
                'telefon_maskeli': self._mask_phone(phone),
                'mali_hesap_ad': y.mali_hesap.ad if y.mali_hesap_id else '',
            })
        return recipients

    @staticmethod
    def _mask_phone(phone: str) -> str:
        digits = ''.join(c for c in phone if c.isdigit())
        if len(digits) < 4:
            return phone
        return f'*** *** {digits[-4:]}'

    def _sozlesme_tahsilat(self, kurum_id, gun, sube_id):
        from apps.odeme_takip.domain.models import Tahsilat

        qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            durum=TahsilatDurum.AKTIF,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(
            bugun_islem_q('tahsilat_tarihi', gun),
        )
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)
        agg = qs.aggregate(toplam=Sum('tutar'), adet=Count('id'))
        return int(agg['toplam'] or 0), agg['adet'] or 0

    def _gelir_tahsilat(self, kurum_id, gun, sube_id):
        qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
        ).filter(bugun_islem_q('tahsilat_tarihi', gun))
        if sube_id:
            qs = qs.filter(gelir_kaydi__sube_id=sube_id)
        agg = qs.aggregate(toplam=Sum('tutar'), adet=Count('id'))
        return int(agg['toplam'] or 0), agg['adet'] or 0

    def _gider_odeme(self, kurum_id, gun, sube_id):
        from apps.finans.application.gun_sonu_finans_helpers import gider_odeme_toplam

        return gider_odeme_toplam(kurum_id, gun, sube_id)

    def _iade(self, kurum_id, gun, sube_id):
        from apps.odeme_takip.domain.models import Tahsilat

        qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            tahsilat_tarihi=gun,
            durum=TahsilatDurum.AKTIF,
            tahsilat_turu=TahsilatTuru.IADE,
        )
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)
        agg = qs.aggregate(toplam=Sum('tutar'), adet=Count('id'))
        return int(agg['toplam'] or 0), agg['adet'] or 0

    def _tahsilat_dagilimi_rapor(self, kirilim: list[dict]) -> list[dict]:
        """Özet rapor B bölümü — geriye dönük uyumlu format."""
        rows = []
        for row in kirilim:
            if row.get('is_total'):
                rows.append({
                    'tip': 'toplam',
                    'label': 'Toplam',
                    'tutar': row['tutar'],
                    'adet': None,
                })
            else:
                rows.append({
                    'tip': row['tip'],
                    'label': row['label'],
                    'tutar': row['tutar'],
                    'adet': row.get('adet'),
                })
        if not rows:
            rows.append({'tip': 'toplam', 'label': 'Toplam', 'tutar': 0, 'adet': None})
        return rows

    def _islem_sayilari(self, kurum_id, gun, sube_id, partial: dict) -> dict:
        gelir_qs = GelirKaydi.objects.filter(kurum_id=kurum_id, fatura_tarihi=gun).exclude(
            durum=GelirDurum.IPTAL,
        )
        gider_qs = GiderKaydi.objects.filter(kurum_id=kurum_id, fatura_tarihi=gun).exclude(
            durum=GiderDurum.IPTAL,
        )
        if sube_id:
            gelir_qs = gelir_qs.filter(sube_id=sube_id)
            gider_qs = gider_qs.filter(sube_id=sube_id)

        iptal = self._iptal_sayisi(kurum_id, gun, sube_id)

        return {
            'tahsilat': partial['tahsilat'],
            'gelir_kaydi': gelir_qs.count(),
            'gider_kaydi': gider_qs.count(),
            'iade': partial['iade'],
            'iptal': iptal,
        }

    def _iptal_sayisi(self, kurum_id, gun, sube_id) -> int:
        from apps.odeme_takip.domain.models import Tahsilat

        t_qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            durum=TahsilatDurum.IPTAL_EDILDI,
        ).filter(gun_local_datetime_q('iptal_tarihi', gun))
        if sube_id:
            t_qs = t_qs.filter(sozlesme__sube_id=sube_id)

        gt_qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun))
        if sube_id:
            gt_qs = gt_qs.filter(gelir_kaydi__sube_id=sube_id)

        go_qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun))
        if sube_id:
            go_qs = go_qs.filter(gider_kaydi__sube_id=sube_id)

        gk_qs = GelirKaydi.objects.filter(
            kurum_id=kurum_id,
            durum=GelirDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun))
        if sube_id:
            gk_qs = gk_qs.filter(sube_id=sube_id)

        gd_qs = GiderKaydi.objects.filter(
            kurum_id=kurum_id,
            durum=GiderDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun))
        if sube_id:
            gd_qs = gd_qs.filter(sube_id=sube_id)

        return t_qs.count() + gt_qs.count() + go_qs.count() + gk_qs.count() + gd_qs.count()

    def _kullanici_ozeti(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.odeme_takip.domain.models import Tahsilat

        totals: dict[str, dict] = defaultdict(lambda: {'tahsilat': 0, 'gelir': 0, 'gider': 0})

        t_qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            durum=TahsilatDurum.AKTIF,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(
            bugun_islem_q('tahsilat_tarihi', gun),
        ).select_related('islem_yapan')
        if sube_id:
            t_qs = t_qs.filter(sozlesme__sube_id=sube_id)
        for row in t_qs.values('islem_yapan_id').annotate(toplam=Sum('tutar')):
            uid = row['islem_yapan_id']
            key = str(uid) if uid else '__sistem__'
            totals[key]['tahsilat'] += int(row['toplam'] or 0)

        gt_qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
        ).filter(bugun_islem_q('tahsilat_tarihi', gun)).select_related('islem_yapan')
        if sube_id:
            gt_qs = gt_qs.filter(gelir_kaydi__sube_id=sube_id)
        for row in gt_qs.values('islem_yapan_id').annotate(toplam=Sum('tutar')):
            uid = row['islem_yapan_id']
            key = str(uid) if uid else '__sistem__'
            totals[key]['gelir'] += int(row['toplam'] or 0)

        go_qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            odeme_tarihi=gun,
            durum=OdemeDurum.TAMAMLANDI,
        ).select_related('islem_yapan')
        if sube_id:
            go_qs = go_qs.filter(gider_kaydi__sube_id=sube_id)
        for row in go_qs.values('islem_yapan_id').annotate(toplam=Sum('tutar')):
            uid = row['islem_yapan_id']
            key = str(uid) if uid else '__sistem__'
            totals[key]['gider'] += int(row['toplam'] or 0)

        user_ids = [int(k) for k in totals if k != '__sistem__']
        user_map: dict[int, str] = {}
        if user_ids:
            from django.contrib.auth import get_user_model

            User = get_user_model()
            for u in User.objects.filter(id__in=user_ids):
                user_map[u.id] = _user_display(u)

        rows = []
        for key, vals in totals.items():
            if vals['tahsilat'] == 0 and vals['gelir'] == 0 and vals['gider'] == 0:
                continue
            if key == '__sistem__':
                personel = 'Sistem'
            else:
                personel = user_map.get(int(key), 'Sistem')
            rows.append({
                'personel': personel,
                'tahsilat': vals['tahsilat'],
                'gelir': vals['gelir'],
                'gider': vals['gider'],
            })
        rows.sort(key=lambda r: -(r['tahsilat'] + r['gelir'] + r['gider']))
        return rows

    @staticmethod
    def _kurum_ad(kurum_id: int) -> str:
        try:
            from apps.kurum.domain.models import Kurum

            return Kurum.objects.filter(id=kurum_id).values_list('ad', flat=True).first() or ''
        except Exception:
            return ''

    @staticmethod
    def _sube_ad(sube_id: int) -> str:
        try:
            from apps.sube.domain.models import Sube

            return Sube.objects.filter(id=sube_id).values_list('ad', flat=True).first() or ''
        except Exception:
            return ''
