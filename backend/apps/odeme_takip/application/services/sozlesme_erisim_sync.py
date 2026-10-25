"""
Aktif sözleşmenin kalemlerinden eksik öğrenci erişim kayıtlarını açar.

Kayıt sihirbazı ek hizmet, deneme ve ders paketini öğrenciye yazar.
Sözleşme güncellemesi aynı kuralı yeniden uygular: eksik erişimi açar,
hak veren sözleşme kalmadıysa kapatır. Geçmiş yoklama ve finans belgesine dokunmaz.
"""
from __future__ import annotations

from apps.odeme_takip.domain.enums import SozlesmeDurum
from apps.ogrenci.interfaces.list_helpers import resolve_kalem_filter_turu

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


def close_revoked_sozlesme_erisim(sozlesme, *, dry_run=False) -> dict:
    """İptal veya fesih sonrası, başka geçerli sözleşme kalmadıysa erişimi kapatır."""
    if not getattr(sozlesme, 'ogrenci_id', None) or sozlesme.durum in GRANTING_DURUMLAR:
        return {'closed_paket': [], 'closed_ek_hizmet': []}
    return _close_stale_erisim(sozlesme, dry_run=dry_run)


def sync_sozlesme_erisim(sozlesme, *, user=None, dry_run=False, refresh_inclusions=None) -> dict:
    """Sözleşme kalemleri için eksik erişim kayıtlarını açar.

    refresh_inclusions True ise paket kataloğundaki güncel dahil hizmetler
    bu sözleşmenin anlık görüntüsüne yazılır. False ise kayıtlı görüntü
    kullanılır; görüntü yoksa mevcut erişim satırlarından türetilir, katalog
    okunmaz. None, görüntü boşsa bir kez katalogdan yazar (ilk kapsam).
    """
    from django.db import transaction

    result = {
        'skipped': sozlesme.durum not in GRANTING_DURUMLAR,
        'created_ek_hizmet': [],
        'created_paket': [],
        'realigned_ek_hizmet': [],
        'ambiguous_ek_hizmet': [],
        'ambiguous_kaynak': [],
        'yili_bos': [],
        'missing_catalog': [],
    }
    if result['skipped'] or not sozlesme.ogrenci_id:
        return result

    with transaction.atomic():
        from apps.ogrenci.domain.models import Ogrenci

        Ogrenci.objects.select_for_update().filter(pk=sozlesme.ogrenci_id).exists()
        sozlesme.refresh_from_db()
        snap = _snapshot_for(sozlesme, refresh_inclusions)
        if not dry_run and sozlesme.erisim_kapsam_anlik != snap:
            sozlesme.erisim_kapsam_anlik = snap
            sozlesme.save(update_fields=['erisim_kapsam_anlik', 'updated_at'])

        for item in _contract_items(sozlesme):
            tur = item['tur']
            if tur == 'ek_hizmet':
                _ensure_ek_hizmet(sozlesme, item, result, dry_run=dry_run)
            elif tur == 'deneme':
                _ensure_deneme(
                    sozlesme, item, result, dry_run=dry_run,
                    include_children=bool(refresh_inclusions),
                )
            elif tur == 'grup_dersi':
                _ensure_grup_dersi(
                    sozlesme, item, result, dry_run=dry_run,
                    live_inclusions=bool(refresh_inclusions),
                )
            elif tur == 'premium':
                _ensure_premium(
                    sozlesme, item, result, user=user, dry_run=dry_run,
                    live_inclusions=bool(refresh_inclusions),
                )
            elif tur == 'ozel_ders':
                _ensure_ozel_ders(sozlesme, item, result, user=user, dry_run=dry_run)
            elif tur == 'yayin':
                _ensure_yayin(sozlesme, item, result, dry_run=dry_run)
        if not refresh_inclusions:
            _apply_snapshot(sozlesme, snap, result, dry_run=dry_run)
        access = _access_index(sozlesme.ogrenci_id, overlay={sozlesme.id: snap})
        _realign_ek_hizmet_years(sozlesme.ogrenci_id, access['ek_years'], result, dry_run=dry_run)
        closed = _close_stale_erisim(sozlesme, access=access, dry_run=dry_run)
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


