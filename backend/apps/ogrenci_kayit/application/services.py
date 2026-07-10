from django.db import transaction
from django.utils import timezone

from apps.egitim_paketleri.models import (
    DavranisPaketi,
    Deneme,
    EkHizmet,
    GrupDersi,
    OzelDers,
    PremiumPaket,
    YayinPaketi,
)
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.ogrenci.domain.models import (
    Ogrenci,
    OgrenciAdres,
    OgrenciEgitimPaketi,
    OgrenciEkHizmet,
    OgrenciKayit,
    OgrenciVeli,
)
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.okul.application.enrollment import resolve_school_for_enrollment

from ..domain.models import (
    DraftAddress,
    DraftEnrollment,
    DraftGuardian,
    DraftPackageSelection,
    DraftStudent,
    WizardDraft,
)


def get_active_context(request):
    """Kurum/şube bağlamını header, session veya varsayılan kayıttan çöz."""
    kurum_id = (
        request.headers.get("X-Kurum-ID")
        or getattr(request.user, "kurum_id", None)
        or request.session.get("kurum_id")
        or request.session.get("active_kurum_id")
        or getattr(request, "active_kurum_id", None)
    )
    sube_id = (
        request.headers.get("X-Sube-ID")
        or getattr(request.user, "sube_id", None)
        or request.session.get("sube_id")
        or request.session.get("active_sube_id")
        or getattr(request, "active_sube_id", None)
    )
    egitim_yili_id = (
        request.headers.get("X-EgitimYili-ID")
        or request.session.get("active_egitim_yili_id")
        or getattr(request, "active_egitim_yili_id", None)
    )

    if kurum_id:
        kurum_id = int(kurum_id)
    if sube_id:
        sube_id = int(sube_id)
    if egitim_yili_id:
        egitim_yili_id = int(egitim_yili_id)

    if not kurum_id:
        from apps.kurum.domain.models import Kurum
        kurum = Kurum.objects.filter(aktif_mi=True).first()
        kurum_id = kurum.id if kurum else None

    if not sube_id:
        sube = Sube.objects.filter(aktif_mi=True).first()
        sube_id = sube.id if sube else None

    return kurum_id, sube_id, egitim_yili_id


def get_mandatory_context(request):
    """
    Zorunlu kurum/şube bağlamı — kayıt oluşturma ve paket listeleri.

    Returns:
        (kurum_id, sube_id, egitim_yili_id, None) veya (None, None, None, error_dict)
    """
    from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id
    from shared.sube_context import resolve_mandatory_sube

    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, None, None, {'detail': 'Kurum bilgisi bulunamadı', 'status': 400}

    sube_id, err = resolve_mandatory_sube(request, kurum_id)
    if err:
        return None, None, None, {'detail': err['error'], 'status': err['status']}

    egitim_yili_id = get_secili_egitim_yili_id(request)
    return kurum_id, sube_id, egitim_yili_id, None


def _price_payload(item) -> dict:
    """API yanıtı için tutarlı fiyat alanları (brüt=KDV dahil, net=KDV hariç)."""
    brut = int(item.brut_fiyat or 0)
    net = int(item.net_fiyat or 0)
    kdv_orani = int(item.kdv_orani or 0)
    return {
        "fiyat": float(net),
        "net_fiyat": float(net),
        "kdv_orani": float(kdv_orani),
        "kdv_dahil_fiyat": float(brut),
    }


def _apply_grup_alan_filter(qs, alan_id):
    """Grup derslerinde öğrenci alanına tam eşleşme; alansız paketler de gösterilir."""
    from django.db.models import Q

    if alan_id:
        return qs.filter(Q(alan_id=alan_id) | Q(alan__isnull=True))
    return qs


def _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id):
    """
    Sınıf seviyesi seçiliyse eşleşen veya sınıf atanmamış (tüm seviyeler) paketleri göster.
    Eğitim paketleri modülünde sınıf seçilmeden kaydedilen paketler kayıt ekranında kaybolmasın.
    """
    if not sinif_seviyesi_id:
        return qs
    from django.db.models import Count, Q

    return (
        qs.annotate(_seviye_sayisi=Count("sinif_seviyeleri", distinct=True))
        .filter(Q(sinif_seviyeleri__id=sinif_seviyesi_id) | Q(_seviye_sayisi=0))
        .distinct()
    )


