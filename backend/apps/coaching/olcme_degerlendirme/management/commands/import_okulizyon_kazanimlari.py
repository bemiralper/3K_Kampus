"""
Okulizyon-Kazanimlar Excel'ini müfredat kataloğuna yükler.

Kullanım:
  python manage.py import_okulizyon_kazanimlari
  python manage.py import_okulizyon_kazanimlari --file /yol/dosya.xlsx
  python manage.py import_okulizyon_kazanimlari --dry-run
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.coaching.olcme_degerlendirme.services.okulizyon_import import (
    XLSX_NAME,
    default_xlsx_path,
    parse_excel_rows,
    persist_catalog,
)


class Command(BaseCommand):
    help = 'Okulizyon kazanım Excel’ini tüm derslere yükler ve sınav bölümlerini bağlar.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file', dest='file_path', default='',
            help=f'Excel yolu (varsayılan: paketli {XLSX_NAME} veya repo kökü)',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Dosyayı oku ve say, veritabanına yazma',
        )
        parser.add_argument(
            '--keep', action='store_true',
            help='Mevcut konu ağacını silme (varsayılan: üzerine yaz)',
        )

    def handle(self, *args, **options):
        file_path = options['file_path']
        path = Path(file_path) if file_path else default_xlsx_path()
        if path is None or not path.is_file():
            raise CommandError(
                f'{XLSX_NAME} bulunamadı. --file ile yol verin veya dosyayı '
                'repo köküne / olcme_degerlendirme/data/ altına koyun.'
            )

        self.stdout.write(self.style.NOTICE(f'Okunuyor: {path}'))
        rows = parse_excel_rows(path)
        self.stdout.write(f'  {len(rows)} satır')

        if options['dry_run']:
            from collections import Counter
            dersler = Counter(r['ders'] for r in rows)
            for ders, count in dersler.most_common():
                self.stdout.write(f'  {ders}: {count}')
            self.stdout.write(self.style.WARNING('dry-run — kayıt yapılmadı.'))
            return

        stats = persist_catalog(rows, replace=not options['keep'])
        self.stdout.write(self.style.SUCCESS(
            f'Yüklendi: {stats["subjects"]} ders, {stats["topics"]} konu, '
            f'{stats["outcomes"]} kazanım, {stats["sub_outcomes"]} alt kazanım'
        ))
        for code, info in stats['per_subject'].items():
            self.stdout.write(
                f'  {code}: {info["rows"]} satır → '
                f'{info["topics"]} konu / {info["outcomes"]} kazanım / '
                f'{info["sub_outcomes"]} alt'
            )
        if stats['relinked_sections']:
            self.stdout.write(self.style.SUCCESS(
                f'{stats["relinked_sections"]} sınav bölümü yeni derslere bağlandı.'
            ))
        if stats['unknown_ders']:
            self.stdout.write(self.style.WARNING(
                f'Tanınmayan dersler atlandı: {", ".join(stats["unknown_ders"])}'
            ))
