"""
Öğrenci Paket API Views
Sözleşme oluştururken öğrencinin kayıtlı paketlerini döndürür.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from apps.odeme_takip.permissions import ODEME_TAKIP_PERMISSIONS
from rest_framework.response import Response

from shared.context import get_secili_kurum_id, get_secili_sube_id, get_secili_egitim_yili_id


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def ogrenci_paketleri(request, ogrenci_id):
    """
    Öğrencinin kayıtlı olduğu eğitim paketlerini ve ek hizmetlerini döndürür.
    
    - OgrenciKayit → kurum, sube, egitim_yili, kayit_id
    - OgrenciEgitimPaketi → paket_turu, paket_id, paket_adi (+ gerçek modelden fiyat/kdv)
    - OgrenciEkHizmet → ek_hizmet FK (dahil_mi=False olanlar = ayrı satın alınmış)
    """
    from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi, OgrenciEkHizmet, OgrenciVeli

    egitim_yili_id = get_secili_egitim_yili_id(request)
    if not egitim_yili_id:
        return Response({'error': 'Eğitim yılı seçilmemiş'}, status=400)

    # Öğrenciyi bul
    try:
        ogrenci = Ogrenci.objects.get(id=ogrenci_id)
    except Ogrenci.DoesNotExist:
        return Response({'error': 'Öğrenci bulunamadı'}, status=404)

    # OgrenciKayit — bu eğitim yılı için aktif kayıt
    from apps.ogrenci.domain.models import OgrenciKayit
    kayit = OgrenciKayit.objects.filter(
        ogrenci_id=ogrenci_id,
        egitim_yili_id=egitim_yili_id,
        aktif_mi=True
    ).select_related('kurum', 'sube', 'egitim_yili', 'sinif').first()

    if not kayit:
        return Response({
            'error': 'Bu öğrencinin bu eğitim yılında aktif kaydı yok',
            'ogrenci': _serialize_ogrenci(ogrenci),
        }, status=404)

    # Eğitim Paketlerini getir
    egitim_paketleri = OgrenciEgitimPaketi.objects.filter(
        ogrenci_id=ogrenci_id,
        aktif_mi=True
    )

    paket_listesi = []
    for ep in egitim_paketleri:
        brut_fiyat, kdv_orani = _get_paket_fiyat(ep.paket_turu, ep.paket_id)
        from apps.egitim_paketleri.models import hesapla_kdv
        net_fiyat, kdv_tutari = hesapla_kdv(brut_fiyat, kdv_orani)
        paket_listesi.append({
            'id': ep.id,
            'paket_turu': ep.paket_turu,
            'paket_turu_label': ep.get_paket_turu_display(),
            'paket_id': ep.paket_id,
            'paket_adi': ep.paket_adi,
            'fiyat': brut_fiyat,
            'kdv_orani': kdv_orani,
            'kdv_tutari': kdv_tutari,
            'kdv_dahil_fiyat': brut_fiyat,
            'baslangic_tarihi': str(ep.baslangic_tarihi) if ep.baslangic_tarihi else None,
            'bitis_tarihi': str(ep.bitis_tarihi) if ep.bitis_tarihi else None,
            'kayit_tarihi': str(ep.kayit_tarihi) if ep.kayit_tarihi else None,
        })

    # Ek Hizmetleri getir (sadece ayrı satın alınanlar — dahil_mi=False)
    ek_hizmetler = OgrenciEkHizmet.objects.filter(
        ogrenci_id=ogrenci_id,
        aktif_mi=True,
        dahil_mi=False,
        egitim_yili_id=egitim_yili_id,
    ).select_related('ek_hizmet')

    ek_hizmet_listesi = []
    for eh in ek_hizmetler:
        hizmet = eh.ek_hizmet
        kdv_orani = hizmet.kdv_orani if hizmet else 10
        fiyat = eh.fiyat or (hizmet.brut_fiyat if hizmet else 0)
        from apps.egitim_paketleri.models import hesapla_kdv
        net_f, kdv_t = hesapla_kdv(fiyat, kdv_orani)
        ek_hizmet_listesi.append({
            'id': eh.id,
            'ek_hizmet_id': hizmet.id if hizmet else None,
            'ad': hizmet.ad if hizmet else '',
            'hizmet_turu': hizmet.hizmet_turu if hizmet else '',
            'fiyat': fiyat,
            'kdv_orani': kdv_orani,
            'kdv_tutari': kdv_t,
            'kdv_dahil_fiyat': fiyat,
        })

    # Pakete dahil hizmetler (sözleşmede tekrar eklenmesin diye)
    dahil_hizmetler_qs = OgrenciEkHizmet.objects.filter(
        ogrenci_id=ogrenci_id,
        aktif_mi=True,
        dahil_mi=True,
        egitim_yili_id=egitim_yili_id,
    ).select_related('ek_hizmet')

    dahil_hizmet_listesi = []
    dahil_deneme_paket_ids = set()
    for eh in dahil_hizmetler_qs:
        hizmet = eh.ek_hizmet
        if not hizmet:
            continue
        deneme_paket_id = getattr(hizmet, 'deneme_paketi_id', None)
        if hizmet.hizmet_turu == 'deneme' and deneme_paket_id:
            dahil_deneme_paket_ids.add(deneme_paket_id)
        dahil_hizmet_listesi.append({
            'id': eh.id,
            'ek_hizmet_id': hizmet.id,
            'ad': hizmet.ad,
            'hizmet_turu': hizmet.hizmet_turu,
            'kaynak_paket_turu': eh.kaynak_paket_turu or '',
            'kaynak_paket_id': eh.kaynak_paket_id,
            'deneme_paket_id': deneme_paket_id,
            'fiyat': hizmet.brut_fiyat or 0,
            'kdv_orani': hizmet.kdv_orani or 10,
            'kdv_dahil_fiyat': hizmet.brut_fiyat or 0,
        })

    # Velileri getir
    veliler = OgrenciVeli.objects.filter(ogrenci_id=ogrenci_id)
    veli_listesi = []
    for v in veliler:
        veli_listesi.append({
            'id': v.id,
            'veli_turu': v.veli_turu,
            'veli_turu_label': v.get_veli_turu_display() if hasattr(v, 'get_veli_turu_display') else v.veli_turu,
            'ad': v.ad,
            'soyad': v.soyad,
            'tam_ad': f"{v.ad} {v.soyad}",
            'telefon': v.telefon or '',
            'tc_kimlik_no': v.tc_kimlik_no or '',
            'varsayilan': v.varsayilan,
        })

    # Finans: Ödeme Yöntemleri — aktif şube bağlamındaki mali hesaplara göre
    odeme_yontemleri_list = []
    mali_hesaplar_list = []
    finans_sube_id = get_secili_sube_id(request, kayit.kurum_id) or kayit.sube_id
    finans_sube_adi = ''
    if finans_sube_id:
        try:
            from apps.sube.domain.models import Sube
            finans_sube = Sube.objects.filter(id=finans_sube_id).first()
            finans_sube_adi = finans_sube.ad if finans_sube else ''
        except Exception:
            finans_sube_adi = ''

    if finans_sube_id:
        try:
            from apps.finans.application.selectors.financial_account_selector import MaliHesapSelector
            mali_selector = MaliHesapSelector()
            qs = mali_selector.get_active_by_sube(finans_sube_id)
            mali_hesaplar_list = [
                {'id': mh.id, 'ad': mh.ad, 'tip': mh.tip, 'sube_id': finans_sube_id}
                for mh in qs
            ]
        except Exception:
            mali_hesaplar_list = []

        if kayit.kurum_id and mali_hesaplar_list:
            try:
                from apps.finans.application.odeme_yontemi_plan_helpers import (
                    dedupe_odeme_yontemleri_for_plan,
                    ensure_kurum_plan_odeme_yontemleri,
                )
                from django.db.models import Q
                from apps.finans.constants.payment_types import OdemeYontemiTipi
                from apps.finans.domain.payment_method import OdemeYontemi

                ensure_kurum_plan_odeme_yontemleri(kayit.kurum_id)
                mali_ids = [mh['id'] for mh in mali_hesaplar_list]
                qs = OdemeYontemi.objects.filter(
                    kurum_id=kayit.kurum_id,
                    aktif_mi=True,
                    silindi_mi=False,
                ).filter(
                    Q(mali_hesap_id__in=mali_ids)
                    | Q(mali_hesap__isnull=True)
                )
                odeme_yontemleri_list = dedupe_odeme_yontemleri_for_plan(qs)
            except Exception:
                odeme_yontemleri_list = []
        elif kayit.kurum_id:
            try:
                from apps.finans.application.odeme_yontemi_plan_helpers import (
                    dedupe_odeme_yontemleri_for_plan,
                    ensure_kurum_plan_odeme_yontemleri,
                )
                from apps.finans.domain.payment_method import OdemeYontemi

                ensure_kurum_plan_odeme_yontemleri(kayit.kurum_id)
                qs = OdemeYontemi.objects.filter(
                    kurum_id=kayit.kurum_id,
                    aktif_mi=True,
                    silindi_mi=False,
                )
                odeme_yontemleri_list = dedupe_odeme_yontemleri_for_plan(qs)
            except Exception:
                odeme_yontemleri_list = []

    # Mevcut sözleşme kontrolü (iptal/fesih hariç aktif sözleşme var mı?)
    from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi
    from apps.odeme_takip.domain.enums import SozlesmeDurum
    aktif_durumlar = [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS]
    mevcut_sozlesme = Sozlesme.objects.filter(
        ogrenci_id=ogrenci_id,
        egitim_yili_id=egitim_yili_id,
        durum__in=aktif_durumlar,
    ).select_related('ogrenci', 'veli').first()

    mevcut_sozlesme_data = None
    mevcut_kalemler = []
    if mevcut_sozlesme:
        mevcut_sozlesme_data = {
            'id': mevcut_sozlesme.id,
            'sozlesme_no': mevcut_sozlesme.sozlesme_no,
            'durum': mevcut_sozlesme.durum,
            'net_tutar': mevcut_sozlesme.net_tutar,
            'brut_tutar': mevcut_sozlesme.brut_tutar,
            'paket_adi': mevcut_sozlesme.paket_adi,
            'paket_turu': mevcut_sozlesme.paket_turu,
        }
        for k in mevcut_sozlesme.kalemler.all():
            mevcut_kalemler.append({
                'kalem_turu': k.kalem_turu,
                'kalem_id': k.kalem_id,
                'kalem_adi': k.kalem_adi,
                'brut_tutar': k.brut_tutar,
                'net_tutar': k.net_tutar,
            })

    return Response({
        'ogrenci': _serialize_ogrenci(ogrenci),
        'kayit': {
            'id': kayit.id,
            'kurum_id': kayit.kurum_id,
            'kurum_adi': kayit.kurum.ad if kayit.kurum else '',
            'sube_id': kayit.sube_id,
            'sube_adi': kayit.sube.ad if kayit.sube else '',
            'islem_sube_id': finans_sube_id,
            'islem_sube_adi': finans_sube_adi,
            'egitim_yili_id': kayit.egitim_yili_id,
            'egitim_yili_adi': str(kayit.egitim_yili) if kayit.egitim_yili else '',
            'egitim_yili_bitis_yil': kayit.egitim_yili.bitis_yil if kayit.egitim_yili else None,
            'sinif': kayit.sinif.ad if kayit.sinif else '',
            'kayit_tarihi': str(kayit.kayit_tarihi) if kayit.kayit_tarihi else None,
        },
        'egitim_paketleri': paket_listesi,
        'ek_hizmetler': ek_hizmet_listesi,
        'dahil_hizmetler': dahil_hizmet_listesi,
        'dahil_deneme_paket_ids': sorted(dahil_deneme_paket_ids),
        'veliler': veli_listesi,
        'odeme_yontemleri': odeme_yontemleri_list,
        'mali_hesaplar': mali_hesaplar_list,
        'mevcut_sozlesme': mevcut_sozlesme_data,
        'mevcut_kalemler': mevcut_kalemler,
    })


def _serialize_ogrenci(ogrenci):
    return {
        'id': ogrenci.id,
        'ad': ogrenci.ad,
        'soyad': ogrenci.soyad,
        'tam_ad': f"{ogrenci.ad} {ogrenci.soyad}",
        'tc_kimlik_no': getattr(ogrenci, 'tc_kimlik_no', ''),
        'ogrenci_no': getattr(ogrenci, 'ogrenci_no', ''),
    }


def _get_paket_fiyat(paket_turu, paket_id):
    """
    Paket türü ve ID'den güncel fiyat ve KDV oranını getirir.
    Bulunamazsa (0, 10) döndürür.
    """
    model_map = {
        'grup_dersi': 'apps.egitim_paketleri.models.GrupDersi',
        'ozel_ders': 'apps.egitim_paketleri.models.OzelDers',
        'deneme': 'apps.egitim_paketleri.models.Deneme',
        'davranis': 'apps.egitim_paketleri.models.DavranisPaketi',
    }
    model_path = model_map.get(paket_turu)
    if not model_path:
        return 0, 10

    try:
        import importlib
        module_path, class_name = model_path.rsplit('.', 1)
        module = importlib.import_module(module_path)
        Model = getattr(module, class_name)
        obj = Model.objects.get(id=paket_id)
        return obj.brut_fiyat, obj.kdv_orani
    except Exception:
        return 0, 10
