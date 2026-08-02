"""
Kişi oluşturma, bağlama ve senkronizasyon.
"""
from __future__ import annotations

from django.db import transaction

from apps.kimlik.domain.models import Kisi
from apps.kimlik.domain.phone import normalize_phone
from apps.kimlik.exceptions import KimlikConflictError


class KisiService:
    @staticmethod
    def find_by_identifiers(kurum_id: int, tc: str | None = None, telefon: str | None = None) -> Kisi | None:
        tc = (tc or '').strip()
        telefon_norm = normalize_phone(telefon or '')
        if tc:
            kisi = Kisi.objects.filter(kurum_id=kurum_id, tc_kimlik_no=tc).first()
            if kisi:
                return kisi
        if telefon_norm:
            kisi = Kisi.objects.filter(kurum_id=kurum_id, telefon=telefon_norm).exclude(telefon='').first()
            if kisi and KisiService.release_orphaned_phone(kisi):
                return None
            return kisi
        return None

    @staticmethod
    def _linked_role_ids(kisi: Kisi) -> tuple[bool, bool, bool]:
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.personel.domain.models import Personel

        has_personel = Personel.objects.filter(kisi_id=kisi.id).exists()
        has_ogrenci = Ogrenci.objects.filter(kisi_id=kisi.id).exists()
        has_veli = OgrenciVeli.objects.filter(kisi_id=kisi.id).exists()
        return has_personel, has_ogrenci, has_veli

    @staticmethod
    def _role_uses_phone(kisi: Kisi, telefon_norm: str) -> bool:
        """Bağlı personel/öğrenci/veli kayıtlarından biri hâlâ bu telefonu kullanıyor mu?"""
        if not telefon_norm:
            return False
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.personel.domain.models import Personel

        for p in Personel.objects.filter(kisi_id=kisi.id).only('telefon', 'cep_telefon'):
            if normalize_phone(p.cep_telefon or p.telefon or '') == telefon_norm:
                return True
        for o in Ogrenci.objects.filter(kisi_id=kisi.id).only('telefon'):
            if normalize_phone(o.telefon or '') == telefon_norm:
                return True
        for v in OgrenciVeli.objects.filter(kisi_id=kisi.id).only('telefon'):
            if normalize_phone(v.telefon or '') == telefon_norm:
                return True
        return False

    @staticmethod
    def release_orphaned_phone(kisi: Kisi) -> bool:
        """Rolü olan kişide telefon artık hiçbir rolde yoksa Kisi.telefon'u temizle."""
        telefon_norm = normalize_phone(kisi.telefon or '')
        if not telefon_norm:
            return False
        has_p, has_o, has_v = KisiService._linked_role_ids(kisi)
        if not (has_p or has_o or has_v):
            # Henüz role bağlanmamış Kisi kaydı telefonu sahiplenir
            return False
        if KisiService._role_uses_phone(kisi, telefon_norm):
            return False
        kisi.telefon = ''
        kisi.save(update_fields=['telefon', 'updated_at'])
        return True

    @staticmethod
    def assert_unique(
        kurum_id: int,
        tc: str | None = None,
        telefon: str | None = None,
        exclude_kisi_id: int | None = None,
    ) -> None:
        tc = (tc or '').strip()
        telefon_norm = normalize_phone(telefon or '')

        if tc:
            qs = Kisi.objects.filter(kurum_id=kurum_id, tc_kimlik_no=tc)
            if exclude_kisi_id:
                qs = qs.exclude(id=exclude_kisi_id)
            existing = qs.first()
            if existing:
                raise KimlikConflictError(
                    f'Bu TC Kimlik No sistemde kayıtlı: {existing.tam_ad}',
                    code='duplicate_tc',
                    details={'field': 'tc_kimlik_no', 'kisi_id': existing.id, 'existing_name': existing.tam_ad},
                )

        if telefon_norm:
            qs = Kisi.objects.filter(kurum_id=kurum_id, telefon=telefon_norm).exclude(telefon='')
            if exclude_kisi_id:
                qs = qs.exclude(id=exclude_kisi_id)
            existing = qs.first()
            if existing:
                # Silinen/değişen numaralar Kisi üzerinde kalmış olabilir — rol kullanmıyorsa serbest bırak
                if KisiService.release_orphaned_phone(existing):
                    return
                if tc and existing.tc_kimlik_no and existing.tc_kimlik_no != tc:
                    raise KimlikConflictError(
                        f'Bu telefon numarası farklı bir kişiye ait: {existing.tam_ad}',
                        code='phone_tc_mismatch',
                        details={'field': 'telefon', 'kisi_id': existing.id, 'existing_tc': existing.tc_kimlik_no},
                    )
                raise KimlikConflictError(
                    f'Bu telefon numarası sistemde kayıtlı: {existing.tam_ad}',
                    code='duplicate_telefon',
                    details={'field': 'telefon', 'kisi_id': existing.id, 'existing_name': existing.tam_ad},
                )

    @staticmethod
    def create_from_profile(kurum_id: int, profile: dict, *, exclude_kisi_id: int | None = None) -> Kisi:
        telefon = normalize_phone(profile.get('telefon') or profile.get('cep_telefon') or '')
        tc = profile.get('tc_kimlik_no') or None
        KisiService.assert_unique(kurum_id, tc, telefon, exclude_kisi_id=exclude_kisi_id)
        return Kisi.objects.create(
            kurum_id=kurum_id,
            tc_kimlik_no=tc,
            telefon=telefon,
            ad=(profile.get('ad') or '').strip(),
            soyad=(profile.get('soyad') or '').strip(),
            dogum_tarihi=profile.get('dogum_tarihi') or None,
            cinsiyet=profile.get('cinsiyet') or None,
            email=(profile.get('email') or '').strip(),
            adres=(profile.get('adres') or '').strip(),
            il=(profile.get('il') or '').strip(),
            ilce=(profile.get('ilce') or '').strip(),
            aktif_mi=profile.get('aktif_mi', True),
        )

    @staticmethod
    @transaction.atomic
    def sync_from_profile(
        kisi: Kisi,
        profile: dict,
        fields: list[str] | None = None,
        *,
        clear_empty: bool = False,
    ) -> Kisi:
        """Kisi ortak alanlarını güncelle.

        clear_empty=True iken telefon/email gibi alanlar boş string ile temizlenebilir
        (personel telefon silme senaryosu).
        """
        allowed = fields or [
            'ad', 'soyad', 'dogum_tarihi', 'cinsiyet', 'email', 'adres', 'il', 'ilce', 'telefon', 'tc_kimlik_no',
        ]
        pending_tc = profile.get('tc_kimlik_no') if 'tc_kimlik_no' in allowed else None
        phone_key_present = 'telefon' in profile or 'cep_telefon' in profile
        pending_tel = None
        if 'telefon' in allowed and phone_key_present:
            pending_tel = normalize_phone(profile.get('telefon') or profile.get('cep_telefon') or '')

        if pending_tc or pending_tel:
            KisiService.assert_unique(
                kisi.kurum_id,
                pending_tc,
                pending_tel,
                exclude_kisi_id=kisi.id,
            )

        update_fields = []
        for field in allowed:
            if field == 'telefon':
                if not phone_key_present and not clear_empty:
                    continue
                value = normalize_phone(profile.get('telefon') or profile.get('cep_telefon') or '')
            elif field == 'tc_kimlik_no':
                value = profile.get('tc_kimlik_no') or None
            else:
                value = profile.get(field)
                if isinstance(value, str):
                    value = value.strip()
            if value is not None and value != '':
                setattr(kisi, field, value)
                update_fields.append(field)
            elif clear_empty and field == 'telefon' and phone_key_present:
                setattr(kisi, field, '')
                update_fields.append(field)
        if update_fields:
            kisi.save(update_fields=update_fields + ['updated_at'])
        return kisi

    @staticmethod
    def link_personel(personel, kisi: Kisi | None = None) -> Kisi:
        if kisi is None:
            kisi = KisiService.find_by_identifiers(
                personel.kurum_id,
                personel.tc_kimlik_no,
                personel.cep_telefon or personel.telefon,
            )
        if kisi is None:
            kisi = KisiService.create_from_profile(personel.kurum_id, {
                'tc_kimlik_no': personel.tc_kimlik_no,
                'ad': personel.ad,
                'soyad': personel.soyad,
                'dogum_tarihi': personel.dogum_tarihi,
                'cinsiyet': personel.cinsiyet,
                'telefon': personel.cep_telefon or personel.telefon,
                'email': personel.email,
                'adres': personel.adres,
                'il': personel.il,
                'ilce': personel.ilce,
                'aktif_mi': personel.aktif_mi,
            })
        if personel.kisi_id != kisi.id:
            personel.kisi = kisi
            personel.save(update_fields=['kisi_id', 'updated_at'])
        return kisi

    @staticmethod
    def link_ogrenci(ogrenci, kisi: Kisi | None = None) -> Kisi:
        if kisi is None:
            kisi = KisiService.find_by_identifiers(
                ogrenci.kurum_id,
                ogrenci.tc_kimlik_no,
                ogrenci.telefon,
            )
        if kisi is None:
            kisi = KisiService.create_from_profile(ogrenci.kurum_id, {
                'tc_kimlik_no': ogrenci.tc_kimlik_no,
                'ad': ogrenci.ad,
                'soyad': ogrenci.soyad,
                'dogum_tarihi': ogrenci.dogum_tarihi,
                'cinsiyet': ogrenci.cinsiyet,
                'telefon': ogrenci.telefon,
                'email': ogrenci.email,
                'adres': ogrenci.adres,
                'aktif_mi': ogrenci.aktif_mi,
            })
        if ogrenci.kisi_id != kisi.id:
            ogrenci.kisi = kisi
            ogrenci.save(update_fields=['kisi_id', 'updated_at'])
        return kisi

    @staticmethod
    def link_veli(veli, kisi: Kisi | None = None) -> Kisi:
        if kisi is None:
            kisi = KisiService.find_by_identifiers(
                veli.ogrenci.kurum_id,
                veli.tc_kimlik_no,
                veli.telefon,
            )
        if kisi is None:
            kisi = KisiService.create_from_profile(veli.ogrenci.kurum_id, {
                'tc_kimlik_no': veli.tc_kimlik_no or None,
                'ad': veli.ad,
                'soyad': veli.soyad,
                'telefon': veli.telefon,
                'email': veli.email,
                'aktif_mi': True,
            })
        if veli.kisi_id != kisi.id:
            veli.kisi = kisi
            veli.save(update_fields=['kisi_id', 'updated_at'])
        return kisi

    @staticmethod
    def resolve_kisi_id_for_entity(*, ogrenci_id=None, veli_id=None, personel_id=None) -> int | None:
        if personel_id:
            from apps.personel.domain.models import Personel
            p = Personel.objects.filter(id=personel_id).only('kisi_id').first()
            if p and p.kisi_id:
                return p.kisi_id
        if ogrenci_id:
            from apps.ogrenci.domain.models import Ogrenci
            o = Ogrenci.objects.filter(id=ogrenci_id).only('kisi_id').first()
            if o and o.kisi_id:
                return o.kisi_id
        if veli_id:
            from apps.ogrenci.domain.models import OgrenciVeli
            v = OgrenciVeli.objects.filter(id=veli_id).only('kisi_id').first()
            if v and v.kisi_id:
                return v.kisi_id
        return None

    @staticmethod
    def ortak_alanlar_dict(kisi: Kisi) -> dict:
        return {
            'ad': kisi.ad,
            'soyad': kisi.soyad,
            'tc_kimlik_no': kisi.tc_kimlik_no or '',
            'telefon': kisi.telefon,
            'dogum_tarihi': str(kisi.dogum_tarihi) if kisi.dogum_tarihi else '',
            'cinsiyet': kisi.cinsiyet or '',
            'email': kisi.email,
            'adres': kisi.adres,
            'il': kisi.il,
            'ilce': kisi.ilce,
        }
