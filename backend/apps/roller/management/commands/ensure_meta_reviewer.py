"""
Meta App Review hesabı: meta_wa_reviewer rolü + kullanıcı + WhatsApp hesap erişimi.

Örnek:
  DJANGO_ENV=production python manage.py ensure_meta_reviewer \\
    --username meta.reviewer --password '...' --kurum-kod 3K
"""
from __future__ import annotations

import secrets
import string

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.communication.domain.enums import Channel
from apps.communication.domain.models import CommunicationChannelConfig
from apps.kurum.domain.models import Kurum
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()

DEFAULT_USERNAME = 'meta.reviewer'
ROLE_CODE = 'meta_wa_reviewer'


def _generate_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    # Karışıklığı azalt: benzer karakterleri çıkar
    alphabet = alphabet.replace('O', '').replace('0', '').replace('l', '').replace('I', '')
    return ''.join(secrets.choice(alphabet) for _ in range(length))


class Command(BaseCommand):
    help = 'Meta WhatsApp inceleme rolü ve kullanıcısını oluşturur / günceller'

    def add_arguments(self, parser):
        parser.add_argument('--username', default=DEFAULT_USERNAME)
        parser.add_argument(
            '--password',
            default='',
            help='Boş bırakılırsa güvenli rastgele şifre üretilir',
        )
        parser.add_argument(
            '--kurum-kod',
            default='',
            help='Kurum kodu (boşsa ilk aktif kurum)',
        )
        parser.add_argument(
            '--kurum-id',
            type=int,
            default=0,
            help='Kurum ID (kurum-kod yerine)',
        )
        parser.add_argument(
            '--email',
            default='meta.reviewer@3kkampus.com',
        )
        parser.add_argument(
            '--skip-whatsapp-roles',
            action='store_true',
            help='Aktif WhatsApp hesaplarının izinli rollerine ekleme',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        ensure_default_roles(verbose=False)

        try:
            role = Role.all_objects.get(code=ROLE_CODE, silindi_mi=False)
        except Role.DoesNotExist as exc:
            raise CommandError(
                f'{ROLE_CODE} rolü bulunamadı. Önce setup_roles çalıştırın.'
            ) from exc

        kurum = self._resolve_kurum(options)
        username = (options['username'] or DEFAULT_USERNAME).strip()
        password = (options['password'] or '').strip() or _generate_password()
        email = (options['email'] or '').strip()

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'first_name': 'Meta',
                'last_name': 'Reviewer',
                'is_staff': True,
                'is_active': True,
                'is_superuser': False,
            },
        )
        user.email = email or user.email
        user.first_name = user.first_name or 'Meta'
        user.last_name = user.last_name or 'Reviewer'
        user.is_staff = True
        user.is_active = True
        user.is_superuser = False
        user.set_password(password)
        user.save()

        UserRole.objects.update_or_create(
            user=user,
            defaults={
                'role': role,
                'kurum': kurum,
                'must_change_password': False,
            },
        )

        wa_updated = 0
        if not options['skip_whatsapp_roles']:
            accounts = CommunicationChannelConfig.objects.filter(
                kurum=kurum,
                channel=Channel.WHATSAPP,
                is_active=True,
            )
            for acc in accounts:
                # İzinli roller boşsa herkese açık — dokunma.
                # Doluysa bu rolü ekle ki gönderim hesabı çözülebilsin.
                if acc.allowed_roles.exists():
                    acc.allowed_roles.add(role)
                    wa_updated += 1

        sube = (
            Sube.objects.filter(kurum=kurum, aktif_mi=True)
            .order_by('id')
            .first()
        )

        self.stdout.write(self.style.SUCCESS('Meta WhatsApp inceleme hesabı hazır.'))
        self.stdout.write(f'  kullanıcı : {username}')
        self.stdout.write(f'  şifre     : {password}')
        self.stdout.write(f'  kurum     : {kurum.kod} (id={kurum.id})')
        if sube:
            self.stdout.write(f'  şube      : {sube.ad} (id={sube.id}) — girişte bunu seçin')
        self.stdout.write(f'  rol       : {role.code}')
        self.stdout.write(f'  user      : {"oluşturuldu" if created else "güncellendi"}')
        self.stdout.write(f'  whatsapp  : {wa_updated} hesaba rol eklendi')
        self.stdout.write(
            '  not       : İnceleme bitince kullanıcıyı pasifleştirin (is_active=False).'
        )

    def _resolve_kurum(self, options) -> Kurum:
        kurum_id = options.get('kurum_id') or 0
        kod = (options.get('kurum_kod') or '').strip()
        if kurum_id:
            kurum = Kurum.objects.filter(id=kurum_id, aktif_mi=True).first()
            if not kurum:
                raise CommandError(f'Kurum id={kurum_id} bulunamadı.')
            return kurum
        if kod:
            kurum = Kurum.objects.filter(kod__iexact=kod, aktif_mi=True).first()
            if not kurum:
                raise CommandError(f'Kurum kodu bulunamadı: {kod}')
            return kurum
        kurum = Kurum.objects.filter(aktif_mi=True).order_by('id').first()
        if not kurum:
            raise CommandError('Aktif kurum yok.')
        return kurum