def _explicit_sets(sozlesme) -> tuple[set[tuple[str, int]], set[int]]:
    desired_paket: set[tuple[str, int]] = set()
    desired_ek: set[int] = set()
    for item in _contract_items(sozlesme):
        if item['tur'] == 'ek_hizmet':
            desired_ek.add(item['kalem_id'])
        else:
            desired_paket.add((item['tur'], item['kalem_id']))
    return desired_paket, desired_ek


def _package_key(tur, pid) -> str:
    return f'{tur}:{int(pid)}'


def _empty_spec() -> dict:
    return {'ek': [], 'deneme': [], 'yayin': []}


def _merge_snapshot(snap) -> dict:
    ek, deneme, yayin = set(), set(), set()
    for spec in (snap or {}).values():
        if not isinstance(spec, dict):
            continue
        ek.update(int(i) for i in spec.get('ek') or [])
        deneme.update(int(i) for i in spec.get('deneme') or [])
        yayin.update(int(i) for i in spec.get('yayin') or [])
    return {'ek': sorted(ek), 'deneme': sorted(deneme), 'yayin': sorted(yayin)}


def _capture_live_snapshot(sozlesme) -> dict:
    """Kapsam değişince her paketin o andaki dahil hizmetini ayrı sabitle."""
    paket, _ek = _explicit_sets(sozlesme)
    out = {}
    for tur, pid in paket:
        lone_paket = {(tur, pid)}
        lone_ek: set[int] = set()
        _expand_included_access(lone_paket, lone_ek, sozlesme)
        out[_package_key(tur, pid)] = {
            'ek': sorted(lone_ek),
            'deneme': sorted(p for t, p in lone_paket if t == 'deneme'),
            'yayin': sorted(p for t, p in lone_paket if t == 'yayin'),
        }
    return out


def _derive_package_spec(sozlesme, tur, pid) -> dict:
    """Bu pakete bağlanan duran satırlar. Katalog okunmaz."""
    from apps.ogrenci.domain.models import OgrenciEkHizmet

    if not sozlesme.egitim_yili_id:
        return _empty_spec()
    ek_ids = []
    deneme_ids = []
    rows = OgrenciEkHizmet.objects.filter(
        ogrenci_id=sozlesme.ogrenci_id,
        aktif_mi=True,
        egitim_yili_id=sozlesme.egitim_yili_id,
    ).select_related('ek_hizmet')
    for row in rows:
        if row.kaynak_paket_turu == 'bireysel':
            continue
        kaynak = _NORMALIZE.get(row.kaynak_paket_turu or '', row.kaynak_paket_turu or '')
        if (kaynak, row.kaynak_paket_id) != (tur, pid):
            continue
        ek_ids.append(row.ek_hizmet_id)
        deneme_id = row.ek_hizmet.deneme_paketi_id if row.ek_hizmet_id else None
        if deneme_id:
            deneme_ids.append(deneme_id)
    return {'ek': sorted(set(ek_ids)), 'deneme': sorted(set(deneme_ids)), 'yayin': []}


def _snapshot_for(sozlesme, refresh_inclusions) -> dict:
    paket, _ek = _explicit_sets(sozlesme)
    keys = {_package_key(tur, pid) for tur, pid in paket}
    stored = sozlesme.erisim_kapsam_anlik or {}
    stored_keys = set(stored)
    scope_changed = stored_keys != keys
    if refresh_inclusions is True or (
        refresh_inclusions is None and (not stored or scope_changed)
    ):
        return _capture_live_snapshot(sozlesme)
    out = {}
    for tur, pid in paket:
        key = _package_key(tur, pid)
        if key in stored and isinstance(stored.get(key), dict):
            out[key] = stored[key]
        else:
            out[key] = _derive_package_spec(sozlesme, tur, pid)
    return out


