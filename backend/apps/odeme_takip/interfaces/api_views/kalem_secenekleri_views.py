"""
Kalem Seçenekleri Views
Sözleşmeye eklenebilecek paket/ek hizmet seçeneklerini listeler.

Integer-Only: Tüm fiyatlar tam sayı (TL).
"""
from rest_framework.decorators import api_view, permission_classes
from apps.odeme_takip.permissions import ODEME_TAKIP_PERMISSIONS
from rest_framework.response import Response

from apps.odeme_takip.domain.enums import KalemTuru, PaketTuru, SozlesmeDurum
from apps.ogrenci_kayit.application.enrollment_context import (
    resolve_kayit_alan_id,
    resolve_kayit_sinif_seviyesi_id,
)
from apps.ogrenci_kayit.application.services import (
    _apply_grup_alan_filter,
    _apply_ozel_alan_filter,
    _apply_sinif_seviyesi_filter,
)
from apps.odeme_takip.interfaces.sube_context import resolve_mandatory_odeme_context


def _serialize_secenek(item, kod=""):
    """Frontend KalemSecenegi formatına dönüştür."""
    payload = {
        "id": item.id,
        "ad": item.ad,
        "kod": kod or getattr(item, "kod", "") or "",
        "fiyat": item.brut_fiyat,
        "kdv_orani": item.kdv_orani,
        "kdv_tutari": item.kdv_tutari,
        "kdv_dahil_fiyat": item.brut_fiyat,
        "hizmet_turu": getattr(item, "hizmet_turu", None),
    }
    if hasattr(item, "alan_id"):
        payload["alan_id"] = item.alan_id
    return payload


from apps.ogrenci_kayit.application.package_selection import serialize_dahil_detay


def _paket_dahil_detay(paket_turu, paket_obj, inclusion_kwargs):
    tur = "grup_dersi" if paket_turu == PaketTuru.GRUP_DERSI else "premium"
    return serialize_dahil_detay(paket_obj, tur, inclusion_kwargs)


def _classify_kalem_paket_turu(kalem, sozlesme=None):
    """Sözleşme kaleminin paket alt türünü belirle (grup / özel / deneme)."""
    from apps.egitim_paketleri.models import Deneme, GrupDersi, OzelDers, PremiumPaket

    tur = kalem.kalem_turu
    if tur in (KalemTuru.GRUP_DERSI, PaketTuru.GRUP_DERSI):
        return PaketTuru.GRUP_DERSI
    if tur in (KalemTuru.OZEL_DERS, PaketTuru.OZEL_DERS):
        return PaketTuru.OZEL_DERS
    if tur in (KalemTuru.DENEME, PaketTuru.DENEME):
        return PaketTuru.DENEME
    if tur in (KalemTuru.PREMIUM, PaketTuru.PREMIUM):
        return PaketTuru.PREMIUM

    if tur == KalemTuru.PAKET and sozlesme:
        if sozlesme.paket_id == kalem.kalem_id and sozlesme.paket_turu in (
            PaketTuru.GRUP_DERSI,
            PaketTuru.OZEL_DERS,
            PaketTuru.DENEME,
        ):
            return sozlesme.paket_turu

    kid = kalem.kalem_id
    if GrupDersi.objects.filter(id=kid).exists():
        return PaketTuru.GRUP_DERSI
    if OzelDers.objects.filter(id=kid).exists():
        return PaketTuru.OZEL_DERS
    if Deneme.objects.filter(id=kid).exists():
        return PaketTuru.DENEME
    if PremiumPaket.objects.filter(id=kid).exists():
        return PaketTuru.PREMIUM
    return None


def _deneme_net_tutar(sozlesme, kalem=None):
    """Sözleşmedeki deneme kaleminin net tutarını bul."""
    if kalem is not None:
        return kalem.net_tutar or 0
    from apps.odeme_takip.domain.models import SozlesmeKalemi

    for k in SozlesmeKalemi.objects.filter(sozlesme=sozlesme):
        if _classify_kalem_paket_turu(k, sozlesme) == PaketTuru.DENEME:
            return k.net_tutar or 0
    if sozlesme.paket_id and sozlesme.paket_turu == PaketTuru.DENEME:
        paket_kalem = SozlesmeKalemi.objects.filter(
            sozlesme=sozlesme,
            kalem_id=sozlesme.paket_id,
        ).first()
        if paket_kalem:
            return paket_kalem.net_tutar or 0
    return 0


def _serialize_mevcut_kalem(kalem):
    return {
        "kalem_id": kalem.kalem_id,
        "kalem_adi": kalem.kalem_adi,
        "net_tutar": kalem.net_tutar or 0,
        "ucretsiz": (kalem.net_tutar or 0) == 0,
    }


