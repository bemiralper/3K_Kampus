"""
Kimlik çözümleme — TC / telefon ile cross-entity kişi arama.
"""
from __future__ import annotations

from django.db.models import Q

from apps.kimlik.application.kisi_service import KisiService
from apps.kimlik.domain.models import Kisi
from apps.kimlik.domain.phone import normalize_phone, phone_lookup_variants
from apps.personel.domain.user_account import resolve_personel_user
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.personel.domain.models import Personel, PersonelGorevlendirme


class KimlikResolver:
    CONTEXT_PERSONEL = 'personel'
    CONTEXT_OGRENCI = 'ogrenci'
    CONTEXT_VELI = 'veli'

    def __init__(self, kurum_id: int, sube_id: int | None = None):
        self.kurum_id = kurum_id
        self.sube_id = sube_id

    def resolve(
        self,
        tc: str | None = None,
        telefon: str | None = None,
        context: str | None = None,
        exclude_kisi_id: int | None = None,
    ) -> dict:
        tc = (tc or '').strip()
        telefon_norm = normalize_phone(telefon or '')

        if tc and (len(tc) != 11 or not tc.isdigit()):
            return {'found': False, 'detail': 'Geçersiz TC Kimlik No'}
        if not tc and not telefon_norm:
            return {'found': False, 'detail': 'TC veya telefon gerekli'}

        kisi = None
        if tc:
            kisi = Kisi.objects.filter(kurum_id=self.kurum_id, tc_kimlik_no=tc).first()
            if exclude_kisi_id and kisi and kisi.id == exclude_kisi_id:
                kisi = None

        roller = []
        uyarilar = []

        personel_qs = Personel.objects.filter(kurum_id=self.kurum_id)
        ogrenci_qs = Ogrenci.objects.filter(kurum_id=self.kurum_id)
        veli_qs = OgrenciVeli.objects.filter(ogrenci__kurum_id=self.kurum_id)

        if tc:
            personel_qs = personel_qs.filter(tc_kimlik_no=tc)
            ogrenci_qs = ogrenci_qs.filter(tc_kimlik_no=tc)
            veli_qs = veli_qs.filter(tc_kimlik_no=tc)
        else:
            phone_variants = phone_lookup_variants(telefon_norm)
            phone_q = Q()
            for v in phone_variants:
                phone_q |= Q(telefon__icontains=v) | Q(cep_telefon__icontains=v)
            personel_qs = personel_qs.filter(phone_q)
            og_phone_q = Q()
            for v in phone_variants:
                og_phone_q |= Q(telefon__icontains=v)
            ogrenci_qs = ogrenci_qs.filter(og_phone_q)
            vel_phone_q = Q()
            for v in phone_variants:
                vel_phone_q |= Q(telefon__icontains=v)
            veli_qs = veli_qs.filter(vel_phone_q)

        personeller = list(personel_qs.select_related('sube', 'user')[:5])
        ogrenciler = list(ogrenci_qs.select_related('sube')[:5])
        veliler = list(veli_qs.select_related('ogrenci', 'ogrenci__sube')[:10])

        if not kisi:
            for p in personeller:
                if p.kisi_id:
                    kisi = p.kisi
                    break
            if not kisi:
                for o in ogrenciler:
                    if o.kisi_id:
                        kisi = o.kisi
                        break
            if not kisi:
                for v in veliler:
                    if v.kisi_id:
                        kisi = v.kisi
                        break

        for p in personeller:
            subeler = self._personel_subeler(p)
            gorev = (
                PersonelGorevlendirme.objects.filter(personel=p, aktif_mi=True)
                .select_related('egitim_yili', 'gorev_sube')
                .order_by('-egitim_yili__baslangic_yil')
                .first()
            )
            roller.append({
                'tip': 'personel',
                'id': p.id,
                'kisi_id': p.kisi_id,
                'ad': p.ad,
                'soyad': p.soyad,
                'tam_ad': p.tam_ad,
                'subeler': subeler,
                'aktif_mi': p.aktif_mi,
                'has_user_account': resolve_personel_user(p) is not None,
                'son_gorev_yili': str(gorev.egitim_yili) if gorev and gorev.egitim_yili else '',
                'gorev_sube': gorev.gorev_sube.ad if gorev and gorev.gorev_sube else (p.sube.ad if p.sube else ''),
                'son_kayit_tarihi': p.created_at.isoformat() if p.created_at else '',
            })

        for o in ogrenciler:
            son_kayit = (
                OgrenciKayit.objects.filter(ogrenci=o)
                .select_related('egitim_yili', 'sube', 'sinif', 'sinif__sinif_seviyesi')
                .order_by('-egitim_yili__baslangic_yil')
                .first()
            )
            roller.append({
                'tip': 'ogrenci',
                'id': o.id,
                'kisi_id': o.kisi_id,
                'ad': o.ad,
                'soyad': o.soyad,
                'tam_ad': o.tam_ad,
                'subeler': [o.sube.ad] if o.sube else [],
                'aktif_mi': o.aktif_mi,
                'egitim_yili': (
                    f'{son_kayit.egitim_yili.baslangic_yil}-{son_kayit.egitim_yili.bitis_yil}'
                    if son_kayit and son_kayit.egitim_yili else ''
                ),
                'sinif_seviyesi': (
                    son_kayit.sinif.sinif_seviyesi.ad
                    if son_kayit and son_kayit.sinif and son_kayit.sinif.sinif_seviyesi else
                    (son_kayit.sinif_seviyesi.ad if son_kayit and son_kayit.sinif_seviyesi else '')
                ),
                'son_kayit_tarihi': son_kayit.created_at.isoformat() if son_kayit else o.created_at.isoformat(),
            })

        if veliler:
            seen_veli_kisi = set()
            bagli = []
            ref_veli = veliler[0]
            for v in veliler:
                bagli.append({
                    'id': v.ogrenci_id,
                    'ad': v.ogrenci.ad,
                    'soyad': v.ogrenci.soyad,
                    'yakinlik': v.get_veli_turu_display(),
                })
                if v.kisi_id:
                    seen_veli_kisi.add(v.kisi_id)
            roller.append({
                'tip': 'veli',
                'id': ref_veli.id,
                'kisi_id': ref_veli.kisi_id,
                'ad': ref_veli.ad,
                'soyad': ref_veli.soyad,
                'tam_ad': ref_veli.tam_ad,
                'telefon': ref_veli.telefon,
                'email': ref_veli.email,
                'meslek': ref_veli.meslek,
                'veli_turu': ref_veli.veli_turu,
                'veli_turu_display': ref_veli.get_veli_turu_display(),
                'bagli_ogrenciler': bagli,
                'ogrenci_sayisi': len(bagli),
                'son_kayit_tarihi': ref_veli.created_at.isoformat() if ref_veli.created_at else '',
            })

        if not roller and not kisi:
            engellenen, engellenen_mesaj = self._evaluate_engellenen(
                tc=tc,
                telefon_norm=telefon_norm,
                context=context,
                roller=roller,
                exclude_kisi_id=exclude_kisi_id,
            )
            if engellenen and telefon_norm:
                tel_kisi = Kisi.objects.filter(
                    kurum_id=self.kurum_id,
                    telefon=telefon_norm,
                ).exclude(telefon='').first()
                if exclude_kisi_id and tel_kisi and tel_kisi.id == exclude_kisi_id:
                    tel_kisi = None
                return {
                    'found': True,
                    'kisi': self._kisi_payload(tel_kisi) if tel_kisi else None,
                    'roller': [],
                    'ortak_alanlar': None,
                    'uyarilar': [engellenen_mesaj] if engellenen_mesaj else [],
                    'engellenen': True,
                    'engellenen_mesaj': engellenen_mesaj,
                    'eslesme': 'telefon',
                }
            return {'found': False}

        tip_set = {r['tip'] for r in roller}
        if len(tip_set) > 1:
            if context == self.CONTEXT_VELI and 'personel' in tip_set:
                uyarilar.append('Bu kişi sistemde Personel olarak kayıtlı. Veli olarak da kullanılabilir.')
            elif context == self.CONTEXT_OGRENCI and 'personel' in tip_set:
                uyarilar.append('Bu kişi sistemde Personel olarak kayıtlı. Öğrenci kaydı için mevcut bilgiler kullanılabilir.')
            elif context == self.CONTEXT_PERSONEL and 'ogrenci' in tip_set:
                uyarilar.append('Bu kişi sistemde Öğrenci olarak da kayıtlı.')

        if tc and telefon_norm and kisi:
            if kisi.telefon and kisi.telefon != telefon_norm:
                uyarilar.append('Kayıtlı telefon numarası farklı; birleştirme kontrolü gerekebilir.')

        engellenen, engellenen_mesaj = self._evaluate_engellenen(
            tc=tc,
            telefon_norm=telefon_norm,
            context=context,
            roller=roller,
            exclude_kisi_id=exclude_kisi_id,
        )
        if engellenen_mesaj:
            uyarilar.append(engellenen_mesaj)

        ortak = None
        if kisi:
            ortak = KisiService.ortak_alanlar_dict(kisi)
        elif roller:
            ref = roller[0]
            ortak = {
                'ad': ref.get('ad', ''),
                'soyad': ref.get('soyad', ''),
                'tc_kimlik_no': tc,
                'telefon': telefon_norm or ref.get('telefon', ''),
            }

        return {
            'found': True,
            'kisi': self._kisi_payload(kisi) if kisi else None,
            'roller': roller,
            'ortak_alanlar': ortak,
            'uyarilar': uyarilar,
            'engellenen': engellenen,
            'engellenen_mesaj': engellenen_mesaj or '',
            'eslesme': 'tc' if tc else 'telefon',
        }

    def _evaluate_engellenen(
        self,
        *,
        tc: str,
        telefon_norm: str,
        context: str | None,
        roller: list[dict],
        exclude_kisi_id: int | None,
    ) -> tuple[bool, str]:
        """Kayıt devam ettirilemez durumlar (modal apply devre dışı)."""
        if telefon_norm:
            qs = Kisi.objects.filter(kurum_id=self.kurum_id, telefon=telefon_norm).exclude(telefon='')
            if exclude_kisi_id:
                qs = qs.exclude(id=exclude_kisi_id)
            tel_kisi = qs.first()
            if tel_kisi and tc and tel_kisi.tc_kimlik_no and tel_kisi.tc_kimlik_no != tc:
                return True, (
                    f'Bu telefon numarası {tel_kisi.tam_ad} adlı kişiye ait. '
                    'Farklı TC ile kayıt yapılamaz.'
                )

        if context == self.CONTEXT_OGRENCI and tc:
            ogrenci = Ogrenci.objects.filter(kurum_id=self.kurum_id, tc_kimlik_no=tc).first()
            if ogrenci:
                from apps.egitim_yili.domain.models import EgitimYili

                aktif_yil = EgitimYili.objects.filter(aktif_mi=True).first()
                if aktif_yil and OgrenciKayit.objects.filter(
                    ogrenci=ogrenci,
                    egitim_yili=aktif_yil,
                ).exists():
                    return True, 'Bu öğrenci aktif eğitim yılında zaten kayıtlı.'

        return False, ''

    def _kisi_payload(self, kisi: Kisi) -> dict:
        return {
            'id': kisi.id,
            'ad': kisi.ad,
            'soyad': kisi.soyad,
            'tam_ad': kisi.tam_ad,
            'tc_kimlik_no': kisi.tc_kimlik_no or '',
            'telefon': kisi.telefon,
            'dogum_tarihi': str(kisi.dogum_tarihi) if kisi.dogum_tarihi else '',
            'cinsiyet': kisi.cinsiyet or '',
            'email': kisi.email,
            'adres': kisi.adres,
            'il': kisi.il,
            'ilce': kisi.ilce,
            'aktif_mi': kisi.aktif_mi,
        }

    def _personel_subeler(self, personel: Personel) -> list[str]:
        sube_adlari = set()
        if personel.sube:
            sube_adlari.add(personel.sube.ad)
        for g in PersonelGorevlendirme.objects.filter(personel=personel, aktif_mi=True).select_related('gorev_sube'):
            if g.gorev_sube:
                sube_adlari.add(g.gorev_sube.ad)
        return sorted(sube_adlari)

    def check_phone_tc_conflict(self, tc: str | None, telefon: str | None, exclude_kisi_id: int | None = None) -> list[str]:
        """Soft validation — uyarı mesajları."""
        warnings = []
        tc = (tc or '').strip()
        telefon_norm = normalize_phone(telefon or '')
        if not tc and not telefon_norm:
            return warnings

        if telefon_norm:
            qs = Kisi.objects.filter(kurum_id=self.kurum_id, telefon=telefon_norm)
            if exclude_kisi_id:
                qs = qs.exclude(id=exclude_kisi_id)
            existing = qs.first()
            if existing and tc and existing.tc_kimlik_no and existing.tc_kimlik_no != tc:
                warnings.append(
                    f'Bu telefon numarası farklı bir kişiye ({existing.tam_ad}) ait.'
                )

        if tc:
            qs = Kisi.objects.filter(kurum_id=self.kurum_id, tc_kimlik_no=tc)
            if exclude_kisi_id:
                qs = qs.exclude(id=exclude_kisi_id)
            existing = qs.first()
            if existing and telefon_norm and existing.telefon and existing.telefon != telefon_norm:
                warnings.append(
                    f'Bu TC Kimlik No farklı telefon ile kayıtlı ({existing.tam_ad}).'
                )
        return warnings
