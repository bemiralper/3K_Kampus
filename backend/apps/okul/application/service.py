"""Okul uygulama servisi."""
import re

from django.db import IntegrityError

from apps.okul.infrastructure.repository import OkulRepository


def normalize_okul_ad(ad: str) -> str:
    return re.sub(r'\s+', ' ', (ad or '').strip())


class OkulService:
    def list_okullar(self, sube_id: int, params: dict | None = None):
        params = params or {}
        qs = OkulRepository.get_all(sube_id)

        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(ad__icontains=search)

        okul_turu = (params.get('okul_turu') or '').strip()
        if okul_turu:
            qs = qs.filter(okul_turu__icontains=okul_turu)

        il = (params.get('il') or '').strip()
        if il:
            qs = qs.filter(il__icontains=il)

        ilce = (params.get('ilce') or '').strip()
        if ilce:
            qs = qs.filter(ilce__icontains=ilce)

        aktif_mi = params.get('aktif_mi')
        if aktif_mi in ('true', '1', 'yes'):
            qs = qs.filter(aktif_mi=True)
        elif aktif_mi in ('false', '0', 'no'):
            qs = qs.filter(aktif_mi=False)

        return qs.order_by('ad')

    def autocomplete(self, sube_id: int, query: str, *, limit: int = 20, aktif_only: bool = True):
        qs = OkulRepository.get_all(sube_id)
        if aktif_only:
            qs = qs.filter(aktif_mi=True)
        q = (query or '').strip()
        if q:
            qs = qs.filter(ad__icontains=q)
        return qs.order_by('ad')[:limit]

    def get_okul(self, okul_id: int, sube_id: int):
        return OkulRepository.get_by_id(okul_id, sube_id)

    def create_okul(self, data: dict):
        ad = normalize_okul_ad(data.get('ad', ''))
        if not ad:
            raise ValueError('Okul adı zorunludur.')
        payload = {
            **data,
            'ad': ad,
            'okul_turu': (data.get('okul_turu') or '').strip(),
            'il': (data.get('il') or '').strip(),
            'ilce': (data.get('ilce') or '').strip(),
            'not_metni': (data.get('not_metni') or '').strip(),
            'aktif_mi': data.get('aktif_mi', True),
        }
        try:
            return OkulRepository.create(payload)
        except IntegrityError as exc:
            raise ValueError('Bu şubede aynı okul adı zaten kayıtlı.') from exc

    def update_okul(self, okul_id: int, data: dict, sube_id: int):
        okul = OkulRepository.get_by_id(okul_id, sube_id)
        if not okul:
            return None
        update_data = {}
        if 'ad' in data:
            ad = normalize_okul_ad(data.get('ad', ''))
            if not ad:
                raise ValueError('Okul adı zorunludur.')
            update_data['ad'] = ad
        for field in ('okul_turu', 'il', 'ilce', 'not_metni', 'aktif_mi'):
            if field in data:
                value = data[field]
                if isinstance(value, str):
                    value = value.strip()
                update_data[field] = value
        try:
            return OkulRepository.update(okul_id, update_data, sube_id)
        except IntegrityError as exc:
            raise ValueError('Bu şubede aynı okul adı zaten kayıtlı.') from exc

    def delete_info(self, okul_id: int, sube_id: int):
        okul = OkulRepository.get_by_id(okul_id, sube_id)
        if not okul:
            return None
        ogrenci_sayisi = OkulRepository.count_students(okul_id, sube_id)
        return {
            'okul_id': okul.id,
            'ogrenci_sayisi': ogrenci_sayisi,
            'can_delete': ogrenci_sayisi == 0,
        }

    def delete_okul(self, okul_id: int, sube_id: int):
        info = self.delete_info(okul_id, sube_id)
        if not info:
            return None, 'not_found'
        if not info['can_delete']:
            return None, 'in_use'
        OkulRepository.delete(okul_id, sube_id)
        return True, None
