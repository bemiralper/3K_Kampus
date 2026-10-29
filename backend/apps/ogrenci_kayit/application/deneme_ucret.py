"""Günü birlik kayıttaki deneme ücreti.

Tutar, öğrencinin finansında deneme sözleşmesi olarak durur. Para alındığında
normal gelir kaydıyla aynı yol izlenir: ödeme şekli ve mali hesap seçilir,
GelirKaydi + GelirTahsilat kasaya tek hareket yazar. Sözleşme tahsilatı
ayrıca açılmaz; gün sonu ve kasa aynı parayı iki kez saymasın.
"""
from __future__ import annotations

import re
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

MARKER = 'gunu_birlik_deneme_ucreti'
_GELIR_REF = re.compile(r'gelir:(\d+)')


def parse_deneme_ucreti(raw) -> int | None:
    """Boş değer ücret yok demektir. Doluysa tam sayı TL."""
    if raw is None:
        return None
    text = str(raw).strip().replace(' ', '').replace('₺', '').replace('TL', '').replace('tl', '')
    if text == '':
        return None
    if ',' in text:
        whole, frac = text.split(',', 1)
        if frac.strip('0') != '':
            raise ValueError('Deneme ücreti tam sayı olmalıdır.')
        text = whole
    text = text.replace('.', '')
    if not text.isdigit():
        raise ValueError('Deneme ücreti tam sayı olmalıdır.')
    return int(text)


def last_deneme_ucreti(kurum_id: int, tc_kimlik_no: str) -> int | None:
    from apps.odeme_takip.domain.models import Sozlesme
    from apps.ogrenci.domain.models import Ogrenci

    tc = (tc_kimlik_no or '').strip()
    if not tc:
        return None
    student_ids = Ogrenci.objects.filter(
        kurum_id=kurum_id, tc_kimlik_no=tc,
    ).values_list('id', flat=True)
    tutar = (
        Sozlesme.objects.filter(
            ogrenci_id__in=student_ids,
            notlar__contains=MARKER,
        )
        .order_by('-id')
        .values_list('net_tutar', flat=True)
        .first()
    )
    if tutar is None:
        return None
    return int(tutar)


def deneme_odeme_secenekleri(kurum_id: int, sube_id: int) -> dict:
    """Nakit, POS ve havale gibi kasaya işlenen ödeme şekilleri."""
    from apps.finans.constants.payment_types import OdemeYontemiTipi
    from apps.finans.domain.financial_account import MaliHesap
    from apps.finans.domain.payment_method import OdemeYontemi

    yontemler = (
        OdemeYontemi.objects.filter(
            kurum_id=kurum_id, aktif_mi=True, mali_hesap__sube_id=sube_id,
        )
        .exclude(tip__in=[OdemeYontemiTipi.CEK, OdemeYontemiTipi.SENET])
        .select_related('mali_hesap')
        .order_by('ad')
    )
    hesaplar = (
        MaliHesap.objects.filter(sube_id=sube_id, aktif_mi=True)
        .order_by('siralama', 'ad')
    )
    return {
        'odeme_yontemleri': [
            {
                'id': yontem.id,
                'ad': (
                    f'{yontem.ad} · {yontem.mali_hesap.ad}'
                    if yontem.mali_hesap_id else yontem.ad
                ),
                'tip': yontem.tip,
                'mali_hesap_id': yontem.mali_hesap_id,
            }
            for yontem in yontemler
        ],
        'mali_hesaplar': [
            {'id': hesap.id, 'ad': hesap.ad, 'tip': hesap.tip}
            for hesap in hesaplar
        ],
    }


def _cozumle_odeme(ogrenci, odeme_yontemi_id, mali_hesap_id):
    from apps.finans.application.cek_senet.cek_senet_helpers import is_cek_senet_yontemi
    from apps.finans.domain.financial_account import MaliHesap
    from apps.finans.domain.payment_method import OdemeYontemi

    try:
        yontem_id = int(odeme_yontemi_id)
    except (TypeError, ValueError):
        raise ValueError('Ödeme şekli seçin.')
    yontem = (
        OdemeYontemi.objects.filter(id=yontem_id, kurum_id=ogrenci.kurum_id, aktif_mi=True)
        .select_related('mali_hesap')
        .first()
    )
    if yontem is None:
        raise ValueError('Ödeme şekli bulunamadı.')
    if is_cek_senet_yontemi(yontem):
        raise ValueError('Çek ve senet deneme ücretinde kullanılamaz.')
    hesap_id = mali_hesap_id or yontem.mali_hesap_id
    try:
        hesap_id = int(hesap_id)
    except (TypeError, ValueError):
        raise ValueError('Mali hesap seçin.')
    hesap = MaliHesap.objects.filter(
        id=hesap_id, sube_id=ogrenci.sube_id, aktif_mi=True,
    ).first()
    if hesap is None:
        raise ValueError('Mali hesap bu şubeye ait değil.')
    return yontem, hesap


