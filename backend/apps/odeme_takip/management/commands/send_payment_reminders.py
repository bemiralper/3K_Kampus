"""
Vadesi geçmiş veya yaklaşan taksitler için WhatsApp ödeme hatırlatması.

Kullanım:
    python manage.py send_payment_reminders
    python manage.py send_payment_reminders --dry-run
    python manage.py send_payment_reminders --days-ahead=3 --kurum-id=1
    python manage.py send_payment_reminders --with-pdf
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Taksit


class Command(BaseCommand):
    help = 'Vadesi geçmiş / yaklaşan taksitler için WhatsApp ödeme hatırlatması kuyruğa alır'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Gönderim yapmadan eşleşen taksitleri listele',
        )
        parser.add_argument(
            '--days-ahead',
            type=int,
            default=3,
            help='Kaç gün öncesinden hatırlat (varsayılan: 3)',
        )
        parser.add_argument(
            '--kurum-id',
            type=int,
            default=None,
            help='Sadece belirtilen kurum',
        )
        parser.add_argument(
            '--with-pdf',
            action='store_true',
            help='Metin yerine basit PDF eki gönder',
        )

    def handle(self, *args, **options):
        today = timezone.localdate()
        days_ahead = max(0, options['days_ahead'])
        end_date = today + timedelta(days=days_ahead)

        qs = Taksit.objects.select_related(
            'sozlesme__ogrenci', 'sozlesme__veli', 'sozlesme__kurum',
        ).filter(
            sozlesme__durum=SozlesmeDurum.AKTIF,
            durum__in=[
                TaksitDurum.BEKLEMEDE,
                TaksitDurum.KISMI_ODENDI,
                TaksitDurum.GECIKTI,
            ],
            kalan_tutar__gt=0,
        ).filter(
            Q(vade_tarihi__lt=today) | Q(vade_tarihi__gte=today, vade_tarihi__lte=end_date),
        )

        if options['kurum_id']:
            qs = qs.filter(sozlesme__kurum_id=options['kurum_id'])

        taksitler = qs.order_by('vade_tarihi', 'taksit_no')
        total = taksitler.count()
        self.stdout.write(
            f'💳 Ödeme hatırlatması — {today:%d.%m.%Y} '
            f'(gecikmiş + {days_ahead} gün içi): {total} taksit'
        )

        if options['dry_run']:
            for t in taksitler[:50]:
                sz = t.sozlesme
                ogrenci = sz.ogrenci
                self.stdout.write(
                    f'  • Taksit #{t.id} — {ogrenci.ad} {ogrenci.soyad} '
                    f'vade={t.vade_tarihi} kalan={t.kalan_tutar} TL'
                )
            if total > 50:
                self.stdout.write(f'  ... ve {total - 50} taksit daha')
            return

        from apps.communication.application.integration_hooks import notify_payment_reminder

        queued = 0
        skipped = 0
        for taksit in taksitler:
            result = notify_payment_reminder(
                taksit.sozlesme.kurum_id,
                taksit.id,
                with_pdf=options['with_pdf'],
            )
            if result and result.success:
                queued += 1
            else:
                skipped += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'✅ Kuyruğa alınan: {queued}, atlanan: {skipped}'
            )
        )
