"""90 günden eski sohbet ekleri diskten kalkar; metin ve yeni dosyalar kalır."""

import os
import tempfile
from datetime import timedelta
from pathlib import Path

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.communication.application.attachment_retention import purge_expired_chat_files
from apps.communication.domain.enums import MessageDirection, MessageStatus, MessageType
from apps.communication.domain.models import (
    BirthdayMediaAsset,
    CampaignAttachment,
    Conversation,
    Message,
    MessageAttachment,
)
from apps.kurum.domain.models import Kurum


class ChatAttachmentRetentionTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Ret Kurum', kod='RETF')
        self.conversation = Conversation.objects.create(
            kurum=self.kurum,
            contact_phone='905321110099',
        )
        self.message = Message.objects.create(
            conversation=self.conversation,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.DOCUMENT,
            status=MessageStatus.SENT,
            body='ödev',
        )

    def _attach(self, name: str, payload: bytes = b'%PDF') -> MessageAttachment:
        attachment = MessageAttachment(
            message=self.message,
            original_name=name,
            mime_type='application/pdf',
            file_size=len(payload),
        )
        attachment.file.save(name, ContentFile(payload), save=True)
        return attachment

    def test_old_file_removed_recent_and_birthday_kept(self):
        with tempfile.TemporaryDirectory() as td:
            media = Path(td)
            with override_settings(MEDIA_ROOT=media):
                old = self._attach('odev.pdf', b'old-pdf')
                recent = self._attach('yeni.pdf', b'new-pdf')
                birthday = BirthdayMediaAsset(kurum=self.kurum, original_name='kut.jpg', mime_type='image/jpeg')
                birthday.file.save('kut.jpg', ContentFile(b'jpg'), save=True)
                old_path = media / old.file.name
                recent_path = media / recent.file.name
                birthday_path = media / birthday.file.name
                long_ago = timezone.now() - timedelta(days=120)
                MessageAttachment.objects.filter(pk=old.pk).update(created_at=long_ago)
                BirthdayMediaAsset.objects.filter(pk=birthday.pk).update(created_at=long_ago)

                orphan = media / 'communication' / 'attachments' / '2020' / '01' / 'orphan.pdf'
                orphan.parent.mkdir(parents=True)
                orphan.write_bytes(b'orphan')
                old_ts = (timezone.now() - timedelta(days=200)).timestamp()
                os.utime(orphan, (old_ts, old_ts))

                result = purge_expired_chat_files(days=90)

                old.refresh_from_db()
                recent.refresh_from_db()
                birthday.refresh_from_db()
                self.assertEqual(old.file.name, '')
                self.assertEqual(old.original_name, 'odev.pdf')
                self.assertFalse(old_path.exists())
                self.assertTrue(recent.file.name)
                self.assertTrue(recent_path.exists())
                self.assertTrue(birthday.file.name)
                self.assertTrue(birthday_path.exists())
                self.assertFalse(orphan.exists())
                self.assertGreaterEqual(result['files_deleted'], 1)
                self.assertGreaterEqual(result['orphans_deleted'], 1)

    def test_shared_file_survives_while_a_newer_message_uses_it(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(MEDIA_ROOT=Path(td)):
                old = self._attach('ortak.pdf', b'shared')
                newer = MessageAttachment.objects.create(
                    message=self.message,
                    file=old.file.name,
                    original_name='ortak.pdf',
                    mime_type='application/pdf',
                    file_size=6,
                )
                MessageAttachment.objects.filter(pk=old.pk).update(
                    created_at=timezone.now() - timedelta(days=120),
                )
                path = Path(td) / old.file.name

                purge_expired_chat_files(days=90)

                old.refresh_from_db()
                newer.refresh_from_db()
                self.assertEqual(old.file.name, newer.file.name)
                self.assertTrue(path.exists())

    def test_old_campaign_file_removed(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(MEDIA_ROOT=Path(td)):
                campaign = CampaignAttachment(
                    kurum=self.kurum,
                    original_name='kamp.pdf',
                    mime_type='application/pdf',
                )
                campaign.file.save('kamp.pdf', ContentFile(b'camp'), save=True)
                stored = Path(td) / campaign.file.name
                CampaignAttachment.objects.filter(pk=campaign.pk).update(
                    created_at=timezone.now() - timedelta(days=120),
                )

                purge_expired_chat_files(days=90)

                campaign.refresh_from_db()
                self.assertEqual(campaign.file.name, '')
                self.assertFalse(stored.exists())
