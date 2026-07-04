from django.db import transaction
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import status, viewsets
from rest_framework.decorators import action
from apps.ogrenci_kayit.permissions import OgrenciKayitModulePermission
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.ogrenci_kayit.permissions import OgrenciKayitAPIView as APIView

from apps.egitim_tanimlari.models import Alan, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.ogrenci.domain.models import Ogrenci, OgrenciAdres, OgrenciEgitimPaketi, OgrenciKayit, OgrenciVeli
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

import re


def normalize_phone(value: str) -> str:
    """Telefon numarasını normalize eder: (532) 123 45 67 -> 0532 123 45 67"""
    if not value:
        return ""
    # Parantez ve ekstra boşlukları temizle, 0 ile başlamasını sağla
    digits = re.sub(r'\D', '', value)
    if len(digits) == 10 and digits.startswith('5'):
        digits = '0' + digits
    return digits  # 05321234567 formatında sakla

from ..domain.sinif_seviyesi_rules import sinif_seviyesi_requires_alan
from ..application.services import (
    generate_student_number,
    get_active_context,
    get_mandatory_context,
    attach_grup_dersi_ek_hizmetler,
    attach_grup_dersi_denemeler,
    list_ek_hizmetler,
    list_deneme_paketleri,
    list_packages,
    resolve_wizard_egitim_yili_id,
    submit_draft,
)
from ..domain.models import (
    DraftAddress,
    DraftEnrollment,
    DraftGuardian,
    DraftPackageSelection,
    DraftStudent,
    LocationCity,
    LocationDistrict,
    LookupCategory,
    LookupOption,
    WizardDraft,
    WizardRule,
)
from .serializers import (
    DraftAddressSerializer,
    DraftEnrollmentSerializer,
    DraftGuardianSerializer,
    DraftPackageSerializer,
    DraftStudentSerializer,
    WizardDraftSerializer,
)