def _collect_mevcut_paketler(ogrenci_id, egitim_yili_id, sozlesme_id=None):
    """
    Tür bazlı sahip olunan paket ID'leri.
    Grup / özel / deneme ID'leri karıştırılmaz (farklı tablolarda aynı sayısal ID olabilir).
    """
    from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi

    haric_grup = set()
    haric_ozel = set()
    haric_deneme = set()
    haric_premium = set()
    haric_ek = set()
    mevcut_grup = None
    mevcut_deneme = None

    if not ogrenci_id:
        return haric_grup, haric_ozel, haric_deneme, haric_premium, haric_ek, mevcut_grup, mevcut_deneme

    aktif_durumlar = [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS]
    sozlesme_qs = Sozlesme.objects.filter(ogrenci_id=ogrenci_id, durum__in=aktif_durumlar)
    if egitim_yili_id:
        sozlesme_qs = sozlesme_qs.filter(egitim_yili_id=egitim_yili_id)

    target_sozlesme = None
    if sozlesme_id:
        target_sozlesme = sozlesme_qs.filter(id=sozlesme_id).first()

    for sozlesme in sozlesme_qs:
        is_target = target_sozlesme and sozlesme.id == target_sozlesme.id

        if sozlesme.paket_id and sozlesme.paket_turu == PaketTuru.GRUP_DERSI:
            haric_grup.add(sozlesme.paket_id)
            if is_target and mevcut_grup is None:
                mevcut_grup = {
                    "kalem_id": sozlesme.paket_id,
                    "kalem_adi": sozlesme.paket_adi,
                    "net_tutar": 0,
                    "ucretsiz": False,
                    "kaynak": "sozlesme",
                }
        elif sozlesme.paket_id and sozlesme.paket_turu == PaketTuru.OZEL_DERS:
            haric_ozel.add(sozlesme.paket_id)
        elif sozlesme.paket_id and sozlesme.paket_turu == PaketTuru.PREMIUM:
            haric_premium.add(sozlesme.paket_id)
        elif sozlesme.paket_id and sozlesme.paket_turu == PaketTuru.DENEME:
            haric_deneme.add(sozlesme.paket_id)
            if is_target and mevcut_deneme is None:
                net = _deneme_net_tutar(sozlesme)
                mevcut_deneme = {
                    "kalem_id": sozlesme.paket_id,
                    "kalem_adi": sozlesme.paket_adi,
                    "net_tutar": net,
                    "ucretsiz": net == 0,
                    "kaynak": "sozlesme",
                }

        kalemler = SozlesmeKalemi.objects.filter(sozlesme=sozlesme)
        for k in kalemler:
            if k.kalem_turu in (KalemTuru.EK_HIZMET, KalemTuru.EK_HIZMET_SATISI):
                haric_ek.add(k.kalem_id)
                continue

            kind = _classify_kalem_paket_turu(k, sozlesme)
            if kind == PaketTuru.GRUP_DERSI:
                haric_grup.add(k.kalem_id)
                if is_target:
                    mevcut_grup = _serialize_mevcut_kalem(k)
            elif kind == PaketTuru.OZEL_DERS:
                haric_ozel.add(k.kalem_id)
            elif kind == PaketTuru.DENEME:
                haric_deneme.add(k.kalem_id)
                if is_target:
                    mevcut_deneme = _serialize_mevcut_kalem(k)
            elif kind == PaketTuru.PREMIUM:
                haric_premium.add(k.kalem_id)

    # Pakete dahil (ücretsiz) ek hizmetler listeden ÇIKARILMAZ: sözleşmede grup/premium
    # seçiliyken ücretsiz, paket kalkınca aynı kalemler ücretli seçilebilir olmalı.

    return haric_grup, haric_ozel, haric_deneme, haric_premium, haric_ek, mevcut_grup, mevcut_deneme


def _filter_paket_qs(model, kurum_id, sube_id, egitim_yili_id):
    qs = model.objects.filter(aktif_mi=True)
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    return qs