def _apply_snapshot(sozlesme, snap, result, *, dry_run) -> None:
    from apps.egitim_paketleri.models import EkHizmet

    snap = _merge_snapshot(snap)
    for ek_id in snap.get('ek') or []:
        ek = EkHizmet.objects.filter(id=ek_id).first()
        if not ek:
            result['missing_catalog'].append(f'ek_hizmet:{ek_id}')
            continue
        if _open_ogrenci_ek_hizmet(
            sozlesme, ek, fiyat=0, dahil_mi=True, dry_run=dry_run,
        ):
            result['created_ek_hizmet'].append(ek.ad or str(ek_id))
    for deneme_id in snap.get('deneme') or []:
        _ensure_deneme(
            sozlesme,
            {'kalem_id': deneme_id, 'adi': '', 'net_tutar': 0, 'tur': 'deneme'},
            result,
            dry_run=dry_run,
            include_children=False,
        )
    for yayin_id in snap.get('yayin') or []:
        _ensure_yayin(
            sozlesme,
            {'kalem_id': yayin_id, 'adi': '', 'tur': 'yayin'},
            result,
            dry_run=dry_run,
        )


def _desired_from_contract(sozlesme, snapshot=None) -> tuple[set[tuple[str, int]], set[int]]:
    """Kalemler artı sözleşmede sabitlenmiş dahil hizmetler. Katalog okunmaz."""
    desired_paket, desired_ek = _explicit_sets(sozlesme)
    snap = _merge_snapshot(sozlesme.erisim_kapsam_anlik if snapshot is None else snapshot)
    desired_ek.update(snap['ek'])
    desired_paket.update(('deneme', i) for i in snap['deneme'])
    desired_paket.update(('yayin', i) for i in snap['yayin'])
    return desired_paket, desired_ek


def _access_index(ogrenci_id, overlay=None) -> dict:
    """Öğrencinin hak veren sözleşmelerinden yıl bazlı hizmet ve paket kümesi.

    Ek hizmet yılı sözleşmenin eğitim yılıdır. Başka yılın sözleşmesi bu yılın
    satırını açık tutmaz. Paket satırında yıl alanı yoktur; paket, herhangi bir
    hak veren sözleşmede durduğu sürece kapanmaz.
    """
    from apps.odeme_takip.domain.models import Sozlesme

    contracts = Sozlesme.objects.filter(
        ogrenci_id=ogrenci_id,
        durum__in=GRANTING_DURUMLAR,
    ).prefetch_related('kalemler')
    overlay = overlay or {}
    desired_paket: set[tuple[str, int]] = set()
    ek_years: dict[int, set] = {}
    for other in contracts:
        local_paket, local_ek = _desired_from_contract(other, overlay.get(other.id))
        desired_paket |= local_paket
        year = other.egitim_yili_id
        for ek_id in local_ek:
            ek_years.setdefault(ek_id, set()).add(year)
    return {'desired_paket': desired_paket, 'ek_years': ek_years}


