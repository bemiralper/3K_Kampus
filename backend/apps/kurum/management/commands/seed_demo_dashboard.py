"""
Dashboard demo verisi — öğrenci, personel, sınıf, sözleşme ve finans kayıtları.

Kullanım:
  python manage.py seed_demo_dashboard
  python manage.py seed_demo_dashboard --purge   # önceki DEMO kayıtlarını sil
  python manage.py seed_demo_dashboard --kurum-id=1 --sube-id=2
  python manage.py seed_demo_dashboard --preset=dashboard
"""
from django.core.management.base import BaseCommand

from apps.kurum.services.demo_data_service import DEMO_PRESETS, DemoDataService


class Command(BaseCommand):
    help = 'Dashboard görünümü için demo öğrenci, personel, sınıf ve finans verisi oluşturur.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--sube-id', type=int, default=None)
        parser.add_argument('--preset', type=str, default='full', choices=list(DEMO_PRESETS.keys()))
        parser.add_argument('--purge', action='store_true', help='Önceki DEMO kayıtlarını sil')
        parser.add_argument('--students', type=int, default=None)
        parser.add_argument('--mezun', type=int, default=None)
        parser.add_argument('--teachers', type=int, default=None)
        parser.add_argument('--classes', type=int, default=None)

    def handle(self, *args, **options):
        service = DemoDataService()
        try:
            kurum, sube, _ey, _subeler = service.resolve_context(
                kurum_id=options['kurum_id'],
                sube_id=options['sube_id'],
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc

        overrides = {}
        for key in ('students', 'mezun', 'teachers', 'classes'):
            if options[key] is not None:
                overrides[key] = options[key]

        result = service.seed(
            kurum,
            sube,
            preset=options['preset'],
            purge_first=options['purge'],
            **overrides,
        )

        if result.get('skipped'):
            if result.get('reason') == 'demo_students_exist':
                self.stdout.write(self.style.WARNING(
                    'DEMO öğrenciler zaten var. Yeniden oluşturmak için --purge kullanın.'
                ))
            elif result.get('reason') == 'no_demo_students':
                self.stdout.write(self.style.WARNING(
                    'Finans preset için DEMO öğrenci bulunamadı. Önce students/full preset çalıştırın.'
                ))
            return

        self.stdout.write(self.style.SUCCESS(
            f'Demo veri oluşturuldu — kurum={kurum.ad}, şube={sube.ad}, '
            f'öğrenci={result["students_active"]}, mezun={result["students_mezun"]}, '
            f'öğretmen={result["teachers"]}, sınıf={result["classes"]}, '
            f'sözleşme={result["contracts"]}, preset={result["preset"]}'
        ))
