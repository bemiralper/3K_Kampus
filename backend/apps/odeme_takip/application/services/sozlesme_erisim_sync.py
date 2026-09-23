"""
Aktif sözleşmenin kalemlerinden eksik öğrenci erişim kayıtlarını açar.

Kayıt sihirbazı ek hizmet, deneme ve ders paketini öğrenciye yazar.
Sözleşme ekranından sonradan eklenen kalem yalnızca faturaya düşüyordu.
Bu senkron, var olan erişimi kapatmaz; eksik olanı açar.
"""
from __future__ import annotations

import logging

from apps.odeme_takip.domain.enums import SozlesmeDurum
from apps.ogrenci.interfaces.list_helpers import resolve_kalem_filter_turu

logger = logging.getLogger(__name__)

GRANTING_DURUMLAR = (
    SozlesmeDurum.AKTIF,
    SozlesmeDurum.TAMAMLANDI,
    SozlesmeDurum.DONDURULMUS,
)

_PAKET_TURLERI = frozenset({'grup_dersi', 'ozel_ders', 'premium', 'yayin', 'deneme'})

_NORMALIZE = {
    'grup_dersi': 'grup_dersi',
    'grup_dersleri': 'grup_dersi',
    'ozel_ders': 'ozel_ders',
    'ozel_dersler': 'ozel_ders',
    'premium': 'premium',
    'premium_paketler': 'premium',
    'yayin': 'yayin',
    'yayin_paketleri': 'yayin',
    'deneme': 'deneme',
    'denemeler': 'deneme',
    'ek_hizmet': 'ek_hizmet',
    'ek_hizmet_satisi': 'ek_hizmet',
}


def sync_sozlesme_erisim(sozlesme, *, user=None, dry_run=False) -> dict:
    """Sözleşme kalemleri için eksik erişim kayıtlarını açar."""
    result = {
        'skipped': sozlesme.durum not in GRANTING_DURUMLAR,
        'created_ek_hizmet': [],
        'created_paket': [],
        'missing_catalog': [],
    }
    if result['skipped'] or not sozlesme.ogrenci_id:
        return result

    for item in _contract_items(sozlesme):
        tur = item['tur']
        try:
            if tur == 'ek_hizmet':
                _ensure_ek_hizmet(sozlesme, item, result, dry_run=dry_run)
            elif tur == 'deneme':
                _ensure_deneme(sozlesme, item, result, dry_run=dry_run)
            elif tur == 'grup_dersi':
                _ensure_grup_dersi(sozlesme, item, result, dry_run=dry_run)
            elif tur == 'premium':
                _ensure_premium(sozlesme, item, result, user=user, dry_run=dry_run)
            elif tur == 'ozel_ders':
                _ensure_ozel_ders(sozlesme, item, result, user=user, dry_run=dry_run)
            elif tur == 'yayin':
                _ensure_yayin(sozlesme, item, result, dry_run=dry_run)
        except Exception:
            logger.exception(
                'Sözleşme erişim senkronu başarısız (sozlesme=%s tur=%s id=%s)',
                sozlesme.id, tur, item.get('kalem_id'),
            )
            result['missing_catalog'].append(f"{tur}:{item.get('kalem_id')}")
    closed = _close_stale_erisim(sozlesme, dry_run=dry_run)
    result.update(closed)
    return result


def _contract_items(sozlesme) -> list[dict]:
    seen = set()
    items = []

    def add(tur, kalem_id, adi, net_tutar):
        tur = _NORMALIZE.get(tur or '', tur)
        if tur not in _PAKET_TURLERI and tur != 'ek_hizmet':
            return
        if not kalem_id:
            return
        key = (tur, int(kalem_id))
        if key in seen:
            return
        seen.add(key)
        items.append({
            'tur': tur,
            'kalem_id': int(kalem_id),
            'adi': adi or '',
            'net_tutar': int(net_tutar or 0),
        })

    for kalem in sozlesme.kalemler.all():
        add(
            resolve_kalem_filter_turu(kalem, sozlesme),
            kalem.kalem_id,
            kalem.kalem_adi,
            kalem.net_tutar,
        )

    add(
        sozlesme.paket_turu,
        sozlesme.paket_id,
        sozlesme.paket_adi,
        0,
    )
    return items


