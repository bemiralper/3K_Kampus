"""Tahsilattan e-belge önizlemesi ve Uyumsoft taslağı."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from django.utils import timezone as dj_timezone

from apps.communication.application.token_crypto import decrypt_access_token
from apps.finans.application.e_belge_ubl import build_invoice_children
from apps.finans.application.fatura_bilesen import bilesen_kalemleri
from apps.finans.application.fatura_hesap import dagit_bilesenler, satir_from_brut, toplamlar
from apps.finans.domain.e_belge import EBelge, EBelgeDurum, EBelgeTipi
from apps.finans.domain.uyumsoft_ayar import UyumsoftAyar
from apps.finans.infrastructure.uyumsoft_client import (
    UyumsoftError,
    is_e_invoice_user,
    receiver_alias,
    cancel_draft,
    save_as_draft,
)
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru


def onizleme(tahsilat, overrides: dict | None = None) -> dict:
    _assert_tahsilat(tahsilat)
    satirlar, totals = _satirlar(tahsilat)
    alici = _alici(tahsilat, overrides or {})
    eksikler = _eksikler(tahsilat, alici)
    mevcut = _ozet(_belge(tahsilat))
    taslak_gonderildi = bool(mevcut and mevcut['durum'] == EBelgeDurum.UYUMSOFT_TASLAK)
    tespit = {'belge_tipi': None, 'alias': '', 'mukellef': None, 'uyari': ''}
    if not eksikler and not taslak_gonderildi:
        tespit = _tespit(tahsilat, alici['vkn'])
        if tespit.get('uyari'):
            eksikler.append(tespit['uyari'])
    elif taslak_gonderildi and mevcut:
        tespit = {
            'belge_tipi': mevcut['belge_tipi'],
            'alias': '',
            'mukellef': mevcut['belge_tipi'] == EBelgeTipi.EFATURA,
            'uyari': '',
        }
    ogrenci = tahsilat.sozlesme.ogrenci
    return {
        'tahsilat_id': tahsilat.id,
        'sozlesme_no': tahsilat.sozlesme.sozlesme_no,
        'ogrenci_adi': f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
        'paket_adi': tahsilat.sozlesme.paket_adi or '',
        'tahsilat_tarihi': tahsilat.tahsilat_tarihi.isoformat(),
        'odeme': _num(tahsilat.tutar),
        'satirlar': [_public_line(line, tahsilat.tutar) for line in satirlar],
        'matrah': _num(totals['matrah']),
        'kdv': _num(totals['kdv']),
        'odenecek': _num(totals['odenecek']),
        'alici': alici,
        'belge_tipi': tespit.get('belge_tipi'),
        'alici_alias': tespit.get('alias') or '',
        'e_fatura_mukellefi': tespit.get('mukellef'),
        'eksikler': eksikler,
        'gonderilebilir': not eksikler and not taslak_gonderildi,
        'mevcut': mevcut,
        'portal_url': _portal(tahsilat),
    }


def gonder(tahsilat, user, overrides: dict | None = None) -> dict:
    _assert_tahsilat(tahsilat)
    mevcut = _belge(tahsilat)
    if mevcut and mevcut.durum == EBelgeDurum.UYUMSOFT_TASLAK:
        payload = onizleme(tahsilat, overrides)
        payload['mevcut'] = _ozet(mevcut)
        payload['gonderilebilir'] = False
        return payload

    posted = (overrides or {}).get('satirlar')
    if posted:
        satirlar, totals = _satirlar_from_client(tahsilat, posted)
    else:
        satirlar, totals = None, None

    preview = onizleme(tahsilat, overrides)
    if preview['eksikler']:
        raise UyumsoftError(preview['eksikler'][0])

    ayar = _ayar(tahsilat)
    password = decrypt_access_token(ayar.sifre_encrypted)
    if satirlar is None:
        satirlar, totals = _satirlar(tahsilat)
    alici = preview['alici']
    belge_tipi = preview['belge_tipi']
    alias = preview['alici_alias']
    belge = mevcut or EBelge(tahsilat=tahsilat, kurum_id=tahsilat.sozlesme.kurum_id, ettn=uuid.uuid4())
    yerel_no = belge.yerel_no or _yerel_no(tahsilat)
    issue = tahsilat.tahsilat_tarihi.isoformat()
    supplier = _supplier(tahsilat, ayar)
    customer = {
        'kisi': len(alici['vkn']) == 11,
        'ad': alici['ad'],
        'soyad': alici['soyad'],
        'unvan': alici['unvan'],
        'vkn': alici['vkn'],
        'adres': alici['adres'],
        'il': alici['il'],
        'ilce': alici['ilce'],
    }
    note = (
        f'{tahsilat.sozlesme.sozlesme_no} tahsilatının eğitim bedeli payı. '
        'Onay Uyumsoft portalında verilir.'
    )
    invoice_xml = build_invoice_children(
        belge_tipi=belge_tipi,
        yerel_no=yerel_no,
        ettn=str(belge.ettn),
        issue_date=issue,
        note=note,
        supplier=supplier,
        customer=customer,
        satirlar=satirlar,
        matrah=totals['matrah'],
        kdv=totals['kdv'],
        odenecek=totals['odenecek'],
    )
    scenario = 'eInvoice' if belge_tipi == EBelgeTipi.EFATURA else 'eArchive'
    created = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
    try:
        result = save_as_draft(
            ayar.web_servis_url,
            ayar.kullanici_adi,
            password,
            invoice_xml=invoice_xml,
            local_document_id=str(belge.ettn),
            vkn_tckn=alici['vkn'],
            title=alici['unvan'],
            alias=alias,
            scenario=scenario,
            create_date_utc=created,
        )
    except UyumsoftError as exc:
        _kaydet(belge, user, belge_tipi, yerel_no, alici, alias, satirlar, totals, hata=str(exc))
        raise

    _kaydet(
        belge, user, belge_tipi, yerel_no, alici, alias, satirlar, totals,
        uyumsoft_no=result.get('number') or '',
        hata='',
        basarili=True,
    )
    tahsilat.e_belge = belge
    payload = onizleme(tahsilat, overrides)
    payload['mevcut'] = _ozet(belge)
    payload['gonderilebilir'] = False
    return payload


def iptal(tahsilat, user) -> dict:
    """Uyumsoft taslağını düşürür; tahsilat yeniden faturalanabilir."""
    _assert_tahsilat(tahsilat)
    belge = _belge(tahsilat)
    if belge is None or belge.durum != EBelgeDurum.UYUMSOFT_TASLAK:
        raise UyumsoftError('İptal edilecek gönderilmiş fatura yok.')
    ayar = _ayar(tahsilat)
    password = decrypt_access_token(ayar.sifre_encrypted)
    cancel_draft(
        ayar.web_servis_url,
        ayar.kullanici_adi,
        password,
        str(belge.ettn),
    )
    belge.delete()
    tahsilat.__dict__.pop('e_belge', None)
    return onizleme(tahsilat, None)


def serialize_ozet(tahsilat) -> dict | None:
    return _ozet(_belge(tahsilat))


def _satirlar(tahsilat):
    belge = _belge(tahsilat)
    if belge and belge.durum == EBelgeDurum.UYUMSOFT_TASLAK and belge.satirlar:
        lines = []
        for row in belge.satirlar:
            line = satir_from_brut(row.get('ad') or 'Eğitim bedeli', row.get('brut') or 0, row.get('kdv_orani') or 0)
            line['katalog'] = row.get('katalog') or line['brut']
            lines.append(line)
        return lines, toplamlar(lines)
    satirlar = dagit_bilesenler(bilesen_kalemleri(tahsilat.sozlesme), tahsilat.tutar)
    return satirlar, toplamlar(satirlar)


def _satirlar_from_client(tahsilat, raw):
    if not isinstance(raw, list) or not raw:
        raise UyumsoftError('Fatura kalemi gerekli.')
    pay = Decimal(str(tahsilat.tutar)).quantize(Decimal('0.01'))
    lines = []
    for item in raw:
        if not isinstance(item, dict):
            raise UyumsoftError('Kalem biçimi hatalı.')
        ad = str(item.get('ad') or '').strip()
        if not ad:
            continue
        try:
            rate = int(item.get('kdv_orani') or 0)
        except (TypeError, ValueError):
            raise UyumsoftError('KDV oranı 0, 10 veya 20 olabilir.')
        if rate not in (0, 10, 20):
            raise UyumsoftError('KDV oranı 0, 10 veya 20 olabilir.')
        brut = Decimal(str(item.get('brut') or 0)).quantize(Decimal('0.01'))
        if brut < 0:
            raise UyumsoftError('Kalem tutarı negatif olamaz.')
        if brut == 0:
            continue
        line = satir_from_brut(ad[:200], brut, rate)
        line['katalog'] = item.get('katalog') or 0
        lines.append(line)
    if not lines:
        raise UyumsoftError('En az bir kalemin tutarı olmalı.')
    totals = toplamlar(lines)
    if totals['odenecek'] != pay:
        raise UyumsoftError(f'Kalem toplamı tahsilat tutarına eşit olmalı ({pay} TL).')
    return lines, totals


def _alici(tahsilat, overrides: dict) -> dict:
    sozlesme = tahsilat.sozlesme
    ogrenci = sozlesme.ogrenci
    veli = sozlesme.veli if getattr(sozlesme, 'veli_id', None) else None
    if veli is None or not (veli.tc_kimlik_no or '').strip():
        for candidate in ogrenci.veliler.all():
            if (candidate.tc_kimlik_no or '').strip():
                veli = candidate
                break
    if veli and (veli.tc_kimlik_no or '').strip():
        ad, soyad, vkn = veli.ad, veli.soyad, veli.tc_kimlik_no.strip()
        email = veli.email or ''
    else:
        ad, soyad = ogrenci.ad, ogrenci.soyad
        vkn = (ogrenci.tc_kimlik_no or '').strip()
        email = ogrenci.email or ''
    adres_kaydi = None
    adresler = list(ogrenci.adresler.all()) if hasattr(ogrenci, 'adresler') else []
    for row in adresler:
        if row.varsayilan:
            adres_kaydi = row
            break
    if adres_kaydi is None and adresler:
        adres_kaydi = adresler[0]
    adres = (adres_kaydi.adres if adres_kaydi else '') or (ogrenci.adres or '')
    il = (adres_kaydi.il if adres_kaydi else '') or ''
    ilce = (adres_kaydi.ilce if adres_kaydi else '') or ''
    adres = (overrides.get('adres') or adres or '').strip()
    il = (overrides.get('il') or il or '').strip()
    ilce = (overrides.get('ilce') or ilce or '').strip()
    email = (overrides.get('eposta') or email or '').strip()
    return {
        'ad': (ad or '').strip(),
        'soyad': (soyad or '').strip(),
        'unvan': f'{(ad or "").strip()} {(soyad or "").strip()}'.strip(),
        'vkn': ''.join(ch for ch in vkn if ch.isdigit()),
        'adres': adres,
        'il': il,
        'ilce': ilce,
        'eposta': email,
    }


def _supplier(tahsilat, ayar) -> dict:
    kurum = tahsilat.sozlesme.kurum
    street, ilce, il = _split_adres(kurum.adres)
    return {
        'kisi': False,
        'unvan': kurum.gorunen_ad or kurum.ad,
        'vkn': ayar.vkn,
        'adres': street,
        'il': il,
        'ilce': ilce,
        'vergi_dairesi': kurum.vergi_dairesi or 'Vergi Dairesi',
    }


def _split_adres(adres: str) -> tuple[str, str, str]:
    text = (adres or '').strip() or 'Adres belirtilmedi'
    ilce, il = 'Merkez', 'Merkez'
    if '/' in text:
        left, right = text.rsplit('/', 1)
        il = right.strip() or il
        words = left.replace(',', ' ').split()
        if words:
            ilce = words[-1]
        text = left.strip() or text
    return text, ilce, il


def _eksikler(tahsilat, alici: dict) -> list[str]:
    missing = []
    ayar = UyumsoftAyar.objects.filter(kurum_id=tahsilat.sozlesme.kurum_id, aktif=True).first()
    if ayar is None or not ayar.sifre_encrypted:
        missing.append('Bu kurumun Uyumsoft ayarı kayıtlı değil.')
    if len(alici['vkn']) not in (10, 11):
        missing.append('Alıcının TCKN veya VKN bilgisi yok.')
    if not alici['ad'] or not alici['soyad']:
        missing.append('Alıcı adı ve soyadı zorunlu.')
    if not alici['adres'] or not alici['il'] or not alici['ilce']:
        missing.append('Fatura adresi, il ve ilçe zorunlu.')
    return missing


def _tespit(tahsilat, vkn: str) -> dict:
    ayar = _ayar(tahsilat)
    password = decrypt_access_token(ayar.sifre_encrypted)
    try:
        mukellef = is_e_invoice_user(ayar.web_servis_url, ayar.kullanici_adi, password, vkn)
    except UyumsoftError as exc:
        return {'belge_tipi': None, 'alias': '', 'mukellef': None, 'uyari': str(exc)}
    if not mukellef:
        return {'belge_tipi': EBelgeTipi.EARSIV, 'alias': '', 'mukellef': False, 'uyari': ''}
    try:
        alias = receiver_alias(ayar.web_servis_url, ayar.kullanici_adi, password, vkn)
    except UyumsoftError as exc:
        return {'belge_tipi': None, 'alias': '', 'mukellef': True, 'uyari': str(exc)}
    if not alias:
        return {
            'belge_tipi': None,
            'alias': '',
            'mukellef': True,
            'uyari': 'Alıcı e-fatura mükellefi ama posta kutusu etiketi bulunamadı.',
        }
    return {'belge_tipi': EBelgeTipi.EFATURA, 'alias': alias, 'mukellef': True, 'uyari': ''}


def _assert_tahsilat(tahsilat):
    if tahsilat.durum != TahsilatDurum.AKTIF:
        raise UyumsoftError('Yalnızca aktif tahsilat faturalanır.')
    if tahsilat.tahsilat_turu == TahsilatTuru.IADE:
        raise UyumsoftError('İade tahsilatı faturalanmaz.')


def _ayar(tahsilat) -> UyumsoftAyar:
    ayar = UyumsoftAyar.objects.filter(kurum_id=tahsilat.sozlesme.kurum_id, aktif=True).first()
    if ayar is None or not ayar.sifre_encrypted:
        raise UyumsoftError('Bu kurumun Uyumsoft ayarı kayıtlı değil.')
    return ayar


def _portal(tahsilat) -> str:
    ayar = UyumsoftAyar.objects.filter(kurum_id=tahsilat.sozlesme.kurum_id).first()
    if ayar and ayar.portal_url:
        return ayar.portal_url
    return 'https://edonusum.uyum.com.tr'


def _belge(tahsilat):
    try:
        return tahsilat.e_belge
    except EBelge.DoesNotExist:
        return None


def _yerel_no(tahsilat) -> str:
    year = tahsilat.tahsilat_tarihi.year
    return f'LMS{year}{int(tahsilat.id):09d}'


def _kaydet(belge, user, belge_tipi, yerel_no, alici, alias, satirlar, totals, *,
            uyumsoft_no='', hata='', basarili=False):
    belge.belge_tipi = belge_tipi or EBelgeTipi.EARSIV
    belge.yerel_no = yerel_no
    belge.uyumsoft_no = uyumsoft_no
    belge.alici_unvan = alici['unvan']
    belge.alici_vkn = alici['vkn']
    belge.alici_alias = alias or ''
    belge.satirlar = [_public_line(line, belge.tahsilat.tutar) for line in satirlar]
    belge.matrah = totals['matrah']
    belge.kdv_tutari = totals['kdv']
    belge.odenecek = totals['odenecek']
    belge.hata_mesaji = hata
    belge.durum = EBelgeDurum.UYUMSOFT_TASLAK if basarili else EBelgeDurum.HATA
    belge.gonderen = user if getattr(user, 'is_authenticated', False) else None
    belge.gonderim_tarihi = dj_timezone.now()
    belge.save()


def _ozet(belge) -> dict | None:
    if belge is None or not belge.pk:
        return None
    return {
        'durum': belge.durum,
        'belge_tipi': belge.belge_tipi,
        'ettn': str(belge.ettn),
        'yerel_no': belge.yerel_no,
        'uyumsoft_no': belge.uyumsoft_no,
        'hata_mesaji': belge.hata_mesaji,
    }


def _public_line(line: dict, odeme=None) -> dict:
    brut = Decimal(str(line['brut']))
    pay = Decimal(str(odeme)) if odeme is not None else Decimal('0')
    yuzde = (brut / pay * Decimal('100')) if pay > 0 else Decimal('0')
    return {
        'ad': line['ad'],
        'kdv_orani': int(line['kdv_orani']),
        'matrah': _num(line['matrah']),
        'kdv': _num(line['kdv']),
        'brut': _num(line['brut']),
        'yuzde': _num(yuzde),
        'katalog': _num(line.get('katalog') or 0),
    }


def _num(value) -> str:
    return f'{Decimal(str(value)).quantize(Decimal("0.01")):.2f}'