def _resolve_ogrenci_paket_filtreleri(
    ogrenci_id,
    egitim_yili_id,
    sozlesme_id=None,
    sinif_seviyesi_param=None,
    alan_param=None,
    ogrenci_kayit_id=None,
):
    """Öğrenci kaydından sınıf seviyesi ve alan bilgisini çöz (kayıt sihirbazı ile aynı mantık)."""
    from apps.ogrenci.domain.models import OgrenciKayit
    from apps.odeme_takip.domain.models import Sozlesme

    sinif_seviyesi_id = int(sinif_seviyesi_param) if sinif_seviyesi_param else None
    alan_id = int(alan_param) if alan_param else None

    if sinif_seviyesi_id is not None and alan_param is not None:
        return sinif_seviyesi_id, alan_id

    kayit = None
    if ogrenci_kayit_id:
        kayit = (
            OgrenciKayit.objects.filter(id=ogrenci_kayit_id, aktif_mi=True)
            .select_related("sinif__sinif_seviyesi", "sinif__alan", "sinif_seviyesi", "alan")
            .first()
        )

    if sozlesme_id and not kayit:
        sozlesme = (
            Sozlesme.objects.filter(id=sozlesme_id)
            .select_related(
                "ogrenci_kayit__sinif__sinif_seviyesi",
                "ogrenci_kayit__sinif__alan",
                "ogrenci_kayit__sinif_seviyesi",
                "ogrenci_kayit__alan",
            )
            .first()
        )
        if sozlesme and sozlesme.ogrenci_kayit_id:
            kayit = sozlesme.ogrenci_kayit

    if not kayit and ogrenci_id and egitim_yili_id:
        try:
            ey_id = int(egitim_yili_id)
        except (TypeError, ValueError):
            ey_id = egitim_yili_id
        kayit = (
            OgrenciKayit.objects.filter(
                ogrenci_id=ogrenci_id,
                egitim_yili_id=ey_id,
                aktif_mi=True,
            )
            .select_related("sinif__sinif_seviyesi", "sinif__alan", "sinif_seviyesi", "alan")
            .first()
        )

    if kayit:
        if sinif_seviyesi_id is None:
            sinif_seviyesi_id = resolve_kayit_sinif_seviyesi_id(kayit)
        if alan_param is None:
            alan_id = resolve_kayit_alan_id(kayit, ogrenci_id, egitim_yili_id)
    elif alan_param is None and ogrenci_id:
        alan_id = resolve_kayit_alan_id(None, ogrenci_id, egitim_yili_id)

    return sinif_seviyesi_id, alan_id


def _filtre_meta(sinif_seviyesi_id, alan_id):
    from apps.egitim_tanimlari.models import Alan, SinifSeviyesi

    meta = {"sinif_seviyesi_id": sinif_seviyesi_id, "alan_id": alan_id}
    if sinif_seviyesi_id:
        seviye = SinifSeviyesi.objects.filter(id=sinif_seviyesi_id).first()
        meta["sinif_seviyesi_ad"] = seviye.ad if seviye else None
    if alan_id:
        alan = Alan.objects.filter(id=alan_id).first()
        meta["alan_ad"] = alan.ad if alan else None
    return meta