class TcCheckView(APIView):
    """TC Kimlik No ile öğrenci sorgulama — Kayıt Yenileme desteği"""
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        tc = request.query_params.get("tc", "").strip()
        if not tc or len(tc) != 11 or not tc.isdigit():
            return Response({"detail": "Geçerli bir TC Kimlik No giriniz (11 hane)"}, status=status.HTTP_400_BAD_REQUEST)

        kurum_id, sube_id = get_active_context(request)[:2]
        if not kurum_id:
            return Response({"detail": "Kurum bilgisi bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)

        ogrenci = Ogrenci.objects.filter(kurum_id=kurum_id, tc_kimlik_no=tc).first()
        if not ogrenci:
            return Response({"found": False})

        # Son kayıt bilgisi
        son_kayit = OgrenciKayit.objects.filter(
            ogrenci=ogrenci
        ).select_related('sinif', 'sinif__sinif_seviyesi', 'egitim_yili').order_by('-egitim_yili__baslangic_yil').first()

        # Tüm kayıtlar (geçmiş yıllar)
        kayitlar = OgrenciKayit.objects.filter(
            ogrenci=ogrenci
        ).select_related('sinif', 'sinif__sinif_seviyesi', 'egitim_yili').order_by('-egitim_yili__baslangic_yil')

        kayit_gecmisi = []
        for k in kayitlar:
            kayit_gecmisi.append({
                "egitim_yili": f"{k.egitim_yili.baslangic_yil}-{k.egitim_yili.bitis_yil}",
                "sinif_seviyesi": k.sinif.sinif_seviyesi.ad if k.sinif and k.sinif.sinif_seviyesi else "",
                "sinif_seviyesi_kod": k.sinif.sinif_seviyesi.kod if k.sinif and k.sinif.sinif_seviyesi else "",
                "alan": k.sinif.alan.ad if k.sinif and hasattr(k.sinif, 'alan') and k.sinif.alan else "",
                "aktif_mi": k.aktif_mi,
                "giris_turu": k.giris_turu,
            })

        # Son sözleşme durumu
        from apps.odeme_takip.domain.models import Sozlesme
        son_sozlesme = Sozlesme.objects.filter(ogrenci=ogrenci).order_by('-created_at').first()
        sozlesme_info = None
        if son_sozlesme:
            sozlesme_info = {
                "sozlesme_no": son_sozlesme.sozlesme_no,
                "durum": son_sozlesme.durum,
                "paket_adi": son_sozlesme.paket_adi,
            }

        # Veli bilgileri
        veliler = []
        for v in ogrenci.veliler.all():
            veliler.append({
                "id": v.id,
                "veli_turu": v.veli_turu,
                "veli_turu_display": v.get_veli_turu_display(),
                "tc_kimlik_no": v.tc_kimlik_no,
                "ad": v.ad,
                "soyad": v.soyad,
                "telefon": v.telefon,
                "email": v.email,
                "meslek": v.meslek,
                "ogrenci_kendi_velisi": v.ogrenci_kendi_velisi,
                "varsayilan": v.varsayilan,
            })

        # Adres bilgileri
        adres = ogrenci.adresler.filter(varsayilan=True).first()
        adres_info = None
        if adres:
            adres_info = {
                "adres_turu": adres.adres_turu,
                "acik_adres": adres.adres,
                "il": adres.il,
                "ilce": adres.ilce,
                "posta_kodu": adres.posta_kodu,
            }

        # Sınıf seviyesi artırımı
        sonraki_seviye = None
        if son_kayit and son_kayit.sinif and son_kayit.sinif.sinif_seviyesi:
            current_kod = son_kayit.sinif.sinif_seviyesi.kod
            # Artırım haritası
            SINIF_ARTIRIM = {
                "9": "10", "10": "11", "11": "12", "12": "Mezun",
                "7": "8", "8": "9", "6": "7", "5": "6",
            }
            next_kod = SINIF_ARTIRIM.get(current_kod)
            if next_kod:
                next_seviye = SinifSeviyesi.objects.filter(kod=next_kod, aktif_mi=True).first()
                if next_seviye:
                    sonraki_seviye = {
                        "id": next_seviye.id,
                        "ad": next_seviye.ad,
                        "kod": next_seviye.kod,
                        "has_alan": sinif_seviyesi_requires_alan(next_seviye),
                    }

        # Aktif eğitim yılında kayıt var mı?
        aktif_yil = EgitimYili.objects.filter(aktif_mi=True).first()
        aktif_yilda_kayitli = False
        if aktif_yil:
            aktif_yilda_kayitli = OgrenciKayit.objects.filter(
                ogrenci=ogrenci, egitim_yili=aktif_yil
            ).exists()

        result = {
            "found": True,
            "ogrenci": {
                "id": ogrenci.id,
                "tc_kimlik_no": ogrenci.tc_kimlik_no,
                "ad": ogrenci.ad,
                "soyad": ogrenci.soyad,
                "dogum_tarihi": str(ogrenci.dogum_tarihi) if ogrenci.dogum_tarihi else "",
                "cinsiyet": ogrenci.cinsiyet,
                "telefon": ogrenci.telefon,
                "email": ogrenci.email,
                "kayit_turu": ogrenci.kayit_turu,
                "aktif_mi": ogrenci.aktif_mi,
            },
            "son_kayit": {
                "egitim_yili": f"{son_kayit.egitim_yili.baslangic_yil}-{son_kayit.egitim_yili.bitis_yil}" if son_kayit else "",
                "sinif_seviyesi": son_kayit.sinif.sinif_seviyesi.ad if son_kayit and son_kayit.sinif and son_kayit.sinif.sinif_seviyesi else "",
                "sinif_seviyesi_id": son_kayit.sinif.sinif_seviyesi.id if son_kayit and son_kayit.sinif and son_kayit.sinif.sinif_seviyesi else None,
                "sinif_seviyesi_kod": son_kayit.sinif.sinif_seviyesi.kod if son_kayit and son_kayit.sinif and son_kayit.sinif.sinif_seviyesi else "",
                "aktif_mi": son_kayit.aktif_mi if son_kayit else False,
            } if son_kayit else None,
            "kayit_gecmisi": kayit_gecmisi,
            "son_sozlesme": sozlesme_info,
            "veliler": veliler,
            "adres": adres_info,
            "sonraki_seviye": sonraki_seviye,
            "aktif_yilda_kayitli": aktif_yilda_kayitli,
        }

        return Response(result)


class VeliTcCheckView(APIView):
    """Veli TC Kimlik No ile sorgulama — Mevcut veli bilgisi getirme"""
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        tc = request.query_params.get("tc", "").strip()
        if not tc or len(tc) != 11 or not tc.isdigit():
            return Response({"detail": "Geçerli bir TC Kimlik No giriniz (11 hane)"}, status=status.HTTP_400_BAD_REQUEST)

        kurum_id, sube_id = get_active_context(request)[:2]
        if not kurum_id:
            return Response({"detail": "Kurum bilgisi bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)

        # Aynı TC ile kayıtlı velileri bul (kurum bazlı)
        veli_kayitlari = OgrenciVeli.objects.filter(
            tc_kimlik_no=tc,
            ogrenci__kurum_id=kurum_id,
        ).select_related('ogrenci').order_by('-created_at')

        if not veli_kayitlari.exists():
            return Response({"found": False})

        # İlk veli kaydını referans al (en güncel)
        ilk_veli = veli_kayitlari.first()

        # Bu TC ile bağlantılı öğrenciler
        bagli_ogrenciler = []
        seen_ogrenci_ids = set()
        for vk in veli_kayitlari:
            if vk.ogrenci_id not in seen_ogrenci_ids:
                seen_ogrenci_ids.add(vk.ogrenci_id)
                bagli_ogrenciler.append({
                    "id": vk.ogrenci_id,
                    "ad": vk.ogrenci.ad,
                    "soyad": vk.ogrenci.soyad,
                    "tc_kimlik_no": vk.ogrenci.tc_kimlik_no,
                    "yakinlik": vk.get_veli_turu_display(),
                })

        result = {
            "found": True,
            "veli": {
                "tc_kimlik_no": ilk_veli.tc_kimlik_no,
                "ad": ilk_veli.ad,
                "soyad": ilk_veli.soyad,
                "telefon": ilk_veli.telefon,
                "email": ilk_veli.email,
                "meslek": ilk_veli.meslek,
                "veli_turu": ilk_veli.veli_turu,
                "veli_turu_display": ilk_veli.get_veli_turu_display(),
            },
            "bagli_ogrenciler": bagli_ogrenciler,
        }

        return Response(result)


class WizardMetadataView(APIView):
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        from apps.kurum.services.kayit_tanimlari_service import ensure_all_system_lookups
        from apps.ogrenci_kayit.services.location_service import ensure_locations

        # Boş lookup / il tablolarını sabit varsayılanlarla doldur
        ensure_all_system_lookups()
        ensure_locations()

        lookups = {}
        categories = LookupCategory.objects.filter(is_active=True).prefetch_related("options")
        for category in categories:
            lookups[category.code] = [
                {
                    "id": option.id,
                    "code": option.code,
                    "label": option.label,
                    "metadata": option.metadata,
                }
                for option in category.options.filter(is_active=True).order_by("order")
            ]

        cities = [
            {
                "id": city.id,
                "name": city.name,
                "code": city.code,
                "is_default": city.is_default,
            }
            for city in LocationCity.objects.filter(is_active=True)
        ]

        rules = [
            {
                "code": rule.code,
                "trigger_field": rule.trigger_field,
                "operator": rule.operator,
                "trigger_value": rule.trigger_value,
                "target_field": rule.target_field,
                "action": rule.action,
                "payload": rule.payload,
            }
            for rule in WizardRule.objects.filter(is_active=True)
        ]

        from shared.context import get_secili_kurum_id, get_secili_sube_id

        sube_id = get_secili_sube_id(request)
        seviye_qs = SinifSeviyesi.objects.filter(aktif_mi=True)
        alan_qs = Alan.objects.filter(aktif_mi=True)
        if sube_id:
            seviye_qs = seviye_qs.filter(sube_id=sube_id)
            alan_qs = alan_qs.filter(sube_id=sube_id)

        sinif_seviyeleri = [
            {
                "id": seviye.id,
                "ad": seviye.ad,
                "kod": seviye.kod,
                "has_alan": sinif_seviyesi_requires_alan(seviye),
                "ogrenci_no_prefix": getattr(seviye, "ogrenci_no_prefix", "") or "",
            }
            for seviye in seviye_qs.order_by("sira")
        ]

        alanlar = [
            {"id": alan.id, "ad": alan.ad, "kod": alan.kod}
            for alan in alan_qs.order_by("ad")
        ]

        from apps.sinif.domain.models import Sinif
        sinif_qs = Sinif.objects.filter(aktif_mi=True).select_related("sinif_seviyesi", "alan", "egitim_yili")
        if sube_id:
            sinif_qs = sinif_qs.filter(sube_id=sube_id)
        siniflar = [
            {
                "id": s.id,
                "ad": s.ad,
                "sinif_seviyesi_id": s.sinif_seviyesi_id,
                "alan_id": s.alan_id,
                "egitim_yili_id": s.egitim_yili_id,
            }
            for s in sinif_qs.order_by("ad")
        ]

        from shared.sube_access import get_allowed_subeler_for_user

        kurum_id = get_secili_kurum_id(request)
        if kurum_id and getattr(request.user, 'is_authenticated', False):
            sube_qs = get_allowed_subeler_for_user(request.user, kurum_id=kurum_id)
        elif kurum_id:
            sube_qs = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).order_by('ad')
        else:
            sube_qs = Sube.objects.none()

        subeler = [
            {"id": sube.id, "ad": sube.ad, "kod": sube.kod}
            for sube in sube_qs
        ]

        egitim_yillari = [
            {"id": yil.id, "yil": f"{yil.baslangic_yil}-{yil.bitis_yil}", "aktif_mi": yil.aktif_mi}
            for yil in EgitimYili.objects.filter(aktif_mi=True).order_by("-baslangic_yil")
        ]

        return Response(
            {
                "lookups": lookups,
                "cities": cities,
                "rules": rules,
                "sinif_seviyeleri": sinif_seviyeleri,
                "alanlar": alanlar,
                "siniflar": siniflar,
                "subeler": subeler,
                "egitim_yillari": egitim_yillari,
            }
        )


class WizardDistrictView(APIView):
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        city_id = request.query_params.get("city_id")
        if not city_id:
            return Response({"detail": "city_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

        districts = [
            {"id": district.id, "ad": district.name}
            for district in LocationDistrict.objects.filter(city_id=city_id, is_active=True)
        ]
        return Response(districts)


@method_decorator(csrf_exempt, name='dispatch')
class DirectRegistrationView(APIView):
    """Doğrudan öğrenci kaydı - CSRF muaf"""
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def post(self, request):
        data = request.data
        kurum_id, sube_id, _, ctx_err = get_mandatory_context(request)
        if ctx_err:
            return Response({"detail": ctx_err['detail']}, status=ctx_err['status'])

        student_data = data.get("student", {})
        enrollment_data = data.get("enrollment", {})
        address_data = data.get("address", {})
        guardians_data = data.get("guardians", [])
        package_data = data.get("package", {})
        veli_secimi = data.get("veliSecimi")  # 'self' | 'add' | null

        # Zorunlu alan kontrolleri
        required_student_fields = ["tc_kimlik_no", "ad", "soyad", "dogum_tarihi"]
        for field in required_student_fields:
            if not student_data.get(field):
                return Response({"detail": f"{field} zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

        required_enrollment_fields = ["egitim_yili", "sinif_seviyesi"]
        for field in required_enrollment_fields:
            if not enrollment_data.get(field):
                return Response({"detail": f"{field} zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

        sinif_seviyesi = SinifSeviyesi.objects.filter(
            id=enrollment_data.get("sinif_seviyesi"), aktif_mi=True
        ).first()
        if sinif_seviyesi and sinif_seviyesi_requires_alan(sinif_seviyesi) and not enrollment_data.get("alan"):
            return Response({"detail": "alan zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

        # En az bir paket veya ek hizmet seçilmiş olmalı
        paketler = package_data.get("paketler", [])
        ek_hizmet_ids = package_data.get("ek_hizmet_ids", [])
        deneme_paketi_ids = package_data.get("deneme_paketi_ids", [])
        if not paketler and not ek_hizmet_ids and not deneme_paketi_ids:
            return Response(
                {"detail": "En az bir grup/özel ders paketi, ek hizmet veya deneme paketi seçiniz"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # Lookup değerlerini çöz
                kayit_turu_code = None
                if student_data.get("kayit_turu"):
                    kayit_turu_opt = LookupOption.objects.filter(id=student_data["kayit_turu"]).first()
                    kayit_turu_code = kayit_turu_opt.code if kayit_turu_opt else "asil"
                
                cinsiyet_code = None
                if student_data.get("cinsiyet"):
                    cinsiyet_opt = LookupOption.objects.filter(id=student_data["cinsiyet"]).first()
                    cinsiyet_code = cinsiyet_opt.code if cinsiyet_opt else None

                giris_turu_code = "yeni_kayit"
                if enrollment_data.get("giris_turu"):
                    giris_turu_opt = LookupOption.objects.filter(id=enrollment_data["giris_turu"]).first()
                    giris_turu_code = giris_turu_opt.code if giris_turu_opt else "yeni_kayit"

                # Öğrenci var mı kontrol et
                ogrenci = Ogrenci.objects.filter(
                    kurum_id=kurum_id,
                    tc_kimlik_no=student_data["tc_kimlik_no"],
                ).first()

                if not ogrenci:
                    ogrenci = Ogrenci.objects.create(
                        kurum_id=kurum_id,
                        sube_id=sube_id,
                        tc_kimlik_no=student_data["tc_kimlik_no"],
                        ad=student_data["ad"],
                        soyad=student_data["soyad"],
                        dogum_tarihi=student_data["dogum_tarihi"],
                        cinsiyet=cinsiyet_code,
                        telefon=normalize_phone(student_data.get("telefon") or ""),
                        email=student_data.get("email") or "",
                        kayit_turu=kayit_turu_code or "asil",
                        aktif_mi=True,
                    )
                elif ogrenci.sube_id != sube_id:
                    ogrenci.sube_id = sube_id
                    ogrenci.save(update_fields=['sube_id'])

                # Sınıf oluştur/bul
                egitim_yili = EgitimYili.objects.get(id=enrollment_data["egitim_yili"])
                sinif_seviyesi = SinifSeviyesi.objects.get(id=enrollment_data["sinif_seviyesi"])
                alan = Alan.objects.filter(id=enrollment_data.get("alan")).first() if enrollment_data.get("alan") else None
                
                sinif = None
                sinif_id = enrollment_data.get("sinif")
                if sinif_id:
                    from apps.sinif.domain.models import Sinif
                    sinif = Sinif.objects.filter(
                        id=sinif_id,
                        kurum_id=kurum_id,
                        sube_id=sube_id,
                        egitim_yili=egitim_yili,
                        aktif_mi=True,
                    ).first()
                    if not sinif:
                        return Response({"detail": "Seçilen sınıf bulunamadı veya bu şubeye ait değil"}, status=status.HTTP_400_BAD_REQUEST)
                    if sinif.sinif_seviyesi_id and sinif.sinif_seviyesi_id != sinif_seviyesi.id:
                        return Response({"detail": "Seçilen sınıf, sınıf seviyesi ile uyuşmuyor"}, status=status.HTTP_400_BAD_REQUEST)
                    if alan and sinif.alan_id and sinif.alan_id != alan.id:
                        return Response({"detail": "Seçilen sınıf, alan ile uyuşmuyor"}, status=status.HTTP_400_BAD_REQUEST)

                # Mevcut kayıt kontrolü
                existing_kayit = OgrenciKayit.objects.filter(
                    ogrenci=ogrenci,
                    egitim_yili=egitim_yili,
                ).first()

                if existing_kayit:
                    return Response({"detail": "Bu öğrenci bu eğitim yılında zaten kayıtlı"}, status=status.HTTP_400_BAD_REQUEST)

                # Kayıt oluştur — şube her zaman aktif bağlamdan (üst bar seçimi)
                if enrollment_data.get("sube") and int(enrollment_data["sube"]) != int(sube_id):
                    return Response(
                        {"detail": "Kayıt yalnızca seçili şube için yapılabilir. Lütfen üst bardan doğru şubeyi seçin."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                kayit = OgrenciKayit.objects.create(
                    ogrenci=ogrenci,
                    sinif=sinif,
                    egitim_yili=egitim_yili,
                    kurum_id=kurum_id,
                    sube_id=sube_id,
                    okul_no=enrollment_data.get("ogrenci_no") or "",
                    giris_turu=giris_turu_code,
                    giris_tarihi=enrollment_data.get("giris_tarihi"),
                    geldigi_okul=enrollment_data.get("geldigi_okul") or "",
                    referans=enrollment_data.get("referans") or "",
                )

                # Adres
                if address_data.get("acik_adres"):
                    adres_turu_code = "ev"
                    if address_data.get("adres_turu"):
                        adres_turu_opt = LookupOption.objects.filter(id=address_data["adres_turu"]).first()
                        adres_turu_code = adres_turu_opt.code if adres_turu_opt else "ev"
                    
                    il_name = ""
                    if address_data.get("il"):
                        il = LocationCity.objects.filter(id=address_data["il"]).first()
                        il_name = il.name if il else ""
                    
                    ilce_name = address_data.get("ilce_adi") or ""
                    if address_data.get("ilce"):
                        ilce = LocationDistrict.objects.filter(id=address_data["ilce"]).first()
                        ilce_name = ilce.name if ilce else ilce_name

                    OgrenciAdres.objects.create(
                        ogrenci=ogrenci,
                        adres_turu=adres_turu_code,
                        adres=address_data.get("acik_adres") or "",
                        il=il_name,
                        ilce=ilce_name,
                        posta_kodu=address_data.get("posta_kodu") or "",
                        varsayilan=True,
                    )

                # Veliler
                if veli_secimi == 'self':
                    # Öğrenci kendi velisi olarak kaydedilir
                    OgrenciVeli.objects.create(
                        ogrenci=ogrenci,
                        veli_turu='diger',
                        tc_kimlik_no=ogrenci.tc_kimlik_no or "",
                        ad=ogrenci.ad,
                        soyad=ogrenci.soyad,
                        telefon=ogrenci.telefon or "",
                        email=ogrenci.email or "",
                        ogrenci_kendi_velisi=True,
                        varsayilan=True,
                    )
                else:
                    for idx, guardian_data in enumerate(guardians_data):
                        if guardian_data.get("tc_kimlik_no") and guardian_data.get("ad"):
                            veli_turu_code = "anne"
                            if guardian_data.get("yakinlik_turu"):
                                veli_turu_opt = LookupOption.objects.filter(id=guardian_data["yakinlik_turu"]).first()
                                veli_turu_code = veli_turu_opt.code if veli_turu_opt else "anne"
                            
                            veli = OgrenciVeli.objects.create(
                                ogrenci=ogrenci,
                                veli_turu=veli_turu_code,
                                tc_kimlik_no=guardian_data.get("tc_kimlik_no") or "",
                                ad=guardian_data.get("ad") or "",
                                soyad=guardian_data.get("soyad") or "",
                                telefon=normalize_phone(guardian_data.get("telefon") or ""),
                                email=guardian_data.get("email") or "",
                                meslek=guardian_data.get("meslek") or "",
                                varsayilan=idx == 0,
                            )
                            
                            # Veli adresi - eğer farklı adres girildiyse kaydet
                            adres_ayni_mi = guardian_data.get("adres_ayni_mi", True)
                            veli_adres_data = guardian_data.get("adres")
                            if not adres_ayni_mi and veli_adres_data and veli_adres_data.get("acik_adres"):
                                veli_il_name = ""
                                if veli_adres_data.get("il"):
                                    veli_il = LocationCity.objects.filter(id=veli_adres_data["il"]).first()
                                    veli_il_name = veli_il.name if veli_il else ""
                                
                                veli_ilce_name = veli_adres_data.get("ilce_adi") or ""
                                if veli_adres_data.get("ilce"):
                                    veli_ilce = LocationDistrict.objects.filter(id=veli_adres_data["ilce"]).first()
                                    veli_ilce_name = veli_ilce.name if veli_ilce else veli_ilce_name
                                
                                # Veli adresi OgrenciAdres tablosuna kaydet (adres_turu='diger')
                                OgrenciAdres.objects.create(
                                    ogrenci=ogrenci,
                                    adres_turu="diger",
                                    adres=veli_adres_data.get("acik_adres") or "",
                                    il=veli_il_name,
                                    ilce=veli_ilce_name,
                                    posta_kodu=veli_adres_data.get("posta_kodu") or "",
                                    varsayilan=False,
                                )

                # Eğitim Paketleri
                from apps.egitim_paketleri.models import GrupDersi, OzelDers, Deneme, EkHizmet
                from apps.ogrenci.domain.models import OgrenciEkHizmet
                
                paket_listesi = package_data.get("paketler", [])
                for paket_id_str in paket_listesi:
                    # paket_id_str formatı: "kategori_dbId" (örn: "grup_dersleri_1")
                    if not paket_id_str or "_" not in paket_id_str:
                        continue
                    
                    parts = paket_id_str.rsplit("_", 1)
                    if len(parts) != 2:
                        continue
                    
                    kategori = parts[0]
                    try:
                        db_id = int(parts[1])
                    except ValueError:
                        continue
                    
                    # Kategori'den paket türü ve model belirle
                    paket_turu = None
                    paket_adi = ""
                    
                    if kategori == "grup_dersleri":
                        paket_turu = "grup_dersi"
                        paket_obj = GrupDersi.objects.filter(id=db_id).first()
                        if paket_obj:
                            paket_adi = paket_obj.ad
                    elif kategori == "ozel_dersler":
                        paket_turu = "ozel_ders"
                        paket_obj = OzelDers.objects.filter(id=db_id).first()
                        if paket_obj:
                            paket_adi = paket_obj.ad
                    elif kategori == "denemeler":
                        paket_turu = "deneme"
                        paket_obj = Deneme.objects.filter(id=db_id).first()
                        if paket_obj:
                            paket_adi = paket_obj.ad
                    
                    if paket_turu and paket_adi:
                        OgrenciEgitimPaketi.objects.create(
                            ogrenci=ogrenci,
                            paket_turu=paket_turu,
                            paket_id=db_id,
                            paket_adi=paket_adi,
                            aktif_mi=True,
                        )
                        
                        # GrupDersi ise dahil ek hizmetlerini otomatik ekle
                        if kategori == "grup_dersleri" and paket_obj:
                            try:
                                grup = GrupDersi.objects.prefetch_related(
                                    'dahil_ek_hizmetler', 'dahil_denemeler'
                                ).get(id=db_id)
                                inclusion_kwargs = {
                                    "sinif_seviyesi_id": enrollment_data.get("sinif_seviyesi"),
                                    "kurum_id": kurum_id,
                                    "sube_id": sube_id,
                                    "egitim_yili_id": egitim_yili.id if egitim_yili else None,
                                    "alan_id": enrollment_data.get("alan"),
                                }
                                attach_grup_dersi_ek_hizmetler(
                                    ogrenci,
                                    grup,
                                    egitim_yili,
                                    enrollment_data.get("giris_tarihi"),
                                    **inclusion_kwargs,
                                )
                                attach_grup_dersi_denemeler(
                                    ogrenci,
                                    grup,
                                    egitim_yili,
                                    enrollment_data.get("giris_tarihi"),
                                    **inclusion_kwargs,
                                )
                            except GrupDersi.DoesNotExist:
                                pass

                # Ek Hizmetler (ayrıca seçilenler, pakete dahil olmayanlar)
                ek_hizmet_ids = package_data.get("ek_hizmet_ids", [])
                for ek_hizmet_id in ek_hizmet_ids:
                    try:
                        ek_hizmet = EkHizmet.objects.get(id=ek_hizmet_id, aktif_mi=True)
                        OgrenciEkHizmet.objects.get_or_create(
                            ogrenci=ogrenci,
                            ek_hizmet=ek_hizmet,
                            aktif_mi=True,
                            defaults={
                                'fiyat': ek_hizmet.brut_fiyat,
                                'dahil_mi': False,
                                'kaynak_paket_turu': '',
                                'kaynak_paket_id': None,
                                'egitim_yili': egitim_yili,
                                'baslangic_tarihi': enrollment_data.get("giris_tarihi"),
                            }
                        )
                    except EkHizmet.DoesNotExist:
                        pass

                # Deneme Paketleri (ayrıca seçilenler)
                deneme_paketi_ids = package_data.get("deneme_paketi_ids", [])
                for deneme_paketi_id in deneme_paketi_ids:
                    try:
                        deneme_paketi = Deneme.objects.get(id=deneme_paketi_id, aktif_mi=True)
                        
                        # Bu deneme paketiyle ilişkili ek hizmet var mı? Yoksa oluştur
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
                                hizmet_turu='deneme',
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
                                'fiyat': deneme_paketi.fiyat,
                                'dahil_mi': False,
                                'kaynak_paket_turu': 'bireysel',
                                'egitim_yili': egitim_yili,
                                'baslangic_tarihi': enrollment_data.get("giris_tarihi"),
                            }
                        )
                    except Deneme.DoesNotExist:
                        pass

                return Response({
                    "id": ogrenci.id,
                    "kayit_id": kayit.id,
                    "ad": ogrenci.ad,
                    "soyad": ogrenci.soyad,
                    "tam_ad": f"{ogrenci.ad} {ogrenci.soyad}".strip(),
                    "ogrenci_no": kayit.okul_no,
                    "message": "Kayıt başarıyla tamamlandı",
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WizardNextStudentNumberView(APIView):
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        sinif_seviyesi_id = request.query_params.get("sinif_seviyesi")
        if not sinif_seviyesi_id:
            return Response({"detail": "sinif_seviyesi zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

        sinif_seviyesi = get_object_or_404(SinifSeviyesi, id=sinif_seviyesi_id)
        return Response({"next_number": generate_student_number(sinif_seviyesi)})


class WizardPackageView(APIView):
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def get(self, request):
        sinif_seviyesi_id = request.query_params.get("sinif_seviyesi")
        alan_id = request.query_params.get("alan")

        kurum_id, sube_id, egitim_yili_id, ctx_err = get_mandatory_context(request)
        if ctx_err:
            return Response({"detail": ctx_err['detail']}, status=ctx_err['status'])
        egitim_yili_param = request.query_params.get("egitim_yili")
        if egitim_yili_param:
            egitim_yili_id = int(egitim_yili_param)
        egitim_yili_id = resolve_wizard_egitim_yili_id(egitim_yili_id, kurum_id)

        packages = list_packages(
            int(sinif_seviyesi_id) if sinif_seviyesi_id else None,
            int(alan_id) if alan_id else None,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        )

        ek_hizmetler = list_ek_hizmetler(
            sinif_seviyesi_id=int(sinif_seviyesi_id) if sinif_seviyesi_id else None,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        )

        deneme_paketleri = list_deneme_paketleri(
            sinif_seviyesi_id=int(sinif_seviyesi_id) if sinif_seviyesi_id else None,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        )

        return Response({
            "packages": packages,
            "ek_hizmetler": ek_hizmetler,
            "deneme_paketleri": deneme_paketleri,
        })


@method_decorator(csrf_exempt, name='dispatch')
class WizardDraftViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]

    def create(self, request):
        kurum_id, sube_id = get_active_context(request)[:2]
        if not kurum_id or not sube_id:
            return Response({"detail": "Kurum/Şube bilgisi bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)

        draft = WizardDraft.objects.create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            created_by=request.user if request.user.is_authenticated else None,
            current_step=1,
        )
        return Response(WizardDraftSerializer(draft).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        draft = get_object_or_404(WizardDraft, pk=pk)
        return Response(WizardDraftSerializer(draft).data)

    def partial_update(self, request, pk=None):
        draft = get_object_or_404(WizardDraft, pk=pk)
        step = int(request.data.get("step", 0))

        if step == 1:
            serializer = DraftStudentSerializer(data=request.data.get("student", {}))
            serializer.is_valid(raise_exception=True)
            DraftStudent.objects.update_or_create(draft=draft, defaults=serializer.validated_data)
        elif step == 2:
            serializer = DraftEnrollmentSerializer(data=request.data.get("enrollment", {}))
            serializer.is_valid(raise_exception=True)
            DraftEnrollment.objects.update_or_create(
                draft=draft,
                defaults={
                    **serializer.validated_data,
                    "kaydi_alan": request.user if request.user.is_authenticated else None,
                },
            )
        elif step == 3:
            addresses = request.data.get("addresses", [])
            serializer = DraftAddressSerializer(data=addresses, many=True)
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                DraftAddress.objects.filter(draft=draft).delete()
                DraftAddress.objects.bulk_create(
                    [DraftAddress(draft=draft, **item) for item in serializer.validated_data]
                )
        elif step == 4:
            guardians = request.data.get("guardians", [])
            serializer = DraftGuardianSerializer(data=guardians, many=True)
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                DraftGuardian.objects.filter(draft=draft).delete()
                for item in serializer.validated_data:
                    sms_options = item.pop("sms_bildirimleri", [])
                    guardian = DraftGuardian.objects.create(draft=draft, **item)
                    guardian.sms_bildirimleri.set(sms_options)
        elif step == 5:
            packages = request.data.get("packages", [])
            serializer = DraftPackageSerializer(data=packages, many=True)
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                DraftPackageSelection.objects.filter(draft=draft).delete()
                DraftPackageSelection.objects.bulk_create(
                    [DraftPackageSelection(draft=draft, **item) for item in serializer.validated_data]
                )
        else:
            return Response({"detail": "Geçersiz adım"}, status=status.HTTP_400_BAD_REQUEST)

        draft.current_step = max(draft.current_step, step)
        draft.save(update_fields=["current_step", "last_saved_at"])
        return Response(WizardDraftSerializer(draft).data)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        draft = get_object_or_404(WizardDraft, pk=pk)
        kayit, error = submit_draft(draft, request.user if request.user.is_authenticated else None)
        if error:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"ogrenci_kayit_id": kayit.id})