def _apply_ozel_alan_filter(qs, alan_id):
    """Özel derslerde alansız (genel) paketler herkese; alanlı paketler yalnızca eşleşen öğrenciye."""
    if alan_id:
        from django.db.models import Q

        return qs.filter(Q(alan__isnull=True) | Q(alan_id=alan_id))
    return qs


def _ek_hizmet_payload(item) -> dict:
    """Kayıt sihirbazında seçilebilir ek hizmetler gerçek fiyatla döner."""
    return {
        "id": item.id,
        "ad": item.ad,
        "kod": item.kod,
        "hizmet_turu": item.hizmet_turu,
        "hizmet_turu_display": item.get_hizmet_turu_display(),
        **_price_payload(item),
        "ucretsiz": False,
        "aktif_mi": item.aktif_mi,
        "aciklama": item.aciklama or "",
    }


def resolve_wizard_egitim_yili_id(egitim_yili_id=None, kurum_id=None):
    """Kayıt sihirbazı için geçerli eğitim yılı ID'sini çöz."""
    if egitim_yili_id:
        return int(egitim_yili_id)

    from apps.egitim_yili.domain.models import EgitimYili

    active = EgitimYili.objects.filter(aktif_mi=True).order_by("-baslangic_yil").first()
    return active.id if active else None


def _resolve_paket_inclusions(
    paket,
    *,
    is_grup: bool,
    sinif_seviyesi_id: int | None = None,
    kurum_id=None,
    sube_id=None,
    egitim_yili_id=None,
    alan_id: int | None = None,
    wizard_display_only: bool = False,
):
    """
    Grup dersi / premium pakete dahil ek hizmet, deneme ve yayın paketi ID'lerini döndür.

    SADECE paket tanımında açıkça işaretlenmiş (M2M) kalemler ücretsiz dahildir.
    Alanlı grup dersinde "tüm denemeler/ek hizmetler" otomatik genişletmesi UYGULANMAZ:
    bir öğrenci birden fazla deneme paketi almaz; yalnızca seçilmiş olan(lar) ücretsizdir.
    `wizard_display_only`, `is_grup`, `alan_id`, `sinif_seviyesi_id`, `kurum_id`, `sube_id`
    parametreleri geriye dönük imza uyumluluğu için korunur.
    Deneme tipi ek hizmetler ek hizmet listesine dahil edilmez — denemeler ayrı yönetilir.
    """
    effective_yil = egitim_yili_id or getattr(paket, "egitim_yili_id", None)

    m2m_qs = paket.dahil_ek_hizmetler.filter(aktif_mi=True).exclude(hizmet_turu="deneme")
    if effective_yil:
        m2m_qs = m2m_qs.filter(egitim_yili_id=effective_yil)
    dahil_ek_hizmet_ids = set(m2m_qs.values_list("id", flat=True))

    m2m_deneme_qs = paket.dahil_denemeler.filter(aktif_mi=True)
    if effective_yil:
        m2m_deneme_qs = m2m_deneme_qs.filter(egitim_yili_id=effective_yil)
    dahil_deneme_ids = set(m2m_deneme_qs.values_list("id", flat=True))

    m2m_yayin_qs = paket.dahil_yayin_paketleri.filter(aktif_mi=True)
    if effective_yil:
        m2m_yayin_qs = m2m_yayin_qs.filter(egitim_yili_id=effective_yil)
    dahil_yayin_ids = set(m2m_yayin_qs.values_list("id", flat=True))

    return sorted(dahil_ek_hizmet_ids), sorted(dahil_deneme_ids), sorted(dahil_yayin_ids)


def resolve_grup_dersi_inclusions(grup_dersi: GrupDersi, **kwargs):
    """Grup dersi dahil ek hizmet, deneme ve yayın paketi ID'lerini döndür."""
    return _resolve_paket_inclusions(grup_dersi, is_grup=True, **kwargs)


