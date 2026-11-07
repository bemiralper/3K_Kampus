import json
import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, connection

from apps.finans.application.precision_repair import (
    build_precision_repair_plan, apply_precision_repair, rollback_precision_repair,
)


class Command(BaseCommand):
    help = 'Belgeli geçmiş tam TL/kuruş farkını önizle veya denetim iziyle onar.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--expected-digest')
        parser.add_argument('--rollback-id')
        parser.add_argument('--plan-file')

    def handle(self, *args, **options):
        try:
            if options['rollback_id']:
                if options['apply'] or options['expected_digest']:
                    raise CommandError('Geri alma ve uygulama birlikte kullanılamaz.')
                report = rollback_precision_repair(options['rollback_id'])
            elif options['apply']:
                if not options['expected_digest']:
                    raise CommandError('--apply için önizlemedeki --expected-digest zorunlu.')
                report = apply_precision_repair(options['expected_digest'])
            else:
                with transaction.atomic():
                    if connection.vendor == 'postgresql':
                        with connection.cursor() as cursor:
                            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                    report = build_precision_repair_plan()
                if options['plan_file']:
                    fd = os.open(options['plan_file'], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, 'w') as handle:
                        json.dump(report, handle, ensure_ascii=False, indent=2)
                report = {'digest': report['digest'], 'payment_count': len(report['payments']),
                          'account_count': len(report['accounts']), 'ledger_count': len(report['ledger_changes']),
                          'period_count': len(report['period_changes']), 'blocked': report['blocked'],
                          'accounts': report['accounts']}
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(report, ensure_ascii=False, indent=2))
