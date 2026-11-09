"""Tek deneme satışları için salt okunur canlı kontrolü."""
import json
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.odeme_takip.domain.contract_scope import DENEME_SATIS_MARKER
from apps.odeme_takip.domain.enums import SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme
from apps.ogrenci_kayit.application.deneme_ucret import _gelir_id


class Command(BaseCommand):
    help = 'Tek deneme satış izlerini ve gerçek tahsilat farklarını listeler; veri değiştirmez.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, required=True)
        parser.add_argument('--sube-id', type=int, required=True)
        parser.add_argument('--egitim-yili-id', type=int)

    def handle(self, *args, **options):
        qs = Sozlesme.objects.filter(
            kurum_id=options['kurum_id'], sube_id=options['sube_id'],
            notlar__contains=DENEME_SATIS_MARKER,
        ).order_by('id')
        if options['egitim_yili_id']:
            qs = qs.filter(egitim_yili_id=options['egitim_yili_id'])
        rows = []
        for sale in qs.iterator():
            paid = Decimal(str(sale.toplam_odenen))
            cancelled = sale.durum == SozlesmeDurum.IPTAL
            expected = Decimal('0') if cancelled else Decimal(sale.net_tutar)
            rows.append({
                'satis_izi_id': sale.pk, 'ogrenci_id': sale.ogrenci_id,
                'gelir_id': _gelir_id(sale.notlar), 'iptal': cancelled,
                'tutar': str(expected), 'gercek_tahsilat': str(paid),
                'fark': str(expected - paid),
                'inceleme_gerekli': expected != paid,
            })
        self.stdout.write(json.dumps({
            'salt_okunur': True, 'satis_izi_sayisi': len(rows),
            'inceleme_gereken': sum(row['inceleme_gerekli'] for row in rows),
            'kayitlar': rows,
        }, ensure_ascii=False))