def resolve_premium_paket_inclusions(premium_paket, **kwargs):
    """Premium paket dahil ek hizmet, deneme ve yayın paketi ID'lerini döndür."""
    return _resolve_paket_inclusions(premium_paket, is_grup=False, **kwargs)


def _attach_dahil_ek_hizmetler(ogrenci, dahil_ids, kaynak_turu, kaynak_id, egitim_yili, baslangic_tarihi):
    for ek_hizmet in EkHizmet.objects.filter(id__in=dahil_ids, aktif_mi=True).exclude(hizmet_turu="deneme"):
        OgrenciEkHizmet.objects.get_or_create(
            ogrenci=ogrenci,
            ek_hizmet=ek_hizmet,
            aktif_mi=True,
            defaults={
                "fiyat": 0,
                "dahil_mi": True,
                "kaynak_paket_turu": kaynak_turu,
                "kaynak_paket_id": kaynak_id,
                "egitim_yili": egitim_yili,
                "baslangic_tarihi": baslangic_tarihi,
            },
        )


def _attach_dahil_denemeler(ogrenci, dahil_deneme_ids, kaynak_turu, kaynak_id, kurum_id, sube_id, egitim_yili, baslangic_tarihi):
    for deneme_paketi in Deneme.objects.filter(id__in=dahil_deneme_ids, aktif_mi=True):
        ek_hizmet = EkHizmet.objects.filter(
            deneme_paketi=deneme_paketi,
            sube_id=sube_id,
            egitim_yili=egitim_yili,
            aktif_mi=True,
        ).first()
        if not ek_hizmet:
            ek_hizmet = EkHizmet.objects.create(
                ad=f"Deneme — {deneme_paketi.ad}",
                kod=f"DNM_{deneme_paketi.kod}",
                hizmet_turu="deneme",
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili=egitim_yili,
                deneme_paketi=deneme_paketi,
                brut_fiyat=deneme_paketi.brut_fiyat,
                kdv_orani=deneme_paketi.kdv_orani,
                aktif_mi=True,
            )
            ek_hizmet.sinif_seviyeleri.set(deneme_paketi.sinif_seviyeleri.all())

        OgrenciEkHizmet.objects.get_or_create(
            ogrenci=ogrenci,
            ek_hizmet=ek_hizmet,
            aktif_mi=True,
            defaults={
                "fiyat": 0,
                "dahil_mi": True,
                "kaynak_paket_turu": kaynak_turu,
                "kaynak_paket_id": kaynak_id,
                "egitim_yili": egitim_yili,
                "baslangic_tarihi": baslangic_tarihi,
            },
        )


def _attach_dahil_yayin_paketleri(ogrenci, dahil_yayin_ids, kaynak_turu, kaynak_id, baslangic_tarihi):
    """Grup dersi/premium pakete ücretsiz dahil yayın paketlerini öğrenciye kaydet."""
    from apps.egitim_paketleri.models import YayinPaketi
    for yp in YayinPaketi.objects.filter(id__in=dahil_yayin_ids, aktif_mi=True):
        OgrenciEgitimPaketi.objects.get_or_create(
            ogrenci=ogrenci,
            paket_turu="yayin",
            paket_id=yp.id,
            aktif_mi=True,
            defaults={
                "paket_adi": yp.ad,
                "dahil_mi": True,
                "kaynak_paket_turu": kaynak_turu,
                "kaynak_paket_id": kaynak_id,
                "baslangic_tarihi": baslangic_tarihi,
            },
        )


def attach_grup_dersi_ek_hizmetler(ogrenci, grup_dersi, egitim_yili, baslangic_tarihi, **inclusion_kwargs):
    """Grup dersi dahil ek hizmetlerini öğrenciye kaydet."""
    dahil_ids, _, _ = resolve_grup_dersi_inclusions(grup_dersi, **inclusion_kwargs)
    _attach_dahil_ek_hizmetler(
        ogrenci, dahil_ids, "grup_dersleri", grup_dersi.id, egitim_yili, baslangic_tarihi
    )