def _deneme_cari(ogrenci):
    from apps.finans.constants.cari_types import CariHesapTuru
    from apps.finans.domain.cari_hesap import CariHesap

    tc = (ogrenci.tc_kimlik_no or '').strip()
    cari = None
    if tc:
        cari = (
            CariHesap.objects.filter(sube_id=ogrenci.sube_id, vergi_no=tc, aktif_mi=True)
            .exclude(hesap_turu=CariHesapTuru.TEDARIKCI)
            .order_by('id')
            .first()
        )
    kod = f'DNM-{ogrenci.id}'
    if cari is None:
        cari = CariHesap.objects.filter(
            sube_id=ogrenci.sube_id, hesap_kodu=kod, aktif_mi=True,
        ).exclude(hesap_turu=CariHesapTuru.TEDARIKCI).first()
    if cari is not None:
        return cari
    ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip() or 'Tek deneme'
    return CariHesap.objects.create(
        kurum_id=ogrenci.kurum_id,
        sube_id=ogrenci.sube_id,
        unvan=ad,
        kisa_ad=ad[:100],
        hesap_turu=CariHesapTuru.MUSTERI,
        hesap_kodu=kod,
        vergi_no=tc[:20],
        telefon=(ogrenci.telefon or '')[:20],
    )


def _deneme_kategori(ogrenci):
    from apps.finans.domain.gelir_kategorisi import GelirKategorisi

    kategori = GelirKategorisi.objects.filter(
        sube_id=ogrenci.sube_id, parent__isnull=True, ad='Deneme ücreti', aktif_mi=True,
    ).first()
    if kategori is not None:
        return kategori
    return GelirKategorisi.objects.create(
        kurum_id=ogrenci.kurum_id,
        sube_id=ogrenci.sube_id,
        ad='Deneme ücreti',
        aciklama='Tek deneme kaydında alınan ücret.',
    )


def _gelir_id(notlar: str) -> int | None:
    match = _GELIR_REF.search(notlar or '')
    return int(match.group(1)) if match else None


def record_deneme_ucreti(
    *,
    ogrenci,
    kayit,
    exam,
    tutar: int,
    user=None,
    odeme_yontemi_id=None,
    mali_hesap_id=None,
) -> None:
    from apps.odeme_takip.domain.enums import (
        EgitimTuru,
        OdemeTuru,
        PaketTuru,
        SozlesmeDurum,
    )
    from apps.odeme_takip.domain.models import Sozlesme

    today = timezone.localdate()
    veli = ogrenci.veliler.order_by('-varsayilan', 'id').first()
    actor = user if getattr(user, 'is_authenticated', False) else None
    # sozlesme_no en fazla 20 karakter.
    sozlesme_no = f'D{timezone.now().strftime("%y%m%d%H%M%S")}{ogrenci.id % 1000:03d}'
    yontem = None
    hesap = None
    if tutar > 0:
        yontem, hesap = _cozumle_odeme(ogrenci, odeme_yontemi_id, mali_hesap_id)

    with transaction.atomic():
        sozlesme = Sozlesme.objects.create(
            sozlesme_no=sozlesme_no,
            ogrenci=ogrenci,
            ogrenci_kayit=kayit,
            egitim_yili_id=kayit.egitim_yili_id,
            kurum_id=ogrenci.kurum_id,
            sube_id=ogrenci.sube_id,
            veli=veli,
            baslangic_tarihi=today,
            bitis_tarihi=exam.exam_date or today,
            paket_turu=PaketTuru.DENEME,
            paket_id=exam.id,
            paket_adi=exam.name or 'Deneme',
            brut_tutar=tutar,
            kdv_orani=0,
            kdv_tutari=0,
            kdv_dahil_tutar=tutar,
            net_tutar=tutar,
            odeme_turu=OdemeTuru.PESIN,
            taksit_sayisi=1,
            durum=SozlesmeDurum.TAMAMLANDI,
            egitim_turu=EgitimTuru.DIGER,
            odeme_yontemi=yontem,
            mali_hesap=hesap,
            notlar=MARKER,
            olusturan=actor,
        )
        if tutar <= 0:
            return
        _deneme_geliri_yaz(
            sozlesme=sozlesme,
            ogrenci=ogrenci,
            exam=exam,
            tutar=tutar,
            yontem=yontem,
            hesap=hesap,
            today=today,
            actor=actor,
        )


