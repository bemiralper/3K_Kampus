"""Eski bakiyeden-mahsup ALACAK/MAHSUP cari satırlarını önizle veya ters kayıtla dengele."""
import json

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.legacy_mahsup import (
    dengelenmemis_mahsuplar,
    mahsup_ters_kaydi_yaz,
)
from apps.finans.domain.gider_odeme import GiderOdeme


def _rapor_satiri(aday):
    return {**aday, 'net': str(aday['net'])}


class Command(BaseCommand):
    help = (
        'Ters kaydı eksik eski mahsup cari satırlarını listeler. '
        '--apply ile her biri için BORÇ/MAHSUP ters kaydı yazar; satır silinmez.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int)
        parser.add_argument('--sube-id', type=int)
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        if connection.in_atomic_block:
            raise CommandError('Komut mevcut bir transaction içinde çalıştırılamaz.')
        filtre = {'kurum_id': options['kurum_id'], 'sube_id': options['sube_id']}

        if not options['apply']:
            with transaction.atomic():
                if connection.vendor == 'postgresql':
                    with connection.cursor() as cursor:
                        cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                adaylar = dengelenmemis_mahsuplar(**filtre)
            self.stdout.write(json.dumps({
                'apply': False,
                'aday_sayisi': len(adaylar),
                'adaylar': [_rapor_satiri(a) for a in adaylar],
            }, ensure_ascii=False, indent=2))
            return

        service = CariHareketService()
        duzeltilen = []
        for aday in dengelenmemis_mahsuplar(**filtre):
            with transaction.atomic():
                odeme = (
                    GiderOdeme.objects.select_for_update()
                    .select_related('gider_kaydi')
                    .get(pk=aday['odeme_id'])
                )
                yazilan = mahsup_ters_kaydi_yaz(
                    odeme,
                    cari_hareket_service=service,
                    aciklama=(
                        f'Eski mahsup düzeltmesi: '
                        f'{odeme.gider_kaydi.fatura_no or "Belgesiz"} — ödeme #{odeme.pk}'
                    ),
                )
            if yazilan > 0:
                duzeltilen.append({**_rapor_satiri(aday), 'yazilan': str(yazilan)})
        self.stdout.write(json.dumps({
            'apply': True,
            'duzeltilen_sayisi': len(duzeltilen),
            'duzeltilen': duzeltilen,
        }, ensure_ascii=False, indent=2))