def attach_grup_dersi_denemeler(ogrenci, grup_dersi, egitim_yili, baslangic_tarihi, **inclusion_kwargs):
    """Grup dersi dahil deneme paketlerini öğrenciye kaydet."""
    kurum_id = inclusion_kwargs.get("kurum_id")
    sube_id = inclusion_kwargs.get("sube_id")
    _, dahil_deneme_ids, _ = resolve_grup_dersi_inclusions(grup_dersi, **inclusion_kwargs)
    _attach_dahil_denemeler(
        ogrenci, dahil_deneme_ids, "grup_dersleri", grup_dersi.id,
        kurum_id, sube_id, egitim_yili, baslangic_tarihi,
    )


def attach_grup_dersi_yayin_paketleri(ogrenci, grup_dersi, egitim_yili, baslangic_tarihi, **inclusion_kwargs):
    """Grup dersi dahil yayın paketlerini öğrenciye ücretsiz kaydet."""
    _, _, dahil_yayin_ids = resolve_grup_dersi_inclusions(grup_dersi, **inclusion_kwargs)
    _attach_dahil_yayin_paketleri(
        ogrenci, dahil_yayin_ids, "grup_dersi", grup_dersi.id, baslangic_tarihi
    )


def attach_premium_paket_inclusions(ogrenci, premium_paket, egitim_yili, baslangic_tarihi, **inclusion_kwargs):
    """Premium pakete dahil ek hizmet, deneme ve yayın paketlerini öğrenciye ücretsiz kaydet."""
    kurum_id = inclusion_kwargs.get("kurum_id")
    sube_id = inclusion_kwargs.get("sube_id")
    dahil_ids, dahil_deneme_ids, dahil_yayin_ids = resolve_premium_paket_inclusions(
        premium_paket, **inclusion_kwargs
    )
    _attach_dahil_ek_hizmetler(
        ogrenci, dahil_ids, "premium_paketler", premium_paket.id, egitim_yili, baslangic_tarihi
    )
    _attach_dahil_denemeler(
        ogrenci, dahil_deneme_ids, "premium_paketler", premium_paket.id,
        kurum_id, sube_id, egitim_yili, baslangic_tarihi,
    )
    _attach_dahil_yayin_paketleri(
        ogrenci, dahil_yayin_ids, "premium", premium_paket.id, baslangic_tarihi
    )


def generate_student_number(sinif_seviyesi: SinifSeviyesi = None) -> str:
    """
    Öğrenci numarası oluşturur.
    - Mevcut en büyük numaraya +1 ekler (TÜM kayıtlar arasından)
    - Numara öğrenciye sabit kalır, değişmez
    - Küçükten büyüğe doğru sıralı verilir
    """
    from django.db.models import Max
    
    # Prefix varsa kullan (sınıf seviyesine göre)
    prefix = ""
    if sinif_seviyesi:
        prefix = getattr(sinif_seviyesi, "ogrenci_no_prefix", "") or ""
    
    max_number = 0
    
    # TÜM DraftEnrollment'lardan en büyük numarayı bul
    all_drafts = (
        DraftEnrollment.objects
        .exclude(ogrenci_no__isnull=True)
        .exclude(ogrenci_no='')
        .values_list('ogrenci_no', flat=True)
    )
    for ogrenci_no in all_drafts:
        if ogrenci_no and ogrenci_no.isdigit():
            num = int(ogrenci_no)
            if num > max_number:
                max_number = num
    
    # TÜM OgrenciKayit'lardan en büyük numarayı bul
    all_kayitlar = (
        OgrenciKayit.objects
        .exclude(okul_no__isnull=True)
        .exclude(okul_no='')
        .values_list('okul_no', flat=True)
    )
    for okul_no in all_kayitlar:
        if okul_no and okul_no.isdigit():
            num = int(okul_no)
            if num > max_number:
                max_number = num
    
    next_number = max_number + 1
    return f"{prefix}{next_number:05d}"


def resolve_or_create_sinif(kurum_id, sube_id, egitim_yili, sinif_seviyesi, alan):
    sinif = Sinif.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili=egitim_yili,
        sinif_seviyesi=sinif_seviyesi,
        alan=alan,
        aktif_mi=True,
    ).first()
    if sinif:
        return sinif

    ad = sinif_seviyesi.ad
    if alan:
        ad = f"{ad}-{alan.kod}"

    return Sinif.objects.create(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili=egitim_yili,
        ad=ad,
        sinif_seviyesi=sinif_seviyesi,
        alan=alan,
        aktif_mi=True,
    )


