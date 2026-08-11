from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.communication.domain.enums import Channel
from apps.communication.domain.models import CommunicationChannelConfig
from apps.kurum.domain.models import Kurum
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles

User = get_user_model()


class EnsureMetaReviewerTests(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='Meta Kurum', kod='META')
        self.acc = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='WA',
            phone_number_id='pn_meta',
            is_active=True,
            is_default=True,
        )
        # allowed_roles boş bırakılırsa command dokunmaz; doluysa ekler
        role_koc = Role.objects.get(code='koc')
        self.acc.allowed_roles.add(role_koc)

    def test_creates_user_and_adds_whatsapp_role(self):
        out = StringIO()
        call_command(
            'ensure_meta_reviewer',
            username='meta.reviewer',
            password='TestPass1234',
            kurum_kod='META',
            stdout=out,
        )
        user = User.objects.get(username='meta.reviewer')
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password('TestPass1234'))
        ur = UserRole.objects.get(user=user)
        self.assertEqual(ur.role.code, 'meta_wa_reviewer')
        self.assertFalse(ur.must_change_password)
        self.assertTrue(
            self.acc.allowed_roles.filter(code='meta_wa_reviewer').exists()
        )
