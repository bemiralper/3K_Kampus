"""Sözleşme ile öğrenci hizmet/paket erişimini karşılaştırır.

Varsayılan salt okunurdur. Yazmak için --apply ve --journal gerekir.
--apply katalogdan yeni dahil hizmet üretmez. Günlük, değişiklikten sonraki
değer hâlâ duruyorsa geri alınabilir; arada yeni bir kayıt olduysa o satır atlanır.

    python manage.py audit_ogrenci_erisim --kurum-id 1 --egitim-yili-id 4
    python manage.py audit_ogrenci_erisim --apply --journal /tmp/erisim-onarim.json
"""
import json
import uuid
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.odeme_takip.application.services.sozlesme_erisim_sync import (
    GRANTING_DURUMLAR,
    sync_sozlesme_erisim,
)
from apps.odeme_takip.domain.models import Sozlesme
from apps.ogrenci.domain.models import OgrenciEkHizmet


class Command(BaseCommand):
    help = 'Sözleşme ile hizmet erişimi arasındaki farkı dry-run raporlar; --apply ile onarır'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Raporlanan erişim farkını yazar. Verilmezse salt okunurdur.',
        )
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--sube-id', type=int, default=None)
        parser.add_argument('--egitim-yili-id', type=int, default=None)
        parser.add_argument(
            '--journal',
            default='',
            help='--apply ile yazılan önceki/sonraki değerlerin kaydı. Apply için zorunlu.',
        )

    def handle(self, *args, **options):
        dry_run = not options['apply']
        journal_path = (options.get('journal') or '').strip()
        if not dry_run and not journal_path:
            raise CommandError('--apply günlük olmadan çalışmaz. --journal dosya/yolu verin.')
        islem_id = uuid.uuid4().hex
        journal = []
        qs = Sozlesme.objects.filter(durum__in=GRANTING_DURUMLAR).order_by('ogrenci_id', 'id')
        if options['kurum_id']:
            qs = qs.filter(kurum_id=options['kurum_id'])
        if options['sube_id']:
            qs = qs.filter(sube_id=options['sube_id'])
        if options['egitim_yili_id']:
            qs = qs.filter(egitim_yili_id=options['egitim_yili_id'])

        opened = realigned = closed_ek = closed_paket = 0
        ambiguous = []
        for sozlesme in qs.iterator():
            before = _erisim_satirlari(sozlesme.ogrenci_id)
            result = sync_sozlesme_erisim(
                sozlesme, dry_run=dry_run, refresh_inclusions=False,
            )
            after = _erisim_satirlari(sozlesme.ogrenci_id)
            for change in _diff_satirlar(before, after):
                change.update({
                    'islem_id': islem_id,
                    'ogrenci_id': sozlesme.ogrenci_id,
                    'sozlesme_id': sozlesme.id,
                    'sozlesme_no': sozlesme.sozlesme_no,
                    'gerekce': 'hak veren sözleşme kalemleri ve sabitlenmiş dahil hizmet görüntüsü',
                })
                journal.append(change)
            if result.get('skipped'):
                continue
            created = result.get('created_ek_hizmet') or []
            created_paket = result.get('created_paket') or []
            moved = result.get('realigned_ek_hizmet') or []
            shut_ek = result.get('closed_ek_hizmet') or []
            shut_paket = result.get('closed_paket') or []
            unclear = result.get('ambiguous_ek_hizmet') or []
            if not any((created, created_paket, moved, shut_ek, shut_paket, unclear)):
                continue
            opened += len(created) + len(created_paket)
            realigned += len(moved)
            closed_ek += len(shut_ek)
            closed_paket += len(shut_paket)
            for name in unclear:
                ambiguous.append((sozlesme.ogrenci_id, sozlesme.egitim_yili_id, name))
            self.stdout.write(
                f"öğrenci={sozlesme.ogrenci_id} sözleşme={sozlesme.sozlesme_no} "
                f"yıl={sozlesme.egitim_yili_id} "
                f"açılacak={', '.join(created + created_paket) or '-'} "
                f"yıl_düzeltme={', '.join(moved) or '-'} "
                f"kapanacak_hizmet={', '.join(shut_ek) or '-'} "
                f"kapanacak_paket={', '.join(shut_paket) or '-'}"
            )

        self.stdout.write('')
        if ambiguous:
            self.stdout.write(self.style.WARNING(
                'Yılı boş veya taşınmayan hizmet satırları (tahminle yıl yazılmadı):'
            ))
            seen = set()
            for ogrenci_id, yil_id, name in ambiguous:
                key = (ogrenci_id, name)
                if key in seen:
                    continue
                seen.add(key)
                self.stdout.write(f"  öğrenci={ogrenci_id} hizmet={name}")

        orphans = self._sozlesmesiz_erisim(options)
        if orphans:
            self.stdout.write(self.style.WARNING(
                'Hak veren sözleşmesi olmayan aktif hizmetler '
                '(otomatik kapatılmadı — doğrudan satış veya kayıt sihirbazı olabilir):'
            ))
            for line in orphans:
                self.stdout.write(f'  {line}')

        eylem = 'uygulanacak' if dry_run else 'uygulandı'
        self.stdout.write(self.style.SUCCESS(
            f"{opened} erişim açma, {realigned} yıl düzeltme, "
            f"{closed_ek} hizmet ve {closed_paket} paket kapatma {eylem}."
        ))
        if journal_path and not dry_run:
            Path(journal_path).write_text(
                json.dumps({'islem_id': islem_id, 'degisiklikler': journal}, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )
            self.stdout.write(f'Günlük: {journal_path} işlem={islem_id} kayıt={len(journal)}')
            self.stdout.write(
                'Geri almak için: python manage.py restore_ogrenci_erisim '
                f'--journal {journal_path}'
            )
        if dry_run:
            self.stdout.write(
                'Salt okunur. Yazmak için aynı süzgeçlerle --apply --journal dosya/yolu kullanın.'
            )

    def _sozlesmesiz_erisim(self, options):
        granted_students = Sozlesme.objects.filter(durum__in=GRANTING_DURUMLAR)
        if options['kurum_id']:
            granted_students = granted_students.filter(kurum_id=options['kurum_id'])
        if options['sube_id']:
            granted_students = granted_students.filter(sube_id=options['sube_id'])
        rows = OgrenciEkHizmet.objects.filter(aktif_mi=True).exclude(
            ogrenci_id__in=granted_students.values('ogrenci_id'),
        ).select_related('ek_hizmet', 'ogrenci')
        if options['kurum_id']:
            rows = rows.filter(ogrenci__kurum_id=options['kurum_id'])
        if options['sube_id']:
            rows = rows.filter(ogrenci__sube_id=options['sube_id'])
        if options['egitim_yili_id']:
            rows = rows.filter(egitim_yili_id=options['egitim_yili_id'])
        lines = []
        for row in rows.order_by('ogrenci_id', 'id')[:200]:
            kaynak = row.kaynak_paket_turu or 'belirsiz'
            if kaynak == 'bireysel':
                karar = 'doğrudan satış, kapatılmadı'
            else:
                karar = 'kaynağı belirsiz, kapatılmadı'
            lines.append(
                f"öğrenci={row.ogrenci_id} hizmet={row.ek_hizmet.ad if row.ek_hizmet_id else row.ek_hizmet_id} "
                f"yıl={row.egitim_yili_id or '-'} kaynak={kaynak} ({karar})"
            )
        return lines


def _satir(row, model):
    if model == 'ek_hizmet':
        return {
            'model': model,
            'id': row.id,
            'aktif_mi': row.aktif_mi,
            'egitim_yili_id': row.egitim_yili_id,
            'ek_hizmet_id': row.ek_hizmet_id,
            'kaynak_paket_turu': row.kaynak_paket_turu,
        }
    return {
        'model': model,
        'id': row.id,
        'aktif_mi': row.aktif_mi,
        'paket_turu': row.paket_turu,
        'paket_id': row.paket_id,
    }


def _erisim_satirlari(ogrenci_id):
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi, OgrenciEkHizmet

    rows = {}
    for row in OgrenciEkHizmet.objects.filter(ogrenci_id=ogrenci_id):
        rows[('ek_hizmet', row.id)] = _satir(row, 'ek_hizmet')
    for row in OgrenciEgitimPaketi.objects.filter(ogrenci_id=ogrenci_id):
        rows[('paket', row.id)] = _satir(row, 'paket')
    return rows


def _diff_satirlar(before, after):
    changes = []
    keys = set(before) | set(after)
    for key in sorted(keys, key=lambda item: (item[0], item[1] or 0)):
        old = before.get(key)
        new = after.get(key)
        if old == new:
            continue
        changes.append({'once': old, 'sonra': new})
    return changes