def _package_inclusions_for_wizard(paket, *, is_grup: bool, **inclusion_kwargs):
    """Kayıt sihirbazı: yalnızca paket tanımında işaretli (M2M) dahil kalemler."""
    try:
        return _resolve_paket_inclusions(
            paket,
            is_grup=is_grup,
            wizard_display_only=True,
            **inclusion_kwargs,
        )
    except Exception:
        return [], [], []


def list_packages(
    sinif_seviyesi_id: int | None = None,
    alan_id: int | None = None,
    kurum_id=None,
    sube_id=None,
    egitim_yili_id=None,
):
    """Sınıf seviyesi ve alana göre eğitim paketlerini listele"""
    packages = []
    egitim_yili_id = resolve_wizard_egitim_yili_id(egitim_yili_id, kurum_id)
    inclusion_kwargs = {
        "sinif_seviyesi_id": sinif_seviyesi_id,
        "kurum_id": kurum_id,
        "sube_id": sube_id,
        "egitim_yili_id": egitim_yili_id,
        "alan_id": alan_id,
    }

    grup_qs = GrupDersi.objects.filter(aktif_mi=True).prefetch_related(
        "dahil_ek_hizmetler", "dahil_denemeler", "dahil_yayin_paketleri"
    )
    if kurum_id:
        grup_qs = grup_qs.filter(kurum_id=kurum_id)
    if sube_id:
        grup_qs = grup_qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        grup_qs = grup_qs.filter(egitim_yili_id=egitim_yili_id)
    grup_qs = _apply_sinif_seviyesi_filter(grup_qs, sinif_seviyesi_id)
    grup_qs = _apply_grup_alan_filter(grup_qs, alan_id)

    for item in grup_qs.distinct():
        try:
            dahil_ids, dahil_deneme_ids, dahil_yayin_ids = _package_inclusions_for_wizard(
                item, is_grup=True, **inclusion_kwargs,
            )
            packages.append(
                {
                    "id": f"grup_dersleri_{item.id}",
                    "db_id": item.id,
                    "ad": item.ad,
                    "kod": item.kod,
                    "kategori": "grup_dersleri",
                    "aciklama": item.aciklama or "",
                    **_price_payload(item),
                    "taksit_sayisi": 1,
                    "is_active": item.aktif_mi,
                    "dahil_ek_hizmet_ids": dahil_ids,
                    "dahil_deneme_paketi_ids": dahil_deneme_ids,
                    "dahil_yayin_paketi_ids": dahil_yayin_ids,
                    "alan_id": item.alan_id,
                }
            )
        except Exception:
            continue

    premium_qs = PremiumPaket.objects.filter(aktif_mi=True).prefetch_related(
        "dahil_ek_hizmetler", "dahil_denemeler", "dahil_yayin_paketleri"
    )
    if kurum_id:
        premium_qs = premium_qs.filter(kurum_id=kurum_id)
    if sube_id:
        premium_qs = premium_qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        premium_qs = premium_qs.filter(egitim_yili_id=egitim_yili_id)
    premium_qs = _apply_sinif_seviyesi_filter(premium_qs, sinif_seviyesi_id)

    for item in premium_qs.distinct():
        try:
            dahil_ids, dahil_deneme_ids, dahil_yayin_ids = _package_inclusions_for_wizard(
                item, is_grup=False, **inclusion_kwargs,
            )
            packages.append(
                {
                    "id": f"premium_paketler_{item.id}",
                    "db_id": item.id,
                    "ad": item.ad,
                    "kod": item.kod,
                    "kategori": "premium_paketler",
                    "aciklama": item.aciklama or "",
                    **_price_payload(item),
                    "taksit_sayisi": 1,
                    "is_active": item.aktif_mi,
                    "dahil_ek_hizmet_ids": dahil_ids,
                    "dahil_deneme_paketi_ids": dahil_deneme_ids,
                    "dahil_yayin_paketi_ids": dahil_yayin_ids,
                    "alan_id": None,
                }
            )
        except Exception:
            continue

    ozel_qs = OzelDers.objects.filter(aktif_mi=True)
    if kurum_id:
        ozel_qs = ozel_qs.filter(kurum_id=kurum_id)
    if sube_id:
        ozel_qs = ozel_qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        ozel_qs = ozel_qs.filter(egitim_yili_id=egitim_yili_id)
    ozel_qs = _apply_sinif_seviyesi_filter(ozel_qs, sinif_seviyesi_id)
    ozel_qs = _apply_ozel_alan_filter(ozel_qs, alan_id)

    for item in ozel_qs.distinct():
        packages.append(
            {
                "id": f"ozel_dersler_{item.id}",
                "db_id": item.id,
                "ad": item.ad,
                "kod": item.kod,
                "kategori": "ozel_dersler",
                "aciklama": item.aciklama or "",
                **_price_payload(item),
                "taksit_sayisi": 1,
                "is_active": item.aktif_mi,
                "dahil_ek_hizmet_ids": [],
                "dahil_deneme_paketi_ids": [],
                "dahil_yayin_paketi_ids": [],
                "alan_id": item.alan_id,
            }
        )

    return packages


