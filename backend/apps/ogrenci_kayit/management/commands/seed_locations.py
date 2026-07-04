import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.ogrenci_kayit.services.location_service import ensure_locations


class Command(BaseCommand):
    help = "Türkiye illerini ve Erzurum ilçelerini yükler"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default=str(
                Path(__file__).resolve().parent.parent.parent / "data" / "turkiye_iller.json"
            ),
            help="JSON dosyası yolu (varsayılan: turkiye_iller.json)",
        )

    def handle(self, *args, **options):
        file_path = Path(options["file"]).resolve()
        if not file_path.exists():
            raise CommandError(f"Dosya bulunamadı: {file_path}")

        created = ensure_locations()
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        city_count = len(payload.get("cities", []))
        district_count = len(payload.get("erzurum_districts", []))
        self.stdout.write(
            self.style.SUCCESS(
                f"İl/ilçe verileri yüklendi ({city_count} il, {district_count} Erzurum ilçesi, "
                f"{created} yeni kayıt)."
            )
        )