def _close_stale_erisim(sozlesme, *, dry_run=False) -> dict:
    """Sözleşmede kalmayan paket ve hizmet erişimini kapatır.

    Kayıt anındaki paket sonradan değiştirilince öğrenci listesi ve erişim
    eski adı göstermesin. Güncel paketin dahil hizmetleri açık kalır.
    """
    from apps.odeme_takip.domain.models import Sozlesme
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi, OgrenciEkHizmet

    closed = {'closed_paket': [], 'closed_ek_hizmet': []}
    if not sozlesme.ogrenci_id:
        return closed

    contracts = Sozlesme.objects.filter(
        ogrenci_id=sozlesme.ogrenci_id,
        durum__in=GRANTING_DURUMLAR,
    ).prefetch_related('kalemler')
    desired_paket: set[tuple[str, int]] = set()
    desired_ek: set[int] = set()
    for other in contracts:
        for item in _contract_items(other):
            if item['tur'] == 'ek_hizmet':
                desired_ek.add(item['kalem_id'])
            else:
                desired_paket.add((item['tur'], item['kalem_id']))
    _expand_included_access(desired_paket, desired_ek, sozlesme)

    paket_qs = OgrenciEgitimPaketi.objects.filter(
        ogrenci_id=sozlesme.ogrenci_id,
        aktif_mi=True,
    )
    for ep in paket_qs:
        if (ep.paket_turu, ep.paket_id) in desired_paket:
            continue
        closed['closed_paket'].append(ep.paket_adi or f'{ep.paket_turu}:{ep.paket_id}')
        if not dry_run:
            ep.aktif_mi = False
            ep.save(update_fields=['aktif_mi', 'updated_at'])

    ek_qs = OgrenciEkHizmet.objects.filter(
        ogrenci_id=sozlesme.ogrenci_id,
        aktif_mi=True,
        egitim_yili_id=sozlesme.egitim_yili_id,
    ).select_related('ek_hizmet')
    for row in ek_qs:
        if row.ek_hizmet_id in desired_ek:
            continue
        closed['closed_ek_hizmet'].append(
            row.ek_hizmet.ad if row.ek_hizmet_id else str(row.ek_hizmet_id),
        )
        if not dry_run:
            row.aktif_mi = False
            row.save(update_fields=['aktif_mi', 'updated_at'])
    return closed


def _expand_included_access(desired_paket, desired_ek, sozlesme):
    """Güncel grup/premium/deneme paketinin dahil ettiği erişimi koru."""
    from apps.egitim_paketleri.models import Deneme, EkHizmet, GrupDersi, PremiumPaket
    from apps.ogrenci_kayit.application.services import (
        resolve_grup_dersi_inclusions,
        resolve_premium_paket_inclusions,
    )

    kwargs = {
        'kurum_id': sozlesme.kurum_id,
        'sube_id': sozlesme.sube_id,
        'egitim_yili_id': sozlesme.egitim_yili_id,
    }
    for tur, pid in list(desired_paket):
        if tur == 'grup_dersi':
            grup = GrupDersi.objects.filter(id=pid).first()
            if not grup:
                continue
            ek_ids, deneme_ids, yayin_ids = resolve_grup_dersi_inclusions(grup, **kwargs)
            desired_ek.update(ek_ids)
            desired_paket.update(('deneme', i) for i in deneme_ids)
            desired_paket.update(('yayin', i) for i in yayin_ids)
        elif tur == 'premium':
            premium = PremiumPaket.objects.filter(id=pid).first()
            if not premium:
                continue
            ek_ids, deneme_ids, yayin_ids = resolve_premium_paket_inclusions(premium, **kwargs)
            desired_ek.update(ek_ids)
            desired_paket.update(('deneme', i) for i in deneme_ids)
            desired_paket.update(('yayin', i) for i in yayin_ids)
        elif tur == 'deneme':
            deneme = Deneme.objects.filter(id=pid).first()
            if not deneme:
                continue
            desired_ek.update(
                EkHizmet.objects.filter(
                    deneme_paketi=deneme,
                    sube_id=sozlesme.sube_id,
                    egitim_yili_id=sozlesme.egitim_yili_id,
                ).values_list('id', flat=True)
            )
            desired_ek.update(
                deneme.dahil_ek_hizmetler.filter(aktif_mi=True).values_list('id', flat=True)
            )