def list_yayin_paketleri(sinif_seviyesi_id: int | None = None, kurum_id=None, sube_id=None, egitim_yili_id=None):
    """Aktif yayın paketlerini listele (grup/premium dışında ayrıca seçilebilir kalem)."""
    yayin_paketleri = []
    egitim_yili_id = resolve_wizard_egitim_yili_id(egitim_yili_id, kurum_id)

    qs = YayinPaketi.objects.filter(aktif_mi=True).prefetch_related("sinif_seviyeleri")
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)

    for item in qs.distinct().order_by("ad", "-id"):
        yayin_paketleri.append(
            {
                "id": item.id,
                "ad": item.ad,
                "kod": item.kod,
                "aciklama": item.aciklama or "",
                **_price_payload(item),
                "sinif_seviyeleri": [
                    {"id": seviye.id, "ad": seviye.ad}
                    for seviye in item.sinif_seviyeleri.all()
                ],
            }
        )

    return yayin_paketleri


def list_ek_hizmetler(sinif_seviyesi_id: int | None = None, kurum_id=None, sube_id=None, egitim_yili_id=None):
    """Aktif ek hizmetleri listele (deneme hariç — denemeler ayrı listeden seçilir)."""
    ek_hizmetler = []
    egitim_yili_id = resolve_wizard_egitim_yili_id(egitim_yili_id, kurum_id)

    qs = EkHizmet.objects.filter(aktif_mi=True).exclude(hizmet_turu="deneme")
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)

    seen_keys: set[tuple] = set()
    for item in qs.distinct().order_by("hizmet_turu", "ad", "-id"):
        dedupe_key = (item.kod, item.hizmet_turu, item.egitim_yili_id)
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        ek_hizmetler.append(_ek_hizmet_payload(item))

    return ek_hizmetler


def list_deneme_paketleri(sinif_seviyesi_id: int | None = None, kurum_id=None, sube_id=None, egitim_yili_id=None):
    """Sınıf seviyesine göre deneme paketlerini listele (ek hizmetlerden bağımsız)."""
    deneme_paketleri = []
    egitim_yili_id = resolve_wizard_egitim_yili_id(egitim_yili_id, kurum_id)

    qs = Deneme.objects.filter(aktif_mi=True).prefetch_related("sinif_seviyeleri")
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    qs = _apply_sinif_seviyesi_filter(qs, sinif_seviyesi_id)

    for item in qs.distinct().order_by("ad", "-id"):
        deneme_paketleri.append(
            {
                "id": item.id,
                "ad": item.ad,
                "kod": item.kod,
                "deneme_sayisi": item.deneme_sayisi,
                "aciklama": item.aciklama or "",
                **_price_payload(item),
                "sinif_seviyeleri": [
                    {"id": seviye.id, "ad": seviye.ad}
                    for seviye in item.sinif_seviyeleri.all()
                ],
                "dahil_ek_hizmet_ids": [],
            }
        )

    return deneme_paketleri


