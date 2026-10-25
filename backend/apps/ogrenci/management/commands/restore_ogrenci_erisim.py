"""audit_ogrenci_erisim günlüğünü geri alır.

Satırın bugünkü değeri günlüğe yazılan sonraki değerle aynıysa önceki haline döner.
Arada başka bir işlem değiştirdiyse satır atlanır.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = 'Erişim onarım günlüğünü, sonraki değer hâlâ duruyorsa geri alır'

    def add_arguments(self, parser):
        parser.add_argument('--journal', required=True)
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        path = Path(options['journal'])
        if not path.is_file():
            raise CommandError(f'Günlük yok: {path}')
        payload = json.loads(path.read_text(encoding='utf-8'))
        changes = payload.get('degisiklikler') or []
        apply = options['apply']
        restored = skipped = 0
        with transaction.atomic():
            for change in changes:
                if self._restore(change, apply=apply):
                    restored += 1
                else:
                    skipped += 1
            if not apply:
                transaction.set_rollback(True)
        eylem = 'geri alındı' if apply else 'geri alınacak'
        self.stdout.write(self.style.SUCCESS(
            f'{restored} satır {eylem}, {skipped} satır atlandı (sonraki değer değişmiş veya kayıt yok).'
        ))
        if not apply:
            self.stdout.write('Salt okunur. Yazmak için --apply kullanın.')

    def _restore(self, change, *, apply):
        once = change.get('once')
        sonra = change.get('sonra')
        if not sonra:
            return False
        current = self._current(sonra)
        if current is None or not self._same(current, sonra):
            return False
        if not apply:
            return True
        if once is None:
            current.aktif_mi = False
            current.save(update_fields=['aktif_mi', 'updated_at'])
            return True
        if apply:
            if current._meta.model_name == 'ogrenciekhizmet':
                current.aktif_mi = once['aktif_mi']
                current.egitim_yili_id = once['egitim_yili_id']
                current.save(update_fields=['aktif_mi', 'egitim_yili', 'updated_at'])
            else:
                current.aktif_mi = once['aktif_mi']
                current.save(update_fields=['aktif_mi', 'updated_at'])
        return True

    def _current(self, state):
        if not state or not state.get('id'):
            return None
        if state['model'] == 'ek_hizmet':
            from apps.ogrenci.domain.models import OgrenciEkHizmet
            return OgrenciEkHizmet.objects.filter(pk=state['id']).first()
        from apps.ogrenci.domain.models import OgrenciEgitimPaketi
        return OgrenciEgitimPaketi.objects.filter(pk=state['id']).first()

    def _same(self, row, state):
        if state is None:
            return False
        if state['model'] == 'ek_hizmet':
            return (
                row.aktif_mi == state['aktif_mi']
                and row.egitim_yili_id == state['egitim_yili_id']
                and row.ek_hizmet_id == state['ek_hizmet_id']
            )
        return (
            row.aktif_mi == state['aktif_mi']
            and row.paket_turu == state['paket_turu']
            and row.paket_id == state['paket_id']
        )