def _ensure_ek_hizmet(sozlesme, item, result, *, dry_run):
    from apps.egitim_paketleri.models import EkHizmet

    ek = EkHizmet.objects.filter(id=item['kalem_id']).first()
    if not ek:
        result['missing_catalog'].append(f"ek_hizmet:{item['kalem_id']}")
        return
    if _open_ogrenci_ek_hizmet(sozlesme, ek, fiyat=item['net_tutar'] or ek.brut_fiyat, dry_run=dry_run):
        result['created_ek_hizmet'].append(ek.ad or item['adi'])


def _ensure_deneme(sozlesme, item, result, *, dry_run):
    from apps.egitim_paketleri.models import Deneme, EkHizmet

    deneme = Deneme.objects.filter(id=item['kalem_id']).first()
    if not deneme:
        result['missing_catalog'].append(f"deneme:{item['kalem_id']}")
        return

    ek = EkHizmet.objects.filter(
        deneme_paketi=deneme,
        sube_id=sozlesme.sube_id,
        egitim_yili_id=sozlesme.egitim_yili_id,
        aktif_mi=True,
    ).first()
    if ek is None and not dry_run:
        ek = EkHizmet.objects.create(
            ad=f"Deneme — {deneme.ad}",
            kod=f"DNM_{deneme.kod}"[:50],
            hizmet_turu='deneme',
            kurum_id=sozlesme.kurum_id,
            sube_id=sozlesme.sube_id,
            egitim_yili_id=sozlesme.egitim_yili_id,
            deneme_paketi=deneme,
            brut_fiyat=deneme.brut_fiyat,
            kdv_orani=deneme.kdv_orani,
            aktif_mi=True,
        )
        ek.sinif_seviyeleri.set(deneme.sinif_seviyeleri.all())

    opened_access = False
    if ek is not None:
        opened_access = _open_ogrenci_ek_hizmet(
            sozlesme, ek, fiyat=item['net_tutar'] or deneme.brut_fiyat, dry_run=dry_run,
        )
    elif dry_run:
        opened_access = True

    opened_paket = _ensure_egitim_paketi(
        sozlesme,
        'deneme',
        deneme.id,
        deneme.ad or item['adi'],
        dry_run=dry_run,
    )
    if opened_access:
        result['created_ek_hizmet'].append(deneme.ad or item['adi'])
    if opened_paket:
        result['created_paket'].append(deneme.ad or item['adi'])

    for dahil in deneme.dahil_ek_hizmetler.filter(aktif_mi=True).exclude(hizmet_turu='deneme'):
        if _open_ogrenci_ek_hizmet(
            sozlesme, dahil, fiyat=0, dahil_mi=True, kaynak='deneme', kaynak_id=deneme.id, dry_run=dry_run,
        ):
            result['created_ek_hizmet'].append(dahil.ad)


