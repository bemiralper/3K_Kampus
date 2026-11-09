"""Üretimde dosya çıktısı sunucuda tutulur; stdout yalnız anonim sayaç içerir."""
import json
import os
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from apps.academic.services.historical_repair_plan import build_historical_repair_plan


class Command(BaseCommand):
    help='Tarihsel tarifeyi koruyan, veritabanına yazmayan akademik onarım planı üretir.'

    def add_arguments(self,parser):
        parser.add_argument('--output',help='Yeni ve özel JSON dosyası; üretimde sunucuda tutun.')

    def handle(self,*args,**options):
        plan=build_historical_repair_plan()
        if options['output']:
            try:
                fd=os.open(options['output'],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                with os.fdopen(fd,'w') as output:
                    json.dump(plan,output,ensure_ascii=False,indent=2)
            except OSError as exc:
                raise CommandError('Plan dosyası oluşturulamadı; mevcut dosya üzerine yazılmaz.') from exc
        self.stdout.write(json.dumps({'sha256':plan['sha256'],'database_writes':False,
            'automatic_actions':0,'review_counts':dict(Counter(r['kind'] for r in plan['manual_review']))},sort_keys=True))
