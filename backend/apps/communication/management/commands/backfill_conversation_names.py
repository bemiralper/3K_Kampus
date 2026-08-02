"""
Sohbetlerde görünen kişi adını kalıcı hale getirir.

Ad çözümlemesi (kayıtlı veli/öğrenci/personel eşlemesi) normalde her istekte
yeniden yapılır. Bu komut çözülen adı `contact_name` alanına yazar; böylece
sohbet listesi ve sohbet açılışı ek sorgu yapmadan adı doğrudan okur.
"""
from django.core.management.base import BaseCommand

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.conversation_display import (
    looks_like_phone,
    resolve_conversation_display_name,
)
from apps.communication.domain.models import Conversation

BATCH_SIZE = 500


class Command(BaseCommand):
    help = 'Sohbetlerin contact_name alanını kayıtlı kişi adlarıyla doldurur.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, help='Yalnızca bu kurum')
        parser.add_argument('--dry-run', action='store_true', help='Yazmadan raporla')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        kurum_id = options.get('kurum_id')

        qs = Conversation.objects.select_related(
            'ogrenci', 'veli', 'contact_identity', 'contact_identity__veli',
            'contact_identity__ogrenci', 'contact_identity__personel',
        ).order_by('id')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
            ContactResolver.invalidate_kurum_lookup_maps(kurum_id)

        lookup_cache: dict = {}
        pending: list[Conversation] = []
        updated = 0
        cleared = 0
        scanned = 0

        for conversation in qs.iterator(chunk_size=BATCH_SIZE):
            scanned += 1
            name = resolve_conversation_display_name(
                conversation,
                allow_live_lookup=True,
                lookup_cache=lookup_cache,
            )
            resolved = name and not looks_like_phone(name, conversation.contact_phone)
            new_value = name[:255] if resolved else ''
            if conversation.contact_name == new_value:
                continue
            if not resolved and not looks_like_phone(
                conversation.contact_name, conversation.contact_phone,
            ):
                # Elle girilmiş geçerli bir ad varsa dokunma
                continue
            conversation.contact_name = new_value
            pending.append(conversation)
            if resolved:
                updated += 1
            else:
                cleared += 1
            if not dry_run and len(pending) >= BATCH_SIZE:
                Conversation.objects.bulk_update(pending, ['contact_name'])
                pending = []

        if pending and not dry_run:
            Conversation.objects.bulk_update(pending, ['contact_name'])

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}{scanned} sohbet tarandı — {updated} isim yazıldı, '
            f'{cleared} telefon yazılı alan temizlendi.'
        ))
