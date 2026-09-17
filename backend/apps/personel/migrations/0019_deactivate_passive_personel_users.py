from django.db import migrations


def deactivate_passive_personel_users(apps, schema_editor):
    Personel = apps.get_model('personel', 'Personel')
    User = apps.get_model('auth', 'User')
    user_ids = list(
        Personel.objects.filter(aktif_mi=False, user_id__isnull=False).values_list('user_id', flat=True)
    )
    if user_ids:
        User.objects.filter(pk__in=user_ids, is_active=True).update(is_active=False)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('personel', '0018_ozel_ders_module'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(deactivate_passive_personel_users, noop),
    ]