def _ensure_grup_dersi(sozlesme, item, result, *, dry_run):
    from apps.egitim_paketleri.models import GrupDersi
    from apps.ogrenci_kayit.application.services import (
        attach_grup_dersi_denemeler,
        attach_grup_dersi_ek_hizmetler,
        attach_grup_dersi_yayin_paketleri,
    )

    grup = GrupDersi.objects.filter(id=item['kalem_id']).first()
    if not grup:
        result['missing_catalog'].append(f"grup_dersi:{item['kalem_id']}")
        return
    if _ensure_egitim_paketi(sozlesme, 'grup_dersi', grup.id, grup.ad or item['adi'], dry_run=dry_run):
        result['created_paket'].append(grup.ad or item['adi'])

    from apps.ogrenci_kayit.application.services import resolve_grup_dersi_inclusions
    dahil_ids, _dahil_deneme_ids, _dahil_yayin_ids = resolve_grup_dersi_inclusions(
        grup,
        kurum_id=sozlesme.kurum_id,
        sube_id=sozlesme.sube_id,
        egitim_yili_id=sozlesme.egitim_yili_id,
    )
    if dry_run:
        from apps.egitim_paketleri.models import EkHizmet
        for dahil in EkHizmet.objects.filter(id__in=dahil_ids):
            if _open_ogrenci_ek_hizmet(sozlesme, dahil, fiyat=0, dahil_mi=True, dry_run=True):
                result['created_ek_hizmet'].append(dahil.ad)
        return

    kwargs = {
        'kurum_id': sozlesme.kurum_id,
        'sube_id': sozlesme.sube_id,
        'egitim_yili_id': sozlesme.egitim_yili_id,
    }
    before = set(_active_ek_hizmet_ids(sozlesme.ogrenci_id))
    attach_grup_dersi_ek_hizmetler(
        sozlesme.ogrenci, grup, sozlesme.egitim_yili, sozlesme.baslangic_tarihi, **kwargs,
    )
    attach_grup_dersi_denemeler(
        sozlesme.ogrenci, grup, sozlesme.egitim_yili, sozlesme.baslangic_tarihi, **kwargs,
    )
    attach_grup_dersi_yayin_paketleri(
        sozlesme.ogrenci, grup, sozlesme.egitim_yili, sozlesme.baslangic_tarihi, **kwargs,
    )
    after = set(_active_ek_hizmet_ids(sozlesme.ogrenci_id))
    new_ids = after - before
    if new_ids:
        from apps.egitim_paketleri.models import EkHizmet
        for ad in EkHizmet.objects.filter(id__in=new_ids).values_list('ad', flat=True):
            result['created_ek_hizmet'].append(ad)


def _ensure_premium(sozlesme, item, result, *, user, dry_run):
    from apps.egitim_paketleri.models import PremiumPaket
    from apps.ogrenci_kayit.application.services import attach_premium_paket_inclusions
    from apps.ozel_ders.services.sync_service import ensure_program_from_sozlesme_kalem

    premium = PremiumPaket.objects.filter(id=item['kalem_id']).first()
    if not premium:
        result['missing_catalog'].append(f"premium:{item['kalem_id']}")
        return
    if _ensure_egitim_paketi(sozlesme, 'premium', premium.id, premium.ad or item['adi'], dry_run=dry_run):
        result['created_paket'].append(premium.ad or item['adi'])
    if dry_run:
        return
    attach_premium_paket_inclusions(
        sozlesme.ogrenci,
        premium,
        sozlesme.egitim_yili,
        sozlesme.baslangic_tarihi,
        kurum_id=sozlesme.kurum_id,
        sube_id=sozlesme.sube_id,
        egitim_yili_id=sozlesme.egitim_yili_id,
    )
    kalem = _matching_kalem(sozlesme, item)
    if kalem is not None:
        ensure_program_from_sozlesme_kalem(sozlesme, kalem, user=user)


def _ensure_ozel_ders(sozlesme, item, result, *, user, dry_run):
    from apps.egitim_paketleri.models import OzelDers
    from apps.ozel_ders.services.sync_service import ensure_program_from_sozlesme_kalem

    paket = OzelDers.objects.filter(id=item['kalem_id']).first()
    if not paket:
        result['missing_catalog'].append(f"ozel_ders:{item['kalem_id']}")
        return
    if _ensure_egitim_paketi(sozlesme, 'ozel_ders', paket.id, paket.ad or item['adi'], dry_run=dry_run):
        result['created_paket'].append(paket.ad or item['adi'])
    if dry_run:
        return
    kalem = _matching_kalem(sozlesme, item)
    if kalem is not None:
        ensure_program_from_sozlesme_kalem(sozlesme, kalem, user=user)


