from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0028_message_pinned_at_message_pinned_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='conversationuserstate',
            name='notif_cleared_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Bu kullanıcı bildirimi kapattı / sohbeti açtı. Yeni mesaj gelince yeniden görünür.',
                null=True,
                verbose_name='Bildirim Temizleme',
            ),
        ),
    ]
