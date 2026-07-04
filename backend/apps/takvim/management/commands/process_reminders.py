"""
Takvim modülü — Hatırlatma İşleme Komutu

Zamanı gelmiş pending reminder'ları işleyip bildirim gönderir.

Kullanım:
    python manage.py process_reminders

Cron ile çalıştırma (her dakika):
    * * * * * cd /path/to/project && python manage.py process_reminders

Opsiyonel parametreler:
    --dry-run : Gerçek gönderim yapmadan test eder
    --cleanup : 90 günden eski bildirimleri temizler
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.takvim.application.notification_service import ReminderProcessor
from apps.takvim.infrastructure.repository import AppNotificationRepository


class Command(BaseCommand):
    help = 'Zamanı gelmiş hatırlatmaları işle ve bildirim gönder'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Gönderim yapmadan sadece pending sayısını göster',
        )
        parser.add_argument(
            '--cleanup',
            action='store_true',
            help='Eski bildirimleri temizle (90 gün)',
        )
        parser.add_argument(
            '--cleanup-days',
            type=int,
            default=90,
            help='Temizlenecek gün sayısı (varsayılan: 90)',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        self.stdout.write(f"⏰ Hatırlatma işleme başladı — {now.strftime('%d.%m.%Y %H:%M:%S')}")

        if options['cleanup']:
            days = options['cleanup_days']
            self.stdout.write(f"🧹 {days} günden eski bildirimler temizleniyor...")
            AppNotificationRepository.delete_old(days)
            self.stdout.write(self.style.SUCCESS(f"✅ Temizlik tamamlandı"))
            return

        if options['dry_run']:
            from apps.takvim.infrastructure.repository import ReminderRepository
            count = ReminderRepository.get_pending(before=now).count()
            self.stdout.write(f"📊 İşlenecek pending hatırlatma: {count}")
            return

        processor = ReminderProcessor()
        stats = processor.process_pending()

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ İşlem tamamlandı — "
                f"İşlenen: {stats['processed']}, "
                f"Gönderilen: {stats['sent']}, "
                f"Başarısız: {stats['failed']}, "
                f"Atlanan: {stats['skipped']}"
            )
        )
