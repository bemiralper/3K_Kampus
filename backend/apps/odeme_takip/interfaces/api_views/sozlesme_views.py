"""
Sözleşme API Views
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from apps.odeme_takip.permissions import (
    ODEME_TAKIP_PERMISSIONS,
    OdemePrintOrAuthenticatedPermission,
    validate_print_token_for_request,
)
from rest_framework.response import Response

from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
from apps.odeme_takip.application.services.indirim_service import IndirimService
from apps.odeme_takip.domain.notlar_utils import serialize_notlar
from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import ParametrikRepository

from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id
from apps.odeme_takip.interfaces.sube_context import (
    assert_indirim_record_access,
    assert_kalem_record_access,
    assert_sozlesme_record_access,
    gate_sozlesme_pk,
    resolve_mandatory_odeme_context,
)


def _user_display_name(user) -> str | None:
    """Ad-soyad boşsa kullanıcı adına düş (işlem geçmişi görünürlüğü için)."""
    if not user:
        return None
    full_name = (user.get_full_name() or '').strip()
    if full_name:
        return full_name
    username = getattr(user, 'username', None)
    if username:
        return str(username).strip()
    email = getattr(user, 'email', None)
    if email:
        return str(email).strip()
    return None


def _serialize_sozlesme(s, detail=False):
    """Sözleşme → dict"""
    data = {
        'id': s.id,
        'sozlesme_no': s.sozlesme_no,
        'ogrenci': {
            'id': s.ogrenci_id,
            'ad': s.ogrenci.ad if hasattr(s.ogrenci, 'ad') else '',
            'soyad': s.ogrenci.soyad if hasattr(s.ogrenci, 'soyad') else '',
            'ogrenci_no': getattr(s.ogrenci, 'ogrenci_no', ''),
        } if s.ogrenci else None,
        'veli': {
            'id': s.veli_id,
            'ad': s.veli.ad if s.veli else '',
            'soyad': s.veli.soyad if s.veli else '',
            'veli_turu': s.veli.veli_turu if s.veli else '',
            'tam_ad': f"{s.veli.ad} {s.veli.soyad}" if s.veli else '',
        } if s.veli_id else None,
        'odeme_yontemi': {
            'id': s.odeme_yontemi_id,
            'ad': s.odeme_yontemi.ad if s.odeme_yontemi else '',
            'tip': s.odeme_yontemi.tip if s.odeme_yontemi else '',
        } if s.odeme_yontemi_id else None,
        'mali_hesap': {
            'id': s.mali_hesap_id,
            'ad': s.mali_hesap.ad if s.mali_hesap else '',
        } if s.mali_hesap_id else None,
        'tarih': str(s.kayit_tarihi) if s.kayit_tarihi else None,
        'paket_adi': s.paket_adi,
        'paket_turu': s.paket_turu,
        'brut_tutar': s.brut_tutar or 0,
        'kdv_orani': s.kdv_orani or 0,
        'kdv_tutari': s.kdv_tutari or 0,
        'kdv_dahil_tutar': s.kdv_dahil_tutar or 0,
        'toplam_indirim_tutari': s.toplam_indirim_tutari or 0,
        'net_tutar': s.net_tutar or 0,
        'odeme_turu': s.odeme_turu,
        'taksit_sayisi': s.taksit_sayisi,
        'durum': s.durum,
        'toplam_odenen': s.toplam_odenen,
        'kalan_borc': s.kalan_borc,
        'odeme_yuzdesi': s.odeme_yuzdesi,
        'olusturma_tarihi': str(s.created_at) if s.created_at else None,
        # Ek detaylar
        'muacceliyet_durumu': s.muacceliyet_durumu,
        'cayma_suresi': s.cayma_suresi,
        'egitim_turu': s.egitim_turu,
        'versiyon': s.versiyon,
        'revizyon_tarihi': s.revizyon_tarihi.isoformat() if s.revizyon_tarihi else None,
        'yetkili_personel': s.yetkili_personel.get_full_name() if s.yetkili_personel else None,
        'yetkili_personel_id': s.yetkili_personel_id,
    }

    if detail:
        data['baslangic_tarihi'] = str(s.baslangic_tarihi) if s.baslangic_tarihi else None
        data['bitis_tarihi'] = str(s.bitis_tarihi) if s.bitis_tarihi else None
        data['ilk_odeme_tarihi'] = str(s.ilk_odeme_tarihi) if s.ilk_odeme_tarihi else None
        data['taksit_periyodu'] = s.taksit_periyodu
        notlar_data = serialize_notlar(s)
        data['notlar'] = notlar_data['notlar']
        data['notlar_json'] = notlar_data['notlar_json']
        data['ogrenci_kayit_id'] = s.ogrenci_kayit_id
        data['egitim_yili_id'] = s.egitim_yili_id
        data['kurum_id'] = s.kurum_id
        data['sube_id'] = s.sube_id
        data['paket_id'] = s.paket_id
        data['veli_id'] = s.veli_id
        data['odeme_yontemi_id'] = s.odeme_yontemi_id
        data['mali_hesap_id'] = s.mali_hesap_id
    return data


def _serialize_kalem(k):
    return {
        'id': k.id,
        'kalem_turu': k.kalem_turu,
        'kalem_id': k.kalem_id,
        'kalem_adi': k.kalem_adi,
        'brut_tutar': k.brut_tutar or 0,
        'kdv_orani': k.kdv_orani or 0,
        'kdv_tutari': k.kdv_tutari or 0,
        'kdv_dahil_tutar': k.kdv_dahil_tutar or 0,
        'indirim_orani': k.indirim_orani or 0,
        'indirim_tutari': k.indirim_tutari or 0,
        'net_tutar': k.net_tutar or 0,
        'toplam_tutar': k.net_tutar or k.kdv_dahil_tutar or 0,
    }


def _serialize_indirim(i):
    return {
        'id': i.id,
        'indirim_turu': {
            'id': i.indirim_turu_id,
            'ad': i.indirim_turu.ad if i.indirim_turu else '',
        },
        'oran': i.indirim_orani or 0,
        'tutar': i.indirim_tutari or 0,
        'onay_durumu': i.onay_durumu,
        'onaylayan': i.onaylayan.get_full_name() if i.onaylayan else None,
        'olusturan': i.olusturan.get_full_name() if i.olusturan else None,
        'aciklama': i.aciklama or '',
        'olusturma_tarihi': str(i.created_at) if i.created_at else None,
    }


def _serialize_taksit(t):
    return {
        'id': t.id,
        'taksit_no': t.taksit_no,
        'vade_tarihi': str(t.vade_tarihi) if t.vade_tarihi else None,
        'tutar': t.tutar or 0,
        'odenen_tutar': t.odenen_tutar or 0,
        'kalan_tutar': t.kalan_tutar or 0,
        'durum': t.durum,
    }


def _serialize_tahsilat(th):
    # Dağıtım detaylarını al
    dagitim_list = []
    try:
        for dag in th.dagitimlar.select_related('taksit').all():
            dagitim_list.append({
                'taksit_no': dag.taksit.taksit_no,
                'tutar': dag.tutar or 0,
            })
    except Exception:
        pass  # dagitimlar henüz prefetch edilmemişse

    from apps.finans.application.islem_masrafi_service import IslemMasrafiService
    from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
    masraf = IslemMasrafiService.get_by_kaynak(IslemMasrafiKaynakTipi.TAHSILAT, th.id)

    return {
        'id': th.id,
        'sozlesme_id': th.sozlesme_id,
        'sozlesme_no': th.sozlesme.sozlesme_no if th.sozlesme else '',
        'ogrenci_adi': (
            f'{th.sozlesme.ogrenci.ad} {th.sozlesme.ogrenci.soyad}'
            if th.sozlesme and th.sozlesme.ogrenci else ''
        ),
        'taksit_id': th.taksit_id,
        'taksit_no': th.taksit.taksit_no if th.taksit else None,
        'odeme_yontemi': {
            'id': th.odeme_yontemi_id,
            'ad': th.odeme_yontemi.ad if th.odeme_yontemi else '',
        },
        'mali_hesap': {
            'id': th.mali_hesap_id,
            'ad': th.mali_hesap.ad if th.mali_hesap_id else '',
        } if th.mali_hesap_id else None,
        'tutar': th.tutar or 0,
        'tahsilat_tarihi': str(th.tahsilat_tarihi) if th.tahsilat_tarihi else None,
        'referans_no': th.referans_no or '',
        'tahsilat_turu': th.tahsilat_turu,
        'durum': th.durum,
        'iptal_nedeni': th.iptal_nedeni or '',
        'iptal_tarihi': str(th.iptal_tarihi) if th.iptal_tarihi else None,
        'islem_yapan': th.islem_yapan.get_full_name() if th.islem_yapan else None,
        'aciklama': th.aciklama or '',
        'olusturma_tarihi': str(th.created_at) if th.created_at else None,
        'dagitim': dagitim_list,
        'islem_masrafi': IslemMasrafiService.serialize_masraf(masraf),
    }


def _serialize_gecmis(g):
    return {
        'id': g.id,
        'islem_turu': g.islem_turu,
        'islem_turu_label': g.get_islem_turu_display(),
        'eski_deger': g.eski_deger,
        'yeni_deger': g.yeni_deger,
        'aciklama': g.aciklama or '',
        'islem_yapan': _user_display_name(g.islem_yapan),
        'islem_tarihi': str(g.created_at) if g.created_at else None,
    }


# ─── Sözleşme CRUD ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_list(request):
    """Sözleşme listesi — filtreleme: kurum, sube, egitim_yili, durum, ogrenci_id"""
    service = SozlesmeService()
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err
    durum = request.GET.get('durum')
    ogrenci_id = request.GET.get('ogrenci_id')

    sozlesmeler = service.get_all(kurum_id, sube_id, egitim_yili_id, durum, ogrenci_id)
    return Response([_serialize_sozlesme(s) for s in sozlesmeler])


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_create(request):
    """Yeni sözleşme oluştur"""
    service = SozlesmeService()
    kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
    if err:
        return err
    data = request.data.copy()
    data['kurum_id'] = data.get('kurum_id') or kurum_id
    data['sube_id'] = sube_id
    data['egitim_yili_id'] = data.get('egitim_yili_id') or egitim_yili_id

    sozlesme, errors = service.create(data, user=request.user if request.user.is_authenticated else None)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_sozlesme(sozlesme, detail=True), status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_delete(request, pk):
    """Sözleşme sil (sadece taslak)"""
    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err
    service = SozlesmeService()
    result, errors = service.delete(pk, user=request.user if request.user.is_authenticated else None)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(result, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([OdemePrintOrAuthenticatedPermission])
def sozlesme_detail(request, pk):
    """Sözleşme detayı — kalemler, indirimler, taksitler, geçmiş dahil"""
    service = SozlesmeService()
    taksit_service = TaksitService()
    tahsilat_service = TahsilatService()
    indirim_service = IndirimService()

    print_ok = validate_print_token_for_request(request, pk, ('plan', 'sozlesme'))
    sozlesme = service.get_by_id(pk)
    if not sozlesme:
        return Response({'error': 'Sözleşme bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
    if print_ok:
        payload = request._odeme_print_payload
        if sozlesme.kurum_id != payload['kurum_id']:
            return Response({'error': 'Sözleşme bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
    else:
        err = assert_sozlesme_record_access(request, sozlesme)
        if err:
            return err

    data = _serialize_sozlesme(sozlesme, detail=True)

    # Kurum ve Şube bilgileri (ödeme planı çıktısı için)
    if sozlesme.kurum:
        k = sozlesme.kurum
        data['kurum'] = {
            'ad': k.ad,
            'adres': k.adres or '',
            'telefon_sabit': k.telefon_sabit or '',
            'vergi_no': k.vergi_no or '',
            'vergi_dairesi': k.vergi_dairesi or '',
        }
    if sozlesme.sube:
        data['sube'] = {'ad': sozlesme.sube.ad}

    if sozlesme.egitim_yili_id and sozlesme.egitim_yili:
        ey = sozlesme.egitim_yili
        data['egitim_yili_adi'] = f"{ey.baslangic_yil} - {ey.bitis_yil}"

    # Ek bilgiler (ödeme planı + sözleşme belgesi çıktısı için)
    data['ogrenci_adi'] = (
        f'{sozlesme.ogrenci.ad} {sozlesme.ogrenci.soyad}'
        if sozlesme.ogrenci else ''
    )
    data['ogrenci_tc_kimlik_no'] = sozlesme.ogrenci.tc_kimlik_no if sozlesme.ogrenci else ''
    data['ogrenci_telefon'] = sozlesme.ogrenci.telefon if sozlesme.ogrenci else ''
    # Öğrenci adresi (varsayılan adres)
    if sozlesme.ogrenci:
        vrs_adres = sozlesme.ogrenci.adresler.filter(varsayilan=True).first()
        if not vrs_adres:
            vrs_adres = sozlesme.ogrenci.adresler.first()
        if vrs_adres:
            data['ogrenci_adres'] = f"{vrs_adres.adres}, {vrs_adres.ilce}/{vrs_adres.il}" if vrs_adres.ilce else vrs_adres.adres
        else:
            data['ogrenci_adres'] = sozlesme.ogrenci.adres or ''
    else:
        data['ogrenci_adres'] = ''

    data['veli_adi'] = (
        f'{sozlesme.veli.ad} {sozlesme.veli.soyad}'
        if sozlesme.veli else ''
    )
    data['veli_tc_kimlik_no'] = sozlesme.veli.tc_kimlik_no if sozlesme.veli else ''
    data['veli_telefon'] = sozlesme.veli.telefon if sozlesme.veli else ''
    data['veli_turu'] = sozlesme.veli.get_veli_turu_display() if sozlesme.veli else ''

    # Kalemler
    data['kalemler'] = [_serialize_kalem(k) for k in sozlesme.kalemler.all()]

    # İndirimler
    indirimler = indirim_service.get_by_sozlesme(pk)
    data['indirimler'] = [_serialize_indirim(i) for i in indirimler]

    # Taksitler
    taksitler = taksit_service.get_by_sozlesme(pk)
    data['taksitler'] = [_serialize_taksit(t) for t in taksitler]

    # Tahsilatlar
    tahsilatlar = tahsilat_service.get_by_sozlesme(pk)
    data['tahsilatlar'] = [_serialize_tahsilat(th) for th in tahsilatlar]

    # Geçmiş
    from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import SozlesmeGecmisiRepository
    gecmis_repo = SozlesmeGecmisiRepository()
    gecmis = gecmis_repo.get_by_sozlesme(pk)
    data['gecmis'] = [_serialize_gecmis(g) for g in gecmis]

    return Response(data)


@api_view(['PUT'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_update(request, pk):
    """Sözleşme güncelle (taslak veya aktif)"""
    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err
    service = SozlesmeService()
    sozlesme, errors = service.update(pk, request.data, user=request.user if request.user.is_authenticated else None)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_sozlesme(sozlesme, detail=True))


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_status_change(request, pk):
    """Sözleşme statü değişikliği — body: { yeni_durum, aciklama }"""
    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err
    service = SozlesmeService()
    yeni_durum = request.data.get('yeni_durum')
    aciklama = request.data.get('aciklama', '')
    if not yeni_durum:
        return Response({'error': 'yeni_durum zorunlu'}, status=status.HTTP_400_BAD_REQUEST)

    sozlesme, errors = service.change_status(
        pk, yeni_durum,
        user=request.user if request.user.is_authenticated else None,
        aciklama=aciklama,
    )
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_sozlesme(sozlesme))


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_status_revert(request, pk):
    """Son durum değişikliğini geri al (yönetici)."""
    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err
    service = SozlesmeService()
    aciklama = request.data.get('aciklama', '')
    sozlesme, errors = service.revert_last_status(
        pk,
        user=request.user if request.user.is_authenticated else None,
        aciklama=aciklama,
    )
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_sozlesme(sozlesme, detail=True))


# ─── İndirim ─────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_indirim_add(request, pk):
    """Sözleşmeye indirim ekle"""
    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err
    service = IndirimService()
    indirim, errors = service.add_discount(
        pk, request.data,
        user=request.user if request.user.is_authenticated else None,
    )
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_indirim(indirim), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def indirim_approve(request, pk):
    """İndirim onayla"""
    err = assert_indirim_record_access(request, pk)
    if err:
        return err
    service = IndirimService()
    indirim, errors = service.approve(pk, user=request.user if request.user.is_authenticated else None)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_indirim(indirim))


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def indirim_reject(request, pk):
    """İndirim reddet"""
    err = assert_indirim_record_access(request, pk)
    if err:
        return err
    service = IndirimService()
    neden = request.data.get('neden', '')
    indirim, errors = service.reject(pk, neden, user=request.user if request.user.is_authenticated else None)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_indirim(indirim))


# ─── Parametrik ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def odeme_sekilleri(request):
    """
    Ödeme yöntemleri listesi (eski odeme-sekilleri endpoint'i — geriye uyumluluk)

    ?mali_hesap_id=X verilirse SADECE o mali hesaba ait ödeme yöntemleri
    döner (önce Mali Hesap seç, sonra Ödeme Yöntemi cascade akışı).
    """
    repo = ParametrikRepository()
    kurum_id, sube_id, _, err = resolve_mandatory_odeme_context(request)
    if err:
        return err
    mali_hesap_id = request.GET.get('mali_hesap_id')
    if mali_hesap_id:
        items = repo.get_odeme_yontemleri(
            kurum_id, mali_hesap_id=mali_hesap_id, sube_id=sube_id,
        )
        return Response([
            {
                'id': i.id, 'ad': i.ad, 'kod': i.tip, 'tip': i.tip,
                'mali_hesap_id': i.mali_hesap_id, 'aktif_mi': i.aktif_mi,
            }
            for i in items
        ])
    return Response(repo.get_odeme_yontemleri_for_plan(kurum_id, sube_id=sube_id))


# ─── KALEM EKLEME / ÇIKARMA ─────────────
@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_kalem_ekle(request, pk):
    """
    Sözleşmeye kalem ekle.
    POST: {
        kalem_turu: "ek_hizmet",
        kalem_id: 5,
        kalem_adi: "Yemek Hizmeti",
        brut_tutar: 3000,
        kdv_orani: 10,
        indirim_orani: 0,
    }
    """
    _, err = gate_sozlesme_pk(request, pk)
    if err:
        return err
    service = SozlesmeService()
    user = request.user if request.user.is_authenticated else None
    kalem, error = service.kalem_ekle(pk, request.data, user)

    if error:
        return Response(error, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'kalem': _serialize_kalem(kalem),
        'message': f'{kalem.kalem_adi} eklendi',
    }, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def sozlesme_kalem_cikar(request, pk):
    """Sözleşmeden kalem çıkar"""
    err = assert_kalem_record_access(request, pk)
    if err:
        return err
    service = SozlesmeService()
    user = request.user if request.user.is_authenticated else None
    result, error = service.kalem_cikar(pk, user)

    if error:
        return Response(error, status=status.HTTP_400_BAD_REQUEST)

    return Response(result)


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def indirim_turleri(request):
    """İndirim türleri listesi"""
    repo = ParametrikRepository()
    kurum_id, sube_id, _, err = resolve_mandatory_odeme_context(request)
    if err:
        return err
    items = repo.get_indirim_turleri(kurum_id, sube_id)
    return Response([
        {
            'id': i.id, 'ad': i.ad, 'kod': i.kod,
            'max_oran': i.max_oran or 0,
            'onay_gerektiren_oran': i.onay_gerektiren_oran or 0,
        }
        for i in items
    ])