def submit_draft(draft: WizardDraft, user):
    if draft.status != "draft":
        return None, "Taslak zaten tamamlanmış"

    student = getattr(draft, "student", None)
    enrollment = getattr(draft, "enrollment", None)

    if not student or not enrollment:
        return None, "Zorunlu adımlar tamamlanmadı"

    with transaction.atomic():
        first_address = draft.addresses.first()
        first_guardian = draft.guardians.first()
        ogrenci = Ogrenci.objects.filter(
            kurum_id=draft.kurum_id,
            tc_kimlik_no=student.tc_kimlik_no,
        ).first()
        if not ogrenci:
            ogrenci = Ogrenci.objects.create(
                kurum_id=draft.kurum_id,
                sube_id=draft.sube_id,
                tc_kimlik_no=student.tc_kimlik_no,
                ad=student.ad,
                soyad=student.soyad,
                dogum_tarihi=student.dogum_tarihi,
                cinsiyet=student.cinsiyet.code if student.cinsiyet_id else None,
                telefon=student.telefon,
                email=student.email,
                adres=first_address.adres if first_address else "",
                veli_ad_soyad=(
                    f"{first_guardian.ad} {first_guardian.soyad}" if first_guardian else ""
                ),
                veli_telefon=first_guardian.telefon if first_guardian else "",
                kayit_turu=student.kayit_turu.code,
                aktif_mi=True,
            )

        sinif = None

        existing_kayit = OgrenciKayit.objects.filter(
            ogrenci=ogrenci,
            egitim_yili=enrollment.egitim_yili,
        ).first()
        if existing_kayit:
            return None, "Bu öğrenci bu eğitim yılında zaten kayıtlı"

        okul = None
        if enrollment.school_id:
            okul, school_err = resolve_school_for_enrollment(
                enrollment.school_id, draft.kurum_id, draft.sube_id,
            )
            if school_err:
                return None, school_err

        kayit = OgrenciKayit.objects.create(
            ogrenci=ogrenci,
            sinif=sinif,
            egitim_yili=enrollment.egitim_yili,
            kurum_id=draft.kurum_id,
            sube_id=draft.sube_id,
            okul_no=enrollment.ogrenci_no,
            giris_turu=enrollment.giris_turu.code,
            giris_tarihi=enrollment.giris_tarihi,
            school=okul,
            geldigi_okul="",
            referans=enrollment.referans,
            kaydi_alan=enrollment.kaydi_alan,
        )

        for address in draft.addresses.all():
            OgrenciAdres.objects.create(
                ogrenci=ogrenci,
                adres_turu=address.adres_turu.code,
                adres=address.adres,
                il=address.il.name,
                ilce=address.ilce.name,
                posta_kodu=address.posta_kodu,
                varsayilan=address.varsayilan,
            )

        for index, guardian in enumerate(draft.guardians.all()):
            sms_codes = [option.code for option in guardian.sms_bildirimleri.all()]
            OgrenciVeli.objects.create(
                ogrenci=ogrenci,
                veli_turu=guardian.veli_turu.code,
                tc_kimlik_no=guardian.tc_kimlik_no,
                ad=guardian.ad,
                soyad=guardian.soyad,
                telefon=guardian.telefon,
                email=guardian.email,
                sms_bildirimleri=sms_codes,
                egitim_seviyesi=guardian.egitim_seviyesi,
                meslek=guardian.meslek,
                calistigi_kurum=guardian.calistigi_kurum,
                ogrenci_kendi_velisi=student.ogrenci_kendi_velisi,
                varsayilan=index == 0,
            )

        for paket in draft.packages.all():
            OgrenciEgitimPaketi.objects.create(
                ogrenci=ogrenci,
                paket_turu=paket.paket_turu.code,
                paket_id=paket.paket_id,
                paket_adi=paket.paket_adi,
            )
            
            inclusion_kwargs = {
                "sinif_seviyesi_id": enrollment.sinif_seviyesi_id if enrollment.sinif_seviyesi_id else None,
                "kurum_id": draft.kurum_id,
                "sube_id": draft.sube_id,
                "egitim_yili_id": enrollment.egitim_yili_id,
                "alan_id": enrollment.alan_id if enrollment.alan_id else None,
            }
            paket_kod = paket.paket_turu.code

            # Seçilen paket GrupDersi ise, dahil ek hizmet/deneme/yayın paketlerini otomatik ekle
            if paket_kod in ('grup_dersleri', 'grup_dersi'):
                try:
                    grup_dersi = GrupDersi.objects.prefetch_related(
                        'dahil_ek_hizmetler', 'dahil_denemeler', 'dahil_yayin_paketleri'
                    ).get(id=paket.paket_id)
                    attach_grup_dersi_ek_hizmetler(
                        ogrenci, grup_dersi, enrollment.egitim_yili, enrollment.giris_tarihi, **inclusion_kwargs,
                    )
                    attach_grup_dersi_denemeler(
                        ogrenci, grup_dersi, enrollment.egitim_yili, enrollment.giris_tarihi, **inclusion_kwargs,
                    )
                    attach_grup_dersi_yayin_paketleri(
                        ogrenci, grup_dersi, enrollment.egitim_yili, enrollment.giris_tarihi, **inclusion_kwargs,
                    )
                except GrupDersi.DoesNotExist:
                    pass

            # Seçilen paket Premium ise, dahil ek hizmet/deneme/yayın paketlerini otomatik ekle
            elif paket_kod in ('premium_paketler', 'premium'):
                try:
                    premium = PremiumPaket.objects.prefetch_related(
                        'dahil_ek_hizmetler', 'dahil_denemeler', 'dahil_yayin_paketleri'
                    ).get(id=paket.paket_id)
                    attach_premium_paket_inclusions(
                        ogrenci, premium, enrollment.egitim_yili, enrollment.giris_tarihi, **inclusion_kwargs,
                    )
                except PremiumPaket.DoesNotExist:
                    pass

        # Deneme paketlerinin dahil ek hizmetlerini otomatik ekle
        for deneme_secim in draft.deneme_paketleri.all() if hasattr(draft, 'deneme_paketleri') else []:
            try:
                deneme_obj = Deneme.objects.prefetch_related('dahil_ek_hizmetler').get(id=deneme_secim.deneme_id)
                for ek_hizmet in deneme_obj.dahil_ek_hizmetler.filter(aktif_mi=True):
                    OgrenciEkHizmet.objects.get_or_create(
                        ogrenci=ogrenci,
                        ek_hizmet=ek_hizmet,
                        aktif_mi=True,
                        defaults={
                            'fiyat': 0,
                            'dahil_mi': True,
                            'kaynak_paket_turu': 'deneme',
                            'kaynak_paket_id': deneme_obj.id,
                            'egitim_yili': enrollment.egitim_yili,
                            'baslangic_tarihi': enrollment.giris_tarihi,
                        }
                    )
            except Deneme.DoesNotExist:
                pass

        # Ayrıca seçilen ekstra ek hizmetleri kaydet (dahil olmayanlar, ayrı satın alınanlar)
        for ek_hizmet_secim in draft.ek_hizmetler.all() if hasattr(draft, 'ek_hizmetler') else []:
            try:
                ek_hizmet = EkHizmet.objects.get(id=ek_hizmet_secim.ek_hizmet_id)
                OgrenciEkHizmet.objects.get_or_create(
                    ogrenci=ogrenci,
                    ek_hizmet=ek_hizmet,
                    aktif_mi=True,
                    defaults={
                        'fiyat': ek_hizmet.fiyat,
                        'dahil_mi': False,
                        'kaynak_paket_turu': '',
                        'kaynak_paket_id': None,
                        'egitim_yili': enrollment.egitim_yili,
                        'baslangic_tarihi': enrollment.giris_tarihi,
                    }
                )
            except EkHizmet.DoesNotExist:
                pass

        draft.status = "submitted"
        draft.submitted_at = timezone.now()
        draft.current_step = 5
        draft.save(update_fields=["status", "submitted_at", "current_step", "last_saved_at"])

    return kayit, None