def _ensure_yayin(sozlesme, item, result, *, dry_run):
    from apps.egitim_paketleri.models import YayinPaketi

    yayin = YayinPaketi.objects.filter(id=item['kalem_id']).first()
    adi = yayin.ad if yayin else item['adi']
    if yayin is None:
        result['missing_catalog'].append(f"yayin:{item['kalem_id']}")
        return
    if _ensure_egitim_paketi(sozlesme, 'yayin', yayin.id, adi, dry_run=dry_run):
        result['created_paket'].append(adi)


def _open_ogrenci_ek_hizmet(sozlesme, ek, *, fiyat, dry_run, dahil_mi=False, kaynak='sozlesme', kaynak_id=None) -> bool:
    from apps.ogrenci.domain.models import OgrenciEkHizmet

    if OgrenciEkHizmet.objects.filter(
        ogrenci_id=sozlesme.ogrenci_id,
        ek_hizmet=ek,
        aktif_mi=True,
    ).exists():
        return False
    if dry_run:
        return True

    inactive = (
        OgrenciEkHizmet.objects.filter(
            ogrenci_id=sozlesme.ogrenci_id,
            ek_hizmet=ek,
            aktif_mi=False,
        )
        .order_by('-id')
        .first()
    )
    if inactive:
        inactive.aktif_mi = True
        inactive.egitim_yili = sozlesme.egitim_yili or inactive.egitim_yili
        inactive.save(update_fields=['aktif_mi', 'egitim_yili', 'updated_at'])
        return True

    OgrenciEkHizmet.objects.create(
        ogrenci_id=sozlesme.ogrenci_id,
        ek_hizmet=ek,
        fiyat=fiyat or 0,
        dahil_mi=dahil_mi,
        kaynak_paket_turu=kaynak,
        kaynak_paket_id=kaynak_id,
        egitim_yili=sozlesme.egitim_yili,
        baslangic_tarihi=sozlesme.baslangic_tarihi,
        aktif_mi=True,
    )
    return True


def _ensure_egitim_paketi(sozlesme, tur, paket_id, paket_adi, *, dry_run) -> bool:
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi

    ep = (
        OgrenciEgitimPaketi.objects.filter(
            ogrenci_id=sozlesme.ogrenci_id,
            paket_turu=tur,
            paket_id=paket_id,
        )
        .order_by('-id')
        .first()
    )
    if ep and ep.aktif_mi:
        if paket_adi and ep.paket_adi != paket_adi and not dry_run:
            ep.paket_adi = paket_adi
            ep.save(update_fields=['paket_adi', 'updated_at'])
        return False
    if dry_run:
        return True
    if ep:
        ep.aktif_mi = True
        if paket_adi and not ep.paket_adi:
            ep.paket_adi = paket_adi
        ep.save(update_fields=['aktif_mi', 'paket_adi', 'updated_at'])
        return True
    OgrenciEgitimPaketi.objects.create(
        ogrenci_id=sozlesme.ogrenci_id,
        paket_turu=tur,
        paket_id=paket_id,
        paket_adi=paket_adi or '',
        aktif_mi=True,
        dahil_mi=False,
        baslangic_tarihi=sozlesme.baslangic_tarihi,
    )
    return True


def _active_ek_hizmet_ids(ogrenci_id):
    from apps.ogrenci.domain.models import OgrenciEkHizmet
    return OgrenciEkHizmet.objects.filter(
        ogrenci_id=ogrenci_id, aktif_mi=True,
    ).values_list('ek_hizmet_id', flat=True)


def _matching_kalem(sozlesme, item):
    for kalem in sozlesme.kalemler.all():
        tur = _NORMALIZE.get(resolve_kalem_filter_turu(kalem, sozlesme) or '', None)
        if tur == item['tur'] and kalem.kalem_id == item['kalem_id']:
            return kalem
    return None