def _realign_ek_hizmet_years(ogrenci_id, ek_years, result, *, dry_run=False) -> None:
    """Yalnızca tek yıl hak veriyorsa yanlış yıldaki tek satırı o yıla taşır.

    İki yıl birden hak veriyorsa satırlar yerinde kalır; eksik yıl ayrıca açılır.
    Yılı boş satır birden fazla yıla hak varsa tahminle doldurulmaz.
    Doğrudan satış satırı sözleşme yılına çekilmez.
    """
    from apps.ogrenci.domain.models import OgrenciEkHizmet

    rows = list(OgrenciEkHizmet.objects.filter(
        ogrenci_id=ogrenci_id,
        aktif_mi=True,
    ).select_related('ek_hizmet'))
    for row in rows:
        if row.kaynak_paket_turu == 'bireysel':
            continue
        years = {y for y in ek_years.get(row.ek_hizmet_id, set()) if y}
        label = row.ek_hizmet.ad if row.ek_hizmet_id else str(row.ek_hizmet_id)
        if row.egitim_yili_id is None and len(years) != 1:
            result['ambiguous_ek_hizmet'].append(f'{label} (yıl boş)')
            continue
        if len(years) != 1:
            continue
        target = next(iter(years))
        if row.egitim_yili_id == target:
            continue
        already = any(
            other.ek_hizmet_id == row.ek_hizmet_id and other.egitim_yili_id == target
            for other in rows
        )
        if already:
            continue
        result['realigned_ek_hizmet'].append(label)
        if dry_run:
            continue
        row.egitim_yili_id = target
        row.save(update_fields=['egitim_yili', 'updated_at'])


def _close_stale_erisim(sozlesme, *, access=None, dry_run=False) -> dict:
    """Sözleşmede kalmayan paket ve hizmet erişimini kapatır.

    Kayıt anındaki paket sonradan değiştirilince öğrenci listesi ve erişim
    eski adı göstermesin. Güncel paketin dahil hizmetleri açık kalır.
    Ek hizmet yalnızca kendi eğitim yılında hak veren sözleşme yoksa kapanır.
    """
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi, OgrenciEkHizmet

    closed = {
        'closed_paket': [],
        'closed_ek_hizmet': [],
        'ambiguous_kaynak': [],
        'yili_bos': [],
    }
    if not sozlesme.ogrenci_id:
        return closed

    if access is None:
        access = _access_index(sozlesme.ogrenci_id)
    desired_paket = access['desired_paket']
    ek_years = access['ek_years']

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
    ).select_related('ek_hizmet')
    for row in ek_qs:
        label = row.ek_hizmet.ad if row.ek_hizmet_id else str(row.ek_hizmet_id)
        if row.kaynak_paket_turu == 'bireysel':
            continue
        deneme_id = row.ek_hizmet.deneme_paketi_id if row.ek_hizmet_id else None
        if deneme_id and ('deneme', deneme_id) in desired_paket:
            continue
        if row.egitim_yili_id is None:
            years = ek_years.get(row.ek_hizmet_id, set())
            concrete = {y for y in years if y}
            if len(concrete) != 1:
                closed['yili_bos'].append(label)
            continue
        years = ek_years.get(row.ek_hizmet_id, set())
        concrete = {y for y in years if y}
        if row.egitim_yili_id in concrete:
            continue
        closed['closed_ek_hizmet'].append(label)
        if not dry_run:
            row.aktif_mi = False
            row.save(update_fields=['aktif_mi', 'updated_at'])
    return closed


def _retain_included_denemeler(desired_paket, desired_ek, deneme_ids, sozlesme):
    """Dahil denemenin ek hizmet satırını da açık tut.

    Erişim OgrenciEkHizmet üzerinden yürür. Deneme kimliği yalnızca paket
    kümesine yazılırsa _close_stale_erisim bu satırı pasife çeker. Grup ve
    premium dalları denemeyi döngü sırasında eklediği için ayrıca burada
    işlenir; döngü listenin anlık kopyası üzerinde yürür.
    """
    from apps.egitim_paketleri.models import Deneme, EkHizmet

    ids = [i for i in deneme_ids if i]
    if not ids:
        return
    denemeler = list(Deneme.objects.filter(id__in=ids))
    if not denemeler:
        return
    desired_paket.update(('deneme', deneme.id) for deneme in denemeler)
    desired_ek.update(
        EkHizmet.objects.filter(
            deneme_paketi_id__in=[deneme.id for deneme in denemeler],
            sube_id=sozlesme.sube_id,
            egitim_yili_id=sozlesme.egitim_yili_id,
        ).values_list('id', flat=True)
    )
    for deneme in denemeler:
        desired_ek.update(
            deneme.dahil_ek_hizmetler.filter(aktif_mi=True).values_list('id', flat=True)
        )


