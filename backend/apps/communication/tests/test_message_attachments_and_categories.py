"""
Mesaj ekleri serializer ve şablon kategorisi testleri.
"""
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.domain.enums import MessageDirection, MessageType
from apps.communication.domain.models import Conversation, Message, MessageAttachment, MessageTemplateCategory
from apps.communication.interfaces.serializers.config import MessageSerializer
from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_role(user, role_code: str, perm_codes: list[str]):
    role, _ = Role.objects.get_or_create(
        code=role_code,
        defaults={'name': role_code, 'level': 10, 'is_system_role': True},
    )
    for code in perm_codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class MessageAttachmentSerializerTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Att Kurum', kod='ATT')
        self.conversation = Conversation.objects.create(
            kurum=self.kurum,
            channel='WHATSAPP',
            contact_phone='+905551112233',
            contact_type='VELI',
        )
        self.message = Message.objects.create(
            conversation=self.conversation,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.IMAGE,
            body='photo.jpg',
            status='SENT',
        )
        self.attachment = MessageAttachment.objects.create(
            message=self.message,
            original_name='photo.jpg',
            mime_type='image/jpeg',
            file_size=128,
        )
        self.attachment.file.save('photo.jpg', ContentFile(b'fake-image'), save=True)

    def test_message_serializer_includes_attachments(self):
        data = MessageSerializer(self.message).data
        self.assertEqual(len(data['attachments']), 1)
        self.assertEqual(data['attachments'][0]['original_name'], 'photo.jpg')
        self.assertTrue(data['attachments'][0]['file_url'])


class TemplateCategoryServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Cat Kurum', kod='CAT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CAT-M')
        self.admin = User.objects.create_user(username='cat_admin', password='x')
        _assign_role(self.admin, 'cat_admin', ['communication.bulk', 'communication.read'])
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.service = TemplateCategoryService()

    def test_ensure_defaults_creates_categories(self):
        self.service.ensure_defaults(self.kurum.id, self.sube.id)
        self.assertGreaterEqual(
            MessageTemplateCategory.objects.filter(
                kurum=self.kurum, sube=self.sube, is_active=True,
            ).count(),
            8,
        )

    def test_create_custom_category(self):
        cat = self.service.create(self.kurum.id, sube_id=self.sube.id, label='Veli Bilgilendirme')
        self.assertTrue(cat.slug)
        self.assertEqual(cat.label, 'Veli Bilgilendirme')

    def test_cannot_delete_last_active_category(self):
        cats = list(self.service.list_categories(self.kurum.id, sube_id=self.sube.id))
        for cat in cats[1:]:
            cat.is_active = False
            cat.save(update_fields=['is_active'])
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            self.service.delete(cats[0])

    def test_category_api_list_and_create(self):
        res = self.client.get(
            f'/api/communication/template-categories/?kurum_id={self.kurum.id}',
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data['total'], 8)

        res = self.client.post(
            '/api/communication/template-categories/',
            {'kurum_id': self.kurum.id, 'label': 'Özel Duyuru'},
            format='json',
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['label'], 'Özel Duyuru')