@api_view(["GET"])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def kalem_secenekleri(request):
    """
    ?tur=grup_dersi|ozel_ders|deneme|ek_hizmet|paket
    &ogrenci_id=&egitim_yili_id=&kurum_id=&sube_id=&sozlesme_id=
    &sinif_seviyesi_id=&alan_id=  (opsiyonel; yoksa öğrenci kaydından çözülür)
    """
    from apps.egitim_paketleri.models import Deneme, EkHizmet, GrupDersi, OzelDers, PremiumPaket, YayinPaketi

    tur = request.query_params.get("tur", "")
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err
    ogrenci_id = request.query_params.get("ogrenci_id")
    sozlesme_id = request.query_params.get("sozlesme_id")
    ogrenci_kayit_id = request.query_params.get("ogrenci_kayit_id")

    # Öğrenciye özel filtrelerde URL'deki eğitim yılını önceliklendir
    filter_egitim_yili_id = request.query_params.get("egitim_yili_id") or egitim_yili_id
    if filter_egitim_yili_id:
        try:
            filter_egitim_yili_id = int(filter_egitim_yili_id)
        except (TypeError, ValueError):
            filter_egitim_yili_id = egitim_yili_id

    sinif_seviyesi_id, alan_id = _resolve_ogrenci_paket_filtreleri(
        ogrenci_id,
        filter_egitim_yili_id,
        sozlesme_id=sozlesme_id,
        sinif_seviyesi_param=request.query_params.get("sinif_seviyesi_id"),
        alan_param=request.query_params.get("alan_id"),
        ogrenci_kayit_id=ogrenci_kayit_id,
    )
    filtre = _filtre_meta(sinif_seviyesi_id, alan_id)

    if ogrenci_id and not sinif_seviyesi_id:
        return Response(
            {
                "secenekler": [],
                "mevcut_grup_dersi": None,
                "mevcut_deneme": None,
                "filtre": filtre,
                "filtre_uyarisi": "Öğrenci kaydı veya sınıf seviyesi bulunamadı.",
            }
        )

    haric_grup, haric_ozel, haric_deneme, haric_premium, haric_ek, mevcut_grup, mevcut_deneme = _collect_mevcut_paketler(
        ogrenci_id, filter_egitim_yili_id, sozlesme_id
    )

    secenekler = []

    inclusion_kwargs = {
        "sinif_seviyesi_id": sinif_seviyesi_id,
        "kurum_id": kurum_id,
        "sube_id": sube_id,
        "egitim_yili_id": filter_egitim_yili_id,
        "alan_id": alan_id,
    }

    def add_grup():
        qs = (
            _filter_paket_qs(GrupDersi, kurum_id, sube_id, egitim_yili_id)
            .exclude(id__in=haric_grup)
        )
        qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)
        qs = _apply_grup_alan_filter(qs, alan_id)
        for p in qs:
            payload = _serialize_secenek(p, p.kod)
            payload["paket_turu"] = PaketTuru.GRUP_DERSI
            payload.update(_paket_dahil_detay(PaketTuru.GRUP_DERSI, p, inclusion_kwargs))
            secenekler.append(payload)

    def add_ozel():
        qs = (
            _filter_paket_qs(OzelDers, kurum_id, sube_id, egitim_yili_id)
            .exclude(id__in=haric_ozel)
        )
        qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)
        qs = _apply_ozel_alan_filter(qs, alan_id)
        for p in qs:
            payload = _serialize_secenek(p, p.kod)
            payload["paket_turu"] = PaketTuru.OZEL_DERS
            secenekler.append(payload)

    def add_deneme():
        qs = (
            _filter_paket_qs(Deneme, kurum_id, sube_id, egitim_yili_id)
            .exclude(id__in=haric_deneme)
        )
        qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)
        for p in qs:
            payload = _serialize_secenek(p, p.kod)
            payload["deneme_sayisi"] = p.deneme_sayisi
            payload["paket_turu"] = PaketTuru.DENEME
            secenekler.append(payload)

    def add_premium():
        qs = (
            _filter_paket_qs(PremiumPaket, kurum_id, sube_id, egitim_yili_id)
            .exclude(id__in=haric_premium)
        )
        qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)
        for p in qs:
            payload = _serialize_secenek(p, p.kod)
            payload["paket_turu"] = PaketTuru.PREMIUM
            payload.update(_paket_dahil_detay(PaketTuru.PREMIUM, p, inclusion_kwargs))
            secenekler.append(payload)

    def add_ek():
        qs = (
            _filter_paket_qs(EkHizmet, kurum_id, sube_id, egitim_yili_id)
            .exclude(hizmet_turu="deneme")
            .exclude(id__in=haric_ek)
        )
        qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)
        for h in qs:
            secenekler.append(_serialize_secenek(h, h.kod))

    def add_yayin():
        qs = _filter_paket_qs(YayinPaketi, kurum_id, sube_id, egitim_yili_id)
        qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)
        for p in qs:
            payload = _serialize_secenek(p, p.kod)
            payload["paket_turu"] = "yayin"
            secenekler.append(payload)

    if tur in ("grup_dersi", "grup_dersleri"):
        add_grup()
    elif tur in ("ozel_ders", "ozel_dersler"):
        add_ozel()
    elif tur in ("deneme", "denemeler"):
        add_deneme()
    elif tur in ("premium", "premium_paketler"):
        add_premium()
    elif tur == "ek_hizmet":
        add_ek()
    elif tur in ("yayin", "yayin_paketi", "yayin_paketleri"):
        add_yayin()
    elif tur == "paket":
        add_grup()
        add_ozel()
        add_premium()
        add_deneme()
    else:
        return Response({"secenekler": [], "error": f"Geçersiz tur: {tur}"}, status=400)

    return Response(
        {
            "secenekler": secenekler,
            "mevcut_grup_dersi": mevcut_grup,
            "mevcut_deneme": mevcut_deneme,
            "filtre": filtre,
        }
    )


@api_view(["GET"])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def kalem_turleri(request):
    """Sözleşmeye eklenebilir kalem türleri."""
    return Response(
        [
            {"value": "grup_dersi", "label": "Grup Dersi", "kalem_turu": "grup_dersi"},
            {"value": "ozel_ders", "label": "Özel Ders", "kalem_turu": "ozel_ders"},
            {"value": "deneme", "label": "Deneme Paketi", "kalem_turu": "deneme"},
            {"value": "premium", "label": "Premium Paket", "kalem_turu": "premium"},
            {"value": "ek_hizmet", "label": "Ek Hizmet", "kalem_turu": "ek_hizmet"},
            {"value": "yayin", "label": "Yayın Paketi", "kalem_turu": "yayin"},
        ]
    )