def _expand_included_access(desired_paket, desired_ek, sozlesme):
    """Güncel grup/premium/deneme paketinin dahil ettiği erişimi koru."""
    from apps.egitim_paketleri.models import GrupDersi, PremiumPaket
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
            _retain_included_denemeler(desired_paket, desired_ek, deneme_ids, sozlesme)
            desired_paket.update(('yayin', i) for i in yayin_ids)
        elif tur == 'premium':
            premium = PremiumPaket.objects.filter(id=pid).first()
            if not premium:
                continue
            ek_ids, deneme_ids, yayin_ids = resolve_premium_paket_inclusions(premium, **kwargs)
            desired_ek.update(ek_ids)
            _retain_included_denemeler(desired_paket, desired_ek, deneme_ids, sozlesme)
            desired_paket.update(('yayin', i) for i in yayin_ids)
        elif tur == 'deneme':
            _retain_included_denemeler(desired_paket, desired_ek, [pid], sozlesme)


def _ensure_ek_hizmet(sozlesme, item, result, *, dry_run):
    from apps.egitim_paketleri.models import EkHizmet

    ek = EkHizmet.objects.filter(id=item['kalem_id']).first()
    if not ek:
        result['missing_catalog'].append(f"ek_hizmet:{item['kalem_id']}")
        return
    if _open_ogrenci_ek_hizmet(sozlesme, ek, fiyat=item['net_tutar'] or ek.brut_fiyat, dry_run=dry_run):
        result['created_ek_hizmet'].append(ek.ad or item['adi'])


def _ensure_deneme(sozlesme, item, result, *, dry_run, include_children=True):
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

    if not include_children:
        return
    for dahil in deneme.dahil_ek_hizmetler.filter(aktif_mi=True).exclude(hizmet_turu='deneme'):
        if _open_ogrenci_ek_hizmet(
            sozlesme, dahil, fiyat=0, dahil_mi=True, kaynak='deneme', kaynak_id=deneme.id, dry_run=dry_run,
        ):
            result['created_ek_hizmet'].append(dahil.ad)


def _ensure_grup_dersi(sozlesme, item, result, *, dry_run, live_inclusions=True):
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
    if not live_inclusions:
        return

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


def _ensure_premium(sozlesme, item, result, *, user, dry_run, live_inclusions=True):
    from apps.egitim_paketleri.models import PremiumPaket
    from apps.ogrenci_kayit.application.services import attach_premium_paket_inclusions
    from apps.ozel_ders.services.sync_service import ensure_program_from_sozlesme_kalem

    premium = PremiumPaket.objects.filter(id=item['kalem_id']).first()
    if not premium:
        result['missing_catalog'].append(f"premium:{item['kalem_id']}")
        return
    if _ensure_egitim_paketi(sozlesme, 'premium', premium.id, premium.ad or item['adi'], dry_run=dry_run):
        result['created_paket'].append(premium.ad or item['adi'])
    if not live_inclusions or dry_run:
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

    year_id = sozlesme.egitim_yili_id
    if OgrenciEkHizmet.objects.filter(
        ogrenci_id=sozlesme.ogrenci_id,
        ek_hizmet=ek,
        aktif_mi=True,
        egitim_yili_id=year_id,
    ).exists():
        return False
    if dry_run:
        return True

    inactive = (
        OgrenciEkHizmet.objects.filter(
            ogrenci_id=sozlesme.ogrenci_id,
            ek_hizmet=ek,
            aktif_mi=False,
            egitim_yili_id=year_id,
        )
        .order_by('-id')
        .first()
    )
    if inactive:
        inactive.aktif_mi = True
        inactive.egitim_yili_id = year_id
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
