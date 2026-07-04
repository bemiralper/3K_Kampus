"""
Uygulama verisini sıfırlar; kurum kayıtları ve migration geçmişi korunur.
Veritabanının kendisi silinmez, yalnızca tablo içerikleri temizlenir.

  python manage.py reset_app_data
  python manage.py reset_app_data --preserve-finans-tanimlari
  python manage.py reset_app_data --preserve-finans-tanimlari --create-admin --noinput
"""
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.management import create_permissions
from django.contrib.contenttypes.management import create_contenttypes
from django.core.management.base import BaseCommand
from django.db import connection

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

BASE_PRESERVED_TABLES = frozenset({'kurum', 'django_migrations'})

# Finans tanım tabloları + kurum/şube iskeleti (--preserve-finans-tanimlari)
FINANS_TANIM_PRESERVED_TABLES = frozenset({
    'sube',
    'egitim_yili',
    'finans_mali_hesap',
    'finans_odeme_yontemi',
    'finans_gelir_kategorisi',
    'finans_gider_kategorisi',
    'finans_cari_hesap',
    'finans_cari_hesap_gelir_kategorileri',
    'finans_cari_hesap_gider_kategorileri',
})


class Command(BaseCommand):
    help = (
        'Kurum kayıtları hariç tüm uygulama verisini siler. '
        'Veritabanı ve tablo yapısı korunur. '
        '--preserve-finans-tanimlari ile şube ve finans tanım tabloları da korunur.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--preserve-finans-tanimlari',
            action='store_true',
            help='Şube, eğitim yılı ve finans tanım tablolarını koru (mali hesap, ödeme yöntemi, kategoriler, cari tanımları)',
        )
        parser.add_argument(
            '--noinput',
            action='store_true',
            help='Onay sormadan çalıştır',
        )
        parser.add_argument(
            '--create-admin',
            action='store_true',
            help='admin / admin123 superuser oluştur (yoksa)',
        )

    def handle(self, *args, **options):
        preserve_finans = options['preserve_finans_tanimlari']
        preserved = self._preserved_tables(preserve_finans)

        kurum_count = Kurum.objects.count()
        sube_count = Sube.objects.count() if preserve_finans else 0

        self.stdout.write(f'Korunacak kurum kaydı: {kurum_count}')
        if preserve_finans:
            self.stdout.write(f'Korunacak şube kaydı: {sube_count}')
            self.stdout.write(
                self.style.WARNING(
                    'Finans tanım modu: mali hesap, ödeme yöntemi, gelir/gider kategorileri '
                    've cari hesap tanımları korunacak; işlem kayıtları silinecek.'
                )
            )

        if not options['noinput']:
            msg = (
                f'{kurum_count} kurum korunacak'
                + (f', {sube_count} şube + finans tanımları korunacak' if preserve_finans else '')
                + ', diğer tüm veri silinecek (kullanıcılar dahil). Devam? [y/N] '
            )
            confirm = input(msg)
            if confirm.lower() not in ('y', 'yes', 'e', 'evet'):
                self.stdout.write(self.style.WARNING('İşlem iptal edildi.'))
                return

        truncated = self._truncate_application_data(preserved)
        self._rebuild_system_metadata()
        self._seed_kayit_tanimlari()

        if preserve_finans:
            self._reset_finans_tanim_balances()

        self._ensure_default_roles()

        if options['create_admin']:
            self._ensure_superuser()

        summary = (
            f'Tamamlandı. {truncated} tablo temizlendi, '
            f'{Kurum.objects.count()} kurum kaydı korundu.'
        )
        if preserve_finans:
            summary += f' {Sube.objects.count()} şube + finans tanımları korundu.'
        self.stdout.write(self.style.SUCCESS(summary))

    def _preserved_tables(self, preserve_finans: bool) -> frozenset[str]:
        if preserve_finans:
            return BASE_PRESERVED_TABLES | FINANS_TANIM_PRESERVED_TABLES
        return BASE_PRESERVED_TABLES

    def _truncate_application_data(self, preserved: frozenset[str]) -> int:
        tables = self._tables_to_truncate(preserved)
        if not tables:
            self.stdout.write('Temizlenecek tablo bulunamadı.')
            return 0

        quoted = ', '.join(connection.ops.quote_name(name) for name in tables)
        sql = f'TRUNCATE {quoted} RESTART IDENTITY CASCADE;'

        with connection.cursor() as cursor:
            cursor.execute(sql)

        return len(tables)

    def _tables_to_truncate(self, preserved: frozenset[str]) -> list[str]:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename <> ALL(%s)
                ORDER BY tablename
                """,
                [list(preserved)],
            )
            return [row[0] for row in cursor.fetchall()]

    def _rebuild_system_metadata(self) -> None:
        self.stdout.write('Sistem metadata yeniden oluşturuluyor...')
        for app_config in apps.get_app_configs():
            create_contenttypes(app_config, verbosity=0, interactive=False)
            create_permissions(app_config, verbosity=0, interactive=False)

    def _seed_kayit_tanimlari(self) -> None:
        from apps.kurum.services.kayit_tanimlari_service import seed_all_default_kayit_tanimlari
        from apps.ogrenci_kayit.services.location_service import ensure_locations

        created = seed_all_default_kayit_tanimlari()
        loc_created = ensure_locations()
        total = created + loc_created
        if total:
            self.stdout.write(f'Varsayılan kayıt tanımları ve iller oluşturuldu: {total} adet')

    def _reset_finans_tanim_balances(self) -> None:
        """Korunan cari hesaplardaki işlem kaynaklı bakiyeleri sıfırla."""
        from apps.finans.domain.cari_hesap import CariHesap

        updated = CariHesap.tum_kayitlar.update(
            toplam_borc=Decimal('0'),
            toplam_alacak=Decimal('0'),
        )
        if updated:
            self.stdout.write(f'Cari hesap bakiyeleri sıfırlandı: {updated} kayıt')

    def _ensure_default_roles(self) -> None:
        from apps.roller.seed import ensure_default_roles

        ensure_default_roles()
        self.stdout.write('Varsayılan roller ve izinler yenilendi.')

    def _ensure_superuser(self) -> None:
        user_model = get_user_model()
        if user_model.objects.filter(username='admin').exists():
            self.stdout.write('Superuser "admin" zaten mevcut.')
            return

        user_model.objects.create_superuser(
            'admin',
            'admin@3kkampus.local',
            'admin123',
        )
        self.stdout.write(self.style.SUCCESS('Superuser oluşturuldu: admin / admin123'))
