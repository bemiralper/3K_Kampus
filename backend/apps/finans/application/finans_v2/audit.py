"""
Finans Audit (İşlem Log) servisi.

Kritik finans işlemlerini merkezi FinansIslemLog tablosuna yazar. Loglama asla
ana işlemi bozmaz (hata durumunda sessizce geçer) — audit ikincil bir kaygıdır.
"""
from __future__ import annotations

import logging

from apps.finans.domain.finans_islem_log import FinansIslemLog

logger = logging.getLogger(__name__)


class FinansAuditService:
    @staticmethod
    def log(*, kurum_id, modul, eylem, kayit_tip='', kayit_id=None,
            aciklama='', tutar=None, detay=None, kullanici=None,
            sube_id=None, ip_adresi=None):
        """Bir denetim kaydı oluşturur. Hata olursa yalnızca loglar."""
        try:
            user = kullanici if (kullanici and getattr(kullanici, 'is_authenticated', False)) else None
            FinansIslemLog.objects.create(
                kurum_id=kurum_id,
                sube_id=sube_id,
                modul=modul,
                eylem=eylem,
                kayit_tip=kayit_tip or '',
                kayit_id=kayit_id,
                aciklama=(aciklama or '')[:255],
                tutar=tutar,
                detay=detay,
                kullanici=user,
                ip_adresi=ip_adresi,
            )
        except Exception:  # pragma: no cover - audit asla ana akışı bozmaz
            logger.exception('Finans audit log yazılamadı')

    @staticmethod
    def list(kurum_id, *, sube_id=None, modul=None, kayit_tip=None,
             kayit_id=None, limit=200):
        qs = FinansIslemLog.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if modul:
            qs = qs.filter(modul=modul)
        if kayit_tip:
            qs = qs.filter(kayit_tip=kayit_tip)
        if kayit_id:
            qs = qs.filter(kayit_id=kayit_id)
        qs = qs.select_related('kullanici')[:limit]
        return [
            {
                'id': o.id,
                'modul': o.modul,
                'eylem': o.eylem,
                'kayit_tip': o.kayit_tip,
                'kayit_id': o.kayit_id,
                'aciklama': o.aciklama,
                'tutar': str(o.tutar) if o.tutar is not None else None,
                'kullanici': (o.kullanici.get_full_name() or o.kullanici.username) if o.kullanici else None,
                'created_at': o.created_at.isoformat(),
            }
            for o in qs
        ]


def get_client_ip(request):
    """İstekten IP adresini güvenle çıkarır."""
    if request is None:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
