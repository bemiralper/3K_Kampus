"""CLI üzerinden yedek geri yükleme — HTTP session riski olmadan."""

from django.core.management.base import BaseCommand, CommandError

from apps.yedekleme.domain.models import BackupArtifact
from apps.yedekleme.engine import BackupEngine
from apps.yedekleme.registry import sync_registered_resources


class Command(BaseCommand):
    help = (
        'Belirtilen yedek artifact\'ini geri yükler. '
        'Tam DB restore sonrası uygulamayı yeniden başlatın ve tekrar giriş yapın.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--artifact-id', type=int, required=True)
        parser.add_argument(
            '--confirm',
            type=str,
            required=True,
            help='Güvenlik için tam olarak RESTORE yazın',
        )

    def handle(self, *args, **options):
        if options['confirm'] != 'RESTORE':
            raise CommandError('--confirm=RESTORE gerekli')
        sync_registered_resources()
        try:
            artifact = BackupArtifact.objects.get(pk=options['artifact_id'])
        except BackupArtifact.DoesNotExist as exc:
            raise CommandError(f'Artifact bulunamadı: {options["artifact_id"]}') from exc

        self.stdout.write(f'Geri yükleniyor: {artifact.filename} (id={artifact.id}) …')
        result = BackupEngine().restore(artifact, confirm='RESTORE')
        self.stdout.write(self.style.SUCCESS(json_dumps(result)))
        if result.get('full_database_restored'):
            self.stdout.write(
                self.style.WARNING(
                    'Tam veritabanı restore edildi. Uygulama sürecini yeniden başlatın '
                    've oturum açın (session tablosu yenilendi).'
                )
            )


def json_dumps(obj) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False, indent=2, default=str)