def ensure_deneme_izi(*, ogrenci, kayit) -> None:
    """Kurum kaydına geçen deneme öğrencisinin deneme sayfasında kalması için iz.

    Ücret sözleşmesi varsa yeni satır açılmaz. Ücret yoksa finans toplamına
    girmeyen, tutarı 0 olan bir iz bırakılır.
    """
    from apps.odeme_takip.domain.enums import EgitimTuru, OdemeTuru, PaketTuru, SozlesmeDurum
    from apps.odeme_takip.domain.models import Sozlesme

    if Sozlesme.objects.filter(ogrenci=ogrenci, notlar__contains=MARKER).exists():
        return
    today = timezone.localdate()
    Sozlesme.objects.create(
        sozlesme_no=f'I{timezone.now().strftime("%y%m%d%H%M%S")}{ogrenci.id % 1000:03d}',
        ogrenci=ogrenci,
        ogrenci_kayit=kayit,
        egitim_yili_id=kayit.egitim_yili_id,
        kurum_id=ogrenci.kurum_id,
        sube_id=ogrenci.sube_id,
        baslangic_tarihi=today,
        bitis_tarihi=today,
        paket_turu=PaketTuru.DENEME,
        paket_adi='',
        brut_tutar=0,
        kdv_orani=0,
        kdv_tutari=0,
        kdv_dahil_tutar=0,
        net_tutar=0,
        odeme_turu=OdemeTuru.PESIN,
        taksit_sayisi=1,
        durum=SozlesmeDurum.TAMAMLANDI,
        egitim_turu=EgitimTuru.DIGER,
        notlar=MARKER,
    )


def _deneme_geliri_yaz(*, sozlesme, ogrenci, exam, tutar, yontem, hesap, today, actor):
    from apps.finans.application.finans_v2.kdv import KDV_MUAF
    from apps.finans.application.gelir_service import GelirService
    from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService

    cari = _deneme_cari(ogrenci)
    kategori = _deneme_kategori(ogrenci)
    ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
    aciklama = f'{ad} — {exam.name or "Deneme"} deneme ücreti'
    gelir, errors = GelirService().create({
        'kurum_id': ogrenci.kurum_id,
        'sube_id': ogrenci.sube_id,
        'cari_hesap_id': cari.id,
        'gelir_kategorisi_id': kategori.id,
        'mali_hesap_id': hesap.id,
        'odeme_yontemi_id': yontem.id,
        'egitim_yili_id': sozlesme.egitim_yili_id,
        'fatura_tarihi': today,
        'vade_tarihi': today,
        'aciklama': aciklama,
        'brut_tutar': Decimal(tutar),
        'kdv_orani': 0,
        'kdv_mod': KDV_MUAF,
        'olusturan': actor,
    })
    if errors:
        raise ValueError(errors.get('genel') or next(iter(errors.values())))
    tahsilat, tahsil_err = GelirTahsilatService().tahsilat_yap({
        'gelir_kaydi_id': gelir.pk,
        'odeme_yontemi_id': yontem.id,
        'mali_hesap_id': hesap.id,
        'tutar': Decimal(tutar),
        'tahsilat_tarihi': today,
        'aciklama': aciklama,
        'islem_yapan': actor,
    })
    if tahsil_err:
        raise ValueError(tahsil_err.get('genel') or next(iter(tahsil_err.values())))
    sozlesme.notlar = f'{MARKER} gelir:{gelir.pk}'
    sozlesme.save(update_fields=['notlar'])
    return tahsilat


def void_deneme_ucreti(*, ogrenci, exam) -> int:
    """Deneme iptalinde sözleşmeyi ve buna bağlı gelir tahsilatını kapatır.

    Gelir tahsilatı varsa kasa hareketi de geri alınır.
    """
    from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum
    from apps.odeme_takip.domain.models import Sozlesme, Tahsilat

    closed = 0
    contracts = Sozlesme.objects.filter(
        ogrenci=ogrenci,
        paket_id=exam.id,
        notlar__contains=MARKER,
    ).exclude(durum=SozlesmeDurum.IPTAL)
    now = timezone.now()
    for sozlesme in contracts:
        _iptal_deneme_geliri(sozlesme)
        Tahsilat.objects.filter(sozlesme=sozlesme, durum=TahsilatDurum.AKTIF).update(
            durum=TahsilatDurum.IPTAL_EDILDI,
            iptal_nedeni='Deneme kaydı iptal edildi.',
            iptal_tarihi=now,
        )
        sozlesme.durum = SozlesmeDurum.IPTAL
        sozlesme.save(update_fields=['durum', 'updated_at'])
        closed += 1
    return closed


def _iptal_deneme_geliri(sozlesme) -> None:
    gelir_id = _gelir_id(sozlesme.notlar)
    if not gelir_id:
        return
    from apps.finans.application.gelir_service import GelirService

    _, err = GelirService().iptal_et(gelir_id, force=True)
    if not err:
        return
    mesaj = str((err or {}).get('genel') or '')
    if 'zaten iptal' in mesaj:
        return
    raise ValueError(mesaj or 'Deneme geliri iptal edilemedi.')
